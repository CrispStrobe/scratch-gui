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

log_step "1/5: INITIALIZING BUILD PROCESS"
echo "Build for xcratch started at: $(date)"

log_step "2/5: CLONING LEGO EXTENSIONS REPOSITORY"
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

log_step "3/5: SETTING UP EXTENSIONS (REGISTER & BUILD)"
# Dependencies are already installed in the root.
# We can directly run the scripts from the extensions directory using a subshell.
echo "Running extension registration and build scripts..."
(cd ../scratch-lego-bluetooth-extensions && npm run register && npm run build)

log_step "4/5: BUILDING MAIN 'scratch-gui' APPLICATION"
# Ensure we are in the correct directory before building
cd ../scratch-gui
npm run build

log_step "5/5: COPYING BUILT EXTENSIONS TO FINAL DESTINATION"
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo -e "\n${GREEN}✅ Vercel build script finished successfully!${NC}"