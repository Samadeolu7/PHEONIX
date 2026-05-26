// src/utils/RequisitionDataTransformer.ts
import {
  CreatePurchaseRequisitionData,
  WorkflowRequisitionData,
  WorkflowRequisitionResponse,
  PurchaseRequisitionItem,
} from '../types/procurement';

/**
 * Form data interface representing the structure used in RequisitionFormPage
 */
export interface FormData {
  department_id: string;
  title: string;
  justification: string;
  budget_code: string;
  expected_delivery_date: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  notes: string;
  items: FormItem[];
}

export interface FormItem {
  item_id: string;
  quantity: number;
  estimated_cost: number;
  specification: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  justification: string;
  budget_code: string;
  notes: string;
}

/**
 * Validation result interface for form data validation
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Record<string, string>;
  canSubmitAsDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
}

/**
 * Data transformation utilities for dual requisition workflow
 * Handles conversion between form data and different API formats
 */
export class RequisitionDataTransformer {
  /**
   * Transform form data to manual workflow format (existing API)
   * Used for "Save as Draft" and "Submit for Approval" actions
   */
  static toManualWorkflowFormat(
    formData: FormData,
    submissionType: 'draft' | 'submitted' = 'draft',
    requestedBy: number = 1
  ): CreatePurchaseRequisitionData {
    return {
      requested_by: requestedBy,
      department: formData.department_id,
      required_by_date: formData.expected_delivery_date || new Date().toISOString().split('T')[0],
      purpose: formData.justification,
      status: submissionType,
      notes: formData.notes || undefined,
      items: formData.items.map(item => ({
        item: parseInt(item.item_id) || null,
        description: item.specification,
        quantity: item.quantity.toString(),
        estimated_unit_price: item.estimated_cost.toString(),
        notes: item.notes || undefined,
      })),
    };
  }

  /**
   * Transform form data to automated workflow format (new API)
   * Used for "Create with Workflow" action
   */
  static toWorkflowFormat(formData: FormData): WorkflowRequisitionData {
    return {
      department: formData.department_id,
      purpose: formData.justification,
      required_by_date: formData.expected_delivery_date || new Date().toISOString().split('T')[0],
      items: formData.items.map(item => ({
        item: parseInt(item.item_id),
        quantity: item.quantity,
        estimated_unit_price: item.estimated_cost.toString(),
      })),
    };
  }

  /**
   * Validate form data for manual workflow submission
   * Performs comprehensive validation for traditional approval process
   */
  static validateManualWorkflowFormat(formData: FormData): ValidationResult {
    const errors: Record<string, string> = {};

    // Department validation
    if (!formData.department_id || formData.department_id.trim() === '') {
      errors.department_id = 'Department is required';
    }

    // Justification validation
    if (!formData.justification || formData.justification.trim() === '') {
      errors.justification = 'Justification is required';
    } else if (formData.justification.length < 10) {
      errors.justification = 'Justification must be at least 10 characters';
    }

    // Items validation
    if (!formData.items || formData.items.length === 0) {
      errors.items = 'At least one item is required';
    } else {
      formData.items.forEach((item, index) => {
        if (!item.item_id) {
          errors[`items.${index}.item_id`] = 'Item selection is required';
        }
        if (!item.quantity || item.quantity <= 0) {
          errors[`items.${index}.quantity`] = 'Quantity must be greater than 0';
        }
        if (!item.estimated_cost || item.estimated_cost <= 0) {
          errors[`items.${index}.estimated_cost`] = 'Estimated cost must be greater than 0';
        }
        if (!item.specification || item.specification.trim() === '') {
          errors[`items.${index}.specification`] = 'Specification is required';
        }
      });
    }

    const isValid = Object.keys(errors).length === 0;

    return {
      isValid,
      errors,
      canSubmitAsDraft: true, // Draft submissions have relaxed validation
      canSubmitForApproval: isValid,
      canCreateWithWorkflow: isValid && this.validateWorkflowRequirements(formData),
    };
  }

