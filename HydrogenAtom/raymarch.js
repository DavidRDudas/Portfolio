/**
 * Volumetric raymarcher for the hydrogen field.
 *
 * Instead of drawing millions of sprites and hoping the silhouette suggests a
 * shape, this integrates the radiative transfer equation through the density:
 *
 *     dI/ds = sigma * (emission) - sigma * I
 *
 * front-to-back, with the shadow term precomputed by volume.js. That is the
 * same model used for smoke and cloud rendering, and it is why the result has
 * genuine interior structure rather than a shell of dots -- every shell along
 * the ray contributes, attenuated by everything in front of it.
 *
 * Exposed as a small factory so viewer.js can own the GL context.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.OrbitalRaymarch = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const VERT = `#version 300 es
    precision highp float;
    // Fullscreen triangle: no vertex buffer, positions come from the id.
    out vec2 vUv;
    void main() {
        vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        vUv = p;
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }`;

    const FRAG = `#version 300 es
    precision highp float;
    precision highp int;
    precision highp sampler3D;

    in vec2 vUv;
    out vec4 fragColor;

    uniform sampler3D uField;      // (Re psi0, Im psi0, Re psi1, Im psi1)
    uniform sampler3D uLightVol;   // precomputed transmittance toward the light

    uniform vec3 uEye;             // in box units, box spans [-1,1]^3
    uniform vec3 uRight;
    uniform vec3 uUp;
    uniform vec3 uForward;
    uniform vec2 uTanFov;          // (tan(fov/2)*aspect, tan(fov/2))

    uniform vec2 uCoef0;
    uniform vec2 uCoef1;
    uniform float uDensityRef;
    uniform float uOpacity;
    uniform float uExposure;
    uniform int uSteps;
    uniform int uColorMode;        // 0 phase, 1 sign, 3 density
    uniform int uCut;
    uniform float uSlab;           // >0 restricts |z| in box units
    uniform float uFlow;
    uniform float uTime;
    uniform float uM;
    uniform vec3 uBackground;
    uniform float uJitter;

    vec2 cmul(vec2 a, vec2 b) {
        return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
    }

    vec3 hsv2rgb(vec3 c) {
        vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
        vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
        return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
    }

    vec3 fireRamp(float t) {
        t = clamp(t, 0.0, 1.0);
        vec3 c = mix(vec3(0.035, 0.012, 0.13), vec3(0.40, 0.03, 0.52), smoothstep(0.0, 0.30, t));
        c = mix(c, vec3(0.88, 0.13, 0.40), smoothstep(0.25, 0.55, t));
        c = mix(c, vec3(1.00, 0.53, 0.09), smoothstep(0.50, 0.80, t));
        c = mix(c, vec3(1.00, 0.97, 0.82), smoothstep(0.78, 1.00, t));
        return c;
    }

    // Slab method against the unit box.
    bool hitBox(vec3 ro, vec3 rd, out float t0, out float t1) {
        vec3 inv = 1.0 / rd;
        vec3 a = (vec3(-1.0) - ro) * inv;
        vec3 b = (vec3( 1.0) - ro) * inv;
        vec3 lo = min(a, b), hi = max(a, b);
        t0 = max(max(lo.x, lo.y), lo.z);
        t1 = min(min(hi.x, hi.y), hi.z);
        return t1 > max(t0, 0.0);
    }

    float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    void main() {
        vec2 ndc = vUv * 2.0 - 1.0;
        vec3 rd = normalize(uForward + uRight * ndc.x * uTanFov.x + uUp * ndc.y * uTanFov.y);

        float t0, t1;
        if (!hitBox(uEye, rd, t0, t1)) {
            fragColor = vec4(uBackground, 1.0);
            return;
        }
        t0 = max(t0, 0.0);

        float dt = (t1 - t0) / float(uSteps);
        // Jittering the entry point trades banding for noise, which the eye
        // forgives far more readily at these step counts.
        float t = t0 + dt * hash(gl_FragCoord.xy + uJitter) * 0.999;

        vec3 acc = vec3(0.0);
        float trans = 1.0;

        for (int i = 0; i < 512; i++) {
            if (i >= uSteps || t > t1 || trans < 0.004) break;
            vec3 p = uEye + rd * t;
            t += dt;

            if (uCut == 1 && p.x > 0.0 && p.z > 0.0) continue;
            if (uSlab > 0.0 && abs(p.z) > uSlab) continue;

            vec3 uvw = p * 0.5 + 0.5;
            vec4 f = texture(uField, uvw);
            vec2 psi = cmul(f.xy, uCoef0) + cmul(f.zw, uCoef1);

            // Probability current. For an m-eigenstate a rotation by alpha is
            // exactly a phase factor e^(i m alpha), so the winding applies to
            // psi directly rather than to the sample point. Rotating the
            // lookup instead moved the density and -- worse -- the shadow
            // fetch, and since the light is sheared the shadow field is not
            // axisymmetric: the result aliased into luminance stripes the
            // moment alpha varied by more than a step between samples.
            if (uFlow != 0.0 && uM != 0.0) {
                // omega goes as m/(r sin theta)^2, which diverges on the axis:
                // the phase there genuinely winds arbitrarily fast, and no
                // step size resolves it. Softening the denominator rather than
                // clamping the radius bounds the rate without the kink a hard
                // clamp leaves, and still has the inner shells lapping the
                // outer ones everywhere the sampling can actually follow.
                float cyl2 = dot(p.xz, p.xz) + 0.0625;   // 0.25^2
                float ang = -uFlow * uM * uTime / cyl2;
                float c = cos(ang), s = sin(ang);
                psi = vec2(psi.x * c - psi.y * s, psi.x * s + psi.y * c);
            }

            float rho = dot(psi, psi);
            if (rho <= 0.0) continue;

            float nd = clamp(rho / uDensityRef, 0.0, 4.0);
            // The cube root compresses a dynamic range that spans several
            // orders of magnitude, so the faint outer shells survive next to
            // a core that would otherwise be the only thing visible.
            float shade = pow(min(nd, 1.0), 0.40);

            vec3 emis;
            if (uColorMode == 0) {
                emis = hsv2rgb(vec3(atan(psi.y, psi.x) / 6.2831853 + 0.5, 0.62, 1.0)) * shade;
            } else if (uColorMode == 1) {
                emis = (psi.x >= 0.0 ? vec3(1.0, 0.45, 0.38) : vec3(0.38, 0.62, 1.0)) * shade;
            } else {
                emis = fireRamp(shade);
            }

            float lit = texture(uLightVol, uvw).r;
            emis *= 0.30 + 1.05 * lit;

            float sigma = uOpacity * nd;
            float a = 1.0 - exp(-sigma * dt);
            acc += trans * a * emis * uExposure;
            trans *= 1.0 - a;
        }

        fragColor = vec4(acc + uBackground * trans, 1.0);
    }`;

    function create(gl) {
        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                throw new Error('raymarch shader: ' + gl.getShaderInfoLog(s));
            }
            return s;
        }

        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            throw new Error('raymarch link: ' + gl.getProgramInfoLog(program));
        }

        const u = {};
        ['uField', 'uLightVol', 'uEye', 'uRight', 'uUp', 'uForward', 'uTanFov',
         'uCoef0', 'uCoef1', 'uDensityRef', 'uOpacity', 'uExposure', 'uSteps',
         'uColorMode', 'uCut', 'uSlab', 'uFlow', 'uTime', 'uM', 'uBackground',
         'uJitter'].forEach((n) => { u[n] = gl.getUniformLocation(program, n); });

        const vao = gl.createVertexArray();   // attribute-less, but GL needs one bound
        const fieldTex = gl.createTexture();
        const lightTex = gl.createTexture();

        function upload(volume) {
            const n = volume.size;

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, fieldTex);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach((w) => {
                gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
            });
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA16F, n, n, n, 0, gl.RGBA, gl.FLOAT, volume.data);

            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, lightTex);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R].forEach((w) => {
                gl.texParameteri(gl.TEXTURE_3D, w, gl.CLAMP_TO_EDGE);
            });
            gl.texImage3D(gl.TEXTURE_3D, 0, gl.R16F, n, n, n, 0, gl.RED, gl.FLOAT,
                volume.illumination);
        }

        function draw(opts) {
            gl.useProgram(program);
            gl.bindVertexArray(vao);
            gl.disable(gl.BLEND);
            gl.disable(gl.DEPTH_TEST);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_3D, fieldTex);
            gl.uniform1i(u.uField, 0);
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_3D, lightTex);
            gl.uniform1i(u.uLightVol, 1);

            gl.uniform3fv(u.uEye, opts.eye);
            gl.uniform3fv(u.uRight, opts.right);
            gl.uniform3fv(u.uUp, opts.up);
            gl.uniform3fv(u.uForward, opts.forward);
            gl.uniform2f(u.uTanFov, opts.tanFov[0], opts.tanFov[1]);
            gl.uniform2f(u.uCoef0, opts.coef0[0], opts.coef0[1]);
            gl.uniform2f(u.uCoef1, opts.coef1[0], opts.coef1[1]);
            gl.uniform1f(u.uDensityRef, opts.densityRef);
            gl.uniform1f(u.uOpacity, opts.opacity);
            gl.uniform1f(u.uExposure, opts.exposure);
            gl.uniform1i(u.uSteps, opts.steps);
            gl.uniform1i(u.uColorMode, opts.colorMode);
            gl.uniform1i(u.uCut, opts.cut ? 1 : 0);
            gl.uniform1f(u.uSlab, opts.slab || 0);
            gl.uniform1f(u.uFlow, opts.flow || 0);
            gl.uniform1f(u.uTime, opts.time || 0);
            gl.uniform1f(u.uM, opts.m || 0);
            gl.uniform3fv(u.uBackground, opts.background);
            gl.uniform1f(u.uJitter, opts.jitter || 0);

            gl.drawArrays(gl.TRIANGLES, 0, 3);
        }

        return { upload: upload, draw: draw, program: program };
    }

    return { create: create };
});
