import {
  ValidationRule,
  ValidationResult,
  FieldValidationResult,
  validateField,
  validateFields,
  isFormValid,
  getAllErrors,
  validationRules,
} from './validation';

// Enhanced validation interfaces for dual workflow support
export interface EnhancedValidationResult extends ValidationResult {
  canSubmitAsDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
  submissionTypeErrors: Record<'draft' | 'manual' | 'workflow', string[]>;
}

export interface ValidationState {
  isValid: boolean;
  errors: Record<string, string>;
  canSubmitAsDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
  submissionTypeErrors: Record<'draft' | 'manual' | 'workflow', string[]>;
}

// Form data interface for requisition
export interface RequisitionFormData {
  department_id: string;
  title: string;
  justification: string;
  budget_code: string;
  expected_delivery_date: string;
  priority: string;
  notes: string;
  items: Array<{
    item_id: string;
    quantity: number;
    estimated_cost: number;
    specification: string;
    urgency: string;
    justification: string;
    budget_code: string;
    notes: string;
  }>;
  submissionType?: 'draft' | 'manual' | 'workflow';
  workflowInfo?: {
    workflow_run_id?: number;
    workflow_status?: string;
  };
}

// Submission type for validation context
export type SubmissionType = 'draft' | 'manual' | 'workflow';

/**
 * Enhanced Form Validator class with submission-type-aware validation
 * Supports different validation rules for draft, manual approval, and workflow submissions
 */
export class EnhancedFormValidator {
  /**
   * Validate form data for a specific submission type
   * @param formData - The form data to validate
   * @param submissionType - The type of submission (draft, manual, workflow)
   * @returns Enhanced validation result with submission-specific information
   */
  static validateForSubmission(
    formData: RequisitionFormData,
    submissionType: SubmissionType
  ): EnhancedValidationResult {
    const baseValidation = this.validateBaseForm(formData);
    const workflowValidation = this.validateWorkflowRequirements(formData);

    // Determine what submission types are available based on validation
    const canSubmitAsDraft = true; // Draft always allowed with minimal validation
    const canSubmitForApproval = baseValidation.isValid;
    const canCreateWithWorkflow = baseValidation.isValid && workflowValidation.isValid;

    // Get submission-type-specific errors
    const submissionTypeErrors = this.getSubmissionTypeErrors(
      formData,
      baseValidation,
      workflowValidation
    );

    // Determine overall validity based on submission type
    let isValid = false;
    let errors: string[] = [];

    switch (submissionType) {
      case 'draft':
        isValid = canSubmitAsDraft;
        errors = submissionTypeErrors.draft;
        break;
      case 'manual':
        isValid = canSubmitForApproval;
        errors = submissionTypeErrors.manual;
        break;
      case 'workflow':
        isValid = canCreateWithWorkflow;
        errors = submissionTypeErrors.workflow;
        break;
    }

    return {
      isValid,
      errors,
      canSubmitAsDraft,
      canSubmitForApproval,
      canCreateWithWorkflow,
      submissionTypeErrors,
    };
  }

