#!/bin/bash
set -e

# Vercel runs this if the project's "Build Command" still points here. The
# canonical config now lives in vercel.json at the repo root — installCommand
# + buildCommand + outputDirectory there override anything in the dashboard.
# This script remains as a fallback so existing setups don't break.

# Skip the flaky upstream micro:bit firmware download; stub the generated
# import so webpack can resolve it.
mkdir -p src/generated
printf 'module.exports = "";\n' > src/generated/microbit-hex-url.cjs

# Avoid the prepublish download by passing --ignore-scripts (vercel-build.sh
# is invoked after Vercel's installCommand, but if the project's
# installCommand still uses plain `npm install`, this re-installs cleanly).
npm install --ignore-scripts --no-audit --no-fund

CI=true NODE_OPTIONS='--max-old-space-size=8192' npx webpack --bail

# index.html is now produced as the editor directly (see additional
# HtmlWebpackPlugin entry in webpack.config.js); no redirect overwrite
# needed. The TurboWarp player splash lives at /player.html.
