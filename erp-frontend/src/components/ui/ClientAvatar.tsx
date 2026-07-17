/**
 * Small circular client photo, falling back to initials when no image is on
 * file. Used at every step of the loan lifecycle (application, verification,
 * approval, disbursement, restructure, repayment) so staff can visually
 * confirm they're acting on the right customer before committing money.
 */

import React from 'react';

const SIZE_CLASSES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-lg',
  xl: 'h-24 w-24 text-2xl',
} as const;

export type ClientAvatarSize = keyof typeof SIZE_CLASSES;

interface ClientAvatarProps {
  image?: string | null;
  name: string;
  size?: ClientAvatarSize;
  className?: string;
}

export function ClientAvatar({ image, name, size = 'md', className = '' }: ClientAvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  const initial = name?.trim()?.charAt(0)?.toUpperCase() || '?';

  if (image) {
    return (
      <img
        src={image}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ring-1 ring-black/5 ${className}`}
      />
    );
  }

  return (
    <div
      className={`${sizeClass} rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 ${className}`}
      aria-label={name}
    >
      <span className="text-indigo-700 font-medium">{initial}</span>
    </div>
  );
}
