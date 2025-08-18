#!/bin/bash
set -euo pipefail

# --- Logging Helpers ---
BLUE='\033[0;34m'
GREEN='\033[0;32m'
NC='\033[0m'

log_step() {
    echo -e "\n${BLUE}=======================================================================${NC}"
    echo -e "${BLUE} STEP: $1 ${NC}"
    echo -e "${BLUE}=======================================================================${NC}"
}

# --- Build Process ---

log_step "1/6: CREATING A CLEAN SLATE"
# The Vercel cache is causing issues. We will defeat it by deleting the restored
# node_modules and performing a fresh, reliable install.
echo "Removing potentially corrupted node_modules directory..."
rm -rf node_modules

log_step "2/6: CLEAN INSTALL FOR 'scratch-gui'"
# This guarantees that scratch-vm and all other main dependencies are present.
echo "Running a fresh install for the main application..."
npm install

log_step "3/6: CLONING LEGO EXTENSIONS REPOSITORY"
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

log_step "4/6: CLEAN INSTALL FOR EXTENSIONS"
# Force npm to install ALL devDependencies for the extensions' build tools
# by temporarily setting the NODE_ENV.
echo "Running a fresh install for the extensions' build tools..."
(cd ../scratch-lego-bluetooth-extensions && NODE_ENV=development npm install)

log_step "5/6: BUILDING AND REGISTERING EXTENSIONS"
# With all dependencies now correctly installed in both projects, run the scripts.
(cd ../scratch-lego-bluetooth-extensions && npm run register && npm run build)

log_step "6/6: FINAL BUILD & DEPLOYMENT"
# Build the main GUI application and copy the extension artifacts into place.
npm run clean
npm run build
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo -e "\n${GREEN}✅ Vercel build script finished successfully!${NC}"