  /**
   * Validate form data for workflow submission
   * Performs validation specific to automated workflow requirements
   */
  static validateWorkflowFormat(formData: FormData): ValidationResult {
    const baseValidation = this.validateManualWorkflowFormat(formData);

    // Additional workflow-specific validation
    const workflowErrors = { ...baseValidation.errors };

    // Workflow requires all items to have valid item IDs (no manual items)
    formData.items.forEach((item, index) => {
      if (item.item_id && isNaN(parseInt(item.item_id))) {
        workflowErrors[`items.${index}.item_id`] =
          'Workflow requires valid inventory item selection';
      }
    });

    const isWorkflowValid =
      Object.keys(workflowErrors).length === 0 && this.validateWorkflowRequirements(formData);

    return {
      isValid: isWorkflowValid,
      errors: workflowErrors,
      canSubmitAsDraft: true,
      canSubmitForApproval: baseValidation.isValid,
      canCreateWithWorkflow: isWorkflowValid,
    };
  }

  /**
   * Validate workflow-specific requirements
   * Additional checks for automated workflow compatibility
   */
  private static validateWorkflowRequirements(formData: FormData): boolean {
    // Department must be specified
    if (!formData.department_id || formData.department_id.trim() === '') {
      return false;
    }

    // Justification must be substantial
    if (!formData.justification || formData.justification.length < 10) {
      return false;
    }

    // Must have at least one item
    if (!formData.items || formData.items.length === 0) {
      return false;
    }

    // All items must have valid inventory item IDs for workflow
    return formData.items.every(
      item => item.item_id && !isNaN(parseInt(item.item_id)) && parseInt(item.item_id) > 0
    );
  }

  /**
   * Validate form data for draft submission
   * Relaxed validation for saving incomplete forms
   */
  static validateDraftFormat(formData: FormData): ValidationResult {
    const errors: Record<string, string> = {};

    // Only basic validation for drafts
    if (formData.items && formData.items.length > 0) {
      formData.items.forEach((item, index) => {
        if (item.quantity !== undefined && item.quantity <= 0) {
          errors[`items.${index}.quantity`] = 'Quantity must be greater than 0';
        }
        if (item.estimated_cost !== undefined && item.estimated_cost <= 0) {
          errors[`items.${index}.estimated_cost`] = 'Estimated cost must be greater than 0';
        }
      });
    }

    const isValid = Object.keys(errors).length === 0;

    return {
      isValid,
      errors,
      canSubmitAsDraft: isValid,
      canSubmitForApproval: false, // Need full validation for approval
      canCreateWithWorkflow: false, // Need full validation for workflow
    };
  }

  /**
   * Get current user ID from authentication context
   * TODO: Replace with actual auth context implementation
   */
  static getCurrentUserId(): number {
    // Placeholder implementation - should be replaced with actual auth context
    return 1;
  }

  /**
   * Transform workflow response to standard format
   * Normalizes workflow API response for consistent handling
   */
  static normalizeWorkflowResponse(response: WorkflowRequisitionResponse): {
    id: number;
    pr_number: string;
    workflow_run_id: number;
    status: 'submitted';
  } {
    return {
      id: response.pr_id,
      pr_number: response.pr_number,
      workflow_run_id: response.workflow_run_id,
      status: response.status,
    };
  }

  /**
   * Calculate total estimated cost from form items
   */
  static calculateTotalEstimatedCost(formData: FormData): number {
    return formData.items.reduce((total, item) => total + item.quantity * item.estimated_cost, 0);
  }

  /**
   * Check if form has unsaved changes
   * Compares current form data with original data
   */
  static hasUnsavedChanges(currentData: FormData, originalData: FormData): boolean {
    return JSON.stringify(currentData) !== JSON.stringify(originalData);
  }

  /**
   * Sanitize form data before submission
   * Removes empty strings and normalizes data
   */
  static sanitizeFormData(formData: FormData): FormData {
    return {
      ...formData,
      department_id: formData.department_id.trim(),
      title: formData.title.trim(),
      justification: formData.justification.trim(),
      budget_code: formData.budget_code.trim(),
      notes: formData.notes.trim(),
      items: formData.items.map(item => ({
        ...item,
        specification: item.specification.trim(),
        justification: item.justification.trim(),
        budget_code: item.budget_code.trim(),
        notes: item.notes.trim(),
      })),
    };
  }
}
