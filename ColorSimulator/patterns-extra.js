/**
 * Additional pattern generators for ColorWaveEngine.
 * ===========================================================================
 * The first entry here is a bug fix rather than a feature. generatePattern()
 * dispatched its `default` branch to this.generateRandom(), which was never
 * defined anywhere -- so the default case threw "this.generateRandom is not a
 * function" on every call. Since "random" is also the option the <select>
 * starts on, the app crashed on its own initial pattern and only three of its
 * four advertised pattern types worked.
 *
 * The rest are new. Each follows the existing contract exactly: take a
 * particle count, return an array of this.createParticle(x, y).
 */
(function () {
    'use strict';

    if (typeof ColorWaveEngine === 'undefined') return;

    const PHI = (1 + Math.sqrt(5)) / 2;
    const GOLDEN_ANGLE = Math.PI * 2 * (1 - 1 / PHI);

    const proto = ColorWaveEngine.prototype;

    /** Bounded drawing area, inset so nothing spawns half off-screen. */
    function bounds(engine) {
        const pad = engine.config.maxParticleSize * 2;
        return {
            w: engine.canvas.width, h: engine.canvas.height,
            pad: pad,
            minSide: Math.min(engine.canvas.width, engine.canvas.height)
        };
    }

    /* --------------------------------------------------------------------- *
     * The missing one
     * --------------------------------------------------------------------- */

    proto.generateRandom = function (count) {
        const b = bounds(this);
        const out = [];
        for (let i = 0; i < count; i++) {
            out.push(this.createParticle(
                b.pad + Math.random() * (b.w - b.pad * 2),
                b.pad + Math.random() * (b.h - b.pad * 2)
            ));
        }
        return out;
    };

    /* --------------------------------------------------------------------- *
     * New patterns
     * --------------------------------------------------------------------- */

    /**
     * Vogel's model: the arrangement of sunflower seeds. Successive points sit
     * one golden angle apart at radius proportional to sqrt(index), which
     * packs them evenly with no visible rows or spokes.
     */
    proto.generatePhyllotaxis = function (count) {
        const b = bounds(this);
        const out = [];
        const spread = (b.minSide * 0.46 * this.config.patternScale) / Math.sqrt(Math.max(1, count));
        for (let i = 0; i < count; i++) {
            const angle = i * GOLDEN_ANGLE;
            const radius = spread * Math.sqrt(i);
            out.push(this.createParticle(
                this.centerX + Math.cos(angle) * radius,
                this.centerY + Math.sin(angle) * radius
            ));
        }
        return out;
    };

    /**
     * Hexagonal close packing -- rows offset by half a cell. Denser and far
     * less mechanical-looking than the existing square grid.
     */
    proto.generateHexagonal = function (count) {
        const b = bounds(this);
        const out = [];
        const spacing = this.config.patternSpacing * this.config.patternScale;
        const rowHeight = spacing * Math.sqrt(3) / 2;
        const cols = Math.max(1, Math.ceil(Math.sqrt(count * (b.w / Math.max(1, b.h)))));
        const rows = Math.ceil(count / cols);
        const originX = this.centerX - (cols * spacing) / 2;
        const originY = this.centerY - (rows * rowHeight) / 2;

        for (let r = 0; r < rows && out.length < count; r++) {
            for (let c = 0; c < cols && out.length < count; c++) {
                out.push(this.createParticle(
                    originX + c * spacing + (r % 2 ? spacing / 2 : 0),
                    originY + r * rowHeight
                ));
            }
        }
        return out;
    };

    /**
     * Two circular wave sources. Points land on the interference maxima, so
     * the pattern shows the hyperbolic fringes you get from a double slit.
     */
    proto.generateInterference = function (count) {
        const b = bounds(this);
        const out = [];
        const sep = b.minSide * 0.22 * this.config.patternScale;
        const sources = [
            { x: this.centerX - sep, y: this.centerY },
            { x: this.centerX + sep, y: this.centerY }
        ];
        const wavelength = Math.max(8, this.config.patternSpacing * this.config.patternScale * 0.9);

        let attempts = 0;
        while (out.length < count && attempts < count * 40) {
            attempts++;
            const x = b.pad + Math.random() * (b.w - b.pad * 2);
            const y = b.pad + Math.random() * (b.h - b.pad * 2);
            const d1 = Math.hypot(x - sources[0].x, y - sources[0].y);
            const d2 = Math.hypot(x - sources[1].x, y - sources[1].y);
            // Constructive where the path difference is near a whole wavelength.
            const phase = ((d1 - d2) / wavelength) % 1;
            const closeness = Math.min(phase < 0 ? phase + 1 : phase, 1 - (phase < 0 ? phase + 1 : phase));
            if (closeness < 0.06) out.push(this.createParticle(x, y));
        }
        // Top up if the rejection sampler came up short on a small canvas.
        while (out.length < count) {
            out.push(this.createParticle(
                b.pad + Math.random() * (b.w - b.pad * 2),
                b.pad + Math.random() * (b.h - b.pad * 2)
            ));
        }
        return out;
    };

    /**
     * De Jong strange attractor. Iterating the map traces a fractal basin --
     * the parameters are jittered per call so it is a different creature each
     * time, but always recognisably structured rather than noise.
     */
    proto.generateAttractor = function (count) {
        const b = bounds(this);

        // Plenty of parameter sets send the orbit to a fixed point or a tiny
        // cycle, which draws as a single dot. Generate, measure the spread,
        // and reject anything degenerate before committing to it.
        const run = function (a, bb, c, d) {
            let x = 0.1;
            let y = 0.1;
            for (let i = 0; i < 300; i++) {          // settle onto the attractor
                const nx = Math.sin(a * y) - Math.cos(bb * x);
                y = Math.sin(c * x) - Math.cos(d * y);
                x = nx;
            }
            const pts = new Array(count);
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (let i = 0; i < count; i++) {
                const nx = Math.sin(a * y) - Math.cos(bb * x);
                y = Math.sin(c * x) - Math.cos(d * y);
                x = nx;
                if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
                pts[i] = [x, y];
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
            return { pts: pts, spread: Math.min(maxX - minX, maxY - minY) };
        };

        let best = null;
        for (let attempt = 0; attempt < 24; attempt++) {
            const candidate = run(
                -2.2 + Math.random() * 4.4, -2.2 + Math.random() * 4.4,
                -2.2 + Math.random() * 4.4, -2.2 + Math.random() * 4.4
            );
            if (!candidate) continue;
            if (!best || candidate.spread > best.spread) best = candidate;
            if (best.spread > 1.2) break;            // good enough, stop looking
        }
        // Known-good parameters, in case every random draw was degenerate.
        if (!best || best.spread < 0.4) best = run(1.641, 1.902, 0.316, 1.525) || best;
        if (!best) return this.generateRandom(count);

        const scale = (b.minSide * 0.42 * this.config.patternScale) / Math.max(0.5, best.spread);
        return best.pts.map((p) => this.createParticle(
            this.centerX + p[0] * scale, this.centerY + p[1] * scale
        ));
    };

    /** A Lissajous figure with an integer frequency ratio, so it closes. */
    proto.generateLissajous = function (count) {
        const b = bounds(this);
        const out = [];
        const ratios = [[3, 2], [5, 4], [3, 4], [5, 6], [7, 5]];
        const pick = ratios[Math.floor(Math.random() * ratios.length)];
        const phase = Math.random() * Math.PI;
        const ax = b.w * 0.34 * this.config.patternScale;
        const ay = b.h * 0.34 * this.config.patternScale;
        for (let i = 0; i < count; i++) {
            const t = (i / count) * Math.PI * 2;
            out.push(this.createParticle(
                this.centerX + Math.sin(pick[0] * t + phase) * ax,
                this.centerY + Math.sin(pick[1] * t) * ay
            ));
        }
        return out;
    };

    /** Concentric rings, each holding a count proportional to its radius. */
    proto.generateRings = function (count) {
        const b = bounds(this);
        const out = [];
        const maxRadius = b.minSide * 0.45 * this.config.patternScale;
        const ringCount = Math.max(2, Math.round(Math.sqrt(count) / 1.6));
        let placed = 0;
        for (let r = 1; r <= ringCount && placed < count; r++) {
            const radius = (r / ringCount) * maxRadius;
            const remaining = count - placed;
            const onThisRing = Math.max(1, Math.min(remaining,
                Math.round((count * 2 * r) / (ringCount * (ringCount + 1)))));
            const offset = Math.random() * Math.PI * 2;
            for (let i = 0; i < onThisRing; i++) {
                const angle = offset + (i / onThisRing) * Math.PI * 2;
                out.push(this.createParticle(
                    this.centerX + Math.cos(angle) * radius,
                    this.centerY + Math.sin(angle) * radius
                ));
                placed++;
            }
        }
        return out;
    };

    /* --------------------------------------------------------------------- *
     * Dispatch
     *
     * Replaces the original switch, which had no route to the new generators
     * and whose default branch called a method that did not exist. Unknown
     * names now fall back to random rather than throwing.
     * --------------------------------------------------------------------- */

    const GENERATORS = {
        random: 'generateRandom',
        spiral: 'generateSpiral',
        grid: 'generateGrid',
        mandala: 'generateMandala',
        phyllotaxis: 'generatePhyllotaxis',
        hexagonal: 'generateHexagonal',
        interference: 'generateInterference',
        attractor: 'generateAttractor',
        lissajous: 'generateLissajous',
        rings: 'generateRings'
    };

    proto.generatePattern = function (type, count) {
        const wanted = Math.max(1, Math.min(count, this.config.maxParticles));
        const method = GENERATORS[type] || GENERATORS.random;
        const fn = typeof this[method] === 'function' ? this[method] : this.generateRandom;
        const produced = fn.call(this, wanted) || [];
        return produced.slice(0, wanted);
    };

    ColorWaveEngine.PATTERN_TYPES = Object.keys(GENERATORS);
})();
