#!/usr/bin/env node
/**
 * Stamp local asset URLs in HTML with a hash of the file's contents.
 *
 *     node tools/stamp-assets.mjs          # rewrite in place
 *     node tools/stamp-assets.mjs --check  # exit 1 if anything is stale
 *
 * This exists because hand-written version strings do not survive contact with
 * editing. HydrogenAtom shipped `viewer.js?v=1`, viewer.js then changed twice,
 * and the query string stayed at v=1 -- so every browser that had visited once
 * kept running the first version of the file. The reported symptoms were a
 * dead Measure button, a flat render and motionless grains, none of which were
 * bugs in the code that was actually committed.
 *
 * A content hash cannot drift from the content the way a counter can. Run this
 * before committing any change to a stamped asset, or wire it into a hook.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

/** Every .html in the repo, skipping vendored trees and git internals. */
function htmlFiles(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules' ||
            entry.name === 'vendor' || entry.name === 'tools') continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) htmlFiles(full, out);
        else if (entry.name.endsWith('.html')) out.push(full);
    }
    return out;
}

function shortHash(file) {
    return crypto.createHash('sha256')
        .update(fs.readFileSync(file))
        .digest('hex')
        .slice(0, 8);
}

// src="foo.js" / href="foo.css", optionally already carrying a ?v=...
// Absolute URLs and protocol-relative ones are left alone.
const ASSET = /(\s(?:src|href)=")(?!https?:|\/\/|data:|#)([^"?]+\.(?:js|css))(\?v=[^"]*)?(")/g;

let changed = 0;
let stale = [];

for (const html of htmlFiles(root)) {
    const original = fs.readFileSync(html, 'utf8');
    const dir = path.dirname(html);

    const updated = original.replace(ASSET, (match, pre, url, existing, post) => {
        const target = path.resolve(dir, url);
        if (!fs.existsSync(target)) return match;   // leave broken refs visible
        const want = '?v=' + shortHash(target);
        if (existing === want) return match;
        stale.push(`${path.relative(root, html)} -> ${url}`);
        return pre + url + want + post;
    });

    if (updated !== original) {
        changed++;
        if (!checkOnly) fs.writeFileSync(html, updated);
    }
}

if (checkOnly) {
    if (stale.length) {
        console.error('Stale asset stamps (' + stale.length + '):');
        stale.forEach((s) => console.error('  ' + s));
        process.exit(1);
    }
    console.log('All asset stamps current.');
} else {
    console.log(stale.length
        ? `Restamped ${stale.length} reference(s) across ${changed} file(s).`
        : 'Nothing to restamp.');
    stale.forEach((s) => console.log('  ' + s));
}
