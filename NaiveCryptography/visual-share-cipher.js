/**
 * Visual Share Cipher (VSC-1)
 * ===========================================================================
 * A visual encryption scheme built from two independent layers. Neither layer
 * invents any new cryptographic primitive -- inventing primitives is how you
 * get schemes like the legacy cipher in script.js. What is "new" here is the
 * way a drawn pattern and a pair of images are wired onto primitives that are
 * already known to be sound.
 *
 *   Layer 1 -- the visual key (something you know)
 *       The user draws an ordered pattern on a grid: which cells, in what
 *       order, and what colour/rotation each one carries. That pattern is the
 *       only secret. It is canonicalised to bytes, stretched with
 *       PBKDF2-HMAC-SHA256, and used as an AES-256-GCM key. The pattern never
 *       appears anywhere in the output.
 *
 *   Layer 2 -- visual shares (something you have, twice)
 *       The AES-GCM envelope is split into two XOR shares. Each share on its
 *       own is a uniformly random byte string, independent of the envelope --
 *       a textbook 2-of-2 one-time pad. Only the pair reconstructs anything.
 *
 * Also included is a faithful implementation of Naor-Shamir (1994) 2-out-of-2
 * visual secret sharing: two noise images that reveal the message when
 * physically stacked. That is the original "visual cryptography", and it is
 * information-theoretically secure.
 *
 * This module is pure logic and touches no DOM. See visual-share-ui.js.
 */
