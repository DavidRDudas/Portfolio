/**
 * WebGL2 renderer for hydrogen orbitals.
 *
 * Points are sampled once from |psi|^2 and never move. What animates is their
 * weight: each vertex carries the complex amplitude psi_k of every component
 * state, and the shader recombines them per frame with the time-dependent
 * phase e^(-i E_k t). For a single eigenstate that weight is exactly 1
 * everywhere -- a stationary state really is stationary. For a superposition
 * the cross term beats at (E2 - E1)/hbar and the cloud visibly sloshes, which
 * is the oscillating dipole that radiates the photon.
 *
 * Colour is the argument of psi, so the winding of phase around the z axis in
 * an m != 0 state is directly visible: those orbitals carry real circulating
 * current, which a monochrome density plot cannot show.
 */
(function () {
    'use strict';

    const O = window.Orbitals;
    const $ = (id) => document.getElementById(id);

    const SUBSHELL = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k'];
    const REAL_NAMES = {
        '1,0': 'p_z', '1,1': 'p_x', '1,-1': 'p_y',
        '2,0': 'd_z²', '2,1': 'd_xz', '2,-1': 'd_yz', '2,2': 'd_x²−y²', '2,-2': 'd_xy'
    };
    const AU_TIME_S = 2.4188843265857e-17;

    /* --------------------------------------------------------------------- *
     * Minimal matrix helpers
     * --------------------------------------------------------------------- */

    function perspective(fovy, aspect, near, far, xShift) {
        const f = 1 / Math.tan(fovy / 2);
        const nf = 1 / (near - far);
        return new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            xShift || 0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        ]);
    }

    function lookAt(eye, target, up) {
        const z = norm3(sub3(eye, target));
        const x = norm3(cross3(up, z));
        const y = cross3(z, x);
        return new Float32Array([
            x[0], y[0], z[0], 0,
            x[1], y[1], z[1], 0,
            x[2], y[2], z[2], 0,
            -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1
        ]);
    }

    const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross3 = (a, b) => [
        a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]
    ];
    function norm3(a) {
        const len = Math.hypot(a[0], a[1], a[2]) || 1;
        return [a[0] / len, a[1] / len, a[2] / len];
    }

    /* --------------------------------------------------------------------- *
     * Shaders
     * --------------------------------------------------------------------- */

    const VERT = `#version 300 es
    precision highp float;
    precision highp int;

    in vec3 aPosition;
    in vec2 aAmp0;          // complex psi of component 0 at this point
    in vec2 aAmp1;          // component 1 (zero when not a superposition)
    in float aInvQ;         // 1 / proposal density the point was drawn from

    uniform mat4 uProj;
    uniform mat4 uView;
    uniform vec2 uCoef0;    // c0 * (cos, sin) of -E0 t
    uniform vec2 uCoef1;
    uniform float uPointSize;
    uniform float uScale;
    uniform int uColorMode;   // 0 phase, 1 sign, 2 single hue
    uniform int uStyle;       // 0 granular, 1 glow
    uniform float uExposure;
    uniform int uCut;         // 0 none, 1 quadrant cutaway
    uniform float uDensityNorm;
    uniform float uTime;
    uniform float uFlow;      // angular-velocity scale for the current
    uniform float uM;         // magnetic quantum number of the leading state
    uniform vec3 uFog;        // background colour to fade into with depth
    uniform vec2 uFogRange;

    out vec4 vColor;
    out float vDiscard;

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec2 cmul(vec2 a, vec2 b) {
        return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
    }

    // Perceptual dark-to-hot ramp. Mapping probability density to brightness
    // and hue together is what makes a point cloud read as a volume: the dense
    // core glows through the sparse halo instead of being buried by it.
    vec3 fireRamp(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c = mix(vec3(0.045, 0.015, 0.14), vec3(0.42, 0.03, 0.50), smoothstep(0.0, 0.30, t));
        c = mix(c, vec3(0.87, 0.13, 0.40), smoothstep(0.25, 0.55, t));
        c = mix(c, vec3(1.00, 0.52, 0.08), smoothstep(0.50, 0.80, t));
        c = mix(c, vec3(1.00, 0.96, 0.78), smoothstep(0.78, 1.0, t));
        return c;
    }

    float hash(int i) {
        return fract(sin(float(i) * 12.9898) * 43758.5453);
    }

    // sample() puts the quantisation axis on y, so the current circulates
    // about y.
    vec3 rotY(vec3 p, float a) {
        float c = cos(a), s = sin(a);
        return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
    }

    void main() {
        vec2 psi = cmul(aAmp0, uCoef0) + cmul(aAmp1, uCoef1);
        float raw = dot(psi, psi);       // |psi|^2 itself
        float weight = raw * aInvQ;      // 1 for an eigenstate, beats in a mix

        // Probability current. For psi_nlm the flow is purely azimuthal with
        // v_phi = hbar m / (mu r sin theta); in atomic units that is m/s for
        // cylindrical radius s, so the angular velocity is m/s^2 -- a real
        // differential rotation, faster near the axis. m = 0 carries no
        // current at all and correctly does not move.
        float cylR = max(length(aPosition.xz), 1e-3);
        float omega = clamp(uFlow * uM / (cylR * cylR), -4.0, 4.0);
        vec3 world = rotY(aPosition, omega * uTime);

        if (uStyle == 2) {
            // A measurement outcome is a record, not a particle: it is not
            // advected by the current and not removed by the cutaway. aInvQ
            // carries recency here, so older outcomes shrink back.
            vec3 mp = aPosition * uScale;
            vDiscard = 0.0;
            vec4 mv = uView * vec4(mp, 1.0);
            gl_Position = uProj * mv;
            float md = max(0.6, -mv.z);
            float recency = aInvQ;
            gl_PointSize = clamp((3.0 + 9.0 * recency) * 150.0 / md, 2.0, 22.0);
            vColor = vec4(mix(vec3(0.55, 0.05, 0.22), vec3(1.0, 0.16, 0.36), recency), 1.0);
            return;
        }

        vec3 p = world * uScale;
        // A solid cloud of opaque grains only ever shows its own envelope, so
        // the interior shells are invisible from outside no matter how it is
        // lit. Removing one quadrant exposes two cut faces through the middle
        // while leaving the outer form intact -- the cutaway a physical model
        // would use.
        vDiscard = (uCut == 1 && world.x > 0.0 && world.z > 0.0) ? 1.0 : 0.0;

        vec4 viewPos = uView * vec4(p, 1.0);
        gl_Position = uProj * viewPos;
        float dist = max(0.6, -viewPos.z);

        if (uStyle == 0) {
            // Granular: opaque grains of a physical material. Every grain is
            // the same size; what varies is how dark it is, because a deep
            // pile shadows itself. |psi|^2 stands in for pile depth.
            gl_PointSize = clamp(uPointSize * 52.0 / dist, 1.0, 5.5)
                           * smoothstep(0.0, 0.55, weight);

            float t = pow(clamp(raw / max(uDensityNorm, 1e-30), 0.0, 1.0), 0.35);
            vec3 bright = vec3(1.00, 0.78, 0.20);   // lit grain on the outside
            vec3 deep   = vec3(0.62, 0.33, 0.03);   // buried in the pile
            vec3 tint = mix(bright, deep, t * 0.92);

            float v = 0.86 + 0.28 * hash(gl_VertexID);   // grains are not identical

            // Aerial perspective: fade distant grains into the background so a
            // solid 3D cloud still reads as having depth rather than as a flat
            // disc. Depth cueing does the work the silhouette cannot.
            float fog = clamp((dist - uFogRange.x) / max(0.001, uFogRange.y - uFogRange.x), 0.0, 1.0);
            vColor = vec4(mix(tint * v, uFog, fog * 0.82), 1.0);
        } else {
            gl_PointSize = clamp(uPointSize * 130.0 / dist, 1.0, 6.0);
            float amp = clamp(weight * uExposure, 0.0, 1.0);
            vec3 rgb;
            if (uColorMode == 0) {
                float phase = atan(psi.y, psi.x);
                rgb = hsv2rgb(vec3(phase / 6.2831853 + 0.5, 0.68, 1.0));
            } else if (uColorMode == 1) {
                rgb = psi.x >= 0.0 ? vec3(1.0, 0.42, 0.36) : vec3(0.36, 0.62, 1.0);
            } else if (uColorMode == 3) {
                // Density: the cube root compresses the enormous dynamic range
                // of |psi|^2 so the faint outer shells survive alongside a core
                // that can be orders of magnitude brighter.
                float t = pow(clamp(raw / max(uDensityNorm, 1e-30), 0.0, 1.0), 0.33);
                rgb = fireRamp(t);
                amp = clamp(amp * (0.35 + 1.5 * t), 0.0, 1.0);
            } else {
                rgb = vec3(1.0, 0.76, 0.24);
            }
            vColor = vec4(rgb, amp);
        }
    }`;

    const FRAG = `#version 300 es
    precision highp float;
    precision highp int;
    in vec4 vColor;
    in float vDiscard;
    uniform int uStyle;
    out vec4 fragColor;

    void main() {
        if (vDiscard > 0.5) discard;
        vec2 d = gl_PointCoord - vec2(0.5);
        float r2 = dot(d, d);
        if (r2 > 0.25) discard;

        if (uStyle == 2) {
            // Solid bead with a dark rim, so an outcome stays legible against
            // both the light granular ground and the dark glow background.
            vec3 N = normalize(vec3(d.x * 2.0, -d.y * 2.0, sqrt(max(0.0, 1.0 - 4.0 * r2))));
            float diff = max(0.0, dot(N, normalize(vec3(-0.3, 0.6, 0.75))));
            float rim = smoothstep(0.16, 0.25, r2);
            vec3 col = mix(vColor.rgb * (0.45 + 0.75 * diff), vec3(0.08, 0.0, 0.03), rim);
            fragColor = vec4(col, 1.0);
            return;
        }

        if (uStyle == 0) {
            // Treat the sprite as a sphere: recover a normal from the point
            // coordinate and light it, so each grain reads as a solid bead
            // with a highlight rather than a flat disc.
            vec3 N = normalize(vec3(d.x * 2.0, -d.y * 2.0, sqrt(max(0.0, 1.0 - 4.0 * r2))));
            vec3 L = normalize(vec3(-0.35, 0.62, 0.70));
            float diff = max(0.0, dot(N, L));
            float spec = pow(max(0.0, dot(reflect(-L, N), vec3(0.0, 0.0, 1.0))), 26.0);
            float rim = pow(1.0 - N.z, 2.4) * 0.16;
            vec3 col = vColor.rgb * (0.40 + 0.72 * diff)
                     + vec3(1.0, 0.97, 0.90) * spec * 0.40
                     - rim;
            fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        } else {
            float fall = exp(-r2 * 11.0);
            fragColor = vec4(vColor.rgb * vColor.a * fall, 1.0);
        }
    }`;

    /* --------------------------------------------------------------------- *
     * State
     * --------------------------------------------------------------------- */

    const state = {
        n: 4, l: 2, m: 1,
        real: false,
        superposition: false,
        n2: 1, l2: 0, m2: 0,
        pointCount: 500000,
        style: 0,          // 0 granular (default), 1 phase glow
        colorMode: 0,
        exposure: 1.0,
        pointSize: 1.0,
        densityNorm: 1,
        slice: 0,          // slab half-width as a fraction of <r>; 0 = solid 3D
        flow: 0.35,        // rad/s at the mean radius; 0 freezes the current
        clip: true,        // cutaway on by default so the shells are visible
        paused: false,
        speed: 1.0,
        autoRotate: true,
        cloud: null,
        simTime: 0,
        flowTime: 0,
        measurements: [],   // recorded outcomes, newest last
        hideCloud: false
    };

    const camera = { theta: 1.0, phi: 1.32, distance: 3.2, target: [0, 0, 0] };
    const pointer = { down: false, x: 0, y: 0 };

    let gl, canvas, program, vao, markerVao;
    let markerBuffers = {};
    let buffers = {};
    let uniforms = {};
    let generating = false;

    /* --------------------------------------------------------------------- *
     * GL setup
     * --------------------------------------------------------------------- */

    function compile(type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(s));
        }
        return s;
    }

    function initGL() {
        canvas = $('gl');
        gl = canvas.getContext('webgl2', {
            antialias: false, alpha: false, powerPreference: 'high-performance'
        });
        if (!gl) throw new Error('WebGL2 is not available in this browser.');

        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('Program link failed: ' + gl.getProgramInfoLog(program));
        }
        gl.useProgram(program);

        ['uProj', 'uView', 'uCoef0', 'uCoef1', 'uPointSize', 'uScale',
         'uColorMode', 'uStyle', 'uExposure', 'uCut', 'uDensityNorm',
         'uTime', 'uFlow', 'uM', 'uFog', 'uFogRange'].forEach((name) => {
            uniforms[name] = gl.getUniformLocation(program, name);
        });

        vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        markerVao = gl.createVertexArray();
        markerBuffers = { position: gl.createBuffer(), recency: gl.createBuffer() };

        buffers = {
            position: gl.createBuffer(),
            amp0: gl.createBuffer(),
            amp1: gl.createBuffer(),
            invQ: gl.createBuffer()
        };

        gl.blendFunc(gl.ONE, gl.ONE);
        applyStyleState();
    }

    /** Opaque + depth-tested for grains, additive + depth-free for glow. */
    function applyStyleState() {
        if (state.style === 0) {
            gl.disable(gl.BLEND);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
        } else {
            gl.enable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);
        }
        document.body.classList.toggle('light', state.style === 0);
    }

    function bindAttribute(buffer, name, size) {
        const loc = gl.getAttribLocation(program, name);
        if (loc < 0) return;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }

    function uploadCloud(cloud) {
        gl.bindVertexArray(vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, cloud.positions, gl.STATIC_DRAW);
        bindAttribute(buffers.position, 'aPosition', 3);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.amp0);
        gl.bufferData(gl.ARRAY_BUFFER, cloud.amplitudes[0], gl.STATIC_DRAW);
        bindAttribute(buffers.amp0, 'aAmp0', 2);

        const amp1 = cloud.amplitudes[1] || new Float32Array(cloud.count * 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.amp1);
        gl.bufferData(gl.ARRAY_BUFFER, amp1, gl.STATIC_DRAW);
        bindAttribute(buffers.amp1, 'aAmp1', 2);

        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.invQ);
        gl.bufferData(gl.ARRAY_BUFFER, cloud.invProposal, gl.STATIC_DRAW);
        bindAttribute(buffers.invQ, 'aInvQ', 1);
    }

    /* --------------------------------------------------------------------- *
     * Measurement
     *
     * Each click re-prepares the atom in the same state and measures position
     * once. A measurement never returns a cloud -- it returns one location.
     * The cloud is what the outcomes add up to, which is exactly what the
     * accumulating markers demonstrate.
     * --------------------------------------------------------------------- */

    const MAX_MARKERS = 4000;

    function measure(count) {
        if (!state.sampler) return;
        for (let i = 0; i < count; i++) {
            const p = state.sampler.sample();
            state.measurements.push(p);
        }
        if (state.measurements.length > MAX_MARKERS) {
            state.measurements.splice(0, state.measurements.length - MAX_MARKERS);
        }
        uploadMarkers();
        renderMeasurement();
    }

    function uploadMarkers() {
        const n = state.measurements.length;
        const pos = new Float32Array(n * 3);
        const rec = new Float32Array(n);
        for (let i = 0; i < n; i++) {
            const m = state.measurements[i];
            pos[i * 3] = m.x; pos[i * 3 + 1] = m.y; pos[i * 3 + 2] = m.z;
            // newest = 1, oldest = 0
            rec[i] = n === 1 ? 1 : i / (n - 1);
        }
        gl.bindVertexArray(markerVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffers.position);
        gl.bufferData(gl.ARRAY_BUFFER, pos, gl.DYNAMIC_DRAW);
        bindAttribute(markerBuffers.position, 'aPosition', 3);
        gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffers.recency);
        gl.bufferData(gl.ARRAY_BUFFER, rec, gl.DYNAMIC_DRAW);
        bindAttribute(markerBuffers.recency, 'aInvQ', 1);
        // psi is unused for markers; leave those arrays disabled so they read
        // the default generic value rather than stale cloud data.
        ['aAmp0', 'aAmp1'].forEach((name) => {
            const loc = gl.getAttribLocation(program, name);
            if (loc >= 0) gl.disableVertexAttribArray(loc);
        });
    }

    function renderMeasurement() {
        const n = state.measurements.length;
        $('measureCount').textContent = n.toLocaleString();
        const last = state.measurements[n - 1];
        const out = $('measureLast');
        if (!last) { out.textContent = '—'; return; }
        const deg = (x) => (x * 180 / Math.PI).toFixed(0) + '°';
        out.innerHTML =
            'r = ' + last.r.toFixed(2) + ' a₀ (' + (last.r * O.BOHR_PM).toFixed(0) + ' pm)<br>' +
            'θ = ' + deg(last.theta) + ' · φ = ' + deg(last.phi);
    }

    /* --------------------------------------------------------------------- *
     * Cloud generation, chunked so the page keeps breathing
     * --------------------------------------------------------------------- */

    function activeStates() {
        const list = [{ n: state.n, l: state.l, m: state.m, weight: 1 }];
        if (state.superposition) {
            list[0].weight = 0.5;
            list.push({ n: state.n2, l: state.l2, m: state.m2, weight: 0.5 });
        }
        return list;
    }

    async function regenerate() {
        if (generating) return;
        generating = true;
        setBusy(true);

        try {
            await new Promise((r) => requestAnimationFrame(r));
            // Slab half-width in Bohr radii, scaled to the orbital so the slice
            // stays proportionate from 1s out to 12h.
            const slab = state.slice > 0
                ? state.slice * O.expectedRadius(state.n, state.l) : 0;
            const cloud = O.samplePointCloud(activeStates(), state.pointCount, {
                real: state.real, slab: slab
            });
            // Measurements always sample the full 3D state, never the slice --
            // a cross-section is a way of looking, not a constraint on where
            // the electron can be found.
            state.sampler = O.createSampler(state.n, state.l, state.m, { real: state.real });
            state.cloud = cloud;
            uploadCloud(cloud);
            // Frame from where the density actually is. <r> sits well inside
            // the visible cloud and rMax is a vanishingly thin tail, so use a
            // high percentile of the sampled radii.
            const step = Math.max(1, Math.floor(cloud.count / 20000));
            const radii = [];
            for (let i = 0; i < cloud.count; i += step) {
                radii.push(Math.hypot(
                    cloud.positions[i * 3], cloud.positions[i * 3 + 1], cloud.positions[i * 3 + 2]));
            }
            radii.sort((a, b) => a - b);
            const p97 = radii[Math.floor(radii.length * 0.97)] || 1;
            state.scale = 1 / p97;

            const dens = [];
            for (let i = 0; i < cloud.count; i += step) {
                let re = 0, im = 0;
                for (let k = 0; k < cloud.amplitudes.length; k++) {
                    re += cloud.amplitudes[k][i * 2];
                    im += cloud.amplitudes[k][i * 2 + 1];
                }
                dens.push(re * re + im * im);
            }
            dens.sort((a, b) => a - b);
            state.densityNorm = dens[Math.floor(dens.length * 0.92)] || 1;
            state.simTime = 0;
            state.measurements = [];
            uploadMarkers();
            renderMeasurement();
            updateReadout();
        } catch (err) {
            setError(err.message);
        } finally {
            generating = false;
            setBusy(false);
        }
    }

    /* --------------------------------------------------------------------- *
     * Render loop
     * --------------------------------------------------------------------- */

    function resize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const w = Math.floor(canvas.clientWidth * dpr);
        const h = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w;
            canvas.height = h;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    let lastFrame = performance.now();

    function frame(now) {
        const dt = Math.min(0.1, (now - lastFrame) / 1000);
        lastFrame = now;
        resize();

        if (!state.paused) {
            state.simTime += dt * state.speed;
            state.flowTime += dt;
        }
        if (state.autoRotate && !pointer.down) camera.theta += dt * 0.12;

        if (state.style === 0) gl.clearColor(0.937, 0.933, 0.925, 1);
        else gl.clearColor(0.016, 0.020, 0.043, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        if (state.cloud) {
            const aspect = canvas.width / Math.max(1, canvas.height);
            const eye = [
                camera.distance * Math.sin(camera.phi) * Math.cos(camera.theta),
                camera.distance * Math.cos(camera.phi),
                camera.distance * Math.sin(camera.phi) * Math.sin(camera.theta)
            ];
            gl.useProgram(program);
            gl.bindVertexArray(vao);
            // Centre the orbital in the space the panel leaves free.
            const panel = document.getElementById('panel');
            const panelW = panel && panel.getBoundingClientRect().width < canvas.clientWidth
                ? panel.getBoundingClientRect().width : 0;
            const xShift = panelW / Math.max(1, canvas.clientWidth);
            gl.uniformMatrix4fv(uniforms.uProj, false, perspective(0.9, aspect, 0.05, 60, xShift));
            // Looking straight down +y makes [0,1,0] degenerate as an up vector.
            const up = Math.abs(Math.cos(camera.phi)) > 0.985 ? [0, 0, 1] : [0, 1, 0];
            gl.uniformMatrix4fv(uniforms.uView, false, lookAt(eye, camera.target, up));

            // e^(-i E t): the only time dependence a stationary state has, and
            // the reason a single eigenstate never appears to move.
            const list = activeStates();
            const w0 = Math.sqrt(list[0].weight);
            const e0 = O.energy(list[0].n);
            gl.uniform2f(uniforms.uCoef0,
                w0 * Math.cos(-e0 * state.simTime * TIME_SCALE),
                w0 * Math.sin(-e0 * state.simTime * TIME_SCALE));

            if (list[1]) {
                const w1 = Math.sqrt(list[1].weight);
                const e1 = O.energy(list[1].n);
                gl.uniform2f(uniforms.uCoef1,
                    w1 * Math.cos(-e1 * state.simTime * TIME_SCALE),
                    w1 * Math.sin(-e1 * state.simTime * TIME_SCALE));
            } else {
                gl.uniform2f(uniforms.uCoef1, 0, 0);
            }

            gl.uniform1f(uniforms.uPointSize, state.pointSize);
            gl.uniform1f(uniforms.uScale, state.scale || 0.05);
            gl.uniform1i(uniforms.uColorMode, state.colorMode);
            gl.uniform1i(uniforms.uStyle, state.style);
            gl.uniform1f(uniforms.uDensityNorm, state.densityNorm || 1);

            // Normalise the flow so omega equals `flow` at the mean radius,
            // which keeps the apparent speed comparable from 1s out to 12h.
            const meanR = O.expectedRadius(state.n, state.l);
            gl.uniform1f(uniforms.uFlow, state.flow * meanR * meanR);
            gl.uniform1f(uniforms.uM, state.superposition ? 0 : state.m);
            gl.uniform1f(uniforms.uTime, state.flowTime);

            const bg = state.style === 0 ? [0.937, 0.933, 0.925] : [0.016, 0.020, 0.043];
            gl.uniform3f(uniforms.uFog, bg[0], bg[1], bg[2]);
            gl.uniform2f(uniforms.uFogRange,
                camera.distance * 0.55, camera.distance * 1.85);
            gl.uniform1f(uniforms.uExposure,
                state.exposure * 0.030 * (500000 / Math.max(1, state.cloud.count)));
            gl.uniform1i(uniforms.uCut, state.clip ? 1 : 0);
            if (!state.hideCloud) {
                gl.drawArrays(gl.POINTS, 0, state.cloud.count);
            }

            if (state.measurements.length) {
                gl.bindVertexArray(markerVao);
                gl.uniform1i(uniforms.uStyle, 2);
                const wasBlend = state.style === 1;
                if (wasBlend) { gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); }
                gl.drawArrays(gl.POINTS, 0, state.measurements.length);
                if (wasBlend) { gl.enable(gl.BLEND); gl.disable(gl.DEPTH_TEST); }
            }
        }

        requestAnimationFrame(frame);
    }

    // Atomic-unit frequencies are ~10^16 rad/s. Slow the clock enough to watch.
    const TIME_SCALE = 8.0;

    /* --------------------------------------------------------------------- *
     * Readout
     * --------------------------------------------------------------------- */

    function orbitalName(n, l, m, real) {
        const letter = SUBSHELL[l] || ('l=' + l);
        if (!real) return n + letter + (l > 0 ? ' (m=' + (m > 0 ? '+' : '') + m + ')' : '');
        const key = l + ',' + m;
        return n + (REAL_NAMES[key] || (letter + '(m=' + m + ')'));
    }

    function updateReadout() {
        const n = state.n, l = state.l, m = state.m;
        $('nameOut').textContent = orbitalName(n, l, m, state.real);
        $('energyOut').textContent = (O.energy(n) * O.HARTREE_EV).toFixed(4) + ' eV';
        $('radiusOut').textContent = O.expectedRadius(n, l).toFixed(2) + ' a₀  (' +
            (O.expectedRadius(n, l) * O.BOHR_PM).toFixed(1) + ' pm)';
        $('nodesOut').textContent = O.radialNodes(n, l) + ' radial · ' + O.angularNodes(l) + ' angular';
        $('pointsOut').textContent = state.pointCount.toLocaleString();

        const flowNote = $('flowNote');
        if (flowNote) {
            if (state.superposition) {
                flowNote.textContent = 'Superposition: the current is not a simple rotation, so the grains are held still and only the beat is shown.';
            } else if (state.m === 0) {
                flowNote.textContent = 'm = 0 carries no probability current. Nothing circulates — and that is the physics, not a missing feature.';
            } else {
                const meanR = O.expectedRadius(state.n, state.l);
                flowNote.textContent = 'm = ' + (state.m > 0 ? '+' : '') + state.m +
                    ' circulates about the vertical axis. Angular speed goes as m/s², so grains near the axis lap the outer ones.';
            }
        }

        const beat = $('beatOut');
        if (state.superposition) {
            const dE = Math.abs(O.energy(state.n2) - O.energy(n));
            if (dE > 1e-12) {
                const periodAU = (2 * Math.PI) / dE;
                const seconds = periodAU * AU_TIME_S;
                const nm = 1239.841984 / (dE * O.HARTREE_EV);
                beat.textContent = (seconds * 1e18).toFixed(1) + ' as  →  photon at ' + nm.toFixed(1) + ' nm';
            } else {
                beat.textContent = 'degenerate — no beat (same energy)';
            }
        } else {
            beat.textContent = 'stationary state — |ψ|² does not evolve';
        }
        $('beatRow').hidden = false;
    }

    function setBusy(on) {
        $('busy').hidden = !on;
    }

    function setError(msg) {
        const el = $('error');
        el.textContent = msg || '';
        el.hidden = !msg;
    }

    /* --------------------------------------------------------------------- *
     * Controls
     * --------------------------------------------------------------------- */

    function clampQuantumNumbers() {
        state.n = Math.max(1, Math.min(12, state.n));
        state.l = Math.max(0, Math.min(state.n - 1, state.l));
        state.m = Math.max(-state.l, Math.min(state.l, state.m));
        state.n2 = Math.max(1, Math.min(12, state.n2));
        state.l2 = Math.max(0, Math.min(state.n2 - 1, state.l2));
        state.m2 = Math.max(-state.l2, Math.min(state.l2, state.m2));
    }

    function syncInputs() {
        clampQuantumNumbers();
        $('nIn').value = state.n;
        $('lIn').value = state.l;
        $('mIn').value = state.m;
        $('lIn').max = state.n - 1;
        $('mIn').min = -state.l;
        $('mIn').max = state.l;
        $('nOut').textContent = state.n;
        $('lOut').textContent = state.l + ' (' + (SUBSHELL[state.l] || '?') + ')';
        $('mOutVal').textContent = (state.m > 0 ? '+' : '') + state.m;

        $('n2In').value = state.n2;
        $('l2In').value = state.l2;
        $('m2In').value = state.m2;
        $('l2In').max = state.n2 - 1;
        $('m2In').min = -state.l2;
        $('m2In').max = state.l2;
        $('n2Out').textContent = state.n2;
        $('l2Out').textContent = state.l2;
        $('m2OutVal').textContent = (state.m2 > 0 ? '+' : '') + state.m2;
    }

    const PRESETS = {
        '1s': { n: 1, l: 0, m: 0 },
        '2pz': { n: 2, l: 1, m: 0 },
        '3d': { n: 3, l: 2, m: 1 },
        '4f': { n: 4, l: 3, m: 2 },
        'minutephysics': { n: 6, l: 2, m: 1 },
        '8g': { n: 8, l: 4, m: 2 }
    };

    function wire() {
        const bind = (id, handler) => {
            const el = $(id);
            if (el) el.addEventListener('input', handler);
        };

        ['nIn', 'lIn', 'mIn'].forEach((id) => bind(id, () => {
            state.n = +$('nIn').value;
            state.l = +$('lIn').value;
            state.m = +$('mIn').value;
            syncInputs();
            regenerate();
        }));

        ['n2In', 'l2In', 'm2In'].forEach((id) => bind(id, () => {
            state.n2 = +$('n2In').value;
            state.l2 = +$('l2In').value;
            state.m2 = +$('m2In').value;
            syncInputs();
            regenerate();
        }));

        bind('pointsIn', () => {
            state.pointCount = +$('pointsIn').value;
            $('pointsOut').textContent = state.pointCount.toLocaleString();

        const flowNote = $('flowNote');
        if (flowNote) {
            if (state.superposition) {
                flowNote.textContent = 'Superposition: the current is not a simple rotation, so the grains are held still and only the beat is shown.';
            } else if (state.m === 0) {
                flowNote.textContent = 'm = 0 carries no probability current. Nothing circulates — and that is the physics, not a missing feature.';
            } else {
                const meanR = O.expectedRadius(state.n, state.l);
                flowNote.textContent = 'm = ' + (state.m > 0 ? '+' : '') + state.m +
                    ' circulates about the vertical axis. Angular speed goes as m/s², so grains near the axis lap the outer ones.';
            }
        }
            regenerate();
        });
        bind('sizeIn', () => { state.pointSize = +$('sizeIn').value / 100; });
        bind('flowIn', () => {
            state.flow = +$('flowIn').value / 100;
            $('flowOut').textContent = state.flow > 0 ? state.flow.toFixed(2) + ' rad/s' : 'frozen';
        });
        bind('sliceIn', () => {
            const wasSolid = state.slice === 0;
            state.slice = +$('sliceIn').value / 100;
            // A cross-section is only readable face-on, so square up to it the
            // first time one is asked for, and pull back to an oblique view
            // when it is switched off again.
            if (state.slice > 0 && wasSolid) {
                camera.theta = Math.PI / 2; camera.phi = Math.PI / 2;
            } else if (state.slice === 0 && !wasSolid) {
                camera.theta = 1.0; camera.phi = 1.32;
            }
            $('sliceOut').textContent = state.slice > 0
                ? Math.round(state.slice * 100) + '%' : 'solid';
            regenerate();
        });
        bind('exposureIn', () => { state.exposure = +$('exposureIn').value / 100; });
        bind('speedIn', () => {
            state.speed = +$('speedIn').value / 100;
            $('speedOut').textContent = state.speed.toFixed(2) + '×';
        });

        $('realIn').addEventListener('change', (e) => {
            state.real = e.target.checked;
            state.colorMode = state.real ? 1 : 0;
            $('colorIn').value = String(state.colorMode);
            regenerate();
        });
        $('superIn').addEventListener('change', (e) => {
            state.superposition = e.target.checked;
            $('superPanel').hidden = !state.superposition;
            regenerate();
        });
        $('clipIn').addEventListener('change', (e) => { state.clip = e.target.checked; });
        $('rotateIn').addEventListener('change', (e) => { state.autoRotate = e.target.checked; });
        $('colorIn').addEventListener('change', (e) => { state.colorMode = +e.target.value; });
        $('styleIn').addEventListener('change', (e) => {
            state.style = +e.target.value;
            applyStyleState();
        });
        $('pauseBtn').addEventListener('click', () => {
            state.paused = !state.paused;
            $('pauseBtn').textContent = state.paused ? 'Resume' : 'Pause';
        });

        document.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const p = PRESETS[btn.dataset.preset];
                if (!p) return;
                Object.assign(state, p);
                syncInputs();
                regenerate();
            });
        });

        // orbit / zoom
        canvas.addEventListener('pointerdown', (e) => {
            pointer.down = true;
            pointer.x = e.clientX;
            pointer.y = e.clientY;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!pointer.down) return;
            camera.theta -= (e.clientX - pointer.x) * 0.008;
            camera.phi = Math.max(0.08, Math.min(Math.PI - 0.08, camera.phi - (e.clientY - pointer.y) * 0.008));
            pointer.x = e.clientX;
            pointer.y = e.clientY;
        });
        const release = () => { pointer.down = false; };
        canvas.addEventListener('pointerup', release);
        canvas.addEventListener('pointercancel', release);
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            camera.distance = Math.max(0.6, Math.min(14, camera.distance * (e.deltaY > 0 ? 1.1 : 1 / 1.1)));
        }, { passive: false });

        document.addEventListener('keydown', (e) => {
            if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
            if (e.code === 'Space') { e.preventDefault(); $('pauseBtn').click(); }
            if (e.key === 'm' || e.key === 'M') measure(1);
        });

        $('verifyBtn').addEventListener('click', runVerification);
        $('measureOne').addEventListener('click', () => measure(1));
        $('measureMany').addEventListener('click', () => measure(250));
        $('measureClear').addEventListener('click', () => {
            state.measurements = [];
            uploadMarkers();
            renderMeasurement();
        });
        $('hideCloudIn').addEventListener('change', (e) => { state.hideCloud = e.target.checked; });
    }

    /* --------------------------------------------------------------------- *
     * In-page verification
     * --------------------------------------------------------------------- */

    function runVerification() {
        const out = $('verifyOut');
        const n = state.n, l = state.l;
        const lines = [];

        const norm = O.normalisation(n, l, 0, 4000);
        lines.push(fmt('∫|ψ|²dV', norm.toFixed(6), '1.000000', Math.abs(norm - 1) < 1e-4));

        const numR = O.meanRadius(n, l, 20000);
        const exactR = O.expectedRadius(n, l);
        lines.push(fmt('⟨r⟩ quadrature', numR.toFixed(4), exactR.toFixed(4),
            Math.abs(numR - exactR) < 0.005 * exactR));

        let sum = 0;
        const sampler = O.createSampler(n, l, state.m, { real: state.real });
        const N = 60000;
        for (let i = 0; i < N; i++) sum += sampler.sample().r;
        const sampledR = sum / N;
        lines.push(fmt('⟨r⟩ from samples', sampledR.toFixed(3), exactR.toFixed(3),
            Math.abs(sampledR - exactR) < 0.03 * exactR));

        const nodes = O.countRadialNodes(n, l, 40000);
        lines.push(fmt('radial nodes', String(nodes), String(O.radialNodes(n, l)),
            nodes === O.radialNodes(n, l)));

        const eV = O.energy(n) * O.HARTREE_EV;
        lines.push(fmt('Eₙ', eV.toFixed(4) + ' eV', (-13.605693 / (n * n)).toFixed(4) + ' eV',
            Math.abs(eV + 13.605693 / (n * n)) < 1e-4));

        out.innerHTML = lines.join('');
        out.hidden = false;
    }

    function fmt(label, got, want, pass) {
        return '<div class="vrow ' + (pass ? 'ok' : 'bad') + '">' +
            '<span>' + label + '</span><code>' + got + '</code>' +
            '<em>' + want + '</em><b>' + (pass ? '✓' : '✗') + '</b></div>';
    }

    /* --------------------------------------------------------------------- *
     * Boot
     * --------------------------------------------------------------------- */

    document.addEventListener('DOMContentLoaded', () => {
        try {
            initGL();
        } catch (err) {
            setError(err.message + ' This visualisation needs WebGL2.');
            return;
        }
        wire();
        syncInputs();
        $('superPanel').hidden = true;
        uploadMarkers();
        renderMeasurement();
        regenerate();
        requestAnimationFrame(frame);
    });
})();
