/* Landing page: the opening ("wavefunction collapse") and the live orbital in
   the hero. Grains are drawn from |ψ|² with the same exact sampler as the
   Hydrogen explorer (HydrogenAtom/orbitals.js) and rendered as ink stipple in
   a single WebGL draw call; position, rotation, morphing and the collapse all
   happen in the vertex shader, so a frame costs almost nothing on the CPU.

   Opening: grains accumulate into a 3d z² orbital while a ket of disciplines
   sits beneath it; "measurement" collapses every grain onto the glyphs of the
   real <h1> (measured from its laid-out text), the page fades in under them,
   and the grains lift off again into the orbital that lives in the hero. */
(() => {
  'use strict';

  const root = document.documentElement;
  const mq = q => !!(window.matchMedia && window.matchMedia(q).matches);
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const phone = mq('(pointer: coarse)') && Math.min(screen.width || innerWidth, screen.height || innerHeight) <= 820;
  const introRequested = root.classList.contains('intro');
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  renderDisciplineIndex();

  const plate = document.querySelector('.orbital-plate');
  const title = document.getElementById('hero-title');
  const exciteBtn = document.querySelector('.orbital-excite');
  if (!plate || !title || !window.Orbitals) return fallback();

  /* ---------------------------------------------------------------- *
   * Orbitals — real (chemistry) forms, cycled by "exciting" the cloud
   * ---------------------------------------------------------------- */
  const ORBITALS = [
    { n: 3, l: 2, m: 0, label: '3d z²' },
    { n: 4, l: 3, m: 0, label: '4f z³' },
    { n: 4, l: 2, m: 1, label: '4d xz' },
    { n: 3, l: 1, m: 0, label: '3p z' },
    { n: 4, l: 3, m: -2, label: '4f xyz' },
    { n: 2, l: 1, m: 0, label: '2p z' },
  ];
  const COUNT = phone ? 9000 : (innerWidth < 1100 ? 12000 : 16000);
  const samples = new Map();

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // positions scaled so the 95th-percentile radius sits at 1, plus the sign
  // of ψ at each grain (green for +, rust for −, like a textbook plate)
  function sampleOrbital(index) {
    if (samples.has(index)) return samples.get(index);
    const o = ORBITALS[index];
    const rng = mulberry32(9157 + index * 101);
    const sampler = Orbitals.createSampler(o.n, o.l, o.m, { real: true, radialSteps: 1600, polarSteps: 900, azimuthSteps: 900 });
    const pos = new Float32Array(COUNT * 3), sign = new Float32Array(COUNT), radii = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const p = sampler.sample(rng);
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      radii[i] = p.r;
      sign[i] = Orbitals.psiReal(o.n, o.l, o.m, p.r, p.theta, p.phi).re >= 0 ? 1 : -1;
    }
    const r95 = radii.slice().sort()[Math.floor(COUNT * 0.95)] || 1;
    for (let i = 0; i < pos.length; i++) pos[i] /= r95;
    const out = { pos, sign };
    samples.set(index, out);
    return out;
  }

  /* ---------------------------------------------------------------- *
   * Renderer
   * ---------------------------------------------------------------- */
  const VERT = `
    attribute vec3 aPosA;
    attribute vec3 aPosB;
    attribute float aSignA;
    attribute float aSignB;
    attribute vec3 aTarget;   // xy: a point inside the name's glyphs; z: 1 on the rust dot
    attribute vec4 aRand;     // x reveal order, y collapse delay, z morph delay, w phase
    uniform vec2 uOrigin;     // canvas top-left and size, in the layout's px
    uniform vec2 uSize;
    uniform vec2 uCenter;     // where the cloud sits, and px per orbital unit
    uniform float uRadius;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uFromB;     // which buffer is showing (0 = A, 1 = B)
    uniform float uMorph;     // 0..1 toward the other buffer
    uniform float uReveal;    // 0..1 how much of the cloud has been "sampled"
    uniform float uCollapse;  // 0..1 cloud → name
    uniform float uLift;
    uniform vec2 uPointer;
    uniform float uPointerAmt;
    uniform float uTime;
    uniform float uScale;     // point size in device px
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float m = clamp((uMorph - aRand.z * 0.45) / 0.55, 0.0, 1.0);
      m = m * m * (3.0 - 2.0 * m);
      vec3 p = mix(mix(aPosA, aPosB, uFromB), mix(aPosB, aPosA, uFromB), m);
      float s = m < 0.5 ? mix(aSignA, aSignB, uFromB) : mix(aSignB, aSignA, uFromB);
      // turn about the vertical (quantisation) axis, then tip toward the viewer
      float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
      vec3 r = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
      r = vec3(r.x, cp * r.y - sp * r.z, sp * r.y + cp * r.z);
      float persp = 3.4 / (3.4 - r.z);
      vec2 cloud = uCenter + vec2(r.x, -r.y) * uRadius * persp;
      // observation disturbs the system: grains near the pointer scatter and jitter
      vec2 d = cloud - uPointer;
      float near = exp(-dot(d, d) / (uRadius * uRadius * 0.08)) * uPointerAmt;
      cloud += normalize(d + vec2(0.001)) * near * uRadius * 0.1
             + vec2(sin(uTime * 23.0 + aRand.w * 61.0), cos(uTime * 19.0 + aRand.w * 47.0)) * near * uRadius * 0.05;
      // each grain flies on its own schedule (aRand.y = when its letter is
      // written), so the name inks itself in reading order
      float c = clamp(uCollapse * 2.6 - aRand.y * 1.6, 0.0, 1.0);
      c = c * c * (3.0 - 2.0 * c);
      vec2 pos = mix(cloud, aTarget.xy, c);
      pos.y -= sin(c * 3.14159) * uLift * (0.45 + aRand.w * 0.55);
      vec2 clip = (pos - uOrigin) / uSize * 2.0 - 1.0;
      gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
      float depth = clamp(r.z * 0.45 + 0.5, 0.0, 1.0);
      gl_PointSize = step(aRand.x, uReveal) * uScale * mix((0.72 + depth * 0.6) * persp, 0.95, c);
      vec3 green = vec3(0.149, 0.247, 0.204);
      vec3 rust = vec3(0.663, 0.325, 0.204);
      vec3 ink = vec3(0.125, 0.169, 0.161);
      vColor = mix(s >= 0.0 ? green : rust, mix(ink, rust, aTarget.z), c);
      vAlpha = mix(0.36 + depth * 0.54, 0.9, c);
    }`;
  const FRAG = `
    precision mediump float;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      float a = vAlpha * smoothstep(0.5, 0.3, length(gl_PointCoord - 0.5));
      if (a < 0.01) discard;
      gl_FragColor = vec4(vColor * a, a);
    }`;

  function createRenderer(canvas, count) {
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false,
      stencil: false, powerPreference: 'low-power'
    });
    if (!gl) return null;
    const compile = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT), fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
    gl.useProgram(prog);
    const buffers = {};
    for (const [name, size] of [['aPosA', 3], ['aPosB', 3], ['aSignA', 1], ['aSignB', 1], ['aTarget', 3], ['aRand', 4]]) {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, count * size * 4, gl.DYNAMIC_DRAW);
      const loc = gl.getAttribLocation(prog, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
      }
      buffers[name] = buf;
    }
    const uni = {};
    for (const name of ['uOrigin', 'uSize', 'uCenter', 'uRadius', 'uYaw', 'uPitch', 'uFromB', 'uMorph', 'uReveal',
      'uCollapse', 'uLift', 'uPointer', 'uPointerAmt', 'uTime', 'uScale']) uni[name] = gl.getUniformLocation(prog, name);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return {
      gl,
      upload(name, data) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      },
      draw(u) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform2f(uni.uOrigin, u.ox, u.oy);
        gl.uniform2f(uni.uSize, u.w, u.h);
        gl.uniform2f(uni.uCenter, u.cx, u.cy);
        gl.uniform1f(uni.uRadius, u.radius);
        gl.uniform1f(uni.uYaw, u.yaw);
        gl.uniform1f(uni.uPitch, u.pitch);
        gl.uniform1f(uni.uFromB, u.fromB);
        gl.uniform1f(uni.uMorph, u.morph);
        gl.uniform1f(uni.uReveal, u.reveal);
        gl.uniform1f(uni.uCollapse, u.collapse);
        gl.uniform1f(uni.uLift, u.lift);
        gl.uniform2f(uni.uPointer, u.px, u.py);
        gl.uniform1f(uni.uPointerAmt, u.pointerAmt);
        gl.uniform1f(uni.uTime, u.time);
        gl.uniform1f(uni.uScale, u.scale);
        gl.drawArrays(gl.POINTS, 0, count);
      }
    };
  }

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const renderer = createRenderer(canvas, COUNT);
  if (!renderer) return fallback();

  /* ---------------------------------------------------------------- *
   * Grain attributes
   * ---------------------------------------------------------------- */
  const first = sampleOrbital(0);
  renderer.upload('aPosA', first.pos);
  renderer.upload('aPosB', first.pos);
  renderer.upload('aSignA', first.sign);
  renderer.upload('aSignB', first.sign);
  const rand = new Float32Array(COUNT * 4);
  {
    const rng = mulberry32(31337);
    for (let i = 0; i < COUNT; i++) {
      const rad = Math.hypot(first.pos[i * 3], first.pos[i * 3 + 1], first.pos[i * 3 + 2]);
      rand[i * 4] = rng();                                        // reveal order: true sampling, uniform
      rand[i * 4 + 1] = rng();                                    // collapse schedule (set from the name's reading order)
      rand[i * 4 + 2] = Math.min(1, rad * 0.35 + rng() * 0.65);  // excitations ripple outward
      rand[i * 4 + 3] = rng();
    }
    renderer.upload('aRand', rand);
  }

  /* ---------------------------------------------------------------- *
   * State + geometry
   * ---------------------------------------------------------------- */
  const U = {
    ox: 0, oy: 0, w: 1, h: 1, cx: 0, cy: 0, radius: 100,
    yaw: 0.6, pitch: -0.32, fromB: 0, morph: 0, reveal: 0, collapse: 0, lift: 0,
    px: -1e5, py: -1e5, pointerAmt: 0, time: 0, scale: 2
  };
  const BASE_POINT = phone ? 1.75 : 1.9;
  let dpr = 1;

  function sizeCanvas(cssW, cssH, maxDpr) {
    dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    U.scale = BASE_POINT * dpr;
  }
  // hero geometry, in the canvas's own px once it lives inside the plate
  function plateGeometry() {
    const w = plate.clientWidth, h = plate.clientHeight;
    return { w, h, cx: w / 2, cy: h * 0.5, radius: Math.min(w, h) * 0.34 };
  }

  /* ---------------------------------------------------------------- *
   * Hero
   * ---------------------------------------------------------------- */
  let current = 0;          // index into ORBITALS currently on show
  let showingB = false;     // which attribute buffer holds it
  let morph = null;         // { start, dur, next }
  let heroMode = false, running = false, onScreen = true, raf = 0, last = 0;
  let pointerOn = false;

  function mountInPlate() {
    canvas.className = '';
    canvas.removeAttribute('style');
    plate.insertBefore(canvas, plate.firstChild);
    layoutHero();
  }
  function layoutHero() {
    const g = plateGeometry();
    sizeCanvas(g.w, g.h, 2);
    canvas.style.width = canvas.style.height = '';
    U.ox = 0; U.oy = 0; U.w = g.w; U.h = g.h;
    U.cx = g.cx; U.cy = g.cy; U.radius = g.radius;
  }

  function startHero(revealFromZero) {
    heroMode = true;
    if (revealFromZero) U.reveal = 0;
    U.collapse = 0; U.lift = 0;
    updateCaption();
    if (exciteBtn) exciteBtn.disabled = false;
    // pre-sample the next state while idle so the first tap morphs instantly
    idle(() => sampleOrbital(1));
    if (reduced) { U.reveal = 1; renderer.draw(U); return; }
    resume();
  }
  function resume() {
    if (running || !heroMode || reduced || !onScreen || document.hidden) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(heroFrame);
  }
  function pause() {
    running = false;
    cancelAnimationFrame(raf);
  }
  function heroFrame(now) {
    if (!running) return;
    raf = requestAnimationFrame(heroFrame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    U.time = now / 1000;
    U.yaw += dt * 0.16;
    if (U.reveal < 1) U.reveal = Math.min(1, U.reveal + dt / 1.1);
    U.pointerAmt += ((pointerOn ? 1 : 0) - U.pointerAmt) * (1 - Math.pow(0.004, dt));
    if (morph) {
      U.morph = Math.min(1, (now - morph.start) / morph.dur);
      if (U.morph >= 1) finishMorph();
    }
    renderer.draw(U);
  }

  function excite() {
    if (!heroMode || morph) return;
    const next = (current + 1) % ORBITALS.length;
    const data = sampleOrbital(next);
    // the incoming state goes into whichever buffer isn't on show
    renderer.upload(showingB ? 'aPosA' : 'aPosB', data.pos);
    renderer.upload(showingB ? 'aSignA' : 'aSignB', data.sign);
    U.fromB = showingB ? 1 : 0;
    U.morph = 0;
    morph = { start: performance.now(), dur: 1500, next };
    current = next;
    updateCaption(true);
    if (reduced) { finishMorph(); renderer.draw(U); }
    idle(() => sampleOrbital((next + 1) % ORBITALS.length));
  }
  function finishMorph() {
    showingB = !showingB;
    U.fromB = showingB ? 1 : 0;
    U.morph = 0;
    morph = null;
  }

  const capSymbol = document.querySelector('.orbital-symbol');
  const capName = document.querySelector('.orbital-name');
  const capEnergy = document.querySelector('.orbital-energy');
  const capGrains = document.querySelector('.orbital-grains');
  const capStatus = document.getElementById('orbital-status');
  function updateCaption(announce) {
    const o = ORBITALS[current];
    const sub = o.m < 0 ? `${o.n},${o.l},${o.m}`.replace('-', '−') : `${o.n}${o.l}${o.m}`;
    const energy = (-13.6057 / (o.n * o.n)).toFixed(2).replace('-', '−');
    const subN = String(o.n).replace(/\d/g, d => '₀₁₂₃₄₅₆₇₈₉'[d]);
    const set = () => {
      if (capSymbol) capSymbol.innerHTML = `ψ<sub>${esc(sub)}</sub>`;
      if (capName) capName.textContent = o.label;
      if (capEnergy) capEnergy.textContent = `E${subN} = ${energy} eV`;
      if (capGrains) capGrains.textContent = `${COUNT.toLocaleString('en-US')} grains sampled live from |ψ|²`;
    };
    if (!announce) return set();
    for (const el of [capSymbol, capName, capEnergy]) if (el) el.classList.add('is-swapping');
    setTimeout(() => {
      set();
      for (const el of [capSymbol, capName, capEnergy]) if (el) el.classList.remove('is-swapping');
    }, 230);
    if (capStatus) capStatus.textContent = `Excited to the ${o.label} orbital, n = ${o.n}.`;
  }
  for (const el of [capSymbol, capName, capEnergy]) if (el) el.setAttribute('data-swap', '');
  const capHint = document.querySelector('.caption-hint');
  if (capHint && !mq('(pointer: coarse)')) capHint.textContent = 'Click the cloud to excite it';

  if (exciteBtn) {
    exciteBtn.disabled = true;
    exciteBtn.addEventListener('click', excite);
    const setPointer = e => {
      const r = plate.getBoundingClientRect();
      U.px = e.clientX - r.left; U.py = e.clientY - r.top;
      pointerOn = true;
    };
    exciteBtn.addEventListener('pointermove', setPointer);
    exciteBtn.addEventListener('pointerdown', setPointer);
    exciteBtn.addEventListener('pointerleave', () => { pointerOn = false; });
    exciteBtn.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') pointerOn = false; });
    exciteBtn.addEventListener('pointercancel', () => { pointerOn = false; });
  }

  // pause whenever the plate is off screen or the tab is hidden
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      onScreen = entries[entries.length - 1].isIntersecting;
      onScreen ? resume() : pause();
    }).observe(plate);
  }
  document.addEventListener('visibilitychange', () => { document.hidden ? pause() : resume(); });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!heroMode) return;
      layoutHero();
      renderer.draw(U);
    }, 120);
  });

  /* ---------------------------------------------------------------- *
   * The opening
   * ---------------------------------------------------------------- */
  if (!introRequested) {
    mountInPlate();
    startHero(true);
    return;
  }
  if (reduced) return calmIntro();
  fullIntro();

  function calmIntro() {
    mountInPlate();
    U.reveal = 1;
    startHero(false);
    setTimeout(() => {
      root.classList.add('intro-reveal');
      setTimeout(endIntro, 700);
    }, 250);
  }

  function endIntro() {
    root.classList.remove('intro', 'intro-calm', 'intro-reveal');
    try { if ('scrollRestoration' in history) history.scrollRestoration = 'auto'; } catch (e) {}
  }

  function fullIntro() {
    const veil = document.querySelector('.intro-veil');
    const skipBtn = document.querySelector('.intro-skip');
    const countEl = document.querySelector('.intro-count');
    const statusText = document.querySelector('.intro-status-text');
    window.scrollTo(0, 0);

    // the opening draws across the viewport (page px == viewport px: scroll is locked at 0)
    const vw = innerWidth, vh = innerHeight;
    canvas.className = 'intro-canvas';
    document.body.appendChild(canvas);
    sizeCanvas(vw, vh, vw * vh > 1.6e6 ? 1.5 : 2);
    U.ox = 0; U.oy = 0; U.w = vw; U.h = vh;
    U.cx = vw / 2; U.cy = vh * (phone ? 0.42 : 0.45);
    U.radius = phone ? Math.min(vw * 0.36, vh * 0.2) : Math.min(vw, vh) * 0.25;
    U.reveal = 0;
    if (veil) {
      // the ket sits just under the cloud (CSS positions it from 50%)
      veil.style.setProperty('--intro-r', Math.round(U.radius * 1.2 + (U.cy - vh / 2)) + 'px');
    }

    // where every grain lands when the state is measured: inside the glyphs of
    // the real heading, paired left-to-right with where it sits in the cloud
    let targets = null;
    const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    fontsReady.then(() => {
      if (done) return;
      targets = measureNameTargets();
      if (targets) {
        renderer.upload('aTarget', targets);
        renderer.upload('aRand', rand);   // collapse schedule now follows the name's reading order
      }
    });

    // timeline (ms)
    const T_TEXT = 140, T_SAMPLED = 1150, T_MEASURE = 1200, D_COLLAPSE = 1150,
          D_HOLD = 180, D_RELEASE = 820, T_GIVE_UP = 2600;
    const t0 = performance.now();
    let phase = 'sample', measureAt = 0, revealAt = 0, releaseAt = 0, done = false, raf2 = 0;
    const hero = plateGeometry();
    const plateRect = plate.getBoundingClientRect();

    const skip = () => finish(true);
    const skipEvents = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    setTimeout(() => {
      if (!done) for (const ev of skipEvents) window.addEventListener(ev, skip, { passive: true, once: true });
    }, 250);
    if (skipBtn) skipBtn.addEventListener('click', skip);
    // a real resize ends the opening; a phone's toolbar settling doesn't
    const onResize = () => { if (Math.abs(innerWidth - vw) > 2 || Math.abs(innerHeight - vh) > 140) skip(); };
    window.addEventListener('resize', onResize);
    if (veil) setTimeout(() => !done && veil.classList.add('show-text'), T_TEXT);

    function frame(now) {
      if (done) return;
      raf2 = requestAnimationFrame(frame);
      const t = now - t0;
      U.time = now / 1000;
      U.yaw = 0.6 + t * 0.00026;
      if (phase === 'sample') {
        const k = Math.min(1, t / T_SAMPLED);
        U.reveal = 1 - Math.pow(1 - k, 2.2);
        if (countEl) countEl.textContent = Math.round(U.reveal * COUNT).toLocaleString('en-US');
        if (t >= T_MEASURE) {
          if (targets) {
            phase = 'collapse'; measureAt = now;
            if (veil) veil.classList.add('measured');
            if (statusText) statusText.textContent = 'measured';
          } else if (t > T_GIVE_UP) {
            phase = 'release'; releaseAt = now;      // fonts never arrived: skip the name
            root.classList.add('intro-reveal');
            toHeroCenter();
          }
        }
      } else if (phase === 'collapse') {
        U.collapse = Math.min(1, (now - measureAt) / D_COLLAPSE);
        U.lift = U.radius * 0.45;
        if (U.collapse >= 1 && now - measureAt >= D_COLLAPSE + D_HOLD) {
          phase = 'release'; revealAt = releaseAt = now;
          root.classList.add('intro-reveal');      // page fades in under the stippled name
          toHeroCenter();
        }
      } else if (phase === 'release') {
        // grains lift off the letters and settle into the hero's orbital
        const k = Math.min(1, Math.max(0, (now - releaseAt - 180) / D_RELEASE));
        U.collapse = 1 - k;
        U.lift = hero.radius * 0.5;
        if (k >= 1) return finish(false);
      }
      renderer.draw(U);
    }
    function toHeroCenter() {
      U.cx = plateRect.left + hero.cx; U.cy = plateRect.top + hero.cy;
      U.radius = hero.radius;
    }

    function finish(skipped) {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf2);
      for (const ev of skipEvents) window.removeEventListener(ev, skip);
      window.removeEventListener('resize', onResize);
      root.classList.add('intro-reveal');
      // the canvas moves into the hero plate; same pixels, new coordinates
      mountInPlate();
      U.collapse = 0; U.lift = 0; U.reveal = 1;
      startHero(false);
      renderer.draw(U);
      setTimeout(endIntro, skipped ? 520 : 480);
    }

    function measureNameTargets() {
      const rect = title.getBoundingClientRect();
      if (!rect.width) return null;
      const pad = 6;
      const W = Math.ceil(rect.width + pad * 2), H = Math.ceil(rect.height + pad * 2);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;
      const range = document.createRange();
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT);
      const lines = [];   // {top, bottom, left, right} per laid-out line, for reading order
      let drew = 0;
      // paint each glyph at its laid-out position, so kerning, letter-spacing
      // and the line break all match the real heading exactly
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const el = node.parentElement, cs = getComputedStyle(el);
        ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        ctx.fillStyle = el.closest('.accent-dot') ? '#ff0000' : '#000000';
        ctx.textBaseline = 'alphabetic';
        const fm = ctx.measureText('Hg');
        const asc = fm.fontBoundingBoxAscent || fm.actualBoundingBoxAscent * 1.25;
        const desc = fm.fontBoundingBoxDescent || fm.actualBoundingBoxDescent * 1.4;
        const text = node.textContent;
        for (let i = 0; i < text.length; i++) {
          if (!text[i].trim()) continue;
          range.setStart(node, i); range.setEnd(node, i + 1);
          const r = range.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const baseline = r.top + (r.height - (asc + desc)) / 2 + asc;
          ctx.fillText(text[i], r.left - rect.left + pad, baseline - rect.top + pad);
          drew++;
          let line = lines.find(l => Math.abs(l.top - r.top) < r.height * 0.5);
          if (!line) lines.push(line = { top: r.top, bottom: r.bottom, left: r.left, right: r.right });
          line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right);
          line.bottom = Math.max(line.bottom, r.bottom);
        }
      }
      if (!drew) return null;
      const img = ctx.getImageData(0, 0, W, H).data;
      const ink = [];
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const k = (y * W + x) * 4;
          if (img[k + 3] > 120) ink.push(x, y, img[k] > 128 ? 1 : 0);
        }
      }
      const n = ink.length / 3;
      if (n < 60) return null;
      const rng = mulberry32(4242);
      const ox = rect.left - pad, oy = rect.top - pad;
      // draw targets uniformly over the ink, then pair them with grains in
      // left-to-right order so the cloud pours into the name as a sheet
      const pts = new Float32Array(COUNT * 3);
      for (let i = 0; i < COUNT; i++) {
        const j = Math.floor(rng() * n) * 3;
        pts[i * 3] = ox + ink[j] + rng();
        pts[i * 3 + 1] = oy + ink[j + 1] + rng();
        pts[i * 3 + 2] = ink[j + 2];
      }
      const yaw = 0.6 + T_MEASURE * 0.00026, cy = Math.cos(yaw), sy = Math.sin(yaw);
      const gKey = new Float32Array(COUNT), tKey = new Float32Array(COUNT);
      for (let i = 0; i < COUNT; i++) {
        gKey[i] = cy * first.pos[i * 3] + sy * first.pos[i * 3 + 2] + (rng() - 0.5) * 0.3;
        tKey[i] = pts[i * 3] + (rng() - 0.5) * rect.width * 0.06;
      }
      const gOrder = Array.from({ length: COUNT }, (_, i) => i).sort((a, b) => gKey[a] - gKey[b]);
      const tOrder = Array.from({ length: COUNT }, (_, i) => i).sort((a, b) => tKey[a] - tKey[b]);
      lines.sort((a, b) => a.top - b.top);
      const out = new Float32Array(COUNT * 3);
      for (let k = 0; k < COUNT; k++) {
        const gi = gOrder[k], g = gi * 3, p = tOrder[k] * 3;
        out[g] = pts[p]; out[g + 1] = pts[p + 1]; out[g + 2] = pts[p + 2];
        // when this grain lands: by line, then left to right along it
        // (line boxes overlap at this tight leading, so pick the nearest centre)
        let li = 0, best = Infinity;
        for (let q = 0; q < lines.length; q++) {
          const dist = Math.abs(pts[p + 1] - (lines[q].top + lines[q].bottom) / 2);
          if (dist < best) { best = dist; li = q; }
        }
        const L = lines[li];
        const along = Math.min(1, Math.max(0, (pts[p] - L.left) / Math.max(1, L.right - L.left)));
        rand[gi * 4 + 1] = Math.min(1, Math.max(0, (li + along) / lines.length + (rng() - 0.5) * 0.05));
      }
      return out;
    }

    raf2 = requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */
  function idle(fn) {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout: 2500 });
    else setTimeout(fn, 400);
  }

  // No WebGL (or no sampler): keep the page fully usable — watercolor in the
  // plate, and the opening reduced to a quick fade.
  function fallback() {
    root.classList.add('no-webgl');
    if (introRequested) {
      setTimeout(() => {
        root.classList.add('intro-reveal');
        setTimeout(() => root.classList.remove('intro', 'intro-calm', 'intro-reveal'), 600);
      }, 200);
    }
  }

  function renderDisciplineIndex() {
    const list = document.getElementById('discipline-index');
    if (!list || typeof PORTFOLIO_SECTIONS === 'undefined') return;
    // same ids portfolio.html uses for its category filters
    const ids = [
      ['systems', 'Systems & enterprise'], ['languages', 'Languages & compilers'],
      ['simulations', 'Simulations & art'], ['games', 'Games'], ['ventures', 'Ventures'],
      ['applications', 'Applications'], ['writing', 'Writing'], ['photography', 'Photography'],
      ['research', 'Research']
    ];
    list.innerHTML = PORTFOLIO_SECTIONS.map((section, i) => {
      const [id, label] = ids[i] || ['', section.title];
      const count = section.items.length;
      return `<li><a href="portfolio.html${id ? '#' + id : ''}">` +
        `<span class="di-num">${String(i + 1).padStart(2, '0')}</span>` +
        `<span class="di-title">${esc(label)}</span>` +
        `<span class="di-count">${count} ${count === 1 ? 'project' : 'projects'}</span>` +
        `<span class="di-arrow" aria-hidden="true">↗</span></a></li>`;
    }).join('');
  }
})();
