// src/components/ui/Input.tsx
import React from 'react';
import styled from '@emotion/styled';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helpText?: string;
  error?: string;
}

const InputContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
`;

const Label = styled.label`
  font-weight: 500;
  color: #374151;
  font-size: 0.875rem;

  ${p =>
    p.htmlFor &&
    `
    display: block;
    margin-bottom: 0.25rem;
  `}
`;

const StyledInput = styled.input<{ hasError?: boolean }>`
  padding: 0.5rem 0.75rem;
  border: 1px solid ${p => (p.hasError ? '#dc2626' : '#d1d5db')};
  border-radius: 6px;
  font-size: 0.875rem;
  transition: all 0.2s;
  background: ${p => (p.disabled ? '#f9fafb' : '#fff')};

  &:focus {
    outline: none;
    border-color: ${p => (p.hasError ? '#dc2626' : '#1a73e8')};
    box-shadow: 0 0 0 3px
      ${p => (p.hasError ? 'rgba(220, 38, 38, 0.1)' : 'rgba(26, 115, 232, 0.1)')};
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  &::placeholder {
    color: #9ca3af;
  }
`;

const HelpText = styled.small`
  color: #6b7280;
  font-size: 0.75rem;
  line-height: 1.25;
`;

const ErrorText = styled.small`
  color: #dc2626;
  font-size: 0.75rem;
  line-height: 1.25;
`;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, helpText, error, required, className, ...props }, ref) => {
    const inputId = React.useId();

    return (
      <InputContainer className={className}>
        {label && (
          <Label htmlFor={inputId}>
            {label}
            {required && <span style={{ color: '#dc2626', marginLeft: '0.25rem' }}>*</span>}
          </Label>
        )}

        <StyledInput ref={ref} id={inputId} hasError={!!error} required={required} {...props} />

        {error ? <ErrorText>{error}</ErrorText> : helpText ? <HelpText>{helpText}</HelpText> : null}
      </InputContainer>
    );
  }
);

Input.displayName = 'Input';
