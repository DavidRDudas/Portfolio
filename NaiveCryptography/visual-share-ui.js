/**
 * UI layer for the Visual Share Cipher.
 *
 * All cryptography lives in visual-share-cipher.js; this file only moves
 * bytes between that module and the DOM.
 *
 * One deliberate omission: the drawn pattern is held in a module-local
 * variable and is never written to localStorage, sessionStorage, the URL, or
 * the encrypted output. Reloading the page forgets it, which is the point --
 * a key you can recover from the machine is not a key.
 */
(function () {
    'use strict';

    const V = window.VisualShareCipher;

    /* --------------------------------------------------------------------- *
     * Shared state and small helpers
     * --------------------------------------------------------------------- */

    let pattern = { gridSize: 16, steps: [] };
    let selectedColor = 0;
    let selectedRotation = 0;
    let focusedCell = 0;

    const importedShares = { a: null, b: null };
    let lastShares = null;
    let otpResult = null;

    const $ = function (id) { return document.getElementById(id); };

    function toast(message) {
        if (typeof window.showToast === 'function') window.showToast(message);
    }

    function setStatus(id, message, kind) {
        const el = $(id);
        if (!el) return;
        el.textContent = message || '';
        el.className = 'vsc-status' + (kind ? ' vsc-status--' + kind : '');
    }

    function describeError(e) {
        return (e && e.message) ? e.message : String(e);
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function paintBytes(canvas, bytes, displaySize) {
        const imageData = V.bytesToImageData(bytes);
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext('2d').putImageData(imageData, 0, 0);
        canvas.style.width = (displaySize || 180) + 'px';
        canvas.style.height = (displaySize || 180) + 'px';
    }

    function paintBitmap(canvas, bits, width, height, displayWidth) {
        const imageData = V.bitmapToImageData(bits, width, height);
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').putImageData(imageData, 0, 0);
        canvas.style.width = (displayWidth || width) + 'px';
        canvas.style.height = 'auto';
    }

    function currentIterations() {
        const raw = parseInt(($('vscIterations') || {}).value, 10);
        if (!isFinite(raw)) return V.DEFAULT_ITERATIONS;
        return Math.min(V.MAX_ITERATIONS, Math.max(V.MIN_ITERATIONS, raw));
    }

    /* --------------------------------------------------------------------- *
     * The visual key pad
     * --------------------------------------------------------------------- */

    function stepIndexForCell(cell) {
        for (let i = 0; i < pattern.steps.length; i++) {
            if (pattern.steps[i].cell === cell) return i;
        }
        return -1;
    }

    function buildKeyGrid() {
        const host = $('keyGrid');
        if (!host) return;
        host.innerHTML = '';
        host.style.gridTemplateColumns = 'repeat(' + pattern.gridSize + ', 1fr)';
        host.setAttribute('role', 'group');
        host.setAttribute('aria-label', 'Visual key pad, ' + pattern.gridSize + ' by ' + pattern.gridSize +
            '. Arrow keys move, space toggles a cell.');

        const total = pattern.gridSize * pattern.gridSize;
        for (let i = 0; i < total; i++) {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'key-cell';
            cell.dataset.cell = String(i);
            cell.tabIndex = i === focusedCell ? 0 : -1;

            // Two glyphs: the step number (order is the point of the scheme,
            // so it has to be visible) and a chevron showing the rotation.
            const number = document.createElement('span');
            number.className = 'key-cell__n';
            const rotation = document.createElement('span');
            rotation.className = 'key-cell__r';
            cell.appendChild(number);
            cell.appendChild(rotation);
            host.appendChild(cell);
        }
        renderKeyGrid();
    }

    function renderKeyGrid() {
        const host = $('keyGrid');
        if (!host) return;

        const cells = host.children;
        for (let i = 0; i < cells.length; i++) {
            const el = cells[i];
            const step = stepIndexForCell(i);
            const number = el.children[0];
            const rotation = el.children[1];
            el.tabIndex = i === focusedCell ? 0 : -1;
            if (step === -1) {
                el.className = 'key-cell';
                el.style.backgroundColor = '';
                number.textContent = '';
                rotation.textContent = '';
                rotation.style.transform = '';
                el.setAttribute('aria-label', 'Empty cell ' + i);
                el.setAttribute('aria-pressed', 'false');
            } else {
                const s = pattern.steps[step];
                el.className = 'key-cell key-cell--on';
                el.style.backgroundColor = V.PALETTE[s.color];
                number.textContent = String(step + 1);
                rotation.textContent = '▲';
                rotation.style.transform = 'rotate(' + V.ROTATIONS[s.rotation] + 'deg)';
                el.setAttribute('aria-label',
                    'Cell ' + i + ', step ' + (step + 1) + ', rotation ' + V.ROTATIONS[s.rotation] + ' degrees');
                el.setAttribute('aria-pressed', 'true');
            }
        }
        renderKeyReadout();
    }

    function renderKeyReadout() {
        const verdict = V.strengthVerdict(pattern, currentIterations());
        const maxBits = V.maxEntropyBits(pattern);

        if ($('keyEntropyReal')) $('keyEntropyReal').textContent = verdict.bits.toFixed(0);
        if ($('keyEntropyMax')) $('keyEntropyMax').textContent = maxBits.toFixed(0);
        if ($('keyStepCount')) $('keyStepCount').textContent = String(pattern.steps.length);

        const bar = $('keyStrengthBar');
        if (bar) {
            bar.style.width = Math.min(100, (verdict.effective / 128) * 100) + '%';
            bar.dataset.level = String(verdict.level);
        }
        const label = $('keyStrengthLabel');
        if (label) {
            label.textContent = verdict.label;
            label.dataset.level = String(verdict.level);
        }

        const advice = $('keyAdvice');
        if (advice) {
            if (pattern.steps.length === 0) {
                advice.textContent = 'Click cells to draw your key. Order matters: the same cells in a different order are a different key.';
            } else if (pattern.steps.length < 8) {
                advice.textContent = 'Short keys fall to offline brute force. Aim for at least 10 steps.';
            } else if (verdict.bits < maxBits * 0.5) {
                advice.textContent = 'This pattern is far below its theoretical maximum -- it reads as a connected shape on one colour. Break the line and vary colour or rotation.';
            } else {
                advice.textContent = 'Scattered, varied, and long enough. Memorise it: it is never stored anywhere.';
            }
        }
    }

    function toggleCell(cell) {
        const existing = stepIndexForCell(cell);
        if (existing === -1) {
            pattern.steps.push({ cell: cell, color: selectedColor, rotation: selectedRotation });
        } else {
            pattern.steps.splice(existing, 1);
        }
        renderKeyGrid();
    }

    function moveFocus(delta) {
        const total = pattern.gridSize * pattern.gridSize;
        focusedCell = Math.min(total - 1, Math.max(0, focusedCell + delta));
        const host = $('keyGrid');
        if (host && host.children[focusedCell]) {
            renderKeyGrid();
            host.children[focusedCell].focus();
        }
    }

    function wireKeyPad() {
        const host = $('keyGrid');
        if (!host) return;

        host.addEventListener('click', function (event) {
            const target = event.target.closest('.key-cell');
            if (!target) return;
            focusedCell = parseInt(target.dataset.cell, 10);
            toggleCell(focusedCell);
        });

        host.addEventListener('keydown', function (event) {
            const size = pattern.gridSize;
            const map = {
                ArrowRight: 1, ArrowLeft: -1,
                ArrowDown: size, ArrowUp: -size
            };
            if (map[event.key] !== undefined) {
                event.preventDefault();
                moveFocus(map[event.key]);
            }
        });

        const palette = $('keyPalette');
        if (palette) {
            V.PALETTE.forEach(function (colour, index) {
                const swatch = document.createElement('button');
                swatch.type = 'button';
                swatch.className = 'swatch' + (index === 0 ? ' swatch--on' : '');
                swatch.style.backgroundColor = colour;
                swatch.dataset.index = String(index);
                swatch.setAttribute('aria-label', 'Colour ' + (index + 1));
                swatch.addEventListener('click', function () {
                    selectedColor = index;
                    Array.prototype.forEach.call(palette.children, function (el) {
                        el.classList.toggle('swatch--on', el === swatch);
                    });
                });
                palette.appendChild(swatch);
            });
        }

        const rotations = $('keyRotations');
        if (rotations) {
            V.ROTATIONS.forEach(function (degrees, index) {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'rot' + (index === 0 ? ' rot--on' : '');
                button.dataset.index = String(index);
                button.innerHTML = '<span style="transform:rotate(' + degrees + 'deg)">▲</span>';
                button.setAttribute('aria-label', 'Rotation ' + degrees + ' degrees');
                button.addEventListener('click', function () {
                    selectedRotation = index;
                    Array.prototype.forEach.call(rotations.children, function (el) {
                        el.classList.toggle('rot--on', el === button);
                    });
                });
                rotations.appendChild(button);
            });
        }

        if ($('keyGridSize')) {
            $('keyGridSize').addEventListener('change', function (event) {
                const next = parseInt(event.target.value, 10);
                if (pattern.steps.length &&
                    !confirm('Changing the grid size clears the pattern you drew. Continue?')) {
                    event.target.value = String(pattern.gridSize);
                    return;
                }
                pattern = { gridSize: next, steps: [] };
                focusedCell = 0;
                buildKeyGrid();
            });
        }

        if ($('keyUndo')) {
            $('keyUndo').addEventListener('click', function () {
                pattern.steps.pop();
                renderKeyGrid();
            });
        }

        if ($('keyClear')) {
            $('keyClear').addEventListener('click', function () {
                pattern.steps = [];
                renderKeyGrid();
                toast('Visual key cleared');
            });
        }

        if ($('keyRandom')) {
            $('keyRandom').addEventListener('click', function () {
                const total = pattern.gridSize * pattern.gridSize;
                const wanted = 14;
                const chosen = [];
                const used = new Set();
                while (chosen.length < wanted) {
                    // Rejection-sample a uniform cell index rather than folding a
                    // random byte with %, which would favour the low cells.
                    const draw = V.randomIndices(1, total)[0];
                    if (used.has(draw)) continue;
                    used.add(draw);
                    chosen.push({
                        cell: draw,
                        color: V.randomIndices(1, V.PALETTE.length)[0],
                        rotation: V.randomIndices(1, V.ROTATIONS.length)[0]
                    });
                }
                pattern.steps = chosen;
                renderKeyGrid();
                toast('Random key drawn -- write it down, it is not stored');
            });
        }
    }

    /* --------------------------------------------------------------------- *
     * Encrypt
     * --------------------------------------------------------------------- */

    async function doEncrypt() {
        const message = ($('vscInput') || {}).value || '';
        try {
            setStatus('vscEncryptStatus', 'Deriving key (' + currentIterations().toLocaleString() + ' PBKDF2 iterations)...', 'busy');
            const blob = await V.encrypt(message, pattern, { iterations: currentIterations() });
            const shares = V.splitIntoShares(blob);
            lastShares = shares;

            $('vscShareAText').value = V.toBase64(shares[0]);
            $('vscShareBText').value = V.toBase64(shares[1]);
            paintBytes($('vscShareACanvas'), shares[0]);
            paintBytes($('vscShareBCanvas'), shares[1]);
            $('vscShareOutputs').hidden = false;

            setStatus('vscEncryptStatus',
                'Encrypted. ' + blob.length + '-byte envelope split into two ' +
                shares[0].length + '-byte shares. Send them by different channels -- ' +
                'anyone holding just one has nothing.', 'ok');
            toast('Encrypted into two shares');
        } catch (e) {
            setStatus('vscEncryptStatus', describeError(e), 'error');
            toast('Encryption failed');
        }
    }

    async function downloadShare(index) {
        if (!lastShares) return;
        const canvas = V.imageDataToCanvas(V.bytesToImageData(lastShares[index]));
        download(await V.canvasToBlob(canvas), 'vsc-share-' + (index + 1) + '.png');
    }

    /* --------------------------------------------------------------------- *
     * Decrypt
     * --------------------------------------------------------------------- */

    function noteShare(slot, bytes, origin) {
        try {
            const parsed = V.parseShare(bytes);
            importedShares[slot] = bytes;
            setStatus('vscShare' + slot.toUpperCase() + 'Status',
                'Loaded share ' + (parsed.index + 1) + ' from ' + origin +
                ' (' + parsed.payload.length + ' bytes).', 'ok');
        } catch (e) {
            importedShares[slot] = null;
            setStatus('vscShare' + slot.toUpperCase() + 'Status', describeError(e), 'error');
        }
    }

    async function loadShareFile(slot, file) {
        if (!file) return;
        try {
            const imageData = await V.blobToImageData(file);
            noteShare(slot, V.imageDataToBytes(imageData), file.name);
        } catch (e) {
            setStatus('vscShare' + slot.toUpperCase() + 'Status', describeError(e), 'error');
        }
    }

    function loadShareText(slot, text) {
        if (!text.trim()) {
            importedShares[slot] = null;
            setStatus('vscShare' + slot.toUpperCase() + 'Status', '');
            return;
        }
        try {
            noteShare(slot, V.fromBase64(text), 'pasted text');
        } catch (e) {
            importedShares[slot] = null;
            setStatus('vscShare' + slot.toUpperCase() + 'Status', 'Not valid base64.', 'error');
        }
    }

    async function doDecrypt() {
        try {
            if (!importedShares.a || !importedShares.b) {
                throw new Error('Load both shares first. One share alone is mathematically useless -- that is the whole design.');
            }
            setStatus('vscDecryptStatus', 'Combining shares and deriving key...', 'busy');
            const blob = V.combineShares(importedShares.a, importedShares.b);
            const result = await V.decrypt(blob, pattern);
            $('vscDecodedOutput').value = result.text;
            setStatus('vscDecryptStatus',
                'Authenticated and decrypted (' + result.header.iterations.toLocaleString() +
                ' iterations, key grid ' + result.header.gridSize + 'x' + result.header.gridSize + ').', 'ok');
            toast('Decrypted');
        } catch (e) {
            $('vscDecodedOutput').value = '';
            setStatus('vscDecryptStatus', describeError(e), 'error');
            toast('Decryption failed');
        }
    }

    /* --------------------------------------------------------------------- *
     * Naor-Shamir visual one-time pad
     * --------------------------------------------------------------------- */

    function doVisualSplit() {
        const text = ($('otpInput') || {}).value || '';
        if (!text.trim()) {
            setStatus('otpStatus', 'Type a short message to hide in the two images.', 'error');
            return;
        }
        try {
            const bitmap = V.textToBitmap(text, { fontSize: 22, maxWidth: 340 });
            const split = V.visualSplitBitmap(bitmap.bits, bitmap.width, bitmap.height);
            const stacked = V.stackShares(split.a, split.b);
            otpResult = { split: split, stacked: stacked };

            const thumb = Math.min(340, split.width);
            paintBitmap($('otpShareA'), split.a, split.width, split.height, thumb);
            paintBitmap($('otpShareB'), split.b, split.width, split.height, thumb);
            paintBitmap($('otpStacked'), stacked, split.width, split.height, thumb);

            // The overlay renders 1:1 so each 2x2 subpixel block maps to real
            // screen pixels. Downscaling it would blur away the contrast the
            // scheme is built on.
            paintBitmap($('otpOverlayA'), split.a, split.width, split.height, split.width);
            paintBitmap($('otpOverlayB'), split.b, split.width, split.height, split.width);
            resetOverlay();

            $('otpResults').hidden = false;
            setStatus('otpStatus',
                'Split into two ' + split.width + 'x' + split.height + ' images. Each is pure noise on its own. ' +
                'Drag the top one into alignment below, or print both on transparencies and physically stack them.', 'ok');
        } catch (e) {
            setStatus('otpStatus', describeError(e), 'error');
        }
    }

    let overlayOffset = { x: 42, y: 26 };
    let dragging = null;

    function resetOverlay() {
        overlayOffset = { x: 42, y: 26 };
        applyOverlay();
    }

    function applyOverlay() {
        const top = $('otpOverlayB');
        if (!top) return;
        top.style.transform = 'translate(' + overlayOffset.x + 'px, ' + overlayOffset.y + 'px)';
        const aligned = Math.abs(overlayOffset.x) < 2 && Math.abs(overlayOffset.y) < 2;
        const hint = $('otpOverlayHint');
        if (hint) {
            hint.textContent = aligned
                ? 'Aligned. Black stays black wherever either share has ink -- that is exactly what stacking two transparencies does.'
                : 'Drag the top share into place (off by ' + Math.round(overlayOffset.x) + ', ' + Math.round(overlayOffset.y) + ' px).';
        }
    }

    function wireOverlay() {
        const top = $('otpOverlayB');
        if (!top) return;

        top.addEventListener('pointerdown', function (event) {
            dragging = { x: event.clientX - overlayOffset.x, y: event.clientY - overlayOffset.y };
            top.setPointerCapture(event.pointerId);
            event.preventDefault();
        });
        top.addEventListener('pointermove', function (event) {
            if (!dragging) return;
            overlayOffset = { x: event.clientX - dragging.x, y: event.clientY - dragging.y };
            applyOverlay();
        });
        const stop = function () { dragging = null; };
        top.addEventListener('pointerup', stop);
        top.addEventListener('pointercancel', stop);

        if ($('otpAlign')) {
            $('otpAlign').addEventListener('click', function () {
                overlayOffset = { x: 0, y: 0 };
                applyOverlay();
            });
        }
        if ($('otpScatter')) {
            $('otpScatter').addEventListener('click', resetOverlay);
        }
    }

    async function downloadOtpShare(which) {
        if (!otpResult) return;
        const bits = which === 0 ? otpResult.split.a : otpResult.split.b;
        const canvas = V.imageDataToCanvas(
            V.bitmapToImageData(bits, otpResult.split.width, otpResult.split.height));
        download(await V.canvasToBlob(canvas), 'visual-otp-share-' + (which + 1) + '.png');
    }

    /* --------------------------------------------------------------------- *
     * Self-test
     *
     * Exercises the paths that only exist in a browser -- above all the PNG
     * round trip, which depends on the browser not colour-managing the
     * pixels on the way back in.
     * --------------------------------------------------------------------- */

    async function runSelfTest() {
        const out = $('vscSelfTestOut');
        const lines = [];
        let failures = 0;

        function check(name, condition, detail) {
            if (condition) {
                lines.push('PASS  ' + name);
            } else {
                failures++;
                lines.push('FAIL  ' + name + (detail ? '  -- ' + detail : ''));
            }
            out.value = lines.join('\n');
        }

        out.value = 'Running...';
        try {
            const testPattern = {
                gridSize: 16,
                steps: [
                    { cell: 34, color: 0, rotation: 0 }, { cell: 91, color: 3, rotation: 2 },
                    { cell: 52, color: 5, rotation: 5 }, { cell: 200, color: 1, rotation: 7 }
                ]
            };
            const message = 'self-test — éàü \u{1F510} ' + 'x'.repeat(400);

            const blob = await V.encrypt(message, testPattern, { iterations: V.MIN_ITERATIONS });
            check('envelope decrypts to the original string',
                (await V.decrypt(blob, testPattern)).text === message);

            const wrongPattern = {
                gridSize: 16,
                steps: testPattern.steps.slice(0, 3).concat([{ cell: 201, color: 1, rotation: 7 }])
            };
            let rejected = false;
            try { await V.decrypt(blob, wrongPattern); } catch (e) { rejected = true; }
            check('a wrong visual key is rejected', rejected);

            const tampered = blob.slice();
            tampered[tampered.length - 1] ^= 1;
            rejected = false;
            try { await V.decrypt(tampered, testPattern); } catch (e) { rejected = true; }
            check('a single flipped ciphertext bit is rejected', rejected);

            const shares = V.splitIntoShares(blob);
            const recombined = V.combineShares(shares[0], shares[1]);
            check('XOR shares recombine to the envelope',
                recombined.length === blob.length &&
                recombined.every(function (b, i) { return b === blob[i]; }));

            const payload = V.parseShare(shares[0]).payload;
            check('share 1 alone does not contain the envelope',
                !payload.every(function (b, i) { return b === blob[i]; }));

            // The part that can genuinely differ between browsers.
            const pngA = await V.canvasToBlob(V.imageDataToCanvas(V.bytesToImageData(shares[0])));
            const pngB = await V.canvasToBlob(V.imageDataToCanvas(V.bytesToImageData(shares[1])));
            const backA = V.imageDataToBytes(await V.blobToImageData(pngA));
            const backB = V.imageDataToBytes(await V.blobToImageData(pngB));
            check('share 1 survives the PNG round trip',
                backA.length >= shares[0].length &&
                shares[0].every(function (b, i) { return b === backA[i]; }),
                'this browser may be colour-managing canvas pixels; use the base64 shares instead');
            const viaPng = V.combineShares(backA, backB);
            const decodedFromPng = await V.decrypt(viaPng, testPattern);
            check('full PNG path decrypts correctly', decodedFromPng.text === message);

            // Naor-Shamir contrast and secrecy properties.
            const bitmap = V.textToBitmap('OK', { fontSize: 20, maxWidth: 120 });
            const split = V.visualSplitBitmap(bitmap.bits, bitmap.width, bitmap.height);
            const stacked = V.stackShares(split.a, split.b);
            let contrastOk = true;
            let shareUniform = true;
            const histogram = {};
            for (let y = 0; y < bitmap.height; y++) {
                for (let x = 0; x < bitmap.width; x++) {
                    let stackedInk = 0;
                    let shareInk = 0;
                    let key = '';
                    for (let k = 0; k < 4; k++) {
                        const off = (y * 2 + (k >> 1)) * split.width + (x * 2 + (k % 2));
                        stackedInk += stacked[off];
                        shareInk += split.a[off];
                        key += split.a[off];
                    }
                    histogram[key] = (histogram[key] || 0) + 1;
                    const secretBlack = bitmap.bits[y * bitmap.width + x] === 1;
                    if (secretBlack ? stackedInk !== 4 : stackedInk !== 2) contrastOk = false;
                    if (shareInk !== 2) shareUniform = false;
                }
            }
            check('Naor-Shamir contrast: black stacks to 4/4, white to 2/4', contrastOk);
            check('every share block carries exactly two black subpixels', shareUniform);
            check('share uses all six 2x2 patterns', Object.keys(histogram).length === 6,
                Object.keys(histogram).join(' '));

            lines.push('');
            lines.push(failures === 0
                ? 'All checks passed in this browser.'
                : failures + ' check(s) failed. Do not trust the affected path here.');
            out.value = lines.join('\n');
        } catch (e) {
            out.value = lines.concat(['', 'ERROR: ' + describeError(e)]).join('\n');
        }
    }

    /* --------------------------------------------------------------------- *
     * Wiring
     * --------------------------------------------------------------------- */

    function wire(id, event, handler) {
        const el = $(id);
        if (el) el.addEventListener(event, handler);
    }

    document.addEventListener('DOMContentLoaded', function () {
        if (!window.crypto || !window.crypto.subtle) {
            setStatus('vscEncryptStatus',
                'This browser does not expose Web Crypto. The page must be served over https:// or from localhost.',
                'error');
            return;
        }

        buildKeyGrid();
        wireKeyPad();
        wireOverlay();

        wire('vscEncryptBtn', 'click', doEncrypt);
        wire('vscDownloadA', 'click', function () { downloadShare(0); });
        wire('vscDownloadB', 'click', function () { downloadShare(1); });
        wire('vscClearEncrypt', 'click', function () {
            $('vscInput').value = '';
            $('vscShareAText').value = '';
            $('vscShareBText').value = '';
            $('vscShareOutputs').hidden = true;
            lastShares = null;
            setStatus('vscEncryptStatus', '');
        });

        wire('vscDecryptBtn', 'click', doDecrypt);
        wire('vscShareAFile', 'change', function (e) { loadShareFile('a', e.target.files[0]); });
        wire('vscShareBFile', 'change', function (e) { loadShareFile('b', e.target.files[0]); });
        wire('vscShareAIn', 'input', function (e) { loadShareText('a', e.target.value); });
        wire('vscShareBIn', 'input', function (e) { loadShareText('b', e.target.value); });

        wire('otpSplitBtn', 'click', doVisualSplit);
        wire('otpDownloadA', 'click', function () { downloadOtpShare(0); });
        wire('otpDownloadB', 'click', function () { downloadOtpShare(1); });

        wire('vscSelfTest', 'click', runSelfTest);
        wire('vscIterations', 'input', renderKeyReadout);

        // Copy buttons for the new panes reuse the legacy helper when present.
        Array.prototype.forEach.call(document.querySelectorAll('[data-copy]'), function (button) {
            button.addEventListener('click', function () {
                const target = $(button.dataset.copy);
                if (!target || !target.value) return;
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(target.value).then(function () {
                        toast('Copied to clipboard');
                    });
                } else {
                    target.select();
                    document.execCommand('copy');
                    toast('Copied to clipboard');
                }
            });
        });
    });
})();
