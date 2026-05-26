#!/usr/bin/env node

/**
 * Comprehensive test runner for the procurement system
 * This script runs unit tests, integration tests, and e2e tests
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSection(title) {
  log(`\n${'='.repeat(60)}`, colors.cyan);
  log(`${title}`, colors.cyan + colors.bright);
  log(`${'='.repeat(60)}`, colors.cyan);
}

function logSubsection(title) {
  log(`\n${'-'.repeat(40)}`, colors.blue);
  log(`${title}`, colors.blue + colors.bright);
  log(`${'-'.repeat(40)}`, colors.blue);
}

function runCommand(command, description) {
  log(`\n🚀 ${description}...`, colors.yellow);
  try {
    execSync(command, { stdio: 'inherit', cwd: process.cwd() });
    log(`✅ ${description} completed successfully`, colors.green);
    return true;
  } catch (error) {
    log(`❌ ${description} failed`, colors.red);
    log(`Error: ${error.message}`, colors.red);
    return false;
  }
}

function checkFileExists(filePath) {
  return fs.existsSync(path.resolve(filePath));
}

function main() {
  log('🧪 Procurement System Test Suite', colors.magenta + colors.bright);
  log('Running comprehensive tests for the procurement system\n', colors.magenta);

  const results = {
    unit: false,
    integration: false,
    e2e: false,
    coverage: false,
  };

  // Check if test files exist
  logSection('Pre-flight Checks');
  
  const testFiles = [
    'src/services/__tests__/procurementService.test.ts',
    'src/hooks/__tests__/useProcurement.test.tsx',
    'src/pages/procurement/__tests__/PurchaseOrderListPage.test.tsx',
    'src/pages/procurement/__tests__/PurchaseOrderFormPage.test.tsx',
    'src/__tests__/integration/procurementWorkflow.test.tsx',
    'cypress/e2e/procurement.cy.ts',
  ];

  let allTestFilesExist = true;
  testFiles.forEach(file => {
    if (checkFileExists(file)) {
      log(`✅ ${file}`, colors.green);
    } else {
      log(`❌ ${file} - Missing`, colors.red);
      allTestFilesExist = false;
    }
  });

  if (!allTestFilesExist) {
    log('\n❌ Some test files are missing. Please ensure all test files are created.', colors.red);
    process.exit(1);
  }

  // Run Unit Tests
  logSection('Unit Tests');
  logSubsection('Service Layer Tests');
  results.unit = runCommand(
    'npm run test -- --run src/services/__tests__/procurementService.test.ts',
    'Running procurement service tests'
  );

  logSubsection('Hook Tests');
  const hookTestResult = runCommand(
    'npm run test -- --run src/hooks/__tests__/useProcurement.test.tsx',
    'Running procurement hook tests'
  );
  results.unit = results.unit && hookTestResult;

  logSubsection('Component Tests');
  const componentTestResult = runCommand(
    'npm run test -- --run "src/pages/procurement/__tests__/*.test.tsx"',
    'Running procurement component tests'
  );
  results.unit = results.unit && componentTestResult;

  // Run Integration Tests
  logSection('Integration Tests');
  results.integration = runCommand(
    'npm run test -- --run src/__tests__/integration/procurementWorkflow.test.tsx',
    'Running procurement workflow integration tests'
  );

  // Generate Test Coverage
  logSection('Test Coverage');
  results.coverage = runCommand(
    'npm run test:coverage -- --run src/services/__tests__/ src/hooks/__tests__/ src/pages/procurement/__tests__/ src/__tests__/integration/',
    'Generating test coverage report'
  );

  // Run E2E Tests (optional, requires Cypress setup)
  logSection('End-to-End Tests');
  log('🔍 Checking if Cypress is available...', colors.yellow);
  
  try {
    execSync('npx cypress version', { stdio: 'pipe' });
    log('✅ Cypress is available', colors.green);
    
    // Check if we should run headless or not
    const isCI = process.env.CI === 'true';
    const cypressCommand = isCI 
      ? 'npm run cypress:run -- --spec "cypress/e2e/procurement.cy.ts"'
      : 'npm run cypress:run -- --spec "cypress/e2e/procurement.cy.ts" --headed';
    
    results.e2e = runCommand(
      cypressCommand,
      'Running procurement E2E tests'
    );
  } catch (error) {
    log('⚠️  Cypress not available or not configured. Skipping E2E tests.', colors.yellow);
    log('To run E2E tests, ensure Cypress is properly installed and configured.', colors.yellow);
    results.e2e = null; // null means skipped
  }

  // Test Results Summary
  logSection('Test Results Summary');
  
  const testResults = [
    { name: 'Unit Tests', result: results.unit },
    { name: 'Integration Tests', result: results.integration },
    { name: 'Test Coverage', result: results.coverage },
    { name: 'E2E Tests', result: results.e2e },
  ];

  testResults.forEach(({ name, result }) => {
    if (result === true) {
      log(`✅ ${name}: PASSED`, colors.green);
    } else if (result === false) {
      log(`❌ ${name}: FAILED`, colors.red);
    } else if (result === null) {
      log(`⚠️  ${name}: SKIPPED`, colors.yellow);
    }
  });

  // Overall result
  const failedTests = testResults.filter(t => t.result === false);
  const passedTests = testResults.filter(t => t.result === true);
  const skippedTests = testResults.filter(t => t.result === null);

  log('\n' + '='.repeat(60), colors.cyan);
  
  if (failedTests.length === 0) {
    log('🎉 ALL TESTS PASSED!', colors.green + colors.bright);
    log(`✅ ${passedTests.length} test suite(s) passed`, colors.green);
    if (skippedTests.length > 0) {
      log(`⚠️  ${skippedTests.length} test suite(s) skipped`, colors.yellow);
    }
  } else {
    log('❌ SOME TESTS FAILED', colors.red + colors.bright);
    log(`❌ ${failedTests.length} test suite(s) failed`, colors.red);
    log(`✅ ${passedTests.length} test suite(s) passed`, colors.green);
    if (skippedTests.length > 0) {
      log(`⚠️  ${skippedTests.length} test suite(s) skipped`, colors.yellow);
    }
  }

  log('='.repeat(60), colors.cyan);

  // Exit with appropriate code
  process.exit(failedTests.length > 0 ? 1 : 0);
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  log('Procurement System Test Runner', colors.magenta + colors.bright);
  log('\nUsage: node scripts/test-procurement.js [options]', colors.cyan);
  log('\nOptions:', colors.cyan);
  log('  --help, -h    Show this help message', colors.blue);
  log('\nThis script runs:', colors.cyan);
  log('  • Unit tests for services, hooks, and components', colors.blue);
  log('  • Integration tests for procurement workflows', colors.blue);
  log('  • Test coverage analysis', colors.blue);
  log('  • End-to-end tests (if Cypress is available)', colors.blue);
  process.exit(0);
}

// Run the main function
main();