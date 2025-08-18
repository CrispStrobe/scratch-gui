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

log_step "3/5: INSTALLING EXTENSION DEPENDENCIES"
# Use 'npm ci' which is the standard for CI. It's fast and reliable,
# and will now work correctly with the regenerated package-lock.json.
(cd ../scratch-lego-bluetooth-extensions && npm ci)

log_step "4/5: BUILDING AND REGISTERING EXTENSIONS"
# With dependencies installed, run the register and build scripts.
(cd ../scratch-lego-bluetooth-extensions && npm run register && npm run build)

log_step "5/5: BUILDING MAIN 'scratch-gui' APPLICATION"
npm run build

log_step "6/5: FINALIZING BUILD"
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo -e "\n${GREEN}✅ Vercel build script finished successfully!${NC}"