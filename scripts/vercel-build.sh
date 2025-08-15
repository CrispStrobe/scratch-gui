#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e

echo "=== Vercel Build Script Started ==="

# The `register` script in the extensions repo expects the GUI to be in a folder named `../scratch-gui`.
# Vercel clones the repo to a generic path like `/vercel/path0`.
# This symlink tricks the register script into finding the correct directory.
echo "Creating symlink for compatibility..."
ln -s $(pwd) ../scratch-gui

# Clone the LEGO extensions repository into the parent directory
echo "Cloning LEGO extensions..."
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

# Navigate into the extensions directory to set it up
cd ../scratch-lego-bluetooth-extensions

# Install extension dependencies
echo "Installing extension dependencies..."
npm install

# Register the extensions with scratch-gui
# This step creates the symlinks that the scratch-gui build needs
echo "Registering LEGO extensions..."
npm run register

# Build the extensions themselves
echo "Building LEGO extensions..."
npm run build

# Navigate back to the scratch-gui directory (via our symlink) to build the main app
cd ../scratch-gui
echo "Building main scratch-gui application..."
# Note: Vercel already ran `npm install` for this repo at the start of the build process.
npm run build

# Copy the built extension files into the final build output
echo "Copying extension files to final destination..."
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo "✅ Build complete!"