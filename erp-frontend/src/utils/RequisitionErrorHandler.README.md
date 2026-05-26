# RequisitionErrorHandler

The `RequisitionErrorHandler` is a specialized error handling utility designed for the dual requisition workflow system. It provides workflow-specific error classification, user-friendly messaging, retry logic, and alternative submission method suggestions.

## Features

- **Workflow-Specific Error Classification**: Identifies and categorizes errors specific to draft, manual, and workflow submission types
- **User-Friendly Messages**: Provides contextual, actionable error messages for each submission type
- **Alternative Suggestions**: Suggests alternative submission methods when one fails (e.g., manual approval when workflow fails)
- **Retry Logic**: Implements intelligent retry with exponential backoff for transient errors
- **Authentication Handling**: Automatically handles token refresh for authentication errors
- **Comprehensive Logging**: Logs errors with workflow context for debugging and monitoring

## Usage

### Basic Error Handling

```typescript
import { RequisitionErrorHandler, SubmissionType } from '../utils/RequisitionErrorHandler';

// Handle submission error with workflow-specific logic
try {
  const result = await createRequisitionWithWorkflow(data);
} catch (error) {
  const errorResult = RequisitionErrorHandler.handleSubmissionError(
    error,
    'workflow',
    'create with workflow'
  );
  
  console.log(errorResult.userMessage); // User-friendly error message
  
  if (errorResult.canRetryWithAlternative) {
    console.log(`Try ${errorResult.suggestedAlternative} instead`);
  }
}
```

### Using Retry Logic

```typescript
// Execute operation with automatic retry and workflow-specific error handling
const result = await RequisitionErrorHandler.withRetry(
  () => procurementService.createRequisitionWithWorkflow(data),
  'workflow',
  'create requisition with workflow'
);
```

### Conversion Error Handling

```typescript
// Handle conversion to purchase order errors
try {
  const po = await convertRequisitionToPO(requisitionId, conversionData);
} catch (error) {
  const errorResult = RequisitionErrorHandler.handleConversionError(error, requisitionId);
  
  setErrorMessage(errorResult.userMessage);
  setCanRetry(errorResult.canRetry);
}
```

## Submission Types

The handler supports three submission types:

- **`draft`**: Save requisition as draft
- **`manual`**: Submit for manual approval workflow
- **`workflow`**: Create with automated workflow system

## Error Classification

### Workflow-Specific Error Codes

- `WORKFLOW_UNAVAILABLE`: Workflow system is down or unavailable
- `WORKFLOW_CONFIGURATION_ERROR`: Workflow configuration issues
- `WORKFLOW_PERMISSION_DENIED`: User lacks workflow permissions
- `WORKFLOW_VALIDATION_ERROR`: Workflow-specific validation failures
- `WORKFLOW_TIMEOUT`: Workflow operations timed out
- `MANUAL_APPROVAL_ERROR`: Manual approval system issues
- `CONVERSION_ERROR`: Purchase order conversion failures
- `DRAFT_SAVE_ERROR`: Draft saving issues

### Standard Error Types

The handler also works with standard error types from the base `ErrorHandler`:

- `VALIDATION`: Form validation errors
- `AUTHORIZATION`: Permission denied
- `AUTHENTICATION`: Session expired
- `NETWORK`: Connection issues
- `SERVER`: Server errors (5xx)
- `TIMEOUT`: Request timeouts
- `RATE_LIMIT`: Too many requests
- `CONFLICT`: Data conflicts
- `NOT_FOUND`: Resource not found

## Alternative Suggestions

When an error occurs, the handler can suggest alternative submission methods:

| Original Method | Error Type | Suggested Alternative | Reason |
|----------------|------------|----------------------|---------|
| Workflow | Server/Timeout/Unavailable | Manual | Workflow system issues |
| Manual | Server/Unavailable | Draft | Manual approval system issues |
| Any | Authentication | Login | Session expired |

## Retry Configuration

Different submission types have different retry configurations:

```typescript
const SUBMISSION_TYPE_RETRY_CONFIG = {
  draft: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000
  },
  manual: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000
  },
  workflow: {
    maxRetries: 2,
    baseDelay: 1500,
    maxDelay: 8000
  }
};
```

## Error Messages

The handler provides context-specific error messages for each submission type:

### Draft Submission Messages
- Validation: "Please check your form data before saving as draft."
- Network: "Connection failed while saving draft. Your changes will be preserved."
- Server: "Failed to save draft. Please try again."

### Manual Approval Messages
- Validation: "Please ensure all required fields are completed before submitting for approval."
- Authorization: "You do not have permission to submit requisitions for manual approval."
- Server: "Failed to submit requisition for approval. Please try again."

### Workflow Submission Messages
- Validation: "Please ensure all required fields are completed before creating with workflow."
- Server: "Workflow system is currently unavailable. You can submit for manual approval instead."
- Configuration: "Workflow configuration error. Please contact administrator or use manual approval."

## Integration with Components

### Form Component Integration

```typescript
const RequisitionForm: React.FC = () => {
  const [error, setError] = useState<string | null>(null);
  const [alternativeSuggestion, setAlternativeSuggestion] = useState<{
    type: SubmissionType;
    message: string;
  } | null>(null);

  const handleSubmission = async (submissionType: SubmissionType) => {
    try {
      const result = await RequisitionErrorHandler.withRetry(
        () => submitRequisition(formData, submissionType),
        submissionType,
        RequisitionErrorHandler.getActionLabel(submissionType)
      );
      
      // Handle success
      onSuccess(result);
    } catch (error) {
      const errorResult = RequisitionErrorHandler.handleSubmissionError(
        error,
        submissionType
      );
      
      setError(errorResult.userMessage);
      
      if (errorResult.canRetryWithAlternative) {
        setAlternativeSuggestion({
          type: errorResult.suggestedAlternative!,
          message: errorResult.alternativeMessage!
        });
      }
    }
  };

  return (
    <form>
      {/* Form fields */}
      
      <div className="action-buttons">
        <button onClick={() => handleSubmission('draft')}>Save as Draft</button>
        <button onClick={() => handleSubmission('manual')}>Submit for Approval</button>
        <button onClick={() => handleSubmission('workflow')}>Create with Workflow</button>
      </div>
      
      {error && <ErrorMessage message={error} />}
      
      {alternativeSuggestion && (
        <AlternativeSuggestion
          type={alternativeSuggestion.type}
          message={alternativeSuggestion.message}
          onTry={() => handleSubmission(alternativeSuggestion.type)}
        />
      )}
    </form>
  );
};
```

## Testing

The handler includes comprehensive unit and integration tests:

```bash
# Run all RequisitionErrorHandler tests
npm test -- --run RequisitionErrorHandler

# Run specific test files
npm test -- --run RequisitionErrorHandler.test.ts
npm test -- --run RequisitionErrorHandler.integration.test.ts
```

## Best Practices

1. **Always use workflow-specific contexts**: Pass the correct submission type to get appropriate error messages
2. **Handle alternative suggestions**: Implement UI to show and act on alternative submission methods
3. **Log errors appropriately**: Use the built-in logging for debugging and monitoring
4. **Customize retry configuration**: Adjust retry settings based on your specific needs
5. **Provide user feedback**: Always show user-friendly error messages, not technical details
6. **Handle authentication errors**: Implement proper session management and login redirects

## Example Component

See `src/components/examples/RequisitionErrorHandlingExample.tsx` for a complete working example demonstrating all features of the RequisitionErrorHandler.