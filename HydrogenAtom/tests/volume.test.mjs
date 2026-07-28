/**
 * Verification for the volumetric field builder.
 *
 *     node HydrogenAtom/tests/volume.test.mjs
 *
 * A volume renderer can look convincing while being wrong -- plausible smoke
 * is easy, correct smoke is not. Everything here checks the voxel grid against
 * something independent: the closed-form <r>, psi evaluated directly, or a
 * conservation law the field has to obey.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const O = require(path.join(here, '..', 'orbitals.js'));
const V = require(path.join(here, '..', 'volume.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') =>
  cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra));
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

console.log('[1] the volume integrates to 1 (it is a probability density)');
for (const [n, l, m] of [[1,0,0], [2,1,0], [3,2,1], [4,1,-1], [5,3,2]]) {
  const t0 = Date.now();
  const vol = V.build([{ n, l, m, weight: 1 }], { size: 128 });
  const ms = Date.now() - t0;
  const dV = Math.pow((2 * vol.half) / (vol.size - 1), 3);
  let total = 0;
  for (let i = 0; i < vol.density.length; i++) total += vol.density[i];
  total *= dV;
  ok(`n=${n} l=${l} m=${m}: integral ${total.toFixed(4)} (${ms}ms, box ±${vol.half.toFixed(1)} a0)`,
     near(total, 1, 0.05), String(total));
}

console.log('\n[2] <r> from the voxel grid matches the closed form');
for (const [n, l, m] of [[1,0,0], [3,2,1], [4,3,0]]) {
  const vol = V.build([{ n, l, m, weight: 1 }], { size: 128 });
  const step = (2 * vol.half) / (vol.size - 1);
  let num = 0, den = 0;
  for (let k = 0; k < vol.size; k++)
    for (let j = 0; j < vol.size; j++)
      for (let i = 0; i < vol.size; i++) {
        const rho = vol.density[(k * vol.size + j) * vol.size + i];
        if (!rho) continue;
        const x = -vol.half + i * step, y = -vol.half + j * step, z = -vol.half + k * step;
        num += Math.hypot(x, y, z) * rho;
        den += rho;
      }
  const mean = num / den, exact = O.expectedRadius(n, l);
  ok(`n=${n} l=${l}: <r> ${mean.toFixed(2)} vs ${exact.toFixed(2)} a0`,
     near(mean, exact, 0.06), `${mean} vs ${exact}`);
}

console.log('\n[3] the field agrees with psi evaluated directly');
{
  const [n, l, m] = [4, 2, 1];
  const vol = V.build([{ n, l, m, weight: 1 }], { size: 160 });
  const step = (2 * vol.half) / (vol.size - 1);
  let peak = 0;
  for (let i = 0; i < vol.density.length; i++) peak = Math.max(peak, vol.density[i]);
  peak = Math.sqrt(peak);

  let worst = 0, checked = 0;
  for (let t = 0; t < 4000; t++) {
    const i = 2 + Math.floor(Math.random() * (vol.size - 4));
    const j = 2 + Math.floor(Math.random() * (vol.size - 4));
    const k = 2 + Math.floor(Math.random() * (vol.size - 4));
    const x = -vol.half + i * step, y = -vol.half + j * step, z = -vol.half + k * step;
    const r = Math.hypot(x, y, z);
    if (r < 1e-6) continue;
    // y is the quantisation axis, so theta is measured from it.
    const exact = O.psi(n, l, m, r, Math.acos(y / r), Math.atan2(z, x));
    const idx = (k * vol.size + j) * vol.size + i;
    worst = Math.max(worst, Math.hypot(vol.data[idx * 4] - exact.re,
                                       vol.data[idx * 4 + 1] - exact.im) / peak);
    checked++;
  }
  ok(`${checked} random voxels match psi (worst err ${(worst * 100).toFixed(3)}% of peak |psi|)`,
     worst < 0.01, String(worst));
}

console.log('\n[4] real orbitals keep their conventional sign');
{
  const vol = V.build([{ n: 2, l: 1, m: 1, weight: 1 }], { size: 96, real: true });
  const mid = Math.floor(vol.size / 2);
  const at = (i, j, k) => vol.data[((k * vol.size + j) * vol.size + i) * 4];
  const plusX = at(vol.size - 20, mid, mid), minusX = at(19, mid, mid);
  ok('2px positive along +x', plusX > 0, String(plusX));
  ok('2px negative along -x', minusX < 0, String(minusX));
}

console.log('\n[5] self-shadowing is a real gradient, not a constant');
{
  const vol = V.build([{ n: 3, l: 0, m: 0, weight: 1 }], { size: 96 });
  const T = vol.illumination;
  let min = Infinity, max = -Infinity;
  for (let i = 0; i < T.length; i++) { if (T[i] < min) min = T[i]; if (T[i] > max) max = T[i]; }
  ok(`transmittance spans ${min.toFixed(3)}..${max.toFixed(3)}`,
     min < 0.75 && max > 0.99, `${min}..${max}`);

  const s = vol.size, mid = Math.floor(s / 2), at = (i, j, k) => T[(k * s + j) * s + i];
  ok('top (lit) brighter than bottom (shadowed)', at(mid, s - 8, mid) > at(mid, 7, mid),
     `${at(mid, s - 8, mid)} vs ${at(mid, 7, mid)}`);
}

console.log('\n[6] superposition packs both components');
{
  const vol = V.build([{ n: 1, l: 0, m: 0, weight: 0.5 },
                       { n: 2, l: 1, m: 0, weight: 0.5 }], { size: 96 });
  let c0 = 0, c1 = 0;
  for (let i = 0; i < vol.size ** 3; i++) {
    if (vol.data[i * 4] !== 0) c0++;
    if (vol.data[i * 4 + 2] !== 0) c1++;
  }
  ok('component 0 written', c0 > 1000, String(c0));
  ok('component 1 written', c1 > 1000, String(c1));
}

console.log('\n[7] the density of an m-eigenstate is invariant under rotation about y');
{
  // The raymarcher applies the probability current as a phase factor on psi
  // rather than by resampling at a rotated point. That substitution is only
  // legitimate because a rotation by alpha acts on an m-eigenstate as exactly
  // e^(i m alpha) -- so |psi| must not move when the point does.
  const [n, l, m] = [3, 2, 2];
  let worstRho = 0, worstPhase = 0;
  for (let t = 0; t < 300; t++) {
    const r = 0.5 + Math.random() * 14;
    const theta = 0.15 + Math.random() * (Math.PI - 0.3);
    const phi = Math.random() * 2 * Math.PI;
    const alpha = (Math.random() - 0.5) * 6;

    const a = O.psi(n, l, m, r, theta, phi);
    const b = O.psi(n, l, m, r, theta, phi + alpha);
    const rhoA = a.re * a.re + a.im * a.im, rhoB = b.re * b.re + b.im * b.im;
    worstRho = Math.max(worstRho, Math.abs(rhoA - rhoB) / Math.max(1e-30, rhoA));

    // and the phase must advance by exactly m * alpha
    const want = { re: a.re * Math.cos(m * alpha) - a.im * Math.sin(m * alpha),
                   im: a.re * Math.sin(m * alpha) + a.im * Math.cos(m * alpha) };
    worstPhase = Math.max(worstPhase,
      Math.hypot(want.re - b.re, want.im - b.im) / Math.max(1e-30, Math.sqrt(rhoA)));
  }
  ok(`|psi|^2 unchanged by rotation (worst ${(worstRho * 100).toExponential(1)}%)`,
     worstRho < 1e-9, String(worstRho));
  ok(`rotation acts as exp(i m alpha) (worst ${worstPhase.toExponential(1)})`,
     worstPhase < 1e-9, String(worstPhase));
}

console.log('\n[8] the field is finite everywhere');
for (const [n, l, m] of [[1,0,0], [6,2,1], [8,4,2]]) {
  const vol = V.build([{ n, l, m, weight: 1 }], { size: 64 });
  let bad = 0;
  for (let i = 0; i < vol.data.length; i++) if (!Number.isFinite(vol.data[i])) bad++;
  for (let i = 0; i < vol.illumination.length; i++) if (!Number.isFinite(vol.illumination[i])) bad++;
  ok(`n=${n} l=${l} m=${m}: no NaN/Inf in field or illumination`, bad === 0, String(bad));
  ok(`n=${n} l=${l} m=${m}: densityRef positive (${vol.densityRef.toExponential(2)})`,
     vol.densityRef > 0, String(vol.densityRef));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
