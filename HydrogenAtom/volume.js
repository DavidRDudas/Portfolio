/**
 * Wavefunction -> 3D field, for volumetric rendering.
 * ===========================================================================
 * Point sprites are what every orbital visualiser does, and they have a
 * ceiling: discrete dots, overdraw artefacts, no real occlusion, and a
 * silhouette that hides everything inside it. A volume does not. Marching a
 * ray through a continuous density with emission, absorption and a
 * precomputed shadow term gives depth the same way a photograph of smoke does.
 *
 * Two things make this fast enough to rebuild interactively.
 *
 * First, separability. psi = R_nl(r) * Y_l^m(theta, phi), so the expensive
 * parts -- the Laguerre and Legendre recurrences -- are tabulated once in 1D
 * and every one of the ~2 million voxels becomes two table lookups. The
 * azimuthal factor e^(i m phi) never needs an atan2 either: cos(phi) and
 * sin(phi) come straight out of x/s and z/s, and de Moivre's recurrence walks
 * them up to m.
 *
 * Second, the shadow term. Marching a light ray from every voxel would be
 * O(N^3 * steps). Sweeping slices along the light instead, each slice reading
 * the accumulated transmittance of the one before it, is O(N^3) total -- the
 * whole self-shadowing field for the price of one pass.
 *
 * DOM-free. Returns plain typed arrays for the caller to upload.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.OrbitalVolume = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    let _O = null;
    function orbitals() {
        if (_O) return _O;
        if (typeof module !== 'undefined' && module.exports) _O = require('./orbitals.js');
        else _O = (typeof window !== 'undefined' ? window.Orbitals : null);
        if (!_O) throw new Error('volume.js needs orbitals.js to be loaded first');
        return _O;
    }

    const RADIAL_TABLE = 8192;
    const LEGENDRE_TABLE = 8192;

    /** Radius containing `frac` of the probability, for sizing the box. */
    function containingRadius(n, l, frac) {
        const rMax = orbitals().radialExtent(n, l);
        const steps = 4096;
        const dr = rMax / steps;
        let total = 0;
        const cum = new Float64Array(steps);
        for (let i = 0; i < steps; i++) {
            const r = (i + 0.5) * dr;
            const R = orbitals().radial(n, l, r);
            total += r * r * R * R * dr;
            cum[i] = total;
        }
        const target = total * frac;
        for (let i = 0; i < steps; i++) {
            if (cum[i] >= target) return (i + 1) * dr;
        }
        return rMax;
    }

    /** R_nl sampled on a uniform grid in r, for lookup during the fill. */
    function radialTable(n, l, rMax) {
        const t = new Float32Array(RADIAL_TABLE);
        for (let i = 0; i < RADIAL_TABLE; i++) {
            t[i] = orbitals().radial(n, l, (i / (RADIAL_TABLE - 1)) * rMax);
        }
        return t;
    }

    /** P_l^|m| sampled on a uniform grid in cos(theta). */
    function legendreTable(l, m) {
        const am = Math.abs(m);
        const t = new Float32Array(LEGENDRE_TABLE);
        for (let i = 0; i < LEGENDRE_TABLE; i++) {
            const x = -1 + (2 * i) / (LEGENDRE_TABLE - 1);
            t[i] = orbitals().legendreP(l, am, x);
        }
        return t;
    }

    function lookup(table, u) {
        // u in [0,1]
        const x = u * (table.length - 1);
        const i = Math.min(table.length - 2, Math.max(0, Math.floor(x)));
        const f = x - i;
        return table[i] * (1 - f) + table[i + 1] * f;
    }

    /**
     * Build the complex field for up to two states into one RGBA volume:
     * (Re psi0, Im psi0, Re psi1, Im psi1). Two components fit in a single
     * texture, so a superposition costs one fetch per sample rather than two.
     */
    function build(states, options) {
        options = options || {};
        const size = options.size || 128;
        const real = !!options.real;
        const list = states.slice(0, 2);

        // Size the box to the widest component so nothing is clipped.
        let half = 0;
        list.forEach((s) => { half = Math.max(half, containingRadius(s.n, s.l, 0.995)); });
        half *= 1.05;

        const data = new Float32Array(size * size * size * 4);
        const density = new Float32Array(size * size * size);

        list.forEach((st, comp) => {
            const rt = radialTable(st.n, st.l, half * Math.SQRT2 * 1.74);  // corner reach
            const lt = legendreTable(st.l, st.m);
            const am = Math.abs(st.m);
            const rScale = half * Math.SQRT2 * 1.74;

            // Y normalisation, including the sqrt(2) and Condon-Shortley
            // cancellation the real forms need.
            let norm = Math.sqrt(((2 * st.l + 1) / (4 * Math.PI)) *
                Math.exp(orbitals().lgamma(st.l - am + 1) - orbitals().lgamma(st.l + am + 1)));
            if (real && st.m !== 0) norm *= Math.SQRT2 * (am % 2 === 1 ? -1 : 1);
            else if (!real && st.m < 0 && am % 2 === 1) norm = -norm;

            const w = Math.sqrt(st.weight === undefined ? 1 : st.weight);
            const step = (2 * half) / (size - 1);

            for (let k = 0; k < size; k++) {
                const z = -half + k * step;
                for (let j = 0; j < size; j++) {
                    const y = -half + j * step;            // quantisation axis
                    const rowBase = (k * size + j) * size;
                    for (let i = 0; i < size; i++) {
                        const x = -half + i * step;
                        const s2 = x * x + z * z;
                        const r = Math.sqrt(s2 + y * y);
                        if (r > rScale) continue;

                        const R = lookup(rt, r / rScale);
                        if (R === 0) continue;

                        const cosT = r > 1e-9 ? y / r : 1;
                        const P = lookup(lt, (cosT + 1) * 0.5);
                        const radial = w * R * norm * P;
                        if (radial === 0) continue;

                        let re, im;
                        if (am === 0) {
                            re = radial; im = 0;
                        } else {
                            const s = Math.sqrt(s2);
                            if (s < 1e-9) { re = 0; im = 0; }
                            else {
                                // de Moivre by recurrence: no atan2, no trig.
                                const c1 = x / s, s1 = z / s;
                                let cm = 1, sm = 0;
                                for (let p = 0; p < am; p++) {
                                    const nc = cm * c1 - sm * s1;
                                    sm = cm * s1 + sm * c1;
                                    cm = nc;
                                }
                                if (real) {
                                    const ang = st.m > 0 ? cm : sm;
                                    re = radial * ang; im = 0;
                                } else {
                                    const sign = st.m < 0 ? -1 : 1;
                                    re = radial * cm; im = radial * sign * sm;
                                }
                            }
                        }

                        const idx = rowBase + i;
                        data[idx * 4 + comp * 2] = re;
                        data[idx * 4 + comp * 2 + 1] = im;
                        density[idx] += re * re + im * im;
                    }
                }
            }
        });

        const densityRef = percentile(density, 0.995);
        return {
            size: size,
            half: half,
            data: data,
            density: density,
            densityRef: densityRef,
            illumination: illuminate(density, size, (2 * half) / (size - 1),
                options.light, densityRef)
        };
    }

    /** High percentile of the non-zero values, for the transfer function. */
    function percentile(arr, frac) {
        const sample = [];
        const stride = Math.max(1, Math.floor(arr.length / 200000));
        for (let i = 0; i < arr.length; i += stride) {
            if (arr[i] > 0) sample.push(arr[i]);
        }
        if (!sample.length) return 1;
        sample.sort((a, b) => a - b);
        return sample[Math.min(sample.length - 1, Math.floor(sample.length * frac))] || 1;
    }

    /**
     * Self-shadowing by slice sweep.
     *
     * Marching a shadow ray out of every voxel is O(N^3 * steps). Sweeping
     * planes along the light instead lets each slice read the transmittance
     * already accumulated by the previous one, so the whole field costs a
     * single O(N^3) pass. The light is taken to come from +y with a lateral
     * shear, which is why the previous slice is sampled at an offset rather
     * than directly above.
     */
    function illuminate(density, size, step, light, densityRef) {
        const L = light || [0.36, 1.0, 0.24];
        const len = Math.hypot(L[0], L[1], L[2]);
        const lx = L[0] / len, ly = L[1] / len, lz = L[2] / len;
        const shearX = (lx / ly) * 1.0;
        const shearZ = (lz / ly) * 1.0;

        const T = new Float32Array(size * size * size);
        // Opacity has to scale with the orbital, not be a constant. A 1s
        // packs its whole unit of probability into a few cubic Bohr while a
        // 5f spreads the same amount over a box hundreds of times larger, so
        // a fixed coefficient makes the diffuse states cast no shadow at all.
        // Referencing the density percentile and the box size keeps the peak
        // optical depth comparable across every orbital.
        const OPTICAL_DEPTH = 3.4;
        const sigma = OPTICAL_DEPTH / Math.max(1e-30, (densityRef || 1) * size * step * 0.35);
        const dsAlongLight = step / Math.max(0.15, Math.abs(ly));

        const at = (i, j, k) => (k * size + j) * size + i;

        for (let j = size - 1; j >= 0; j--) {
            for (let k = 0; k < size; k++) {
                for (let i = 0; i < size; i++) {
                    const idx = at(i, j, k);
                    let incoming = 1;
                    if (j < size - 1) {
                        // bilinear read of the slice above, offset by the shear
                        const fi = i + shearX;
                        const fk = k + shearZ;
                        const i0 = Math.floor(fi), k0 = Math.floor(fk);
                        const tx = fi - i0, tz = fk - k0;
                        const c = (a, b) => {
                            if (a < 0 || a >= size || b < 0 || b >= size) return 1;
                            return T[at(a, j + 1, b)];
                        };
                        incoming =
                            c(i0, k0) * (1 - tx) * (1 - tz) + c(i0 + 1, k0) * tx * (1 - tz) +
                            c(i0, k0 + 1) * (1 - tx) * tz + c(i0 + 1, k0 + 1) * tx * tz;
                    }
                    const rho = density[idx];
                    T[idx] = incoming * Math.exp(-sigma * rho * dsAlongLight);
                }
            }
        }
        return T;
    }

    return {
        build: build,
        containingRadius: containingRadius,
        percentile: percentile
    };
});
