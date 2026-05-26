// src/utils/RequisitionErrorHandler.ts
import {
  ErrorHandler,
  ApiError,
  ErrorType,
  DEFAULT_RETRY_CONFIG,
  RetryConfig,
} from './errorHandler';
import { tokenManager } from '../services/tokenManager';

/**
 * Submission types for dual requisition workflow
 */
export type SubmissionType = 'draft' | 'manual' | 'workflow';

/**
 * Workflow-specific error codes
 */
export enum WorkflowErrorCode {
  WORKFLOW_UNAVAILABLE = 'WORKFLOW_UNAVAILABLE',
  WORKFLOW_CONFIGURATION_ERROR = 'WORKFLOW_CONFIGURATION_ERROR',
  WORKFLOW_PERMISSION_DENIED = 'WORKFLOW_PERMISSION_DENIED',
  WORKFLOW_VALIDATION_ERROR = 'WORKFLOW_VALIDATION_ERROR',
  WORKFLOW_TIMEOUT = 'WORKFLOW_TIMEOUT',
  MANUAL_APPROVAL_ERROR = 'MANUAL_APPROVAL_ERROR',
  CONVERSION_ERROR = 'CONVERSION_ERROR',
  DRAFT_SAVE_ERROR = 'DRAFT_SAVE_ERROR',
}

/**
 * Enhanced error interface for requisition operations
 */
export interface RequisitionError extends ApiError {
  submissionType?: SubmissionType;
  workflowErrorCode?: WorkflowErrorCode;
  canRetryWithDifferentMethod?: boolean;
  suggestedAlternative?: SubmissionType;
}

/**
 * Error message mapping for different submission types and error scenarios
 */
const SUBMISSION_TYPE_ERROR_MESSAGES: Record<
  SubmissionType,
  Record<ErrorType | WorkflowErrorCode, string>
