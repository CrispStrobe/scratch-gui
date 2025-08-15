#!/bin/bash
set -e

echo "=== Setting up LEGO Bluetooth Extensions for Vercel ==="

# Clone your LEGO extensions repository
echo "Cloning LEGO extensions..."
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

# Install dependencies for extensions
echo "Installing extension dependencies..."
cd ../scratch-lego-bluetooth-extensions
npm install

# Clean any existing symlinks to prevent conflicts
echo "Cleaning existing extensions..."
find ../scratch-gui/src/lib/libraries/extensions -type l -delete 2>/dev/null || true
find ../scratch-gui/node_modules/scratch-vm/src/extensions -type l -delete 2>/dev/null || true

# Register the extensions
echo "Registering LEGO extensions..."
npm run register

# Build the extensions
echo "Building LEGO extensions..."
npm run build

# Go back to main directory and build
cd ../scratch-gui
echo "Building main application..."
npm run build

# Copy extension dist to xcratch
echo "Copying extension files..."
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo "=== Build complete ==="