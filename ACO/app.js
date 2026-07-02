/*
 * App shell: wires the simulation core to the 3D renderer and the HUD.
 */

(function () {
    'use strict';

    const COLONY_PALETTE = [
        '#4ade80', '#38bdf8', '#f87171', '#c084fc',
        '#fbbf24', '#2dd4bf', '#f472b6', '#a3e635',
    ];

    let world = null;
    let sceneRenderer = null;
    let isRunning = false;
    let timeScale = 1;
    let frame = 0;
    let started = false; // becomes true after the welcome overlay is dismissed
    let lastFrameTime = 0;
    const TICK_MS = 1000 / 60; // one nominal sim tick

    const el = (id) => document.getElementById(id);

    /* --------------------------------------------------------------- */
    /* Boot                                                             */
    /* --------------------------------------------------------------- */

    function init() {
        if (!window.THREE || !supportsWebGL()) {
            el('webglError').classList.add('visible');
            return;
        }

        sceneRenderer = new SceneRenderer(el('scene'));
        sceneRenderer.onColonyClick = (index) => {
            focusColony(index);
            pulseCard(index);
        };

        bindControls();
        resetWorld();
        requestAnimationFrame(loop);

        // Read-only handle for curious consoles (and automated tests).
        window.ACO = {
            get world() { return world; },
            get running() { return isRunning; },
        };
    }

    function supportsWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    /* --------------------------------------------------------------- */
    /* Main loop                                                        */
    /* --------------------------------------------------------------- */

    function loop(now) {
        frame += 1;

        // Wall-clock timing: owe the sim (elapsed / 16.6ms) * timeScale ticks
        // regardless of display refresh rate, split into sub-steps of dt <= 1.
        const elapsed = lastFrameTime ? Math.min(now - lastFrameTime, 100) : TICK_MS;
        lastFrameTime = now;

        let ticked = false;
        if (isRunning && world) {
            const budget = (elapsed / TICK_MS) * timeScale;
            const steps = Math.min(30, Math.max(1, Math.ceil(budget)));
            const dt = budget / steps;
            for (let i = 0; i < steps; i++) world.update(dt);
            ticked = true;
        }

        sceneRenderer.render(world, now / 1000, {
            showPheromones: el('togglePheromones').checked,
            colonyColored: el('toggleColonyColors').checked,
            simTicked: ticked,
        });

        if (frame % 12 === 0) updateStats();
        if (frame % 30 === 0) updateSparklines();

        requestAnimationFrame(loop);
    }

    /* --------------------------------------------------------------- */
    /* World lifecycle                                                  */
    /* --------------------------------------------------------------- */

    function readSettings() {
        return {
            palette: COLONY_PALETTE,
            colonyCount: num('colonyCount'),
            startingFood: num('startingFood'),
            population: {
                scout: num('scoutCount'),
                forager: num('foragerCount'),
                warrior: num('warriorCount'),
            },
            food: {
                count: num('foodCount'),
                amount: num('foodAmount'),
                spawnRate: num('foodSpawnRate'),
                maxSources: num('maxFoodSources'),
            },
            enemy: {
                enabled: el('enableEnemies').checked,
                spawnRate: num('enemySpawnRate'),
                speed: parseFloat(el('enemySpeed').value),
                damage: num('enemyDamage'),
                health: num('enemyHealth'),
            },
        };
    }

    function num(id) { return parseInt(el(id).value, 10); }

    function resetWorld() {
        world = new SimulationWorld(readSettings());
        world.onNotify = showToast;
        world.onFeed = addFeedEntry;
        sceneRenderer.buildWorld(world);
        buildColonyCards();
        el('feedList').innerHTML = '';
    }

    /* --------------------------------------------------------------- */
    /* Controls                                                         */
    /* --------------------------------------------------------------- */

    function bindControls() {
        el('launchBtn').addEventListener('click', (e) => {
            started = true;
            e.currentTarget.blur();
            el('welcome').classList.add('hidden');
            setRunning(true);
        });

        el('playBtn').addEventListener('click', () => setRunning(!isRunning));

        el('resetBtn').addEventListener('click', () => {
            resetWorld();
            setRunning(started && true);
            showToast('Simulation restarted', '#ffd9a8');
        });

        el('cameraBtn').addEventListener('click', () => sceneRenderer.resetCamera());

        el('settingsToggle').addEventListener('click', () => {
            el('settingsPanel').classList.toggle('open');
        });
        el('colonyCollapse').addEventListener('click', () => {
            el('coloniesPanel').classList.toggle('collapsed');
        });
        el('settingsClose').addEventListener('click', () => {
            el('settingsPanel').classList.remove('open');
        });

        el('applyBtn').addEventListener('click', () => {
            resetWorld();
            setRunning(true);
            el('settingsPanel').classList.remove('open');
            showToast('Settings applied — new world generated', '#ffd9a8');
        });

        const speed = el('timeSpeed');
        speed.addEventListener('input', () => {
            timeScale = parseFloat(speed.value);
            el('speedDisplay').textContent = `${timeScale.toFixed(1)}×`;
        });

        // Live value bubbles for every range input in the settings drawer.
        document.querySelectorAll('#settingsPanel input[type="range"]').forEach((input) => {
            const output = document.querySelector(`output[for="${input.id}"]`);
            const sync = () => { if (output) output.textContent = input.value; };
            input.addEventListener('input', sync);
            sync();
        });

        // Log modal.
        el('modalClose').addEventListener('click', closeModal);
        el('logModal').addEventListener('click', (e) => {
            if (e.target === el('logModal')) closeModal();
        });

        window.addEventListener('keydown', (e) => {
            const tag = e.target.tagName;
            // The log modal's only focusable control is its close button —
            // keep Tab inside the dialog while it is open.
            if (e.key === 'Tab' && el('logModal').classList.contains('visible')) {
                e.preventDefault();
                el('modalClose').focus();
                return;
            }
            if (e.key === 'Escape') {
                // Escape always works, even from a focused slider/checkbox.
                closeModal();
                el('settingsPanel').classList.remove('open');
                return;
            }
            if (tag === 'TEXTAREA' || (tag === 'INPUT' &&
                !['range', 'checkbox'].includes(e.target.type))) return;
            if (e.code === 'Space') {
                // Focused buttons/inputs handle Space natively (button
                // activation, checkbox toggle) — don't double-handle.
                if (tag === 'INPUT' || (e.target.closest && e.target.closest('button'))) return;
                e.preventDefault();
                if (started) setRunning(!isRunning);
            } else if (e.key === 'c' || e.key === 'C') {
                sceneRenderer.resetCamera();
            }
        });
    }

    function setRunning(value) {
        if (!started) return; // nothing runs until the welcome overlay is dismissed
        isRunning = value;
        const btn = el('playBtn');
        btn.classList.toggle('playing', isRunning);
        btn.setAttribute('aria-label', isRunning ? 'Pause simulation' : 'Start simulation');
        btn.title = isRunning ? 'Pause (Space)' : 'Start (Space)';
        el('iconPlay').style.display = isRunning ? 'none' : 'block';
        el('iconPause').style.display = isRunning ? 'block' : 'none';
    }

    /* --------------------------------------------------------------- */
    /* Colony dashboard                                                 */
    /* --------------------------------------------------------------- */

    function buildColonyCards() {
        const list = el('colonyList');
        list.innerHTML = world.colonies.map((colony, i) => `
            <article class="colony-card" data-index="${i}" style="--accent:${colony.color}">
                <header>
                    <span class="swatch"></span>
                    <h3>Colony ${i + 1}</h3>
                    <span class="extinct-badge">extinct</span>
                    <button class="icon-btn logs-btn" title="View colony log" aria-label="View colony log">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none"
                             stroke="currentColor" stroke-width="2" stroke-linecap="round">
                            <path d="M4 6h16M4 12h16M4 18h10"/>
                        </svg>
                    </button>
                </header>
                <div class="card-grid">
                    <div><span class="k">Ants</span><span class="v pop">0</span></div>
                    <div><span class="k">Food</span><span class="v food">0</span></div>
                    <div><span class="k">Born</span><span class="v born">0</span></div>
                    <div><span class="k">Lost</span><span class="v dead">0</span></div>
                </div>
                <div class="role-bar" title="Foragers / Scouts / Warriors">
                    <span class="seg seg-forager"></span>
                    <span class="seg seg-scout"></span>
                    <span class="seg seg-warrior"></span>
                </div>
                <canvas class="sparkline" width="200" height="34"></canvas>
            </article>
        `).join('');

        list.querySelectorAll('.colony-card').forEach((card) => {
            const index = parseInt(card.dataset.index, 10);
            card.addEventListener('click', (e) => {
                if (e.target.closest('.logs-btn')) {
                    openLogModal(index);
                } else {
                    focusColony(index);
                }
            });
        });
    }

    function updateStats() {
        if (!world) return;

        const seconds = Math.floor(world.age / 60);
        el('worldAge').textContent =
            `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
        el('worldPop').textContent = world.livingAnts();

        world.colonies.forEach((colony, i) => {
            const card = el('colonyList').children[i];
            if (!card) return;
            const pop = colony.population();
            card.querySelector('.pop').textContent = pop;
            card.querySelector('.food').textContent = Math.floor(colony.foodStock);
            card.querySelector('.born').textContent = colony.antsBorn;
            card.querySelector('.dead').textContent = colony.totalDeaths;
            card.classList.toggle('extinct', colony.isExtinct);

            const foragers = colony.countByType('forager');
            const scouts = colony.countByType('scout');
            const warriors = colony.countByType('warrior');
            const total = Math.max(1, foragers + scouts + warriors);
            card.querySelector('.seg-forager').style.width = `${(foragers / total) * 100}%`;
            card.querySelector('.seg-scout').style.width = `${(scouts / total) * 100}%`;
            card.querySelector('.seg-warrior').style.width = `${(warriors / total) * 100}%`;
        });
    }

    function updateSparklines() {
        if (!world) return;
        world.colonies.forEach((colony, i) => {
            const card = el('colonyList').children[i];
            if (!card) return;
            const canvas = card.querySelector('.sparkline');
            const ctx = canvas.getContext('2d');
            const history = colony.populationHistory;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (history.length < 2) return;

            const max = Math.max(...history.map((p) => p.pop), 1);
            const stepX = canvas.width / (history.length - 1);
            ctx.beginPath();
            history.forEach((p, j) => {
                const x = j * stepX;
                const y = canvas.height - 3 - (p.pop / max) * (canvas.height - 8);
                if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = colony.color;
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // soft fill under the line
            ctx.lineTo((history.length - 1) * stepX, canvas.height);
            ctx.lineTo(0, canvas.height);
            ctx.closePath();
            ctx.globalAlpha = 0.12;
            ctx.fillStyle = colony.color;
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function focusColony(index) {
        sceneRenderer.focusOnColony(world, index);
    }

    function pulseCard(index) {
        const card = el('colonyList').children[index];
        if (!card) return;
        card.classList.remove('pulse');
        void card.offsetWidth; // restart the animation
        card.classList.add('pulse');
    }

    /* --------------------------------------------------------------- */
    /* Log modal                                                        */
    /* --------------------------------------------------------------- */

    let lastFocus = null;

    function openLogModal(index) {
        lastFocus = document.activeElement;
        const colony = world.colonies[index];
        el('modalTitle').textContent = `Colony ${index + 1} — Event Log`;
        el('modalTitle').style.color = colony.color;
        el('modalLogs').innerHTML = colony.logs.length
            ? colony.logs.map((entry) =>
                `<div class="log-entry" style="color:${entry.color}">${escapeHtml(entry.message)}</div>`).join('')
            : '<div class="log-entry muted">Nothing has happened yet.</div>';
        el('logModal').classList.add('visible');
        el('modalClose').focus();
    }

    function closeModal() {
        if (!el('logModal').classList.contains('visible')) return;
        el('logModal').classList.remove('visible');
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        lastFocus = null;
    }

    /* --------------------------------------------------------------- */
    /* Toasts + event feed                                              */
    /* --------------------------------------------------------------- */

    function showToast(message, color) {
        if (!started) return;
        const stack = el('toasts');
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.style.borderLeftColor = color || '#ffd9a8';
        toast.textContent = message;
        stack.appendChild(toast);
        while (stack.children.length > 4) stack.removeChild(stack.firstChild);
        setTimeout(() => toast.classList.add('leaving'), 4200);
        setTimeout(() => toast.remove(), 4800);
    }

    function addFeedEntry(colony, message, color) {
        if (!started) return;
        const list = el('feedList');
        const entry = document.createElement('div');
        entry.className = 'feed-entry';
        entry.innerHTML = `<span class="dot" style="background:${colony.color}"></span>` +
            `<span style="color:${color}">${escapeHtml(message)}</span>`;
        list.prepend(entry);
        while (list.children.length > 4) list.removeChild(list.lastChild);
        setTimeout(() => { entry.classList.add('leaving'); }, 9000);
        setTimeout(() => { if (entry.parentNode) entry.remove(); }, 9600);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    window.addEventListener('load', init);
}());
