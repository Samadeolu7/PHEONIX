// src/components/ui/EnhancedButton.tsx
import React from 'react';
import { useEnhancedButton } from '../../hooks/useLoadingState';

export interface EnhancedButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  buttonId: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg';
  showSpinner?: boolean;
  disabledText?: string;
  loadingText?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

const variantStyles = {
  primary: {
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    '&:hover': {
      backgroundColor: '#2563eb',
    },
  },
  secondary: {
    backgroundColor: 'white',
    color: '#374151',
    border: '1px solid #d1d5db',
    '&:hover': {
      backgroundColor: '#f9fafb',
    },
  },
  danger: {
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    '&:hover': {
      backgroundColor: '#dc2626',
    },
  },
  success: {
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    '&:hover': {
      backgroundColor: '#059669',
    },
  },
};

const sizeStyles = {
  sm: {
    padding: '6px 12px',
    fontSize: '12px',
    borderRadius: '4px',
  },
  md: {
    padding: '8px 16px',
    fontSize: '14px',
    borderRadius: '6px',
  },
  lg: {
    padding: '12px 24px',
    fontSize: '16px',
    borderRadius: '8px',
  },
};

export const EnhancedButton: React.FC<EnhancedButtonProps> = ({
  buttonId,
  variant = 'primary',
  size = 'md',
  showSpinner = true,
  disabledText,
  loadingText,
  icon,
  children,
  style,
  ...props
}) => {
  const { isDisabled, isLoading, getButtonProps, getButtonText, getSpinnerElement } =
    useEnhancedButton(buttonId, {
      showSpinner,
      disabledText,
      loadingText,
    });

  const buttonText = typeof children === 'string' ? getButtonText(children) : children;
  const spinner = getSpinnerElement();

  const baseStyle = {
    ...variantStyles[variant],
    ...sizeStyles[size],
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    cursor: 'pointer',
    ...style,
  };

  return (
    <button
      {...getButtonProps({
        ...props,
        style: baseStyle,
      })}
    >
      {spinner}
      {icon && !isLoading && icon}
      {buttonText}
    </button>
  );
};

export default EnhancedButton;