> = {
  draft: {
    [ErrorType.VALIDATION]: 'Please check your form data before saving as draft.',
    [ErrorType.AUTHORIZATION]: 'You do not have permission to save requisition drafts.',
    [ErrorType.NETWORK]: 'Connection failed while saving draft. Your changes will be preserved.',
    [ErrorType.SERVER]: 'Failed to save draft. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try saving again.',
    [ErrorType.CONFLICT]: 'This requisition may have been modified. Please refresh and try again.',
    [ErrorType.RATE_LIMIT]: 'Too many save attempts. Please wait a moment and try again.',
    [ErrorType.TIMEOUT]: 'Save operation timed out. Please try again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.UNKNOWN]: 'Failed to save draft. Please try again.',
    [WorkflowErrorCode.DRAFT_SAVE_ERROR]:
      'Unable to save requisition as draft. Please check your data and try again.',
  },
  manual: {
    [ErrorType.VALIDATION]:
      'Please ensure all required fields are completed before submitting for approval.',
    [ErrorType.AUTHORIZATION]:
      'You do not have permission to submit requisitions for manual approval.',
    [ErrorType.NETWORK]: 'Connection failed while submitting for approval. Please try again.',
    [ErrorType.SERVER]: 'Failed to submit requisition for approval. Please try again.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try submitting again.',
    [ErrorType.CONFLICT]: 'This requisition may have been modified. Please refresh and try again.',
    [ErrorType.RATE_LIMIT]: 'Too many submission attempts. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Submission timed out. Please try again.',
    [ErrorType.NOT_FOUND]: 'Requisition not found. It may have been deleted.',
    [ErrorType.UNKNOWN]: 'Failed to submit requisition for approval. Please try again.',
    [WorkflowErrorCode.MANUAL_APPROVAL_ERROR]:
      'Manual approval system is currently unavailable. You can save as draft and try again later.',
  },
  workflow: {
    [ErrorType.VALIDATION]:
      'Please ensure all required fields are completed before creating with workflow.',
    [ErrorType.AUTHORIZATION]:
      'You do not have permission to create requisitions with automated workflow.',
    [ErrorType.NETWORK]: 'Connection failed while creating workflow requisition. Please try again.',
    [ErrorType.SERVER]:
      'Workflow system is currently unavailable. You can submit for manual approval instead.',
    [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try creating again.',
    [ErrorType.CONFLICT]: 'Workflow system is busy. Please try again or use manual approval.',
    [ErrorType.RATE_LIMIT]: 'Too many workflow requests. Please wait and try again.',
    [ErrorType.TIMEOUT]: 'Workflow creation timed out. Please try again or use manual approval.',
    [ErrorType.NOT_FOUND]:
      'Workflow configuration not found. Please contact administrator or use manual approval.',
    [ErrorType.UNKNOWN]:
      'Failed to create requisition with workflow. Please try manual approval instead.',
    [WorkflowErrorCode.WORKFLOW_UNAVAILABLE]:
      'Automated workflow system is currently unavailable. Please try manual approval instead.',
    [WorkflowErrorCode.WORKFLOW_CONFIGURATION_ERROR]:
      'Workflow configuration error. Please contact administrator or use manual approval.',
    [WorkflowErrorCode.WORKFLOW_PERMISSION_DENIED]:
      'You do not have permission to use automated workflows. Please try manual approval instead.',
    [WorkflowErrorCode.WORKFLOW_VALIDATION_ERROR]:
      'Workflow validation failed. Please check your data or try manual approval.',
    [WorkflowErrorCode.WORKFLOW_TIMEOUT]:
      'Workflow system timed out. Please try again or use manual approval.',
  },
};

/**
 * Conversion-specific error messages
 */
const CONVERSION_ERROR_MESSAGES: Record<ErrorType | WorkflowErrorCode, string> = {
  [ErrorType.VALIDATION]: 'Please provide supplier, delivery location, and expected delivery date.',
  [ErrorType.AUTHORIZATION]:
    'You do not have permission to convert requisitions to purchase orders.',
  [ErrorType.NETWORK]: 'Connection failed while converting requisition. Please try again.',
  [ErrorType.SERVER]: 'Failed to convert requisition to purchase order. Please try again.',
  [ErrorType.AUTHENTICATION]: 'Your session expired. Please log in and try converting again.',
  [ErrorType.CONFLICT]: 'This requisition may have already been converted or is not approved.',
  [ErrorType.RATE_LIMIT]: 'Too many conversion attempts. Please wait and try again.',
  [ErrorType.TIMEOUT]: 'Conversion timed out. Please try again.',
  [ErrorType.NOT_FOUND]: 'Requisition not found or supplier/location invalid.',
  [ErrorType.UNKNOWN]: 'Failed to convert requisition. Please try again.',
  [WorkflowErrorCode.CONVERSION_ERROR]:
    'Unable to convert requisition to purchase order. Please check the requisition status and try again.',
};

/**
 * Alternative submission method suggestions based on error type
 */
const ERROR_ALTERNATIVE_SUGGESTIONS: Record<
  ErrorType | WorkflowErrorCode,
  {
    fromWorkflow?: SubmissionType;
    fromManual?: SubmissionType;
    message?: string;
  }
> = {
  [ErrorType.SERVER]: {
    fromWorkflow: 'manual',
    message: 'Try submitting for manual approval instead',
  },
  [ErrorType.TIMEOUT]: {
    fromWorkflow: 'manual',
    message: 'Try submitting for manual approval instead',
  },
  [ErrorType.NOT_FOUND]: {
    fromWorkflow: 'manual',
    message: 'Try submitting for manual approval instead',
  },
  [WorkflowErrorCode.WORKFLOW_UNAVAILABLE]: {
    fromWorkflow: 'manual',
    message: 'Use manual approval process instead',
  },
  [WorkflowErrorCode.WORKFLOW_CONFIGURATION_ERROR]: {
    fromWorkflow: 'manual',
    message: 'Use manual approval process instead',
  },
  [WorkflowErrorCode.WORKFLOW_TIMEOUT]: {
    fromWorkflow: 'manual',
    message: 'Try manual approval instead',
  },
  [WorkflowErrorCode.MANUAL_APPROVAL_ERROR]: {
    fromManual: 'draft',
    message: 'Save as draft and try again later',
  },
};

/**
 * Retry configuration for different submission types
 */
const SUBMISSION_TYPE_RETRY_CONFIG: Record<SubmissionType, Partial<RetryConfig>> = {
  draft: {
    maxRetries: 2,
    baseDelay: 500,
    maxDelay: 2000,
  },
  manual: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 5000,
  },
  workflow: {
    maxRetries: 2,
    baseDelay: 1500,
    maxDelay: 8000,
  },
};

/**
 * Enhanced error handler for dual requisition workflows
 */
