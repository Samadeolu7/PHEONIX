import { useState, useCallback, useEffect, useRef } from 'react';
import {
  EnhancedFormValidator,
  RequisitionFormData,
  SubmissionType,
  ValidationState,
} from '../utils/EnhancedFormValidator';

export interface RealTimeValidationOptions {
  debounceMs?: number;
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  showSubmissionTypeHints?: boolean;
  enableRealTimeIndicators?: boolean;
}

export interface FieldValidationState {
  isValid: boolean;
  hasError: boolean;
  errorMessage: string;
  submissionTypeErrors: Record<SubmissionType, string>;
  showError: boolean;
  isTouched: boolean;
  isValidForSubmission: Record<SubmissionType, boolean>;
}

export interface RealTimeValidationReturn {
  // Overall validation state
  validationState: ValidationState;

  // Field-level validation
  getFieldValidation: (fieldName: string) => FieldValidationState;
  markFieldTouched: (fieldName: string) => void;
  clearFieldError: (fieldName: string) => void;

  // Real-time feedback
  handleFieldChange: (fieldName: string, value: any) => void;
  handleFieldBlur: (fieldName: string) => void;

  // Submission type validation
  getSubmissionValidation: (submissionType: SubmissionType) => {
    isValid: boolean;
    canSubmit: boolean;
    errors: string[];
    validationMessage: string;
  };

  // Visual indicators
  getSubmissionTypeIndicators: () => {
    draft: { available: boolean; errors: string[] };
    manual: { available: boolean; errors: string[] };
    workflow: { available: boolean; errors: string[] };
  };

  // State management
  touchedFields: Record<string, boolean>;
  resetValidation: () => void;
  validateAll: () => ValidationState;
}

/**
 * Real-time validation hook for enhanced form validation feedback
 * Provides immediate validation feedback as users interact with form fields
 */
