import React from 'react';
import { AlertCircle, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { SubmissionType, ValidationState } from '../../utils/EnhancedFormValidator';

export interface ValidationFeedbackProps {
  validationState: ValidationState;
  submissionType?: SubmissionType;
  fieldName?: string;
  showSubmissionTypeIndicators?: boolean;
  variant?: 'inline' | 'card' | 'tooltip';
  size?: 'sm' | 'md' | 'lg';
}

export interface SubmissionTypeIndicatorProps {
  validationState: ValidationState;
  compact?: boolean;
}

export interface FieldValidationProps {
  fieldName: string;
  error?: string;
  submissionType?: SubmissionType;
  validationState?: ValidationState;
  showSubmissionTypeHints?: boolean;
  touched?: boolean;
}

/**
 * Individual field validation feedback component
 */
export const FieldValidation: React.FC<FieldValidationProps> = ({
  fieldName,
  error,
  submissionType,
  validationState,
  showSubmissionTypeHints = false,
  touched = false,
}) => {
  const hasError = !!error;
  const showError = touched && hasError;

  // Get submission-type-specific validation hints
  const getSubmissionTypeHints = () => {
    if (!validationState || !showSubmissionTypeHints) return null;

    const hints: Array<{
      type: SubmissionType;
      message: string;
      severity: 'error' | 'warning' | 'info';
    }> = [];

    // Check each submission type for field-specific issues
    ['draft', 'manual', 'workflow'].forEach(type => {
      const submissionErrors = validationState.submissionTypeErrors[type as SubmissionType];
      const fieldErrors = submissionErrors.filter(err =>
        err.toLowerCase().includes(fieldName.toLowerCase())
      );

      if (fieldErrors.length > 0) {
        hints.push({
          type: type as SubmissionType,
          message: fieldErrors[0],
          severity: type === 'draft' ? 'warning' : 'error',
        });
      }
    });

    return hints;
  };

  const submissionHints = getSubmissionTypeHints();

  if (!showError && (!submissionHints || submissionHints.length === 0)) {
    return null;
  }

  return (
    <div className="field-validation-feedback">
      {/* Primary error message */}
      {showError && (
        <div
          className="field-error-message"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '6px',
            marginTop: '4px',
            color: '#dc2626',
            fontSize: '12px',
            lineHeight: '1.4',
          }}
        >
          <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>{error}</span>
        </div>
      )}

      {/* Submission type hints */}
      {submissionHints && submissionHints.length > 0 && (
        <div className="submission-type-hints" style={{ marginTop: '6px' }}>
          {submissionHints.map((hint, index) => (
            <div
              key={`${hint.type}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '6px',
                marginTop: index > 0 ? '4px' : '0',
                padding: '6px 8px',
                borderRadius: '4px',
                fontSize: '11px',
                lineHeight: '1.3',
                backgroundColor:
                  hint.severity === 'error'
                    ? '#fef2f2'
                    : hint.severity === 'warning'
                      ? '#fffbeb'
                      : '#f0f9ff',
                border: `1px solid ${
                  hint.severity === 'error'
                    ? '#fecaca'
                    : hint.severity === 'warning'
                      ? '#fed7aa'
                      : '#bfdbfe'
                }`,
                color:
                  hint.severity === 'error'
                    ? '#991b1b'
                    : hint.severity === 'warning'
                      ? '#92400e'
                      : '#1e40af',
              }}
            >
              {hint.severity === 'error' && (
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
              )}
              {hint.severity === 'warning' && (
                <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
              )}
              {hint.severity === 'info' && (
                <Info size={12} style={{ flexShrink: 0, marginTop: '1px' }} />
              )}
              <span>
                <strong>{hint.type}:</strong> {hint.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Submission type availability indicators
 */
export const SubmissionTypeIndicators: React.FC<SubmissionTypeIndicatorProps> = ({
  validationState,
  compact = false,
}) => {
  const indicators = [
    {
      type: 'draft' as SubmissionType,
      label: 'Draft',
      available: validationState.canSubmitAsDraft,
      description: 'Save without approval',
      color: '#6b7280',
    },
    {
      type: 'manual' as SubmissionType,
      label: 'Manual',
      available: validationState.canSubmitForApproval,
      description: 'Traditional approval process',
      color: '#3b82f6',
    },
    {
      type: 'workflow' as SubmissionType,
      label: 'Workflow',
      available: validationState.canCreateWithWorkflow,
      description: 'Automated routing',
      color: '#10b981',
    },
  ];

  if (compact) {
    return (
      <div
        className="submission-indicators-compact"
        style={{
          display: 'flex',
          gap: '8px',
          alignItems: 'center',
        }}
      >
        {indicators.map(indicator => (
          <div
            key={indicator.type}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '11px',
              color: indicator.available ? indicator.color : '#9ca3af',
            }}
            title={`${indicator.label}: ${indicator.available ? 'Available' : 'Not available'} - ${indicator.description}`}
          >
            {indicator.available ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
            <span>{indicator.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="submission-indicators-full"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '6px',
        border: '1px solid #e5e7eb',
      }}
    >
      <h4
        style={{
          margin: 0,
          fontSize: '12px',
          fontWeight: '600',
          color: '#374151',
        }}
      >
        Submission Options
      </h4>

      {indicators.map(indicator => (
        <div
          key={indicator.type}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 8px',
            borderRadius: '4px',
            backgroundColor: indicator.available ? '#f0fdf4' : '#fef2f2',
            border: `1px solid ${indicator.available ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {indicator.available ? (
            <CheckCircle size={14} style={{ color: '#16a34a' }} />
          ) : (
            <AlertCircle size={14} style={{ color: '#dc2626' }} />
          )}

          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: '12px',
                fontWeight: '500',
                color: indicator.available ? '#166534' : '#991b1b',
              }}
            >
              {indicator.label}
            </div>
            <div
              style={{
                fontSize: '11px',
                color: indicator.available ? '#15803d' : '#7f1d1d',
              }}
            >
              {indicator.description}
            </div>
          </div>

          {!indicator.available && (
            <div
              style={{
                fontSize: '10px',
                color: '#991b1b',
                fontWeight: '500',
              }}
            >
              {validationState.submissionTypeErrors[indicator.type].length} error
              {validationState.submissionTypeErrors[indicator.type].length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

/**
 * Main validation feedback component
 */
export const ValidationFeedback: React.FC<ValidationFeedbackProps> = ({
  validationState,
  submissionType,
  fieldName,
  showSubmissionTypeIndicators = false,
  variant = 'inline',
  size = 'md',
}) => {
  const hasErrors = Object.keys(validationState.errors).length > 0;
  const hasSubmissionTypeErrors = Object.values(validationState.submissionTypeErrors).some(
    errors => errors.length > 0
  );

  if (!hasErrors && !hasSubmissionTypeErrors && !showSubmissionTypeIndicators) {
    return null;
  }

  const sizeStyles = {
    sm: { fontSize: '11px', padding: '8px', gap: '6px' },
    md: { fontSize: '12px', padding: '12px', gap: '8px' },
    lg: { fontSize: '14px', padding: '16px', gap: '12px' },
  };

  const currentSize = sizeStyles[size];

  const baseStyles = {
    fontSize: currentSize.fontSize,
    lineHeight: '1.4',
  };

  const variantStyles = {
    inline: {
      ...baseStyles,
      display: 'flex',
      flexDirection: 'column' as const,
      gap: currentSize.gap,
    },
    card: {
      ...baseStyles,
      padding: currentSize.padding,
      backgroundColor: '#fef2f2',
      border: '1px solid #fecaca',
      borderRadius: '6px',
      display: 'flex',
      flexDirection: 'column' as const,
      gap: currentSize.gap,
    },
    tooltip: {
      ...baseStyles,
      position: 'absolute' as const,
      zIndex: 1000,
      padding: currentSize.padding,
      backgroundColor: '#1f2937',
      color: 'white',
      borderRadius: '6px',
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      maxWidth: '300px',
    },
  };

  return (
    <div
      className={`validation-feedback validation-feedback-${variant}`}
      style={variantStyles[variant]}
    >
      {/* Field-specific error */}
      {fieldName && validationState.errors[fieldName] && (
        <FieldValidation
          fieldName={fieldName}
          error={validationState.errors[fieldName]}
          submissionType={submissionType}
          validationState={validationState}
          showSubmissionTypeHints={true}
          touched={true}
        />
      )}

      {/* General validation errors */}
      {!fieldName && hasErrors && (
        <div className="general-errors">
          {Object.entries(validationState.errors).map(([field, error]) => (
            <FieldValidation
              key={field}
              fieldName={field}
              error={error}
              submissionType={submissionType}
              validationState={validationState}
              showSubmissionTypeHints={false}
              touched={true}
            />
          ))}
        </div>
      )}

      {/* Submission type specific errors */}
      {submissionType && validationState.submissionTypeErrors[submissionType].length > 0 && (
        <div
          className="submission-type-errors"
          style={{
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            marginTop: '8px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              fontSize: '11px',
              fontWeight: '600',
              color: '#991b1b',
            }}
          >
            <AlertTriangle size={12} />
            <span>Cannot {getSubmissionActionLabel(submissionType)}</span>
          </div>

          <ul
            style={{
              margin: 0,
              paddingLeft: '16px',
              color: '#7f1d1d',
            }}
          >
            {validationState.submissionTypeErrors[submissionType].map((error, index) => (
              <li key={index} style={{ marginBottom: '2px' }}>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Submission type indicators */}
      {showSubmissionTypeIndicators && (
        <div style={{ marginTop: hasErrors || hasSubmissionTypeErrors ? '12px' : '0' }}>
          <SubmissionTypeIndicators
            validationState={validationState}
            compact={variant === 'inline'}
          />
        </div>
      )}
    </div>
  );
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

export default ValidationFeedback;