export class RequisitionErrorHandler {
  /**
   * Classify error with workflow-specific context
   */
  static classifyRequisitionError(
    error: any,
    submissionType: SubmissionType,
    operation: string = 'requisition operation'
  ): RequisitionError {
    const baseError = ErrorHandler.classifyError(error);

    // Detect workflow-specific errors
    let workflowErrorCode: WorkflowErrorCode | undefined;
    let canRetryWithDifferentMethod = false;
    let suggestedAlternative: SubmissionType | undefined;

    // Analyze error message for workflow-specific issues
    const errorMessage = error?.response?.data?.message || error?.message || '';
    const errorLower = errorMessage.toLowerCase();

    if (submissionType === 'workflow') {
      if (errorLower.includes('workflow') && errorLower.includes('unavailable')) {
        workflowErrorCode = WorkflowErrorCode.WORKFLOW_UNAVAILABLE;
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'manual';
      } else if (errorLower.includes('workflow') && errorLower.includes('configuration')) {
        workflowErrorCode = WorkflowErrorCode.WORKFLOW_CONFIGURATION_ERROR;
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'manual';
      } else if (errorLower.includes('workflow') && errorLower.includes('permission')) {
        workflowErrorCode = WorkflowErrorCode.WORKFLOW_PERMISSION_DENIED;
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'manual';
      } else if (errorLower.includes('workflow') && errorLower.includes('timeout')) {
        workflowErrorCode = WorkflowErrorCode.WORKFLOW_TIMEOUT;
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'manual';
      } else if (baseError.code === ErrorType.SERVER || baseError.code === ErrorType.TIMEOUT) {
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'manual';
      }
    } else if (submissionType === 'manual') {
      if (errorLower.includes('approval') && errorLower.includes('unavailable')) {
        workflowErrorCode = WorkflowErrorCode.MANUAL_APPROVAL_ERROR;
        canRetryWithDifferentMethod = true;
        suggestedAlternative = 'draft';
      }
    } else if (submissionType === 'draft') {
      if (errorLower.includes('draft') || errorLower.includes('save')) {
        workflowErrorCode = WorkflowErrorCode.DRAFT_SAVE_ERROR;
      }
    }

    // Check for conversion-specific errors
    if (operation.includes('convert') || operation.includes('po')) {
      if (errorLower.includes('convert') || errorLower.includes('purchase order')) {
        workflowErrorCode = WorkflowErrorCode.CONVERSION_ERROR;
      }
    }

    return {
      ...baseError,
      submissionType,
      workflowErrorCode,
      canRetryWithDifferentMethod,
      suggestedAlternative,
    };
  }

  /**
   * Get user-friendly error message for specific submission type
   */
  static getUserFriendlyMessage(
    error: RequisitionError,
    operation: string = 'requisition operation'
  ): string {
    const submissionType = error.submissionType || 'manual';

    // Handle conversion operations separately
    if (operation.includes('convert') || operation.includes('po')) {
      const errorCode = error.workflowErrorCode || error.code;
      return (
        CONVERSION_ERROR_MESSAGES[errorCode as ErrorType | WorkflowErrorCode] ||
        CONVERSION_ERROR_MESSAGES[ErrorType.UNKNOWN]
      );
    }

    // Get submission-type specific message
    const errorCode = error.workflowErrorCode || error.code;
    const messages = SUBMISSION_TYPE_ERROR_MESSAGES[submissionType];

    return (
      messages[errorCode as ErrorType | WorkflowErrorCode] ||
      messages[ErrorType.UNKNOWN] ||
      error.message
    );
  }

  /**
   * Get suggested alternative submission method
   */
  static getSuggestedAlternative(error: RequisitionError): {
    alternative?: SubmissionType;
    message?: string;
  } {
    if (!error.canRetryWithDifferentMethod) {
      return {};
    }

    const errorCode = error.workflowErrorCode || error.code;
    const suggestion = ERROR_ALTERNATIVE_SUGGESTIONS[errorCode as ErrorType | WorkflowErrorCode];

    if (!suggestion) {
      return {};
    }

    const submissionType = error.submissionType || 'manual';
    let alternative: SubmissionType | undefined;

    if (submissionType === 'workflow' && suggestion.fromWorkflow) {
      alternative = suggestion.fromWorkflow;
    } else if (submissionType === 'manual' && suggestion.fromManual) {
      alternative = suggestion.fromManual;
    }

    return {
      alternative,
      message: suggestion.message,
    };
  }

