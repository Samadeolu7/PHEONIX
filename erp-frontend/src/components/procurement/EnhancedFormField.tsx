import React, { forwardRef, useCallback } from 'react';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';
import { SubmissionType, ValidationState } from '../../utils/EnhancedFormValidator';
import { FieldValidationState } from '../../hooks/useRealTimeValidation';
import { FieldValidation } from './ValidationFeedback';

export interface EnhancedFormFieldProps {
  // Basic field props
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'date' | 'email';
  value: string | number;
  onChange: (value: any) => void;
  onBlur?: () => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;

  // Validation props
  fieldValidation?: FieldValidationState;
  validationState?: ValidationState;
  submissionType?: SubmissionType;
  showSubmissionTypeHints?: boolean;

  // Visual props
  size?: 'sm' | 'md' | 'lg';
  variant?: 'default' | 'outlined' | 'filled';

  // Select/textarea specific
  options?: Array<{ value: string | number; label: string }>;
  rows?: number;

  // Additional props
  helpText?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;

  // Styling
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Enhanced form field component with real-time validation feedback
 * and submission-type-aware validation indicators
 */
export const EnhancedFormField = forwardRef<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  EnhancedFormFieldProps
>(
  (
    {
      name,
      label,
      type = 'text',
      value,
      onChange,
      onBlur,
      placeholder,
      required = false,
      disabled = false,
      fieldValidation,
      validationState,
      submissionType,
      showSubmissionTypeHints = false,
      size = 'md',
      variant = 'default',
      options,
      rows = 3,
      helpText,
      maxLength,
      min,
      max,
      step,
      className,
      style,
    },
    ref
  ) => {
    // Determine validation state
    const hasError = fieldValidation?.hasError || false;
    const showError = fieldValidation?.showError || false;
    const errorMessage = fieldValidation?.errorMessage || '';
    const isValid = fieldValidation?.isValid ?? true;
    const isTouched = fieldValidation?.isTouched || false;

    // Size configurations
    const sizeConfig = {
      sm: {
        padding: '8px 12px',
        fontSize: '12px',
        borderRadius: '4px',
        labelSize: '12px',
        helpTextSize: '11px',
      },
      md: {
        padding: '12px',
        fontSize: '14px',
        borderRadius: '8px',
        labelSize: '14px',
        helpTextSize: '12px',
      },
      lg: {
        padding: '16px',
        fontSize: '16px',
        borderRadius: '12px',
        labelSize: '16px',
        helpTextSize: '14px',
      },
    };

    const currentSize = sizeConfig[size];

    // Get border color based on validation state
    const getBorderColor = () => {
      if (disabled) return '#e5e7eb';
      if (showError) return '#ef4444';
      if (isTouched && isValid) return '#10b981';
      return '#e5e7eb';
    };

    // Get background color based on variant and state
    const getBackgroundColor = () => {
      if (disabled) return '#f9fafb';

      switch (variant) {
        case 'filled':
          return showError ? '#fef2f2' : '#f9fafb';
        case 'outlined':
        case 'default':
        default:
          return showError ? '#fef2f2' : 'white';
      }
    };

    // Base input styles
    const inputStyles: React.CSSProperties = {
      width: '100%',
      padding: currentSize.padding,
      fontSize: currentSize.fontSize,
      borderRadius: currentSize.borderRadius,
      border: `2px solid ${getBorderColor()}`,
      backgroundColor: getBackgroundColor(),
      color: disabled ? '#9ca3af' : '#1f2937',
      transition: 'all 0.2s ease-in-out',
      outline: 'none',
      ...style,
    };

    // Focus styles
    const focusStyles = {
      borderColor: showError ? '#ef4444' : '#3b82f6',
      boxShadow: `0 0 0 3px ${showError ? 'rgba(239, 68, 68, 0.1)' : 'rgba(59, 130, 246, 0.1)'}`,
    };

    // Handle change events
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const newValue = type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
        onChange(newValue);
      },
      [onChange, type]
    );

    // Handle blur events
    const handleBlur = useCallback(() => {
      if (onBlur) {
        onBlur();
      }
    }, [onBlur]);

