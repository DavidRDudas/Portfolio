// ==========================================================
// THE LIBRARY
// Galleries of bookcases on floors without end, facing each other across a
// chasm, with a rest area every 40 bookcases: beds, a kiosk that serves any
// food, a bathroom, a slot in the wall, and a spiral stair through all the
// floors. After the library in Steven L. Peck's A Short Stay in Hell (which
// is after Borges's Library of Babel).
//
// Every book really is somewhere. babel.js turns an address into its text
// and a text into its address, so the one book that lets you out has a
// place on the shelves like any other.
//
// The building repeats, so only the part around you is drawn and you stay
// near the origin. When you walk past a rest area or change floor, the
// numbers that say where you are move instead (they run to 1.3 million
// digits), and the books are re-dealt from them.
// ==========================================================
(() => {
  'use strict';
  const B = window.Babel;

  // ---------- the building, in metres ----------
  const BAY = 0.62;                       // one bookcase: 5 shelves of 19 books
  const BAYS = 40;                        // bookcases between rest areas
  const RUN = BAY * BAYS;                 // 24.8 m of shelves
  const REST = 7.4;                       // the rest area's opening
  const MOD = RUN + REST;                 // 32.2 m: the gallery repeats this often
  const FLOOR_H = 4, SLAB = 0.3, CEIL = FLOOR_H - SLAB;
  const FRONT = -2.2;                     // the fronts of the bookcases on our side
  const CHASM = 24;                       // railing to railing
  const MID = CHASM / 2;
  const POST = 0.03, BOOK_W = (BAY - POST) / 19;
  const ROW0 = 0.12, ROW_P = 0.42, BOARD = 0.025, BOOK_H = 0.3, BOOK_D = 0.22;
  const CASE_H = 2.45, CASE_D = 0.26;
  const SPINE_Z = FRONT - 0.02;           // spines sit a little back from the shelf edges
  const LAMP_Y = 3.0;
  const BACK = FRONT - 8;                 // the rest area goes 8 m back from the gallery
  const WELL_X = RUN + 4.4, WELL_Z = -6.6, WELL_R = 1.3;
  const STEPS = 16, STEP_A = Math.PI * 2 / STEPS, STAIR_A0 = Math.PI / 2;   // the stair starts on the side facing the gallery
  const BEDS_Z = [-3.3, -4.7, -6.1, -7.5];
  const KIOSK_X0 = RUN + 0.8, KIOSK_X1 = RUN + 3.0;
  const SLOT_X = RUN + 5.6;
  const DOOR_Z0 = -4.6, DOOR_Z1 = -3.6;
  // pendants in a rest area: over the beds, the kiosk, the slot, and beside the stairwell
  const ALC_LAMPS = [[RUN + 1.2, 3.25, -4.6], [RUN + 1.9, 3.25, BACK + 1.0], [RUN + 5.6, 3.25, BACK + 1.4], [WELL_X + 1.75, 3.25, WELL_Z + 0.5]];
  const EYE = 1.62, RADIUS = 0.28;
  const FLOORS = 8, MODS = 2;             // drawn either side of you
  const SEED_W = (2 * MODS + 1) * BAYS, SEED_H = (2 * FLOORS + 1) * 2;
  const PRIME = 16777213;                 // book tones repeat after this many sections or floors
  const FOG = new THREE.Color(0x0b0907);

  const C = {
    wood: [0.26, 0.18, 0.12], woodDark: [0.15, 0.105, 0.075], board: [0.31, 0.215, 0.145],
    back: [0.06, 0.046, 0.035], plaster: [0.47, 0.4, 0.32], ceiling: [0.36, 0.31, 0.25],
    floor: [0.34, 0.245, 0.17], slabEdge: [0.22, 0.18, 0.145], rail: [0.13, 0.095, 0.07],
    iron: [0.075, 0.07, 0.065], lamp: [1.0, 0.82, 0.58], brass: [0.55, 0.42, 0.22],
    sheet: [0.6, 0.56, 0.48], pillow: [0.7, 0.67, 0.6], blanket: [0.2, 0.22, 0.27],
    hatch: [0.95, 0.66, 0.38], black: [0.015, 0.013, 0.012], stone: [0.4, 0.35, 0.3],
  };
  // book bindings (the shader has the same list)
  const BINDINGS = [[0.38, 0.19, 0.15], [0.3, 0.21, 0.15], [0.21, 0.24, 0.18], [0.19, 0.2, 0.27], [0.34, 0.15, 0.125], [0.25, 0.2, 0.16]];

  const EMBEDDED = window.parent !== window;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse) document.body.classList.add('touch');
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const pad6 = n => String(n).padStart(6, '0');
  const commas = n => n.toLocaleString('en-US');
  const posMod = (a, m) => ((a % m) + m) % m;

  // ==========================================================
  // GEOMETRY: everything is boxes and flat faces with a colour, built into
  // a few buffers. Each face is wound to point the way it's told to.
  // ==========================================================
  class Geo {
    constructor() { this.p = []; this.n = []; this.c = []; this.e = []; this.t = []; }
    tri(a, b, c, want, col, e = 0, t = 0) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
      const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      if (len < 1e-12) return;
      nx /= len; ny /= len; nz /= len;
      if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { const s = b; b = c; c = s; nx = -nx; ny = -ny; nz = -nz; }
      for (const v of [a, b, c]) {
        this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz);
        this.c.push(col[0], col[1], col[2]); this.e.push(e); this.t.push(t);
      }
    }
    quad(a, b, c, d, want, col, e = 0, t = 0) { this.tri(a, b, c, want, col, e, t); this.tri(a, c, d, want, col, e, t); }
    // an axis-aligned box; `skip` names faces to leave out ('+x -z' …)
    box(x0, y0, z0, x1, y1, z1, col, o = {}) {
      const e = o.e || 0, t = o.t || 0, skip = o.skip || '';
      if (!skip.includes('+x')) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], col, e, t);
      if (!skip.includes('-x')) this.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0], col, e, t);
      if (!skip.includes('+y')) this.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0], o.top || col, e, o.ttop !== undefined ? o.ttop : t);
      if (!skip.includes('-y')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], o.bottom || col, e, t);
      if (!skip.includes('+z')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], o.front || col, e, t);
      if (!skip.includes('-z')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1], col, e, t);
    }
    // a box from its centre and three half-axes (for things at an angle)
    obox(c, ax, ay, az, col, e = 0) {
      const P = (i, j, k) => [c[0] + i * ax[0] + j * ay[0] + k * az[0], c[1] + i * ax[1] + j * ay[1] + k * az[1], c[2] + i * ax[2] + j * ay[2] + k * az[2]];
      const neg = v => [-v[0], -v[1], -v[2]];
      this.quad(P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), P(1, -1, 1), ax, col, e);
      this.quad(P(-1, -1, -1), P(-1, 1, -1), P(-1, 1, 1), P(-1, -1, 1), neg(ax), col, e);
      this.quad(P(-1, 1, -1), P(1, 1, -1), P(1, 1, 1), P(-1, 1, 1), ay, col, e);
      this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), neg(ay), col, e);
      this.quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), az, col, e);
      this.quad(P(-1, -1, -1), P(1, -1, -1), P(1, 1, -1), P(-1, 1, -1), neg(az), col, e);
    }
    // a segment of a ring: a stair tread
    wedge(cx, cz, r0, r1, a0, a1, y0, y1, col) {
      const pt = (r, a, y) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
      const am = (a0 + a1) / 2;
      this.quad(pt(r0, a0, y1), pt(r1, a0, y1), pt(r1, a1, y1), pt(r0, a1, y1), [0, 1, 0], col);
      this.quad(pt(r0, a0, y0), pt(r1, a0, y0), pt(r1, a1, y0), pt(r0, a1, y0), [0, -1, 0], col);
      this.quad(pt(r1, a0, y0), pt(r1, a1, y0), pt(r1, a1, y1), pt(r1, a0, y1), [Math.cos(am), 0, Math.sin(am)], col);
      this.quad(pt(r0, a0, y0), pt(r0, a0, y1), pt(r1, a0, y1), pt(r1, a0, y0), [Math.sin(a0), 0, -Math.cos(a0)], col);
      this.quad(pt(r0, a1, y0), pt(r0, a1, y1), pt(r1, a1, y1), pt(r1, a1, y0), [-Math.sin(a1), 0, Math.cos(a1)], col);
    }
    cyl(cx, cz, y0, y1, r, seg, col, inward = false) {
      for (let i = 0; i < seg; i++) {
        const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2, s = inward ? -1 : 1;
        const p = (a, y) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
        this.quad(p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), [s * Math.cos(am), 0, s * Math.sin(am)], col);
      }
    }
    // a flat THREE.ShapeGeometry laid on the floor (its y becomes z)
    shape(sg, y, want, col, t = 0) {
      const pos = sg.attributes.position, idx = sg.index;
      const at = i => [pos.getX(i), y, pos.getY(i)];
      const n = idx ? idx.count : pos.count;
      for (let i = 0; i < n; i += 3) {
        const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, c = idx ? idx.getX(i + 2) : i + 2;
        this.tri(at(a), at(b), at(c), want, col, 0, t);
      }
    }
    // the same thing as seen from across the chasm
    mirrored() {
      const m = new Geo();
      for (let v = 0; v < this.e.length; v += 3) {
        for (const k of [0, 2, 1]) {
          const i = v + k;
          m.p.push(this.p[3 * i], this.p[3 * i + 1], CHASM - this.p[3 * i + 2]);
          m.n.push(this.n[3 * i], this.n[3 * i + 1], -this.n[3 * i + 2]);
          m.c.push(this.c[3 * i], this.c[3 * i + 1], this.c[3 * i + 2]);
          m.e.push(this.e[i]); m.t.push(this.t[i]);
        }
      }
      return m;
    }
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
      g.setAttribute('aEmit', new THREE.Float32BufferAttribute(this.e, 1));
      g.setAttribute('aTex', new THREE.Float32BufferAttribute(this.t, 1));
      return g;
    }
  }

  // ==========================================================
  // SHADERS. No three.js lights: every lamp in the library sits on the same
  // repeating plan, so each surface works out the few lamps near it itself.
  // ==========================================================
  const glf = v => { const s = String(+v.toFixed(6)); return '(' + (s.includes('.') || s.includes('e') ? s : s + '.0') + ')'; };
  const DEFS = Object.entries({ BAY, BAYS, RUN, REST, MOD, FLOOR_H, FRONT, CHASM, MID, POST, BOOK_W, ROW0, ROW_P, BOARD, BOOK_H, BOOK_D,
    CASE_H, SPINE_Z, LAMP_Y, MODS, FLOORS, SEED_W, SEED_H })
    .map(([k, v]) => `#define ${k} ${glf(v)}`).join('\n') + '\n' +
    ALC_LAMPS.map((l, i) => `#define ALC${i} vec3${'(' + l.map(glf).join(', ') + ')'}`).join('\n') + '\n';

  const VERT = `
    attribute float aEmit;
    attribute float aTex;
    varying vec3 vW;
    varying vec3 vN;
    varying vec3 vC;
    varying float vE;
    varying float vT;
    varying float vDepth;
    void main() {
      vec4 p = vec4(position, 1.0);
      vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
      vec4 w = modelMatrix * p;
      vW = w.xyz;
      vN = normalize(mat3(modelMatrix) * n);
      vC = color;
      vE = aEmit;
      vT = aTex;
      vec4 mv = viewMatrix * w;
      vDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }`;

  const LIGHT = DEFS + `
    uniform float uLight;
    uniform vec3 uFog;
    uniform float uFogD;
    varying vec3 vW;
    varying vec3 vN;
    varying vec3 vC;
    varying float vE;
    varying float vT;
    varying float vDepth;
    // x mod y for whole numbers, safe from the rounding in GPU division
    float imod(float x, float y) { return x - y * floor((x + 0.5) / y); }
    float lampTerm(vec3 L, vec3 P, vec3 N) {
      vec3 d = L - P;
      float q = max(dot(d, d), 0.0004);
      float ndl = clamp((dot(N, d) * inversesqrt(q) + 0.18) / 1.18, 0.0, 1.0);
      float w = max(1.0 - q / 64.0, 0.0);
      return ndl * w * w / (1.0 + q * 0.36);
    }
    vec3 lighting(vec3 P, vec3 N) {
      // decide which floor and which stretch of gallery from a point just
      // off the surface, so a wall or ceiling on a boundary belongs to the
      // side it faces
      vec3 Pn = P + N * 0.03;
      float fl = floor(Pn.y / FLOOR_H);
      float far = step(MID, Pn.z);
      // fold the far side onto ours: it's the same plan, mirrored
      vec3 Q = vec3(P.x, P.y - fl * FLOOR_H, mix(P.z, CHASM - P.z, far));
      vec3 M = vec3(N.x, N.y, mix(N.z, -N.z, far));
      Q.x -= floor(Pn.x / MOD) * MOD;
      float s = 0.0;
      // a wall lamp every four bookcases (its shade throws the light
      // forward, so it's cast from a little in front of the wall)
      float i0 = clamp(floor((Q.x - 2.0 * BAY) / (4.0 * BAY) + 0.5), 0.0, 9.0);
      for (int k = -1; k <= 1; k++) {
        float i = i0 + float(k);
        if (i >= 0.0 && i <= 9.0) s += lampTerm(vec3((4.0 * i + 2.0) * BAY, LAMP_Y, FRONT + 0.75), Q, M);
      }
      // the lamps hanging over this rest area's opening and the last one's
      s += 1.2 * lampTerm(vec3(RUN + REST * 0.5, LAMP_Y + 0.15, FRONT + 0.6), Q, M);
      s += 1.2 * lampTerm(vec3(-REST * 0.5, LAMP_Y + 0.15, FRONT + 0.6), Q, M);
      if (Q.z < FRONT + 1.5 && Q.x > RUN - 1.0)
        s += lampTerm(ALC0, Q, M) + lampTerm(ALC1, Q, M) + lampTerm(ALC2, Q, M) + lampTerm(ALC3, Q, M);
      return vec3(0.065, 0.057, 0.05) + s * vec3(1.75, 1.24, 0.79);
    }
    vec3 finish(vec3 albedo, vec3 N, float emit) {
      vec3 c = albedo * (lighting(vW, N) * uLight + emit * max(uLight, 0.25));
      // the dark comes in faster up and down than along a gallery, so the
      // floors fade out well before the last one drawn
      vec3 dv = vW - cameraPosition;
      float d = length(vec3(dv.x, dv.y * 1.6, dv.z));
      float f = 1.0 - exp(-d * d * uFogD * uFogD);
      return mix(c, uFog, clamp(f, 0.0, 1.0));
    }
  `;

  const SOLID_FRAG = LIGHT + `
    void main() {
      vec3 N = normalize(vN);
      vec3 c = vC;
      if (vT > 0.5) {
        // floorboards running along the gallery
        float row = floor(vW.z / 0.17);
        float seg = floor((vW.x + row * 0.71) / 1.83);
        float h = fract(sin(row * 12.9898 + seg * 78.233) * 43758.5453);
        float fz = fract(vW.z / 0.17), fx = fract((vW.x + row * 0.71) / 1.83);
        c *= (0.84 + 0.26 * h) * mix(0.62, 1.0, smoothstep(0.0, 0.06, min(fz, 1.0 - fz)))
           * mix(0.7, 1.0, smoothstep(0.0, 0.012, min(fx, 1.0 - fx)));
      }
      gl_FragColor = vec4(finish(c, N, vE), 1.0);
    }`;

  // Books. vT says which face: 0 the spines, 1 the tops (page edges), 2 a
  // whole bookcase drawn flat (for the ones too far off to need depth).
  const BOOK_FRAG = LIGHT + `
    uniform sampler2D uSeeds;
    uniform vec4 uHole;    // the book that's out: (bookcase, floor, slot, on)
    uniform vec4 uHole2;   // the book you're carrying
    uniform vec4 uHover;   // the book under the pointer
    vec3 binding(float i) {
      if (i < 0.5) return vec3(0.38, 0.19, 0.15);
      if (i < 1.5) return vec3(0.3, 0.21, 0.15);
      if (i < 2.5) return vec3(0.21, 0.24, 0.18);
      if (i < 3.5) return vec3(0.19, 0.2, 0.27);
      if (i < 4.5) return vec3(0.34, 0.15, 0.125);
      return vec3(0.25, 0.2, 0.16);
    }
    float isBook(vec4 h, float caseIdx, float fl, float slot, float far) {
      return h.w * (1.0 - far) * step(abs(h.x - caseIdx) + abs(h.y - fl) + abs(h.z - slot), 0.5);
    }
    void main() {
      vec3 N = normalize(vN);
      float far = step(MID, vW.z);
      float fl = floor((vW.y + 0.02) / FLOOR_H);
      float ly = vW.y - fl * FLOOR_H;
      float mi = floor(vW.x / MOD);
      float xm = vW.x - mi * MOD;
      if (xm >= RUN) discard;
      float bay = min(floor(xm / BAY), BAYS - 1.0);
      float bx = xm - bay * BAY;
      float row = clamp(floor((ly - ROW0) / ROW_P), 0.0, 4.0);
      float yin = ly - ROW0 - row * ROW_P;
      float u = (bx - POST * 0.5) / BOOK_W;
      float vol = clamp(floor(u), 0.0, 18.0);
      float fu = clamp(u - vol, 0.0, 1.0);
      // this bookcase's seed, dealt from its floor and section number
      float caseIdx = (mi + MODS) * BAYS + bay;
      vec2 suv = vec2((caseIdx + 0.5) / SEED_W, ((fl + FLOORS) * 2.0 + far + 0.5) / SEED_H);
      vec3 seed = floor(texture2D(uSeeds, suv).rgb * 255.0 + 0.5);
      float slot = (4.0 - row) * 19.0 + mix(vol, 18.0 - vol, far);
      float h = imod(seed.r * 31.0 + slot * 17.0 + seed.g, 251.0);
      h = imod(h * h + seed.b, 251.0);
      float h2 = imod(h * 113.0 + slot * slot + seed.r, 251.0);
      vec3 book = binding(imod(h, 6.0)) * (0.86 + imod(h2, 8.0) * 0.04);
      float bands = imod(floor(h2 / 8.0), 4.0);
      float gone = max(isBook(uHole, caseIdx, fl, slot, far), isBook(uHole2, caseIdx, fl, slot, far));
      float hover = isBook(uHover, caseIdx, fl, slot, far);

      float aa = fwidth(u);
      float t = clamp(yin / BOOK_H, 0.0, 1.0);
      float round = 0.66 + 0.34 * sin(3.14159 * fu);
      float edge = smoothstep(0.0, 0.07 + aa, fu) * smoothstep(0.0, 0.07 + aa, 1.0 - fu);
      vec3 spine = book * round * mix(0.4, 1.0, edge);
      float band = step(abs(t - 0.86), 0.013) + step(1.5, bands) * step(abs(t - 0.14), 0.013) + step(2.5, bands) * step(abs(t - 0.8), 0.008);
      spine = mix(spine, vec3(0.5, 0.4, 0.25) * round, 0.5 * step(0.5, bands) * min(band, 1.0));
      spine = mix(spine, vec3(0.24, 0.18, 0.145), clamp(aa * 1.4 - 0.3, 0.0, 1.0));   // too small to make out: their average
      vec3 hole = vec3(0.02, 0.016, 0.013);
      vec3 col;
      if (vT < 0.5) {
        col = mix(spine, hole, gone);
      } else if (vT < 1.5) {
        float depth = clamp((SPINE_Z - mix(vW.z, CHASM - vW.z, far)) / BOOK_D, 0.0, 1.0);
        float e2 = smoothstep(0.0, 0.16 + aa, fu) * smoothstep(0.0, 0.16 + aa, 1.0 - fu);
        col = mix(book * 0.8, vec3(0.58, 0.52, 0.41), e2 * step(0.05, depth)) * (1.0 - 0.55 * depth);
        col = mix(col, hole, gone);
      } else {
        vec3 wood = vec3(0.26, 0.18, 0.12);
        float dy = fwidth(ly), dx = fwidth(bx);
        float bookPart = (1.0 - smoothstep(BOOK_H - dy, BOOK_H + dy, yin)) * step(0.0, yin);
        col = mix(vec3(0.03, 0.024, 0.02), mix(spine, hole, gone), bookPart);
        float nextBoard = ROW0 + (row + 1.0) * ROW_P - BOARD;
        float onBoard = max(1.0 - smoothstep(-dy, dy, yin), smoothstep(nextBoard - dy, nextBoard + dy, ly));
        col = mix(col, wood * 1.2, onBoard);
        col = mix(col, wood, 1.0 - smoothstep(POST * 0.5 - dx, POST * 0.5 + dx, min(bx, BAY - bx)));
        if (ly < ROW0 - BOARD) col = wood * 0.7;
        if (ly > ROW0 + 5.0 * ROW_P) col = wood * 1.1;
      }
      col += hover * vec3(0.16, 0.11, 0.05);
      gl_FragColor = vec4(finish(col, N, hover * 0.5), 1.0);
    }`;

  // ==========================================================
  // RENDERER
  // ==========================================================
  const canvas = $('view');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 1.75));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(FOG);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 95);
  camera.rotation.order = 'YXZ';

  // which bookcase gets which books: one texel per bookcase in view
  const seedData = new Uint8Array(SEED_W * SEED_H * 4);
  const seedTex = new THREE.DataTexture(seedData, SEED_W, SEED_H, THREE.RGBAFormat);
  seedTex.magFilter = seedTex.minFilter = THREE.NearestFilter;
  seedTex.generateMipmaps = false;

  const U = {
    uLight: { value: 1 }, uFog: { value: FOG }, uFogD: { value: 0.03 }, uSeeds: { value: seedTex },
    uHole: { value: new THREE.Vector4() }, uHole2: { value: new THREE.Vector4() }, uHover: { value: new THREE.Vector4() },
  };
  const solidMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: SOLID_FRAG, vertexColors: true });
  const bookMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: VERT, fragmentShader: BOOK_FRAG, vertexColors: true,
    extensions: { derivatives: true } });

  // ==========================================================
  // THE PIECES
  // ==========================================================
  function pendant(g, x, y, z) {
    g.box(x - 0.008, y + 0.14, z - 0.008, x + 0.008, CEIL, z + 0.008, C.iron, { skip: '+y' });
    g.box(x - 0.17, y + 0.05, z - 0.17, x + 0.17, y + 0.16, z + 0.17, C.iron, { skip: '-y' });
    g.box(x - 0.1, y - 0.05, z - 0.1, x + 0.1, y + 0.05, z + 0.1, C.lamp, { e: 2.4 });
  }
  // one floor's stretch of gallery: the walkway, the wall above the
  // bookcases, the railing on the chasm, the lamps
  function galleryGeo() {
    const g = new Geo();
    g.box(0, -SLAB, FRONT, MOD, 0, 0, C.slabEdge, { skip: '-z +x -x', top: C.floor, ttop: 1, bottom: C.ceiling });
    g.quad([0, CASE_H, FRONT], [RUN, CASE_H, FRONT], [RUN, CEIL, FRONT], [0, CEIL, FRONT], [0, 0, 1], C.plaster);
    for (let x = 0.31; x < MOD; x += 2 * BAY) g.box(x - 0.022, 0, -0.09, x + 0.022, 1.0, -0.046, C.rail, { skip: '-y' });
    g.box(0, 1.0, -0.115, MOD, 1.055, -0.02, C.rail, { skip: '+x -x' });
    g.box(0, 0.5, -0.084, MOD, 0.52, -0.052, C.rail, { skip: '+x -x' });
    g.box(0, 0, -0.09, MOD, 0.06, -0.046, C.rail, { skip: '+x -x -y' });
    for (let i = 0; i < 10; i++) {
      const x = (4 * i + 2) * BAY;
      g.box(x - 0.05, LAMP_Y - 0.13, FRONT, x + 0.05, LAMP_Y + 0.13, FRONT + 0.02, C.iron, { skip: '-z' });
      g.box(x - 0.012, LAMP_Y - 0.012, FRONT + 0.02, x + 0.012, LAMP_Y + 0.012, FRONT + 0.08, C.iron, { skip: '-z' });
      g.box(x - 0.065, LAMP_Y - 0.07, FRONT + 0.07, x + 0.065, LAMP_Y + 0.07, FRONT + 0.2, C.lamp, { e: 2.2 });
    }
    pendant(g, RUN + REST / 2, LAMP_Y + 0.15, FRONT + 0.6);
    return g;
  }
  // one floor of a rest area
  function restGeo() {
    const g = new Geo();
    const x0 = RUN, x1 = MOD;
    // the floor, with the stairwell cut through it
    const shape = new THREE.Shape();
    shape.moveTo(x0, BACK); shape.lineTo(x1, BACK); shape.lineTo(x1, FRONT); shape.lineTo(x0, FRONT); shape.lineTo(x0, BACK);
    const hole = new THREE.Path();
    hole.absarc(WELL_X, WELL_Z, WELL_R, 0, Math.PI * 2, false);
    shape.holes.push(hole);
    const sg = new THREE.ShapeGeometry(shape, 28);
    g.shape(sg, 0, [0, 1, 0], C.floor, 1);
    g.shape(sg, -SLAB, [0, -1, 0], C.ceiling);
    sg.dispose();
    g.cyl(WELL_X, WELL_Z, -SLAB, 0, WELL_R, 28, C.slabEdge, true);
    // walls, with dark panelling along the bottom
    g.quad([x0, 0, FRONT], [x0, CEIL, FRONT], [x0, CEIL, BACK], [x0, 0, BACK], [1, 0, 0], C.plaster);
    g.quad([x1, 0, FRONT], [x1, CEIL, FRONT], [x1, CEIL, BACK], [x1, 0, BACK], [-1, 0, 0], C.plaster);
    g.quad([x0, 0, BACK], [x1, 0, BACK], [x1, CEIL, BACK], [x0, CEIL, BACK], [0, 0, 1], C.plaster);
    g.box(x0, 0, BACK, x0 + 0.025, 0.95, FRONT, C.woodDark, { skip: '-x -y' });
    g.box(x1 - 0.025, 0, BACK, x1, 0.95, FRONT, C.woodDark, { skip: '+x -y' });
    g.box(x0, 0, BACK, x1, 0.95, BACK + 0.025, C.woodDark, { skip: '-z -y +x -x' });
    // the spiral stair: a column through every floor, and one full turn of
    // treads from this floor to the next
    g.cyl(WELL_X, WELL_Z, -SLAB, CEIL, 0.13, 14, C.iron);
    for (let i = 0; i < STEPS; i++) {
      const a0 = STAIR_A0 + i * STEP_A, top = (i + 1) * FLOOR_H / STEPS;
      g.wedge(WELL_X, WELL_Z, 0.12, WELL_R - 0.07, a0, a0 + STEP_A * 1.03, top - 0.06, top, C.stone);
    }
    // a handrail up the outside of the treads
    for (let i = 0; i < STEPS; i++) {
      const a = STAIR_A0 + (i + 0.5) * STEP_A, y = (i + 0.5) * FLOOR_H / STEPS + 0.95, r = WELL_R - 0.1;
      const c = [WELL_X + r * Math.cos(a), y, WELL_Z + r * Math.sin(a)];
      const tx = -Math.sin(a), tz = Math.cos(a), half = r * STEP_A / 2 * 1.06, rise = FLOOR_H / STEPS / 2;
      g.obox(c, [tx * half, rise, tz * half], [0, 0.022, 0], [Math.cos(a) * 0.022, 0, Math.sin(a) * 0.022], C.rail);
      if (i % 2 === 0) g.box(c[0] - 0.012, y - 0.95, c[2] - 0.012, c[0] + 0.012, y, c[2] + 0.012, C.rail, { skip: '-y +y' });
    }
    // railing round the stairwell, open where the stair meets the floor
    const ringR = WELL_R + 0.05, segs = 14, ringA0 = STAIR_A0 + STEP_A * 1.1, ringA1 = STAIR_A0 + Math.PI * 2 - STEP_A * 1.1;
    for (let i = 0; i < segs; i++) {
      const a = ringA0 + (i + 0.5) * (ringA1 - ringA0) / segs, half = ringR * (ringA1 - ringA0) / segs / 2 * 1.04;
      const c = [WELL_X + ringR * Math.cos(a), 1.0, WELL_Z + ringR * Math.sin(a)];
      g.obox(c, [-Math.sin(a) * half, 0, Math.cos(a) * half], [0, 0.028, 0], [Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035], C.rail);
    }
    for (let i = 0; i <= segs; i += 2) {
      const a = ringA0 + i * (ringA1 - ringA0) / segs, x = WELL_X + ringR * Math.cos(a), z = WELL_Z + ringR * Math.sin(a);
      g.box(x - 0.02, 0, z - 0.02, x + 0.02, 1.0, z + 0.02, C.rail, { skip: '-y +y' });
    }
    // beds along the left wall
    for (const z of BEDS_Z) {
      g.box(x0 + 0.025, 0, z - 0.47, x0 + 0.09, 0.95, z + 0.47, C.woodDark, { skip: '-y' });
      g.box(x0 + 0.09, 0.1, z - 0.45, x0 + 2.05, 0.4, z + 0.45, C.wood, { skip: '-y' });
      for (const lz of [-0.4, 0.4]) g.box(x0 + 1.96, 0, z + lz - 0.04, x0 + 2.04, 0.1, z + lz + 0.04, C.woodDark, { skip: '-y +y' });
      g.box(x0 + 0.11, 0.4, z - 0.42, x0 + 2.02, 0.54, z + 0.42, C.sheet, { skip: '-y' });
      g.box(x0 + 0.16, 0.54, z - 0.3, x0 + 0.56, 0.64, z + 0.3, C.pillow, { skip: '-y' });
      g.box(x0 + 0.75, 0.54, z - 0.44, x0 + 2.04, 0.58, z + 0.44, C.blanket, { skip: '-y' });
    }
    // the kiosk: a counter, and a lit hatch in the wall behind it
    g.box(KIOSK_X0, 0, BACK, KIOSK_X1, 1.0, BACK + 0.6, C.wood, { skip: '-z -y' });
    g.box(KIOSK_X0 - 0.05, 1.0, BACK, KIOSK_X1 + 0.05, 1.05, BACK + 0.66, C.board, { skip: '-z' });
    g.quad([KIOSK_X0 + 0.3, 1.15, BACK + 0.012], [KIOSK_X1 - 0.3, 1.15, BACK + 0.012], [KIOSK_X1 - 0.3, 1.95, BACK + 0.012], [KIOSK_X0 + 0.3, 1.95, BACK + 0.012], [0, 0, 1], C.hatch, 0.55);
    g.box(KIOSK_X0 + 0.2, 1.95, BACK, KIOSK_X1 - 0.2, 2.05, BACK + 0.06, C.woodDark, { skip: '-z' });
    g.box(KIOSK_X0 + 0.2, 1.1, BACK, KIOSK_X0 + 0.3, 2.05, BACK + 0.06, C.woodDark, { skip: '-z' });
    g.box(KIOSK_X1 - 0.3, 1.1, BACK, KIOSK_X1 - 0.2, 2.05, BACK + 0.06, C.woodDark, { skip: '-z' });
    // the slot: a brass plate with an opening the size of one book
    g.box(SLOT_X - 0.42, 0.95, BACK, SLOT_X + 0.42, 1.6, BACK + 0.03, C.brass, { skip: '-z' });
    g.box(SLOT_X - 0.26, 1.25, BACK + 0.03, SLOT_X + 0.26, 1.31, BACK + 0.04, C.black, { skip: '-z' });
    // the bathroom door
    g.box(x1 - 0.05, 0, DOOR_Z0, x1, 2.1, DOOR_Z1, C.woodDark, { skip: '+x -y' });
    g.box(x1 - 0.1, 1.0, DOOR_Z1 + 0.12, x1 - 0.05, 1.05, DOOR_Z1 + 0.2, C.brass);
    for (const l of ALC_LAMPS) pendant(g, l[0], l[1], l[2]);
    return g;
  }
  // our side's bookcases in full, for the floors you can reach
  function caseFrameGeo() {
    const g = new Geo();
    const zb = FRONT - CASE_D;
    for (let j = 0; j <= BAYS; j++) g.box(j * BAY - POST / 2, 0, zb, j * BAY + POST / 2, CASE_H, FRONT + 0.006, C.wood, { skip: '-z -y' });
    for (let k = 0; k <= 5; k++) {
      const y = ROW0 + k * ROW_P;
      g.box(0, y - BOARD, zb, RUN, y, FRONT, C.board, { skip: '-z +x -x' });
    }
    g.box(0, 0, zb, RUN, ROW0 - BOARD, FRONT + 0.012, C.woodDark, { skip: '-z +x -x -y' });
    g.box(0, ROW0 + 5 * ROW_P, zb, RUN, CASE_H - 0.05, FRONT + 0.025, C.wood, { skip: '-z +x -x' });
    g.box(0, CASE_H - 0.05, zb, RUN, CASE_H, FRONT + 0.05, C.board, { skip: '-z +x -x' });
    g.quad([0, ROW0 - BOARD, zb], [RUN, ROW0 - BOARD, zb], [RUN, ROW0 + 5 * ROW_P, zb], [0, ROW0 + 5 * ROW_P, zb], [0, 0, 1], C.back);
    return g;
  }
  function caseBooksGeo() {
    const g = new Geo(), w = [1, 1, 1];
    for (let r = 0; r < 5; r++) {
      const y0 = ROW0 + r * ROW_P, y1 = y0 + BOOK_H;
      g.quad([0, y0, SPINE_Z], [RUN, y0, SPINE_Z], [RUN, y1, SPINE_Z], [0, y1, SPINE_Z], [0, 0, 1], w, 0, 0);
      g.quad([0, y1, SPINE_Z - BOOK_D], [RUN, y1, SPINE_Z - BOOK_D], [RUN, y1, SPINE_Z], [0, y1, SPINE_Z], [0, 1, 0], w, 0, 1);
    }
    return g;
  }
  // every other bookcase in view, drawn flat
  function facadeGeo() {
    const g = new Geo(), w = [1, 1, 1], zf = CHASM - FRONT;
    for (let f = -FLOORS; f <= FLOORS; f++) for (let m = -MODS; m <= MODS; m++) {
      const x0 = m * MOD, x1 = x0 + RUN, y0 = f * FLOOR_H, y1 = y0 + CASE_H;
      if (Math.abs(f) > 1) g.quad([x0, y0, FRONT], [x1, y0, FRONT], [x1, y1, FRONT], [x0, y1, FRONT], [0, 0, 1], w, 0, 2);
      g.quad([x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf], [0, 0, -1], w, 0, 2);
    }
    return g;
  }
  // the glow round every lamp in view
  function glowPoints() {
    const pos = [], size = [];
    const lamps = [];
    for (let i = 0; i < 10; i++) lamps.push([(4 * i + 2) * BAY, LAMP_Y, FRONT + 0.15, 0.75]);
    lamps.push([RUN + REST / 2, LAMP_Y + 0.15, FRONT + 0.6, 1.0]);
    for (const l of ALC_LAMPS) lamps.push([l[0], l[1], l[2], 0.9]);
    for (let f = -FLOORS; f <= FLOORS; f++) for (let m = -MODS; m <= MODS; m++) for (const far of [0, 1]) for (const l of lamps) {
      pos.push(m * MOD + l[0], f * FLOOR_H + l[1], far ? CHASM - l[2] : l[2]);
      size.push(l[3]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    return g;
  }
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uLight: U.uLight, uFogD: U.uFogD },
    vertexShader: `
      attribute float aSize;
      uniform float uScale;
      uniform float uFogD;
      varying float vA;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float d = max(-mv.z, 0.1);
        gl_PointSize = min(aSize * uScale / d, 160.0);
        vec3 dv = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition;
        float fd = length(vec3(dv.x, dv.y * 1.6, dv.z));
        vA = exp(-fd * fd * uFogD * uFogD) * smoothstep(0.4, 1.6, d);
      }`,
    fragmentShader: `
      uniform float uLight;
      varying float vA;
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r = dot(q, q);
        if (r > 1.0) discard;
        float a = (exp(-r * 5.0) - 0.0067) * vA * uLight;
        gl_FragColor = vec4(vec3(1.0, 0.7, 0.42) * a * 0.55, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  function instanced(geo, mat, floors) {
    const n = (2 * floors + 1) * (2 * MODS + 1);
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let f = -floors; f <= floors; f++) for (let k = -MODS; k <= MODS; k++) mesh.setMatrixAt(i++, m.makeTranslation(k * MOD, f * FLOOR_H, 0));
    mesh.frustumCulled = false;   // the instances spread far beyond the one piece's bounds
    scene.add(mesh);
    return mesh;
  }
  function buildWorld() {
    const gallery = galleryGeo(), rest = restGeo();
    instanced(gallery.build(), solidMat, FLOORS);
    instanced(gallery.mirrored().build(), solidMat, FLOORS);
    instanced(rest.build(), solidMat, FLOORS);
    instanced(rest.mirrored().build(), solidMat, FLOORS);
    instanced(caseFrameGeo().build(), solidMat, 1);
    instanced(caseBooksGeo().build(), bookMat, 1);
    const facade = new THREE.Mesh(facadeGeo().build(), bookMat);
    facade.frustumCulled = false;
    scene.add(facade);
    const glows = new THREE.Points(glowPoints(), glowMat);
    glows.frustumCulled = false;
    scene.add(glows);
  }

  // ==========================================================
  // WHERE YOU ARE. `here` is an address with the slot left at 0: its
  // section is the first bookcase of the stretch of gallery you're in (on
  // your side), its floor is your floor. Sections pair up across the
  // chasm: yours all have one parity, the ones opposite the other.
  // ==========================================================
  const here = new Uint8Array(B.LEN);
  let parity = 0;
  let sMod = 0, fMod = 0, sDec = 0, fDec = 0, sLen = 0, fLen = 0;
  function measure() {
    sMod = B.modOf(here, B.S_FROM, B.S_DIGITS, PRIME);
    fMod = B.modOf(here, B.F_FROM, B.F_DIGITS, PRIME);
    sDec = B.modOf(here, B.S_FROM, B.S_DIGITS, 1e6);
    fDec = B.modOf(here, B.F_FROM, B.F_DIGITS, 1e6);
    sLen = B.decimalLength(here, B.S_FROM, B.S_DIGITS);
    fLen = B.decimalLength(here, B.F_FROM, B.F_DIGITS);
  }
  function shiftSections(d) {
    B.addSmall(here, B.S_FROM, B.S_DIGITS, d);
    sMod = posMod(sMod + d, PRIME); sDec = posMod(sDec + d, 1e6);
  }
  function shiftFloors(d) {
    B.addSmall(here, B.F_FROM, B.F_DIGITS, d);
    fMod = posMod(fMod + d, PRIME); fDec = posMod(fDec + d, 1e6);
  }
  function caseHash(fm, sm) {
    let h = Math.imul(fm ^ 0x5bd1e995, 0x9e3779b1) ^ Math.imul(sm + 0x7f4a7c15, 0x85ebca77);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return h >>> 0;
  }
  function fillSeeds() {
    const across = parity === 0 ? 1 : -1;
    for (let f = -FLOORS; f <= FLOORS; f++) {
      const fm = posMod(fMod + f, PRIME);
      for (let side = 0; side < 2; side++) {
        const row = (f + FLOORS) * 2 + side;
        for (let c = 0; c < SEED_W; c++) {
          const sm = posMod(sMod + 2 * (c - MODS * BAYS) + (side ? across : 0), PRIME);
          const h = caseHash(fm, sm), o = (row * SEED_W + c) * 4;
          seedData[o] = h & 255; seedData[o + 1] = (h >>> 8) & 255; seedData[o + 2] = (h >>> 16) & 255; seedData[o + 3] = 255;
        }
      }
    }
    seedTex.needsUpdate = true;
  }
  function bookTone(rel) {
    const o = (((rel.fl + FLOORS) * 2) * SEED_W + (rel.mi + MODS) * BAYS + rel.bay) * 4;
    const r = seedData[o], g = seedData[o + 1], b = seedData[o + 2];
    let h = (r * 31 + rel.slot * 17 + g) % 251;
    h = (h * h + b) % 251;
    const h2 = (h * 113 + rel.slot * rel.slot + r) % 251;
    const k = 0.86 + (h2 % 8) * 0.04;
    return BINDINGS[h % 6].map(v => v * k);
  }

  // the player
  const pos = new THREE.Vector3(10, EYE, -1.2);
  let yaw = 0, pitch = 0;
  let mode = 'loading';         // loading, descent, intro, walk, reader, dialog, stairs, fall, sleep, exit
  let day = 1, booksOpened = 0;
  let exitAddr = null;
  let reading = null;           // the book open in your hands
  let carried = null;           // the book you're taking somewhere

  // the books we're keeping track of move when the world shifts under them
  function moveRel(dm, df) {
    for (const b of [reading, carried]) if (b) { b.rel.mi += dm; b.rel.fl += df; }
    refreshBooks();
  }
  function setHole(u, rel) {
    const ok = rel && Math.abs(rel.mi) <= MODS && Math.abs(rel.fl) <= FLOORS;
    if (ok) u.value.set((rel.mi + MODS) * BAYS + rel.bay, rel.fl, rel.slot, 1);
    else u.value.set(0, 0, 0, 0);
  }
  function refreshBooks() {
    setHole(U.uHole, reading && !reading.taken ? reading.rel : null);
    setHole(U.uHole2, carried ? carried.rel : null);
    if (reading && bookMesh.visible) placeBookMesh(reading.rel);
  }
  function walkedModules(n) {
    shiftSections(2 * BAYS * n);
    moveRel(-n, 0);
    fillSeeds();
  }
  function changedFloors(n) {
    if (!n) return;
    shiftFloors(n);
    moveRel(0, -n);
    fillSeeds();
  }
  // a path that runs through floors: keep the camera within one floor's
  // height and move the floor number instead
  function onPath(pathY, track) {
    const fy = Math.floor(pathY / FLOOR_H);
    if (fy !== track.applied) { changedFloors(fy - track.applied); track.applied = fy; }
    return pathY - fy * FLOOR_H;
  }

  // ==========================================================
  // THE BOOK THAT LETS YOU OUT, AND WHERE YOU START
  // ==========================================================
  let worker = null, nextId = 1;
  const pending = new Map();
  function startWorker() {
    return new Promise(resolve => {
      const fallback = () => { worker = null; if (!exitAddr) exitAddr = B.exitAddress(); resolve(); };
      try {
        worker = new Worker('worker.js');
        worker.onmessage = e => {
          const m = e.data;
          if (m.type === 'init') { exitAddr = m.exit; resolve(); }
          else if (m.type === 'open') { const cb = pending.get(m.id); pending.delete(m.id); if (cb) cb(m); }
        };
        worker.onerror = () => {
          fallback();
          for (const [id, cb] of pending) { pending.delete(id); cb(null); }
        };
        worker.postMessage({ type: 'init' });
      } catch (err) { fallback(); }
    });
  }
  function bookText(addr) {
    return new Promise(resolve => {
      const local = () => resolve({ text: B.textOf(addr), isExit: B.sameBook(addr, exitAddr) });
      if (!worker) { setTimeout(local, 30); return; }
      const id = nextId++;
      pending.set(id, m => (m ? resolve(m) : local()));
      worker.postMessage({ type: 'open', id, address: addr });
    });
  }
  function chooseStart() {
    here.set(B.randomAddress());
    here[0] = 0;
    // the book that lets you out is on your side of the chasm
    parity = B.modOf(exitAddr, B.S_FROM, B.S_DIGITS, 2);
    // line the first bookcase up with the rest areas: sections come in
    // pairs (ours and the one opposite), 40 pairs to a stretch of gallery
    const off = B.modOf(here, B.S_FROM, B.S_DIGITS, 2 * BAYS);
    B.addSmall(here, B.S_FROM, B.S_DIGITS, parity - off);
    measure();
    fillSeeds();
  }

  // ==========================================================
  // UI
  // ==========================================================
  const hud = $('hud'), leaveBtn = $('leave'), hintEl = $('hint'), tipEl = $('tip'), toastEl = $('toast'), carryEl = $('carry');
  const dialogEl = $('dialog'), dialogText = $('dialog-text'), dialogForm = $('dialog-form'), dialogInput = $('dialog-input'), dialogButtons = $('dialog-buttons');
  const readerEl = $('reader'), whereEl = $('reader-where'), pageEl = $('page'), rangeEl = $('page-range'), pageNoEl = $('page-no'), takeBtn = $('take');
  const introEl = $('intro'), fadeEl = $('fade'), stickEl = $('stick'), knobEl = $('knob');

  function sectionAt(x) {
    const m = Math.floor(x / MOD), xm = x - m * MOD;
    if (xm >= RUN) return null;
    return posMod(sDec + 2 * (m * BAYS + Math.floor(xm / BAY)), 1e6);
  }
  let hudKey = '';
  function updateHud() {
    const sec = sectionAt(pos.x);
    const key = fDec + '|' + sec + '|' + day + '|' + booksOpened;
    if (key === hudKey) return;
    hudKey = key;
    $('hud-floor').textContent = '…' + pad6(fDec);
    $('hud-floor-d').textContent = commas(fLen) + ' digits';
    $('hud-section').textContent = sec === null ? 'rest area' : '…' + pad6(sec);
    $('hud-section-d').textContent = sec === null ? '' : commas(sLen) + ' digits';
    $('hud-meta').textContent = `Day ${day} · ${booksOpened} ${booksOpened === 1 ? 'book' : 'books'} opened`;
  }
  let toastTimer = 0;
  function toast(text, ms = 4200) {
    toastEl.textContent = text;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), ms);
  }
  let hintTimer = 0;
  function hint(text, ms = 12000) {
    hintEl.textContent = text;
    hintEl.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove('on'), ms);
  }
  function fadeTo(opacity, ms, white = false) {
    fadeEl.classList.toggle('white', white);
    fadeEl.style.transitionDuration = ms + 'ms';
    fadeEl.style.opacity = String(opacity);
    return wait(ms);
  }
  // a question with a few answers
  let dialogKeepsMode = false, modeBeforeDialog = 'walk';
  function dialog(text, buttons, opts = {}) {
    dialogText.textContent = text;
    dialogForm.hidden = !opts.input;
    if (opts.input) { dialogInput.value = ''; dialogInput.placeholder = opts.input; }
    dialogButtons.textContent = '';
    for (const b of buttons) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'btn' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.addEventListener('click', b.run);
      dialogButtons.appendChild(el);
    }
    dialogEl.hidden = false;
    dialogKeepsMode = !!opts.keepMode;
    if (!dialogKeepsMode && mode !== 'dialog') { modeBeforeDialog = mode; mode = 'dialog'; }
    clearKeys();
    // (a dialog that leaves you moving doesn't take the keys away)
    if (!dialogKeepsMode) setTimeout(() => { if (!dialogEl.hidden) (opts.input ? dialogInput : dialogButtons.firstChild).focus({ preventScroll: true }); }, 30);
  }
  function closeDialog() {
    if (dialogEl.hidden) return;
    dialogEl.hidden = true;
    if (!dialogKeepsMode && mode === 'dialog') mode = modeBeforeDialog === 'dialog' ? 'walk' : modeBeforeDialog;
    canvas.focus({ preventScroll: true });
  }
  dialogForm.addEventListener('submit', e => { e.preventDefault(); const b = dialogButtons.querySelector('.primary'); if (b) b.click(); });

  // ---------- reading ----------
  const bookMesh = new THREE.Mesh(new THREE.BufferGeometry(), solidMat);
  bookMesh.visible = false;
  scene.add(bookMesh);
  let bookOut = 0, bookOutTarget = 0;
  function bookSpot(rel) {
    const row = 4 - Math.floor(rel.slot / 19), vol = rel.slot % 19;
    return new THREE.Vector3(rel.mi * MOD + rel.bay * BAY + POST / 2 + (vol + 0.5) * BOOK_W,
      rel.fl * FLOOR_H + ROW0 + row * ROW_P + BOOK_H / 2, SPINE_Z - BOOK_D / 2);
  }
  function placeBookMesh(rel) { bookMesh.position.copy(bookSpot(rel)); bookMesh.position.z += bookOut; }
  function showBookMesh(rel) {
    const tone = bookTone(rel), g = new Geo(), w = BOOK_W * 0.48, h = BOOK_H / 2, d = BOOK_D / 2;
    g.box(-w, -h, -d, w, h, d, tone, { top: [0.58, 0.52, 0.41] });
    bookMesh.geometry.dispose();
    bookMesh.geometry = g.build();
    bookOut = 0; bookOutTarget = 0.17;
    placeBookMesh(rel);
    bookMesh.visible = true;
  }
  function describeBook(rel) {
    const shelf = Math.floor(rel.slot / 19) + 1, volume = rel.slot % 19 + 1;
    const floor = posMod(fDec + rel.fl, 1e6), section = posMod(sDec + 2 * (rel.mi * BAYS + rel.bay), 1e6);
    return { shelf, volume, line: `Floor …${pad6(floor)} · Section …${pad6(section)} · Shelf ${shelf} of 5 · Volume ${volume} of 19`,
      short: `Shelf ${shelf}, volume ${volume}`, floor, section };
  }
  function pullBook(hit) {
    const rel = { mi: hit.mi, bay: hit.bay, fl: 0, slot: hit.slot };
    // the empty slot of the book you're carrying: put it back
    if (carried && carried.rel.mi === rel.mi && carried.rel.bay === rel.bay && carried.rel.fl === 0 && carried.rel.slot === rel.slot) {
      carried = null; refreshBooks(); updateCarry();
      toast('You put the book back.');
      return;
    }
    const addr = here.slice();
    B.addSmall(addr, B.S_FROM, B.S_DIGITS, 2 * (rel.mi * BAYS + rel.bay));
    addr[0] = rel.slot;
    reading = { addr, rel, info: describeBook(rel), text: null, page: 0, taken: false, isExit: false };
    booksOpened++;
    refreshBooks();
    showBookMesh(rel);
    openReader();
    const book = reading;
    bookText(addr).then(r => {
      if (reading !== book) return;
      book.text = r.text; book.isExit = r.isExit;
      renderPage();
    });
  }
  function openReader() {
    mode = 'reader';
    clearKeys();
    hideTip();
    whereEl.textContent = reading.info.line;
    takeBtn.textContent = 'Take this book';
    readerEl.hidden = false;
    sizeReader();
    renderPage();
    pageEl.focus({ preventScroll: true });
  }
  function renderPage() {
    if (!reading) return;
    const ready = !!reading.text;
    pageEl.classList.toggle('wait', !ready);
    pageEl.textContent = ready ? B.pageText(reading.text, reading.page) : 'Opening the book…';
    pageNoEl.textContent = `Page ${reading.page + 1} of ${B.PAGES}`;
    rangeEl.value = String(reading.page + 1);
    rangeEl.disabled = !ready;
    pageEl.scrollTop = 0;
  }
  function turn(d) {
    if (!reading || !reading.text) return;
    reading.page = clamp(reading.page + d, 0, B.PAGES - 1);
    renderPage();
  }
  function closeReader() {
    if (readerEl.hidden) return;
    readerEl.hidden = true;
    if (reading && !reading.taken) bookOutTarget = 0;   // slides back in
    else { bookMesh.visible = false; reading = null; refreshBooks(); }
    mode = 'walk';
    canvas.focus({ preventScroll: true });
  }
  function takeBook() {
    if (!reading) return;
    if (carried) toast('The book you were carrying is back on its shelf.');
    carried = { addr: reading.addr, rel: reading.rel, info: reading.info };
    reading.taken = true;
    updateCarry();
    closeReader();
  }
  function updateCarry() {
    carryEl.hidden = !carried;
    if (!carried) return;
    carryEl.textContent = '';
    const b = document.createElement('b');
    b.textContent = 'Carrying a book';
    const m = document.createElement('div');
    m.className = 'm';
    m.textContent = carried.info.line.replace(' · Shelf', '\nShelf').split('\n')[0];
    const s = document.createElement('div');
    s.className = 'm';
    s.textContent = carried.info.short + ' · put it through the slot at a rest area';
    carryEl.append(b, m, s);
  }
  // as big as fits: 80 columns across, and all 40 lines if there's room
  function sizeReader() {
    const bars = [...readerEl.querySelectorAll('.bar')].reduce((h, el) => h + el.offsetHeight, 0) || 110;
    const byW = (Math.min(innerWidth - 24, 1000) - 40) / (B.COLS * 0.6);
    const byH = (innerHeight - 24 - bars - 30) / (B.LINES * 1.3);
    pageEl.style.fontSize = Math.max(5.5, Math.min(15, byW, Math.max(byH, 8))).toFixed(2) + 'px';
  }
  $('reader-close').addEventListener('click', closeReader);
  $('prev').addEventListener('click', () => turn(-1));
  $('next').addEventListener('click', () => turn(1));
  rangeEl.addEventListener('input', () => { if (reading && reading.text) { reading.page = clamp(+rangeEl.value - 1, 0, B.PAGES - 1); renderPage(); } });
  takeBtn.addEventListener('click', takeBook);
  readerEl.addEventListener('pointerdown', e => { if (e.target === readerEl) closeReader(); });

  // ---------- the things in a rest area ----------
  function askRailing() {
    dialog('Climb over the railing?', [
      { label: 'Jump', primary: true, run: jump },
      { label: 'Stay', run: closeDialog },
    ]);
  }
  function askStairs(again) {
    dialog(again ? `Floor …${pad6(fDec)}.` : 'Spiral stairs, one full turn to each floor. Walk round them yourself, or:', [
      { label: 'Up a floor', primary: true, run: () => climb(1) },
      { label: 'Down a floor', run: () => climb(-1) },
      { label: 'Done', run: closeDialog },
    ]);
  }
  function askKiosk() {
    dialog('The kiosk serves any food you ask for.', [
      { label: 'Ask', primary: true, run: () => {
        const food = dialogInput.value.trim();
        if (!food) { dialogInput.focus(); return; }
        closeDialog();
        toast(`${food.charAt(0).toUpperCase() + food.slice(1)} comes out of the hatch.`);
      } },
      { label: 'Not now', run: closeDialog },
    ], { input: 'Name a food' });
  }
  function askBed() {
    dialog('A bed. The sheets are clean.', [
      { label: 'Sleep', primary: true, run: sleep },
      { label: 'Not now', run: closeDialog },
    ]);
  }
  function askSlot() {
    if (!carried) {
      dialog('A slot in the wall, the size of one book. Take a book from the shelves and bring it here.', [{ label: 'OK', primary: true, run: closeDialog }]);
      return;
    }
    dialog('Put the book through the slot?', [
      { label: 'Put it through', primary: true, run: submitBook },
      { label: 'Not yet', run: closeDialog },
    ]);
  }
  function submitBook() {
    closeDialog();
    const ok = !!exitAddr && B.sameBook(carried.addr, exitAddr);
    carried = null; refreshBooks(); updateCarry();
    if (ok) { getOut(); return; }
    toast('Nothing happens. The book is back on its shelf.');
  }
  function sleep() {
    closeDialog();
    mode = 'sleep';
    fadeTo(1, 900).then(() => { day++; updateHud(); return wait(900); })
      .then(() => { mode = 'walk'; toast(`Day ${day}.`, 2500); return fadeTo(0, 1200); });
  }

  // ==========================================================
  // PICKING: what's under a point on the screen
  // ==========================================================
  const REST_BOXES = [
    ...BEDS_Z.map(z => ({ b: [RUN, 0, z - 0.47, RUN + 2.05, 0.95, z + 0.47], kind: 'bed', reach: 3.4 })),
    { b: [KIOSK_X0 - 0.05, 0, BACK, KIOSK_X1 + 0.05, 2.05, BACK + 0.66], kind: 'kiosk', reach: 3.6 },
    { b: [SLOT_X - 0.42, 0.95, BACK, SLOT_X + 0.42, 1.6, BACK + 0.05], kind: 'slot', reach: 3.6 },
    { b: [WELL_X - WELL_R - 0.1, 0, WELL_Z - WELL_R - 0.1, WELL_X + WELL_R + 0.1, 3.4, WELL_Z + WELL_R + 0.1], kind: 'stairs', reach: 4.5 },
    { b: [MOD - 0.1, 0, DOOR_Z0, MOD, 2.1, DOOR_Z1], kind: 'door', reach: 3.6 },
    // walls: these only stop things being picked through them
    { b: [RUN - 0.4, 0, BACK - 0.2, RUN, CEIL, FRONT - 0.3], kind: 'wall', reach: 99 },
    { b: [MOD, 0, BACK - 0.2, MOD + 0.4, CEIL, FRONT - 0.3], kind: 'wall', reach: 99 },
    { b: [RUN, 0, BACK - 0.4, MOD, CEIL, BACK], kind: 'wall', reach: 99 },
  ];
  function rayBox(o, d, b, ox) {
    let tmin = 0, tmax = Infinity;
    const lo = [b[0] + ox, b[1], b[2]], hi = [b[3] + ox, b[4], b[5]], O = [o.x, o.y, o.z], D = [d.x, d.y, d.z];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(D[k]) < 1e-9) { if (O[k] < lo[k] || O[k] > hi[k]) return null; continue; }
      let t1 = (lo[k] - O[k]) / D[k], t2 = (hi[k] - O[k]) / D[k];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
    return tmin;
  }
  const raycaster = new THREE.Raycaster();
  function pickAt(ndcX, ndcY) {
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
    camera.updateMatrixWorld();
    raycaster.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    let best = null;
    const consider = h => { if (!best || h.t < best.t) best = h; };
    // a book on our side, on this floor
    if (o.z > FRONT && d.z < -1e-6) {
      const t = (SPINE_Z - o.z) / d.z;
      const x = o.x + d.x * t, y = o.y + d.y * t, mi = Math.floor(x / MOD), xm = x - mi * MOD;
      if (t > 0 && y > 0 && y < CASE_H && xm < RUN) {
        const bay = Math.min(BAYS - 1, Math.floor(xm / BAY)), bx = xm - bay * BAY;
        const row = Math.floor((y - ROW0) / ROW_P), yin = y - ROW0 - row * ROW_P, u = (bx - POST / 2) / BOOK_W;
        if (row >= 0 && row <= 4 && yin >= 0 && yin <= BOOK_H && u >= 0 && u < 19 && t < 3.3) {
          const vol = Math.floor(u);
          consider({ kind: 'book', t, mi, bay, row, vol, slot: (4 - row) * 19 + vol });
        } else consider({ kind: 'wall', t });
      }
    }
    // the railing
    if (d.z > 1e-6) {
      const t = (-0.07 - o.z) / d.z, y = o.y + d.y * t;
      if (t > 0 && t < 2.4 && y > 0.02 && y < 1.08) consider({ kind: 'railing', t });
    }
    // the rest areas either side
    const m0 = Math.floor(o.x / MOD);
    for (let m = m0 - 1; m <= m0 + 1; m++) for (const box of REST_BOXES) {
      const t = rayBox(o, d, box.b, m * MOD);
      if (t !== null && t < box.reach) consider({ kind: box.kind, t });
    }
    // the floor and ceiling stop the ray too
    if (d.y < -1e-6) { const t = -o.y / d.y; if (t > 0) consider({ kind: 'wall', t }); }
    if (d.y > 1e-6) { const t = (CEIL - o.y) / d.y; if (t > 0) consider({ kind: 'wall', t }); }
    return best && best.kind !== 'wall' ? best : null;
  }
  const LABELS = { railing: 'Climb over the railing', stairs: 'Spiral stairs', kiosk: 'Kiosk', bed: 'Bed', door: 'Bathroom' };
  function labelOf(hit) {
    if (hit.kind === 'book') return `Read · shelf ${Math.floor(hit.slot / 19) + 1}, volume ${hit.vol + 1}`;
    if (hit.kind === 'slot') return carried ? 'Put the book through the slot' : 'Slot';
    return LABELS[hit.kind];
  }
  function act(hit) {
    if (!hit || mode !== 'walk' || !body.ground) return;
    if (body.stairs && hit.kind !== 'stairs') return;
    hideTip();
    if (hit.kind === 'book') pullBook(hit);
    else if (hit.kind === 'railing') askRailing();
    else if (hit.kind === 'stairs') askStairs(false);
    else if (hit.kind === 'kiosk') askKiosk();
    else if (hit.kind === 'bed') askBed();
    else if (hit.kind === 'slot') askSlot();
    else if (hit.kind === 'door') toast('A bathroom.', 2200);
  }
  let hoverPt = null, hoverAt = 0;
  function hideTip() { tipEl.classList.remove('on'); canvas.classList.remove('pointing'); U.uHover.value.w = 0; }
  function updateHover(now) {
    if (!hoverPt || mode !== 'walk' || dragging || !body.ground || body.stairs) { if (mode !== 'walk' || !body.ground || body.stairs) hideTip(); return; }
    if (now - hoverAt < 90) return;
    hoverAt = now;
    const hit = pickAt(hoverPt.x / innerWidth * 2 - 1, -(hoverPt.y / innerHeight) * 2 + 1);
    if (!hit) { hideTip(); return; }
    tipEl.textContent = labelOf(hit);
    tipEl.style.transform = `translate(${Math.min(hoverPt.x + 16, innerWidth - tipEl.offsetWidth - 8)}px, ${hoverPt.y + 18}px)`;
    tipEl.classList.add('on');
    canvas.classList.add('pointing');
    if (hit.kind === 'book') U.uHover.value.set((hit.mi + MODS) * BAYS + hit.bay, 0, hit.slot, 1);
    else U.uHover.value.w = 0;
  }

  // ==========================================================
  // INPUT
  // ==========================================================
  const keys = { f: 0, b: 0, l: 0, r: 0, run: 0 };
  function clearKeys() { keys.f = keys.b = keys.l = keys.r = keys.run = 0; stick.dx = stick.dy = 0; }
  const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'run', ShiftRight: 'run' };
  window.addEventListener('keydown', e => {
    if (e.code === 'Escape') {
      if (mode === 'descent') skipDescent();
      else if (!readerEl.hidden) closeReader();
      else if (!dialogEl.hidden && !dialogKeepsMode) closeDialog();
      return;
    }
    if (!readerEl.hidden) {
      if (e.code === 'ArrowRight' || e.code === 'PageDown') { turn(1); e.preventDefault(); }
      else if (e.code === 'ArrowLeft' || e.code === 'PageUp') { turn(-1); e.preventDefault(); }
      return;
    }
    // typing in the kiosk, or using a dialog's buttons from the keyboard
    const inPanel = e.target && e.target.closest && e.target.closest('#dialog:not([hidden]), #intro:not([hidden])');
    if (e.target && (e.target.tagName === 'INPUT' || (inPanel && !dialogKeepsMode))) return;
    if (mode === 'intro' && (e.code === 'Enter' || e.code === 'Space')) { startWalking(); e.preventDefault(); return; }
    if (mode === 'descent' && (e.code === 'Enter' || e.code === 'Space')) { skipDescent(); e.preventDefault(); return; }
    if (mode !== 'walk') return;
    const k = KEYMAP[e.code];
    if (k) { keys[k] = 1; document.body.classList.add('keys'); e.preventDefault(); }
    if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) act(pickAt(0, 0));
    if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) jumpUp(); }
  });
  window.addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = 0; });
  window.addEventListener('blur', clearKeys);

  // mouse: drag to look, click to use. touch: the left of the screen is a
  // thumbstick, the rest drags to look, and a tap uses what's under it.
  const stick = { id: null, cx: 0, cy: 0, dx: 0, dy: 0 };
  const pointers = new Map();
  let dragging = false;
  const canLook = () => mode === 'walk' || mode === 'vault';
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    const role = e.pointerType !== 'mouse' && stick.id === null && e.clientX < innerWidth * 0.42 && mode === 'walk' ? 'stick' : 'look';
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), role, moved: false });
    if (role === 'stick') {
      stick.id = e.pointerId; stick.cx = e.clientX; stick.cy = e.clientY; stick.dx = stick.dy = 0;
      stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      knobEl.style.transform = '';
      stickEl.classList.add('on');
    }
  });
  canvas.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (e.pointerType === 'mouse') hoverPt = { x: e.clientX, y: e.clientY };
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > (e.pointerType === 'mouse' ? 5 : 10)) {
      p.moved = true;
      if (p.role === 'look' && e.pointerType === 'mouse') { dragging = true; canvas.classList.add('dragging'); hideTip(); }
    }
    if (p.role === 'stick') {
      let sx = (e.clientX - stick.cx) / 50, sy = (e.clientY - stick.cy) / 50;
      const l = Math.hypot(sx, sy);
      if (l > 1) { sx /= l; sy /= l; }
      stick.dx = sx; stick.dy = sy;
      knobEl.style.transform = `translate(${sx * 34}px, ${sy * 34}px)`;
      return;
    }
    if (p.moved && canLook()) {
      const k = e.pointerType === 'mouse' ? 0.0034 : 0.0052;
      yaw -= dx * k;
      pitch = clamp(pitch - dy * k, -1.45, 1.45);
    }
  });
  function endPointer(e, cancelled) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.role === 'stick') { stick.id = null; stick.dx = stick.dy = 0; stickEl.classList.remove('on'); }
    if (p.role === 'look' && e.pointerType === 'mouse') { dragging = false; canvas.classList.remove('dragging'); }
    if (!cancelled && !p.moved && performance.now() - p.t < 500) {
      if (mode === 'descent') { skipDescent(); return; }
      act(pickAt(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1));
    }
  }
  canvas.addEventListener('pointerup', e => endPointer(e, false));
  canvas.addEventListener('pointercancel', e => endPointer(e, true));
  canvas.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hoverPt = null; hideTip(); } });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ==========================================================
  // GETTING AROUND. You have a body: feet some height above your floor and
  // a speed up or down. The railing only stops you below its top, so a jump
  // with a step toward it takes you over, and the chasm has no bottom.
  // ==========================================================
  const G = 9.8;                         // m/s²
  const JUMP_V = 4.9;                    // a jump peaks about 1.2 m up: enough to clear the railing
  const TERMINAL = 55;                   // a person falls no faster than this
  const RAIL_H = 1.06;                   // the top of the railing
  const RAIL_IN = -0.07 - RADIUS, RAIL_OUT = -0.05 + RADIUS;   // where a body touches the railing
  const HEADROOM = CEIL - EYE - 0.14;    // feet any higher and your head is in the floor above
  const HARD = 13.5;                     // landing faster than this (two floors' drop or so) kills you
  const FAR_SIDE = CHASM - 1.5;          // nobody gets across
  const STAIR_R0 = 0.32, STAIR_R1 = 1.08;   // where you can stand on the stair treads
  const body = { feet: 0, vy: 0, vx: 0, vz: 0, ground: true, stairs: false, cx: 0, r: 0, phi: 0, air: 0, fallen: 0, asked: false };
  function settle() {
    body.feet = 0; body.vy = body.vx = body.vz = 0; body.ground = true; body.stairs = false;
    body.air = 0; body.fallen = 0; body.asked = false;
  }
  const wrapPi = a => posMod(a + Math.PI, Math.PI * 2) - Math.PI;

  // would a body at (x, z) with its feet at `feet` be inside something?
  function solid(x, z, feet) {
    if (z > FAR_SIDE) return true;
    if (z > RAIL_IN && z < RAIL_OUT) return feet < RAIL_H || (z < 0.1 && feet > HEADROOM);   // the railing, unless you're above it
    if (z >= RAIL_OUT) return false;                                                      // the open chasm
    if (feet > HEADROOM) return true;                                                     // under the floor above
    if (z >= FRONT + RADIUS) return false;                                                // the walkway
    const xm = x - Math.floor(x / MOD) * MOD;
    if (xm < RUN + RADIUS || xm > MOD - RADIUS) return true;                              // bookcases, or a rest area's side walls
    if (z < BACK + RADIUS) return true;                                                   // its back wall
    if (Math.hypot(xm - WELL_X, z - WELL_Z) < WELL_R + 0.1 + RADIUS) return true;         // the stairwell
    if (xm < RUN + 2.05 + RADIUS && z > BEDS_Z[3] - 0.47 - RADIUS && z < BEDS_Z[0] + 0.47 + RADIUS) return true;   // the beds
    if (xm > KIOSK_X0 - 0.05 - RADIUS && xm < KIOSK_X1 + 0.05 + RADIUS && z < BACK + 0.66 + RADIUS) return true;  // the kiosk
    return false;
  }
  let bob = 0;
  // where the keys (or the stick) want to go, in m/s
  function wanted() {
    let f = keys.f - keys.b - stick.dy, s = keys.r - keys.l + stick.dx;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const speed = keys.run || Math.hypot(stick.dx, stick.dy) > 0.95 ? 3.6 : 1.8;
    return [(-Math.sin(yaw) * f + Math.cos(yaw) * s) * speed, (-Math.cos(yaw) * f - Math.sin(yaw) * s) * speed];
  }
  function jumpUp() {
    if (mode !== 'walk' || !body.ground || body.stairs) return;
    [body.vx, body.vz] = wanted();   // a jump carries you the way you're going
    body.ground = false; body.vy = JUMP_V; body.air = 0; body.fallen = 0;
    hideTip();
  }
  function step(dt) {
    const [wx, wz] = wanted();
    if (body.stairs) { stairsStep(wx * dt, wz * dt); return; }
    if (body.ground) { body.vx = wx; body.vz = wz; }
    else {   // in the air you can only lean a little
      const k = Math.min(1, dt * 1.6);
      body.vx += (wx * 0.6 - body.vx) * k; body.vz += (wz * 0.6 - body.vz) * k;
    }
    const dx = body.vx * dt, dz = body.vz * dt;
    if (dx || dz) {
      if (body.ground && enterStairs(pos.x + dx, pos.z + dz)) return;
      // (in the air, pressing against the railing keeps your push for when you're above it)
      if (!solid(pos.x + dx, pos.z, body.feet)) pos.x += dx; else if (body.ground) body.vx = 0;
      if (!solid(pos.x, pos.z + dz, body.feet)) pos.z += dz; else if (body.ground) body.vz = 0;
      if (body.ground) bob += Math.hypot(dx, dz) * 5.2;
    }
    if (!body.ground) fly(dt);
    if (mode !== 'walk') return;   // a hard landing takes over
    if (pos.x >= MOD) { pos.x -= MOD; walkedModules(1); }
    else if (pos.x < 0) { pos.x += MOD; walkedModules(-1); }
    pos.y = EYE + body.feet + (body.ground ? Math.sin(bob) * 0.025 : 0);
  }
  // are the keys (or the stick) asking to go toward our side of the chasm?
  function reaching() { return wanted()[1] < -0.5; }
  const FALL_TEXT = 'There is no bottom. You can fall for as long as you like.';
  function fly(dt) {
    // exact for steady gravity, so a jump is as high at any frame rate
    const before = body.feet, vy0 = body.vy;
    body.vy = Math.max(-TERMINAL, vy0 - G * dt);
    body.feet += (vy0 + body.vy) * 0.5 * dt;
    // coming down onto the railing: off whichever side you're more over
    if (pos.z > RAIL_IN && pos.z < RAIL_OUT && body.feet < RAIL_H && before >= RAIL_H)
      pos.z = pos.z < -0.06 ? RAIL_IN - 0.001 : RAIL_OUT + 0.001;
    // your head against the floor above
    if (pos.z < 0.1 && body.feet > HEADROOM) { body.feet = HEADROOM; body.vy = Math.min(body.vy, 0); }
    if (pos.z <= 0 && body.feet <= 0) { land(); return; }
    // down past a floor: in the chasm the floor number goes on falling
    let top = before;
    while (body.feet < 0) { body.feet += FLOOR_H; top += FLOOR_H; body.fallen++; changedFloors(-1); }
    // falling past a gallery's opening (between its railing and the floor
    // above), close to it and reaching for it: you catch the railing and
    // drop in. Too fast and you go straight past.
    if (pos.z >= RAIL_OUT && pos.z < RAIL_OUT + 0.6 && reaching() && body.vy > -TERMINAL * 0.6 &&
        top > RAIL_H && body.feet < HEADROOM) {
      body.feet = clamp(body.feet, RAIL_H, HEADROOM);
      pos.z = RAIL_IN - 0.01;
      body.vz = 0;
    }
    if (pos.z > 0) {
      body.air += dt;
      if (!body.asked && body.air > 2.4) {
        body.asked = true;
        dialog(FALL_TEXT, [{ label: 'Wake up', primary: true, run: wake }], { keepMode: true });
      }
      if (body.asked && !dialogEl.hidden) dialogText.textContent = `${FALL_TEXT} ${commas(body.fallen)} ${body.fallen === 1 ? 'floor' : 'floors'} so far.`;
    }
  }
  function land() {
    const speed = -body.vy, fallen = body.fallen, asked = body.asked;
    settle();
    if (asked) closeDialog();
    if (speed > HARD) {
      mode = 'sleep';
      fadeTo(1, 250).then(() => wakeUp(`You fell ${commas(fallen)} ${fallen === 1 ? 'floor' : 'floors'} and hit a gallery floor.`));
      return;
    }
    if (fallen > 0) toast(`Down ${commas(fallen)} ${fallen === 1 ? 'floor' : 'floors'}.`, 2600);
  }
  // "Wake up" while falling
  function wake() {
    const fallen = body.fallen;
    closeDialog();
    mode = 'sleep';
    fadeTo(1, 700).then(() => wakeUp(`You fell ${commas(fallen)} ${fallen === 1 ? 'floor' : 'floors'}.`));
  }
  function wakeUp(what) {
    settle();
    day++;
    // the nearest rest area, beside the first bed
    pos.set(RUN + 2.55, EYE, BEDS_Z[0]);
    yaw = Math.PI; pitch = 0;
    updateHud();
    return wait(700).then(() => {
      mode = 'walk';
      toast(`${what} You wake up in a rest area on that floor. Day ${day}.`, 6000);
      return fadeTo(0, 1100);
    });
  }
  // "Climb over the railing?" → Jump: up onto it and over
  let vaulting = null;
  function jump() {
    closeDialog();
    clearKeys();
    hideTip();
    vaulting = { t: 0, z0: pos.z, pitch0: pitch };
    mode = 'vault';
  }
  function vaultUpdate(dt) {
    const v = vaulting;
    v.t += dt;
    const k = Math.min(1, v.t / 0.55);
    pos.z = v.z0 + (RAIL_OUT + 0.05 - v.z0) * ease(k);
    body.feet = (RAIL_H + 0.25) * Math.sin(k * Math.PI / 2);
    pos.y = EYE + body.feet;
    pitch = v.pitch0 + (-0.55 - v.pitch0) * ease(k);
    if (k >= 1) {
      vaulting = null;
      body.ground = false; body.stairs = false; body.vy = 0.6; body.vx = 0; body.vz = 1.1;
      body.air = 0; body.fallen = 0; body.asked = false;
      mode = 'walk';
    }
  }

  // ---------- walking the spiral stairs ----------
  // Round and round the column: anticlockwise goes up, clockwise down, a
  // floor to every turn, for as long as you keep going. The opening in the
  // railing round the well is where the stair meets each floor.
  function enterStairs(nx, nz) {
    if (body.feet > 0.4) return false;
    const m = Math.floor(nx / MOD), cx = m * MOD + WELL_X;
    const d = Math.hypot(nx - cx, nz - WELL_Z);
    if (d >= WELL_R + 0.1 + RADIUS) return false;
    const da = wrapPi(Math.atan2(nz - WELL_Z, nx - cx) - STAIR_A0);
    if (Math.abs(da) > STEP_A * 0.95) return false;   // only through the opening
    body.stairs = true; body.ground = true; body.cx = cx; body.phi = da; body.r = clamp(d, STAIR_R0, STAIR_R1);
    hideTip();
    placeOnStairs();
    return true;
  }
  function placeOnStairs() {
    const a = STAIR_A0 + body.phi;
    pos.x = body.cx + body.r * Math.cos(a);
    pos.z = WELL_Z + body.r * Math.sin(a);
    body.feet = FLOOR_H * body.phi / (Math.PI * 2);
    pos.y = EYE + body.feet + Math.sin(bob) * 0.02;
  }
  function stairsStep(dx, dz) {
    if (!dx && !dz) { placeOnStairs(); return; }
    const nx = pos.x + dx, nz = pos.z + dz;
    const r = Math.hypot(nx - body.cx, nz - WELL_Z);
    body.phi += wrapPi(Math.atan2(nz - WELL_Z, nx - body.cx) - (STAIR_A0 + body.phi));
    bob += Math.hypot(dx, dz) * 5.2;
    // off at a floor, through the opening
    if (r > STAIR_R1 && Math.abs(body.phi) < STEP_A * 0.9) {
      const a = STAIR_A0 + body.phi, out = WELL_R + 0.13 + RADIUS;
      settle();
      pos.x = body.cx + out * Math.cos(a); pos.z = WELL_Z + out * Math.sin(a); pos.y = EYE;
      return;
    }
    body.r = clamp(r, STAIR_R0, STAIR_R1);
    // half a turn past a floor, you're on the next floor's flight
    if (body.phi >= Math.PI) { body.phi -= Math.PI * 2; changedFloors(1); }
    else if (body.phi < -Math.PI) { body.phi += Math.PI * 2; changedFloors(-1); }
    placeOnStairs();
  }

  // ---------- the stairs, done for you (click them) ----------
  let stair = null;
  const yawToward = (dx, dz) => Math.atan2(-dx, -dz);
  const angleLerp = (a, b, t) => a + (posMod(b - a + Math.PI, Math.PI * 2) - Math.PI) * t;
  function climb(dir) {
    closeDialog();
    body.stairs = false;
    const m = Math.floor(pos.x / MOD);
    const cx = m * MOD + WELL_X, cz = WELL_Z;
    const entry = new THREE.Vector3(cx + (WELL_R + 0.3) * Math.cos(STAIR_A0), EYE, cz + (WELL_R + 0.3) * Math.sin(STAIR_A0));
    stair = { dir, t: 0, cx, cz, entry, from: pos.clone(), yaw0: yaw, pitch0: pitch, track: { applied: 0 },
      walkIn: reduceMotion ? 0.01 : 0.7, turn: reduceMotion ? 0.01 : 3.4, walkOut: reduceMotion ? 0.01 : 0.6 };
    mode = 'stairs';
    clearKeys();
    hideTip();
    if (reduceMotion) fadeTo(1, 250);
  }
  function stairUpdate(dt) {
    const s = stair;
    s.t += dt;
    const a0 = STAIR_A0, rS = 0.72;
    const tangent = a => [-Math.sin(a) * s.dir, Math.cos(a) * s.dir];
    let pathY, x, z, lookYaw, lookPitch;
    if (s.t < s.walkIn) {
      // walk to the opening in the railing
      const k = ease(s.t / s.walkIn);
      x = s.from.x + (s.entry.x - s.from.x) * k; z = s.from.z + (s.entry.z - s.from.z) * k; pathY = EYE;
      const tg = tangent(a0);
      lookYaw = angleLerp(s.yaw0, yawToward(tg[0], tg[1]), k); lookPitch = s.pitch0 + (0 - s.pitch0) * k;
    } else if (s.t < s.walkIn + s.turn) {
      // one turn round the column
      const k = (s.t - s.walkIn) / s.turn, e = ease(k), a = a0 + s.dir * e * Math.PI * 2;
      const r = rS + (WELL_R + 0.3 - rS) * Math.max(0, 1 - k * 7) + (WELL_R + 0.3 - rS) * Math.max(0, k * 7 - 6);
      x = s.cx + r * Math.cos(a); z = s.cz + r * Math.sin(a);
      pathY = EYE + s.dir * e * FLOOR_H + 0.16 * Math.min(1, k * 8, (1 - k) * 8);
      const tg = tangent(a);
      lookYaw = yawToward(tg[0], tg[1]); lookPitch = s.dir > 0 ? 0.16 : -0.32;
      lookPitch *= Math.min(1, k * 6, (1 - k) * 6);
    } else {
      // step off, facing the gallery
      const k = ease(clamp((s.t - s.walkIn - s.turn) / s.walkOut, 0, 1));
      x = s.entry.x; z = s.entry.z + 0.5 * k; pathY = EYE + s.dir * FLOOR_H;
      const tg = tangent(a0);
      lookYaw = angleLerp(yawToward(tg[0], tg[1]), Math.PI, k); lookPitch = 0;
      if (k >= 1) {
        pos.set(x, onPath(pathY, s.track), z);
        yaw = lookYaw; pitch = lookPitch;
        stair = null;
        settle();
        mode = 'walk';
        if (reduceMotion) fadeTo(0, 300);
        askStairs(true);
        return;
      }
    }
    pos.set(x, onPath(pathY, s.track), z);
    yaw = lookYaw; pitch = lookPitch;
  }

  // ---------- coming in: down the chasm in a spiral ----------
  const DESCENT_FLOORS = 26, DESCENT_T = 6.4, LAND_T = 1.7, SPIRAL_R = 6.5;
  let descent = null;
  function descentPose(d) {
    const t = d.t;
    if (t < DESCENT_T) {
      const s = t / DESCENT_T;
      const h = DESCENT_FLOORS * Math.pow(1 - s, 2.4);                // fast at first, slowing down
      const th = -Math.PI * 2 * 2.25 * Math.pow(1 - s, 1.7);
      const x = d.x + SPIRAL_R * Math.sin(th), z = MID - SPIRAL_R * Math.cos(th);
      return { x, z, y: h * FLOOR_H + EYE + 0.5, yaw: yawToward(Math.cos(th), Math.sin(th)), pitch: -0.42 * (1 - s) - 0.08 };
    }
    // over the railing and onto the gallery, turning to the shelves
    const k = ease(clamp((t - DESCENT_T) / LAND_T, 0, 1));
    return { x: d.x, z: (MID - SPIRAL_R) + (-1.15 - (MID - SPIRAL_R)) * k, y: EYE + 0.5 * (1 - k) + 0.35 * Math.sin(k * Math.PI),
      yaw: angleLerp(-Math.PI / 2, -0.3, k), pitch: -0.08 * (1 - k) - 0.05 * k };
  }
  function descentUpdate(dt) {
    descent.t += dt;
    const p = descentPose(descent);
    pos.set(p.x, onPath(p.y, descent.track), p.z);
    yaw = p.yaw; pitch = p.pitch;
    if (descent.t >= DESCENT_T + LAND_T) landed();
  }
  function skipDescent() {
    if (mode !== 'descent') return;
    descent.t = DESCENT_T + LAND_T;
    descentUpdate(0);
  }
  function landed() {
    descent = null;
    settle();
    mode = 'intro';
    introEl.hidden = false;
    requestAnimationFrame(() => introEl.classList.add('on'));
    setTimeout(() => { if (mode === 'intro') $('start').focus({ preventScroll: true }); }, 60);
  }
  function startWalking() {
    if (mode !== 'intro') return;
    introEl.classList.remove('on');
    setTimeout(() => { introEl.hidden = true; }, 700);
    mode = 'walk';
    canvas.focus({ preventScroll: true });
    hint(coarse ? 'Left thumb to walk · drag to look · tap a book to read it'
      : 'WASD to walk · Space to jump · drag to look · click a book to read it');
  }
  $('start').addEventListener('click', startWalking);
  $('jump').addEventListener('pointerdown', e => { e.preventDefault(); jumpUp(); });
  $('intro-leave').addEventListener('click', () => leave(false));
  leaveBtn.addEventListener('click', () => leave(false));

  // ---------- going home ----------
  function post(type, extra) {
    if (!EMBEDDED) return;
    try { window.parent.postMessage(Object.assign({ type }, extra || {}), '*'); } catch (err) {}
  }
  let leaving = false;
  function leave(escaped) {
    if (leaving) return;
    leaving = true;
    mode = 'exit';
    fadeTo(1, escaped ? 1400 : 450, escaped).then(() => {
      if (EMBEDDED) post('library-exit', { escaped: !!escaped });
      else location.href = '../world.html';
    });
  }
  let rise = null;
  function getOut() {
    mode = 'exit';
    toast('The slot takes the book. You can go.', 6000);
    rise = { t: 0, from: pos.clone(), track: { applied: 0 }, yaw0: yaw };
    setTimeout(() => leave(true), reduceMotion ? 1200 : 2600);
  }
  function riseUpdate(dt) {
    rise.t += dt;
    const k = ease(Math.min(1, rise.t / 1.2));
    const y = EYE + Math.pow(rise.t, 3) * 6;
    pos.set(rise.from.x, onPath(y, rise.track), rise.from.z + (6 - rise.from.z) * k);
    yaw = angleLerp(rise.yaw0, 0, k);
    pitch = 0.5 * k;
  }

  // ==========================================================
  // THE LOOP
  // ==========================================================
  let last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (mode === 'walk') step(dt);
    else if (mode === 'descent') descentUpdate(dt);
    else if (mode === 'stairs') stairUpdate(dt);
    else if (mode === 'vault') vaultUpdate(dt);
    else if (mode === 'exit' && rise) riseUpdate(dt);
    if (bookMesh.visible) {
      bookOut += (bookOutTarget - bookOut) * Math.min(1, dt * 9);
      if (reading) placeBookMesh(reading.rel);
      if (bookOutTarget === 0 && bookOut < 0.004) { bookMesh.visible = false; if (reading && !reading.taken && readerEl.hidden) { reading = null; refreshBooks(); } }
    }
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
    updateHover(now);
    updateHud();
    const canJump = mode === 'walk' && body.ground && !body.stairs;
    if (canJump !== jumpShown) { jumpShown = canJump; document.body.classList.toggle('can-jump', canJump); }
    renderer.render(scene, camera);
  }
  let jumpShown = false;
  function resize() {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = innerWidth < innerHeight ? 78 : 70;
    camera.updateProjectionMatrix();
    glowMat.uniforms.uScale.value = innerHeight * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));
    if (!readerEl.hidden) sizeReader();
  }
  window.addEventListener('resize', resize);

  // ==========================================================
  // START
  // ==========================================================
  let begun = false;
  function begin() {
    if (begun) return;
    begun = true;
    hud.classList.add('on');
    leaveBtn.classList.add('on');
    mode = 'descent';
    if (reduceMotion) { skipDescent(); fadeTo(0, 600); return; }
    fadeTo(0, 1200);
  }
  window.addEventListener('message', e => { if (e.data && e.data.type === 'library-start') begin(); });

  async function init() {
    buildWorld();
    resize();
    await startWorker();
    chooseStart();
    // somewhere along the shelves, then the top of the way down
    pos.set(1.5 + Math.random() * (RUN - 3), EYE, -1.15);
    descent = { t: 0, x: pos.x, track: { applied: 0 } };
    descentUpdate(0);
    camera.position.copy(pos);
    camera.rotation.set(pitch, yaw, 0);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    mode = 'waiting';             // holds at the top of the way down until begin()
    requestAnimationFrame(t => { last = t; frame(t); });
    post('library-ready');
    if (!EMBEDDED) begin();
    else setTimeout(begin, 8000);   // in case the cabin never says go
  }

  // for tests and the curious
  window.__library = {
    get mode() { return mode; },
    get pos() { return pos; },
    get yaw() { return yaw; }, set yaw(v) { yaw = v; },
    get pitch() { return pitch; }, set pitch(v) { pitch = v; },
    get carried() { return carried; }, get reading() { return reading; },
    get floor() { return { last6: fDec, digits: fLen }; },
    get section() { return { last6: sDec, digits: sLen }; },
    get exitAddress() { return exitAddr; },
    here, pickAt, act, begin, skipDescent, startWalking, climb, jump, wake, leave, renderer, camera, scene,
    // hold the camera somewhere (tests: screenshots without waiting on the animations)
    pose(x, y, z, yw, pt) { mode = 'still'; pos.set(x, y, z); yaw = yw; pitch = pt; },
    walkMode() { mode = 'walk'; },
    descentAt(t) { if (descent) { descent.t = t; descentUpdate(0); } },
    body,
    state: () => ({ mode, feet: +body.feet.toFixed(3), ground: body.ground, stairs: body.stairs, pos: pos.toArray().map(v => +v.toFixed(3)), yaw: +yaw.toFixed(3), pitch: +pitch.toFixed(3), floor: fDec, section: sectionAt(pos.x),
      day, booksOpened, carrying: !!carried, reading: !!reading, dialog: !dialogEl.hidden, reader: !readerEl.hidden, intro: !introEl.hidden }),
    // put the book that lets you out in front of you (tests only)
    standAtExit() {
      here.set(exitAddr);
      const slot = here[0];
      here[0] = 0;
      const off = B.modOf(here, B.S_FROM, B.S_DIGITS, 2 * BAYS);
      B.addSmall(here, B.S_FROM, B.S_DIGITS, parity - off);
      measure(); fillSeeds();
      const bay = (off - parity) / 2;
      pos.set(bay * BAY + BAY / 2, EYE, -1.0);
      yaw = 0; pitch = -0.25 + (Math.floor(slot / 19) - 2) * 0.12;
      if (reading) { reading = null; bookMesh.visible = false; }
      carried = null; refreshBooks(); updateCarry();
      settle();
      return { bay, slot, shelf: Math.floor(slot / 19) + 1, volume: slot % 19 + 1 };
    },
  };
  init();
})();
