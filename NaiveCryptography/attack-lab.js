/**
 * Attack Lab
 * ===========================================================================
 * Working attacks against the two ciphers in this app. Documentation claims a
 * scheme is broken; an attack demonstrates it.
 *
 * Everything here is deliberately standalone. breakLegacy() does not call into
 * VisualGridCipher, does not read any app state, and does not need the grid
 * that produced the ciphertext to still exist. It reimplements the legacy key
 * schedule from scratch against nothing but the output string, because that is
 * exactly the position a real attacker is in -- and the whole point is that it
 * is enough.
 */
(function (global) {
    'use strict';

    /* --------------------------------------------------------------------- *
     * Attack 1: the legacy grid cipher
     *
     * VisualGridCipher.encrypt() derives its PBKDF2 input from each active
     * cell's position, colour, rotation and intensity, then writes those same
     * four fields into gridState.pattern and ships them with the ciphertext.
     * Reconstructing the key is therefore a parsing exercise.
     *
     * Note the constants below are transcribed from script.js, not imported.
     * If that file changed, this attack would break -- which is the only sense
     * in which the legacy cipher has any security at all.
     * --------------------------------------------------------------------- */

    const LEGACY_COLORS = [
        '#ff7f0e', '#2ca02c', '#1f77b4', '#9467bd',
        '#e377c2', '#bcbd22', '#17becf', '#7f7f7f'
    ];

    const LEGACY_BASE_ITERATIONS = 150000;
    const LEGACY_ITERATIONS_PER_STRENGTH = 75000;

    function legacyColorValue(hex) {
        return LEGACY_COLORS.indexOf(hex) + 1;
    }

    function base64ToBytes(str) {
        const bin = atob(String(str).replace(/\s+/g, ''));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function toHex(bytes, limit) {
        const slice = limit ? bytes.slice(0, limit) : bytes;
        return Array.prototype.map
            .call(slice, function (b) { return b.toString(16).padStart(2, '0'); })
            .join(' ') + (limit && bytes.length > limit ? ' ...' : '');
    }

    /**
     * Recover the plaintext of a legacy envelope using only the envelope.
     * @returns {Promise<object>} details of how the key was rebuilt
     */
    async function breakLegacy(jsonText) {
        let envelope;
        try {
            envelope = JSON.parse(jsonText);
        } catch (e) {
            throw new Error('That is not a legacy envelope (not valid JSON).');
        }

        // Version 2.0 -- SecureVisualGridCipher -- does not even need the key
        // schedule reconstructed. It exports the raw AES-256 key into the
        // output in a field named `key`.
        if (envelope.version === '2.0' && envelope.key) {
            const rawKey = base64ToBytes(envelope.key);
            const iv = base64ToBytes(envelope.iv);
            const data = base64ToBytes(envelope.data);
            const state = JSON.parse(atob(envelope.gridState));
            const aad = state.pattern
                ? new TextEncoder().encode(state.pattern)
                : new Uint8Array();
            const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
            const plain = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: iv, additionalData: aad, tagLength: 128 }, key, data);
            return {
                variant: 'v2.0 (SecureVisualGridCipher)',
                plaintext: new TextDecoder().decode(plain),
                how: 'No key recovery needed. The raw AES-256 key is carried in the envelope\'s "key" field.',
                keyBytes: toHex(rawKey, 16),
                iterations: 0,
                nodeCount: state.nodeCount,
                patternPreview: (state.pattern || '(absent)').slice(0, 160)
            };
        }

        if (!envelope.gridState || !envelope.salt || !envelope.iv || !envelope.data) {
            throw new Error('That is not a legacy envelope (missing salt/iv/data/gridState).');
        }

        const state = JSON.parse(atob(envelope.gridState));
        if (!state.pattern) {
            throw new Error('This envelope carries no pattern field.');
        }

        // The envelope's own gridSize is used here. The app's decrypt() uses
        // the *decrypting instance's* gridSize instead, which is why a legacy
        // ciphertext made on a resized grid cannot be decoded by a freshly
        // loaded page. The attacker's version is more reliable than the app's.
        const gridSize = state.gridSize || 32;

        const steps = state.pattern.split(',').filter(Boolean).map(function (entry) {
            const parts = entry.split(':');
            return {
                pos: parseInt(parts[0], 10),
                color: parts[1],
                rotation: parseInt(parts[2], 10),
                intensity: parseInt(parts[3], 10)
            };
        });

        // Transcribed from VisualGridCipher.encrypt().
        const keyBytes = new Uint8Array(64);
        steps.forEach(function (s, i) {
            if (i >= 64) return;
            const colorValue = legacyColorValue(s.color);
            keyBytes[i] = (s.pos * colorValue * 17 +
                13 * s.rotation +
                11 * s.intensity +
                7 * Math.floor(s.pos / gridSize) +
                (s.pos % gridSize) * 5) % 256;
        });

        const iterations = LEGACY_BASE_ITERATIONS + LEGACY_ITERATIONS_PER_STRENGTH * state.strength;
        const base = await crypto.subtle.importKey('raw', keyBytes, 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: base64ToBytes(envelope.salt), iterations: iterations, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);

        const plain = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: base64ToBytes(envelope.iv),
                additionalData: new TextEncoder().encode(state.pattern)
            },
            key,
            base64ToBytes(envelope.data));

        return {
            variant: 'v1 (VisualGridCipher)',
            plaintext: new TextDecoder().decode(plain),
            how: 'The key schedule was rebuilt from gridState.pattern, which the envelope carries in the clear.',
            keyBytes: toHex(keyBytes, 16),
            iterations: iterations,
            nodeCount: state.nodeCount,
            strength: state.strength,
            gridSize: gridSize,
            stepCount: steps.length,
            patternPreview: state.pattern.slice(0, 160)
        };
    }

    /* --------------------------------------------------------------------- *
     * Attack 2: dictionary attack on a drawn visual key
     *
     * VSC-1 is only as strong as the pattern. This enumerates the shapes
     * people actually draw -- runs, columns, diagonals, corners and boxes, all
     * on the default colour and rotation -- and tries each one. A scattered
     * pattern survives; a line does not.
     * --------------------------------------------------------------------- */

    function makePattern(gridSize, cells) {
        return {
            gridSize: gridSize,
            steps: cells.map(function (c) { return { cell: c, color: 0, rotation: 0 }; })
        };
    }

    /**
     * Candidate patterns in roughly descending order of how likely a human is
     * to draw them. Straight runs first, then diagonals, then corners and
     * boxes.
     */
    function generateHumanPatterns(gridSize, limit) {
        const out = [];
        const seen = new Set();
        const add = function (cells) {
            if (cells.length < 3 || out.length >= limit) return;
            if (cells.some(function (c) { return c < 0 || c >= gridSize * gridSize; })) return;
            const key = cells.join(',');
            if (seen.has(key)) return;
            seen.add(key);
            out.push(makePattern(gridSize, cells));
        };

        const run = function (start, stride, len) {
            return Array.from({ length: len }, function (_, i) { return start + i * stride; });
        };

        // Shape family is the outer loop, length the inner one. Ordering the
        // dictionary by "what do people draw most" rather than by length gets
        // a hit far sooner, which is how a real attacker would order it too.

        // horizontal runs -- by far the most common thing anyone draws
        for (let len = 4; len <= 12 && out.length < limit; len++) {
            for (let r = 0; r < gridSize; r++) {
                for (let c = 0; c + len <= gridSize; c++) add(run(r * gridSize + c, 1, len));
            }
        }
        // vertical runs
        for (let len = 4; len <= 12 && out.length < limit; len++) {
            for (let c = 0; c < gridSize; c++) {
                for (let r = 0; r + len <= gridSize; r++) add(run(r * gridSize + c, gridSize, len));
            }
        }
        // diagonals, both directions
        for (let len = 4; len <= 12 && out.length < limit; len++) {
            for (let r = 0; r + len <= gridSize; r++) {
                for (let c = 0; c + len <= gridSize; c++) {
                    add(run(r * gridSize + c, gridSize + 1, len));
                    add(run(r * gridSize + (gridSize - 1 - c), gridSize - 1, len));
                }
            }
        }
        // right angles -- the "L" everybody draws
        for (let len = 4; len <= 12 && out.length < limit; len++) {
            for (let r = 0; r + len <= gridSize; r++) {
                for (let c = 0; c + len <= gridSize; c++) {
                    const arm = Math.ceil(len / 2);
                    add(run(r * gridSize + c, gridSize, arm)
                        .concat(run((r + arm - 1) * gridSize + c + 1, 1, len - arm)));
                }
            }
        }

        // closed boxes
        for (let side = 3; side <= 7 && out.length < limit; side++) {
            for (let r = 0; r + side <= gridSize; r++) {
                for (let c = 0; c + side <= gridSize; c++) {
                    const cells = [];
                    for (let i = 0; i < side; i++) cells.push(r * gridSize + c + i);
                    for (let i = 1; i < side; i++) cells.push((r + i) * gridSize + c + side - 1);
                    for (let i = side - 2; i >= 0; i--) cells.push((r + side - 1) * gridSize + c + i);
                    for (let i = side - 2; i >= 1; i--) cells.push((r + i) * gridSize + c);
                    add(cells);
                }
            }
        }

        return out;
    }

    /**
     * Try each candidate against the envelope until one authenticates.
     *
     * WebCrypto runs off the main thread, but the await chain still needs to
     * yield periodically or the progress display never repaints.
     */
    async function crackVisualKey(envelope, candidates, options) {
        options = options || {};
        const onProgress = options.onProgress || function () {};
        const shouldStop = options.shouldStop || function () { return false; };
        const V = global.VisualShareCipher;

        const started = performance.now();
        let tried = 0;

        for (let i = 0; i < candidates.length; i++) {
            if (shouldStop()) {
                return { found: false, stopped: true, tried: tried, elapsedMs: performance.now() - started };
            }
            try {
                const result = await V.decrypt(envelope, candidates[i]);
                return {
                    found: true,
                    pattern: candidates[i],
                    plaintext: result.text,
                    tried: tried + 1,
                    elapsedMs: performance.now() - started
                };
            } catch (e) {
                // Wrong key and tampered ciphertext are indistinguishable here,
                // which is correct GCM behaviour -- just move on.
            }
            tried++;
            if (tried % 25 === 0) {
                onProgress({ tried: tried, total: candidates.length, elapsedMs: performance.now() - started });
                await new Promise(function (r) { setTimeout(r, 0); });
            }
        }

        return { found: false, stopped: false, tried: tried, elapsedMs: performance.now() - started };
    }

    /**
     * Extrapolate an exhaustive search from a measured rate.
     * Returns a human-readable duration for 2^bits candidates.
     */
    const SECONDS_PER_YEAR = 31557600;

    /**
     * Format a duration given in seconds. Kept separate from the projection so
     * both the "cracked in" and "would take" paths read the same way.
     */
    function formatDuration(seconds) {
        const units = [
            ['second', 1], ['minute', 60], ['hour', 3600],
            ['day', 86400], ['year', SECONDS_PER_YEAR]
        ];
        let chosen = units[0];
        for (let i = 0; i < units.length; i++) {
            if (seconds >= units[i][1]) chosen = units[i];
        }
        const value = seconds / chosen[1];
        const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
        return rounded + ' ' + chosen[0] + (rounded === 1 ? '' : 's');
    }

    /**
     * Time to search 2^bits candidates at a measured rate.
     *
     * Computed in log space throughout: a 24-step pattern has a keyspace well
     * past 2^1024, and Math.pow(2, bits) would simply be Infinity.
     */
    function projectSearchTime(bits, ratePerSecond) {
        if (!isFinite(ratePerSecond) || ratePerSecond <= 0) return 'unknown';
        const log10Seconds = bits * Math.log10(2) - Math.log10(ratePerSecond);
        const log10Years = log10Seconds - Math.log10(SECONDS_PER_YEAR);

        // Past a trillion years, a mantissa is noise -- an order of magnitude
        // is the only honest thing to report.
        if (log10Years >= 12) return '10^' + Math.round(log10Years) + ' years';
        if (log10Seconds > 300) return '10^' + Math.round(log10Years) + ' years';
        return formatDuration(Math.pow(10, log10Seconds));
    }

    global.AttackLab = {
        breakLegacy: breakLegacy,
        formatDuration: formatDuration,
        generateHumanPatterns: generateHumanPatterns,
        crackVisualKey: crackVisualKey,
        projectSearchTime: projectSearchTime,
        LEGACY_COLORS: LEGACY_COLORS
    };
})(window);