    // Render validation icon
    const renderValidationIcon = () => {
      if (!isTouched) return null;

      if (showError) {
        return <AlertCircle size={16} style={{ color: '#ef4444' }} />;
      }

      if (isValid) {
        return <CheckCircle size={16} style={{ color: '#10b981' }} />;
      }

      return null;
    };

    // Render character count for text inputs
    const renderCharacterCount = () => {
      if (!maxLength || (type !== 'text' && type !== 'textarea')) return null;

      const currentLength = String(value).length;
      const isNearLimit = currentLength > maxLength * 0.8;

      return (
        <div
          style={{
            fontSize: currentSize.helpTextSize,
            color: isNearLimit ? '#f59e0b' : '#6b7280',
            textAlign: 'right',
            marginTop: '4px',
          }}
        >
          {currentLength}/{maxLength}
        </div>
      );
    };

    // Render the appropriate input element
    const renderInput = () => {
      const commonProps = {
        id: name,
        name,
        value,
        onChange: handleChange,
        onBlur: handleBlur,
        placeholder,
        disabled,
        required,
        style: inputStyles,
        className: `enhanced-form-field ${className || ''}`,
        'aria-invalid': showError,
        'aria-describedby': `${name}-help ${name}-error`,
      };

      switch (type) {
        case 'textarea':
          return (
            <textarea
              {...commonProps}
              ref={ref as React.Ref<HTMLTextAreaElement>}
              rows={rows}
              maxLength={maxLength}
              onFocus={e => Object.assign(e.target.style, focusStyles)}
              onBlur={e => {
                Object.assign(e.target.style, inputStyles);
                handleBlur();
              }}
            />
          );

        case 'select':
          return (
            <select
              {...commonProps}
              ref={ref as React.Ref<HTMLSelectElement>}
              onFocus={e => Object.assign(e.target.style, focusStyles)}
              onBlur={e => {
                Object.assign(e.target.style, inputStyles);
                handleBlur();
              }}
            >
              {placeholder && (
                <option value="" disabled>
                  {placeholder}
                </option>
              )}
              {options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          );

        case 'number':
          return (
            <input
              {...commonProps}
              ref={ref as React.Ref<HTMLInputElement>}
              type="number"
              min={min}
              max={max}
              step={step}
              onFocus={e => Object.assign(e.target.style, focusStyles)}
              onBlur={e => {
                Object.assign(e.target.style, inputStyles);
                handleBlur();
              }}
            />
          );

        default:
          return (
            <input
              {...commonProps}
              ref={ref as React.Ref<HTMLInputElement>}
              type={type}
              maxLength={maxLength}
              onFocus={e => Object.assign(e.target.style, focusStyles)}
              onBlur={e => {
                Object.assign(e.target.style, inputStyles);
                handleBlur();
              }}
            />
          );
      }
    };

    return (
      <div className="enhanced-form-field-container" style={{ marginBottom: '20px' }}>
        {/* Label */}
        <label
          htmlFor={name}
          style={{
            display: 'block',
            marginBottom: '8px',
            fontSize: currentSize.labelSize,
            fontWeight: '500',
            color: disabled ? '#9ca3af' : '#374151',
          }}
        >
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
        </label>

        {/* Input container with validation icon */}
        <div style={{ position: 'relative' }}>
          {renderInput()}

          {/* Validation icon */}
          {renderValidationIcon() && (
            <div
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
              }}
            >
              {renderValidationIcon()}
            </div>
          )}
        </div>

        {/* Character count */}
        {renderCharacterCount()}

        {/* Help text */}
        {helpText && !showError && (
          <div
            id={`${name}-help`}
            style={{
              marginTop: '4px',
              fontSize: currentSize.helpTextSize,
              color: '#6b7280',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '4px',
            }}
          >
            <Info size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
            <span>{helpText}</span>
          </div>
        )}

        {/* Validation feedback */}
        {(showError || (showSubmissionTypeHints && validationState)) && (
          <div id={`${name}-error`} style={{ marginTop: '6px' }}>
            <FieldValidation
              fieldName={name}
              error={showError ? errorMessage : undefined}
              submissionType={submissionType}
              validationState={validationState}
              showSubmissionTypeHints={showSubmissionTypeHints}
              touched={isTouched}
            />
          </div>
        )}
      </div>
    );
  }
);

EnhancedFormField.displayName = 'EnhancedFormField';

export default EnhancedFormField;
