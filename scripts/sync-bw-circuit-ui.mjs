#!/usr/bin/env node
// Sync the vendored circuit-designer panel into the overlay.
//
// bw-circuit-ui is the UI half of the simulator: parts palette, wiring canvas, multimeter,
// inference from the project's PIN declarations. It consumes bw-board through an injected
// engine (setEngine), so it does not care where the engine lives — which is what makes it
// vendorable at all.
//
// Same contract as the other sync scripts. Discovers files rather than hardcoding a list,
// and verifies afterwards that every relative import resolves.
//
//   --check      exit non-zero (without writing) if stale, for CI.
//   --dir <path> read from a local checkout instead of over HTTP.

import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'src', 'lib', 'bw-circuit-ui');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;
if (!srcDir) { console.error('needs --dir <bw-circuit-ui checkout> for now'); process.exit(2); }

// main.jsx is the Vite harness entry and has no business in the fork.
const SKIP = new Set(['main.jsx']);

async function walk (rel = '') {
    const out = [];
    for (const e of await readdir(path.join(srcDir, 'src', rel), {withFileTypes: true})) {
        const r = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) out.push(...await walk(r));
        else if (/\.jsx?$/.test(e.name) && !SKIP.has(e.name)) out.push(r);
    }
    return out.sort();
}

let stale = 0;
const files = await walk();
for (const rel of files) {
    const out = path.join(dest, rel);
    const next = await readFile(path.join(srcDir, 'src', rel), 'utf8');
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current === next) { console.log(`  ok    ${rel}`); continue; }
    stale++;
    if (check) { console.log(`  STALE ${rel}`); continue; }
    await mkdir(path.dirname(out), {recursive: true});
    await writeFile(out, next);
    console.log(`  wrote ${rel}`);
}

if (!check) {
    const have = new Set(files);
    const allowed = new Set(['react', 'prop-types', '@lit/react', 'lit', '@wokwi/elements']);
    for (const rel of files) {
        const src = await readFile(path.join(dest, rel), 'utf8');
        for (const m of src.matchAll(/^\s*(?:import|export)[^'"\n]*['"]([^'"]+)['"]/gm)) {
            const spec = m[1];
            if (spec.startsWith('.')) {
                // resolve relative to this file, allowing an omitted .js/.jsx extension
                const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
                const ok = have.has(target) || have.has(`${target}.js`) || have.has(`${target}.jsx`);
                if (!ok) throw new Error(`${rel} imports ${spec}, which was not vendored`);
            } else if (![...allowed].some(a => spec === a || spec.startsWith(`${a}/`))) {
                throw new Error(`${rel} imports an unexpected package "${spec}" — add it to the allow-list and to integrate.mjs deliberately`);
            }
        }
    }
    console.log(`  checked ${files.length} files: imports resolve, only allow-listed packages`);
}
if (check && stale) { console.error(`\n${stale} stale — run: npm run sync:circuitui`); process.exit(1); }
console.log(check ? '\nvendored panel up to date.' : '\nsynced. Next: npm run integrate');
