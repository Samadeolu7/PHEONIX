import React, { ReactNode, useState } from 'react';
import { AlertCircle, CheckCircle, Info, Eye, EyeOff } from 'lucide-react';

interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string | string[];
  success?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
  showValidation?: boolean;
  loading?: boolean;
  disabled?: boolean;
  type?: 'text' | 'password' | 'email' | 'number' | 'tel' | 'url';
  showPasswordToggle?: boolean;
  onPasswordToggle?: (visible: boolean) => void;
}

const FormField: React.FC<FormFieldProps> = ({
  label,
  required = false,
  error,
  success,
  hint,
  children,
  className = '',
  showValidation = true,
  loading = false,
  disabled = false,
  type = 'text',
  showPasswordToggle = false,
  onPasswordToggle,
}) => {
  const [passwordVisible, setPasswordVisible] = useState(false);

  const hasError = showValidation && !!error;
  const hasSuccess = showValidation && !!success && !error;
  const errorMessages = Array.isArray(error) ? error : error ? [error] : [];

  const handlePasswordToggle = () => {
    const newVisible = !passwordVisible;
    setPasswordVisible(newVisible);
    onPasswordToggle?.(newVisible);
  };

  return (
    <div
      className={`form-field ${className}`}
      style={{
        marginBottom: '20px',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {label && (
        <label
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '14px',
            fontWeight: 600,
            color: hasError ? '#ef4444' : disabled ? '#9ca3af' : '#374151',
          }}
        >
          {label}
          {required && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
          {loading && (
            <span
              style={{
                marginLeft: '8px',
                fontSize: '12px',
                color: '#6b7280',
                fontWeight: 400,
              }}
            >
              (validating...)
            </span>
          )}
        </label>
      )}

      <div style={{ position: 'relative' }}>
        {children}

        {/* Validation icons */}
        <div
          style={{
            position: 'absolute',
            right: showPasswordToggle && type === 'password' ? '44px' : '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {loading && (
            <div
              className="spinner"
              style={{
                width: '16px',
                height: '16px',
                border: '2px solid #e5e7eb',
                borderTop: '2px solid #3b82f6',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
          )}
          {showValidation && !loading && hasError && (
            <AlertCircle size={16} style={{ color: '#ef4444' }} />
          )}
          {showValidation && !loading && hasSuccess && (
            <CheckCircle size={16} style={{ color: '#10b981' }} />
          )}
        </div>

        {/* Password toggle button */}
        {showPasswordToggle && type === 'password' && (
          <button
            type="button"
            onClick={handlePasswordToggle}
            style={{
              position: 'absolute',
              right: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            tabIndex={-1}
          >
            {passwordVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>

      {/* Hint text */}
      {hint && !hasError && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '12px',
            color: disabled ? '#9ca3af' : '#6b7280',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '4px',
          }}
        >
          <Info size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>{hint}</span>
        </div>
      )}

      {/* Error messages */}
      {hasError && errorMessages.length > 0 && (
        <div style={{ marginTop: '4px' }}>
          {errorMessages.map((errorMsg, index) => (
            <div
              key={index}
              style={{
                fontSize: '12px',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '4px',
                marginBottom: index < errorMessages.length - 1 ? '2px' : '0',
              }}
            >
              <AlertCircle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
              <span>{errorMsg}</span>
            </div>
          ))}
        </div>
      )}

      {/* Success message */}
      {hasSuccess && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '12px',
            color: '#10b981',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '4px',
          }}
        >
          <CheckCircle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
          <span>{success}</span>
        </div>
      )}
    </div>
  );
};

export default FormField;
