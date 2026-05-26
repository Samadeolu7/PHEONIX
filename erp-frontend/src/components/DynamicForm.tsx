import React from 'react';
import { FormSchema } from '../types/forms';
import styled from '@emotion/styled';
import { CascadingAccountSelector } from './CascadingAccountSelector';

const FormField = styled.div`
  margin-bottom: 1rem;

  label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
  }

  .help-text {
    color: #718096;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .error {
    color: red;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .multiselect label {
    display: block;
    margin: 0.25rem 0;
  }
`;

const FormActions = styled.div`
  display: flex;
  gap: 1rem;
  margin-top: 1.5rem;

  button {
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;

    &[type='submit'] {
      background: var(--color-primary, #1a73e8);
      color: white;
      border: none;

      &:hover:not(:disabled) {
        background: var(--color-primary-dark, #1557b0);
      }

      &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
    }

    &[type='button'] {
      background: none;
      border: 1px solid #ddd;

      &:hover {
        background: #f7fafc;
      }
    }
  }
`;

export interface DynamicFormProps {
  schema: FormSchema;
  values: Record<string, any>;
  errors: Record<string, string>;
  onChange: (field: string, value: any) => void;
  onSubmit: () => Promise<void>;
  isSubmitting?: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({
  schema,
  values,
  errors,
  onChange,
  onSubmit,
  onCancel,
  isSubmitting = false,
  submitLabel = 'Save',
}) => {
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isSubmitting) {
      await onSubmit();
    }
  };

  // Safety check for schema
  if (!schema || !schema.fields || !Array.isArray(schema.fields)) {
    console.error('Invalid schema provided to DynamicForm:', schema);
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#718096' }}>
        <p>Form configuration is missing or invalid.</p>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            style={{
              marginTop: '1rem',
              padding: '0.5rem 1rem',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Go Back
          </button>
        )}
      </div>
    );
  }

  const renderField = (field: FormSchema['fields'][0]) => {
    switch (field.type) {
      case 'text':
      case 'email':
        return (
          <input
            id={field.id}
            type={field.type}
            value={values[field.id] ?? ''}
            onChange={e => onChange(field.id, e.target.value)}
            aria-label={field.label}
            required={field.validation?.required}
          />
        );

      case 'money':
      case 'number': {
        const handleNumberChange = (val: string) => {
          if (val === '') {
            onChange(field.id, '');
            return;
          }
          const parsed = field.type === 'money' ? parseFloat(val) : parseInt(val, 10);
          onChange(field.id, isNaN(parsed) ? val : parsed);
        };

        return (
          <input
            id={field.id}
            type="number"
            value={values[field.id] ?? ''}
            onChange={e => handleNumberChange(e.target.value)}
            aria-label={field.label}
            min={field.validation?.min}
            max={field.validation?.max}
            step={field.type === 'money' ? '0.01' : '1'}
            required={field.validation?.required}
          />
        );
      }

      case 'date':
        return (
          <input
            id={field.id}
            type="date"
            value={values[field.id] ?? field.defaultValue ?? ''}
            onChange={e => onChange(field.id, e.target.value)}
            aria-label={field.label}
            required={field.validation?.required}
          />
        );

      case 'textarea':
        return (
          <textarea
            id={field.id}
            value={values[field.id] ?? ''}
            onChange={e => onChange(field.id, e.target.value)}
            aria-label={field.label}
            rows={4}
            required={field.validation?.required}
          />
        );

      case 'select': {
        const optionsArray = field.options ?? [];

        // Normalize options to always have value and label
        // Create a Map to track unique values and avoid duplicate keys
        const optionsMap = new Map<string, { value: string; label: string }>();

        optionsArray.forEach((opt: any, _index: number) => {
          let normalizedValue: string;
          let normalizedLabel: string;

          if (typeof opt === 'string' || typeof opt === 'number') {
            normalizedValue = String(opt);
            normalizedLabel = String(opt);
          } else if (typeof opt === 'object' && opt !== null) {
            // Handle both {value, label} and {label, value} structures
            normalizedValue = String(opt.value ?? opt.label ?? opt);
            normalizedLabel = String(opt.label ?? opt.value ?? opt);
          } else {
            normalizedValue = String(opt);
            normalizedLabel = String(opt);
          }

          // Only add if we haven't seen this value before
          if (!optionsMap.has(normalizedValue)) {
            optionsMap.set(normalizedValue, {
              value: normalizedValue,
              label: normalizedLabel,
            });
          }
        });

        const normalizedOptions = Array.from(optionsMap.values());

        return (
          <select
            id={field.id}
            value={values[field.id] ?? ''}
            onChange={e => onChange(field.id, e.target.value)}
            aria-label={field.label}
            required={field.validation?.required}
          >
            <option value="">Select...</option>
            {normalizedOptions.map(option => (
              <option key={`${field.id}-${option.value}`} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );
      }

      case 'checkbox':
        return (
          <input
            id={field.id}
            type="checkbox"
            checked={Boolean(values[field.id])}
            onChange={e => onChange(field.id, e.target.checked)}
            aria-label={field.label}
          />
        );

      case 'account_select': {
        // Custom field type for hierarchical account selection
        const fieldConfig = (field as any).config || {};
        const accountTypes = fieldConfig.account_types || [];

        return (
          <CascadingAccountSelector
            value={values[field.id] || null}
            onChange={accountId => onChange(field.id, accountId)}
            filterTypes={accountTypes}
            placeholder={fieldConfig.placeholder || 'Select account'}
            required={field.validation?.required}
          />
        );
      }

      default:
        return (
          <input
            id={field.id}
            type="text"
            value={values[field.id] ?? ''}
            onChange={e => onChange(field.id, e.target.value)}
            aria-label={field.label}
            required={field.validation?.required}
          />
        );
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {schema.fields.map(field => (
        <FormField key={field.id}>
          <label htmlFor={field.id}>
            {field.label}
            {field.validation?.required && <span style={{ color: 'red' }}> *</span>}
          </label>
          {renderField(field)}
          {field.helpText && <div className="help-text">{field.helpText}</div>}
          {errors[field.id] && <span className="error">{errors[field.id]}</span>}
        </FormField>
      ))}

      <FormActions>
        <button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        )}
      </FormActions>
    </form>
  );
};
