#!/usr/bin/env node
// Sync the vendored SB3 Creator compiler + examples from the source repo.
//
// The Pseudocode tab reuses two files that live in the separate sb3-creator
// project. We vendor copies here so the editor has no cross-repo import, but
// that means they can drift. Run `npm run sync:sb3creator` to refresh them.
//
//   --check      exit non-zero (without writing) if a vendored file is stale,
//                for CI drift detection.
//   --dir <path> read the source files from a local sb3-creator checkout
//                instead of fetching over HTTP (deterministic; no CDN lag).
//
// Override the HTTP source with SB3CREATOR_REF (branch/tag/sha), default "main".

import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REF = process.env.SB3CREATOR_REF || 'main';
const RAW = `https://raw.githubusercontent.com/CrispStrobe/sb3-creator/${REF}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, '..', 'src', 'lib');
const check = process.argv.includes('--check');
const dirIdx = process.argv.indexOf('--dir');
const srcDir = dirIdx !== -1 ? process.argv[dirIdx + 1] : null;

// [source path relative to the sb3-creator repo, local vendored destination]
const FILES = [
    ['src/utils/sb3Creator.js', path.join(lib, 'sb3-creator.js')],
    ['src/utils/examples.js', path.join(lib, 'sb3-creator-examples.js')],
    ['src/utils/pythonToPseudocode.js', path.join(lib, 'sb3-creator-python.js')],
    ['src/utils/javascriptToPseudocode.js', path.join(lib, 'sb3-creator-javascript.js')],
    ['src/utils/cToPseudocode.js', path.join(lib, 'sb3-creator-c.js')],
    ['src/utils/runtimeRegistry.generated.js', path.join(lib, 'sb3-creator-runtime.js')],
    ['src/utils/scratchRuntime.js', path.join(lib, 'sb3-creator-scratchruntime.js')]
];

async function readSource (rel) {
    if (srcDir) return readFile(path.join(srcDir, rel), 'utf8');
    const res = await fetch(`${RAW}/${rel}`);
    if (!res.ok) throw new Error(`fetch ${rel} @ ${REF}: HTTP ${res.status}`);
    return res.text();
}

// Cross-file imports use the source repo's filenames; rewrite them to the vendored
// names (e.g. javascriptToPseudocode.js imports pythonToPseudocode.js).
const rewriteImports = (src) => src
    .replace(/(['"])\.\/pythonToPseudocode\.js\1/g, "'./sb3-creator-python.js'")
    .replace(/(['"])\.\/runtimeRegistry\.generated\.js\1/g, "'./sb3-creator-runtime.js'")
    .replace(/(['"])\.\/scratchRuntime\.js\1/g, "'./sb3-creator-scratchruntime.js'");

let stale = 0;
for (const [remote, dest] of FILES) {
    const next = rewriteImports(await readSource(remote));
    const current = await readFile(dest, 'utf8').catch(() => null);
    if (current === next) {
        console.log(`  ok    ${path.basename(dest)}`);
        continue;
    }
    stale++;
    if (check) {
        console.log(`  STALE ${path.basename(dest)}  (differs from sb3-creator@${REF})`);
    } else {
        await writeFile(dest, next);
        console.log(`  wrote ${path.basename(dest)}`);
    }
}

if (check && stale) {
    console.error(`\n${stale} vendored file(s) out of date — run: npm run sync:sb3creator`);
    process.exit(1);
}
console.log(check ? '\nvendored files up to date.' : `\nsynced from sb3-creator@${REF}.`);
