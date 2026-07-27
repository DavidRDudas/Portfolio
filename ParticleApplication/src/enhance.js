/**
 * Runtime fixes and instrumentation for the particle simulator.
 * ===========================================================================
 * Two things were wrong and one was missing.
 *
 * 1. The canvas was sized once at load with no resize handler, so shrinking
 *    the window left the drawing surface larger than the viewport (the page
 *    gained a horizontal scrollbar) while the physics boundaries stayed at the
 *    old dimensions -- particles bounced off walls that were no longer where
 *    the edge of the visible area was. The SpatialGrid was built from those
 *    same stale dimensions, so broad-phase collision buckets were wrong too.
 *
 * 2. The animation loop fed the raw frame delta straight into update(), which
 *    clamps it to 0.016. That makes the physics framerate-dependent: below
 *    ~62fps the simulation silently runs in slow motion, and collision
 *    response varies with whatever the browser happened to schedule. A fixed
 *    timestep with an accumulator decouples the two.
 *
 * 3. It is a physics simulator with no way to see whether the physics is
 *    behaving. Live kinetic energy and total momentum make drift visible --
 *    with gravity off and elasticity at 1.00 both should hold roughly steady,
 *    and any integrator error shows up immediately.
 */
(function () {
    'use strict';

    if (typeof ParticleSystem === 'undefined') return;

    const proto = ParticleSystem.prototype;

    /* --------------------------------------------------------------------- *
     * Resize
     * --------------------------------------------------------------------- */

    /**
     * Match the drawing surface to the space actually available, rebuild the
     * broad-phase grid for the new extent, and pull any particle that is now
     * outside the world back inside it.
     */
    proto.resizeTo = function (width, height) {
        const w = Math.max(200, Math.floor(width));
        const h = Math.max(200, Math.floor(height));
        if (this.canvas.width === w && this.canvas.height === h) return false;

        this.canvas.width = w;
        this.canvas.height = h;

        // The grid caches cols/rows from the dimensions it was built with.
        const cellSize = (this.grid && this.grid.cellSize) || 50;
        this.grid = new SpatialGrid(w, h, cellSize);

        this.particles.forEach(function (p) {
            const r = p.radius || 1;
            if (p.x < r) p.x = r;
            if (p.x > w - r) p.x = w - r;
            if (p.y < r) p.y = r;
            if (p.y > h - r) p.y = h - r;
        });
        return true;
    };

    /* --------------------------------------------------------------------- *
     * Diagnostics
     * --------------------------------------------------------------------- */

    /** Totals over the real (non-effect) particles. */
    proto.measure = function () {
        let ke = 0;
        let px = 0;
        let py = 0;
        let count = 0;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p.isEffect) continue;
            const m = p.mass || 1;
            const vx = p.vx || 0;
            const vy = p.vy || 0;
            if (!Number.isFinite(vx) || !Number.isFinite(vy)) continue;
            ke += 0.5 * m * (vx * vx + vy * vy);
            px += m * vx;
            py += m * vy;
            count++;
        }
        return { kinetic: ke, momentum: Math.hypot(px, py), count: count };
    };

    /* --------------------------------------------------------------------- *
     * Input validation
     *
     * addParticle() took raw coordinates and did no checking, so a bad call
     * produced a particle whose position was NaN -- or, if an object was
     * passed, a position that was an object, after which `x += vx * dt`
     * silently became string concatenation and the particle was gone for good
     * without any error being raised.
     * --------------------------------------------------------------------- */

    const originalAdd = proto.addParticle;
    proto.addParticle = function () {
        const result = originalAdd.apply(this, arguments);
        const p = this.particles[this.particles.length - 1];
        if (p && (!Number.isFinite(p.x) || !Number.isFinite(p.y) ||
                  !Number.isFinite(p.vx) || !Number.isFinite(p.vy))) {
            this.particles.pop();
            console.warn('ParticleSystem.addParticle: rejected a particle with a non-finite state', p);
            return null;
        }
        return result;
    };

    /* --------------------------------------------------------------------- *
     * Fixed-timestep driver
     * --------------------------------------------------------------------- */

    const FIXED_DT = 1 / 120;      // physics step, independent of frame rate
    const MAX_STEPS = 5;           // ceiling so a long stall cannot spiral
    const MAX_FRAME = 0.25;        // ignore anything longer than this

    window.SimulationDriver = function (system, canvas, hooks) {
        hooks = hooks || {};
        let accumulator = 0;
        let last = performance.now();
        let paused = false;
        let stepOnce = false;
        let simulatedSteps = 0;

        /**
         * CSS owns the layout: the panel is pinned and the canvas takes the
         * remaining flex space. All this does is match the backing store to
         * the box the browser actually gave it. Measuring the panel and
         * computing a width from it fed the flex algorithm its own output --
         * the panel got squeezed below its basis and the canvas still spilled
         * past the viewport.
         */
        function fit() {
            const rect = canvas.getBoundingClientRect();
            const w = Math.floor(rect.width);
            const h = Math.floor(Math.max(200, document.documentElement.clientHeight - rect.top - 2));
            canvas.style.height = h + 'px';
            if (system.resizeTo(w, h) && hooks.onResize) hooks.onResize();
        }

        function frame(now) {
            const elapsed = Math.min(MAX_FRAME, (now - last) / 1000);
            last = now;

            if (!paused) {
                accumulator += elapsed;
                let steps = 0;
                while (accumulator >= FIXED_DT && steps < MAX_STEPS) {
                    system.update(FIXED_DT);
                    accumulator -= FIXED_DT;
                    steps++;
                    simulatedSteps++;
                }
                // Drop the backlog rather than trying to catch up forever.
                if (steps === MAX_STEPS) accumulator = 0;
            } else if (stepOnce) {
                system.update(FIXED_DT);
                simulatedSteps++;
                stepOnce = false;
            }

            system.render();
            if (hooks.onFrame) hooks.onFrame({ paused: paused, steps: simulatedSteps });
            requestAnimationFrame(frame);
        }

        window.addEventListener('resize', fit);
        fit();
        requestAnimationFrame(frame);

        return {
            isPaused: function () { return paused; },
            setPaused: function (v) { paused = !!v; accumulator = 0; last = performance.now(); },
            toggle: function () { this.setPaused(!paused); return paused; },
            step: function () { stepOnce = true; },
            fit: fit
        };
    };
})();
