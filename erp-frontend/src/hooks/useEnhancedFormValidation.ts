import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  EnhancedFormValidator,
  RequisitionFormData,
  SubmissionType,
  ValidationState,
  EnhancedValidationResult,
  UseEnhancedValidationReturn,
} from '../utils/EnhancedFormValidator';

export interface UseEnhancedFormValidationOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
  initialSubmissionType?: SubmissionType;
}

/**
 * Enhanced form validation hook for dual requisition workflow
 * Provides submission-type-aware validation with real-time feedback
 */
export const useEnhancedFormValidation = (
  formData: RequisitionFormData,
  options: UseEnhancedFormValidationOptions = {}
): UseEnhancedValidationReturn => {
  const {
    validateOnChange = true,
    validateOnBlur = true,
    debounceMs = 300,
    initialSubmissionType = 'manual',
  } = options;

  // Validation state
  const [validationState, setValidationState] = useState<ValidationState>(() =>
    EnhancedFormValidator.validateFormState(formData)
  );

  const [currentSubmissionType, setCurrentSubmissionType] =
    useState<SubmissionType>(initialSubmissionType);

  const [touchedFields, setTouchedFields] = useState<Record<string, boolean>>({});
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  // Memoized validation functions
  const validateForSubmission = useCallback(
    (submissionType: SubmissionType): EnhancedValidationResult => {
      return EnhancedFormValidator.validateForSubmission(formData, submissionType);
    },
    [formData]
  );

  const validateFormState = useCallback((): ValidationState => {
    return EnhancedFormValidator.validateFormState(formData);
  }, [formData]);

  const getSubmissionValidationMessage = useCallback(
    (submissionType: SubmissionType): string => {
      return EnhancedFormValidator.getSubmissionValidationMessage(submissionType, validationState);
    },
    [validationState]
  );

  const isFieldValidForSubmission = useCallback(
    (fieldName: string, submissionType: SubmissionType): boolean => {
      return EnhancedFormValidator.isFieldValidForSubmission(fieldName, formData, submissionType);
    },
    [formData]
  );

  const getFieldValidationMessage = useCallback(
    (fieldName: string, submissionType: SubmissionType): string => {
      return EnhancedFormValidator.getFieldValidationMessage(fieldName, formData, submissionType);
    },
    [formData]
  );

  // Debounced validation update
  const updateValidationState = useCallback(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }

    const timeout = setTimeout(() => {
      const newValidationState = validateFormState();
      setValidationState(newValidationState);
    }, debounceMs);

    setDebounceTimeout(timeout);
  }, [validateFormState, debounceMs, debounceTimeout]);

  // Immediate validation update (for blur events)
  const updateValidationStateImmediate = useCallback(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      setDebounceTimeout(null);
    }

    const newValidationState = validateFormState();
    setValidationState(newValidationState);
  }, [validateFormState, debounceTimeout]);

  // Update validation when form data changes
  useEffect(() => {
    if (validateOnChange) {
      updateValidationState();
    }

    // Cleanup timeout on unmount
    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [formData, validateOnChange, updateValidationState]);

  // Field-level validation helpers
  const markFieldTouched = useCallback((fieldName: string) => {
    setTouchedFields(prev => ({
      ...prev,
      [fieldName]: true,
    }));
  }, []);

  const handleFieldBlur = useCallback(
    (fieldName: string) => {
      markFieldTouched(fieldName);
      if (validateOnBlur) {
        updateValidationStateImmediate();
      }
    },
    [markFieldTouched, validateOnBlur, updateValidationStateImmediate]
  );

  const handleFieldChange = useCallback(
    (fieldName: string) => {
      // Clear field error when user starts typing
      if (validationState.errors[fieldName]) {
        setValidationState(prev => ({
          ...prev,
          errors: {
            ...prev.errors,
            [fieldName]: '',
          },
        }));
      }
    },
    [validationState.errors]
  );

  // Get field validation state for UI display
  const getFieldValidation = useCallback(
    (fieldName: string, submissionType?: SubmissionType) => {
      const isTouched = touchedFields[fieldName];
      const hasError = !!validationState.errors[fieldName];
      const errorMessage = validationState.errors[fieldName] || '';

      // If submission type is specified, check submission-specific validation
      let isValidForSubmission = true;
      let submissionErrorMessage = '';

      if (submissionType) {
        isValidForSubmission = isFieldValidForSubmission(fieldName, submissionType);
        submissionErrorMessage = getFieldValidationMessage(fieldName, submissionType);
      }

      return {
        isValid: !hasError && isValidForSubmission,
        hasError,
        errorMessage,
        submissionErrorMessage,
        showError: isTouched && (hasError || !isValidForSubmission),
        isTouched,
        isValidForSubmission,
      };
    },
    [touchedFields, validationState.errors, isFieldValidForSubmission, getFieldValidationMessage]
  );

  // Get submission button states
  const getSubmissionButtonState = useCallback(
    (submissionType: SubmissionType) => {
      const validationResult = validateForSubmission(submissionType);
      const validationMessage = getSubmissionValidationMessage(submissionType);

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

      return {
        canSubmit,
        isValid: validationResult.isValid,
        errors: validationResult.errors,
        validationMessage,
        disabled: !canSubmit,
      };
    },
    [validateForSubmission, getSubmissionValidationMessage, validationState]
  );

  // Reset validation state
  const resetValidation = useCallback(() => {
    setValidationState(EnhancedFormValidator.validateFormState(formData));
    setTouchedFields({});
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      setDebounceTimeout(null);
    }
  }, [formData, debounceTimeout]);

  // Get validation summary for all submission types
  const getValidationSummary = useCallback(() => {
    return {
      draft: getSubmissionButtonState('draft'),
      manual: getSubmissionButtonState('manual'),
      workflow: getSubmissionButtonState('workflow'),
    };
  }, [getSubmissionButtonState]);

  // Memoized return object to prevent unnecessary re-renders
  const returnValue = useMemo(
    () => ({
      validationState,
      validateForSubmission,
      validateFormState,
      getSubmissionValidationMessage,
      isFieldValidForSubmission,
      getFieldValidationMessage,

      // Additional helper methods
      markFieldTouched,
      handleFieldBlur,
      handleFieldChange,
      getFieldValidation,
      getSubmissionButtonState,
      resetValidation,
      getValidationSummary,

      // State
      touchedFields,
      currentSubmissionType,
      setCurrentSubmissionType,
    }),
    [
      validationState,
      validateForSubmission,
      validateFormState,
      getSubmissionValidationMessage,
      isFieldValidForSubmission,
      getFieldValidationMessage,
      markFieldTouched,
      handleFieldBlur,
      handleFieldChange,
      getFieldValidation,
      getSubmissionButtonState,
      resetValidation,
      getValidationSummary,
      touchedFields,
      currentSubmissionType,
    ]
  );

  return returnValue;
};