export const useRealTimeValidation = (
  formData: RequisitionFormData,
  options: RealTimeValidationOptions = {}
): RealTimeValidationReturn => {
  const {
    debounceMs = 300,
    validateOnChange = true,
    validateOnBlur = true,
    showSubmissionTypeHints = true,
    enableRealTimeIndicators = true,
  } = options;

  // State
  const [validationState, setValidationState] = useState<ValidationState>(() => {
    // Initialize with empty validation state to prevent showing errors immediately
    return {
      isValid: true,
      errors: {},
      canSubmitAsDraft: true,
      canSubmitForApproval: false,
      canCreateWithWorkflow: false,
      submissionTypeErrors: {
        draft: [],
        manual: [],
        workflow: [],
      },
    };
  });

  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Refs for debouncing
  const debounceTimeouts = useRef<Record<string, NodeJS.Timeout>>({});
  const lastValidationData = useRef<string>('');

  // Memoized validation functions
  const validateFormState = useCallback((): ValidationState => {
    return EnhancedFormValidator.validateFormState(formData);
  }, [formData]);

  const validateForSubmission = useCallback(
    (submissionType: SubmissionType) => {
      return EnhancedFormValidator.validateForSubmission(formData, submissionType);
    },
    [formData]
  );

  // Debounced validation update
  const updateValidationState = useCallback(
    (immediate = false) => {
      const currentDataString = JSON.stringify(formData);

      // Skip if data hasn't changed
      if (currentDataString === lastValidationData.current && !immediate) {
        return;
      }

      lastValidationData.current = currentDataString;

      const updateValidation = () => {
        const newValidationState = validateFormState();
        setValidationState(newValidationState);

        // Update field errors from validation state
        setFieldErrors(newValidationState.errors);
      };

      if (immediate) {
        updateValidation();
      } else {
        // Clear existing timeout
        if (debounceTimeouts.current.global) {
          clearTimeout(debounceTimeouts.current.global);
        }

        // Set new timeout
        debounceTimeouts.current.global = setTimeout(updateValidation, debounceMs);
      }
    },
    [formData, validateFormState, debounceMs]
  );

  // Field-level validation
  const getFieldValidation = useCallback(
    (fieldName: string): FieldValidationState => {
      const hasError = !!fieldErrors[fieldName];
      const isTouched = touchedFields[fieldName] || false;
      const errorMessage = fieldErrors[fieldName] || '';

      // Get submission-type-specific validation
      const submissionTypeErrors: Record<SubmissionType, string> = {
        draft: '',
        manual: '',
        workflow: '',
      };

      const isValidForSubmission: Record<SubmissionType, boolean> = {
        draft: true,
        manual: true,
        workflow: true,
      };

      if (showSubmissionTypeHints) {
        (['draft', 'manual', 'workflow'] as SubmissionType[]).forEach(submissionType => {
          const submissionValidation = validateForSubmission(submissionType);
          const fieldSpecificErrors = submissionValidation.errors.filter(
            error =>
              error.toLowerCase().includes(fieldName.toLowerCase()) ||
              (fieldName.includes('.') && error.includes(fieldName.split('.')[0]))
          );

          if (fieldSpecificErrors.length > 0) {
            submissionTypeErrors[submissionType] = fieldSpecificErrors[0];
            isValidForSubmission[submissionType] = false;
          }
        });
      }

      return {
        isValid: !hasError,
        hasError,
        errorMessage,
        submissionTypeErrors,
        showError: isTouched && hasError,
        isTouched,
        isValidForSubmission,
      };
    },
    [fieldErrors, touchedFields, validateForSubmission, showSubmissionTypeHints]
  );

  // Field interaction handlers
  const markFieldTouched = useCallback((fieldName: string) => {
    setTouchedFields(prev => ({
      ...prev,
      [fieldName]: true,
    }));
  }, []);

  const clearFieldError = useCallback((fieldName: string) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  }, []);

  const handleFieldChange = useCallback(
    (fieldName: string, value: any) => {
      // Clear field error immediately when user starts typing
      if (fieldErrors[fieldName]) {
        clearFieldError(fieldName);
      }

      // Trigger validation if enabled
      if (validateOnChange) {
        // Clear existing field-specific timeout
        if (debounceTimeouts.current[fieldName]) {
          clearTimeout(debounceTimeouts.current[fieldName]);
        }

        // Set field-specific debounced validation
        debounceTimeouts.current[fieldName] = setTimeout(() => {
          updateValidationState();
        }, debounceMs);
      }
    },
    [fieldErrors, clearFieldError, validateOnChange, updateValidationState, debounceMs]
  );

  const handleFieldBlur = useCallback(
    (fieldName: string) => {
      markFieldTouched(fieldName);

      if (validateOnBlur) {
        // Clear any pending debounced validation for this field
        if (debounceTimeouts.current[fieldName]) {
          clearTimeout(debounceTimeouts.current[fieldName]);
        }

        // Validate immediately on blur
        updateValidationState(true);
      }
    },
    [markFieldTouched, validateOnBlur, updateValidationState]
  );

  // Submission validation
  const getSubmissionValidation = useCallback(
    (submissionType: SubmissionType) => {
      const validation = validateForSubmission(submissionType);

      let canSubmit = false;
      switch (submissionType) {
        case 'draft':
          canSubmit = validationState.canSubmitAsDraft;
          break;
        case 'manual':
          canSubmit = validationState.canSubmitForApproval;
          break;
        case 'workflow':
          canSubmit = validationState.canCreateWithWorkflow;
          break;
      }

      const validationMessage =
        validation.errors.length > 0
          ? `Cannot ${getSubmissionActionLabel(submissionType)}: ${validation.errors.length} validation error${validation.errors.length !== 1 ? 's' : ''}`
          : '';

      return {
        isValid: validation.isValid,
        canSubmit,
        errors: validation.errors,
        validationMessage,
      };
    },
    [validateForSubmission, validationState]
  );

  // Submission type indicators
  const getSubmissionTypeIndicators = useCallback(() => {
    return {
      draft: {
        available: validationState.canSubmitAsDraft,
        errors: validationState.submissionTypeErrors.draft,
      },
      manual: {
        available: validationState.canSubmitForApproval,
        errors: validationState.submissionTypeErrors.manual,
      },
      workflow: {
        available: validationState.canCreateWithWorkflow,
        errors: validationState.submissionTypeErrors.workflow,
      },
    };
  }, [validationState]);

  // Reset validation
  const resetValidation = useCallback(() => {
    setValidationState(EnhancedFormValidator.validateFormState(formData));
    setTouchedFields({});
    setFieldErrors({});

    // Clear all timeouts
    Object.values(debounceTimeouts.current).forEach(timeout => {
      if (timeout) clearTimeout(timeout);
    });
    debounceTimeouts.current = {};

    lastValidationData.current = '';
  }, [formData]);

  const validateAll = useCallback((): ValidationState => {
    const newValidationState = validateFormState();
    setValidationState(newValidationState);
    setFieldErrors(newValidationState.errors);

    // Mark all fields with errors as touched
    const newTouchedFields: Record<string, boolean> = { ...touchedFields };
    Object.keys(newValidationState.errors).forEach(fieldName => {
      newTouchedFields[fieldName] = true;
    });
    setTouchedFields(newTouchedFields);

    return newValidationState;
  }, [validateFormState, touchedFields]);

  // Update validation when form data changes, but only if user has interacted with the form
  useEffect(() => {
    // Only run validation if at least one field has been touched
    const hasAnyTouchedFields = Object.keys(touchedFields).length > 0;

    if (validateOnChange && hasAnyTouchedFields) {
      updateValidationState();
    }

    // Cleanup timeouts on unmount
    return () => {
      Object.values(debounceTimeouts.current).forEach(timeout => {
        if (timeout) clearTimeout(timeout);
      });
    };
  }, [formData, validateOnChange, updateValidationState, touchedFields]);

  return {
    validationState,
    getFieldValidation,
    markFieldTouched,
    clearFieldError,
    handleFieldChange,
    handleFieldBlur,
    getSubmissionValidation,
    getSubmissionTypeIndicators,
    touchedFields,
    resetValidation,
    validateAll,
  };
};

/**
 * Get user-friendly action label for submission type
 */
function getSubmissionActionLabel(submissionType: SubmissionType): string {
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

export default useRealTimeValidation;
