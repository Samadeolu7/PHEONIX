/**
 * Quick Entitlement Flow Test Script
 * Run this in the browser console to test basic functionality
 */

// Test Configuration
const TEST_CONFIG = {
  baseUrl: 'http://localhost:3000',
  testData: {
    clientId: 1,
    invoiceId: 1,
    feeStructureId: 1,
    totalAmount: '250000.00',
    minimumRequired: '125000.00'
  }
};

// Test Results Storage
const testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

// Helper Functions
function logTest(testName, passed, message = '') {
  const result = passed ? '✅ PASS' : '❌ FAIL';
  const fullMessage = `${result}: ${testName}${message ? ' - ' + message : ''}`;
  console.log(fullMessage);
  
  testResults.tests.push({
    name: testName,
    passed,
    message
  });
  
  if (passed) {
    testResults.passed++;
  } else {
    testResults.failed++;
  }
}

function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }
    
    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Functions
async function testPageNavigation() {
  console.log('\n🧪 Testing Page Navigation...');
  
  try {
    // Test entitlements list page
    window.location.href = `${TEST_CONFIG.baseUrl}/incomes/entitlements`;
    await delay(2000);
    
    const pageTitle = document.querySelector('h1');
    logTest('Entitlements List Page Loads', 
      pageTitle && pageTitle.textContent.includes('Fee Entitlements'));
    
    const createButton = document.querySelector('button:contains("Create New Entitlement")') || 
                        Array.from(document.querySelectorAll('button')).find(btn => 
                          btn.textContent.includes('Create New Entitlement'));
    logTest('Create Button Present', !!createButton);
    
    const table = document.querySelector('table');
    logTest('Entitlements Table Present', !!table);
    
  } catch (error) {
    logTest('Page Navigation', false, error.message);
  }
}

async function testCreateEntitlementPage() {
  console.log('\n🧪 Testing Create Entitlement Page...');
  
  try {
    window.location.href = `${TEST_CONFIG.baseUrl}/incomes/entitlements/create`;
    await delay(2000);
    
    const pageTitle = document.querySelector('h1');
    logTest('Create Page Loads', 
      pageTitle && pageTitle.textContent.includes('Create New Entitlement'));
    
    const clientInput = document.querySelector('input[type="number"]');
    logTest('Client Input Present', !!clientInput);
    
    const submitButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Create Entitlement'));
    logTest('Submit Button Present', !!submitButton);
    
  } catch (error) {
    logTest('Create Entitlement Page', false, error.message);
  }
}

async function testFormValidation() {
  console.log('\n🧪 Testing Form Validation...');
  
  try {
    // Ensure we're on the create page
    if (!window.location.href.includes('/create')) {
      window.location.href = `${TEST_CONFIG.baseUrl}/incomes/entitlements/create`;
      await delay(2000);
    }
    
    const submitButton = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Create Entitlement'));
    
    if (submitButton) {
      // Try submitting empty form
      submitButton.click();
      await delay(1000);
      
      // Check if validation prevents submission
      const stillOnCreatePage = window.location.href.includes('/create');
      logTest('Form Validation Prevents Empty Submission', stillOnCreatePage);
    }
    
  } catch (error) {
    logTest('Form Validation', false, error.message);
  }
}

async function testResponsiveDesign() {
  console.log('\n🧪 Testing Responsive Design...');
  
  try {
    // Test mobile viewport
    const originalWidth = window.innerWidth;
    
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 375
    });
    
    window.dispatchEvent(new Event('resize'));
    await delay(500);
    
    const mobileElements = document.querySelectorAll('.sm\\:hidden, .md\\:hidden, .lg\\:hidden');
    logTest('Responsive Classes Present', mobileElements.length > 0);
    
    // Restore original width
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalWidth
    });
    
    window.dispatchEvent(new Event('resize'));
    
  } catch (error) {
    logTest('Responsive Design', false, error.message);
  }
}

async function testAccessibility() {
  console.log('\n🧪 Testing Accessibility...');
  
  try {
    // Check for ARIA labels
    const ariaElements = document.querySelectorAll('[aria-label], [aria-labelledby], [role]');
    logTest('ARIA Attributes Present', ariaElements.length > 0);
    
    // Check for alt text on images
    const images = document.querySelectorAll('img');
    const imagesWithAlt = Array.from(images).filter(img => img.alt);
    logTest('Images Have Alt Text', images.length === 0 || imagesWithAlt.length === images.length);
    
    // Check for keyboard navigation
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    logTest('Focusable Elements Present', focusableElements.length > 0);
    
  } catch (error) {
    logTest('Accessibility', false, error.message);
  }
}

async function testErrorHandling() {
  console.log('\n🧪 Testing Error Handling...');
  
  try {
    // Test with invalid route
    const originalLocation = window.location.href;
    window.location.href = `${TEST_CONFIG.baseUrl}/incomes/entitlements/999999/view`;
    await delay(3000);
    
    // Check if error is handled gracefully
    const errorMessage = document.querySelector('.text-red-500, .bg-red-50, [class*="error"]');
    const notFoundMessage = document.body.textContent.includes('not found') || 
                           document.body.textContent.includes('404');
    
    logTest('Error Handling for Invalid Routes', errorMessage || notFoundMessage);
    
    // Return to original location
    window.location.href = originalLocation;
    await delay(2000);
    
  } catch (error) {
    logTest('Error Handling', false, error.message);
  }
}

// Main Test Runner
async function runEntitlementTests() {
  console.log('🚀 Starting Entitlement Flow Tests...\n');
  console.log('Make sure you have:');
  console.log('- Frontend running on http://localhost:3000');
  console.log('- Backend API running');
  console.log('- Valid authentication token');
  console.log('- Test data (clients, invoices, fee structures)\n');
  
  testResults.passed = 0;
  testResults.failed = 0;
  testResults.tests = [];
  
  try {
    await testPageNavigation();
    await testCreateEntitlementPage();
    await testFormValidation();
    await testResponsiveDesign();
    await testAccessibility();
    await testErrorHandling();
    
  } catch (error) {
    console.error('Test runner error:', error);
  }
  
  // Print Results
  console.log('\n📊 Test Results Summary:');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📈 Success Rate: ${((testResults.passed / (testResults.passed + testResults.failed)) * 100).toFixed(1)}%`);
  
  if (testResults.failed > 0) {
    console.log('\n❌ Failed Tests:');
    testResults.tests.filter(test => !test.passed).forEach(test => {
      console.log(`  - ${test.name}: ${test.message}`);
    });
  }
  
  console.log('\n✨ Testing Complete!');
  
  return testResults;
}

// Auto-run if script is executed directly
if (typeof window !== 'undefined') {
  console.log('Entitlement Flow Test Script Loaded!');
  console.log('Run runEntitlementTests() to start testing.');
  
  // Make functions available globally
  window.runEntitlementTests = runEntitlementTests;
  window.testEntitlementFlow = {
    runAll: runEntitlementTests,
    testPageNavigation,
    testCreateEntitlementPage,
    testFormValidation,
    testResponsiveDesign,
    testAccessibility,
    testErrorHandling
  };
}

// Export for Node.js if needed
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    runEntitlementTests,
    testPageNavigation,
    testCreateEntitlementPage,
    testFormValidation,
    testResponsiveDesign,
    testAccessibility,
    testErrorHandling
  };
}