  /**
   * Execute requisition operation with retry logic and workflow-specific error handling
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    submissionType: SubmissionType,
    operationName: string,
    customConfig?: Partial<RetryConfig>
  ): Promise<T> {
    const retryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...SUBMISSION_TYPE_RETRY_CONFIG[submissionType],
      ...customConfig,
    };

    let lastError: RequisitionError;

    for (let attempt = 1; attempt <= retryConfig.maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.classifyRequisitionError(error, submissionType, operationName);

        // Handle authentication errors immediately
        if (lastError.code === ErrorType.AUTHENTICATION) {
          const refreshSuccess = await tokenManager.refreshToken();
          if (refreshSuccess && attempt <= retryConfig.maxRetries) {
            const delay = this.calculateDelay(attempt, retryConfig);
            console.warn(
              `Authentication error in ${operationName} (${submissionType}), token refreshed, retrying in ${delay}ms (attempt ${attempt})`
            );
            await this.sleep(delay);
            continue;
          } else {
            console.error(
              `Authentication failed in ${operationName} (${submissionType}), redirecting to login`
            );
            throw lastError;
          }
        }

        // Don't retry if it's the last attempt or error is not retryable
        if (attempt > retryConfig.maxRetries || !lastError.retryable) {
          console.error(
            `${operationName} (${submissionType}) failed after ${attempt} attempts:`,
            lastError
          );
          throw lastError;
        }

        // Wait before retrying
        const delay = this.calculateDelay(attempt, retryConfig);
        console.warn(
          `Attempt ${attempt} failed for ${operationName} (${submissionType}), retrying in ${delay}ms:`,
          lastError.message
        );
        await this.sleep(delay);
      }
    }

    throw lastError!;
  }

  /**
   * Handle submission error with workflow-specific logic
   */
  static handleSubmissionError(
    error: any,
    submissionType: SubmissionType,
    operation: string = 'submit requisition'
  ): {
    error: RequisitionError;
    userMessage: string;
    canRetryWithAlternative: boolean;
    suggestedAlternative?: SubmissionType;
    alternativeMessage?: string;
  } {
    const requisitionError = this.classifyRequisitionError(error, submissionType, operation);
    const userMessage = this.getUserFriendlyMessage(requisitionError, operation);
    const suggestion = this.getSuggestedAlternative(requisitionError);

    return {
      error: requisitionError,
      userMessage,
      canRetryWithAlternative: requisitionError.canRetryWithDifferentMethod || false,
      suggestedAlternative: suggestion.alternative,
      alternativeMessage: suggestion.message,
    };
  }

  /**
   * Handle conversion error with specific messaging
   */
  static handleConversionError(
    error: any,
    requisitionId: number
  ): {
    error: RequisitionError;
    userMessage: string;
    canRetry: boolean;
  } {
    const requisitionError = this.classifyRequisitionError(
      error,
      'manual',
      `convert requisition ${requisitionId}`
    );
    const userMessage = this.getUserFriendlyMessage(requisitionError, 'convert requisition');

    return {
      error: requisitionError,
      userMessage,
      canRetry: requisitionError.retryable,
    };
  }

  /**
   * Check if error should trigger alternative submission method suggestion
   */
  static shouldSuggestAlternative(error: RequisitionError): boolean {
    return error.canRetryWithDifferentMethod === true && !!error.suggestedAlternative;
  }

  /**
   * Get action label for submission type
   */
  static getActionLabel(submissionType: SubmissionType): string {
    switch (submissionType) {
      case 'draft':
        return 'save as draft';
      case 'manual':
        return 'submit for approval';
      case 'workflow':
        return 'create with workflow';
      default:
        return 'process';
    }
  }

  /**
   * Log error with workflow context
   */
  static logError(error: RequisitionError, operation: string): void {
    const logData = {
      operation,
      submissionType: error.submissionType,
      code: error.code,
      workflowErrorCode: error.workflowErrorCode,
      status: error.status,
      message: error.message,
      retryable: error.retryable,
      canRetryWithDifferentMethod: error.canRetryWithDifferentMethod,
      suggestedAlternative: error.suggestedAlternative,
      timestamp: new Date().toISOString(),
      details: error.details,
    };

    if (error.retryable) {
      console.warn('Retryable requisition error:', logData);
    } else {
      console.error('Non-retryable requisition error:', logData);
    }

    // In production, send to error tracking service
    // errorTrackingService.track('requisition_error', logData);
  }

  /**
   * Private helper methods
   */
  private static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private static calculateDelay(attempt: number, config: RetryConfig): number {
    const delay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    return Math.min(delay, config.maxDelay);
  }
}

export default RequisitionErrorHandler;
