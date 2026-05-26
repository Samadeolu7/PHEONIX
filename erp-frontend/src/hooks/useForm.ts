import { useState, useCallback } from 'react';
import { FormSchema, FormValues } from '../types/forms';
import { useApi } from './useApi';

export const useForm = (formSchema: FormSchema) => {
  const [values, setValues] = useState<FormValues>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const api = useApi();

  const validate = useCallback(
    (values: FormValues) => {
      const errors: Record<string, string> = {};

      formSchema.fields.forEach(field => {
        const value = values[field.id];
        const validation = field.validation;

        if (!validation) return;

        if (validation.required && !value) {
          errors[field.id] = `${field.label} is required`;
        }

        if (validation.pattern && value && !new RegExp(validation.pattern).test(value)) {
          errors[field.id] = validation.message || `${field.label} is invalid`;
        }

        if (validation.min !== undefined && Number(value) < validation.min) {
          errors[field.id] = `${field.label} must be at least ${validation.min}`;
        }

        if (validation.max !== undefined && Number(value) > validation.max) {
          errors[field.id] = `${field.label} must be at most ${validation.max}`;
        }
      });

      return errors;
    },
    [formSchema]
  );

  const handleChange = useCallback((fieldId: string, value: any) => {
    setValues(prev => ({
      ...prev,
      [fieldId]: value,
    }));

    // Clear error when field is modified
    setErrors(prev => ({
      ...prev,
      [fieldId]: undefined,
    }));
  }, []);

  const handleSubmit = useCallback(
    async (
      automationTemplateId: number,
      onSuccess?: (data: any) => void,
      onError?: (error: any) => void
    ) => {
      setIsSubmitting(true);
      const validationErrors = validate(values);

      if (Object.keys(validationErrors).length > 0) {
        setErrors(validationErrors);
        setIsSubmitting(false);
        return;
      }

      try {
        const response = await api.post(`/api/automations/templates/${automationTemplateId}/run/`, {
          form_data: values,
        });

        if (onSuccess) {
          onSuccess(response.data);
        }
      } catch (error) {
        if (onError) {
          onError(error);
        }
      } finally {
        setIsSubmitting(false);
      }
    },
    [api, validate, values]
  );

  const reset = useCallback(() => {
    setValues({});
    setErrors({});
  }, []);

  return {
    values,
    errors,
    isSubmitting,
    handleChange,
    handleSubmit,
    reset,
  };
};
