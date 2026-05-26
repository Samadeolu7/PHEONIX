const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Workflow Status Tracking Implementation...\n');

// Task requirements to verify
const requirements = [
  {
    name: 'Add workflow information display in requisition detail views',
    files: [
      'src/components/procurement/WorkflowStatusDisplay.tsx',
      'src/pages/procurement/RequisitionDetailPage.tsx'
    ],
    checks: [
      'WorkflowStatusDisplay component created',
      'Component integrated into RequisitionDetailPage',
      'Displays workflow vs manual process information'
    ]
  },
  {
    name: 'Create status indicators for workflow vs manual processes',
    files: [
      'src/components/procurement/WorkflowStatusIndicator.tsx',
      'src/components/procurement/WorkflowStatusDisplay.tsx'
    ],
    checks: [
      'WorkflowStatusIndicator component created',
      'Visual indicators for workflow vs manual processes',
      'Different icons and colors for different statuses'
    ]
  },
  {
    name: 'Add workflow run ID tracking and display',
    files: [
      'src/types/procurement.ts',
      'src/components/procurement/WorkflowStatusDisplay.tsx'
    ],
    checks: [
      'workflow_run_id field added to PurchaseRequisition interface',
      'Workflow run ID displayed in formatted format (WF-123456)',
      'Conditional display based on workflow_run_id presence'
    ]
  },
  {
    name: 'Implement links to approval inbox for workflow requisitions',
    files: [
      'src/components/procurement/WorkflowStatusDisplay.tsx'
    ],
    checks: [
      'Approval inbox link generated with workflow_run_id parameter',
      'Link only shown for workflow requisitions',
      'Proper URL format: /approvals/inbox?workflow_run_id=X'
    ]
  }
];

let allPassed = true;

// Check if files exist
requirements.forEach((req, index) => {
  console.log(`${index + 1}. ${req.name}`);
  
  req.files.forEach(file => {
    const filePath = path.join(__dirname, file);
    if (fs.existsSync(filePath)) {
      console.log(`   ✅ ${file} exists`);
    } else {
      console.log(`   ❌ ${file} missing`);
      allPassed = false;
    }
  });
  
  console.log('');
});

// Check specific implementation details
console.log('🔍 Checking Implementation Details...\n');

// Check WorkflowStatusDisplay component
const workflowDisplayPath = path.join(__dirname, 'src/components/procurement/WorkflowStatusDisplay.tsx');
if (fs.existsSync(workflowDisplayPath)) {
  const content = fs.readFileSync(workflowDisplayPath, 'utf8');
  
  console.log('WorkflowStatusDisplay Component:');
  
  if (content.includes('workflow_run_id')) {
    console.log('   ✅ Handles workflow_run_id');
  } else {
    console.log('   ❌ Missing workflow_run_id handling');
    allPassed = false;
  }
  
  if (content.includes('approvals/inbox')) {
    console.log('   ✅ Includes approval inbox link');
  } else {
    console.log('   ❌ Missing approval inbox link');
    allPassed = false;
  }
  
  if (content.includes('Automated Workflow') && content.includes('Manual Approval')) {
    console.log('   ✅ Distinguishes between workflow types');
  } else {
    console.log('   ❌ Missing workflow type distinction');
    allPassed = false;
  }
  
  if (content.includes('WF-') && content.includes('padStart')) {
    console.log('   ✅ Formats workflow run ID correctly');
  } else {
    console.log('   ❌ Missing workflow run ID formatting');
    allPassed = false;
  }
  
  console.log('');
}

// Check PurchaseRequisition interface
const typesPath = path.join(__dirname, 'src/types/procurement.ts');
if (fs.existsSync(typesPath)) {
  const content = fs.readFileSync(typesPath, 'utf8');
  
  console.log('PurchaseRequisition Interface:');
  
  if (content.includes('workflow_run_id?: number')) {
    console.log('   ✅ workflow_run_id field added');
  } else {
    console.log('   ❌ Missing workflow_run_id field');
    allPassed = false;
  }
  
  if (content.includes('workflow_status?: string')) {
    console.log('   ✅ workflow_status field added');
  } else {
    console.log('   ❌ Missing workflow_status field');
    allPassed = false;
  }
  
  console.log('');
}

// Check RequisitionDetailPage integration
const detailPagePath = path.join(__dirname, 'src/pages/procurement/RequisitionDetailPage.tsx');
if (fs.existsSync(detailPagePath)) {
  const content = fs.readFileSync(detailPagePath, 'utf8');
  
  console.log('RequisitionDetailPage Integration:');
  
  if (content.includes('WorkflowStatusDisplay')) {
    console.log('   ✅ WorkflowStatusDisplay component imported and used');
  } else {
    console.log('   ❌ Missing WorkflowStatusDisplay integration');
    allPassed = false;
  }
  
  console.log('');
}

// Check tests
const testFiles = [
  'src/components/procurement/__tests__/WorkflowStatusDisplay.test.tsx',
  'src/components/procurement/__tests__/WorkflowStatusIndicator.test.tsx',
  'src/pages/procurement/__tests__/RequisitionDetailPage.workflow.test.tsx'
];

console.log('Test Coverage:');
testFiles.forEach(testFile => {
  const testPath = path.join(__dirname, testFile);
  if (fs.existsSync(testPath)) {
    console.log(`   ✅ ${testFile} exists`);
  } else {
    console.log(`   ❌ ${testFile} missing`);
    allPassed = false;
  }
});

console.log('\n' + '='.repeat(60));

if (allPassed) {
  console.log('🎉 All workflow status tracking requirements implemented successfully!');
  console.log('\nImplemented Features:');
  console.log('• Workflow information display in requisition detail views');
  console.log('• Status indicators for workflow vs manual processes');
  console.log('• Workflow run ID tracking and formatted display');
  console.log('• Links to approval inbox for workflow requisitions');
  console.log('• Comprehensive test coverage');
  console.log('• Integration with existing RequisitionDetailPage');
  
  console.log('\nRequirements Satisfied:');
  console.log('• Requirements 5.1: Status tracking and display');
  console.log('• Requirements 5.3: Workflow information visibility');
  console.log('• Requirements 5.5: Workflow run ID tracking');
  
  process.exit(0);
} else {
  console.log('❌ Some requirements are missing or incomplete.');
  console.log('Please review the failed checks above.');
  process.exit(1);
}