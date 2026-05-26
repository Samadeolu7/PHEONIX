import React from 'react';
import { Tag, TagProps } from './Tag';

export interface BadgeProps extends Omit<TagProps, 'variant'> {
  variant?: 'default' | 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'outline';
}

const variantMapping: Record<BadgeProps['variant'], TagProps['variant']> = {
  default: 'default',
  primary: 'primary',
  secondary: 'default',
  success: 'success',
  warning: 'warning',
  error: 'error',
  outline: 'default',
};

export const Badge: React.FC<BadgeProps> = ({ variant = 'default', className = '', ...props }) => {
  const mappedVariant = variantMapping[variant];
  const badgeClassName =
    variant === 'outline'
      ? `border border-gray-300 bg-transparent text-gray-700 ${className}`
      : variant === 'secondary'
        ? `bg-gray-100 text-gray-800 ${className}`
        : className;

  return <Tag variant={mappedVariant} className={badgeClassName} {...props} />;
};
