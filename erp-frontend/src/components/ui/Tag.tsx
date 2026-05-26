import React from 'react';
import styled from '@emotion/styled';

export interface TagProps {
  children: React.ReactNode;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error';
  color?: string;
  className?: string;
}

const TagStyled = styled.span<TagProps>`
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.5;

  ${({ variant = 'default', color }) => {
    if (color) {
      return `
        background-color: ${color}20;
        color: ${color};
        border: 1px solid ${color}40;
      `;
    }
    const colors = {
      default: {
        bg: 'var(--color-tag-default-bg, #f0f0f0)',
        color: 'var(--color-tag-default-text, #666)',
      },
      primary: {
        bg: 'var(--color-tag-primary-bg, #e3f2fd)',
        color: 'var(--color-tag-primary-text, #1976d2)',
      },
      success: {
        bg: 'var(--color-tag-success-bg, #e8f5e9)',
        color: 'var(--color-tag-success-text, #2e7d32)',
      },
      warning: {
        bg: 'var(--color-tag-warning-bg, #fff3e0)',
        color: 'var(--color-tag-warning-text, #f57c00)',
      },
      error: {
        bg: 'var(--color-tag-error-bg, #fdeaea)',
        color: 'var(--color-tag-error-text, #d32f2f)',
      },
    };

    return `
      background-color: ${colors[variant].bg};
      color: ${colors[variant].color};
    `;
  }}
`;

export const Tag: React.FC<TagProps> = ({ children, variant = 'default', className }) => {
  return (
    <TagStyled variant={variant} className={className}>
      {children}
    </TagStyled>
  );
};
