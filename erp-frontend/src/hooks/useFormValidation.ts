import { useState, useCallback, useEffect } from 'react';
import {
  ValidationRule,
  ValidationResult,
  FieldValidationResult,
  validateField,
  validateFields,
  isFormValid,
  getAllErrors,
  createDebouncedValidator,
} from '../utils/validation';

export interface UseFormValidationOptions {
  validateOnChange?: boolean;
  validateOnBlur?: boolean;
  debounceMs?: number;
}

export interface FormValidationState {
  validationResults: FieldValidationResult;
  isValid: boolean;
  errors: string[];
  touched: Record<string, boolean>;
}

export const useFormValidation = <T extends Record<string, any>>(
  schema: Record<keyof T, ValidationRule<any>[]>,
  options: UseFormValidationOptions = {}
) => {
  const { validateOnChange = true, validateOnBlur = true, debounceMs = 300 } = options;

  const [validationState, setValidationState] = useState<FormValidationState>({
    validationResults: {},
    isValid: true,
    errors: [],
    touched: {},
  });

  // Create debounced validators for each field
  const debouncedValidators = useCallback(() => {
    const validators: Record<string, any> = {};

    Object.keys(schema).forEach(fieldName => {
      validators[fieldName] = createDebouncedValidator(
        (value: any) => validateField(value, schema[fieldName]),
        debounceMs
      );
    });

    return validators;
  }, [schema, debounceMs]);

  const validators = debouncedValidators();

  // Validate a single field
  const validateSingleField = useCallback(
    (fieldName: keyof T, value: any, immediate = false) => {
      const rules = schema[fieldName];
      if (!rules) return;

      if (immediate) {
        const result = validateField(value, rules);
        setValidationState(prev => {
          const newResults = {
            ...prev.validationResults,
            [fieldName]: result,
          };
          return {
            ...prev,
            validationResults: newResults,
            isValid: isFormValid(newResults),
            errors: getAllErrors(newResults),
          };
        });
      } else {
        validators[fieldName as string](value, (result: ValidationResult) => {
          setValidationState(prev => {
            const newResults = {
              ...prev.validationResults,
              [fieldName]: result,
            };
            return {
              ...prev,
              validationResults: newResults,
              isValid: isFormValid(newResults),
              errors: getAllErrors(newResults),
            };
          });
        });
      }
    },
    [schema, validators]
  );

  // Validate all fields
  const validateAllFields = useCallback(
    (data: T, immediate = true) => {
      const results = validateFields(data, schema);
      setValidationState(prev => ({
        ...prev,
        validationResults: results,
        isValid: isFormValid(results),
        errors: getAllErrors(results),
      }));
      return results;
    },
    [schema]
  );

  // Mark field as touched
  const markFieldTouched = useCallback((fieldName: keyof T) => {
    setValidationState(prev => ({
      ...prev,
      touched: {
        ...prev.touched,
        [fieldName]: true,
      },
    }));
  }, []);

  // Handle field change
  const handleFieldChange = useCallback(
    (fieldName: keyof T, value: any, formData?: T) => {
      if (validateOnChange) {
        validateSingleField(fieldName, value);
      }
    },
    [validateOnChange, validateSingleField]
  );

  // Handle field blur
  const handleFieldBlur = useCallback(
    (fieldName: keyof T, value: any) => {
      markFieldTouched(fieldName);
      if (validateOnBlur) {
        validateSingleField(fieldName, value, true);
      }
    },
    [validateOnBlur, validateSingleField, markFieldTouched]
  );

  // Get field validation state
  const getFieldValidation = useCallback(
    (fieldName: keyof T) => {
      const result = validationState.validationResults[fieldName as string];
      const isTouched = validationState.touched[fieldName as string];

      return {
        isValid: !result || result.isValid,
        errors: result?.errors || [],
        showErrors: isTouched && result && !result.isValid,
        isTouched,
      };
    },
    [validationState]
  );

  // Reset validation state
  const resetValidation = useCallback(() => {
    setValidationState({
      validationResults: {},
      isValid: true,
      errors: [],
      touched: {},
    });
  }, []);

  // Check if field has errors
  const hasFieldError = useCallback(
    (fieldName: keyof T) => {
      const result = validationState.validationResults[fieldName as string];
      return result && !result.isValid;
    },
    [validationState.validationResults]
  );

  // Get field error message
  const getFieldError = useCallback(
    (fieldName: keyof T) => {
      const result = validationState.validationResults[fieldName as string];
      return result?.errors?.[0] || '';
    },
    [validationState.validationResults]
  );

  return {
    // State
    validationResults: validationState.validationResults,
    isValid: validationState.isValid,
    errors: validationState.errors,
    touched: validationState.touched,

    // Methods
    validateField: validateSingleField,
    validateAllFields,
    handleFieldChange,
    handleFieldBlur,
    markFieldTouched,
    getFieldValidation,
    resetValidation,
    hasFieldError,
    getFieldError,
  };
};

// Hook for simple field validation
export const useFieldValidation = <T>(
  rules: ValidationRule<T>[],
  options: { debounceMs?: number } = {}
) => {
  const { debounceMs = 300 } = options;
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    errors: [],
  });
  const [isTouched, setIsTouched] = useState(false);

  const debouncedValidator = useCallback(
    createDebouncedValidator((value: T) => validateField(value, rules), debounceMs),
    [rules, debounceMs]
  );

  const validate = useCallback(
    (value: T, immediate = false) => {
      if (immediate) {
        const result = validateField(value, rules);
        setValidationResult(result);
        return result;
      } else {
        debouncedValidator(value, setValidationResult);
      }
    },
    [rules, debouncedValidator]
  );

  const markTouched = useCallback(() => {
    setIsTouched(true);
  }, []);

  const reset = useCallback(() => {
    setValidationResult({ isValid: true, errors: [] });
    setIsTouched(false);
  }, []);

  return {
    validationResult,
    isTouched,
    validate,
    markTouched,
    reset,
    isValid: validationResult.isValid,
    errors: validationResult.errors,
    showErrors: isTouched && !validationResult.isValid,
  };
};

export default useFormValidation;
