import React from 'react';
import { Save, Send, Workflow, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { ValidationState } from '../../utils/EnhancedFormValidator';
import './ActionButtonsSection.css';

export interface ActionButtonConfig {
  id: 'draft' | 'manual' | 'workflow';
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  variant: 'secondary' | 'primary' | 'accent';
  disabled: boolean;
  loading: boolean;
  onClick: () => Promise<void>;
  ariaLabel: string;
  description: string;
  canSubmit: boolean;
  validationErrors: string[];
}

export interface ActionButtonsSectionProps {
  formValid: boolean;
  processing: boolean;
  submissionType: 'draft' | 'manual' | 'workflow' | null;
  validationState?: ValidationState;
  showValidationIndicators?: boolean;
  onSaveAsDraft: () => Promise<void>;
  onSubmitForApproval: () => Promise<void>;
  onCreateWithWorkflow: () => Promise<void>;
}

const ActionButton: React.FC<{ config: ActionButtonConfig }> = ({ config }) => {
  const {
    id,
    label,
    icon: Icon,
    variant,
    disabled,
    loading,
    onClick,
    ariaLabel,
    description,
    canSubmit,
    validationErrors,
  } = config;

  const getVariantStyles = () => {
    const baseStyles = {
      width: '100%',
      padding: '12px 16px',
      borderRadius: '8px',
      fontSize: '14px',
      fontWeight: '600',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '8px',
      transition: 'all 0.2s ease-in-out',
      cursor: disabled ? 'not-allowed' : 'pointer',
      position: 'relative' as const,
      minHeight: '44px', // Ensure consistent height
    };

    switch (variant) {
      case 'secondary':
        return {
          ...baseStyles,
          border: '1px solid #d1d5db',
          background: disabled ? '#f9fafb' : 'white',
          color: disabled ? '#9ca3af' : '#374151',
        };
      case 'primary':
        return {
          ...baseStyles,
          border: 'none',
          background: disabled ? '#9ca3af' : '#3b82f6',
          color: 'white',
        };
      case 'accent':
        return {
          ...baseStyles,
          border: 'none',
          background: disabled ? '#9ca3af' : '#10b981',
          color: 'white',
        };
      default:
        return baseStyles;
    }
  };

  const getButtonClassName = () => {
    const baseClass = 'action-button';
    const variantClass = `action-button-${variant}`;
    return `${baseClass} ${variantClass}`;
  };

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!disabled && !loading) {
      await onClick();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled && !loading) {
        onClick();
      }
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={getButtonClassName()}
        style={getVariantStyles()}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-label={ariaLabel}
        aria-describedby={`${id}-description ${id}-validation`}
        aria-busy={loading}
        data-testid={`action-button-${id}`}
      >
        {loading ? <Loader2 size={16} className="action-button-spinner" /> : <Icon size={16} />}
        <span>{label}</span>

        {/* Validation indicator */}
        {!loading && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            {canSubmit ? (
              <CheckCircle
                size={14}
                style={{ color: variant === 'secondary' ? '#10b981' : 'rgba(255,255,255,0.8)' }}
              />
            ) : (
              <AlertCircle
                size={14}
                style={{ color: variant === 'secondary' ? '#ef4444' : 'rgba(255,255,255,0.8)' }}
              />
            )}
          </div>
        )}

        {/* Hidden description for screen readers */}
        <span id={`${id}-description`} style={{ display: 'none' }}>
          {description}
        </span>
      </button>

      {/* Validation tooltip */}
      {!canSubmit && validationErrors.length > 0 && (
        <div
          id={`${id}-validation`}
          style={{
            position: 'absolute',
            top: '100%',
            left: '0',
            right: '0',
            marginTop: '4px',
            padding: '8px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#991b1b',
            zIndex: 10,
            display: disabled ? 'none' : 'block',
          }}
        >
          <div style={{ fontWeight: '600', marginBottom: '4px' }}>
            Cannot {getSubmissionActionLabel(id)}:
          </div>
          <ul style={{ margin: 0, paddingLeft: '12px' }}>
            {validationErrors.slice(0, 3).map((error, index) => (
              <li key={index} style={{ marginBottom: '2px' }}>
                {error}
              </li>
            ))}
            {validationErrors.length > 3 && (
              <li style={{ color: '#6b7280', fontStyle: 'italic' }}>
                +{validationErrors.length - 3} more errors
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Get user-friendly action label for submission type
 */
function getSubmissionActionLabel(submissionType: string): string {
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

export const ActionButtonsSection: React.FC<ActionButtonsSectionProps> = ({
  formValid,
  processing,
  submissionType,
  validationState,
  showValidationIndicators = true,
  onSaveAsDraft,
  onSubmitForApproval,
  onCreateWithWorkflow,
}) => {
  const buttons: ActionButtonConfig[] = [
    {
      id: 'draft',
      label: 'Save as Draft',
      icon: Save,
      variant: 'secondary',
      disabled: processing,
      loading: processing && submissionType === 'draft',
      onClick: onSaveAsDraft,
      ariaLabel: 'Save requisition as draft without submitting for approval',
      description: 'Saves the current requisition as a draft. You can edit and submit it later.',
      canSubmit: validationState?.canSubmitAsDraft ?? true,
      validationErrors: validationState?.submissionTypeErrors.draft ?? [],
    },
    {
      id: 'manual',
      label: 'Submit for Approval',
      icon: Send,
      variant: 'primary',
      disabled:
        processing || !formValid || (validationState && !validationState.canSubmitForApproval),
      loading: processing && submissionType === 'manual',
      onClick: onSubmitForApproval,
      ariaLabel: 'Submit requisition for manual approval process',
      description:
        'Submits the requisition for traditional manual approval by authorized personnel.',
      canSubmit: validationState?.canSubmitForApproval ?? formValid,
      validationErrors: validationState?.submissionTypeErrors.manual ?? [],
    },
    {
      id: 'workflow',
      label: 'Create with Workflow',
      icon: Workflow,
      variant: 'accent',
      disabled:
        processing || !formValid || (validationState && !validationState.canCreateWithWorkflow),
      loading: processing && submissionType === 'workflow',
      onClick: onCreateWithWorkflow,
      ariaLabel: 'Create requisition with automated workflow processing',
      description: 'Creates the requisition and triggers automated workflow for approval routing.',
      canSubmit: validationState?.canCreateWithWorkflow ?? formValid,
      validationErrors: validationState?.submissionTypeErrors.workflow ?? [],
    },
  ];

  return (
    <div
      role="group"
      aria-labelledby="action-buttons-heading"
      style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
    >
      <h3
        id="action-buttons-heading"
        style={{
          margin: '0 0 8px 0',
          fontSize: '16px',
          fontWeight: '600',
          color: '#1f2937',
          textAlign: 'center',
        }}
      >
        Submission Options
      </h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {buttons.map(button => (
          <ActionButton key={button.id} config={button} />
        ))}
      </div>

      {/* Help text */}
      <div
        data-testid="help-section"
        style={{
          marginTop: '12px',
          padding: '12px',
          background: '#f0f9ff',
          borderRadius: '6px',
          border: '1px solid #e0f2fe',
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: '12px',
            color: '#0369a1',
            lineHeight: '1.4',
          }}
        >
          <strong>Draft:</strong> Save without approval • <strong>Manual:</strong> Traditional
          approval process • <strong>Workflow:</strong> Automated routing
        </p>
      </div>
    </div>
  );
};

export default ActionButtonsSection;
