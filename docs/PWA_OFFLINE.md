# PWA / offline-asset story

## Today: precaching is **off**

The editor is a PWA in name only — `static/manifest.webmanifest` exists so the
browser will treat the site as installable, but no asset precaching happens.

The service worker at `src/playground/service-worker.js` is intentionally a
no-op that *clears* any cache it finds on activation:

```js
self.addEventListener('activate', event => {
  // We don't use caches any more, so remove all of them
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(i => caches.delete(i))))
  );
});
```

This is inherited from upstream TurboWarp, presumably to dodge the
stale-asset-version bugs that come with overlay caching of a CDN-hosted
asset library. Loading the editor without a network is therefore not
supported today; it fetches sprite/costume/sound assets from
`https://assets.scratch.mit.edu/` on demand at runtime.

## Now: an asset manifest is generated at build time

`scripts/makePWAAssetsManifest.js` walks `src/lib/libraries/{backdrops,
costumes, sounds, sprites}.json`, collects every MD5 referenced in those
libraries, and writes them to `src/assetsManifest.json` as a list of
`{url, revision}` entries pointing at the Scratch asset CDN. Currently
about 1300 entries / ~210 KB.

The script runs as `prebuild` in `package.json` so every `npm run build`
regenerates it. The output is gitignored — single source of truth lives
in the library JSON files in `src/lib/libraries/`.

The manifest itself is a no-op at runtime as long as the service worker
above stays a clear-everything no-op.

## Why bother generating it then?

So that turning offline support back on later is a small wiring job,
not a from-scratch port. With the manifest already produced, a future
service worker only needs to:

1. `fetch('/assetsManifest.json')` (or be given it via a build-time
   import / `__WB_MANIFEST` injection if using workbox-webpack-plugin).
2. Pre-cache each entry's `url`, keyed on `revision` so cache busting
   is automatic when the asset hashes change.
3. Adopt a cache-first strategy for the asset CDN domain.

Workbox's `precacheAndRoute(self.__WB_MANIFEST)` is the canonical
implementation; ~10 lines plus the webpack plugin.

## Why we haven't done that

- TurboWarp upstream removed it because of stale-asset bugs (cached
  old version of an asset confuses users; cache invalidation is hard).
- Without an offline-classroom or PWA-installable use case, the
  cache-invalidation tax outweighs the benefit.
- If we ever want it, the right next step is path **B** in the
  `cherry-pick` analysis (see `scratch-gui-foundation/PROVENANCE.md`):
  replace the no-op SW with workbox precaching driven by this
  manifest.

## Provenance

Both `scripts/makePWAAssetsManifest.js` and `scripts/lib/libraries.js`
were ported from
[`scratchfoundation/scratch-gui` v4.x](https://github.com/scratchfoundation/scratch-gui)
via a former local working copy
(`/Volumes/backups/code/scratch-gui-foundation/`, see its
`PROVENANCE.md`). The active TurboWarp/scratch-gui v3.x lineage we ship
from never had it.
