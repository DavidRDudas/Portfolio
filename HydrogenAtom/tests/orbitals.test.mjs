/**
 * Verification for the hydrogen orbital maths.
 *
 *     node HydrogenAtom/tests/orbitals.test.mjs
 *
 * "Accurate" has to be checkable, not asserted. Everything here compares
 * against a closed-form result or a known physical constant.
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const O = require(path.join(here, '..', 'orbitals.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') =>
  cond ? (pass++, console.log('  PASS', name)) : (fail++, console.log('  FAIL', name, extra));
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const STATES = [];
for (let n = 1; n <= 8; n++) for (let l = 0; l < n; l++) STATES.push([n, l]);

console.log('[1] normalisation: integral of |psi|^2 over all space = 1');
for (const [n, l] of STATES.filter(([n]) => n <= 6)) {
  const norm = O.normalisation(n, l, 0, 3000);
  ok(`n=${n} l=${l}  -> ${norm.toFixed(6)}`, near(norm, 1, 1e-4), String(norm));
}

console.log('\n[2] <r> matches (a0/2)[3n^2 - l(l+1)]');
for (const [n, l] of STATES) {
  const num = O.meanRadius(n, l, 20000);
  const exact = O.expectedRadius(n, l);
  ok(`n=${n} l=${l}  ${num.toFixed(3)} vs ${exact.toFixed(3)} a0`, near(num, exact, 2e-3),
     `${num} vs ${exact}`);
}

console.log('\n[3] radial nodes = n - l - 1');
for (const [n, l] of STATES.filter(([n]) => n <= 7)) {
  const counted = O.countRadialNodes(n, l, 60000);
  ok(`n=${n} l=${l}  -> ${counted} nodes`, counted === O.radialNodes(n, l),
     `expected ${O.radialNodes(n, l)}, counted ${counted}`);
}

console.log('\n[4] energies');
ok('E1 = -13.6057 eV', near(O.energy(1) * O.HARTREE_EV, -13.605693, 1e-5),
   String(O.energy(1) * O.HARTREE_EV));
ok('E2 = E1/4', near(O.energy(2), O.energy(1) / 4, 1e-12));
const lyA = (O.energy(2) - O.energy(1)) * O.HARTREE_EV;
// Lyman-alpha: 10.20 eV -> 121.57 nm
const nm = 1239.841984 / lyA;
ok(`2p->1s gives Lyman-alpha at ${nm.toFixed(2)} nm`, near(nm, 121.567, 1e-3), String(nm));
const balmerA = (O.energy(3) - O.energy(2)) * O.HARTREE_EV;
ok(`3->2 gives H-alpha at ${(1239.841984 / balmerA).toFixed(1)} nm`,
   near(1239.841984 / balmerA, 656.47, 2e-3), String(1239.841984 / balmerA));

console.log('\n[5] spherical harmonics are orthonormal');
function integrateY(l1, m1, l2, m2) {
  const N = 400;
  let re = 0, im = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) / N) * Math.PI;
    for (let j = 0; j < N; j++) {
      const ph = ((j + 0.5) / N) * 2 * Math.PI;
      const a = O.sphericalY(l1, m1, th, ph);
      const b = O.sphericalY(l2, m2, th, ph);
      // conj(a) * b
      re += (a.re * b.re + a.im * b.im) * Math.sin(th);
      im += (a.re * b.im - a.im * b.re) * Math.sin(th);
    }
  }
  const dA = (Math.PI / N) * ((2 * Math.PI) / N);
  return Math.hypot(re * dA, im * dA);
}
ok('<Y00|Y00> = 1', near(integrateY(0, 0, 0, 0), 1, 5e-3), String(integrateY(0,0,0,0)));
ok('<Y10|Y10> = 1', near(integrateY(1, 0, 1, 0), 1, 5e-3), String(integrateY(1,0,1,0)));
ok('<Y21|Y21> = 1', near(integrateY(2, 1, 2, 1), 1, 5e-3), String(integrateY(2,1,2,1)));
ok('<Y00|Y10> = 0', integrateY(0, 0, 1, 0) < 5e-3, String(integrateY(0,0,1,0)));
ok('<Y21|Y2-1> = 0', integrateY(2, 1, 2, -1) < 5e-3, String(integrateY(2,1,2,-1)));

console.log('\n[6] known closed forms');
// R_10 = 2 e^-r
ok('R_10(r) = 2e^-r', [0.1, 0.5, 1, 2, 5].every(r => near(O.radial(1,0,r), 2*Math.exp(-r), 1e-9)));
// R_20 = (1/sqrt(2))(1 - r/2) e^(-r/2)
ok('R_20 matches closed form', [0.2, 1, 2, 4].every(r =>
   near(O.radial(2,0,r), (1/Math.SQRT2)*(1 - r/2)*Math.exp(-r/2), 1e-9)));
// R_21 = (1/(2 sqrt(6))) r e^(-r/2)
ok('R_21 matches closed form', [0.2, 1, 3, 6].every(r =>
   near(O.radial(2,1,r), (1/(2*Math.sqrt(6)))*r*Math.exp(-r/2), 1e-9)));
ok('R_20 node at r = 2a0', Math.abs(O.radial(2,0,2)) < 1e-12, String(O.radial(2,0,2)));
// Y00 = 1/sqrt(4pi)
ok('Y00 = 1/sqrt(4pi)', near(O.sphericalY(0,0,1,1).re, 1/Math.sqrt(4*Math.PI), 1e-12));

console.log('\n[7] the sampler reproduces the analytic distribution');
for (const [n, l, m] of [[1,0,0],[2,1,0],[3,2,1],[4,1,-1],[6,2,1]]) {
  const s = O.createSampler(n, l, m);
  const N = 120000;
  let sumR = 0, sumR2 = 0;
  let seed = 12345;
  const rng = () => { seed = (1664525*seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { const p = s.sample(rng); sumR += p.r; sumR2 += p.r*p.r; }
  const meanR = sumR / N;
  const exact = O.expectedRadius(n, l);
  const stderr = Math.sqrt(Math.max(0, sumR2/N - meanR*meanR)) / Math.sqrt(N);
  ok(`n=${n} l=${l} m=${m}: sampled <r>=${meanR.toFixed(3)} vs exact ${exact.toFixed(3)} (${(Math.abs(meanR-exact)/stderr).toFixed(1)} sigma)`,
     Math.abs(meanR - exact) < 5 * stderr + 0.02 * exact, `${meanR} vs ${exact}`);
}

console.log('\n[8] sampled points obey |psi|^2 in angle too');
{
  // For l=1,m=0 (pz) the density goes as cos^2(theta): <cos^2> should be 3/5.
  const s = O.createSampler(2, 1, 0);
  let seed = 999, sum = 0; const N = 200000;
  const rng = () => { seed = (1664525*seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { const c = Math.cos(s.sample(rng).theta); sum += c*c; }
  ok(`2p_z <cos^2 theta> = ${(sum/N).toFixed(4)} (exact 0.6)`, near(sum/N, 0.6, 0.02), String(sum/N));
}
{
  // s orbitals are isotropic: <cos^2> = 1/3.
  const s = O.createSampler(3, 0, 0);
  let seed = 4242, sum = 0; const N = 200000;
  const rng = () => { seed = (1664525*seed + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < N; i++) { const c = Math.cos(s.sample(rng).theta); sum += c*c; }
  ok(`3s is isotropic, <cos^2 theta> = ${(sum/N).toFixed(4)} (exact 0.3333)`, near(sum/N, 1/3, 0.02), String(sum/N));
}

console.log('\n[9] real orbitals');
{
  // px must have a nodal plane at x=0 i.e. phi=pi/2, and lobes along x.
  const v = (ph) => O.psiReal(2,1,1, 2, Math.PI/2, ph).re;
  ok('2px vanishes on the yz plane', Math.abs(v(Math.PI/2)) < 1e-12, String(v(Math.PI/2)));
  ok('2px is maximal along +x', v(0) > 0 && Math.abs(v(0)) > Math.abs(v(Math.PI/4)));
  ok('2px is antisymmetric through the origin', near(v(0), -v(Math.PI), 1e-9));
  const vy = (ph) => O.psiReal(2,1,-1, 2, Math.PI/2, ph).re;
  ok('2py vanishes on the xz plane', Math.abs(vy(0)) < 1e-12, String(vy(0)));
  ok('2py is maximal along +y', vy(Math.PI/2) > 0);
}
{
  // Sum over m of |Y_lm|^2 is isotropic (Unsold): (2l+1)/4pi.
  for (const l of [1,2,3]) {
    let worst = 0;
    for (const th of [0.3, 1.0, 2.0, 2.9]) {
      let s = 0;
      for (let m = -l; m <= l; m++) {
        const y = O.sphericalY(l, m, th, 0.7);
        s += y.re*y.re + y.im*y.im;
      }
      worst = Math.max(worst, Math.abs(s - (2*l+1)/(4*Math.PI)));
    }
    ok(`Unsold's theorem holds for l=${l}`, worst < 1e-12, String(worst));
  }
}

console.log('\n[10] point-cloud generation');
{
  const cloud = O.samplePointCloud({ n: 4, l: 2, m: 1 }, 50000);
  ok('positions filled', cloud.positions.length === 150000);
  ok('all coordinates finite', cloud.positions.every(Number.isFinite));
  ok('amplitudes finite', cloud.amplitudes[0].every(Number.isFinite));
  const r = [];
  for (let i = 0; i < cloud.count; i++) {
    r.push(Math.hypot(cloud.positions[i*3], cloud.positions[i*3+1], cloud.positions[i*3+2]));
  }
  const meanR = r.reduce((a,b)=>a+b,0)/r.length;
  ok(`cloud <r> = ${meanR.toFixed(2)} vs exact ${O.expectedRadius(4,2).toFixed(2)}`,
     near(meanR, O.expectedRadius(4,2), 0.03), String(meanR));

  const superpos = O.samplePointCloud([{n:1,l:0,m:0,weight:0.5},{n:2,l:1,m:0,weight:0.5}], 20000);
  ok('superposition carries one amplitude set per state', superpos.amplitudes.length === 2);
  ok('inverse proposal density finite', superpos.invProposal.every(v => Number.isFinite(v) && v >= 0));
}

console.log('\n[11] large n does not overflow');
for (const [n, l] of [[10,0],[12,5],[15,2],[20,10]]) {
  const norm = O.normalisation(n, l, 6000);
  ok(`n=${n} l=${l} still normalised (${norm.toFixed(4)})`, near(norm, 1, 5e-3), String(norm));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
