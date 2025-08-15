#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e
# Print each command to the console before executing it.
set -x

echo "--- [STEP 1/7] Vercel Build Script for xcratch with Lego extensions Started ---"
echo "Initial working directory: $(pwd)"

# The `register` script in the extensions repo expects the GUI to be in a folder named `../scratch-gui`.
# This symlink tricks the register script into finding the correct directory in Vercel's environment.
echo "--- [STEP 2/7] Creating compatibility symlink ---"
ln -s $(pwd) ../scratch-gui

# Clone the LEGO extensions repository
echo "--- [STEP 3/7] Cloning LEGO extensions repository ---"
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions
cd ../scratch-lego-bluetooth-extensions
echo "Current working directory: $(pwd)"

# Install, register, and build the extensions
echo "--- [STEP 4/7] Setting up extensions (install, register, build) ---"
npm install
npm run register
npm run build

# Navigate back to the scratch-gui directory to verify and build the main app
cd ../scratch-gui
echo "Current working directory: $(pwd)"

echo "--- [STEP 5/7] Verifying that extension symlinks were created ---"
echo "Listing contents of 'src/lib/libraries/extensions':"
ls -l ./src/lib/libraries/extensions/

# Build the main scratch-gui application
echo "--- [STEP 6/7] Building main scratch-gui application ---"
npm run build

# Copy the built extension files into the final build output
echo "--- [STEP 7/7] Copying built extensions to build/xcratch ---"
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo "Verifying contents of 'build/xcratch':"
ls -l ./build/xcratch/

echo "✅ Build script finished successfully!"