# Enhanced Form Validation System

The Enhanced Form Validation System provides submission-type-aware validation for the dual requisition workflow, supporting draft, manual approval, and automated workflow submissions with different validation requirements.

## Overview

This system extends the existing validation utilities to support three different submission types:

- **Draft**: Minimal validation - allows saving incomplete forms
- **Manual**: Standard validation - requires all basic fields for manual approval workflow
- **Workflow**: Enhanced validation - requires additional details for automated workflow processing

## Core Components

### 1. EnhancedFormValidator Class

The main validation class that provides static methods for form validation.

```typescript
import { EnhancedFormValidator, RequisitionFormData, SubmissionType } from '../utils/EnhancedFormValidator';

// Validate for specific submission type
const result = EnhancedFormValidator.validateForSubmission(formData, 'workflow');

// Get complete validation state
const state = EnhancedFormValidator.validateFormState(formData);

// Check workflow-specific requirements
const workflowResult = EnhancedFormValidator.validateWorkflowRequirements(formData);
```

### 2. useEnhancedFormValidation Hook

React hook that provides real-time validation with submission-type awareness.

```typescript
import { useEnhancedFormValidation } from '../hooks/useEnhancedFormValidation';

const validation = useEnhancedFormValidation(formData, {
  validateOnChange: true,
  validateOnBlur: true,
  debounceMs: 300,
});

// Get validation state for specific submission type
const draftState = validation.getSubmissionButtonState('draft');
const manualState = validation.getSubmissionButtonState('manual');
const workflowState = validation.getSubmissionButtonState('workflow');
```

## Validation Rules by Submission Type

### Draft Submission
- **Purpose**: Allow users to save incomplete forms
- **Requirements**: Minimal - only requires at least one item
- **Use Case**: Work in progress, partial completion

### Manual Submission
- **Purpose**: Traditional approval workflow
- **Requirements**: All basic fields must be complete
- **Validation Rules**:
  - Department is required
  - Title is required
  - Justification is required (minimum 10 characters)
  - At least one item is required
  - Each item must have: item_id, quantity > 0, estimated_cost ≥ 0, specification, justification

### Workflow Submission
- **Purpose**: Automated workflow processing
- **Requirements**: Enhanced validation for workflow compatibility
- **Additional Rules**:
  - Justification must be at least 20 characters (more detailed)
  - Expected delivery date is recommended
  - Item specifications must be at least 5 characters
  - Item justifications must be at least 5 characters

## Usage Examples

### Basic Form Validation

```typescript
import { EnhancedFormValidator } from '../utils/EnhancedFormValidator';

const formData = {
  department_id: 'IT Department',
  title: 'Office Equipment',
  justification: 'Need new laptops for development team',
  // ... other fields
};

// Check if form can be submitted for manual approval
const manualResult = EnhancedFormValidator.validateForSubmission(formData, 'manual');
if (manualResult.canSubmitForApproval) {
  // Form is valid for manual submission
  submitForApproval(formData);
} else {
  // Show validation errors
  console.log('Validation errors:', manualResult.errors);
}
```

### React Hook Usage

```typescript
import React, { useState } from 'react';
import { useEnhancedFormValidation } from '../hooks/useEnhancedFormValidation';

const RequisitionForm = () => {
  const [formData, setFormData] = useState(initialFormData);
  
  const validation = useEnhancedFormValidation(formData, {
    validateOnChange: true,
    validateOnBlur: true,
  });

  const handleSubmit = (submissionType) => {
    const result = validation.validateForSubmission(submissionType);
    if (result.isValid) {
      // Submit form
      submitForm(formData, submissionType);
    } else {
      // Show errors
      showErrors(result.errors);
    }
  };

  const getFieldValidation = (fieldName) => {
    return validation.getFieldValidation(fieldName);
  };

  return (
    <form>
      <input
        value={formData.department_id}
        onChange={(e) => setFormData({...formData, department_id: e.target.value})}
        onBlur={() => validation.handleFieldBlur('department_id')}
        style={{
          borderColor: getFieldValidation('department_id').showError ? 'red' : 'gray'
        }}
      />
      {getFieldValidation('department_id').showError && (
        <span>{getFieldValidation('department_id').errorMessage}</span>
      )}
      
      {/* Action buttons with dynamic states */}
      <button
        onClick={() => handleSubmit('draft')}
        disabled={validation.getSubmissionButtonState('draft').disabled}
      >
        Save as Draft
      </button>
      
      <button
        onClick={() => handleSubmit('manual')}
        disabled={validation.getSubmissionButtonState('manual').disabled}
      >
        Submit for Approval
      </button>
      
      <button
        onClick={() => handleSubmit('workflow')}
        disabled={validation.getSubmissionButtonState('workflow').disabled}
      >
        Create with Workflow
      </button>
    </form>
  );
};
```

