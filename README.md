# Brickwright

**Brickwright is a creative-coding studio where every project is the same thing four ways —
[blocks](https://scratch.mit.edu), pseudocode, Python, and JavaScript — and you can switch
between them at any time without losing your work.** Build a game by dragging blocks, flip it
to Python to read the logic, tweak it as JavaScript, and drop it back to blocks: the sprites,
costumes, and behaviour all survive the trip. Then run it on screen, or drive real **LEGO®
bricks and robots**.

The name says it: a *wright* — a maker (ship*wright*, play*wright*) — who both **builds** and
**writes** with blocks.

**Try it now:** <https://crispstrobe.github.io/brickwright/> · <https://brickwright.vercel.app/>

Built on [TurboWarp's `scratch-gui`](https://github.com/TurboWarp/scratch-gui) (GPL-3.0); the
block ⇄ code compiler is [sb3-creator](https://github.com/CrispStrobe/sb3-creator). Issues,
feature requests, and PRs are welcome — [open one here](https://github.com/CrispStrobe/brickwright/issues).

---

## One project, four representations

Open the **Code** tab in the editor. It has two sub-tabs — **Blocks** (the normal Scratch
canvas) and **Code** (a text editor with **🧩 Pseudocode**, **🐍 Python**, and **🟨 JavaScript**
views). The arrows move a project between them:

```
   ┌──────────────┐   ⇦ To blocks    ┌────────────────────────────────┐
   │    Blocks    │ ◀──────────────  │   Code                         │
   │  (Scratch    │                  │   🧩 Pseudocode                │
   │   canvas)    │  From blocks ⇨   │   🐍 Python   ⇄  🟨 JavaScript  │
   └──────────────┘ ──────────────▶  └────────────────────────────────┘
```

- **Pseudocode ⇄ blocks ⇄ Python ⇄ JavaScript**, every arrow two-way.
- **Full fidelity.** Converting a project to Python or JavaScript and back reconstructs the
  *whole* project — every sprite (with its name), every costume, and all the motion, looks and
  sensing behaviour. Scratch blocks map to a small `scratch` runtime object
  (`scratch.go_to(x, y)`, `scratch.touching("Apple")`), so nothing is thrown away on the way
  out. All 30+ built-in examples round-trip **byte-for-byte identically** through both Python
  and JavaScript (verified in CI across many interleaved conversion chains).
- **Runnable.** The generated Python and JavaScript run *as they are* — Python in the browser
  via [Skulpt](https://skulpt.org), JavaScript directly — so the "Code" view isn't a lossy
  export, it's a real, executable second form of your project.
- **Readable.** Loops, lists, math, and custom blocks become idiomatic `for`/`while`, arrays,
  and functions; comments survive as native Scratch block comments.

This is the heart of Brickwright: blocks for building, text for reading and refactoring, and a
guarantee that you never have to pick one.

## Learn from real examples

The **📚 Load example…** dropdown ships 30+ complete projects you can open, read in any of the
four forms, run, and remix — from single-concept demos (motion, pen, sensing, operators) to
full games built from lists and custom blocks:

> Snake · Tetris · Breakout · Pong (2-player & vs-AI) · Space Invaders · Sokoban · Flappy ·
> 2048 · Maze Chase · Tic-Tac-Toe (2-player & vs-AI) · Connect Four (vs-AI) · Bomberman ·
> Minesweeper — plus Arrays & Vectors and Planète-Maths demos for the extensions.

Every example loads and runs, and every one is exercised in the test suite (it must execute,
round-trip through all four representations, and stay identical across repeated conversions).

## Brickwright Bricks — hardware & extensions

The editor loads its extension gallery from
[CrispStrobe/extensions](https://github.com/CrispStrobe/extensions) (117 extensions, each with
`en` / `de` / `fr` translations), including LEGO hardware for **NXT, EV3, BOOST, SPIKE Prime,
WeDo 2.0, and Powered Up**, plus utilities (Planète Maths, Arrays & Vectors, Gamepad, a CSP
solver, and more).

Hardware extensions transpile to **driver-agnostic** code: a pluggable driver is emitted so the
same program can run as a neutral **shim** (readable pseudo-code), talk to a bridge over
**USB / BLE / Bluetooth** (`remote`), or run **on-brick** (`on-device`, e.g. ev3dev / pybricks).
The Code view exposes a **🔌 driver** switch plus **async** and **events** toggles for exactly
this. See the driver/bridge notes in
[brickwright-bridges](https://github.com/CrispStrobe/brickwright-bridges).

## Trademarks & disclaimer

**Brickwright is an independent project. It is not affiliated with, authorized, sponsored, or
endorsed by the LEGO Group, the Scratch Foundation, TurboWarp, or any other trademark holder
named here.**

- **LEGO®**, **MINDSTORMS®**, **SPIKE™**, **WeDo®**, **BOOST™**, and **Powered Up™** are
  trademarks of the LEGO Group. Brickwright uses these names **only in a referential,
  descriptive sense** — to state that an extension is *compatible with* the corresponding LEGO®
  hardware. We do not sell LEGO products, use the LEGO logo, or use LEGO's brand colours/trade
  dress in our own branding.
- **Scratch** is a trademark of the Scratch Foundation.
- The LEGO Group does not sponsor, authorize, or endorse this software.

If you're a rights holder and have a concern about how a name is used, please open an issue and
we'll address it promptly.

## How the pieces fit together

The editor doesn't bundle the extensions — it fetches them from the gallery URL at runtime — and
on mobile the editor is wrapped in a native shell:

| Repo | Role |
|------|------|
| **`brickwright`** (this) | The editor UI (TurboWarp/`scratch-gui` fork). |
| [`sb3-creator`](https://github.com/CrispStrobe/sb3-creator) | The block ⇄ pseudocode ⇄ Python ⇄ JavaScript compiler, vendored into `src/lib/`. |
| [`CrispStrobe/extensions`](https://github.com/CrispStrobe/extensions) | The gallery (`.js` files + `extensions-v0.json`), hosted at <https://crispstrobe.github.io/extensions/>. |
| [`CrispStrobe/brickwright-bridges`](https://github.com/CrispStrobe/brickwright-bridges) | Python bridges (`nxt_bridge.py`, `ev3dev_ondevice.py`, …) for bridge-mode extensions. |
| [`CrispStrobe/legacy-lego-compiler`](https://github.com/CrispStrobe/legacy-lego-compiler) | Hosted REST API: NXC → `.rxe`, lmsasm → EV3 bytecode, for the transpiler extensions. |
| [`CrispStrobe/brickwright-desktop`](https://github.com/CrispStrobe/brickwright-desktop) | Electron build (Mac / Windows / Linux installers via GitHub Actions). |
| [`CrispStrobe/brickwright-android`](https://github.com/CrispStrobe/brickwright-android) | Capacitor Android wrapper with native Bluetooth bridges (`.apk`). |
| [`CrispStrobe/brickwright-ios`](https://github.com/CrispStrobe/brickwright-ios) | WKWebView iOS wrapper with native Bluetooth bridges (`.ipa`). |

## What we changed vs upstream

| Where | Change | Why |
|-------|--------|-----|
| `src/components/tw-pseudocode/` + `src/lib/sb3-creator*.js` | The whole Code tab: 3-language editor, block ⇄ code round-trip, in-editor Run (Skulpt/JS), example gallery | the flagship Brickwright feature |
| `webpack.config.js` | A 3rd `HtmlWebpackPlugin` emits `index.html` from the `editor` chunk; the player's `index.html` → `player.html` | visitors to the bare URL get the editor, not the project-player splash |
| `src/containers/extension-library.jsx` | Fetches `crispstrobe.github.io/extensions/generated-metadata/extensions-v0.json` | swap the upstream `extensions.turbowarp.org` for our gallery |
| `src/containers/tw-security-manager.jsx` | Allowlist includes `https://crispstrobe.github.io/` | so unsandboxed LEGO extensions load from our gallery |
| `src/lib/libraries/extensions/index.jsx` | Gallery-info modal `href`s point at our gallery | link the right place |
| `vercel.json` (new) + `scripts/vercel-build.sh` | Vercel install/build config; stubs `microbit-hex-url.cjs` | Vercel deploys from `develop` without dashboard tweaks; side-steps the flaky micro:bit firmware download |

Everything else is upstream TurboWarp/`scratch-gui` behaviour.

## Build & run

### Prerequisites

- Node.js 22 LTS (the build chain isn't yet compatible with Node ≥ 24; see `.nvmrc`).
- Git.

### Local dev

```bash
git clone https://github.com/CrispStrobe/brickwright.git
cd brickwright

# --ignore-scripts skips the flaky upstream micro:bit firmware download.
npm install --ignore-scripts --include=dev

# Stub the file that download would have generated, otherwise webpack bails on
# "can't resolve '../generated/microbit-hex-url.cjs'". Only the micro:bit
# firmware-flasher path is disabled by this.
mkdir -p src/generated
printf "module.exports = '';\n" > src/generated/microbit-hex-url.cjs

npm start           # → http://localhost:8601
```

### Production build (GitHub Pages, Vercel, any static host)

```bash
NODE_ENV=production CI=true npx webpack --bail   # → build/
npm run deploy                                   # force-push build/ to gh-pages (manual fallback)
```

`CI=true` suppresses the webpack ProgressPlugin's stdout flood, which has caused nested `npm`
builds to die mid-stream.

### Library build for the native shells

`brickwright-desktop` consumes `dist/scratch-gui.js` (UMD) rather than a static site:

```bash
BUILD_MODE=dist npm run build
mv dist/js/* dist/ && rmdir dist/js   # consumers expect dist/ at the root
```

See the per-shell READMEs for the linking ("brain transplant") step.

## Deployment

- **GitHub Pages** — auto-deploys on every push to `develop` via GitHub Actions
  (`.github/workflows/deploy-pages.yml` → `actions/deploy-pages`). Serves at
  <https://crispstrobe.github.io/brickwright/>. Pages "Source" is **GitHub Actions**, not a
  branch. `npm run deploy` remains a manual fallback.
- **Vercel** — auto-deploys `develop` to <https://brickwright.vercel.app/>, driven by
  `vercel.json`: `installCommand` = `npm install --ignore-scripts --include=dev --no-audit
  --no-fund`, `buildCommand` = `./scripts/vercel-build.sh`, `outputDirectory` = `build`.
  `--include=dev` is mandatory — Vercel sets `NODE_ENV=production`, which otherwise skips
  `webpack-cli`.

## Troubleshooting

- **`ECONNRESET` during `npm install`** — upstream `scripts/prepublish.mjs` downloads micro:bit
  firmware from a URL that frequently times out. Use `npm install --ignore-scripts` + the stub
  file (dev recipe above), or point `prepublish.mjs` at
  `https://downloads.scratch.mit.edu/microbit/scratch-microbit-1.2.0.hex.zip`.
- **`Cannot read properties of null (reading 'store')` in a downstream shell** — duplicate React
  versions; remove the nested `scratch-gui/node_modules/react` before linking (see
  brickwright-desktop).
- **Webpack dies mid-build with no error** — the ProgressPlugin can flood stdout; use `CI=true`
  or `node_modules/.bin/webpack --bail`.
- **Missing `webpack-cli` on Vercel** — `NODE_ENV=production` suppresses `devDependencies`; use
  `npm install --include=dev` (already in `vercel.json`).
- **Node ≥ 24 issues** — stick to Node 22 LTS until upstream catches up.

## Branches

- **`develop`** — the main published branch; backs the GitHub Pages + Vercel demos.
- **`backup-remote`**, **`feature/github-pages`**, **`lego-boost-xcratch`**,
  **`lego-bluetooth-extensions`** — historical / experimental, retained for reference.

## License

GPL-3.0, same as upstream TurboWarp/`scratch-gui` — see [`LICENSE`](LICENSE). The original
Scratch Foundation `scratch-gui` license is included in the repo but is **not** the license of
this fork; TurboWarp's modifications upgraded the project to GPL-3.0 and we inherit that.

> **Upstream:** for the unforked editor see
> [TurboWarp/scratch-gui](https://github.com/TurboWarp/scratch-gui) (and
> [scratchfoundation/scratch-gui](https://github.com/scratchfoundation/scratch-gui) behind it);
> for Scratch itself, <https://scratch.mit.edu>.
