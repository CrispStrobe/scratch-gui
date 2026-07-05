# Brickwright

**Brickwright** is a creative-coding studio built on Scratch: every project is
also plain code, so you can **build it in blocks, write it as text, and switch
between the two anytime** — then run it fast on screen or drive real **bricks
and robots**. The name says it: a *wright* (a maker — ship*wright*, play*wright*)
who both **builds** and **writes** with blocks.

Two signature features:

- **Brickwright Script** — a pseudocode language that compiles to Scratch blocks
  *and* decompiles back (a true block ⇄ code round-trip), plus baking your own
  SVG art straight into sprites. Lives in the **Script** editor tab.
- **Brickwright Bricks** — the
  [CrispStrobe extension gallery](https://github.com/CrispStrobe/extensions):
  LEGO hardware extensions for **NXT, EV3, Boost, Spike Prime, WeDo 2.0, and
  Powered Up** plus utilities (planetemaths, arrays & tensors, gamepad, CSP
  solver). All extensions ship `en` / `de` / `fr` translations.

Built on [TurboWarp's `scratch-gui`](https://github.com/TurboWarp/scratch-gui)
(GPL-3.0); the compiler/decompiler comes from
[sb3-creator](https://github.com/CrispStrobe/sb3-creator).

**Live editors** (both land directly in the editor; the upstream TurboWarp
player splash has been moved to `/player.html`):

- <https://crispstrobe.github.io/brickwright/>
- <https://brickwright.vercel.app/>

> **Upstream:** for the unforked editor, see
> <https://github.com/TurboWarp/scratch-gui> (and behind that,
> <https://github.com/scratchfoundation/scratch-gui>). For Scratch itself, see
> <https://scratch.mit.edu>.

## Trademarks & disclaimer

**Brickwright is an independent project. It is not affiliated with, authorized,
sponsored, or endorsed by the LEGO Group, the Scratch Foundation, TurboWarp, or
any other trademark holder named here.**

- **LEGO®**, **MINDSTORMS®**, **SPIKE™**, **WeDo®**, **BOOST™**, and **Powered
  Up™** are trademarks of the LEGO Group. Brickwright uses these names **only in
  a referential, descriptive sense** — to state that an extension is *compatible
  with* the corresponding LEGO® hardware. We do not sell LEGO products, use the
  LEGO logo, or use LEGO's brand colours/trade dress in our own branding.
- **Scratch** is a trademark of the Scratch Foundation.
- The LEGO Group does not sponsor, authorize, or endorse this software.

If you're a rights holder and have a concern about how a name is used, please
open an issue and we'll address it promptly.

## What we changed vs upstream

| Where | Change | Why |
|-------|--------|-----|
| `webpack.config.js` | Added a 3rd `HtmlWebpackPlugin` entry that emits `index.html` from the `editor` chunk; renamed the player's `index.html` → `player.html` | so visitors to the bare URL get the editor, not the project-player splash |
| `src/containers/extension-library.jsx` | Fetches `https://crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json` for the gallery list | swap the upstream `extensions.turbowarp.org` for our gallery |
| `src/containers/tw-security-manager.jsx` | Allowlist includes `https://crispstrobe.github.io/` | so unsandboxed LEGO extensions can be loaded from our gallery |
| `src/lib/libraries/extensions/index.jsx` | `galleryLoading` / `galleryMore` / `galleryError` `href` set to our gallery | gallery-info modals link the right place |
| `vercel.json` (new) | `installCommand` + `buildCommand` + `outputDirectory` for Vercel | so Vercel deploys from `develop` work without dashboard tweaks (see Build) |
| `scripts/vercel-build.sh` | Runs `npm install --ignore-scripts` + stubs `microbit-hex-url.cjs` + builds | side-step the flaky upstream micro:bit firmware download |

Everything else is upstream TurboWarp/`scratch-gui` behaviour.

## How this fits with the other repos

The editor itself doesn't ship the extensions — it fetches them from the
gallery URL at runtime, and on iOS/Android the editor is bundled into a
native shell:

| Repo | Role |
|------|------|
| **`brickwright`** (this) | The editor UI |
| [`CrispStrobe/extensions`](https://github.com/CrispStrobe/extensions) | The gallery (`.js` files + `extensions-v0.json` metadata). Hosted at <https://crispstrobe.github.io/extensions/>; the editor fetches it. |
| [`CrispStrobe/turbowarp-lego`](https://github.com/CrispStrobe/turbowarp-lego) | Working sandbox + Python bridges (`nxt_bridge.py`, `ev3dev_ondevice.py`, …) used by the bridge-mode extensions. |
| [`CrispStrobe/legacy-lego-compiler`](https://github.com/CrispStrobe/legacy-lego-compiler) | Hosted REST API: NXC → `.rxe`, lmsasm → EV3 bytecode. Used by the transpiler extensions. |
| [`CrispStrobe/turbowarp-desktop`](https://github.com/CrispStrobe/turbowarp-desktop) | Electron build of this editor. Mac / Windows / Linux installers via GitHub Actions. |
| [`CrispStrobe/turbowarp-android`](https://github.com/CrispStrobe/turbowarp-android) | Capacitor Android wrapper with native Bluetooth bridges. Builds `.apk` + `.ipa`. |
| [`CrispStrobe/turbowarp-ios`](https://github.com/CrispStrobe/turbowarp-ios) | WKWebView iOS wrapper (CodePM-based) with native Bluetooth bridges. Builds `.ipa`. |

## Build & run

### Prerequisites

- Node.js 22+ (TurboWarp's tooling tracks this; see `.nvmrc`).
- Git.

### Local dev

```bash
git clone https://github.com/CrispStrobe/brickwright.git
cd brickwright

# --ignore-scripts skips the flaky upstream micro:bit firmware download.
npm install --ignore-scripts --include=dev

# Stub the file the firmware download would have generated, otherwise webpack
# bails on `can't resolve '../generated/microbit-hex-url.cjs'`. The micro:bit
# firmware-flasher path is the only thing this disables.
mkdir -p src/generated
printf "module.exports = '';\n" > src/generated/microbit-hex-url.cjs

npm start
# → http://localhost:8601
```

### Production build for static hosting (GitHub Pages, Vercel, anywhere else)

```bash
NODE_ENV=production CI=true npx webpack --bail
# → contents of build/

# Push the build to gh-pages on this repo:
npm run deploy
```

`CI=true` suppresses the webpack ProgressPlugin's stdout flood, which has
caused builds to die mid-stream when run via nested `npm` scripts.

### Library build for the native shells

`turbowarp-desktop` consumes `dist/scratch-gui.js` (UMD) instead of a static
site:

```bash
BUILD_MODE=dist npm run build

# Webpack outputs to dist/js/; consumers expect dist/ at root.
mv dist/js/* dist/
rmdir dist/js
```

See the per-shell READMEs for the linking step ("brain transplant" recipe in
`turbowarp-desktop` and `turbowarp-ios`).

## Vercel

Auto-deploys from `develop` to <https://brickwright.vercel.app/>. The
build is driven by `vercel.json` at the repo root:

- `installCommand`: `npm install --ignore-scripts --include=dev --no-audit --no-fund`
- `buildCommand`: `./scripts/vercel-build.sh` (stubs the micro:bit file, runs webpack)
- `outputDirectory`: `build`

Vercel sets `NODE_ENV=production` which makes `npm install` skip
`devDependencies` by default — `--include=dev` is therefore mandatory or
`webpack-cli` won't be installed.

## GitHub Pages

Pages deploys **automatically via GitHub Actions** on every push to `develop`
(`.github/workflows/deploy-pages.yml`): it builds and publishes with
`actions/deploy-pages`, so there's no manual step. The site serves at
<https://crispstrobe.github.io/brickwright/>. (The Pages "Source" is set to
**GitHub Actions**, not a branch — the old legacy branch builder was slow and
occasionally failed transiently.)

`npm run deploy` (force-push `build/` to `gh-pages`) still exists as a manual
fallback but is no longer the primary path.

## Troubleshooting

### `ECONNRESET` during `npm install`

The upstream `scripts/prepublish.mjs` downloads the micro:bit firmware from
an upstream URL that frequently times out. Two workarounds:

- `npm install --ignore-scripts` + create the stub file (see the dev recipe
  above). Recommended; the micro:bit firmware-flasher won't work but every
  other code path is unaffected.
- Or patch `scripts/prepublish.mjs` to point at a working mirror:
  ```javascript
  const url = 'https://downloads.scratch.mit.edu/microbit/scratch-microbit-1.2.0.hex.zip';
  ```

### `Cannot read properties of null (reading 'store')` in a downstream shell

Duplicate React versions: the nested `scratch-gui/node_modules/react` clashes
with the host app's React. Remove the nested copies before linking. See the
[turbowarp-desktop README](https://github.com/CrispStrobe/turbowarp-desktop).

### Webpack dies mid-build with no error

The ProgressPlugin can flood stdout enough that nested `npm run` chains
deadlock. Use `CI=true` or invoke `node_modules/.bin/webpack --bail`
directly.

### Missing `webpack-cli` on Vercel

Vercel sets `NODE_ENV=production` which suppresses `devDependencies`. Use
`npm install --include=dev` (already in `vercel.json`).

### Node ≥ 24 issues

The build chain isn't yet compatible with Node 24+. Stick to 22 LTS until
TurboWarp upstream catches up.

## Branches

- **`develop`** — main published branch; backs the GitHub Pages + Vercel
  demos.
- **`backup-remote`**, **`feature/github-pages`**, **`lego-boost-xcratch`**,
  **`lego-bluetooth-extensions`** — historical / experimental, retained for
  reference. Ignore unless you know why you need them.

## License

GPL-3.0, same as upstream TurboWarp/scratch-gui. See [`LICENSE`](LICENSE).

The original Scratch Foundation `scratch-gui` upstream license is included
in the repository; it is **not** the license of this fork (TurboWarp's
modifications upgraded the project to GPL-3.0 and we inherit that).
