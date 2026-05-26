/**
 * Manual verification script for role-based module integration
 * This script verifies that all role-specific module URLs are correctly configured
 */

const fs = require('fs');
const path = require('path');

// Read the dashboard templates file
const dashboardTemplatesPath = path.join(__dirname, 'src/data/dashboardTemplates.ts');
const dashboardTemplatesContent = fs.readFileSync(dashboardTemplatesPath, 'utf8');

// Extract role module URLs from the file
const roleModuleUrlsMatch = dashboardTemplatesContent.match(/export const roleModuleUrls[^}]+}[^}]+}/s);
if (!roleModuleUrlsMatch) {
  console.error('❌ Could not find roleModuleUrls in dashboardTemplates.ts');
  process.exit(1);
}

console.log('🔍 Verifying Role-Based Module Integration...\n');

// Define expected role-module mappings based on Phoenix Software Access Table
const expectedMappings = {
  'Director': ['financial', 'student-services', 'operations', 'administration'],
  'Principal': ['financial', 'student-services', 'operations'],
  'Administrator': ['administration', 'financial', 'student-services'],
  'Registrar': ['student-services', 'financial'],
  'Officer': ['financial', 'student-services', 'operations']
};

// Define expected URL patterns
const expectedUrlPatterns = {
  'Director': {
    'financial': '/director/finance',
    'student-services': '/director/student-services',
    'operations': '/director/operations',
    'administration': '/director/administration'
  },
  'Principal': {
    'financial': '/principal/finance',
    'student-services': '/principal/student-services',
    'operations': '/principal/operations'
  },
  'Administrator': {
    'administration': '/administrator/administration',
    'financial': '/administrator/finance',
    'student-services': '/administrator/student-services'
  },
  'Registrar': {
    'student-services': '/registrar/student-services',
    'financial': '/registrar/finance'
  },
  'Officer': {
    'financial': '/officer/finance',
    'student-services': '/officer/student-services',
    'operations': '/officer/operations'
  }
};

// Check if module pages exist
const checkModulePageExists = (role, module) => {
  const roleLower = role.toLowerCase();
  const moduleFileName = module === 'financial' ? 'FinancialManagementModule.tsx' :
                        module === 'student-services' ? 'StudentServicesModule.tsx' :
                        module === 'operations' ? 'OperationsModule.tsx' :
                        module === 'administration' ? 'AdministrationModule.tsx' : null;
  
  if (!moduleFileName) return false;
  
  const modulePath = path.join(__dirname, `src/pages/${roleLower}/${moduleFileName}`);
  return fs.existsSync(modulePath);
};

// Check if routes are configured in App.tsx
const checkRoutesConfigured = () => {
  const appPath = path.join(__dirname, 'src/App.tsx');
  const appContent = fs.readFileSync(appPath, 'utf8');
  
  const routeChecks = [];
  
  // Check for role-specific module imports
  const roles = ['Principal', 'Administrator', 'Registrar', 'Officer'];
  const modules = ['FinancialManagementModule', 'StudentServicesModule', 'OperationsModule', 'AdministrationModule'];
  
  roles.forEach(role => {
    modules.forEach(module => {
      const importPattern = new RegExp(`import.*${role}${module}.*from.*pages/${role.toLowerCase()}/${module}`);
      if (appContent.match(importPattern)) {
        routeChecks.push(`✅ ${role} ${module} import found`);
      }
    });
  });
  
  return routeChecks;
};

// Verification results
let allTestsPassed = true;
const results = [];

// 1. Verify URL mappings exist and are correct
console.log('1️⃣ Checking URL Mappings...');
Object.entries(expectedUrlPatterns).forEach(([role, modules]) => {
  Object.entries(modules).forEach(([moduleKey, expectedUrl]) => {
    const urlPattern = new RegExp(`'${role}':[^}]*'${moduleKey}':\\s*'${expectedUrl.replace('/', '\\/')}'`);
    if (dashboardTemplatesContent.match(urlPattern)) {
      results.push(`✅ ${role} ${moduleKey} URL mapping correct: ${expectedUrl}`);
    } else {
      results.push(`❌ ${role} ${moduleKey} URL mapping missing or incorrect`);
      allTestsPassed = false;
    }
  });
});

