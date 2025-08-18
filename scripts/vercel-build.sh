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

log_step "1/6: INITIALIZING & REPAIRING DEPENDENCIES"
# Vercel's initial `npm install` runs before this script.
# We force a reinstall of scratch-vm to ensure it exists, bypassing any cache corruption.
echo "Forcing reinstall of scratch-vm to bypass potential cache issues..."
npm install scratch-vm@^2.3.4

log_step "2/6: CLONING LEGO EXTENSIONS REPOSITORY"
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

log_step "3/6: INSTALLING EXTENSION DEPENDENCIES"
# Force npm to install ALL dependencies by setting NODE_ENV for this command only.
# This overrides Vercel's "production" default and ensures build tools are installed.
(cd ../scratch-lego-bluetooth-extensions && NODE_ENV=development npm install)

log_step "4/6: BUILDING AND REGISTERING EXTENSIONS"
# With all dependencies now correctly installed in both projects, run the scripts.
(cd ../scratch-lego-bluetooth-extensions && npm run register && npm run build)

log_step "5/6: BUILDING MAIN 'scratch-gui' APPLICATION"
npm run build

log_step "6/6: FINALIZING BUILD"
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo -e "\n${GREEN}✅ Vercel build script finished successfully!${NC}"