### Field-Level Validation

```typescript
import { useEnhancedFieldValidation } from '../hooks/useEnhancedFormValidation';

const JustificationField = ({ formData, submissionType }) => {
  const fieldValidation = useEnhancedFieldValidation(
    'justification',
    formData,
    submissionType
  );

  return (
    <div>
      <textarea
        value={formData.justification}
        onChange={handleChange}
        onBlur={fieldValidation.handleBlur}
        style={{
          borderColor: fieldValidation.showError ? 'red' : 'gray'
        }}
      />
      {fieldValidation.showError && (
        <span>{fieldValidation.errorMessage}</span>
      )}
      <small>
        {formData.justification.length} characters
        {submissionType === 'workflow' && ' (minimum 20 required)'}
      </small>
    </div>
  );
};
```

## API Reference

### EnhancedFormValidator Methods

#### `validateForSubmission(formData, submissionType)`
Validates form data for a specific submission type.

**Parameters:**
- `formData: RequisitionFormData` - The form data to validate
- `submissionType: 'draft' | 'manual' | 'workflow'` - The submission type

**Returns:** `EnhancedValidationResult`
```typescript
{
  isValid: boolean;
  errors: string[];
  canSubmitAsDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
  submissionTypeErrors: {
    draft: string[];
    manual: string[];
    workflow: string[];
  };
}
```

#### `validateFormState(formData)`
Returns complete validation state for all submission types.

#### `validateWorkflowRequirements(formData)`
Validates workflow-specific requirements.

#### `getSubmissionValidationMessage(submissionType, validationState)`
Gets user-friendly validation message for a submission type.

### useEnhancedFormValidation Hook

#### Options
```typescript
{
  validateOnChange?: boolean; // Default: true
  validateOnBlur?: boolean;   // Default: true
  debounceMs?: number;        // Default: 300
  initialSubmissionType?: SubmissionType; // Default: 'manual'
}
```

#### Return Value
```typescript
{
  validationState: ValidationState;
  validateForSubmission: (submissionType) => EnhancedValidationResult;
  getSubmissionButtonState: (submissionType) => ButtonState;
  getFieldValidation: (fieldName, submissionType?) => FieldValidation;
  markFieldTouched: (fieldName) => void;
  handleFieldBlur: (fieldName) => void;
  handleFieldChange: (fieldName) => void;
  resetValidation: () => void;
  // ... other helper methods
}
```

## Integration with Existing System

The enhanced validation system is designed to work alongside the existing validation utilities:

1. **Backward Compatibility**: Existing forms continue to work without changes
2. **Incremental Adoption**: Can be adopted gradually, form by form
3. **Consistent API**: Uses similar patterns to existing validation hooks
4. **Performance**: Optimized with debouncing and memoization

## Best Practices

1. **Use Appropriate Submission Types**: Choose the right validation level for your use case
2. **Provide Clear Feedback**: Show users which submission types are available
3. **Progressive Enhancement**: Start with basic validation, add workflow validation as needed
4. **Error Handling**: Provide specific, actionable error messages
5. **Performance**: Use debouncing for real-time validation to avoid excessive API calls

## Testing

The system includes comprehensive tests covering:

- Unit tests for validation logic
- Integration tests with existing validation system
- Hook tests for React integration
- Performance tests for large forms
- Edge case handling

Run tests with:
```bash
npm test -- Enhanced --run
```

## Migration Guide

To migrate existing forms to use enhanced validation:

1. **Install Dependencies**: No additional dependencies required
2. **Update Imports**: Import the new validation utilities
3. **Replace Validation Logic**: Replace existing validation with enhanced version
4. **Update UI**: Add submission type selection and button states
5. **Test**: Verify all submission types work correctly

Example migration:

```typescript
// Before
import { useFormValidation } from '../hooks/useFormValidation';
const { isValid, errors } = useFormValidation(schema, formData);

// After
import { useEnhancedFormValidation } from '../hooks/useEnhancedFormValidation';
const validation = useEnhancedFormValidation(formData);
const { isValid, errors } = validation.validationState;
```

## Troubleshooting

### Common Issues

1. **Memory Leaks**: Ensure proper cleanup of debounce timers
2. **Performance**: Use `validateOnChange: false` for large forms
3. **Validation Not Updating**: Check that form data reference is changing
4. **Incorrect Validation**: Verify submission type matches intended workflow

### Debug Information

Enable debug mode to see detailed validation information:

```typescript
const validation = useEnhancedFormValidation(formData, { 
  validateOnChange: true 
});

// Log validation state
console.log('Validation State:', validation.validationState);
console.log('Touched Fields:', validation.touchedFields);
```