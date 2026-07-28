/**
 * Hydrogen orbitals -- exact wavefunctions and exact sampling.
 * ===========================================================================
 * Hydrogen is one of the very few atoms whose Schrodinger equation has a
 * closed-form solution, so nothing here is an approximation of the physics:
 *
 *     psi_nlm(r,th,ph) = R_nl(r) * Y_l^m(th,ph)
 *
 * Everything is in Hartree atomic units (a0 = 1, hbar = 1, m_e = 1), so
 * energies come out as -1/(2n^2) Hartree and lengths in Bohr radii.
 *
 * The sampling deserves a note, because the obvious approach -- rejection
 * sampling in 3D against a bounding box -- is enormously wasteful for diffuse
 * high-n orbitals. It is not needed. |psi_nlm|^2 factorises:
 *
 *     |psi|^2 dV = [r^2 R_nl(r)^2 dr] * [|P_l^m(cos th)|^2 sin th dth] * [dph]
 *
 * because |e^(i m ph)|^2 = 1. So the azimuthal angle is exactly uniform and
 * free, and the other two are one-dimensional distributions that invert
 * cheaply from a tabulated CDF. Two binary searches per point, no rejection,
 * no wasted work -- millions of samples at interactive rates.
 *
 * For the real orbitals (the px/py/dz2 shapes from chemistry) the azimuthal
 * factor becomes cos^2(m ph) or sin^2(m ph), which is still a 1D distribution,
 * so the same machinery covers both.
 *
 * DOM-free by design; see tests/orbitals.test.mjs.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Orbitals = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    /* --------------------------------------------------------------------- *
     * Special functions
     * --------------------------------------------------------------------- */

    const LANCZOS = [
        676.5203681218851, -1259.1392167224028, 771.32342877765313,
        -176.61502916214059, 12.507343278686905, -0.13857109526572012,
        9.9843695780195716e-6, 1.5056327351493116e-7
    ];

    /** log|Gamma(x)| -- factorials for n around 20 overflow a double. */
    function lgamma(x) {
        if (x < 0.5) {
            return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
        }
        x -= 1;
        let a = 0.99999999999980993;
        const t = x + 7.5;
        for (let i = 0; i < LANCZOS.length; i++) a += LANCZOS[i] / (x + i + 1);
        return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
    }

    /**
     * Generalised Laguerre L_k^alpha(x) by the three-term recurrence
     *   (k+1) L_(k+1) = (2k+1+alpha-x) L_k - (k+alpha) L_(k-1)
     * which is stable in the upward direction for the range used here.
     */
    function laguerre(k, alpha, x) {
        if (k === 0) return 1;
        let prev = 1;
        let cur = 1 + alpha - x;
        for (let i = 1; i < k; i++) {
            const next = ((2 * i + 1 + alpha - x) * cur - (i + alpha) * prev) / (i + 1);
            prev = cur;
            cur = next;
        }
        return cur;
    }

    /**
     * Associated Legendre P_l^m(x) for m >= 0, including the Condon-Shortley
     * phase. The phase is irrelevant to |psi|^2 but has to be consistent for
     * the real-orbital combinations to come out right.
     */
    function legendreP(l, m, x) {
        if (m < 0 || m > l) return 0;
        let pmm = 1;
        if (m > 0) {
            const somx2 = Math.sqrt(Math.max(0, (1 - x) * (1 + x)));
            let fact = 1;
            for (let i = 1; i <= m; i++) {
                pmm *= -fact * somx2;
                fact += 2;
            }
        }
        if (l === m) return pmm;

        let pmmp1 = x * (2 * m + 1) * pmm;
        if (l === m + 1) return pmmp1;

        let pll = 0;
        for (let ll = m + 2; ll <= l; ll++) {
            pll = ((2 * ll - 1) * x * pmmp1 - (ll + m - 1) * pmm) / (ll - m);
            pmm = pmmp1;
            pmmp1 = pll;
        }
        return pll;
    }

    /* --------------------------------------------------------------------- *
     * Wavefunction
     * --------------------------------------------------------------------- */

    /** Normalisation of R_nl, computed in log space to survive large n. */
    function radialNorm(n, l) {
        const logN = 0.5 * (
            3 * Math.log(2 / n) +
            lgamma(n - l) -                 // (n-l-1)!
            Math.log(2 * n) -
            lgamma(n + l + 1)               // (n+l)!
        );
        return Math.exp(logN);
    }

    /** R_nl(r), in Bohr radii. */
    function radial(n, l, r) {
        const rho = (2 * r) / n;
        return radialNorm(n, l) *
            Math.exp(-rho / 2) *
            Math.pow(rho, l) *
            laguerre(n - l - 1, 2 * l + 1, rho);
    }

    function sphericalNorm(l, m) {
        const am = Math.abs(m);
        return Math.sqrt(
            ((2 * l + 1) / (4 * Math.PI)) *
            Math.exp(lgamma(l - am + 1) - lgamma(l + am + 1))
        );
    }

    /** Complex spherical harmonic Y_l^m(theta, phi). */
    function sphericalY(l, m, theta, phi) {
        const am = Math.abs(m);
        let norm = sphericalNorm(l, am);
        const p = legendreP(l, am, Math.cos(theta));
        // Y_l^(-m) = (-1)^m conj(Y_l^m)
        if (m < 0 && am % 2 === 1) norm = -norm;
        const angle = m * phi;
        return { re: norm * p * Math.cos(angle), im: norm * p * Math.sin(angle) };
    }

    /** Complex psi_nlm. */
    function psi(n, l, m, r, theta, phi) {
        const R = radial(n, l, r);
        const Y = sphericalY(l, m, theta, phi);
        return { re: R * Y.re, im: R * Y.im };
    }

    /**
     * Real orbital: px, py, dz2 and friends. For m > 0 this is the cosine
     * combination, for m < 0 the sine one, and m = 0 is already real.
     */
    function psiReal(n, l, m, r, theta, phi) {
        const am = Math.abs(m);
        const R = radial(n, l, r);
        // The (-1)^m cancels the Condon-Shortley phase carried by P_l^m. Without
        // it the standard combinations come out sign-flipped -- p_x would be
        // negative along +x. |psi|^2 is unaffected either way, but the lobe
        // signs are the whole point of drawing real orbitals, so the
        // conventional orientation matters.
        const csPhase = am % 2 === 1 ? -1 : 1;
        const norm = sphericalNorm(l, am) * (m === 0 ? 1 : Math.SQRT2) * csPhase;
        const p = legendreP(l, am, Math.cos(theta));
        const angular = m === 0 ? 1 : (m > 0 ? Math.cos(am * phi) : Math.sin(am * phi));
        return { re: R * norm * p * angular, im: 0 };
    }

    /* --------------------------------------------------------------------- *
     * Analytic reference values -- what the tests check the sampler against
     * --------------------------------------------------------------------- */

    /** E_n in Hartree. Multiply by 27.211386245988 for eV. */
    function energy(n) { return -0.5 / (n * n); }

    /** <r> = (a0/2)[3n^2 - l(l+1)] */
    function expectedRadius(n, l) { return 0.5 * (3 * n * n - l * (l + 1)); }

    function radialNodes(n, l) { return n - l - 1; }
    function angularNodes(l) { return l; }

    const HARTREE_EV = 27.211386245988;
    const BOHR_PM = 52.917721090380;

    /* --------------------------------------------------------------------- *
     * Tabulated inverse-CDF sampling
     * --------------------------------------------------------------------- */

    function buildCDF(values, dx) {
        const cdf = new Float64Array(values.length);
        let total = 0;
        for (let i = 0; i < values.length; i++) {
            total += values[i] * dx;
            cdf[i] = total;
        }
        if (total > 0) for (let i = 0; i < cdf.length; i++) cdf[i] /= total;
        return cdf;
    }

    /** Binary search plus linear interpolation between table entries. */
    function invertCDF(cdf, u, x0, dx) {
        let lo = 0;
        let hi = cdf.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (cdf[mid] < u) lo = mid + 1; else hi = mid;
        }
        const prev = lo > 0 ? cdf[lo - 1] : 0;
        const span = cdf[lo] - prev;
        const frac = span > 0 ? (u - prev) / span : 0.5;
        return x0 + (lo + frac) * dx;
    }

    /**
     * Radial extent worth tabulating. The density falls off like e^(-2r/n),
     * so this walks out until the remaining tail is numerically irrelevant
     * rather than trusting a hardcoded multiple of n^2.
     */
    function radialExtent(n, l) {
        const guess = 4 * n * n + 20 * n;
        let peak = 0;
        for (let i = 1; i <= 400; i++) {
            const r = (i / 400) * guess;
            const v = r * r * Math.pow(radial(n, l, r), 2);
            if (v > peak) peak = v;
        }
        for (let i = 400; i >= 1; i--) {
            const r = (i / 400) * guess;
            const v = r * r * Math.pow(radial(n, l, r), 2);
            if (v > peak * 1e-8) return r * 1.08;
        }
        return guess;
    }

    /**
     * Precompute everything needed to draw samples from |psi|^2 for one state.
     * `real` selects the real-orbital form.
     */
    function createSampler(n, l, m, options) {
        options = options || {};
        const real = !!options.real;
        // Half-thickness of a slab containing the quantisation axis. sample()
        // puts that axis on y, so the slab restricts z. A solid ball of opaque
        // grains hides its own nodal structure; a thin slice shows the shells,
        // which is what makes the picture legible.
        const slab = options.slab > 0 ? options.slab : 0;
        const radialSteps = options.radialSteps || 4096;
        const polarSteps = options.polarSteps || 2048;
        const azimuthSteps = options.azimuthSteps || 2048;

        const rMax = radialExtent(n, l);
        const dr = rMax / radialSteps;
        const radialPdf = new Float64Array(radialSteps);
        for (let i = 0; i < radialSteps; i++) {
            const r = (i + 0.5) * dr;
            const R = radial(n, l, r);
            radialPdf[i] = r * r * R * R;
        }
        const radialCdf = buildCDF(radialPdf, dr);

        // P(theta) carries the sin(theta) Jacobian from the volume element.
        const dth = Math.PI / polarSteps;
        const polarPdf = new Float64Array(polarSteps);
        const am = Math.abs(m);
        for (let i = 0; i < polarSteps; i++) {
            const th = (i + 0.5) * dth;
            const p = legendreP(l, am, Math.cos(th));
            polarPdf[i] = p * p * Math.sin(th);
        }
        const polarCdf = buildCDF(polarPdf, dth);

        // Uniform for a complex orbital; cos^2 or sin^2 for a real one.
        let azimuthCdf = null;
        const dph = (2 * Math.PI) / azimuthSteps;
        if (real && m !== 0) {
            const pdf = new Float64Array(azimuthSteps);
            for (let i = 0; i < azimuthSteps; i++) {
                const ph = (i + 0.5) * dph;
                const a = m > 0 ? Math.cos(am * ph) : Math.sin(am * ph);
                pdf[i] = a * a;
            }
            azimuthCdf = buildCDF(pdf, dph);
        }

        return {
            n: n, l: l, m: m, real: real, rMax: rMax,
            /** One sample: {x, y, z, r, theta, phi}. */
            sample: function (rng) {
                const rand = rng || Math.random;
                const r = invertCDF(radialCdf, rand(), 0, dr);
                const theta = invertCDF(polarCdf, rand(), 0, dth);

                let phi;
                if (slab > 0) {
                    // Restrict to |z| < slab. With z = r sin(theta) sin(phi),
                    // that is |sin phi| < slab / (r sin theta) -- an exact
                    // conditional draw, no rejection, because phi is uniform
                    // for a complex orbital.
                    const s = r * Math.sin(theta);
                    if (s <= slab) {
                        phi = rand() * Math.PI * 2;
                    } else {
                        const half = Math.asin(Math.min(1, slab / s));
                        const side = rand() < 0.5 ? 0 : Math.PI;
                        phi = side + (rand() * 2 - 1) * half;
                        if (azimuthCdf) {
                            // Real orbitals carry a cos^2/sin^2 factor in phi,
                            // so accept within the band in proportion to it.
                            for (let t = 0; t < 24; t++) {
                                const a = m > 0 ? Math.cos(am * phi) : Math.sin(am * phi);
                                if (rand() < a * a) break;
                                phi = side + (rand() * 2 - 1) * half;
                            }
                        }
                    }
                } else {
                    phi = azimuthCdf ? invertCDF(azimuthCdf, rand(), 0, dph) : rand() * Math.PI * 2;
                }
                const sinT = Math.sin(theta);
                return {
                    x: r * sinT * Math.cos(phi),
                    y: r * Math.cos(theta),
                    z: r * sinT * Math.sin(phi),
                    r: r, theta: theta, phi: phi
                };
            }
        };
    }

    /**
     * Fill typed arrays with `count` samples plus the complex amplitude at
     * each one. The amplitudes let the renderer colour points by quantum
     * phase, and let a superposition be re-weighted per frame without
     * resampling anything.
     */
    function samplePointCloud(states, count, options) {
        options = options || {};
        const rng = options.rng || Math.random;
        const real = !!options.real;

        const list = Array.isArray(states) ? states : [states];
        const samplers = list.map((s) => createSampler(s.n, s.l, s.m, {
            real: real, slab: options.slab || 0
        }));
        const weights = list.map((s) => (s.weight === undefined ? 1 : s.weight));
        const totalWeight = weights.reduce((a, b) => a + b, 0);

        const positions = new Float32Array(count * 3);
        // Per component: real and imaginary part of psi at each sampled point.
        const amplitudes = list.map(() => new Float32Array(count * 2));
        // 1/q(x): the proposal density the point was actually drawn from, so a
        // superposition can be importance-weighted back to the true |psi|^2.
        const invProposal = new Float32Array(count);

        let filled = 0;
        for (let k = 0; k < list.length; k++) {
            const share = k === list.length - 1
                ? count - filled
                : Math.round((weights[k] / totalWeight) * count);
            for (let i = 0; i < share; i++) {
                const p = samplers[k].sample(rng);
                const idx = filled + i;
                positions[idx * 3] = p.x;
                positions[idx * 3 + 1] = p.y;
                positions[idx * 3 + 2] = p.z;

                let q = 0;
                for (let j = 0; j < list.length; j++) {
                    const st = list[j];
                    const a = real
                        ? psiReal(st.n, st.l, st.m, p.r, p.theta, p.phi)
                        : psi(st.n, st.l, st.m, p.r, p.theta, p.phi);
                    amplitudes[j][idx * 2] = a.re;
                    amplitudes[j][idx * 2 + 1] = a.im;
                    q += (weights[j] / totalWeight) * (a.re * a.re + a.im * a.im);
                }
                invProposal[idx] = q > 1e-30 ? 1 / q : 0;
            }
            filled += share;
        }

        return {
            count: count,
            positions: positions,
            amplitudes: amplitudes,
            invProposal: invProposal,
            rMax: Math.max.apply(null, samplers.map((s) => s.rMax))
        };
    }

    /* --------------------------------------------------------------------- *
     * Numerical checks -- used by the tests and by the in-page verifier
     * --------------------------------------------------------------------- */

    /** Integrate |psi|^2 over all space on a spherical grid. Should be 1. */
    function normalisation(n, l, m, steps) {
        steps = steps || 600;
        const rMax = radialExtent(n, l);
        const dr = rMax / steps;
        let total = 0;
        for (let i = 0; i < steps; i++) {
            const r = (i + 0.5) * dr;
            const R = radial(n, l, r);
            total += r * r * R * R * dr;
        }
        // The angular part integrates to exactly 1 for normalised harmonics,
        // so the radial integral alone is the whole story.
        return total;
    }

    /** <r> by quadrature, for comparison against expectedRadius(). */
    function meanRadius(n, l, steps) {
        steps = steps || 4000;
        const rMax = radialExtent(n, l);
        const dr = rMax / steps;
        let num = 0;
        let den = 0;
        for (let i = 0; i < steps; i++) {
            const r = (i + 0.5) * dr;
            const R = radial(n, l, r);
            const w = r * r * R * R * dr;
            num += r * w;
            den += w;
        }
        return num / den;
    }

    /** Count sign changes in R_nl -- should equal n - l - 1. */
    function countRadialNodes(n, l, steps) {
        steps = steps || 20000;
        const rMax = radialExtent(n, l);
        let nodes = 0;
        let prev = radial(n, l, 1e-6);
        for (let i = 1; i <= steps; i++) {
            const r = (i / steps) * rMax;
            const v = radial(n, l, r);
            // Ignore the exponential tail, where round-off dominates the sign.
            if (Math.abs(v) > 1e-14 && Math.abs(prev) > 1e-14 && (v > 0) !== (prev > 0)) nodes++;
            if (Math.abs(v) > 1e-14) prev = v;
        }
        return nodes;
    }

    return {
        lgamma: lgamma,
        laguerre: laguerre,
        legendreP: legendreP,
        radial: radial,
        sphericalY: sphericalY,
        psi: psi,
        psiReal: psiReal,
        energy: energy,
        expectedRadius: expectedRadius,
        radialNodes: radialNodes,
        angularNodes: angularNodes,
        radialExtent: radialExtent,
        createSampler: createSampler,
        samplePointCloud: samplePointCloud,
        normalisation: normalisation,
        meanRadius: meanRadius,
        countRadialNodes: countRadialNodes,
        HARTREE_EV: HARTREE_EV,
        BOHR_PM: BOHR_PM
    };
});