(function (global) {
    'use strict';

    /* --------------------------------------------------------------------- *
     * Constants
     * --------------------------------------------------------------------- */

    const MAGIC = [0x56, 0x53, 0x43, 0x31];        // "VSC1" -- envelope
    const SHARE_MAGIC = [0x56, 0x53, 0x43, 0x53];  // "VSCS" -- share

    const VERSION = 1;
    const DEFAULT_ITERATIONS = 600000;   // OWASP 2023 floor for PBKDF2-SHA256
    const MIN_ITERATIONS = 100000;
    const MAX_ITERATIONS = 5000000;
    const SALT_BYTES = 16;
    const IV_BYTES = 12;
    const TAG_BITS = 128;

    // magic(4) + version(1) + gridSize(1) + iterations(4) + salt(16) + iv(12)
    const HEADER_BYTES = 38;
    // magic(4) + version(1) + index(1) + pairId(8) + length(4)
    const SHARE_HEADER_BYTES = 18;

    const PALETTE = [
        '#e6194b', '#3cb44b', '#ffe119', '#4363d8',
        '#f58231', '#911eb4', '#46f0f0', '#f032e6'
    ];
    const ROTATIONS = [0, 45, 90, 135, 180, 225, 270, 315];

    /* --------------------------------------------------------------------- *
     * Byte helpers
     *
     * crypto.getRandomValues() rejects requests over 65536 bytes, so every
     * random draw goes through randomBytes() rather than calling it directly.
     * --------------------------------------------------------------------- */

    const RNG_CHUNK = 65536;

    function randomBytes(n) {
        const out = new Uint8Array(n);
        for (let off = 0; off < n; off += RNG_CHUNK) {
            crypto.getRandomValues(out.subarray(off, Math.min(off + RNG_CHUNK, n)));
        }
        return out;
    }

    /**
     * `count` unbiased integers in [0, n). Rejection sampling: draws at or
     * above the largest multiple of n are thrown away rather than folded in
     * with `% n`, which would over-weight the low values.
     *
     * The draw width has to follow n. A byte-only version looks fine until
     * n > 256, at which point floor(256/n)*n is 0, no draw can ever land below
     * the limit, and the fill loop spins forever -- which is exactly what a
     * 20x20 or 24x24 key grid did. Byte draws are kept for the small-n case
     * because visualSplitBitmap() calls this once per secret pixel.
     */
    function randomIndices(count, n) {
        if (!Number.isInteger(n) || n < 1) {
            throw new RangeError('randomIndices needs a positive integer range, got ' + n);
        }
        if (n > 0x100000000) {
            throw new RangeError('randomIndices supports ranges up to 2^32, got ' + n);
        }

        const wide = n > 256;
        const out = wide ? new Uint32Array(count) : new Uint8Array(count);
        const limit = Math.floor((wide ? 0x100000000 : 256) / n) * n;

        let filled = 0;
        while (filled < count) {
            const need = (count - filled) * 2;
            let buf;
            if (wide) {
                // getRandomValues caps on byte length, so 4 bytes per word.
                buf = new Uint32Array(Math.min(RNG_CHUNK >> 2, Math.max(8, need)));
                crypto.getRandomValues(buf);
            } else {
                buf = randomBytes(Math.min(RNG_CHUNK, Math.max(32, need)));
            }
            for (let i = 0; i < buf.length && filled < count; i++) {
                if (buf[i] < limit) out[filled++] = buf[i] % n;
            }
        }
        return out;
    }

    function concat() {
        let total = 0;
        for (let i = 0; i < arguments.length; i++) total += arguments[i].length;
        const out = new Uint8Array(total);
        let off = 0;
        for (let i = 0; i < arguments.length; i++) {
            out.set(arguments[i], off);
            off += arguments[i].length;
        }
        return out;
    }

    function xorBytes(a, b) {
        const out = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = a[i] ^ b[i];
        return out;
    }

    // Chunked so long messages do not blow the argument limit on String.fromCharCode.
    function toBase64(bytes) {
        let s = '';
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            s += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(s);
    }

    function fromBase64(str) {
        const bin = atob(String(str).replace(/\s+/g, ''));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function startsWith(bytes, prefix) {
        if (bytes.length < prefix.length) return false;
        for (let i = 0; i < prefix.length; i++) {
            if (bytes[i] !== prefix[i]) return false;
        }
        return true;
    }

    /** Constant-time-ish equality. Used for the pair id, not for secrets. */
    function bytesEqual(a, b) {
        if (a.length !== b.length) return false;
        let diff = 0;
        for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
        return diff === 0;
    }

    /* --------------------------------------------------------------------- *
     * The visual key
     *
     * A pattern is { gridSize, steps: [{ cell, color, rotation }, ...] } where
     * `cell` is a flat index, `color` an index into PALETTE and `rotation` an
     * index into ROTATIONS. Order matters: the same cells clicked in a
     * different order are a different key.
     * --------------------------------------------------------------------- */

    /**
     * Deterministic string form of a pattern. The "VSC1" prefix and the grid
     * size are domain separators, so the same shape drawn on a 16x16 and a
     * 24x24 grid derive different keys.
     */
    function canonicalPattern(pattern) {
        const body = pattern.steps
            .map(function (s) { return s.cell + '.' + s.color + '.' + s.rotation; })
            .join('-');
        return 'VSC1|' + pattern.gridSize + '|' + body;
    }

    /**
     * Entropy of the pattern if every choice were made uniformly at random:
     * an ordered selection of k distinct cells out of N, each carrying one of
     * |PALETTE| colours and one of |ROTATIONS| rotations.
     *
     * This is a ceiling, not a measurement of what the user actually did.
     */
    function maxEntropyBits(pattern) {
        const N = pattern.gridSize * pattern.gridSize;
        const k = pattern.steps.length;
        if (k === 0) return 0;
        let bits = 0;
        for (let i = 0; i < k; i++) bits += Math.log2(N - i);
        bits += k * (Math.log2(PALETTE.length) + Math.log2(ROTATIONS.length));
        return bits;
    }

    /**
     * A deliberately pessimistic estimate of what the pattern is actually
     * worth against someone who knows humans draw shapes, not random dust.
     *
     * Heuristic, not a theorem: a step landing on one of the eight neighbours
     * of the previous step is credited log2(8) bits instead of the full
     * log2(N - i), because "continue the line" is a cheap guess. Colour and
     * rotation are credited only to the extent the user actually varied them
     * -- leaving every cell on the default colour adds nothing.
     */
    function realisticEntropyBits(pattern) {
        const steps = pattern.steps;
        const N = pattern.gridSize * pattern.gridSize;
        if (steps.length === 0) return 0;

        let bits = Math.log2(N);
        for (let i = 1; i < steps.length; i++) {
            const prev = steps[i - 1].cell;
            const cur = steps[i].cell;
            const dx = Math.abs((cur % pattern.gridSize) - (prev % pattern.gridSize));
            const dy = Math.abs(Math.floor(cur / pattern.gridSize) - Math.floor(prev / pattern.gridSize));
            const adjacent = dx <= 1 && dy <= 1;
            bits += adjacent ? Math.log2(8) : Math.log2(Math.max(2, N - i));
        }

        const colours = new Set(steps.map(function (s) { return s.color; }));
        const rots = new Set(steps.map(function (s) { return s.rotation; }));
        if (colours.size > 1) bits += steps.length * Math.log2(colours.size);
        if (rots.size > 1) bits += steps.length * Math.log2(rots.size);

        return bits;
    }

    /**
     * Translate realistic entropy plus KDF work factor into a verdict.
     * PBKDF2 at `iterations` buys roughly log2(iterations) bits of extra work
     * for an attacker, which is worth about 19 bits at the default setting.
     */
    function strengthVerdict(pattern, iterations) {
        const bits = realisticEntropyBits(pattern);
        const effective = bits + Math.log2(iterations || DEFAULT_ITERATIONS);
        let label, level;
        if (bits === 0) { label = 'No key drawn'; level = 0; }
        else if (effective < 50) { label = 'Trivially brute-forced'; level = 1; }
        else if (effective < 70) { label = 'Weak'; level = 2; }
        else if (effective < 90) { label = 'Moderate'; level = 3; }
        else if (effective < 110) { label = 'Strong'; level = 4; }
        else { label = 'Very strong'; level = 5; }
        return { bits: bits, effective: effective, label: label, level: level };
    }

    /**
     * A short checksum of the pattern, for the same reason SSH prints key
     * fingerprints: you cannot eyeball whether you redrew a 12-step pattern
     * correctly, but you can compare six hex digits.
     *
     * This is NOT public data. It is a hash of the only secret in the system,
     * so anyone holding it can confirm a guessed pattern offline without
     * touching the ciphertext. Write it down the way you would write down a
     * password hint -- privately.
     */
    async function patternFingerprint(pattern) {
        if (!pattern || !pattern.steps || pattern.steps.length === 0) return null;
        const material = new TextEncoder().encode('VSC1-fingerprint|' + canonicalPattern(pattern));
        const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', material));
        return Array.prototype.map
            .call(digest.slice(0, 3), function (b) { return b.toString(16).padStart(2, '0'); })
            .join(' ')
            .toUpperCase();
    }

    async function deriveKey(pattern, salt, iterations, usages) {
        const material = new TextEncoder().encode(canonicalPattern(pattern));
        const base = await crypto.subtle.importKey(
            'raw', material, 'PBKDF2', false, ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: salt, iterations: iterations, hash: 'SHA-256' },
            base,
            { name: 'AES-GCM', length: 256 },
            false,
            usages
        );
    }

    /* --------------------------------------------------------------------- *
     * Envelope: AES-256-GCM under the derived key
     *
     * The whole header -- including the iteration count -- is passed as
     * additional authenticated data. An attacker who rewrites the header to
     * say "1 iteration" in the hope of a cheap offline attack breaks the GCM
     * tag instead, so the KDF parameters cannot be downgraded in transit.
     * --------------------------------------------------------------------- */

    function buildHeader(gridSize, iterations, salt, iv) {
        const header = new Uint8Array(HEADER_BYTES);
        header.set(MAGIC, 0);
        header[4] = VERSION;
        header[5] = gridSize;
        new DataView(header.buffer).setUint32(6, iterations, false);
        header.set(salt, 10);
        header.set(iv, 26);
        return header;
    }

    function parseHeader(blob) {
        if (blob.length < HEADER_BYTES) {
            throw new Error('Envelope is truncated.');
        }
        if (!startsWith(blob, MAGIC)) {
            throw new Error('Not a VSC-1 envelope (bad magic bytes).');
        }
        if (blob[4] !== VERSION) {
            throw new Error('Unsupported envelope version: ' + blob[4] + '.');
        }
        const iterations = new DataView(blob.buffer, blob.byteOffset).getUint32(6, false);
        if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) {
            throw new Error('Envelope declares an out-of-range iteration count.');
        }
        return {
            version: blob[4],
            gridSize: blob[5],
            iterations: iterations,
            salt: blob.slice(10, 26),
            iv: blob.slice(26, 38),
            header: blob.slice(0, HEADER_BYTES),
            ciphertext: blob.slice(HEADER_BYTES)
        };
    }

    async function encrypt(message, pattern, options) {
        options = options || {};
        if (!pattern || !pattern.steps || pattern.steps.length === 0) {
            throw new Error('Draw a visual key first -- an empty pattern carries no entropy.');
        }
        if (!message) {
            throw new Error('Nothing to encrypt.');
        }
        const iterations = Math.min(MAX_ITERATIONS,
            Math.max(MIN_ITERATIONS, options.iterations || DEFAULT_ITERATIONS));

        const salt = randomBytes(SALT_BYTES);
        const iv = randomBytes(IV_BYTES);
        const header = buildHeader(pattern.gridSize, iterations, salt, iv);
        const key = await deriveKey(pattern, salt, iterations, ['encrypt']);

        const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv, additionalData: header, tagLength: TAG_BITS },
            key,
            new TextEncoder().encode(message)
        ));
        return concat(header, ciphertext);
    }

    async function decrypt(blob, pattern) {
        if (!pattern || !pattern.steps || pattern.steps.length === 0) {
            throw new Error('Draw the visual key that was used to encrypt this.');
        }
        const parsed = parseHeader(blob);
        const key = await deriveKey(pattern, parsed.salt, parsed.iterations, ['decrypt']);
        let plain;
        try {
            plain = await crypto.subtle.decrypt(
                { name: 'AES-GCM', iv: parsed.iv, additionalData: parsed.header, tagLength: TAG_BITS },
                key,
                parsed.ciphertext
            );
        } catch (e) {
            // GCM gives no way to tell a wrong key from a tampered ciphertext,
            // and that is by design -- do not pretend otherwise in the message.
            throw new Error('Authentication failed: wrong visual key, wrong shares, or modified data.');
        }
        return { text: new TextDecoder().decode(plain), header: parsed };
    }

    /* --------------------------------------------------------------------- *
     * 2-of-2 XOR shares
     *
     * shareA = pad, shareB = envelope XOR pad, pad drawn fresh from the CSPRNG
     * and never reused. Either share alone is uniformly distributed and
     * independent of the envelope, so it carries zero information about it.
     *
     * The share header is not secret: it carries a pair id so mismatched
     * shares are caught early, and a length. Both are metadata an observer
     * could infer from file sizes anyway.
     * --------------------------------------------------------------------- */

    function buildShare(index, pairId, payload) {
        const head = new Uint8Array(SHARE_HEADER_BYTES);
        head.set(SHARE_MAGIC, 0);
        head[4] = VERSION;
        head[5] = index;
        head.set(pairId, 6);
        new DataView(head.buffer).setUint32(14, payload.length, false);
        return concat(head, payload);
    }

    function parseShare(bytes) {
        if (bytes.length < SHARE_HEADER_BYTES) {
            throw new Error('Share is truncated.');
        }
        if (!startsWith(bytes, SHARE_MAGIC)) {
            throw new Error('Not a VSC-1 share (bad magic bytes).');
        }
        if (bytes[4] !== VERSION) {
            throw new Error('Unsupported share version: ' + bytes[4] + '.');
        }
        const length = new DataView(bytes.buffer, bytes.byteOffset).getUint32(14, false);
        if (bytes.length < SHARE_HEADER_BYTES + length) {
            throw new Error('Share payload is shorter than its declared length.');
        }
        return {
            index: bytes[5],
            pairId: bytes.slice(6, 14),
            // Trailing bytes past the declared length are image padding.
            payload: bytes.slice(SHARE_HEADER_BYTES, SHARE_HEADER_BYTES + length)
        };
    }

    function splitIntoShares(blob) {
        const pairId = randomBytes(8);
        const pad = randomBytes(blob.length);
        return [
            buildShare(0, pairId, pad),
            buildShare(1, pairId, xorBytes(blob, pad))
        ];
    }

    function combineShares(rawA, rawB) {
        const a = parseShare(rawA);
        const b = parseShare(rawB);
        if (!bytesEqual(a.pairId, b.pairId)) {
            throw new Error('These two shares are from different messages.');
        }
        if (a.index === b.index) {
            throw new Error('Both inputs are share ' + (a.index + 1) + '. You need share 1 and share 2.');
        }
        if (a.payload.length !== b.payload.length) {
            throw new Error('Share payloads differ in length.');
        }
        return xorBytes(a.payload, b.payload);
    }

    /* --------------------------------------------------------------------- *
     * Bytes <-> PNG
     *
     * Three bytes per pixel in RGB, alpha pinned to 255. Alpha below 255
     * invites premultiplication, which is lossy and would corrupt the payload.
     * The tail is padded with random bytes so the image reads as uniform noise
     * end to end; the real length lives in the share header.
     * --------------------------------------------------------------------- */

    function bytesToImageData(bytes) {
        const pixels = Math.ceil(bytes.length / 3);
        const side = Math.max(1, Math.ceil(Math.sqrt(pixels)));
        const padded = concat(bytes, randomBytes(side * side * 3 - bytes.length));

        const data = new Uint8ClampedArray(side * side * 4);
        for (let p = 0; p < side * side; p++) {
            data[p * 4] = padded[p * 3];
            data[p * 4 + 1] = padded[p * 3 + 1];
            data[p * 4 + 2] = padded[p * 3 + 2];
            data[p * 4 + 3] = 255;
        }
        return new ImageData(data, side, side);
    }

    function imageDataToBytes(imageData) {
        const pixels = imageData.width * imageData.height;
        const out = new Uint8Array(pixels * 3);
        for (let p = 0; p < pixels; p++) {
            out[p * 3] = imageData.data[p * 4];
            out[p * 3 + 1] = imageData.data[p * 4 + 1];
            out[p * 3 + 2] = imageData.data[p * 4 + 2];
        }
        return out;
    }

    function imageDataToCanvas(imageData) {
        const canvas = document.createElement('canvas');
        canvas.width = imageData.width;
        canvas.height = imageData.height;
        canvas.getContext('2d').putImageData(imageData, 0, 0);
        return canvas;
    }

    function canvasToBlob(canvas) {
        return new Promise(function (resolve, reject) {
            canvas.toBlob(function (blob) {
                blob ? resolve(blob) : reject(new Error('Could not encode PNG.'));
            }, 'image/png');
        });
    }

    /**
     * Decode a PNG back to exact bytes.
     *
     * colorSpaceConversion:'none' matters: without it the browser is free to
     * colour-manage the pixels on the way in and the payload comes back
     * subtly wrong. Falls back to <img> where createImageBitmap is missing,
     * which is why the base64 form of each share is offered as well.
     */
    async function blobToImageData(blob) {
        let source;
        if (typeof createImageBitmap === 'function') {
            try {
                source = await createImageBitmap(blob, {
                    colorSpaceConversion: 'none',
                    premultiplyAlpha: 'none'
                });
            } catch (e) {
                source = null;
            }
        }
        if (!source) {
            source = await new Promise(function (resolve, reject) {
                const url = URL.createObjectURL(blob);
                const img = new Image();
                img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
                img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read image.')); };
                img.src = url;
            });
        }
        const canvas = document.createElement('canvas');
        canvas.width = source.width;
        canvas.height = source.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' });
        ctx.drawImage(source, 0, 0);
        return ctx.getImageData(0, 0, canvas.width, canvas.height, { colorSpace: 'srgb' });
    }

    /* --------------------------------------------------------------------- *
     * Naor-Shamir 2-out-of-2 visual secret sharing (1994)
     *
     * Every secret pixel becomes a 2x2 block in each share. Pick one of the
     * six 2x2 patterns that have exactly two black subpixels:
     *
     *   secret white -> both shares get the same pattern
     *                   stacked: 2 black + 2 white  -> reads as grey
     *   secret black -> the shares get complementary patterns
     *                   stacked: 4 black            -> reads as black
     *
     * Each share on its own is a uniformly random choice among the six, with
     * no dependence on the secret pixel, so one share reveals nothing at all.
     * Stacking is a plain OR, which is what overlaying two transparencies
     * physically does -- print them and it works on a desk.
     *
     * The cost is contrast: white recovers as 50% grey rather than white.
     * That is inherent to the scheme, not an artefact of this implementation.
     * --------------------------------------------------------------------- */

    const NS_PATTERNS = [
        [1, 1, 0, 0], [1, 0, 1, 0], [1, 0, 0, 1],
        [0, 1, 1, 0], [0, 1, 0, 1], [0, 0, 1, 1]
    ];

    /**
     * @param {Uint8Array} bits  width*height, 1 = ink (black), 0 = background
     * @returns {{a: Uint8Array, b: Uint8Array, width: number, height: number}}
     */
    function visualSplitBitmap(bits, width, height) {
        const w2 = width * 2;
        const h2 = height * 2;
        const a = new Uint8Array(w2 * h2);
        const b = new Uint8Array(w2 * h2);
        const choices = randomIndices(width * height, NS_PATTERNS.length);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const pattern = NS_PATTERNS[choices[idx]];
                const secretIsBlack = bits[idx] === 1;
                for (let k = 0; k < 4; k++) {
                    const off = (y * 2 + (k >> 1)) * w2 + (x * 2 + (k % 2));
                    a[off] = pattern[k];
                    b[off] = secretIsBlack ? (pattern[k] ^ 1) : pattern[k];
                }
            }
        }
        return { a: a, b: b, width: w2, height: h2 };
    }

    /** Stacking two transparencies is OR: ink anywhere stays ink. */
    function stackShares(a, b) {
        const out = new Uint8Array(a.length);
        for (let i = 0; i < a.length; i++) out[i] = a[i] | b[i];
        return out;
    }

    function bitmapToImageData(bits, width, height) {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < bits.length; i++) {
            const v = bits[i] ? 0 : 255;
            data[i * 4] = v;
            data[i * 4 + 1] = v;
            data[i * 4 + 2] = v;
            data[i * 4 + 3] = 255;
        }
        return new ImageData(data, width, height);
    }

    /**
     * Render text to a 1-bit bitmap. Returns { bits, width, height } where a
     * set bit is ink.
     */
    function textToBitmap(text, options) {
        options = options || {};
        const fontSize = options.fontSize || 22;
        const maxWidth = options.maxWidth || 320;
        const padding = options.padding || 10;
        const lineHeight = Math.round(fontSize * 1.25);

        const measure = document.createElement('canvas').getContext('2d');
        const font = 'bold ' + fontSize + 'px "Segoe UI", Tahoma, sans-serif';
        measure.font = font;

        const lines = [];
        text.split(/\r?\n/).forEach(function (paragraph) {
            const words = paragraph.split(/\s+/).filter(Boolean);
            if (words.length === 0) { lines.push(''); return; }
            let line = words[0];
            for (let i = 1; i < words.length; i++) {
                const candidate = line + ' ' + words[i];
                if (measure.measureText(candidate).width > maxWidth - padding * 2) {
                    lines.push(line);
                    line = words[i];
                } else {
                    line = candidate;
                }
            }
            lines.push(line);
        });

        let widest = 1;
        lines.forEach(function (l) {
            widest = Math.max(widest, Math.ceil(measure.measureText(l).width));
        });

        const width = Math.min(maxWidth, widest + padding * 2);
        const height = lines.length * lineHeight + padding * 2;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = '#000000';
        ctx.font = font;
        ctx.textBaseline = 'top';
        lines.forEach(function (line, i) {
            ctx.fillText(line, padding, padding + i * lineHeight);
        });

        const img = ctx.getImageData(0, 0, width, height);
        const bits = new Uint8Array(width * height);
        for (let i = 0; i < bits.length; i++) {
            // Rec. 601 luma, thresholded. Anti-aliased edges fall to one side.
            const luma = 0.299 * img.data[i * 4] + 0.587 * img.data[i * 4 + 1] + 0.114 * img.data[i * 4 + 2];
            bits[i] = luma < 128 ? 1 : 0;
        }
        return { bits: bits, width: width, height: height };
    }

    /* --------------------------------------------------------------------- *
     * Exports
     * --------------------------------------------------------------------- */

    global.VisualShareCipher = {
        VERSION: VERSION,
        PALETTE: PALETTE,
        ROTATIONS: ROTATIONS,
        DEFAULT_ITERATIONS: DEFAULT_ITERATIONS,
        MIN_ITERATIONS: MIN_ITERATIONS,
        MAX_ITERATIONS: MAX_ITERATIONS,
        NS_PATTERNS: NS_PATTERNS,

        // key
        canonicalPattern: canonicalPattern,
        patternFingerprint: patternFingerprint,
        maxEntropyBits: maxEntropyBits,
        realisticEntropyBits: realisticEntropyBits,
        strengthVerdict: strengthVerdict,

        // envelope
        encrypt: encrypt,
        decrypt: decrypt,
        parseHeader: parseHeader,

        // shares
        splitIntoShares: splitIntoShares,
        combineShares: combineShares,
        parseShare: parseShare,

        // encoding
        toBase64: toBase64,
        fromBase64: fromBase64,
        randomBytes: randomBytes,
        randomIndices: randomIndices,
        xorBytes: xorBytes,

        // images
        bytesToImageData: bytesToImageData,
        imageDataToBytes: imageDataToBytes,
        imageDataToCanvas: imageDataToCanvas,
        canvasToBlob: canvasToBlob,
        blobToImageData: blobToImageData,

        // Naor-Shamir
        visualSplitBitmap: visualSplitBitmap,
        stackShares: stackShares,
        bitmapToImageData: bitmapToImageData,
        textToBitmap: textToBitmap
    };
})(window);
