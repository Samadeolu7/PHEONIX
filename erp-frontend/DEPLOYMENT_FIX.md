# Frontend Deployment - React PureComponent Fix

## Problem Summary
The error "Cannot read properties of undefined (reading 'PureComponent')" was caused by:
1. Circular chunk dependencies in Vite build configuration
2. Multiple React versions in dependency tree
3. Old vite.config.js files being copied into Docker builds

## Solution Applied

### Files Created/Modified:

1. **`.dockerignore`** - Excludes old config files from Docker builds
   - Explicitly excludes `vite.config.js` and `vite.config.d.ts`
   - Ensures only `vite.config.ts` is used

2. **`vite.config.ts`** - Simplified configuration
   - Set `manualChunks: undefined` to avoid circular dependencies
   - Added React deduplication in `resolve.dedupe`

3. **`package.json`** - Added React overrides
   ```json
   "overrides": {
     "react": "^18.3.1",
     "react-dom": "^18.3.1"
   }
   ```

4. **`package-lock.json`** - Regenerated with overrides
   - Ensures all dependencies use React 18.3.1
   - No duplicate React installations

## Deployment Steps

### On Your Windows Development Machine:

```powershell
cd erp-frontend

# 1. Verify only vite.config.ts exists
Get-ChildItem vite.config.*

# 2. Commit the changes
git add .dockerignore vite.config.ts package.json package-lock.json deploy.sh
git commit -m "Fix: Resolve React PureComponent undefined error in production builds"
git push origin main
```

### On Your Linux Server:

```bash
# Navigate to your project
cd /opt/phoenix-erp

# Pull latest changes
git pull origin main

# Navigate to frontend
cd erp-frontend

# CRITICAL: Remove old config files if they exist
rm -f vite.config.js vite.config.d.ts

# Verify only vite.config.ts exists
ls -la vite.config.*
# Should only show: vite.config.ts

# Optional: Run the deployment script for verification
# chmod +x deploy.sh
# ./deploy.sh

# Build Docker image with NO CACHE
cd /opt/phoenix-erp
docker-compose -f docker-compose.production.yml build --no-cache frontend

# Restart the container
docker-compose -f docker-compose.production.yml up -d frontend

# Check logs for any errors
docker-compose -f docker-compose.production.yml logs frontend --tail=50
```

## Verification

After deployment, open your application in a browser and check the console:

### Expected Results:
- ✅ No "Cannot read properties of undefined (reading 'PureComponent')" errors
- ✅ No "Circular chunk: vendor" warnings during build
- ✅ Application loads and renders correctly
- ✅ Charts and recharts components work properly

### If Issues Persist:

1. **Check for old config files on server:**
   ```bash
   cd /opt/phoenix-erp/erp-frontend
   ls -la vite.config.*
   # MUST only show vite.config.ts
   ```

2. **Verify Docker build context:**
   ```bash
   # The build should explicitly state it's excluding old config files
   docker-compose -f docker-compose.production.yml build frontend 2>&1 | grep -i exclude
   ```

3. **Check React versions in built image:**
   ```bash
   docker run --rm phoenix_erp_frontend:latest sh -c "cd /app && npm ls react react-dom"
   # Should show only version 18.3.1
   ```

## Technical Details

### Why This Fix Works:

1. **`.dockerignore`**: Prevents Docker from copying stale config files that override the correct settings

2. **`manualChunks: undefined`**: Lets Vite automatically optimize chunk splitting instead of using custom logic that created circular dependencies

3. **React Overrides**: Forces all nested dependencies to use the same React version, preventing the "PureComponent" undefined error that occurs when multiple React instances exist

4. **Regenerated package-lock.json**: Locks the dependency tree with overrides applied, ensuring consistent builds across environments

### Root Cause:
The error occurred because:
- Recharts expected `React.PureComponent` to be available
- Multiple React instances were loaded due to circular chunk splitting
- The second React instance was not fully initialized when accessed
- Result: `React.PureComponent` was `undefined`

## Files to Track in Git:

✅ Commit these files:
- `.dockerignore`
- `vite.config.ts`
- `package.json`
- `package-lock.json`
- `deploy.sh` (optional helper script)

❌ Never commit:
- `vite.config.js` (if it exists, delete it)
- `vite.config.d.ts` (if it exists, delete it)
- `node_modules/`
- `dist/`

## Quick Reference

**Local build test:**
```powershell
npm run build
# Look for: ✓ built in XX.XXs
# Should NOT show: "Circular chunk: vendor"
```

**Docker build:**
```bash
docker-compose -f docker-compose.production.yml build --no-cache frontend
# Should complete without errors
```

**Deploy:**
```bash
docker-compose -f docker-compose.production.yml up -d frontend
```
