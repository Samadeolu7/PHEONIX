import React, { type HTMLAttributes, forwardRef } from 'react';
import styled from '@emotion/styled';

export interface ButtonProps extends HTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'text';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  fullWidth?: boolean;
  className?: string;
  disabled?: boolean;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const ButtonStyled = styled.button`
  /* Base styles */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-primary);
  font-weight: 500;
  border-radius: 4px;
  transition: all 0.2s ease-in-out;
  cursor: pointer;

  /* Size variants */
  &[data-size='small'] {
    padding: 6px 16px;
    font-size: 0.875rem;
  }

  &[data-size='medium'] {
    padding: 8px 20px;
    font-size: 1rem;
  }

  &[data-size='large'] {
    padding: 12px 24px;
    font-size: 1.125rem;
  }

  /* Style variants */
  &[data-variant='primary'] {
    background-color: var(--color-primary);
    color: white;
    border: none;

    &:hover {
      background-color: var(--color-primary-dark, #1565c0);
    }

    &:disabled {
      background-color: var(--color-disabled, #ccc);
      cursor: not-allowed;
    }
  }

  &[data-variant='secondary'] {
    background-color: transparent;
    color: var(--color-primary);
    border: 1px solid var(--color-primary);

    &:hover {
      background-color: var(--color-primary-light, #e3f2fd);
    }

    &:disabled {
      color: var(--color-disabled, #ccc);
      border-color: var(--color-disabled, #ccc);
      cursor: not-allowed;
    }
  }

  &[data-variant='text'] {
    background-color: transparent;
    color: var(--color-primary);
    border: none;
    padding-left: 8px;
    padding-right: 8px;

    &:hover {
      background-color: var(--color-primary-light, #e3f2fd);
    }

    &:disabled {
      color: var(--color-disabled, #ccc);
      cursor: not-allowed;
    }
  }

  /* Full width variant */
  &[data-full-width='true'] {
    width: 100%;
  }

  /* Loading state */
  &[data-loading='true'] {
    position: relative;
    color: transparent;
    pointer-events: none;

    &::after {
      content: '';
      position: absolute;
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-radius: 50%;
      border-right-color: transparent;
      animation: spin 0.75s linear infinite;
    }
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
`;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'medium',
      loading = false,
      fullWidth = false,
      disabled,
      children,
      className,
      onClick,
      ...props
    },
    ref
  ) => {
    return (
      <ButtonStyled
        ref={ref}
        data-variant={variant}
        data-size={size}
        data-loading={loading}
        data-full-width={fullWidth}
        disabled={disabled || loading}
        className={className}
        onClick={onClick}
        {...props}
      >
        {children}
      </ButtonStyled>
    );
  }
);

Button.displayName = 'Button';
