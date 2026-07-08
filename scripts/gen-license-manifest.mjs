#!/usr/bin/env node
// Generates src/lib/license-manifest.generated.js from the runtime dependencies
// declared in package.json, reading each package's own package.json for its
// license/version/repository. Keeps the About dialog's dependency list accurate
// without hand-maintaining it — rerun after adding/removing/upgrading a dependency.
import {readFileSync, writeFileSync} from 'fs';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outFile = path.join(rootDir, 'src', 'lib', 'license-manifest.generated.js');

const pkg = JSON.parse(readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const depNames = Object.keys(pkg.dependencies || {}).sort((a, b) => a.localeCompare(b));

const normalizeRepoUrl = repository => {
    if (!repository) return null;
    const raw = typeof repository === 'string' ? repository : repository.url;
    if (!raw) return null;
    return raw
        .replace(/^git\+/, '')
        .replace(/^git:\/\//, 'https://')
        .replace(/\.git$/, '')
        .replace(/^github:(.+)$/, 'https://github.com/$1');
};

const normalizeLicense = depPkg => {
    if (typeof depPkg.license === 'string') return depPkg.license;
    if (depPkg.license && depPkg.license.type) return depPkg.license.type;
    if (Array.isArray(depPkg.licenses)) {
        return depPkg.licenses.map(l => l.type || l).join(' OR ');
    }
    return 'UNKNOWN';
};

const entries = [];
const missing = [];

for (const name of depNames) {
    let depPkg;
    try {
        depPkg = require(`${name}/package.json`);
    } catch (e) {
        missing.push(name);
        continue;
    }
    entries.push({
        name,
        version: depPkg.version || pkg.dependencies[name],
        license: normalizeLicense(depPkg),
        homepage: depPkg.homepage || normalizeRepoUrl(depPkg.repository) || null
    });
}

if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn(
        `gen-license-manifest: ${missing.length} package(s) not found in node_modules ` +
        `(run npm install first): ${missing.join(', ')}`
    );
}

const header = '// GENERATED FILE — do not edit by hand.\n' +
    '// Run `npm run gen:licenses` to regenerate from package.json + node_modules.\n\n';
const body = `export default ${JSON.stringify(entries, null, 4)};\n`;

writeFileSync(outFile, header + body);
// eslint-disable-next-line no-console
console.log(`gen-license-manifest: wrote ${entries.length} entries to ${path.relative(rootDir, outFile)}`);
