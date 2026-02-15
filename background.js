class BackgroundEffect {
    constructor() {
        this.canvas = document.getElementById('backgroundCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.theme = document.documentElement.getAttribute('data-theme') || 'dark';
        this.time = 0;
        this.mouse = { x: -9999, y: -9999 };
        this.dpr = 1;

        // Mobile detection for performance scaling
        this.isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);

        // Grid config (for background ambient effects only)
        this.cellSize = 14;
        this.cols = 0;
        this.rows = 0;
        this.nodes = [];

        // ASCII character ramps
        this.chars = ' .·:;-=+*#%@';

        // Galaxy
        this.galaxyStars = [];
        this.galaxyDust = [];
        this.galaxyAngle = 0;

        // Fractal (Julia set)
        this.fractalBuffer = null;
        this.fractalChars = ' .·:;~=+*#%@$';
        this.frameCount = 0;

        // Click waves
        this.waves = [];

        // Mouse afterglow trail
        this.mouseTrail = [];
        this.lastTrailTime = 0;

        // Parallax offset
        this.parallaxX = 0;
        this.parallaxY = 0;

        // Ambient sparkle particles
        this.sparkles = [];

        // Black hole transition
        this.bhPhase = 0;       // 0 = galaxy, 1 = full black hole
        this.bhTime = 0;        // cycle timer
        this.bhSpinBoost = 0;   // extra spin from angular momentum conservation

        this._createGalaxy();
        this.resize();
        this._bindEvents();
        this._initSparkles();
    }

    // ============================================
    //  Galaxy particle generation
    // ============================================
    _createGalaxy() {
        this.galaxyStars = [];
        this.galaxyDust = [];

        const mob = this.isMobile;
        const numArms = mob ? 4 : 5;
        const armStars = mob ? 400 : 1200;
        const coreStars = mob ? 400 : 1200;
        const haloStars = mob ? 100 : 300;
        const dustParticles = mob ? 500 : 1500;

        // --- Spiral arm stars ---
        for (let arm = 0; arm < numArms; arm++) {
            const armAngle = (arm / numArms) * Math.PI * 2;

            for (let i = 0; i < armStars; i++) {
                const r = Math.pow(Math.random(), 0.5) * 1.3;
                const spiralTwist = 5.0;
                const spiralAngle = armAngle + r * spiralTwist;
                const scatter = (Math.random() - 0.5) * (0.35 + r * 0.55);
                const angle = spiralAngle + scatter;

                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                const z = (Math.random() - 0.5) * 0.05 * (1 - r * 0.4);

                const armDist = Math.abs(scatter);
                const brightness = Math.max(0.1, (1 - r * 0.35) * (1 - armDist * 1.5) + Math.random() * 0.35);

                // Color gradient: warm center → blue edges
                const hue = 25 + r * 180;

                // Size varies: larger = brighter/closer
                const size = 5 + brightness * 7 + Math.random() * 3;

                // Character: brighter stars get heavier characters
                const charPool = brightness > 0.7 ? '*+#@%' :
                    brightness > 0.4 ? '·:;=+*' : '.·:;,-~';

                this.galaxyStars.push({
                    x, y, z, brightness, hue, size,
                    char: charPool[Math.floor(Math.random() * charPool.length)],
                    twinkle: Math.random() * Math.PI * 2,
                    twinkleSpeed: 0.3 + Math.random() * 2.0
                });
            }
        }

        // --- Dense bright core (bulge) ---
        for (let i = 0; i < coreStars; i++) {
            const r = Math.pow(Math.random(), 2.0) * 0.2;
            const angle = Math.random() * Math.PI * 2;
            const z = (Math.random() - 0.5) * 0.08 * (1 - r * 3);

            const brightness = 0.5 + Math.random() * 0.5;
            const size = 6 + brightness * 8 + Math.random() * 2;
            const charPool = brightness > 0.7 ? '#@%*' : '=+*·:';

            this.galaxyStars.push({
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                z,
                brightness,
                hue: 20 + Math.random() * 45, // warm gold core
                size,
                char: charPool[Math.floor(Math.random() * charPool.length)],
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.2 + Math.random() * 1.0
            });
        }

        // --- Diffuse halo stars ---
        for (let i = 0; i < haloStars; i++) {
            const r = 0.3 + Math.random() * 0.9;
            const angle = Math.random() * Math.PI * 2;
            const z = (Math.random() - 0.5) * 0.12;

            this.galaxyStars.push({
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                z,
                brightness: 0.05 + Math.random() * 0.15,
                hue: 200 + Math.random() * 60,
                size: 4 + Math.random() * 4,
                char: '.·'[Math.floor(Math.random() * 2)],
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.8 + Math.random() * 2.0
            });
        }

        // --- Inter-arm fill stars (smooth out the gaps) ---
        const fillStars = this.isMobile ? 250 : 800;
        for (let i = 0; i < fillStars; i++) {
            const r = Math.pow(Math.random(), 0.7) * 1.0;
            const angle = Math.random() * Math.PI * 2;
            const z = (Math.random() - 0.5) * 0.06;

            const brightness = 0.08 + Math.random() * 0.18 * (1 - r * 0.5);
            const hue = 30 + r * 160 + Math.random() * 30;
            const charPool = '.·:;';

            this.galaxyStars.push({
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                z,
                brightness,
                hue,
                size: 4 + Math.random() * 4,
                char: charPool[Math.floor(Math.random() * charPool.length)],
                twinkle: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.5 + Math.random() * 1.5
            });
        }

        // --- Nebula regions (colorful gas clouds along arms) ---
        this.galaxyNebulae = [];
        for (let arm = 0; arm < numArms; arm++) {
            const armAngle = (arm / numArms) * Math.PI * 2;
            for (let i = 0; i < 70; i++) {
                const r = 0.15 + Math.random() * 0.8;
                const spiralAngle = armAngle + r * 5.0;
                const scatter = (Math.random() - 0.5) * 0.3;
                const angle = spiralAngle + scatter;

                // Pink/magenta/purple nebulae + some blue-green emission
                const nebulaHues = [320, 330, 340, 280, 290, 170, 180];
                const hue = nebulaHues[Math.floor(Math.random() * nebulaHues.length)] + Math.random() * 20;

                this.galaxyNebulae.push({
                    x: r * Math.cos(angle),
                    y: r * Math.sin(angle),
                    z: (Math.random() - 0.5) * 0.02,
                    radius: 8 + Math.random() * 20,
                    brightness: 0.04 + Math.random() * 0.08,
                    hue
                });
            }
        }

        // --- Dust lane particles (very small, faint, fill in gaps) ---
        for (let arm = 0; arm < numArms; arm++) {
            const armAngle = (arm / numArms) * Math.PI * 2;

            for (let i = 0; i < dustParticles / numArms; i++) {
                const r = Math.pow(Math.random(), 0.5) * 1.15;
                const spiralAngle = armAngle + r * 5.0;
                // Dust is slightly offset from arm center (leading edge)
                const scatter = (Math.random() - 0.5) * (0.5 + r * 0.6);
                const angle = spiralAngle + scatter + 0.15;

                const x = r * Math.cos(angle);
                const y = r * Math.sin(angle);
                const z = (Math.random() - 0.5) * 0.03;

                this.galaxyDust.push({
                    x, y, z,
                    brightness: 0.03 + Math.random() * 0.12,
                    hue: 200 + r * 40 + Math.random() * 30,
                    size: 3 + Math.random() * 4,
                    char: '.·,~'[Math.floor(Math.random() * 4)]
                });
            }
        }

        // Core dust glow
        for (let i = 0; i < 500; i++) {
            const r = Math.pow(Math.random(), 1.5) * 0.25;
            const angle = Math.random() * Math.PI * 2;

            this.galaxyDust.push({
                x: r * Math.cos(angle),
                y: r * Math.sin(angle),
                z: (Math.random() - 0.5) * 0.04,
                brightness: 0.08 + Math.random() * 0.2,
                hue: 30 + Math.random() * 30,
                size: 3 + Math.random() * 5,
                char: '·.:'[Math.floor(Math.random() * 3)]
            });
        }
    }

    _initSparkles() {
        this.sparkles = [];
        const count = 60;
        for (let i = 0; i < count; i++) {
            this.sparkles.push({
                x: Math.random() * (this.width || 1920),
                y: Math.random() * (this.height || 1080),
                vx: (Math.random() - 0.5) * 0.3,
                vy: (Math.random() - 0.5) * 0.2 - 0.1,
                size: Math.random() * 2 + 0.5,
                twinkleOffset: Math.random() * Math.PI * 2,
                twinkleSpeed: 1.5 + Math.random() * 2,
                hue: 180 + Math.random() * 60
            });
        }
    }

    _buildGrid() {
        this.cols = Math.ceil(this.width / this.cellSize) + 1;
        this.rows = Math.ceil(this.height / this.cellSize) + 1;
        this.nodes = new Array(this.cols * this.rows);
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const x = c * this.cellSize + this.cellSize * 0.5;
                const y = r * this.cellSize;
                this.nodes[r * this.cols + c] = { x, y, baseX: x, baseY: y, displacement: 0 };
            }
        }
    }

    _bindEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouse.x = e.clientX;
            this.mouse.y = e.clientY;
        });
        window.addEventListener('mouseout', () => {
            this.mouse.x = -9999;
            this.mouse.y = -9999;
        });
        window.addEventListener('click', (e) => {
            if (e.target.closest('a, button, input, textarea, select')) return;
            this.waves.push({
                x: e.clientX, y: e.clientY,
                radius: 0, maxRadius: Math.max(this.width, this.height) * 0.8,
                strength: 1.0, birth: this.time,
                hueStart: 195 + Math.random() * 40
            });
        });
        window.addEventListener('touchstart', (e) => {
            if (e.target.closest('a, button, input, textarea, select')) return;
            const t = e.touches[0];
            this.waves.push({
                x: t.clientX, y: t.clientY,
                radius: 0, maxRadius: Math.max(this.width, this.height) * 0.8,
                strength: 1.0, birth: this.time,
                hueStart: 195 + Math.random() * 40
            });
        });
    }

    updateTheme(theme) { this.theme = theme; }

    resize() {
        this.dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.canvas.width = window.innerWidth * this.dpr;
        this.canvas.height = window.innerHeight * this.dpr;
        this.canvas.style.width = window.innerWidth + 'px';
        this.canvas.style.height = window.innerHeight + 'px';
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this._buildGrid();
        if (this.sparkles.length > 0) this._initSparkles();
    }

    // ============================================
    //  Parallax
    // ============================================
    _updateParallax() {
        if (this.mouse.x < -999) {
            this.parallaxX += (0 - this.parallaxX) * 0.05;
            this.parallaxY += (0 - this.parallaxY) * 0.05;
            return;
        }
        const mx = (this.mouse.x / this.width - 0.5) * 2;
        const my = (this.mouse.y / this.height - 0.5) * 2;
        const targetX = -mx * 12;
        const targetY = -my * 8;
        this.parallaxX += (targetX - this.parallaxX) * 0.08;
        this.parallaxY += (targetY - this.parallaxY) * 0.08;
    }

    // ============================================
    //  Sparkle particles
    // ============================================
    _updateAndDrawSparkles(ctx, isDark) {
        const w = this.width, h = this.height;
        for (let i = 0; i < this.sparkles.length; i++) {
            const s = this.sparkles[i];
            s.x += s.vx;
            s.y += s.vy;
            if (s.x < -10) s.x = w + 10;
            if (s.x > w + 10) s.x = -10;
            if (s.y < -10) s.y = h + 10;
            if (s.y > h + 10) s.y = -10;

            const twinkle = (Math.sin(this.time * s.twinkleSpeed + s.twinkleOffset) + 1) * 0.5;
            const alpha = 0.1 + twinkle * 0.6;

            if (isDark) {
                ctx.fillStyle = `hsla(${s.hue}, 80%, ${60 + twinkle * 30}%, ${alpha})`;
            } else {
                ctx.fillStyle = `hsla(${s.hue + 30}, 60%, ${30 + twinkle * 20}%, ${alpha * 0.5})`;
            }

            const radius = s.size * (0.6 + twinkle * 0.4);
            ctx.beginPath();
            ctx.arc(s.x + this.parallaxX * 1.5, s.y + this.parallaxY * 1.5, radius, 0, Math.PI * 2);
            ctx.fill();

            if (twinkle > 0.7 && s.size > 1.2) {
                ctx.strokeStyle = isDark
                    ? `hsla(${s.hue}, 90%, 80%, ${(twinkle - 0.7) * 0.5})`
                    : `hsla(${s.hue + 30}, 70%, 50%, ${(twinkle - 0.7) * 0.3})`;
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.arc(s.x + this.parallaxX * 1.5, s.y + this.parallaxY * 1.5, radius + 3, 0, Math.PI * 2);
                ctx.stroke();
            }
        }
    }

    // ============================================
    //  Node displacement physics
    // ============================================
    _updateNodes() {
        const mouseRadius = 150;
        const mouseRadiusSq = mouseRadius * mouseRadius;
        const mouseStrength = 20;
        const waveCount = this.waves.length;
        const pxOff = this.parallaxX;
        const pyOff = this.parallaxY;

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const bx = node.baseX + pxOff;
            const by = node.baseY + pyOff;
            let dx = 0, dy = 0, disp = 0;

            const mx = bx - this.mouse.x, my = by - this.mouse.y;
            const mDistSq = mx * mx + my * my;
            if (mDistSq < mouseRadiusSq && mDistSq > 1) {
                const mDist = Math.sqrt(mDistSq);
                const t = 1 - mDist / mouseRadius;
                dx += (mx / mDist) * t * t * mouseStrength;
                dy += (my / mDist) * t * t * mouseStrength;
                disp += t * t;
            }

            for (let w = 0; w < waveCount; w++) {
                const wave = this.waves[w];
                const wx = bx - wave.x, wy = by - wave.y;
                const wDist = Math.sqrt(wx * wx + wy * wy);
                const distFromRing = Math.abs(wDist - wave.radius);
                if (distFromRing < 45) {
                    const smooth = (1 - distFromRing / 45) * wave.strength;
                    if (wDist > 1) {
                        dx += (wx / wDist) * smooth * 22;
                        dy += (wy / wDist) * smooth * 22;
                    }
                    disp += smooth;
                }
            }

            node.x = bx + dx;
            node.y = by + dy;
            node.displacement = disp > 1 ? 1 : disp;
        }
    }

    // ============================================
    //  Main animation loop
    // ============================================
    animate() {
        const dt = 0.016;
        this.time += dt;
        const ctx = this.ctx;
        const isDark = this.theme !== 'light';

        ctx.clearRect(0, 0, this.width, this.height);

        this._updateParallax();

        // Update waves
        for (const w of this.waves) {
            w.radius += 250 * dt;
            w.strength = Math.max(0, 1 - (this.time - w.birth) / 2.5);
        }
        this.waves = this.waves.filter(w => w.strength > 0.01 && w.radius < w.maxRadius);

        // Mouse trail
        if (this.mouse.x > -999 && this.time - this.lastTrailTime > 0.03) {
            this.mouseTrail.push({ x: this.mouse.x, y: this.mouse.y, birth: this.time });
            this.lastTrailTime = this.time;
        }
        this.mouseTrail = this.mouseTrail.filter(p => this.time - p.birth < 1.2);

        this._updateNodes();

        // Galaxy spin (with black hole spin boost)
        this._updateBlackHolePhase();
        this.galaxyAngle += 0.0015 + this.bhSpinBoost;

        // Compute fractal less often on mobile
        const fractalInterval = this.isMobile ? 6 : 3;
        if (this.frameCount % fractalInterval === 0) {
            this._computeFractal();
        }
        this.frameCount++;

        // On mobile, skip rendering every other frame for better performance
        if (this.isMobile && this.frameCount % 2 !== 0) {
            requestAnimationFrame(() => this.animate());
            return;
        }

        // Draw layers (skip grid on mobile for perf)
        if (!this.isMobile) this._drawGridLines(ctx, isDark);
        this._drawGalaxy(ctx, isDark);

        // Draw black hole effects over galaxy
        const bhGcx = this.width * 0.25 + this.parallaxX * 0.6;
        const bhGcy = this.height * 0.45 + this.parallaxY * 0.6;
        const bhScale = Math.min(this.width, this.height) * 0.85;
        this._drawBlackHole(ctx, isDark, bhGcx, bhGcy, bhScale);

        this._drawASCIINodes(ctx, isDark);
        this._updateAndDrawSparkles(ctx, isDark);

        requestAnimationFrame(() => this.animate());
    }

    // ============================================
    //  Grid lines
    // ============================================
    _drawGridLines(ctx, isDark) {
        const baseAlpha = isDark ? 0.06 : 0.04;
        const hue = isDark ? 195 : 230;
        ctx.lineWidth = 0.5;
        ctx.strokeStyle = isDark
            ? `hsla(${hue}, 60%, 55%, ${baseAlpha})`
            : `hsla(${hue}, 40%, 35%, ${baseAlpha})`;
        ctx.beginPath();
        for (let r = 0; r < this.rows; r++) {
            const base = r * this.cols;
            ctx.moveTo(this.nodes[base].x, this.nodes[base].y);
            for (let c = 1; c < this.cols; c++) {
                ctx.lineTo(this.nodes[base + c].x, this.nodes[base + c].y);
            }
        }
        for (let c = 0; c < this.cols; c++) {
            ctx.moveTo(this.nodes[c].x, this.nodes[c].y);
            for (let r = 1; r < this.rows; r++) {
                ctx.lineTo(this.nodes[r * this.cols + c].x, this.nodes[r * this.cols + c].y);
            }
        }
        ctx.stroke();
    }

    // ============================================
    //  Fractal computation (morphing between types)
    // ============================================
    _computeFractal() {
        const cols = this.cols, rows = this.rows;
        if (!this.fractalBuffer || this.fractalBuffer.length !== cols * rows) {
            this.fractalBuffer = new Float32Array(cols * rows);
        }
        this.fractalBuffer.fill(-1);

        const maxIter = 25;

        // --- Phase cycling: Julia → Mandelbrot → Burning Ship ---
        // Each phase lasts ~20s, with 5s crossfade between them
        const phaseDuration = 20;  // seconds per fractal type
        const fadeDuration = 5;    // crossfade duration
        const totalCycle = phaseDuration * 3;
        const cycleTime = this.time % totalCycle;
        const phaseIndex = Math.floor(cycleTime / phaseDuration);
        const phaseProgress = (cycleTime % phaseDuration) / phaseDuration;

        // Smooth blend factor: 0 at start of phase, ramps to 1 in last fadeDuration seconds
        const fadeStart = 1 - fadeDuration / phaseDuration;
        let blend = 0; // 0 = current phase, 1 = next phase
        if (phaseProgress > fadeStart) {
            blend = (phaseProgress - fadeStart) / (1 - fadeStart);
            blend = blend * blend * (3 - 2 * blend); // smoothstep
        }

        const nextPhase = (phaseIndex + 1) % 3;

        // Julia set constant (gently morphing)
        const t = this.time * 0.05;
        const juliaR = 0.285 + 0.008 * Math.sin(t) + 0.005 * Math.cos(t * 1.7);
        const juliaI = 0.01 + 0.008 * Math.cos(t * 0.8) + 0.005 * Math.sin(t * 2.1);

        // Fractal viewport
        const fracStartCol = Math.floor(cols * 0.50);
        const fracCenterX = cols * 0.72;
        const fracCenterY = rows * 0.5;
        const fracScale = Math.min(cols, rows) * 0.22;
        const zoomPulse = 1 + 0.08 * Math.sin(this.time * 0.1);
        const effectiveScale = fracScale * zoomPulse;

        // Mandelbrot offset to show the interesting cardioid boundary
        const mandOffsetR = -0.5;
        const mandOffsetI = 0;

        for (let r = 0; r < rows; r++) {
            for (let c = fracStartCol; c < cols; c++) {
                const pixelR = (c - fracCenterX) / effectiveScale;
                const pixelI = (r - fracCenterY) / effectiveScale;

                // Compute iteration for one or two phases depending on blend
                let finalVal;
                if (blend < 0.01) {
                    // Pure current phase
                    finalVal = this._iterateFractal(pixelR, pixelI, phaseIndex, juliaR, juliaI, mandOffsetR, mandOffsetI, maxIter);
                } else if (blend > 0.99) {
                    // Pure next phase
                    finalVal = this._iterateFractal(pixelR, pixelI, nextPhase, juliaR, juliaI, mandOffsetR, mandOffsetI, maxIter);
                } else {
                    // Crossfade: blend between two fractal types
                    const val1 = this._iterateFractal(pixelR, pixelI, phaseIndex, juliaR, juliaI, mandOffsetR, mandOffsetI, maxIter);
                    const val2 = this._iterateFractal(pixelR, pixelI, nextPhase, juliaR, juliaI, mandOffsetR, mandOffsetI, maxIter);
                    // Blend: if either is -1 (empty), use the other
                    if (val1 < 0 && val2 < 0) {
                        finalVal = -1;
                    } else if (val1 < 0) {
                        finalVal = val2 * blend;
                    } else if (val2 < 0) {
                        finalVal = val1 * (1 - blend);
                    } else {
                        finalVal = val1 * (1 - blend) + val2 * blend;
                    }
                }

                this.fractalBuffer[r * cols + c] = finalVal;
            }
        }
    }

    // Single fractal iteration for a given type
    // type: 0 = Julia, 1 = Mandelbrot, 2 = Burning Ship
    _iterateFractal(pixelR, pixelI, type, juliaR, juliaI, mandOffR, mandOffI, maxIter) {
        let zReal, zImag, cReal, cImag;
        let burningShip = false;

        if (type === 0) {
            // Julia: z₀ = pixel, c = constant
            zReal = pixelR;
            zImag = pixelI;
            cReal = juliaR;
            cImag = juliaI;
        } else if (type === 1) {
            // Mandelbrot: z₀ = 0, c = pixel (offset to interesting region)
            zReal = 0;
            zImag = 0;
            cReal = pixelR + mandOffR;
            cImag = pixelI + mandOffI;
        } else {
            // Burning Ship: like Mandelbrot but with |Re|, |Im|
            zReal = 0;
            zImag = 0;
            cReal = pixelR + mandOffR;
            cImag = pixelI + mandOffI;
            burningShip = true;
        }

        let iter = 0;
        let zr2 = zReal * zReal;
        let zi2 = zImag * zImag;

        while (zr2 + zi2 < 4 && iter < maxIter) {
            if (burningShip) {
                zImag = Math.abs(2 * zReal * zImag) + cImag;
                zReal = zr2 - zi2 + cReal;
            } else {
                const newReal = zr2 - zi2 + cReal;
                zImag = 2 * zReal * zImag + cImag;
                zReal = newReal;
            }
            zr2 = zReal * zReal;
            zi2 = zImag * zImag;
            iter++;
        }

        if (iter > 0 && iter < maxIter) {
            const smooth = iter + 1 - Math.log(Math.log(Math.sqrt(zr2 + zi2))) / Math.log(2);
            return Math.pow(smooth / maxIter, 0.7);
        } else if (iter === maxIter) {
            return 0.05; // inside the set
        }
        return -1; // quick escape — empty
    }

    // ============================================
    //  Black hole transition phase management
    // ============================================
    _updateBlackHolePhase() {
        this.bhTime += 0.016;
        const cycle = 60; // full cycle in seconds
        const t = this.bhTime % cycle;

        // Timeline: 0-25 galaxy | 25-35 collapse | 35-45 hold | 45-55 expand | 55-60 settle
        let targetPhase;
        if (t < 25) {
            targetPhase = 0;
        } else if (t < 35) {
            // Collapse: 0 → 1 with smoothstep
            const p = (t - 25) / 10;
            targetPhase = p * p * (3 - 2 * p);
        } else if (t < 45) {
            targetPhase = 1;
        } else if (t < 55) {
            // Expand: 1 → 0 with smoothstep
            const p = (t - 45) / 10;
            targetPhase = 1 - p * p * (3 - 2 * p);
        } else {
            targetPhase = 0;
        }

        // Smooth lerp to avoid any hard jumps
        this.bhPhase += (targetPhase - this.bhPhase) * 0.08;

        // Spin boost: angular momentum conservation (spin faster as matter falls in)
        this.bhSpinBoost = this.bhPhase * this.bhPhase * 0.025;
    }

    // ============================================
    //  Draw black hole effects — tilted disk, orbiting particles, layered rendering
    // ============================================
    _drawBlackHole(ctx, isDark, gcx, gcy, scale) {
        if (this.bhPhase < 0.05) return;

        const phase = this.bhPhase;
        const ehR = scale * 0.08 * phase;
        const diskW = ehR * 5;
        const t = this.time;
        const diskSpeed = t * 2.5 + this.bhSpinBoost * t * 8;
        const w = this.width, h = this.height;
        const tilt = 0.15; // disk tilt angle in radians (~8.5°)
        const flatness = 0.25; // vertical squash ratio (visible curve, not a straight line)

        ctx.save();

        // --- Soft ambient bloom (tilted to match disk) ---
        if (phase > 0.2) {
            const bloomR = ehR * 6;
            ctx.save();
            ctx.translate(gcx, gcy);
            ctx.rotate(tilt);
            ctx.scale(1, 0.35);

            const bloom = ctx.createRadialGradient(0, 0, ehR * 0.5, 0, 0, bloomR);
            const ba = Math.min(1, (phase - 0.2)) * 0.8;
            bloom.addColorStop(0, `hsla(30, 65%, 55%, ${ba * 0.18})`);
            bloom.addColorStop(0.3, `hsla(28, 55%, 45%, ${ba * 0.08})`);
            bloom.addColorStop(0.6, `hsla(25, 45%, 35%, ${ba * 0.03})`);
            bloom.addColorStop(1, 'hsla(20, 40%, 30%, 0)');
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(0, 0, bloomR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Helper: project a point on the tilted disk to screen coords
        const diskToScreen = (angle, radius) => {
            // Point on a circle, then squashed and rotated
            const ox = Math.cos(angle) * radius;
            const oy = Math.sin(angle) * radius * flatness;
            // Rotate by tilt
            const rx = ox * Math.cos(tilt) - oy * Math.sin(tilt);
            const ry = ox * Math.sin(tilt) + oy * Math.cos(tilt);
            return [gcx + rx, gcy + ry, ry]; // ry used for front/back sorting
        };

        // Helper: draw the accretion disk gradient (called twice — back and front)
        const drawDiskHalf = (isBack) => {
            ctx.save();

            // Clip to back or front using a rotated clip region
            ctx.beginPath();
            const clipExtent = diskW + 20;
            if (isBack) {
                // "Back" = above the tilted center line
                const cx1 = -clipExtent * Math.cos(tilt);
                const cy1 = -clipExtent * Math.sin(tilt);
                const cx2 = clipExtent * Math.cos(tilt);
                const cy2 = clipExtent * Math.sin(tilt);
                ctx.moveTo(gcx + cx1, gcy + cy1);
                ctx.lineTo(gcx + cx2, gcy + cy2);
                ctx.lineTo(gcx + cx2, gcy + cy2 - clipExtent);
                ctx.lineTo(gcx + cx1, gcy + cy1 - clipExtent);
            } else {
                // "Front" = below the tilted center line
                const cx1 = -clipExtent * Math.cos(tilt);
                const cy1 = -clipExtent * Math.sin(tilt);
                const cx2 = clipExtent * Math.cos(tilt);
                const cy2 = clipExtent * Math.sin(tilt);
                ctx.moveTo(gcx + cx1, gcy + cy1);
                ctx.lineTo(gcx + cx2, gcy + cy2);
                ctx.lineTo(gcx + cx2, gcy + cy2 + clipExtent);
                ctx.lineTo(gcx + cx1, gcy + cy1 + clipExtent);
            }
            ctx.closePath();
            ctx.clip();

            const da = Math.min(1, (phase - 0.1) * 3);

            // Outer warm disk
            ctx.save();
            ctx.translate(gcx, gcy);
            ctx.rotate(tilt);
            ctx.scale(1, flatness);

            ctx.shadowColor = isDark
                ? `hsla(30, 80%, 50%, ${da * 0.7})`
                : `hsla(30, 60%, 40%, ${da * 0.4})`;
            ctx.shadowBlur = ehR * 0.35;

            const diskGrad = ctx.createRadialGradient(0, 0, ehR * 1.2, 0, 0, diskW);
            diskGrad.addColorStop(0, `hsla(25, 15%, 95%, ${da * 0.9})`);
            diskGrad.addColorStop(0.08, `hsla(28, 30%, 90%, ${da * 0.8})`);
            diskGrad.addColorStop(0.2, `hsla(30, 55%, 70%, ${da * 0.6})`);
            diskGrad.addColorStop(0.45, `hsla(25, 75%, 55%, ${da * 0.35})`);
            diskGrad.addColorStop(0.7, `hsla(20, 85%, 40%, ${da * 0.15})`);
            diskGrad.addColorStop(1, 'hsla(15, 80%, 30%, 0)');

            ctx.fillStyle = diskGrad;
            ctx.beginPath();
            ctx.arc(0, 0, diskW, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Inner bright core
            ctx.save();
            ctx.translate(gcx, gcy);
            ctx.rotate(tilt);
            ctx.scale(1, flatness * 0.7);

            ctx.shadowColor = isDark
                ? `hsla(30, 40%, 80%, ${da * 0.5})`
                : `hsla(30, 30%, 65%, ${da * 0.3})`;
            ctx.shadowBlur = ehR * 0.15;

            const coreGrad = ctx.createRadialGradient(0, 0, ehR * 1.1, 0, 0, ehR * 2.8);
            coreGrad.addColorStop(0, `hsla(30, 10%, 98%, ${da * 0.95})`);
            coreGrad.addColorStop(0.25, `hsla(28, 25%, 92%, ${da * 0.75})`);
            coreGrad.addColorStop(0.6, `hsla(25, 45%, 70%, ${da * 0.3})`);
            coreGrad.addColorStop(1, 'hsla(20, 60%, 50%, 0)');

            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(0, 0, ehR * 2.8, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.restore(); // undo clip
        };

        // Helper: draw orbiting ASCII particles for one half
        const drawParticlesHalf = (isBack) => {
            if (phase < 0.2) return;
            const da = Math.min(1, (phase - 0.2) * 2);

            ctx.save();

            // Same tilted clip region
            ctx.beginPath();
            const clipExtent = diskW + 20;
            if (isBack) {
                const cx1 = -clipExtent * Math.cos(tilt);
                const cy1 = -clipExtent * Math.sin(tilt);
                const cx2 = clipExtent * Math.cos(tilt);
                const cy2 = clipExtent * Math.sin(tilt);
                ctx.moveTo(gcx + cx1, gcy + cy1);
                ctx.lineTo(gcx + cx2, gcy + cy2);
                ctx.lineTo(gcx + cx2, gcy + cy2 - clipExtent);
                ctx.lineTo(gcx + cx1, gcy + cy1 - clipExtent);
            } else {
                const cx1 = -clipExtent * Math.cos(tilt);
                const cy1 = -clipExtent * Math.sin(tilt);
                const cx2 = clipExtent * Math.cos(tilt);
                const cy2 = clipExtent * Math.sin(tilt);
                ctx.moveTo(gcx + cx1, gcy + cy1);
                ctx.lineTo(gcx + cx2, gcy + cy2);
                ctx.lineTo(gcx + cx2, gcy + cy2 + clipExtent);
                ctx.lineTo(gcx + cx1, gcy + cy1 + clipExtent);
            }
            ctx.closePath();
            ctx.clip();

            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';

            const diskParticleCount = this.isMobile ? 60 : 180;
            for (let i = 0; i < diskParticleCount; i++) {
                // Orbital angle — visibly rotates over time
                const orbitalSpeed = diskSpeed * (0.8 + (i % 3) * 0.15);
                const angle = (i / diskParticleCount) * Math.PI * 2 + orbitalSpeed;
                const rRatio = 0.08 + ((i * 7 + i * i) % 100) / 100 * 0.92;
                const r = ehR * 1.3 + (diskW - ehR * 1.3) * rRatio;

                // Project onto tilted disk
                const [px, py] = diskToScreen(angle, r);

                if (px < -20 || px > w + 20) continue;
                const ddx = px - gcx, ddy = py - gcy;
                if (ddx * ddx + ddy * ddy < ehR * ehR * 0.85) continue;

                const heat = Math.pow(1 - rRatio, 0.5);
                const alpha = da * (0.15 + heat * 0.35) * (0.6 + Math.sin(angle * 4 + t * 3 + i) * 0.4);
                if (alpha < 0.04) continue;

                const fontSize = Math.max(3, (4 + heat * 6) * phase);
                const chars = '·:;+*#';
                const charIdx = Math.min(chars.length - 1, Math.floor(heat * chars.length));

                ctx.font = `${fontSize | 0}px 'JetBrains Mono', monospace`;
                ctx.fillStyle = isDark
                    ? `hsla(${25 + rRatio * 15}, ${35 + heat * 35}%, ${70 + heat * 25}%, ${alpha})`
                    : `hsla(${25 + rRatio * 15}, ${20 + heat * 25}%, ${55 + heat * 15}%, ${alpha * 0.5})`;
                ctx.fillText(chars[charIdx], px, py);
            }
            ctx.restore();
        };

        // =============================================
        // LAYER 1: Back half of disk (behind black hole)
        // =============================================
        if (phase > 0.1) {
            drawDiskHalf(true);
            drawParticlesHalf(true);
        }

        // =============================================
        // LAYER 2: Event horizon (dark void)
        // =============================================
        const ehGrad = ctx.createRadialGradient(gcx, gcy, ehR * 0.15, gcx, gcy, ehR * 1.05);
        ehGrad.addColorStop(0, `rgba(0, 0, 0, ${0.99 * phase})`);
        ehGrad.addColorStop(0.65, `rgba(0, 0, 0, ${0.98 * phase})`);
        ehGrad.addColorStop(0.9, `rgba(0, 0, 0, ${0.6 * phase})`);
        ehGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = ehGrad;
        ctx.beginPath();
        ctx.arc(gcx, gcy, ehR * 1.05, 0, Math.PI * 2);
        ctx.fill();

        // =============================================
        // LAYER 3: Front half of disk (in front of BH)
        // =============================================
        if (phase > 0.1) {
            drawDiskHalf(false);
            drawParticlesHalf(false);
        }

        // =============================================
        // LAYER 4: Gravitational lensing ring (bright light wrapping around BH)
        // This should be nearly circular — light bent around the event horizon
        // =============================================
        if (phase > 0.25) {
            const ga = Math.min(1, (phase - 0.25) * 2);

            // Outer warm glow ring — nearly circular
            ctx.save();
            ctx.translate(gcx, gcy);
            ctx.rotate(tilt);
            ctx.scale(1, 0.95); // nearly circular

            const innerR = ehR * 0.9;
            const outerR = ehR * 1.45;

            const ringGrad = ctx.createRadialGradient(0, 0, innerR, 0, 0, outerR);
            ringGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            ringGrad.addColorStop(0.15, isDark
                ? `hsla(28, 55%, 65%, ${ga * 0.25})`
                : `hsla(28, 40%, 50%, ${ga * 0.12})`);
            ringGrad.addColorStop(0.35, isDark
                ? `hsla(30, 65%, 78%, ${ga * 0.7})`
                : `hsla(30, 50%, 60%, ${ga * 0.3})`);
            ringGrad.addColorStop(0.5, isDark
                ? `hsla(28, 60%, 88%, ${ga * 0.85})`
                : `hsla(28, 45%, 70%, ${ga * 0.4})`);
            ringGrad.addColorStop(0.65, isDark
                ? `hsla(30, 55%, 72%, ${ga * 0.5})`
                : `hsla(30, 42%, 58%, ${ga * 0.2})`);
            ringGrad.addColorStop(0.82, isDark
                ? `hsla(25, 48%, 50%, ${ga * 0.15})`
                : `hsla(25, 35%, 40%, ${ga * 0.07})`);
            ringGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = ringGrad;
            ctx.beginPath();
            ctx.arc(0, 0, outerR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Tight bright photon ring right at event horizon edge
            ctx.save();
            ctx.translate(gcx, gcy);
            ctx.rotate(tilt);
            ctx.scale(1, 0.96);

            const prInner = ehR * 0.96;
            const prOuter = ehR * 1.22;

            const prGrad = ctx.createRadialGradient(0, 0, prInner, 0, 0, prOuter);
            prGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
            prGrad.addColorStop(0.25, isDark
                ? `hsla(30, 45%, 88%, ${ga * 0.55})`
                : `hsla(30, 35%, 72%, ${ga * 0.25})`);
            prGrad.addColorStop(0.45, isDark
                ? `hsla(28, 38%, 95%, ${ga * 0.75})`
                : `hsla(28, 28%, 82%, ${ga * 0.35})`);
            prGrad.addColorStop(0.65, isDark
                ? `hsla(30, 42%, 82%, ${ga * 0.4})`
                : `hsla(30, 32%, 68%, ${ga * 0.18})`);
            prGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

            ctx.fillStyle = prGrad;
            ctx.beginPath();
            ctx.arc(0, 0, prOuter, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // --- Orbiting ASCII particles around the lensing ring ---
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            const ringR = ehR * 1.12; // orbit radius on the ring
            const ringSquash = 0.95;  // match ring squash

            const ringParticleCount = this.isMobile ? 20 : 60;
            for (let i = 0; i < ringParticleCount; i++) {
                const orbAngle = (i / ringParticleCount) * Math.PI * 2 + diskSpeed * 1.2;
                // Project onto the nearly-circular tilted ring
                const ox = Math.cos(orbAngle) * ringR;
                const oy = Math.sin(orbAngle) * ringR * ringSquash;
                const rx = ox * Math.cos(tilt) - oy * Math.sin(tilt);
                const ry = ox * Math.sin(tilt) + oy * Math.cos(tilt);
                const px = gcx + rx;
                const py = gcy + ry;

                if (px < -10 || px > w + 10 || py < -10 || py > h + 10) continue;

                const flicker = 0.5 + Math.sin(orbAngle * 3 + t * 4 + i * 1.7) * 0.5;
                const alpha = ga * (0.2 + flicker * 0.4);
                if (alpha < 0.05) continue;

                const fontSize = Math.max(4, (5 + flicker * 4) * phase);
                const chars = '·:;+*#';
                const charIdx = Math.min(chars.length - 1, Math.floor(flicker * chars.length));

                ctx.font = `${fontSize | 0}px 'JetBrains Mono', monospace`;
                ctx.fillStyle = isDark
                    ? `hsla(${28 + flicker * 8}, ${40 + flicker * 30}%, ${75 + flicker * 20}%, ${alpha})`
                    : `hsla(${28 + flicker * 8}, ${30 + flicker * 20}%, ${55 + flicker * 15}%, ${alpha * 0.5})`;
                ctx.fillText(chars[charIdx], px, py);
            }
        }

        ctx.restore();
    }

    // ============================================
    //  Draw galaxy — pixel-precise star rendering
    // ============================================
    _drawGalaxy(ctx, isDark) {
        const gcx = this.width * 0.25 + this.parallaxX * 0.6;
        const gcy = this.height * 0.45 + this.parallaxY * 0.6;
        const scale = Math.min(this.width, this.height) * 0.85;

        const spinAngle = this.galaxyAngle;
        const tiltAngle = 0.9;
        const cosTilt = Math.cos(tiltAngle);
        const sinTilt = Math.sin(tiltAngle);
        const cosSpin = Math.cos(spinAngle);
        const sinSpin = Math.sin(spinAngle);

        const t = this.time;
        const K = 3.5;
        const w = this.width, h = this.height;
        const bh = this.bhPhase;
        const radialScale = 1 - bh * 0.85;  // compress stars inward
        const eventHorizonR = 0.06 * bh;     // in galaxy-space units

        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        // --- Draw core glow (radial gradient behind everything) ---
        const coreRadius = scale * (0.18 - bh * 0.1);
        const coreAlphaBoost = 1 + bh * 1.5;
        const coreGrad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, coreRadius);
        if (isDark) {
            coreGrad.addColorStop(0, `hsla(35, ${70 + bh * 20}%, ${70 + bh * 10}%, ${0.12 * coreAlphaBoost})`);
            coreGrad.addColorStop(0.3, `hsla(30, 60%, 55%, ${0.07 * coreAlphaBoost})`);
            coreGrad.addColorStop(0.6, 'hsla(200, 50%, 45%, 0.03)');
            coreGrad.addColorStop(1, 'hsla(220, 40%, 30%, 0)');
        } else {
            coreGrad.addColorStop(0, `hsla(35, 50%, 50%, ${0.08 * coreAlphaBoost})`);
            coreGrad.addColorStop(0.4, 'hsla(200, 40%, 40%, 0.03)');
            coreGrad.addColorStop(1, 'hsla(220, 30%, 25%, 0)');
        }
        ctx.fillStyle = coreGrad;
        ctx.fillRect(gcx - coreRadius, gcy - coreRadius, coreRadius * 2, coreRadius * 2);

        // --- Draw nebulae (soft colored blobs) ---
        for (let i = 0; i < this.galaxyNebulae.length; i++) {
            const neb = this.galaxyNebulae[i];

            let sx = neb.x * cosSpin - neb.y * sinSpin;
            let sy = neb.x * sinSpin + neb.y * cosSpin;

            // Black hole: compress radially
            if (bh > 0.01) {
                const nr = Math.sqrt(sx * sx + sy * sy);
                if (nr > 0.001) {
                    const cr = nr * radialScale;
                    if (cr < eventHorizonR) continue;
                    sx *= cr / nr;
                    sy *= cr / nr;
                }
            }

            const ty2 = sy * cosTilt - neb.z * sinTilt;
            const tz2 = sy * sinTilt + neb.z * cosTilt;

            const ooz2 = 1 / (tz2 + K);
            if (ooz2 < 0) continue;

            const nx = gcx + sx * scale * ooz2;
            const ny = gcy - ty2 * scale * ooz2;

            if (nx < -60 || nx > w + 60 || ny < -60 || ny > h + 60) continue;

            const nebRadius = neb.radius * ooz2 * K * 0.5;
            if (nebRadius < 3) continue;

            const nebGrad = ctx.createRadialGradient(nx, ny, 0, nx, ny, nebRadius);
            const alpha = neb.brightness * (isDark ? 1 : 0.5);
            nebGrad.addColorStop(0, `hsla(${neb.hue | 0}, 60%, 50%, ${alpha})`);
            nebGrad.addColorStop(0.5, `hsla(${neb.hue | 0}, 50%, 40%, ${alpha * 0.4})`);
            nebGrad.addColorStop(1, `hsla(${neb.hue | 0}, 40%, 30%, 0)`);
            ctx.fillStyle = nebGrad;
            ctx.fillRect(nx - nebRadius, ny - nebRadius, nebRadius * 2, nebRadius * 2);
        }

        // --- Draw dust (background layer) — batched by font size ---
        const dustBuckets = new Map();
        for (let i = 0; i < this.galaxyDust.length; i++) {
            const d = this.galaxyDust[i];

            let sx = d.x * cosSpin - d.y * sinSpin;
            let sy = d.x * sinSpin + d.y * cosSpin;

            // Black hole: compress radially
            if (bh > 0.01) {
                const dr = Math.sqrt(sx * sx + sy * sy);
                if (dr > 0.001) {
                    const cr = dr * radialScale;
                    if (cr < eventHorizonR) continue;
                    sx *= cr / dr;
                    sy *= cr / dr;
                }
            }

            const ty = sy * cosTilt - d.z * sinTilt;
            const tz = sy * sinTilt + d.z * cosTilt;

            const ooz = 1 / (tz + K);
            if (ooz < 0) continue;

            const screenX = gcx + sx * scale * ooz;
            const screenY = gcy - ty * scale * ooz;

            if (screenX < -20 || screenX > w + 20 || screenY < -20 || screenY > h + 20) continue;

            const rawFontSize = d.size * ooz * K * 0.35;
            if (rawFontSize < 2) continue;

            const fontSize = Math.max(2, (rawFontSize + 1) & ~1);
            const alpha = d.brightness * (isDark ? 0.5 : 0.3);
            const hue = d.hue;
            const lit = isDark ? 40 + d.brightness * 30 : 20 + d.brightness * 20;
            const fillStyle = `hsla(${hue | 0}, 40%, ${lit | 0}%, ${alpha})`;

            let bucket = dustBuckets.get(fontSize);
            if (!bucket) { bucket = []; dustBuckets.set(fontSize, bucket); }
            bucket.push({ screenX, screenY, char: d.char, fillStyle });
        }

        for (const [fontSize, items] of dustBuckets) {
            ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
            for (let i = 0; i < items.length; i++) {
                const s = items[i];
                ctx.fillStyle = s.fillStyle;
                ctx.fillText(s.char, s.screenX, s.screenY);
            }
        }

        // --- Draw stars (main layer) — batched by font size for performance ---
        const starBuckets = new Map(); // fontSize -> [{screenX, screenY, char, fillStyle}]
        const hasWaves = this.waves.length > 0;

        for (let i = 0; i < this.galaxyStars.length; i++) {
            const star = this.galaxyStars[i];

            const twinkle = (Math.sin(t * star.twinkleSpeed + star.twinkle) + 1) * 0.5;
            const brightness = star.brightness * (0.5 + twinkle * 0.5);
            if (brightness < 0.08) continue;

            let sx = star.x * cosSpin - star.y * sinSpin;
            let sy = star.x * sinSpin + star.y * cosSpin;

            // Black hole: compress radially + tangential lensing stretch
            if (bh > 0.01) {
                const sr = Math.sqrt(sx * sx + sy * sy);
                if (sr > 0.001) {
                    const cr = sr * radialScale;
                    if (cr < eventHorizonR) continue;
                    const ratio = cr / sr;
                    // Tangential stretch near event horizon (lensing)
                    const edgeDist = (cr - eventHorizonR) / (0.3 - eventHorizonR + 0.001);
                    const stretch = 1 + bh * 0.3 * Math.max(0, 1 - edgeDist);
                    const angle = Math.atan2(sy, sx);
                    const cosA = Math.cos(angle), sinA = Math.sin(angle);
                    const rx = cr * cosA;
                    const ry = cr * sinA;
                    // Add tangential offset for lensing
                    sx = rx - sinA * (stretch - 1) * cr * 0.2;
                    sy = ry + cosA * (stretch - 1) * cr * 0.2;
                }
            }

            const ty = sy * cosTilt - star.z * sinTilt;
            const tz = sy * sinTilt + star.z * cosTilt;

            const ooz = 1 / (tz + K);
            if (ooz < 0) continue;

            const screenX = gcx + sx * scale * ooz;
            const screenY = gcy - ty * scale * ooz;

            if (screenX < -20 || screenX > w + 20 || screenY < -20 || screenY > h + 20) continue;

            const rawFontSize = star.size * ooz * K * 0.32;
            if (rawFontSize < 2) continue;

            // Round font size to nearest 2px for batching
            const fontSize = Math.max(3, (rawFontSize + 1) & ~1);

            // Mouse interaction
            let extraBright = 0;
            const mdx = screenX - this.mouse.x, mdy = screenY - this.mouse.y;
            const mdSq = mdx * mdx + mdy * mdy;
            if (mdSq < 40000) {
                const mt = 1 - Math.sqrt(mdSq) / 200;
                extraBright = mt * mt * 0.4;
            }

            // Wave interaction (skip if no waves)
            if (hasWaves) {
                for (let wi = 0; wi < this.waves.length; wi++) {
                    const wave = this.waves[wi];
                    const wx = screenX - wave.x, wy = screenY - wave.y;
                    const wDist = Math.sqrt(wx * wx + wy * wy);
                    const distFromRing = Math.abs(wDist - wave.radius);
                    if (distFromRing < 60) {
                        const wt = (1 - distFromRing / 60) * wave.strength;
                        extraBright += wt * wt * 0.5;
                    }
                }
            }

            const finalBrightness = Math.min(1, brightness + extraBright);
            const hue = star.hue;
            let fillStyle;

            if (isDark) {
                const sat = 35 + finalBrightness * 55;
                const lit = 30 + finalBrightness * 55;
                const alpha = 0.15 + finalBrightness * 0.8;
                fillStyle = `hsla(${hue | 0}, ${sat | 0}%, ${lit | 0}%, ${alpha})`;
            } else {
                const sat = 25 + finalBrightness * 45;
                const lit = 15 + finalBrightness * 45;
                const alpha = 0.1 + finalBrightness * 0.65;
                fillStyle = `hsla(${hue | 0}, ${sat | 0}%, ${lit | 0}%, ${alpha * 0.8})`;
            }

            let bucket = starBuckets.get(fontSize);
            if (!bucket) {
                bucket = [];
                starBuckets.set(fontSize, bucket);
            }
            bucket.push({ screenX, screenY, char: star.char, fillStyle });
        }

        // Draw all stars batched by font size
        for (const [fontSize, items] of starBuckets) {
            ctx.font = `${fontSize}px 'JetBrains Mono', monospace`;
            for (let i = 0; i < items.length; i++) {
                const s = items[i];
                ctx.fillStyle = s.fillStyle;
                ctx.fillText(s.char, s.screenX, s.screenY);
            }
        }
    }

    // ============================================
    //  Draw background ASCII nodes (interactive effects)
    // ============================================
    _drawASCIINodes(ctx, isDark) {
        const charLen = this.chars.length;
        const mouseRadius = 180;
        const mouseRadiusSq = mouseRadius * mouseRadius;
        const trailRadius = 80;
        const trailRadiusSq = trailRadius * trailRadius;

        ctx.font = `${this.cellSize}px 'JetBrains Mono', 'Courier New', monospace`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';

        const fracBuf = this.fractalBuffer;
        const fracChars = this.fractalChars;
        const fracCharLen = fracChars.length;

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const x = node.x, y = node.y;

            // ---- Fractal rendering ----
            if (fracBuf && fracBuf[i] >= 0) {
                const fVal = fracBuf[i];

                // Extra brightness from mouse/waves
                let extraBright = 0;
                const fmx = x - this.mouse.x, fmy = y - this.mouse.y;
                const fmSq = fmx * fmx + fmy * fmy;
                if (fmSq < mouseRadiusSq) {
                    const t = 1 - Math.sqrt(fmSq) / mouseRadius;
                    extraBright += t * t * 0.4;
                }
                for (let w = 0; w < this.waves.length; w++) {
                    const wave = this.waves[w];
                    const wx = x - wave.x, wy = y - wave.y;
                    const wDist = Math.sqrt(wx * wx + wy * wy);
                    const distFromRing = Math.abs(wDist - wave.radius);
                    if (distFromRing < 50) {
                        const t = (1 - distFromRing / 50) * wave.strength;
                        extraBright += t * t * 0.5;
                    }
                }

                if (fVal === 0) {
                    // Inside the set — draw a dim dot
                    const insideAlpha = 0.06 + extraBright * 0.5;
                    if (insideAlpha > 0.05) {
                        ctx.fillStyle = isDark
                            ? `hsla(260, 50%, 20%, ${insideAlpha})`
                            : `hsla(240, 30%, 15%, ${insideAlpha * 0.6})`;
                        ctx.fillText('·', x, y);
                    }
                    continue;
                }

                const brightness = Math.min(1, fVal + extraBright);
                const fCharIdx = Math.max(1, Math.min(fracCharLen - 1, (brightness * (fracCharLen - 1)) | 0));
                const fChar = fracChars[fCharIdx];

                // Fractal coloring — warm near boundary, cool deep inside
                const hue = (220 + fVal * 100 + this.time * 0.5) % 360;
                if (isDark) {
                    const sat = 50 + brightness * 45;
                    const lit = 35 + brightness * 50;
                    const alpha = 0.2 + brightness * 0.75;
                    ctx.fillStyle = `hsla(${hue | 0}, ${sat | 0}%, ${lit | 0}%, ${alpha})`;
                } else {
                    const sat = 40 + brightness * 45;
                    const lit = 20 + brightness * 45;
                    const alpha = 0.15 + brightness * 0.6;
                    ctx.fillStyle = `hsla(${hue | 0}, ${sat | 0}%, ${lit | 0}%, ${alpha * 0.8})`;
                }

                ctx.fillText(fChar, x, y);
                continue;
            }

            let intensity = 0;
            let hueShift = 0;

            // Mouse proximity glow
            const mx = x - this.mouse.x, my = y - this.mouse.y;
            const mDistSq = mx * mx + my * my;
            if (mDistSq < mouseRadiusSq) {
                const t = 1 - Math.sqrt(mDistSq) / mouseRadius;
                intensity += t * t * 0.85;
            }

            // Mouse afterglow trail
            for (let ti = 0; ti < this.mouseTrail.length; ti++) {
                const tp = this.mouseTrail[ti];
                const tdx = x - tp.x, tdy = y - tp.y;
                const tdSq = tdx * tdx + tdy * tdy;
                if (tdSq < trailRadiusSq) {
                    const age = this.time - tp.birth;
                    const fade = 1 - age / 1.2;
                    const dist = 1 - Math.sqrt(tdSq) / trailRadius;
                    intensity += dist * dist * fade * 0.4;
                    hueShift += age * 40;
                }
            }

            // Color-shifting click waves
            for (let w = 0; w < this.waves.length; w++) {
                const wave = this.waves[w];
                const wx = x - wave.x, wy = y - wave.y;
                const wDist = Math.sqrt(wx * wx + wy * wy);
                const distFromRing = Math.abs(wDist - wave.radius);
                if (distFromRing < 50) {
                    const t = (1 - distFromRing / 50) * wave.strength;
                    intensity += t * t * 0.7;
                    hueShift += (wDist * 0.3) + (wave.hueStart - 195);
                }
            }

            // Displacement glow
            intensity += node.displacement * 0.5;

            // Ambient noise
            const ambient = (Math.sin(node.baseX * 0.015 + this.time * 0.3) *
                Math.cos(node.baseY * 0.012 + this.time * 0.2) + 1) * 0.5;
            intensity += ambient * 0.06;

            if (intensity > 1) intensity = 1;
            const charIndex = (intensity * (charLen - 1)) | 0;
            if (charIndex === 0) continue;

            const char = this.chars[charIndex];

            const alpha = 0.08 + intensity * 0.85;
            if (isDark) {
                const hue = (195 + intensity * 35 + hueShift) % 360;
                ctx.fillStyle = `hsla(${hue}, ${55 + intensity * 40 | 0}%, ${45 + intensity * 35 | 0}%, ${alpha})`;
            } else {
                const hue = (225 + intensity * 20 + hueShift * 0.5) % 360;
                ctx.fillStyle = `hsla(${hue}, ${35 + intensity * 40 | 0}%, ${25 + intensity * 25 | 0}%, ${alpha * 0.7})`;
            }

            ctx.fillText(char, x, y);
        }
    }
}
