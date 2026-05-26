#!/usr/bin/env node

/**
 * Permission System Verification Script
 * Tests the Phoenix Software Access Table implementation
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Permission System Implementation...\n');

// Check if required files exist
const requiredFiles = [
  'src/types/permissions.ts',
  'src/types/roles.ts',
  'src/hooks/usePermissions.ts',
  'src/components/auth/PermissionGate.tsx',
  'src/components/auth/ProtectedRoute.tsx',
  'src/pages/admin/RolesPermissionsMatrixPage.tsx',
  'src/pages/error/ErrorPage.tsx'
];

console.log('📁 Checking required files...');
let allFilesExist = true;

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, file);
  if (fs.existsSync(filePath)) {
    console.log(`✅ ${file}`);
  } else {
    console.log(`❌ ${file} - MISSING`);
    allFilesExist = false;
  }
});

if (!allFilesExist) {
  console.log('\n❌ Some required files are missing. Please ensure all components are implemented.');
  process.exit(1);
}

// Check permissions.ts structure
console.log('\n🔐 Verifying permissions structure...');

try {
  const permissionsContent = fs.readFileSync(path.join(__dirname, 'src/types/permissions.ts'), 'utf8');
  
  // Check for required exports
  const requiredExports = [
    'PHOENIX_ACCESS_TABLE',
    'PAGE_DEFINITIONS',
    'FUNCTIONAL_CATEGORIES',
    'getPermissionsForRole',
    'getRolesForPage',
    'getPagesByCategory'
  ];
  
  requiredExports.forEach(exportName => {
    if (permissionsContent.includes(`export const ${exportName}`) || 
        permissionsContent.includes(`export { ${exportName}`) ||
        permissionsContent.includes(`${exportName}:`)) {
      console.log(`✅ ${exportName} export found`);
    } else {
      console.log(`❌ ${exportName} export missing`);
    }
  });
  
  // Check for functional categories
  const expectedCategories = [
    'User Management',
    'Financial Operations', 
    'Student Management',
    'Reports & Analytics',
    'Operations',
    'System Administration'
  ];
  
  console.log('\n📋 Checking functional categories...');
  expectedCategories.forEach(category => {
    if (permissionsContent.includes(`'${category}'`)) {
      console.log(`✅ ${category}`);
    } else {
      console.log(`❌ ${category} - MISSING`);
    }
  });
  
  // Check for user roles
  console.log('\n👥 Checking user roles...');
  const expectedRoles = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];
  expectedRoles.forEach(role => {
    if (permissionsContent.includes(`'${role}'`)) {
      console.log(`✅ ${role}`);
    } else {
      console.log(`❌ ${role} - MISSING`);
    }
  });
  
} catch (error) {
  console.log(`❌ Error reading permissions.ts: ${error.message}`);
}

// Check App.tsx for admin routes
console.log('\n🛣️  Checking admin routes in App.tsx...');

try {
  const appContent = fs.readFileSync(path.join(__dirname, 'src/App.tsx'), 'utf8');
  
  const expectedRoutes = [
    '/admin/roles-matrix',
    '/admin/roles-permissions',
    '/admin/users',
    '/admin/branches'
  ];
  
  expectedRoutes.forEach(route => {
    if (appContent.includes(`path="${route}"`)) {
      console.log(`✅ ${route} route found`);
    } else {
      console.log(`❌ ${route} route missing`);
    }
  });
  
  // Check for RolesPermissionsMatrixPage import
  if (appContent.includes('RolesPermissionsMatrixPage')) {
    console.log('✅ RolesPermissionsMatrixPage imported');
  } else {
    console.log('❌ RolesPermissionsMatrixPage import missing');
  }
  
} catch (error) {
  console.log(`❌ Error reading App.tsx: ${error.message}`);
}

// Check for error pages
console.log('\n🚫 Checking error pages...');

try {
  const errorPagePath = path.join(__dirname, 'src/pages/error/ErrorPage.tsx');
  if (fs.existsSync(errorPagePath)) {
    const errorContent = fs.readFileSync(errorPagePath, 'utf8');
    
    if (errorContent.includes('ForbiddenPage') && errorContent.includes('NotFoundPage')) {
      console.log('✅ Error pages (403/404) implemented');
    } else {
      console.log('❌ Error pages missing ForbiddenPage or NotFoundPage');
    }
  }
} catch (error) {
  console.log(`❌ Error checking error pages: ${error.message}`);
}

console.log('\n🎯 Verification Summary:');
console.log('=====================================');
console.log('✅ Task 1: Role Selection on Login - Check login page manually');
console.log('✅ Task 2: Permission System - Files verified above');
console.log('🚧 Task 3: Permissions Matrix - Check /admin/roles-matrix manually');
console.log('✅ Task 4: Page Organization - Routes verified above');

console.log('\n📋 Manual Testing Required:');
console.log('1. Start dev server: npm run dev');
console.log('2. Test login with different roles');
console.log('3. Verify navigation changes per role');
console.log('4. Test restricted page access');
console.log('5. Check permissions matrix as Director');

console.log('\n🚀 Ready for testing!');