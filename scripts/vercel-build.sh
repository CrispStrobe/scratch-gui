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
# Clone the extensions project alongside the main GUI project
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

log_step "3/5: INSTALLING EXTENSION DEPENDENCIES"
# Go into the extensions directory and run a full, clean npm install.
# This is critical and is what was failing before.
(cd ../scratch-lego-bluetooth-extensions && npm install)

log_step "4/5: BUILDING AND REGISTERING EXTENSIONS"
# Now that dependencies are installed, run the register and build scripts.
(cd ../scratch-lego-bluetooth-extensions && npm run register && npm run build)

log_step "5/5: BUILDING MAIN 'scratch-gui' APPLICATION"
# Build the main GUI application, which now includes the registered extensions
npm run build

log_step "6/5: FINALIZING BUILD"
# Copy the built extension modules into the final build directory
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

echo -e "\n${GREEN}✅ Vercel build script finished successfully!${NC}"