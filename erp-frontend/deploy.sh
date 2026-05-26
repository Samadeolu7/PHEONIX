#!/bin/bash
# Deployment script for Phoenix ERP Frontend
# This ensures a clean build without React duplication issues

set -e  # Exit on any error

echo "================================================"
echo "Phoenix ERP Frontend - Production Deployment"
echo "================================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Navigate to frontend directory
cd "$(dirname "$0")"

echo -e "\n${YELLOW}Step 1: Cleaning old artifacts${NC}"
echo "Removing: dist, node_modules/.vite, old config files"
rm -rf dist node_modules/.vite
rm -f vite.config.js vite.config.d.ts

echo -e "\n${YELLOW}Step 2: Verifying configuration${NC}"
if [ ! -f "vite.config.ts" ]; then
    echo -e "${RED}ERROR: vite.config.ts not found!${NC}"
    exit 1
fi

# Check for problematic config files
if [ -f "vite.config.js" ] || [ -f "vite.config.d.ts" ]; then
    echo -e "${RED}ERROR: Old config files found! Remove vite.config.js and vite.config.d.ts${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Only vite.config.ts exists (correct)${NC}"

echo -e "\n${YELLOW}Step 3: Checking package.json overrides${NC}"
if grep -q '"overrides"' package.json; then
    echo -e "${GREEN}✓ package.json has React overrides${NC}"
else
    echo -e "${RED}WARNING: package.json missing overrides section${NC}"
fi

echo -e "\n${YELLOW}Step 4: Regenerating package-lock.json${NC}"
echo "This ensures overrides are properly applied..."
rm -f package-lock.json
npm install --package-lock-only

echo -e "\n${YELLOW}Step 5: Clean dependency installation${NC}"
rm -rf node_modules
npm ci

echo -e "\n${YELLOW}Step 6: Verifying React deduplication${NC}"
REACT_VERSIONS=$(npm ls react --depth=0 2>&1 | grep -c "react@" || true)
if [ "$REACT_VERSIONS" -eq 1 ]; then
    echo -e "${GREEN}✓ Single React version detected${NC}"
    npm ls react react-dom --depth=0
else
    echo -e "${RED}WARNING: Multiple React versions may exist${NC}"
    npm ls react --depth=999 | grep "react@" || true
fi

echo -e "\n${YELLOW}Step 7: Building application${NC}"
npm run build 2>&1 | tee build.log

# Check for circular dependency warning
if grep -q "Circular chunk" build.log; then
    echo -e "${RED}ERROR: Circular dependency detected in build!${NC}"
    echo "Check build.log for details"
    exit 1
else
    echo -e "${GREEN}✓ No circular dependencies detected${NC}"
fi

rm -f build.log

echo -e "\n${YELLOW}Step 8: Verifying build output${NC}"
if [ ! -d "dist" ]; then
    echo -e "${RED}ERROR: dist directory not created!${NC}"
    exit 1
fi

DIST_SIZE=$(du -sh dist | cut -f1)
echo -e "${GREEN}✓ Build successful - dist size: ${DIST_SIZE}${NC}"

echo -e "\n${GREEN}================================================${NC}"
echo -e "${GREEN}Deployment preparation complete!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "1. Commit and push changes to your repository"
echo "2. On server, pull latest changes"
echo "3. Run: docker-compose -f docker-compose.production.yml build --no-cache frontend"
echo "4. Run: docker-compose -f docker-compose.production.yml up -d frontend"
echo ""
echo "Files to commit:"
echo "  - .dockerignore (excludes old config files)"
echo "  - vite.config.ts (simplified config)"
echo "  - package.json (with React overrides)"
echo "  - package-lock.json (regenerated with overrides)"
