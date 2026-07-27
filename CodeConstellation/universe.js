/**
 * Code Constellation -- renderer and interaction.
 *
 * Every visual property is bound to something the parser actually measured,
 * so the picture is readable as a map rather than as decoration:
 *
 *   star size      lines of code
 *   star colour    cyclomatic complexity, blue (simple) -> red (a giant, late
 *                  in its life and close to collapse)
 *   corona         fan-in: how much else depends on this function
 *   planets        variables declared in that function's scope
 *   comet trails   call edges, particles travelling caller -> callee
 *   ring           self-recursion
 *   binary pair    mutual recursion, two stars sharing a barycentre
 *   black hole     nothing calls it: dead code
 *   nebula         a connected component -- one region of the call graph
 */
(function () {
    'use strict';

    /* --------------------------------------------------------------------- *
     * Tunables
     * --------------------------------------------------------------------- */

    const REPULSION = 26000;
    const SPRING = 0.0016;
    const SPRING_REST = 190;
    const CENTERING = 0.0009;
    const DAMPING = 0.86;
    const MAX_SPEED = 6;
    const BINARY_PULL = 0.02;

    const MAX_PLANETS_SHOWN = 8;
    const MAX_PARTICLES_PER_EDGE = 4;

    // Complexity -> stellar evolution. Ordered simple to gnarly.
    const SPECTRUM = [
        { max: 2, label: 'Blue dwarf', color: [140, 178, 255], hint: 'trivial' },
        { max: 4, label: 'Blue-white', color: [176, 200, 255], hint: 'simple' },
        { max: 7, label: 'White', color: [226, 234, 255], hint: 'moderate' },
        { max: 11, label: 'Yellow', color: [255, 236, 186], hint: 'branchy' },
        { max: 16, label: 'Orange giant', color: [255, 190, 120], hint: 'heavy' },
        { max: 24, label: 'Red giant', color: [255, 138, 92], hint: 'refactor' },
        { max: Infinity, label: 'Red supergiant', color: [255, 92, 78], hint: 'collapse risk' }
    ];

    function spectrumFor(complexity) {
        for (let i = 0; i < SPECTRUM.length; i++) {
            if (complexity <= SPECTRUM[i].max) return SPECTRUM[i];
        }
        return SPECTRUM[SPECTRUM.length - 1];
    }

    const rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

    /* --------------------------------------------------------------------- *
     * State
     * --------------------------------------------------------------------- */

    const state = {
        analysis: null,
        stars: [],
        edges: [],
        nebulae: [],
        layers: [],
        selected: null,
        hovered: null,
        related: new Set(),
        alpha: 1,
        paused: false,
        showLabels: true,
        time: 0
    };

    const camera = { x: 0, y: 0, zoom: 1, tx: 0, ty: 0, tzoom: 1 };
    const pointer = { x: 0, y: 0, down: false, dragged: false, lastX: 0, lastY: 0 };

    let canvas, ctx, dpr = 1;

    const $ = function (id) { return document.getElementById(id); };

    /* --------------------------------------------------------------------- *
     * Deterministic pseudo-random, seeded by name
     *
     * The same code must always produce the same constellation -- a layout
     * that reshuffles on every click is not a map of anything.
     * --------------------------------------------------------------------- */

    function seed(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return (h >>> 0) / 4294967296;
    }

    /* --------------------------------------------------------------------- *
     * Building the universe from an analysis
     * --------------------------------------------------------------------- */

    function build(analysis) {
        state.analysis = analysis;
        state.stars = [];
        state.edges = [];
        state.nebulae = [];
        state.selected = null;
        state.related = new Set();
        state.alpha = 1;

        const callable = analysis.functions.filter(function (f) { return !f.isClass; });
        const byId = new Map();

        callable.forEach(function (fn, i) {
            const s = seed(fn.name + fn.kind + i);
            const spectrum = spectrumFor(fn.complexity);
            const golden = Math.PI * (3 - Math.sqrt(5));
            const radius = 60 + Math.sqrt(i + 1) * 95;

            const star = {
                fn: fn,
                name: fn.name,
                label: fn.className ? fn.className + '.' + fn.name : fn.name,
                x: Math.cos(i * golden) * radius + (s - 0.5) * 40,
                y: Math.sin(i * golden) * radius + (s - 0.5) * 40,
                vx: 0, vy: 0,
                radius: Math.max(7, Math.min(34, 6 + Math.sqrt(fn.lines) * 3.2)),
                mass: Math.max(1, fn.lines),
                spectrum: spectrum,
                color: spectrum.color,
                isDeadCode: !!fn.isDeadCode,
                isEntry: !!fn.isEntryPoint,
                recursive: fn.recursive,
                pulse: s * Math.PI * 2,
                pulseSpeed: 0.012 + s * 0.02,
                planets: [],
                binaryWith: null
            };
            state.stars.push(star);
            byId.set(fn.id, star);
        });

        // Variables become planets orbiting the function that declares them.
        analysis.variables.forEach(function (v) {
            const host = v.owner !== null ? byId.get(v.owner) : null;
            if (!host) return;
            if (host.planets.length >= MAX_PLANETS_SHOWN) { host.hiddenPlanets = (host.hiddenPlanets || 0) + 1; return; }
            const s = seed(v.name + host.name);
            host.planets.push({
                name: v.name,
                kind: v.kind,
                size: v.kind === 'const' ? 3 : 2.2,
                orbit: host.radius + 18 + host.planets.length * 11,
                angle: s * Math.PI * 2,
                speed: (0.004 + s * 0.008) * (v.kind === 'const' ? 1 : -1)
            });
        });

        analysis.edges.forEach(function (e) {
            const from = byId.get(e.from);
            const to = byId.get(e.to);
            if (!from || !to) return;
            if (e.from === e.to) return;   // self-recursion draws as a ring
            const particles = [];
            const n = Math.min(MAX_PARTICLES_PER_EDGE, e.count);
            for (let i = 0; i < n; i++) particles.push(i / n);
            state.edges.push({ from: from, to: to, count: e.count, particles: particles });
        });

        analysis.binaryPairs.forEach(function (pair) {
            const a = byId.get(pair[0]);
            const b = byId.get(pair[1]);
            if (a && b) { a.binaryWith = b; b.binaryWith = a; }
        });

        buildNebulae();
        frameAll();
        renderPanel();
    }

    /** One nebula per connected component of the call graph. */
    function buildNebulae() {
        const parent = new Map();
        const find = function (x) {
            while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
            return x;
        };
        state.stars.forEach(function (s) { parent.set(s, s); });
        state.edges.forEach(function (e) {
            const a = find(e.from), b = find(e.to);
            if (a !== b) parent.set(a, b);
        });

        const groups = new Map();
        state.stars.forEach(function (s) {
            const root = find(s);
            if (!groups.has(root)) groups.set(root, []);
            groups.get(root).push(s);
        });

        state.nebulae = [];
        groups.forEach(function (members) {
            if (members.length < 2) return;
            state.nebulae.push({
                members: members,
                hue: seed(members[0].name) * 360,
                x: 0, y: 0, size: 0
            });
        });
    }

    /* --------------------------------------------------------------------- *
     * Force-directed layout with cooling
     * --------------------------------------------------------------------- */

    function simulate() {
        const stars = state.stars;
        if (state.alpha < 0.002) return;

        for (let i = 0; i < stars.length; i++) {
            const a = stars[i];
            for (let j = i + 1; j < stars.length; j++) {
                const b = stars[j];
                let dx = b.x - a.x;
                let dy = b.y - a.y;
                let d2 = dx * dx + dy * dy;
                if (d2 < 1) { d2 = 1; dx = (seed(a.name) - 0.5) || 0.5; dy = (seed(b.name) - 0.5) || 0.5; }
                const d = Math.sqrt(d2);
                const force = REPULSION / Math.max(d2, 400);
                const fx = (dx / d) * force;
                const fy = (dy / d) * force;
                a.vx -= fx; a.vy -= fy;
                b.vx += fx; b.vy += fy;
            }
        }

        state.edges.forEach(function (e) {
            const dx = e.to.x - e.from.x;
            const dy = e.to.y - e.from.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = SPRING * (d - SPRING_REST);
            const fx = (dx / d) * force * d;
            const fy = (dy / d) * force * d;
            e.from.vx += fx; e.from.vy += fy;
            e.to.vx -= fx; e.to.vy -= fy;
        });

        // Mutual recursion binds a pair tightly -- they read as one system.
        stars.forEach(function (s) {
            if (!s.binaryWith) return;
            const dx = s.binaryWith.x - s.x;
            const dy = s.binaryWith.y - s.y;
            s.vx += dx * BINARY_PULL;
            s.vy += dy * BINARY_PULL;
        });

        stars.forEach(function (s) {
            s.vx -= s.x * CENTERING;
            s.vy -= s.y * CENTERING;
            s.vx *= DAMPING;
            s.vy *= DAMPING;
            const speed = Math.hypot(s.vx, s.vy);
            if (speed > MAX_SPEED) {
                s.vx = (s.vx / speed) * MAX_SPEED;
                s.vy = (s.vy / speed) * MAX_SPEED;
            }
            s.x += s.vx * state.alpha;
            s.y += s.vy * state.alpha;
        });

        state.alpha *= 0.994;
    }

    /* --------------------------------------------------------------------- *
     * Camera
     * --------------------------------------------------------------------- */

    function worldToScreen(x, y) {
        return {
            x: (x - camera.x) * camera.zoom + canvas.clientWidth / 2,
            y: (y - camera.y) * camera.zoom + canvas.clientHeight / 2
        };
    }

    function screenToWorld(x, y) {
        return {
            x: (x - canvas.clientWidth / 2) / camera.zoom + camera.x,
            y: (y - canvas.clientHeight / 2) / camera.zoom + camera.y
        };
    }

    function frameAll() {
        if (!state.stars.length) {
            camera.tx = 0; camera.ty = 0; camera.tzoom = 1;
            return;
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        state.stars.forEach(function (s) {
            minX = Math.min(minX, s.x - s.radius * 4);
            maxX = Math.max(maxX, s.x + s.radius * 4);
            minY = Math.min(minY, s.y - s.radius * 4);
            maxY = Math.max(maxY, s.y + s.radius * 4);
        });
        camera.tx = (minX + maxX) / 2;
        camera.ty = (minY + maxY) / 2;
        const zx = canvas.clientWidth / Math.max(200, maxX - minX);
        const zy = canvas.clientHeight / Math.max(200, maxY - minY);
        camera.tzoom = Math.max(0.15, Math.min(1.6, Math.min(zx, zy) * 0.85));
    }

    function easeCamera() {
        camera.x += (camera.tx - camera.x) * 0.08;
        camera.y += (camera.ty - camera.y) * 0.08;
        camera.zoom += (camera.tzoom - camera.zoom) * 0.08;
    }

    /* --------------------------------------------------------------------- *
     * Background: parallax starfield
     * --------------------------------------------------------------------- */

    function buildLayers() {
        state.layers = [0.15, 0.35, 0.6].map(function (depth, li) {
            const count = 90 + li * 60;
            const stars = [];
            for (let i = 0; i < count; i++) {
                const s = seed('layer' + li + '-' + i);
                const s2 = seed('layerb' + li + '-' + i);
                stars.push({
                    x: (s - 0.5) * 4200,
                    y: (s2 - 0.5) * 4200,
                    size: 0.4 + s * (1.4 - depth),
                    twinkle: s2 * Math.PI * 2
                });
            }
            return { depth: depth, stars: stars };
        });
    }

    function drawLayers() {
        state.layers.forEach(function (layer) {
            ctx.save();
            layer.stars.forEach(function (s) {
                const x = (s.x - camera.x * layer.depth) * camera.zoom + canvas.clientWidth / 2;
                const y = (s.y - camera.y * layer.depth) * camera.zoom + canvas.clientHeight / 2;
                if (x < -20 || y < -20 || x > canvas.clientWidth + 20 || y > canvas.clientHeight + 20) return;
                const a = 0.25 + 0.35 * (Math.sin(state.time * 0.02 + s.twinkle) + 1) / 2;
                ctx.fillStyle = 'rgba(255,255,255,' + (a * layer.depth * 1.4) + ')';
                ctx.fillRect(x, y, s.size, s.size);
            });
            ctx.restore();
        });
    }

    function drawNebulae() {
        state.nebulae.forEach(function (n) {
            let cx = 0, cy = 0, maxR = 0;
            n.members.forEach(function (m) { cx += m.x; cy += m.y; });
            cx /= n.members.length; cy /= n.members.length;
            n.members.forEach(function (m) { maxR = Math.max(maxR, Math.hypot(m.x - cx, m.y - cy)); });

            const p = worldToScreen(cx, cy);
            const r = (maxR + 220) * camera.zoom;
            const breathe = 1 + Math.sin(state.time * 0.004 + n.hue) * 0.04;
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * breathe);
            g.addColorStop(0, 'hsla(' + n.hue + ', 80%, 60%, 0.10)');
            g.addColorStop(0.5, 'hsla(' + (n.hue + 40) + ', 80%, 50%, 0.05)');
            g.addColorStop(1, 'hsla(' + n.hue + ', 80%, 50%, 0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * breathe, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    /* --------------------------------------------------------------------- *
     * Edges
     * --------------------------------------------------------------------- */

    function edgeDimmed(e) {
        if (!state.selected) return false;
        return e.from !== state.selected && e.to !== state.selected;
    }

    function drawEdges() {
        state.edges.forEach(function (e) {
            const a = worldToScreen(e.from.x, e.from.y);
            const b = worldToScreen(e.to.x, e.to.y);
            const dim = edgeDimmed(e);
            const alpha = dim ? 0.05 : 0.3;

            // Bow the curve perpendicular to the line so two-way calls between
            // the same pair stay visually distinct.
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const bow = Math.min(60, len * 0.18) * camera.zoom;
            const cx = mx - (dy / len) * bow;
            const cy = my + (dx / len) * bow;

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(cx, cy, b.x, b.y);
            ctx.strokeStyle = rgba(e.from.color, alpha);
            ctx.lineWidth = Math.min(3, 0.6 + e.count * 0.35) * Math.max(0.5, camera.zoom);
            ctx.stroke();

            if (dim) return;

            // Particles travel caller -> callee, so direction is readable
            // without arrowheads.
            e.particles.forEach(function (t, i) {
                const u = t;
                const it = 1 - u;
                const px = it * it * a.x + 2 * it * u * cx + u * u * b.x;
                const py = it * it * a.y + 2 * it * u * cy + u * u * b.y;
                const fade = Math.sin(u * Math.PI);
                ctx.beginPath();
                ctx.arc(px, py, (1.6 + e.count * 0.2) * Math.max(0.6, camera.zoom), 0, Math.PI * 2);
                ctx.fillStyle = rgba(e.from.color, 0.85 * fade);
                ctx.fill();
                if (!state.paused) {
                    e.particles[i] = (u + 0.0035 + e.count * 0.0004) % 1;
                }
            });
        });
    }

    /* --------------------------------------------------------------------- *
     * Stars
     * --------------------------------------------------------------------- */

    function starDimmed(star) {
        if (!state.selected) return false;
        return star !== state.selected && !state.related.has(star);
    }

    function drawStar(star) {
        const p = worldToScreen(star.x, star.y);
        const dim = starDimmed(star);
        const globalAlpha = dim ? 0.18 : 1;
        const pulse = 1 + Math.sin(star.pulse) * 0.06;
        const r = star.radius * camera.zoom * pulse;

        if (p.x < -200 || p.y < -200 || p.x > canvas.clientWidth + 200 || p.y > canvas.clientHeight + 200) return;

        ctx.save();
        ctx.globalAlpha = globalAlpha;

        if (star.isDeadCode) {
            drawBlackHole(star, p, r);
            ctx.restore();
            drawStarLabel(star, p, r, dim);
            return;
        }

        // Corona: how much of the codebase leans on this function.
        if (star.fn.fanIn > 1) {
            const coronaR = r * (2.4 + Math.min(2, star.fn.fanIn * 0.3));
            const cg = ctx.createRadialGradient(p.x, p.y, r, p.x, p.y, coronaR);
            cg.addColorStop(0, rgba(star.color, 0.16));
            cg.addColorStop(1, rgba(star.color, 0));
            ctx.fillStyle = cg;
            ctx.beginPath();
            ctx.arc(p.x, p.y, coronaR, 0, Math.PI * 2);
            ctx.fill();
        }

        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        g.addColorStop(0, rgba(star.color, 0.95));
        g.addColorStop(0.28, rgba(star.color, 0.30));
        g.addColorStop(1, rgba(star.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = rgba(star.color, 1);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x - r * 0.25, p.y - r * 0.25, r * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fill();

        // Entry point: called by nothing, drives everything below it.
        if (star.isEntry) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(state.time * 0.006);
            ctx.beginPath();
            ctx.arc(0, 0, r * 1.75, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(122, 255, 198, 0.75)';
            ctx.lineWidth = 1.4;
            ctx.setLineDash([r * 0.9, r * 0.55]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Self-recursion: a ring the function traps itself in.
        if (star.recursive) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, r * 1.9, r * 0.7, state.time * 0.01, 0, Math.PI * 2);
            ctx.strokeStyle = rgba(star.color, 0.7);
            ctx.lineWidth = 1.4;
            ctx.stroke();
        }

        if (star === state.hovered || star === state.selected) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, r * 2.1, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        drawPlanets(star, p);
        ctx.restore();
        drawStarLabel(star, p, r, dim);
    }

    function drawBlackHole(star, p, r) {
        const spin = state.time * 0.01;
        // Accretion disc
        for (let i = 3; i >= 1; i--) {
            ctx.beginPath();
            ctx.ellipse(p.x, p.y, r * (1.6 + i * 0.45), r * (0.5 + i * 0.14), spin, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255,150,80,' + (0.30 / i) + ')';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        // Lensing halo, then the void itself
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.9, p.x, p.y, r * 2.2);
        g.addColorStop(0, 'rgba(255,190,120,0.55)');
        g.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = '#05060a';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,190,120,0.9)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    function drawPlanets(star, p) {
        if (camera.zoom < 0.35) return;
        star.planets.forEach(function (pl) {
            if (!state.paused) pl.angle += pl.speed;
            const orbit = pl.orbit * camera.zoom;
            const px = p.x + Math.cos(pl.angle) * orbit;
            const py = p.y + Math.sin(pl.angle) * orbit * 0.55;

            ctx.beginPath();
            ctx.ellipse(p.x, p.y, orbit, orbit * 0.55, 0, 0, Math.PI * 2);
            ctx.strokeStyle = rgba(star.color, 0.10);
            ctx.lineWidth = 0.7;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(px, py, pl.size * Math.max(0.7, camera.zoom), 0, Math.PI * 2);
            ctx.fillStyle = pl.kind === 'const' ? '#8fe3ff' : (pl.kind === 'let' ? '#b9ffcf' : '#ffd58f');
            ctx.fill();

            if (camera.zoom > 1.15) {
                ctx.fillStyle = 'rgba(255,255,255,0.5)';
                ctx.font = '9px ui-monospace, monospace';
                ctx.textAlign = 'center';
                ctx.fillText(pl.name, px, py - 6);
            }
        });
    }

    function drawStarLabel(star, p, r, dim) {
        if (!state.showLabels || camera.zoom < 0.28) return;
        ctx.save();
        ctx.globalAlpha = dim ? 0.2 : 1;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 6;
        ctx.font = (star === state.selected ? 'bold ' : '') +
            Math.max(10, Math.min(15, 11 * camera.zoom)) + 'px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(star.label, p.x, p.y + r + 15);
        if (star.fn.isAsync || star.recursive || star.isDeadCode || star.isEntry) {
            const tags = [];
            if (star.fn.isAsync) tags.push('async');
            if (star.recursive) tags.push('recursive');
            if (star.isEntry) tags.push('entry point');
            if (star.isDeadCode) tags.push('dead code');
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.font = '9px ui-monospace, monospace';
            ctx.fillText(tags.join(' · '), p.x, p.y + r + 27);
        }
        ctx.restore();
    }

    /* --------------------------------------------------------------------- *
     * Frame
     * --------------------------------------------------------------------- */

    function frame() {
        state.time++;
        if (!state.paused) simulate();
        easeCamera();

        ctx.fillStyle = '#04050a';
        ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);

        drawLayers();
        drawNebulae();
        drawEdges();
        state.stars.forEach(function (s) { if (!state.paused) s.pulse += s.pulseSpeed; });
        state.stars.forEach(drawStar);

        requestAnimationFrame(frame);
    }

    /* --------------------------------------------------------------------- *
     * Interaction
     * --------------------------------------------------------------------- */

    function starAt(sx, sy) {
        let best = null;
        let bestD = Infinity;
        state.stars.forEach(function (s) {
            const p = worldToScreen(s.x, s.y);
            const d = Math.hypot(p.x - sx, p.y - sy);
            const hit = Math.max(14, s.radius * camera.zoom * 1.8);
            if (d < hit && d < bestD) { best = s; bestD = d; }
        });
        return best;
    }

    function select(star) {
        state.selected = star;
        state.related = new Set();
        if (star) {
            state.edges.forEach(function (e) {
                if (e.from === star) state.related.add(e.to);
                if (e.to === star) state.related.add(e.from);
            });
            camera.tx = star.x;
            camera.ty = star.y;
            camera.tzoom = Math.max(camera.zoom, 1.1);
        }
        renderPanel();
    }

    function showTooltip(star, sx, sy) {
        const el = $('tooltip');
        if (!star) { el.hidden = true; return; }
        const fn = star.fn;
        el.innerHTML =
            '<strong>' + escapeHtml(star.label) + '</strong>' +
            '<span class="tt-kind">' + fn.kind + (fn.isAsync ? ' · async' : '') + '</span>' +
            '<dl>' +
            '<div><dt>lines</dt><dd>' + fn.lines + '</dd></div>' +
            '<div><dt>complexity</dt><dd>' + fn.complexity + ' <em>' + star.spectrum.hint + '</em></dd></div>' +
            '<div><dt>nesting</dt><dd>' + fn.maxDepth + '</dd></div>' +
            '<div><dt>params</dt><dd>' + fn.params.length + '</dd></div>' +
            '<div><dt>called by</dt><dd>' + fn.fanIn + '</dd></div>' +
            '<div><dt>calls</dt><dd>' + fn.fanOut + '</dd></div>' +
            '</dl>';
        el.hidden = false;
        const rect = canvas.getBoundingClientRect();
        const w = el.offsetWidth;
        el.style.left = Math.min(rect.width - w - 12, Math.max(12, sx + 16)) + 'px';
        el.style.top = Math.min(rect.height - el.offsetHeight - 12, Math.max(12, sy + 16)) + 'px';
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    /* --------------------------------------------------------------------- *
     * Panel
     * --------------------------------------------------------------------- */

    function renderPanel() {
        const el = $('readout');
        if (!state.analysis) { el.innerHTML = ''; return; }
        const st = state.analysis.stats;

        if (state.selected) {
            const fn = state.selected.fn;
            const callers = state.edges.filter(function (e) { return e.to === state.selected; })
                .map(function (e) { return e.from.label; });
            const callees = state.edges.filter(function (e) { return e.from === state.selected; })
                .map(function (e) { return e.to.label; });

            el.innerHTML =
                '<button class="back" id="deselect">&larr; whole constellation</button>' +
                '<h2>' + escapeHtml(state.selected.label) + '</h2>' +
                '<p class="sub">' + fn.kind + (fn.isAsync ? ' · async' : '') +
                (fn.isStatic ? ' · static' : '') + (fn.recursive ? ' · recursive' : '') +
                ' · line ' + fn.line + '</p>' +
                statRow('Lines', fn.lines) +
                statRow('Complexity', fn.complexity + ' (' + state.selected.spectrum.label + ')') +
                statRow('Max nesting', fn.maxDepth) +
                statRow('Parameters', fn.params.length ? fn.params.join(', ') : 'none') +
                statRow('Called by', callers.length ? callers.join(', ') : '— nothing') +
                statRow('Calls', callees.length ? callees.join(', ') : '— nothing') +
                '<h3>Source</h3>' +
                '<pre class="src">' + escapeHtml(fn.body.slice(0, 1400)) + '</pre>';
            const btn = $('deselect');
            if (btn) btn.addEventListener('click', function () { select(null); frameAll(); });
            return;
        }

        const worst = st.mostComplex;
        el.innerHTML =
            '<h2>Star chart</h2>' +
            '<div class="grid">' +
            tile(st.functionCount, 'functions') +
            tile(st.variableCount, 'variables') +
            tile(st.edgeCount, 'call edges') +
            tile(st.totalLines, 'lines') +
            tile(st.averageComplexity.toFixed(1), 'avg complexity') +
            tile(st.longestChain, 'deepest call chain') +
            '</div>' +
            (worst ? '<h3>Brightest giant</h3>' +
                '<p class="note"><strong>' + escapeHtml(worst.name) + '</strong> — complexity ' +
                worst.complexity + ', ' + worst.lines + ' lines, nesting ' + worst.maxDepth +
                '. ' + escapeHtml(spectrumFor(worst.complexity).label) + '.</p>' : '') +
            (st.entryPoints.length ? '<h3>Entry points</h3><p class="note">Called by nothing, but drive ' +
                'everything below them: ' +
                st.entryPoints.map(function (f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(', ') +
                '.</p>' : '') +
            (st.deadCode.length ? '<h3>Black holes</h3><p class="note">Calls nothing and is called by nothing — ' +
                st.deadCode.map(function (f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(', ') +
                '. Almost certainly dead.</p>' : '') +
            (st.recursive.length ? '<h3>Ringed stars</h3><p class="note">Self-recursive: ' +
                st.recursive.map(function (f) { return '<strong>' + escapeHtml(f.name) + '</strong>'; }).join(', ') +
                '.</p>' : '') +
            (state.analysis.binaryPairs.length ? '<h3>Binary systems</h3><p class="note">' +
                state.analysis.binaryPairs.length + ' mutually recursive pair(s) locked in orbit.</p>' : '') +
            '<h3>Legend</h3>' +
            '<ul class="legend">' +
            '<li><span class="sw" style="background:#8fb2ff"></span>simple &rarr; ' +
            '<span class="sw" style="background:#ff5c4e"></span>complex (star colour)</li>' +
            '<li><span class="dot"></span>size = lines of code</li>' +
            '<li><span class="dot glow"></span>corona = many callers</li>' +
            '<li><span class="dot ring"></span>ring = self-recursive</li>' +
            '<li><span class="dot entry"></span>beacon = entry point (nothing calls it, it calls others)</li>' +
            '<li><span class="dot hole"></span>black hole = dead code (calls nothing, called by nothing)</li>' +
            '<li>planets = variables in scope · particles flow caller &rarr; callee</li>' +
            '</ul>' +
            '<p class="hint">Click a star to focus it. Scroll to zoom, drag to pan.</p>';
    }

    function tile(value, label) {
        return '<div class="tile"><span class="v">' + value + '</span><span class="l">' + label + '</span></div>';
    }

    function statRow(k, v) {
        return '<div class="row"><span class="k">' + k + '</span><span class="v">' + escapeHtml(String(v)) + '</span></div>';
    }

    /* --------------------------------------------------------------------- *
     * Wiring
     * --------------------------------------------------------------------- */

    function resize() {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = canvas.clientWidth * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function regenerate() {
        const src = $('code-input').value;
        try {
            build(window.CodeParser.analyze(src));
            const n = state.analysis.stats.functionCount;
            setStatus(n === 0
                ? 'No functions found — paste some JavaScript with functions in it.'
                : 'Mapped ' + n + ' function' + (n === 1 ? '' : 's') + ', ' +
                  state.analysis.stats.edgeCount + ' call edges.');
        } catch (e) {
            setStatus('Could not analyse that: ' + e.message);
        }
    }

    function setStatus(text) {
        const el = $('status');
        if (el) el.textContent = text;
    }

    document.addEventListener('DOMContentLoaded', function () {
        canvas = $('universe');
        ctx = canvas.getContext('2d');
        resize();
        buildLayers();

        window.addEventListener('resize', function () { resize(); frameAll(); });

        canvas.addEventListener('mousemove', function (ev) {
            const rect = canvas.getBoundingClientRect();
            const sx = ev.clientX - rect.left;
            const sy = ev.clientY - rect.top;
            if (pointer.down) {
                pointer.dragged = true;
                camera.tx -= (sx - pointer.lastX) / camera.zoom;
                camera.ty -= (sy - pointer.lastY) / camera.zoom;
                camera.x = camera.tx; camera.y = camera.ty;
                pointer.lastX = sx; pointer.lastY = sy;
                showTooltip(null);
                return;
            }
            pointer.lastX = sx; pointer.lastY = sy;
            state.hovered = starAt(sx, sy);
            canvas.style.cursor = state.hovered ? 'pointer' : 'grab';
            showTooltip(state.hovered, sx, sy);
        });

        canvas.addEventListener('mousedown', function (ev) {
            const rect = canvas.getBoundingClientRect();
            pointer.down = true;
            pointer.dragged = false;
            pointer.lastX = ev.clientX - rect.left;
            pointer.lastY = ev.clientY - rect.top;
            canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', function (ev) {
            if (!pointer.down) return;
            pointer.down = false;
            canvas.style.cursor = 'grab';
            if (pointer.dragged) return;
            const rect = canvas.getBoundingClientRect();
            select(starAt(ev.clientX - rect.left, ev.clientY - rect.top));
        });

        canvas.addEventListener('mouseleave', function () { showTooltip(null); state.hovered = null; });

        canvas.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const before = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
            const factor = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
            camera.tzoom = Math.max(0.12, Math.min(4, camera.tzoom * factor));
            camera.zoom = camera.tzoom;
            const after = screenToWorld(ev.clientX - rect.left, ev.clientY - rect.top);
            camera.tx += before.x - after.x;
            camera.ty += before.y - after.y;
            camera.x = camera.tx; camera.y = camera.ty;
        }, { passive: false });

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape') { select(null); frameAll(); }
            if (ev.target.tagName === 'TEXTAREA') return;
            if (ev.key === ' ') { ev.preventDefault(); state.paused = !state.paused; $('pause').textContent = state.paused ? 'Resume' : 'Pause'; }
            if (ev.key === 'l' || ev.key === 'L') state.showLabels = !state.showLabels;
        });

        $('generate').addEventListener('click', regenerate);
        $('fit').addEventListener('click', function () { select(null); frameAll(); });
        $('pause').addEventListener('click', function () {
            state.paused = !state.paused;
            $('pause').textContent = state.paused ? 'Resume' : 'Pause';
        });
        $('toggle-editor').addEventListener('click', function () {
            const open = document.body.classList.toggle('editor-open');
            $('toggle-editor').textContent = open ? 'Hide code' : 'Show code';
        });

        regenerate();
        frame();
    });
})();
