#!/bin/bash
set -euo pipefail

# --- Logging Helpers ---
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() {
    echo -e "\n${BLUE}=======================================================================${NC}"
    echo -e "${BLUE} STEP: $1 ${NC}"
    echo -e "${BLUE}=======================================================================${NC}"
}

# --- Build Process ---

log_step "1/8: INITIALIZING BUILD PROCESS"
echo "Build for xcratch started at: $(date)"

log_step "2/8: CREATING COMPATIBILITY SYMLINK FOR 'scratch-gui'"
ln -s "$(pwd)" ../scratch-gui

log_step "3/8: CLONING LEGO EXTENSIONS REPOSITORY"
git clone https://github.com/CrispStrobe/scratch-lego-bluetooth-extensions.git ../scratch-lego-bluetooth-extensions

log_step "4/8: TARGETED CLEANING OF LEGO-SPECIFIC EXTENSIONS"
LEGO_EXTENSIONS=( "legoble" "spikeessential" "legoremote" "controlplus" "poweredup" "duplotrain" "legopeach" "legoluigi" "legomario" "spikeprime" "dualshock4" )
echo "Checking for and removing specific extension directories to prevent conflicts..."
for ext in "${LEGO_EXTENSIONS[@]}"; do
    gui_ext_path="./src/lib/libraries/extensions/${ext}"
    if [ -e "${gui_ext_path}" ]; then
        echo "Removing existing item: ${gui_ext_path}"
        rm -rf "${gui_ext_path}"
    fi
    vm_ext_path="./node_modules/scratch-vm/src/extensions/scratch3_${ext}"
    if [ -e "${vm_ext_path}" ]; then
        echo "Removing existing item: ${vm_ext_path}"
        rm -rf "${vm_ext_path}"
    fi
done
echo "Targeted cleaning complete."

log_step "5/8: SETTING UP EXTENSIONS (INSTALL, REGISTER, BUILD)"
cd ../scratch-lego-bluetooth-extensions
echo "Changed directory to: $(pwd)"

# Use 'npm ci --include=dev' to force installation of devDependencies
# (fix for the NODE_ENV=production environment)
echo "Running 'npm install... fingers crossed..."
npm install

#echo "Running 'npm ci --include=dev' for extensions..."
#npm ci --include=dev

#echo "Explicitly installing required build tools..."
#npm install command-line-args
#npm install fs-extra

echo "Running 'npm run register'..."
npm run register

echo "Running 'npm run build'..."
npm run build

log_step "6/8: BUILDING MAIN 'scratch-gui' APPLICATION"
cd ../scratch-gui
echo "Changed directory back to: $(pwd)"
npm run build

log_step "7/8: COPYING BUILT EXTENSIONS TO FINAL DESTINATION"
mkdir -p build/xcratch
cp -r ../scratch-lego-bluetooth-extensions/dist/* build/xcratch/

log_step "8/8: BUILD COMPLETE"
echo -e "${GREEN}✅ Vercel build script finished successfully!${NC}"
