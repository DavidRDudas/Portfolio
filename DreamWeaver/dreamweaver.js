/**
 * Dream Weaver -- text to generative SVG art.
 * ===========================================================================
 * Rewritten to fix a set of defects that were undermining the output:
 *
 *   - hashText() summed character codes, so every anagram collided:
 *     "dog", "god" and "odg" all hashed to 314 and produced identical art.
 *     Now FNV-1a.
 *
 *   - seededRandom() mutated a single shared cursor, and selectPalette() read
 *     that cursor, so each layer picked a *different* palette. One artwork was
 *     drawn in forest, vibrant, muted, ocean and earth at once, which is why
 *     the results looked muddy. The palette is now chosen once per artwork,
 *     and every layer draws from its own independent stream -- so toggling one
 *     layer no longer reshuffles all the others.
 *
 *   - calculateColorHarmony() added 0.1 * complexity to the green channel with
 *     complexity unbounded. A nine-word phrase produced a 5.4x green
 *     multiplier and the whole piece went neon. Now normalised and clamped.
 *
 *   - generateArt() had no concurrency guard, and the layer checkboxes called
 *     it directly with no debounce. Toggling five boxes started five
 *     overlapping runs whose layers interleaved into the same canvas. Now
 *     token-guarded, and each run builds off-screen and swaps in atomically.
 *
 *   - Clearing the input did nothing once the canvas had been replaced by the
 *     rasterised <img>, because innerHTML = "" is a no-op on a void element.
 *
 *   - Progress divided by a hardcoded 11 while up to 12 steps ran, so the bar
 *     reported 109%.
 *
 * The piece also no longer rasterises itself after every render. That was
 * presumably done for performance, but it destroyed the <animate> elements the
 * code had just added and forced the next run to rebuild the SVG from scratch.
 * Instead the node count is kept under control (a turbulence filter replaces
 * 2000 hand-placed noise circles) and PNG export is an explicit button.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

class DreamWeaver {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.input = document.getElementById('input');
        this.status = document.getElementById('status');

        this.palettes = {
            vibrant: ['#FF0055', '#FF9100', '#FFF700', '#00FF95', '#00B8FF', '#9C00FF'],
            muted: ['#CFB5C0', '#B4A6AB', '#998B96', '#7D7082', '#62566D', '#463B58'],
            earth: ['#4A3F35', '#6B5B4D', '#8C7765', '#AD937D', '#CEB095', '#EFCCAD'],
            ocean: ['#001B3B', '#003776', '#0053B1', '#006EEB', '#2689FF', '#4DA3FF'],
            forest: ['#1B4B00', '#366D00', '#518F00', '#6CB100', '#87D300', '#A2F500'],
            sunset: ['#FF7B00', '#FF5E00', '#FF4100', '#FF2400', '#FF0700', '#FF001F'],
            moonlight: ['#FFFFFF', '#E6E6FF', '#CCCCFF', '#B3B3FF', '#9999FF', '#8080FF'],
            aurora: ['#00FF87', '#00FFE1', '#00E4FF', '#00AAFF', '#0055FF', '#0000FF']
        };

        // A small keyword lexicon, not sentiment analysis. It exists so that
        // what you type actually steers the result -- the previous version
        // hardcoded sentiment to 0 and then fed it into the colour matrix.
        this.lexicon = {
            warm: ['sun', 'fire', 'warm', 'summer', 'gold', 'ember', 'desert', 'lava', 'candle', 'amber', 'burning'],
            cold: ['ice', 'cold', 'winter', 'snow', 'frost', 'moon', 'silver', 'glacier', 'rain', 'mist', 'pale'],
            calm: ['calm', 'quiet', 'slow', 'soft', 'still', 'gentle', 'drift', 'float', 'sleep', 'hush', 'dream'],
            wild: ['storm', 'chaos', 'fast', 'wild', 'burst', 'scream', 'shatter', 'rush', 'lightning', 'fall', 'crash'],
            dark: ['dark', 'night', 'shadow', 'deep', 'black', 'void', 'grave', 'abyss', 'hollow', 'buried'],
            bright: ['light', 'bright', 'glow', 'shine', 'white', 'star', 'dawn', 'radiant', 'flare', 'gleam'],
            nature: ['forest', 'tree', 'leaf', 'river', 'ocean', 'sea', 'mountain', 'wave', 'garden', 'flower', 'root']
        };

        this.layerSettings = {
            texture: true, flowField: true, mainShapes: true, details: true,
            highlights: true, noise: true, patterns: true, voronoi: true,
            particles: true, lightRays: true
        };

        this.variation = 0;
        this.paletteOverride = null;
        this.token = 0;
        this.text = '';
        this.reduceMotion = window.matchMedia &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        this.debounceTimeout = null;
        this.debounceDelay = 400;

        this.initialiseControls();
    }

    /* ------------------------------------------------------------------ *
     * Deterministic randomness
     *
     * Each layer pulls from its own named stream, so enabling or disabling
     * one layer cannot change what any other layer draws. Same text plus
     * same variation always yields the same artwork.
     * ------------------------------------------------------------------ */

    /** FNV-1a. Order-sensitive, unlike the previous sum of char codes. */
    hashText(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    /** mulberry32 -- small, fast, and good enough for art. */
    stream(name) {
        let a = this.hashText(this.text + '|' + name + '|' + this.variation);
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    /* ------------------------------------------------------------------ *
     * Element budget
     *
     * generateDetailLayer() recursed three deep with up to seven branches per
     * level and a decoration at every junction -- tens of thousands of nodes
     * for a normal sentence. That is what made rasterising feel necessary.
     * ------------------------------------------------------------------ */

    el(tag, attrs, parent) {
        if (this.budget <= 0) return null;
        this.budget--;
        const node = document.createElementNS(SVG_NS, tag);
        if (attrs) {
            for (const k in attrs) {
                if (attrs[k] !== undefined && attrs[k] !== null) node.setAttribute(k, attrs[k]);
            }
        }
        if (parent) parent.appendChild(node);
        return node;
    }

    /* ------------------------------------------------------------------ *
     * Text analysis
     * ------------------------------------------------------------------ */

    analyzeText(text) {
        const words = text.trim().split(/\s+/).filter(Boolean);
        const unique = new Set(words.map(function (w) { return w.toLowerCase(); })).size;
        const avgWordLength = words.length ? text.replace(/\s+/g, '').length / words.length : 0;

        const mood = {};
        for (const key in this.lexicon) mood[key] = 0;
        const lower = text.toLowerCase();
        for (const key in this.lexicon) {
            this.lexicon[key].forEach(function (term) {
                if (lower.indexOf(term) !== -1) mood[key]++;
            });
        }

        // Two bounded axes the layers can actually use.
        const warmth = Math.max(-1, Math.min(1, (mood.warm - mood.cold) / 3));
        const energy = Math.max(-1, Math.min(1, (mood.wild - mood.calm) / 3));
        const luminance = Math.max(-1, Math.min(1, (mood.bright - mood.dark) / 3));

        return {
            words: words,
            length: text.length,
            uniqueRatio: words.length ? unique / words.length : 0,
            avgWordLength: avgWordLength,
            // Bounded 0..1 rather than the old unbounded product.
            complexity: Math.min(1, (words.length * avgWordLength) / 120),
            mood: mood,
            warmth: warmth,
            energy: energy,
            luminance: luminance
        };
    }

    /**
     * One palette for the whole artwork, steered by the words and stable for
     * a given text. Previously each layer re-read a mutating cursor and
     * therefore picked its own palette.
     */
    choosePalette(analysis) {
        if (this.paletteOverride && this.palettes[this.paletteOverride]) {
            return this.paletteOverride;
        }
        const m = analysis.mood;
        if (m.nature >= 2) return 'forest';
        // "deep sea at night" should read as water, not as a generic calm mood,
        // so nature plus darkness wins over the broader axes below.
        if (m.nature >= 1 && analysis.luminance < 0) return 'ocean';
        if (analysis.warmth > 0.3) return analysis.luminance > 0 ? 'sunset' : 'earth';
        if (analysis.warmth < -0.3) return analysis.luminance > 0 ? 'moonlight' : 'ocean';
        if (analysis.energy > 0.3) return 'vibrant';
        if (analysis.energy < -0.3) return 'muted';
        const names = Object.keys(this.palettes);
        return names[this.hashText(this.text) % names.length];
    }

    /* ------------------------------------------------------------------ *
     * Layers
     * ------------------------------------------------------------------ */

    background(root, a, colors) {
        const defs = this.defs;
        const grad = this.el('linearGradient', {
            id: 'bgGradient', x1: '0%', y1: '0%', x2: '100%', y2: '100%'
        }, defs);
        const stops = [
            { offset: '0%', color: colors[0], opacity: 0.75 },
            { offset: '50%', color: colors[2], opacity: 0.55 },
            { offset: '100%', color: colors[5], opacity: 0.8 }
        ];
        stops.forEach((s) => {
            this.el('stop', {
                offset: s.offset, 'stop-color': s.color, 'stop-opacity': s.opacity
            }, grad);
        });
        // A dark base keeps the piece readable whatever the palette.
        this.el('rect', { width: 600, height: 400, fill: '#07070d' }, root);
        this.el('rect', { width: 600, height: 400, fill: 'url(#bgGradient)' }, root);
    }

    texture(root, a) {
        const rnd = this.stream('texture');
        const g = this.el('g', { opacity: 0.5 }, root);
        const count = 60 + Math.floor(90 * rnd());
        for (let i = 0; i < count; i++) {
            this.el('circle', {
                cx: (600 * rnd()).toFixed(1), cy: (400 * rnd()).toFixed(1),
                r: (0.5 + 2 * rnd()).toFixed(2), fill: '#000', opacity: 0.05
            }, g);
        }
    }

    flowField(root, a, colors) {
        const rnd = this.stream('flowField');
        const g = this.el('g', null, root);
        const count = 30 + Math.floor(70 * a.complexity) + Math.floor(20 * (a.energy + 1));
        g.style.mixBlendMode = 'screen';
        for (let i = 0; i < count; i++) {
            let x = 600 * rnd();
            let y = 400 * rnd();
            let d = 'M ' + x.toFixed(1) + ' ' + y.toFixed(1);
            const steps = 10 + Math.floor(10 * rnd());
            for (let s = 0; s < steps; s++) {
                const angle = rnd() * Math.PI * 4;
                const len = 20 + 40 * rnd();
                const nx = x + Math.cos(angle) * len;
                const ny = y + Math.sin(angle) * len;
                d += ' Q ' + (x + Math.cos(angle) * len * 0.5).toFixed(1) + ' ' +
                    (y + Math.sin(angle) * len * 0.5).toFixed(1) + ' ' +
                    nx.toFixed(1) + ' ' + ny.toFixed(1);
                x = nx; y = ny;
            }
            this.el('path', {
                d: d, fill: 'none',
                stroke: colors[Math.floor(rnd() * colors.length)],
                'stroke-width': (0.5 + 2 * rnd()).toFixed(2),
                opacity: (0.1 + 0.2 * rnd()).toFixed(2)
            }, g);
        }
    }

    mainShapes(root, a, colors) {
        const rnd = this.stream('mainShapes');
        const g = this.el('g', null, root);
        // The focal layer: screened so shapes glow rather than muddying.
        g.style.mixBlendMode = 'screen';
        // Scale the per-word cluster down as the text grows, so a long
        // sentence stays legible instead of turning into a solid mat.
        const perWord = Math.max(2, Math.round(14 / Math.sqrt(Math.max(1, a.words.length))));
        a.words.forEach((word, i) => {
            const cx = 60 + 480 * rnd();
            const cy = 50 + 300 * rnd();
            const scale = 10 + Math.min(30, 3 * word.length);
            for (let j = 0; j < perWord; j++) {
                const angle = rnd() * Math.PI * 2;
                const dist = rnd() * scale * 2;
                const x = cx + Math.cos(angle) * dist;
                const y = cy + Math.sin(angle) * dist;
                const size = scale * (0.2 + 0.35 * rnd());
                const color = colors[Math.floor(rnd() * colors.length)];
                switch (Math.floor(4 * rnd())) {
                    case 0: this.spiral(g, x, y, size, rnd, color); break;
                    case 1: this.crystal(g, x, y, size, rnd, color); break;
                    case 2: this.flower(g, x, y, size, rnd, color); break;
                    default: this.starburst(g, x, y, size, rnd, color);
                }
            }
        });
    }

    spiral(g, cx, cy, size, rnd, color) {
        const turns = 3 + Math.floor(4 * rnd());
        const steps = 20 * turns;
        let d = 'M ' + cx.toFixed(1) + ' ' + cy.toFixed(1);
        for (let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2 * turns;
            const r = (i / steps) * size;
            d += ' L ' + (cx + Math.cos(angle) * r).toFixed(1) + ' ' + (cy + Math.sin(angle) * r).toFixed(1);
        }
        this.el('path', {
            d: d, fill: 'none', stroke: color,
            'stroke-width': (0.5 + rnd()).toFixed(2),
            opacity: (0.3 + 0.4 * rnd()).toFixed(2)
        }, g);
    }

    crystal(g, cx, cy, size, rnd, color) {
        const sides = 6 + Math.floor(4 * rnd());
        let d = '';
        for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const r = size * (0.5 + 0.5 * rnd());
            d += (i === 0 ? 'M ' : 'L ') + (cx + Math.cos(angle) * r).toFixed(1) +
                ' ' + (cy + Math.sin(angle) * r).toFixed(1) + ' ';
        }
        this.el('path', { d: d + 'Z', fill: color, opacity: (0.2 + 0.3 * rnd()).toFixed(2) }, g);
    }

    flower(g, cx, cy, size, rnd, color) {
        const petals = 5 + Math.floor(7 * rnd());
        let d = '';
        for (let i = 0; i < petals; i++) {
            const a1 = (i / petals) * Math.PI * 2;
            const a2 = ((i + 1) / petals) * Math.PI * 2;
            const r = size * (0.8 + 0.4 * rnd());
            if (i === 0) d += 'M ' + (cx + Math.cos(a1) * r).toFixed(1) + ' ' + (cy + Math.sin(a1) * r).toFixed(1);
            d += ' C ' + (cx + Math.cos(a1 + Math.PI / 4) * r * 1.5).toFixed(1) + ' ' +
                (cy + Math.sin(a1 + Math.PI / 4) * r * 1.5).toFixed(1) + ' ' +
                (cx + Math.cos(a2 - Math.PI / 4) * r * 1.5).toFixed(1) + ' ' +
                (cy + Math.sin(a2 - Math.PI / 4) * r * 1.5).toFixed(1) + ' ' +
                (cx + Math.cos(a2) * r).toFixed(1) + ' ' + (cy + Math.sin(a2) * r).toFixed(1);
        }
        this.el('path', { d: d + 'Z', fill: color, opacity: (0.2 + 0.3 * rnd()).toFixed(2) }, g);
    }

    starburst(g, cx, cy, size, rnd, color) {
        const points = 8 + Math.floor(8 * rnd());
        let d = '';
        for (let i = 0; i < points * 2; i++) {
            const angle = (i / (points * 2)) * Math.PI * 2;
            const r = size * (i % 2 === 0 ? 1 : 0.3 + 0.3 * rnd());
            d += (i === 0 ? 'M ' : 'L ') + (cx + Math.cos(angle) * r).toFixed(1) +
                ' ' + (cy + Math.sin(angle) * r).toFixed(1) + ' ';
        }
        this.el('path', { d: d + 'Z', fill: color, opacity: (0.2 + 0.3 * rnd()).toFixed(2) }, g);
    }

    details(root, a, colors) {
        const rnd = this.stream('details');
        const g = this.el('g', null, root);
        // Depth scales down with word count so the branch count stays bounded.
        const depth = a.words.length > 8 ? 2 : 3;
        a.words.slice(0, 10).forEach((word) => {
            this.fractal(g, 600 * rnd(), 400 * rnd(), depth, Math.min(40, 5 * word.length), rnd, colors);
        });
    }

    fractal(g, x, y, depth, size, rnd, colors) {
        if (depth <= 0 || this.budget <= 0) return;
        const branches = 3 + Math.floor(3 * rnd());
        for (let i = 0; i < branches; i++) {
            const angle = (i / branches) * Math.PI * 2 + rnd();
            const len = size * (0.5 + 0.5 * rnd());
            const ex = x + Math.cos(angle) * len;
            const ey = y + Math.sin(angle) * len;
            this.el('path', {
                d: 'M ' + x.toFixed(1) + ' ' + y.toFixed(1) + ' Q ' +
                    (x + Math.cos(angle) * len * 0.5 + (rnd() - 0.5) * size).toFixed(1) + ' ' +
                    (y + Math.sin(angle) * len * 0.5 + (rnd() - 0.5) * size).toFixed(1) + ' ' +
                    ex.toFixed(1) + ' ' + ey.toFixed(1),
                fill: 'none',
                stroke: colors[Math.floor(rnd() * colors.length)],
                'stroke-width': (0.5 * depth).toFixed(2),
                opacity: 0.3
            }, g);
            if (depth === 2) {
                this.junction(g, ex, ey, size * 0.3, rnd, colors[Math.floor(rnd() * colors.length)]);
            }
            this.fractal(g, ex, ey, depth - 1, size * 0.6, rnd, colors);
        }
    }

    junction(g, x, y, size, rnd, color) {
        const rings = 3 + Math.floor(3 * rnd());
        for (let i = 0; i < rings; i++) {
            const r = size * ((i + 1) / rings);
            const circle = this.el('circle', {
                cx: x.toFixed(1), cy: y.toFixed(1), r: r.toFixed(2),
                fill: 'none', stroke: color, 'stroke-width': 0.5,
                opacity: (0.1 + (i / rings) * 0.2).toFixed(2)
            }, g);
            // The previous version added these and then rasterised the SVG,
            // which discarded them. Now the SVG stays live, so they run.
            if (circle && !this.reduceMotion) {
                this.el('animate', {
                    attributeName: 'r',
                    values: (r * 0.9).toFixed(2) + ';' + (r * 1.1).toFixed(2) + ';' + (r * 0.9).toFixed(2),
                    dur: (3 + 3 * rnd()).toFixed(1) + 's',
                    repeatCount: 'indefinite'
                }, circle);
            }
        }
    }

    highlights(root, a, colors) {
        const rnd = this.stream('highlights');
        const g = this.el('g', null, root);
        g.style.mixBlendMode = 'screen';
        const count = 16 + Math.floor(20 * rnd());
        for (let i = 0; i < count; i++) {
            const id = 'hl' + i;
            const grad = this.el('radialGradient', { id: id }, this.defs);
            if (!grad) break;
            this.el('stop', {
                offset: '0%', 'stop-color': colors[Math.floor(rnd() * colors.length)],
                'stop-opacity': 0.45
            }, grad);
            this.el('stop', { offset: '100%', 'stop-color': '#ffffff', 'stop-opacity': 0 }, grad);
            this.el('circle', {
                cx: (600 * rnd()).toFixed(1), cy: (400 * rnd()).toFixed(1),
                r: (8 + 22 * rnd()).toFixed(1), fill: 'url(#' + id + ')'
            }, g);
        }
    }

    /** One turbulence filter in place of 2000 individually placed circles. */
    noise(root, a) {
        const filter = this.el('filter', {
            id: 'grain', x: '0%', y: '0%', width: '100%', height: '100%'
        }, this.defs);
        this.el('feTurbulence', {
            type: 'fractalNoise',
            baseFrequency: (0.6 + 0.3 * a.complexity).toFixed(2),
            numOctaves: 3,
            stitchTiles: 'stitch',
            seed: this.hashText(this.text) % 1000
        }, filter);
        this.el('feColorMatrix', { type: 'saturate', values: '0' }, filter);
        this.el('rect', {
            width: 600, height: 400, filter: 'url(#grain)',
            opacity: 0.16, 'mix-blend-mode': 'overlay', 'pointer-events': 'none'
        }, root);
    }

    patterns(root, a, colors) {
        const rnd = this.stream('patterns');
        const g = this.el('g', { opacity: 0.16 }, root);
        g.style.mixBlendMode = 'overlay';
        // Merge every cell of the same pattern type into one path element
        // rather than emitting ~180 separate nodes.
        const buckets = ['', '', '', '', ''];
        for (let cx = 0; cx < 30; cx++) {
            for (let cy = 0; cy < 20; cy++) {
                if (rnd() <= 0.7) continue;
                const x = cx * 20 + (rnd() - 0.5) * 8;
                const y = cy * 20 + (rnd() - 0.5) * 8;
                const kind = Math.floor(5 * rnd());
                buckets[kind] += this.microPattern(kind, x, y, 20);
            }
        }
        buckets.forEach((d, i) => {
            if (!d) return;
            this.el('path', {
                d: d, fill: 'none', stroke: colors[i % colors.length], 'stroke-width': 0.5
            }, g);
        });
    }

    microPattern(kind, x, y, s) {
        let d = '';
        if (kind === 0) {
            for (let i = 0; i < 4; i++) {
                const o = i * (s / 4);
                d += 'M ' + (x) + ' ' + (y + o) + ' L ' + (x + s) + ' ' + (y + o) + ' ';
                d += 'M ' + (x + o) + ' ' + (y) + ' L ' + (x + o) + ' ' + (y + s) + ' ';
            }
        } else if (kind === 1) {
            const step = s / 3;
            const r = s / 20;
            for (let i = 0; i < 3; i++) {
                for (let j = 0; j < 3; j++) {
                    const px = x + i * step + step / 2;
                    const py = y + j * step + step / 2;
                    d += 'M ' + (px - r) + ' ' + py + ' a ' + r + ',' + r + ' 0 1,0 ' + (2 * r) + ',0 a ' +
                        r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0 ';
                }
            }
        } else if (kind === 2) {
            d += 'M ' + x + ' ' + (y + s / 2);
            for (let i = 0; i <= s; i += s / 20) {
                d += ' L ' + (x + i).toFixed(1) + ' ' +
                    (y + s / 2 + (s / 8) * Math.sin((i / s) * Math.PI * 4)).toFixed(1);
            }
            d += ' ';
        } else if (kind === 3) {
            const step = s / 4;
            d += 'M ' + x + ' ' + y;
            for (let i = 0; i < 4; i++) {
                d += ' L ' + (x + i * step) + ' ' + (i % 2 === 0 ? y : y + s) +
                    ' L ' + (x + (i + 1) * step) + ' ' + (i % 2 === 0 ? y + s : y);
            }
            d += ' ';
        } else {
            d += 'M ' + (x + s / 2) + ' ' + (y + s / 2);
            for (let i = 0; i <= 20; i++) {
                const angle = (i / 20) * Math.PI * 6;
                const r = (i / 20) * (s / 2);
                d += ' L ' + (x + s / 2 + Math.cos(angle) * r).toFixed(1) + ' ' +
                    (y + s / 2 + Math.sin(angle) * r).toFixed(1);
            }
            d += ' ';
        }
        return d;
    }

    voronoi(root, a, colors) {
        const rnd = this.stream('voronoi');
        const g = this.el('g', null, root);
        const sites = [];
        const count = 10 + Math.floor(15 * rnd());
        for (let i = 0; i < count; i++) sites.push({ x: 600 * rnd(), y: 400 * rnd(), i: i });

        // Sample the plane, group by nearest site, then hull each group.
        const groups = sites.map(function () { return []; });
        for (let x = 0; x < 600; x += 12) {
            for (let y = 0; y < 400; y += 12) {
                let best = 0;
                let bestD = Infinity;
                for (let s = 0; s < sites.length; s++) {
                    const dx = sites[s].x - x;
                    const dy = sites[s].y - y;
                    const d = dx * dx + dy * dy;
                    if (d < bestD) { bestD = d; best = s; }
                }
                groups[best].push({ x: x, y: y });
            }
        }
        groups.forEach((pts, i) => {
            const hull = this.convexHull(pts);
            if (hull.length < 3) return;
            let d = 'M ' + hull[0].x + ' ' + hull[0].y;
            for (let k = 1; k < hull.length; k++) d += ' L ' + hull[k].x + ' ' + hull[k].y;
            this.el('path', {
                d: d + ' Z', fill: 'none',
                stroke: colors[(i + 2) % colors.length], 'stroke-width': 0.8, 'stroke-opacity': 0.35
            }, g);
        });
    }

    /** Andrew's monotone chain -- the previous angular sort mishandled ties. */
    convexHull(points) {
        if (points.length < 3) return points;
        const pts = points.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
        const cross = function (o, a, b) {
            return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
        };
        const lower = [];
        for (const p of pts) {
            while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
            lower.push(p);
        }
        const upper = [];
        for (let i = pts.length - 1; i >= 0; i--) {
            const p = pts[i];
            while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
            upper.push(p);
        }
        lower.pop();
        upper.pop();
        return lower.concat(upper);
    }

    particles(root, a, colors) {
        const rnd = this.stream('particles');
        const g = this.el('g', { opacity: 0.4 }, root);
        g.style.mixBlendMode = 'screen';
        const count = 80 + Math.floor(100 * rnd());
        for (let i = 0; i < count; i++) {
            let x = 600 * rnd();
            let y = 400 * rnd();
            let d = 'M ' + x.toFixed(1) + ' ' + y.toFixed(1);
            for (let s = 0; s < 5; s++) {
                const angle = rnd() * Math.PI * 2;
                const len = 5 + 15 * rnd();
                x += Math.cos(angle) * len;
                y += Math.sin(angle) * len;
                d += ' L ' + x.toFixed(1) + ' ' + y.toFixed(1);
            }
            this.el('path', {
                d: d, fill: 'none',
                stroke: colors[Math.floor(rnd() * colors.length)],
                'stroke-width': (1 + 2 * rnd()).toFixed(2)
            }, g);
        }
    }

    lightRays(root, a, colors) {
        const rnd = this.stream('lightRays');
        const g = this.el('g', null, root);
        g.style.mixBlendMode = 'screen';
        const count = 6 + Math.floor(8 * rnd());
        const ox = 300 + 220 * (rnd() - 0.5);
        const oy = 140 + 180 * (rnd() - 0.5);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2 + rnd() * 0.5;
            const len = 320 + 260 * rnd();
            const spread = 0.04 + 0.07 * rnd();
            const ex = ox + Math.cos(angle) * len;
            const ey = oy + Math.sin(angle) * len;
            const color = colors[Math.floor(rnd() * colors.length)];

            // userSpaceOnUse so the fade runs along the ray itself rather than
            // down the bounding box, which would be wrong for any ray not
            // pointing straight down.
            const id = 'ray' + i;
            const grad = this.el('linearGradient', {
                id: id, gradientUnits: 'userSpaceOnUse',
                x1: ox.toFixed(1), y1: oy.toFixed(1), x2: ex.toFixed(1), y2: ey.toFixed(1)
            }, this.defs);
            if (!grad) break;
            this.el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.5 }, grad);
            this.el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }, grad);

            this.el('path', {
                d: 'M ' + ox.toFixed(1) + ' ' + oy.toFixed(1) +
                    ' L ' + (ox + Math.cos(angle - spread) * len).toFixed(1) + ' ' +
                    (oy + Math.sin(angle - spread) * len).toFixed(1) +
                    ' L ' + (ox + Math.cos(angle + spread) * len).toFixed(1) + ' ' +
                    (oy + Math.sin(angle + spread) * len).toFixed(1) + ' Z',
                fill: 'url(#' + id + ')'
            }, g);
        }
    }

    /** Pulls the eye to the middle instead of letting the piece read flat. */
    vignette(root) {
        const grad = this.el('radialGradient', { id: 'vignette', cx: '50%', cy: '50%', r: '72%' }, this.defs);
        this.el('stop', { offset: '50%', 'stop-color': '#000', 'stop-opacity': 0 }, grad);
        this.el('stop', { offset: '100%', 'stop-color': '#000', 'stop-opacity': 0.6 }, grad);
        this.el('rect', { width: 600, height: 400, fill: 'url(#vignette)', 'pointer-events': 'none' }, root);
    }

    /**
     * A gentle grade. The previous version scaled a channel by an unbounded
     * complexity figure and routinely multiplied green by 5x.
     */
    colorGrade(a) {
        const warm = a.warmth * 0.12;
        const lum = a.luminance * 0.08;
        const clamp = function (v) { return Math.max(0.75, Math.min(1.3, v)); };
        return [
            clamp(1 + warm + lum), 0, 0, 0, 0,
            0, clamp(1 + lum), 0, 0, 0,
            0, 0, clamp(1 - warm + lum), 0, 0,
            0, 0, 0, 1, 0
        ];
    }

    /* ------------------------------------------------------------------ *
     * Orchestration
     * ------------------------------------------------------------------ */

    setStatus(message, isError) {
        if (!this.status) return;
        this.status.textContent = message || '';
        this.status.classList.toggle('error', !!isError);
    }

    updateProgress(done, total) {
        const loading = document.getElementById('loading');
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
        loading.querySelector('.progress').textContent = pct + '%';
        loading.querySelector('.loading-bar-fill').style.width = pct + '%';
    }

    clearCanvas() {
        while (this.canvas.firstChild) this.canvas.removeChild(this.canvas.firstChild);
    }

    async generate() {
        // Every run gets a token. A run whose token is stale when it finishes
        // discards its output instead of writing into a canvas that a newer
        // run already owns.
        const token = ++this.token;
        const text = this.input.value;
        const loading = document.getElementById('loading');

        this.text = text;

        if (!text.trim()) {
            this.clearCanvas();
            loading.classList.add('hidden');
            this.setStatus('');
            this.setExportEnabled(false);
            return;
        }

        loading.classList.remove('hidden');
        this.updateProgress(0, 1);
        this.setStatus('');

        try {
            const analysis = this.analyzeText(text);
            const paletteName = this.choosePalette(analysis);
            const colors = this.palettes[paletteName];

            this.budget = 4000;
            // Build off-screen, so a superseded run never shows partial output.
            const fragment = document.createElementNS(SVG_NS, 'g');
            this.defs = document.createElementNS(SVG_NS, 'defs');

            const steps = [
                { name: 'background', run: () => this.background(fragment, analysis, colors), always: true },
                { name: 'texture', run: () => this.texture(fragment, analysis) },
                { name: 'flowField', run: () => this.flowField(fragment, analysis, colors) },
                { name: 'mainShapes', run: () => this.mainShapes(fragment, analysis, colors) },
                { name: 'details', run: () => this.details(fragment, analysis, colors) },
                { name: 'highlights', run: () => this.highlights(fragment, analysis, colors) },
                { name: 'patterns', run: () => this.patterns(fragment, analysis, colors) },
                { name: 'voronoi', run: () => this.voronoi(fragment, analysis, colors) },
                { name: 'particles', run: () => this.particles(fragment, analysis, colors) },
                { name: 'lightRays', run: () => this.lightRays(fragment, analysis, colors) },
                { name: 'noise', run: () => this.noise(fragment, analysis) },
                { name: 'vignette', run: () => this.vignette(fragment), always: true }
            ].filter((s) => s.always || this.layerSettings[s.name]);

            let done = 0;
            for (const step of steps) {
                if (token !== this.token) return;      // superseded mid-render
                step.run();
                done++;
                this.updateProgress(done, steps.length);
                await new Promise((r) => requestAnimationFrame(r));
            }

            if (token !== this.token) return;

            const graded = document.createElementNS(SVG_NS, 'g');
            const filter = this.el('filter', { id: 'grade' }, this.defs);
            this.el('feColorMatrix', { type: 'matrix', values: this.colorGrade(analysis).join(' ') }, filter);
            graded.setAttribute('filter', 'url(#grade)');
            graded.appendChild(fragment);

            this.clearCanvas();
            this.canvas.appendChild(this.defs);
            this.canvas.appendChild(graded);

            this.setStatus(analysis.words.length + ' words · ' + paletteName + ' palette · ' +
                (4000 - this.budget) + ' shapes');
            this.setExportEnabled(true);
        } catch (err) {
            console.error('Dream Weaver failed to render:', err);
            this.setStatus('Could not weave that: ' + err.message, true);
        } finally {
            if (token === this.token) {
                this.updateProgress(1, 1);
                await new Promise((r) => setTimeout(r, 250));
                loading.classList.add('hidden');
            }
        }
    }

    debouncedGenerate() {
        if (this.debounceTimeout) clearTimeout(this.debounceTimeout);
        this.debounceTimeout = setTimeout(() => this.generate(), this.debounceDelay);
    }

    /* ------------------------------------------------------------------ *
     * Export
     * ------------------------------------------------------------------ */

    setExportEnabled(enabled) {
        const btn = document.getElementById('download');
        if (btn) btn.disabled = !enabled;
    }

    async downloadPng() {
        const scale = 2;
        const source = new XMLSerializer().serializeToString(this.canvas);
        const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        try {
            const img = await new Promise((resolve, reject) => {
                const image = new Image();
                image.onload = () => resolve(image);
                image.onerror = () => reject(new Error('could not rasterise the SVG'));
                image.src = url;
            });
            const c = document.createElement('canvas');
            c.width = 600 * scale;
            c.height = 400 * scale;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0, c.width, c.height);
            const a = document.createElement('a');
            a.download = 'dream-' + this.hashText(this.text).toString(36) + '.png';
            a.href = c.toDataURL('image/png');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        } catch (err) {
            this.setStatus('Export failed: ' + err.message, true);
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    /* ------------------------------------------------------------------ *
     * Controls
     * ------------------------------------------------------------------ */

    initialiseControls() {
        this.input.addEventListener('input', () => this.debouncedGenerate());

        const toggle = document.querySelector('.settings-toggle');
        const content = document.querySelector('.settings-content');
        if (toggle && content) {
            toggle.addEventListener('click', () => content.classList.toggle('hidden'));
        }

        document.querySelectorAll('.setting-item input').forEach((box) => {
            box.addEventListener('change', () => {
                this.layerSettings[box.dataset.layer] = box.checked;
                // Debounced like every other trigger. Previously this called
                // generate() directly, so five quick toggles started five
                // concurrent renders.
                this.debouncedGenerate();
            });
        });

        const vary = document.getElementById('vary');
        if (vary) {
            vary.addEventListener('click', () => {
                this.variation++;
                this.generate();
            });
        }

        const download = document.getElementById('download');
        if (download) download.addEventListener('click', () => this.downloadPng());

        const palette = document.getElementById('palette');
        if (palette) {
            Object.keys(this.palettes).forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                palette.appendChild(option);
            });
            palette.addEventListener('change', () => {
                this.paletteOverride = palette.value || null;
                this.generate();
            });
        }

        this.setExportEnabled(false);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.dreamWeaver = new DreamWeaver();
});
