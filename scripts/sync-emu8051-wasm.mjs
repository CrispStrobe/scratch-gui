#!/usr/bin/env node
// Sync the vendored emu8051-stc WASM (tier-2 instruction-accurate simulation).
//
// This is the only BINARY in the overlay, so it is the one vendored artifact that cannot be
// read and judged by eye. It is therefore the one with a hard integrity check: the upstream
// repo records a SHA-256 for each file in build/BUILD-INFO.md, and this script refuses to
// write anything whose hash does not match the expectation pinned below.
//
// That check is not theoretical. When this was first vendored, the upstream WORKING TREE had
// been rebuilt and no longer matched the committed, audited artifact (55529 bytes vs 55526).
// Vendoring from a checkout's build/ directory would have shipped an unaudited binary.
//
// Licence: the C is MIT (emu8051, © Jari Komppa; STC12 model by CrispStrobe). The binary also
// contains Emscripten's runtime glue — MIT / University of Illinois. See THIRD-PARTY.md.
//
//   --check      verify without writing.
//   --ref <r>    a branch/tag/sha of CrispStrobe/emu8051-stc (default: the pinned commit).

import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

// Pinned to the commit whose BUILD-INFO.md records these hashes. Bump both together.
const PIN = '2f896b1a0a5dfd1fb58216137c789e0f29b4eb2f';
const EXPECT = {
    'emu8051.wasm': '14d427b5375e810f1ee2d29407c6612364dab4a46f801d4de1e6f32433915929',
    'emu8051.js': '5a008a67644f1b1bb45716c4fa67ff12bbd9d9e369e6a23cac2b0b88f3582faf'
};

const here = path.dirname(fileURLToPath(import.meta.url));
const dest = path.join(here, '..', 'src', 'lib', 'emu8051');
const check = process.argv.includes('--check');
const refIdx = process.argv.indexOf('--ref');
const ref = refIdx !== -1 ? process.argv[refIdx + 1] : PIN;

await mkdir(dest, {recursive: true});
let changed = 0;
for (const [name, want] of Object.entries(EXPECT)) {
    const url = `https://raw.githubusercontent.com/CrispStrobe/emu8051-stc/${ref}/build/${name}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${name} @ ${ref}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const got = createHash('sha256').update(buf).digest('hex');
    if (got !== want) {
        throw new Error(`${name}: SHA-256 mismatch\n  expected ${want}\n  got      ${got}\n`
            + 'Refusing to vendor an unverified binary. If this is an intentional rebuild, '
            + 'update PIN and EXPECT together from the upstream build/BUILD-INFO.md.');
    }
    const out = path.join(dest, name);
    const current = await readFile(out).catch(() => null);
    if (current && createHash('sha256').update(current).digest('hex') === got) {
        console.log(`  ok    ${name} (${buf.length} bytes, sha256 verified)`);
        continue;
    }
    changed++;
    if (check) { console.log(`  STALE ${name}`); continue; }
    await writeFile(out, buf);
    console.log(`  wrote ${name} (${buf.length} bytes, sha256 verified)`);
}
if (check && changed) { console.error(`\n${changed} stale — run: npm run sync:emuwasm`); process.exit(1); }
console.log(check ? '\nvendored WASM up to date.' : `\nsynced from emu8051-stc@${ref.slice(0, 8)}. Next: npm run integrate`);
