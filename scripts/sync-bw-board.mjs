#!/usr/bin/env node
// Sync the vendored bw-board simulation engine into the overlay.
//
// bw-board is the board layer: netlist, the four STC12 port modes as Thévenin equivalents,
// a closed-form fast path with an MNA solver behind it, instruments and transducers. It is
// MIT and has NO runtime dependencies, which is what lets it ship inside this bundle.
//
// Vendored rather than npm-installed, for the same reason everything else here is: the fork
// is frozen and self-contained. Same contract as sync-sb3creator.mjs.
//
//   --check      exit non-zero (without writing) if a vendored file is stale, for CI.
//   --dir <path> read from a local bw-board checkout instead of over HTTP.

import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REF = process.env.BWBOARD_REF || 'main';
const RAW = `https://raw.githubusercontent.com/CrispStrobe/bw-board/${REF}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'src', 'lib', 'bw-board');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

// DISCOVER the file list; do not hardcode it. A fixed list silently drops files the engine
// grows (it gained validate.js the day this script was written) and produces a vendored copy
// that fails at webpack time with a missing-module error far from the cause.
const FALLBACK = [
    'src/index.js', 'src/board.js', 'src/types.js', 'src/pin-model.js', 'src/mna.js',
    'src/infer-netlist.js', 'src/scripted-mcu.js', 'src/conformance.js',
    'src/emu8051-adapter.js', 'src/validate.js'
];
const FILES = srcDir
    ? (await readdir(path.join(srcDir, 'src'))).filter(f => f.endsWith('.js')).sort()
        .map(f => `src/${f}`)
    : FALLBACK;

async function readSource (rel) {
    if (srcDir) return readFile(path.join(srcDir, rel), 'utf8');
    const res = await fetch(`${RAW}/${rel}`);
    if (!res.ok) throw new Error(`fetch ${rel} @ ${REF}: HTTP ${res.status}`);
    return res.text();
}

await mkdir(dest, {recursive: true});
let stale = 0;
for (const rel of FILES) {
    const out = path.join(dest, path.basename(rel));
    let next;
    try {
        next = await readSource(rel);
    } catch (e) {
        console.log(`  SKIP  ${path.basename(rel)} (${e.message})`);
        continue;
    }
    const current = await readFile(out, 'utf8').catch(() => null);
    if (current === next) { console.log(`  ok    ${path.basename(rel)}`); continue; }
    stale++;
    if (check) console.log(`  STALE ${path.basename(rel)}`);
    else { await writeFile(out, next); console.log(`  wrote ${path.basename(rel)}`); }
}

// A vendored engine that quietly grew a dependency would break the bundle at build time,
// so fail loudly here instead.
if (!check) {
    for (const f of await readdir(dest)) {
        const src = await readFile(path.join(dest, f), 'utf8');
        for (const m of src.matchAll(/^\s*import\s[^'"\n]*['"]([^'".][^'"]*)['"]/gm)) {
            throw new Error(`${f} imports a package (${m[1]}); bw-board must stay dependency-free`);
        }
    }
}

// Every relative import must resolve inside the vendored copy. This is the check that would
// have caught validate.js going missing, at the point of vendoring rather than at build time.
if (!check) {
    const present = new Set(await readdir(dest));
    for (const f of present) {
        const src = await readFile(path.join(dest, f), 'utf8');
        for (const m of src.matchAll(/^\s*(?:import|export)[^'"\n]*['"](\.\/[^'"]+)['"]/gm)) {
            const target = path.basename(m[1]);
            if (!present.has(target)) {
                throw new Error(`${f} imports ${m[1]}, which was not vendored — the file list is incomplete`);
            }
        }
    }
    console.log(`  checked ${present.size} files: imports all resolve, no packages`);
}

if (check && stale) { console.error(`\n${stale} stale — run: npm run sync:bwboard`); process.exit(1); }
console.log(check ? '\nvendored engine up to date.' : `\nsynced from bw-board@${REF}. Next: npm run integrate`);
