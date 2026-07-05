#!/usr/bin/env node
// Sync the vendored SB3 Creator compiler + examples from the source repo.
//
// The Pseudocode tab reuses two files that live in the separate sb3-creator
// project. We vendor copies here so the editor has no cross-repo import, but
// that means they can drift. Run `npm run sync:sb3creator` to refresh them.
//
//   --check   exit non-zero (without writing) if a vendored file is stale,
//             for CI drift detection.
//
// Override the source with SB3CREATOR_REF (branch/tag/sha), default "main".

import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const REF = process.env.SB3CREATOR_REF || 'main';
const RAW = `https://raw.githubusercontent.com/CrispStrobe/sb3-creator/${REF}`;
const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, '..', 'src', 'lib');
const check = process.argv.includes('--check');

// [remote source, local vendored destination]
const FILES = [
    ['src/utils/sb3Creator.js', path.join(lib, 'sb3-creator.js')],
    ['src/utils/examples.js', path.join(lib, 'sb3-creator-examples.js')]
];

let stale = 0;
for (const [remote, dest] of FILES) {
    const res = await fetch(`${RAW}/${remote}`);
    if (!res.ok) throw new Error(`fetch ${remote} @ ${REF}: HTTP ${res.status}`);
    const next = await res.text();
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
