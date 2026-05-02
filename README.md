# scratch-gui (LEGO/TurboWarp fork)

A TurboWarp/Scratch editor build configured to load custom **unsandboxed**
LEGO hardware extensions directly in the browser — Web Bluetooth and Web
Serial for EV3, NXT, Spike Prime, WeDo 2.0, Boost, and more.

**Live demos** (both land directly in the editor; the TurboWarp player
splash has been moved to `/player.html`):
- <https://crispstrobe.github.io/scratch-gui/>
- <https://scratch-gui-three.vercel.app/editor.html>

## How this fits with the other repos

This is the editor UI. It loads extensions from a separate gallery repo and
talks to physical bricks either directly (Web BT / Web Serial) or via a local
or on-brick Python bridge.

| Repo | Role |
|------|------|
| **`scratch-gui` (this)** | The editor UI. Lists extensions, lets users drag them into projects. |
| [`CrispStrobe/extensions`](https://github.com/CrispStrobe/extensions) | The extension gallery (`.js` files + `extensions-v0.json` metadata). Hosted on GitHub Pages; the editor `fetch`es it. |
| [`CrispStrobe/turbowarp-lego`](https://github.com/CrispStrobe/turbowarp-lego) | Working sandbox + Python bridges (`nxt_bridge.py`, `ev3dev_ondevice.py`, ...) used by the bridge-mode extensions. |
| [`CrispStrobe/legacy-lego-compiler`](https://github.com/CrispStrobe/legacy-lego-compiler) | Hosted REST API that compiles NXC → `.rxe` and lmsasm → EV3 bytecode. |
| [`CrispStrobe/turbowarp-desktop`](https://github.com/CrispStrobe/turbowarp-desktop) | Electron build of this editor. |
| [`CrispStrobe/turbowarp-android`](https://github.com/CrispStrobe/turbowarp-android) | Android wrapper (Capacitor) with native Bluetooth bridges. |
| [`CrispStrobe/turbowarp-ios`](https://github.com/CrispStrobe/turbowarp-ios) | iOS wrapper (WKWebView) with native Bluetooth bridges. |

## Setup and development

### Prerequisites

- Node.js v16, v18, or v20 (v24 has known issues — see Troubleshooting).
- Git.

### Install and run

```bash
git clone https://github.com/CrispStrobe/scratch-gui.git
cd scratch-gui

# --ignore-scripts skips the upstream micro:bit firmware download that
# frequently times out.
npm install --ignore-scripts

npm start
# → http://localhost:8601
```

## Loading custom extensions

To run unsandboxed extensions (required for Bluetooth / Serial), you need to
register your gallery and trust its hosting domain.

### 1. Register the gallery

Edit `src/lib/libraries/extensions/index.jsx`. The `galleryLoading`,
`galleryMore`, and `galleryError` entries each have an `href` — point them at
your GitHub Pages URL:

```javascript
export const galleryLoading = {
    name: 'My Extension Gallery',
    // ...
    href: 'https://crispstrobe.github.io/extensions/',
    // ...
};
```

### 2. Trust the hosting domain

Edit `src/containers/tw-security-manager.jsx`:

```javascript
const isTrustedExtension = url => (
    url.startsWith('https://extensions.turbowarp.org/') ||
    url.startsWith('https://crispstrobe.github.io/') ||  // ← add yours
    extensionsTrustedByUser.has(url)
);
```

### 3. Extension headers

Each `.js` extension file in the gallery needs a header block so the gallery
build can index it:

```javascript
// Name: LEGO NXT Universal
// ID: legonxt_transpile_universal
// Description: Control NXT via Bluetooth or compile NXC code.
// By: CrispStrobe <https://github.com/CrispStrobe>
// License: MPL-2.0
```

## Building / deploying

### Web build (GitHub Pages / Vercel)

Static editor for any static host:

```bash
rm -rf build
NODE_ENV=production npm run build
# → contents of build/ → push to gh-pages branch (or use `npm run deploy`)
```

### Library build (for TurboWarp Desktop / Android / iOS)

Native shells consume `dist/scratch-gui.js` (UMD) instead of a static site.
Build in **library mode**:

```bash
BUILD_MODE=dist npm run build

# Webpack outputs to dist/js/, but the consumers expect dist/. Fix it:
mv dist/js/* dist/
rmdir dist/js
```

`dist/scratch-gui.js` is then linked into `turbowarp-desktop`, copied into the
Android app's web assets, etc. See the per-shell READMEs for the exact wiring.

## Troubleshooting

### `ECONNRESET` during `npm install`

The upstream `scripts/prepublish.mjs` tries to download the micro:bit firmware
from a URL that frequently times out. Workarounds:

- Run `npm install --ignore-scripts` (skips the download entirely; the
  micro:bit extension just won't have its hex bundled). **One catch:**
  `src/lib/microbit-update.js` still does
  `import hexUrl from '../generated/microbit-hex-url.cjs'` so the production
  build will fail with "can't resolve '../generated/microbit-hex-url.cjs'".
  Create a stub:

  ```bash
  mkdir -p src/generated
  printf "module.exports = '';\n" > src/generated/microbit-hex-url.cjs
  ```

  This makes the import resolve to an empty string. The micro:bit firmware
  flasher won't function (it's looking for a real `.hex` URL), but every
  other code path is unaffected.

- Or patch `scripts/prepublish.mjs` to point at a working mirror:

  ```javascript
  const url = 'https://downloads.scratch.mit.edu/microbit/scratch-microbit-1.2.0.hex.zip';
  ```

### `Cannot read properties of null (reading 'store')`

Seen when integrating this `scratch-gui` into TurboWarp Desktop or other
downstream Electron / native shells. Cause: duplicate React versions — the
nested `node_modules/react` inside `scratch-gui/node_modules/` clashes with
the host app's React. Remove the nested copies before linking. See the
[turbowarp-desktop README](https://github.com/CrispStrobe/turbowarp-desktop)
for the full "brain transplant" recipe.

### Node v24: `ERR_MODULE_NOT_FOUND`

The build chain isn't yet compatible with Node 24. Use Node v18 or v20.

### Missing optional deps / chokidar warnings

```bash
npm install --no-optional
```

These are macOS-only `fsevents` bindings and similar — safe to skip on Linux/Windows.

## Branches

- **`develop`** — main published branch; backs the GitHub Pages / Vercel demos.
- **`lego-bluetooth-extensions`** — work-in-progress branch with additional
  LEGO Bluetooth changes.

## License

This project, like TurboWarp's modifications to Scratch, is licensed under
**GPL-3.0**. See [`LICENSE`](LICENSE) and <https://www.gnu.org/licenses/>.

The original `scratch-gui` upstream license is included below as required.
This is **not** the license of this project.

```
Copyright (c) 2016, Massachusetts Institute of Technology
All rights reserved.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```

`src/lib/default-project/dango.svg` is based on [Twemoji](https://twemoji.twitter.com/) and is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