  /**
   * Validate base form requirements (common to all submission types)
   * @param formData - The form data to validate
   * @returns Basic validation result
   */
  private static validateBaseForm(formData: RequisitionFormData): ValidationResult {
    const errors: string[] = [];

    // Department validation
    if (!formData.department_id || formData.department_id.trim() === '') {
      errors.push('Department is required');
    }

    // Title validation
    if (!formData.title || formData.title.trim() === '') {
      errors.push('Title is required');
    }

    // Justification validation
    if (!formData.justification || formData.justification.trim() === '') {
      errors.push('Justification is required');
    } else if (formData.justification.trim().length < 10) {
      errors.push('Justification must be at least 10 characters long');
    }

    // Items validation
    if (!formData.items || formData.items.length === 0) {
      errors.push('At least one item is required');
    } else {
      // Validate individual items
      formData.items.forEach((item, index) => {
        if (!item.item_id) {
          errors.push(`Item ${index + 1}: Item selection is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: Quantity must be greater than 0`);
        }
        if (!item.estimated_cost || item.estimated_cost < 0) {
          errors.push(`Item ${index + 1}: Estimated cost must be zero or positive`);
        }
        if (!item.specification || item.specification.trim() === '') {
          errors.push(`Item ${index + 1}: Specification is required`);
        }
        if (!item.justification || item.justification.trim() === '') {
          errors.push(`Item ${index + 1}: Item justification is required`);
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate workflow-specific requirements
   * @param formData - The form data to validate
   * @returns Workflow validation result
   */
  static validateWorkflowRequirements(formData: RequisitionFormData): ValidationResult {
    const errors: string[] = [];

    // Workflow requires more detailed justification
    if (formData.justification && formData.justification.trim().length < 20) {
      errors.push('Workflow submissions require detailed justification (minimum 20 characters)');
    }

    // Workflow requires department to be specified
    if (!formData.department_id || formData.department_id.trim() === '') {
      errors.push('Department is required for workflow submissions');
    }

    // Workflow requires all items to have proper specifications
    if (formData.items && formData.items.length > 0) {
      formData.items.forEach((item, index) => {
        if (item.specification && item.specification.trim().length < 5) {
          errors.push(
            `Item ${index + 1}: Workflow requires detailed specification (minimum 5 characters)`
          );
        }
        if (item.justification && item.justification.trim().length < 5) {
          errors.push(
            `Item ${index + 1}: Workflow requires detailed item justification (minimum 5 characters)`
          );
        }
      });
    }

    // Workflow benefits from having expected delivery date
    if (!formData.expected_delivery_date) {
      errors.push('Expected delivery date is recommended for workflow submissions');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get submission-type-specific error messages
   * @param formData - The form data
   * @param baseValidation - Base validation result
   * @param workflowValidation - Workflow validation result
   * @returns Errors categorized by submission type
   */
  private static getSubmissionTypeErrors(
    formData: RequisitionFormData,
    baseValidation: ValidationResult,
    workflowValidation: ValidationResult
  ): Record<'draft' | 'manual' | 'workflow', string[]> {
    const draftErrors: string[] = [];
    const manualErrors: string[] = [...baseValidation.errors];
    const workflowErrors: string[] = [...baseValidation.errors, ...workflowValidation.errors];

    // Draft validation is very lenient - only critical errors
    if (!formData.items || formData.items.length === 0) {
      draftErrors.push('At least one item is required to save as draft');
    }

    return {
      draft: draftErrors,
      manual: manualErrors,
      workflow: workflowErrors,
    };
  }

  /**
   * Validate form data and return detailed validation state
   * @param formData - The form data to validate
   * @returns Complete validation state with all submission options
   */
  static validateFormState(formData: RequisitionFormData): ValidationState {
    const baseValidation = this.validateBaseForm(formData);
    const workflowValidation = this.validateWorkflowRequirements(formData);

    const canSubmitAsDraft = true; // Always allow draft
    const canSubmitForApproval = baseValidation.isValid;
    const canCreateWithWorkflow = baseValidation.isValid && workflowValidation.isValid;

    const submissionTypeErrors = this.getSubmissionTypeErrors(
      formData,
      baseValidation,
      workflowValidation
    );

    // Create field-level errors map for UI display
    const errors: Record<string, string> = {};

    // Map validation errors to field names
    baseValidation.errors.forEach(error => {
      if (error.includes('Department')) {
        errors.department_id = error;
      } else if (error.includes('Title')) {
        errors.title = error;
      } else if (error.includes('Justification')) {
        errors.justification = error;
      } else if (error.includes('Item') && error.includes(':')) {
        // Parse item-specific errors
        const match = error.match(/Item (\d+): (.+)/);
        if (match) {
          const itemIndex = parseInt(match[1]) - 1;
          const errorMessage = match[2];

          if (errorMessage.includes('selection')) {
            errors[`items.${itemIndex}.item_id`] = errorMessage;
          } else if (errorMessage.includes('Quantity')) {
            errors[`items.${itemIndex}.quantity`] = errorMessage;
          } else if (errorMessage.includes('cost')) {
            errors[`items.${itemIndex}.estimated_cost`] = errorMessage;
          } else if (errorMessage.includes('Specification')) {
            errors[`items.${itemIndex}.specification`] = errorMessage;
          } else if (errorMessage.includes('justification')) {
            errors[`items.${itemIndex}.justification`] = errorMessage;
          }
        }
      } else if (error.includes('least one item')) {
        errors.items = error;
      }
    });

    return {
      isValid: baseValidation.isValid,
      errors,
      canSubmitAsDraft,
      canSubmitForApproval,
      canCreateWithWorkflow,
      submissionTypeErrors,
    };
  }

  /**
   * Get validation message for a specific submission type
   * @param submissionType - The submission type
   * @param validationState - Current validation state
   * @returns User-friendly validation message
   */
  static getSubmissionValidationMessage(
    submissionType: SubmissionType,
    validationState: ValidationState
  ): string {
    const errors = validationState.submissionTypeErrors[submissionType];

    if (errors.length === 0) {
      return '';
    }

    const actionLabel = this.getSubmissionActionLabel(submissionType);

    if (errors.length === 1) {
      return `Cannot ${actionLabel}: ${errors[0]}`;
    }

    return `Cannot ${actionLabel}: ${errors.length} validation errors found`;
  }

  /**
   * Get user-friendly action label for submission type
   * @param submissionType - The submission type
   * @returns Action label
   */
  private static getSubmissionActionLabel(submissionType: SubmissionType): string {
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
   * Check if a specific field is valid for a submission type
   * @param fieldName - The field name to check
   * @param formData - The form data
   * @param submissionType - The submission type
   * @returns Whether the field is valid for the submission type
   */
  static isFieldValidForSubmission(
    fieldName: string,
    formData: RequisitionFormData,
    submissionType: SubmissionType
  ): boolean {
    const validationResult = this.validateForSubmission(formData, submissionType);
    const fieldErrors = validationResult.errors.filter(error =>
      error.toLowerCase().includes(fieldName.toLowerCase())
    );

    return fieldErrors.length === 0;
  }

  /**
   * Get field-specific validation message for a submission type
   * @param fieldName - The field name
   * @param formData - The form data
   * @param submissionType - The submission type
   * @returns Field-specific validation message
   */
  static getFieldValidationMessage(
    fieldName: string,
    formData: RequisitionFormData,
    submissionType: SubmissionType
  ): string {
    const validationResult = this.validateForSubmission(formData, submissionType);
    const fieldErrors = validationResult.errors.filter(error =>
      error.toLowerCase().includes(fieldName.toLowerCase())
    );

    return fieldErrors[0] || '';
  }
}

// Export validation state tracking hook-compatible interface
export interface UseEnhancedValidationReturn {
  validationState: ValidationState;
  validateForSubmission: (submissionType: SubmissionType) => EnhancedValidationResult;
  validateFormState: () => ValidationState;
  getSubmissionValidationMessage: (submissionType: SubmissionType) => string;
  isFieldValidForSubmission: (fieldName: string, submissionType: SubmissionType) => boolean;
  getFieldValidationMessage: (fieldName: string, submissionType: SubmissionType) => string;
}