// Additional hook for simple field validation
export const useEnhancedFieldValidation = (
  fieldName: string,
  formData: RequisitionFormData,
  submissionType: SubmissionType,
  options: { debounceMs?: number } = {}
) => {
  const { debounceMs = 300 } = options;
  const [isTouched, setIsTouched] = useState(false);
  const [debounceTimeout, setDebounceTimeout] = useState<NodeJS.Timeout | null>(null);

  const [validationResult, setValidationResult] = useState(() => ({
    isValid: EnhancedFormValidator.isFieldValidForSubmission(fieldName, formData, submissionType),
    errorMessage: EnhancedFormValidator.getFieldValidationMessage(
      fieldName,
      formData,
      submissionType
    ),
  }));

  const validateField = useCallback(
    (immediate = false) => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }

      const updateValidation = () => {
        const isValid = EnhancedFormValidator.isFieldValidForSubmission(
          fieldName,
          formData,
          submissionType
        );
        const errorMessage = EnhancedFormValidator.getFieldValidationMessage(
          fieldName,
          formData,
          submissionType
        );

        setValidationResult({ isValid, errorMessage });
      };

      if (immediate) {
        updateValidation();
      } else {
        const timeout = setTimeout(updateValidation, debounceMs);
        setDebounceTimeout(timeout);
      }
    },
    [fieldName, formData, submissionType, debounceMs, debounceTimeout]
  );

  const markTouched = useCallback(() => {
    setIsTouched(true);
  }, []);

  const handleBlur = useCallback(() => {
    markTouched();
    validateField(true);
  }, [markTouched, validateField]);

  const reset = useCallback(() => {
    setIsTouched(false);
    setValidationResult({
      isValid: true,
      errorMessage: '',
    });
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      setDebounceTimeout(null);
    }
  }, [debounceTimeout]);

  // Update validation when dependencies change
  useEffect(() => {
    validateField();

    return () => {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
    };
  }, [formData, submissionType]);

  return {
    isValid: validationResult.isValid,
    errorMessage: validationResult.errorMessage,
    showError: isTouched && !validationResult.isValid,
    isTouched,
    validateField,
    markTouched,
    handleBlur,
    reset,
  };
};

export default useEnhancedFormValidation;