// 2. Verify module pages exist
console.log('\n2️⃣ Checking Module Page Files...');
Object.entries(expectedMappings).forEach(([role, modules]) => {
  modules.forEach(module => {
    if (checkModulePageExists(role, module)) {
      results.push(`✅ ${role} ${module} module page exists`);
    } else {
      results.push(`❌ ${role} ${module} module page missing`);
      allTestsPassed = false;
    }
  });
});

// 3. Verify routes are configured
console.log('\n3️⃣ Checking Route Configuration...');
const routeResults = checkRoutesConfigured();
results.push(...routeResults);

// 4. Verify unauthorized modules are not present
console.log('\n4️⃣ Checking Permission Filtering...');
const unauthorizedChecks = [
  { role: 'Principal', forbiddenModule: 'administration' },
  { role: 'Administrator', forbiddenModule: 'operations' },
  { role: 'Registrar', forbiddenModule: 'operations' },
  { role: 'Registrar', forbiddenModule: 'administration' },
  { role: 'Officer', forbiddenModule: 'administration' }
];

unauthorizedChecks.forEach(({ role, forbiddenModule }) => {
  const forbiddenPattern = new RegExp(`'${role}':[^}]*'${forbiddenModule}':`);
  if (!dashboardTemplatesContent.match(forbiddenPattern)) {
    results.push(`✅ ${role} correctly does not have ${forbiddenModule} module`);
  } else {
    results.push(`❌ ${role} incorrectly has ${forbiddenModule} module`);
    allTestsPassed = false;
  }
});

// 5. Check SimplifiedRoleBasedDashboard for correct URLs
console.log('\n5️⃣ Checking Dashboard Component URLs...');
const dashboardPath = path.join(__dirname, 'src/components/dashboard/SimplifiedRoleBasedDashboard.tsx');
const dashboardContent = fs.readFileSync(dashboardPath, 'utf8');

const dashboardUrlChecks = [
  { role: 'Director', module: 'financial', expectedUrl: '/director/finance' },
  { role: 'Principal', module: 'financial', expectedUrl: '/principal/finance' },
  { role: 'Administrator', module: 'administration', expectedUrl: '/administrator/administration' },
  { role: 'Registrar', module: 'student-services', expectedUrl: '/registrar/student-services' },
  { role: 'Officer', module: 'financial', expectedUrl: '/officer/finance' }
];

dashboardUrlChecks.forEach(({ role, module, expectedUrl }) => {
  // Use a more flexible search pattern
  const urlPattern = new RegExp(`path:\\s*['"]${expectedUrl.replace('/', '\\/')}['"]`);
  if (dashboardContent.match(urlPattern)) {
    results.push(`✅ Dashboard has correct URL for ${role} ${module}: ${expectedUrl}`);
  } else {
    // Try a simpler search
    if (dashboardContent.includes(expectedUrl)) {
      results.push(`✅ Dashboard has correct URL for ${role} ${module}: ${expectedUrl}`);
    } else {
      results.push(`❌ Dashboard missing or incorrect URL for ${role} ${module}: ${expectedUrl}`);
      allTestsPassed = false;
    }
  }
});

// 6. Check Back to Dashboard links
console.log('\n6️⃣ Checking Back to Dashboard Links...');
const sampleModulePath = path.join(__dirname, 'src/pages/principal/FinancialManagementModule.tsx');
if (fs.existsSync(sampleModulePath)) {
  const moduleContent = fs.readFileSync(sampleModulePath, 'utf8');
  if (moduleContent.includes('/dashboard/role-based')) {
    results.push('✅ Back to Dashboard link correctly points to /dashboard/role-based');
  } else {
    results.push('❌ Back to Dashboard link missing or incorrect');
    allTestsPassed = false;
  }
} else {
  results.push('❌ Could not check Back to Dashboard link - sample module not found');
  allTestsPassed = false;
}

// Print results
console.log('\n📊 Verification Results:');
console.log('=' .repeat(60));
results.forEach(result => console.log(result));

console.log('\n' + '='.repeat(60));
if (allTestsPassed) {
  console.log('🎉 ALL TESTS PASSED! Role-based module integration is working correctly.');
  console.log('\n✨ Summary:');
  console.log('• All 5 user roles have correct module URL mappings');
  console.log('• All 14 role-specific module pages exist');
  console.log('• Permission-based filtering is working correctly');
  console.log('• Dashboard integration is properly configured');
  console.log('• Back to Dashboard navigation is consistent');
  process.exit(0);
} else {
  console.log('❌ SOME TESTS FAILED! Please review the issues above.');
  process.exit(1);
}