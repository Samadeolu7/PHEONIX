import React, { memo } from 'react';
import { CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { ToastType } from '../../types/toast';

interface ToastIconProps {
  type: ToastType;
  className?: string;
}

/**
 * ToastIcon component that displays type-specific icons for toast notifications
 * Maps each toast type to its appropriate Lucide React icon
 * Optimized with React.memo to prevent unnecessary re-renders
 */
export const ToastIcon: React.FC<ToastIconProps> = memo(({ type, className = '' }) => {
  // Icon mapping for each toast type
  const iconMap = {
    success: CheckCircle,
    error: XCircle,
    info: Info,
    warning: AlertTriangle,
  } as const;

  // Get the appropriate icon component
  const IconComponent = iconMap[type];

  // Base classes for consistent sizing and styling
  const baseClasses = 'w-5 h-5 flex-shrink-0';

  // Type-specific color classes with improved contrast for accessibility
  const colorClasses = {
    success: 'text-green-700',
    error: 'text-red-700',
    info: 'text-blue-700',
    warning: 'text-amber-700',
  } as const;

  const combinedClasses = `${baseClasses} ${colorClasses[type]} ${className}`.trim();

  return <IconComponent className={combinedClasses} aria-hidden="true" />;
});

// Add display name for debugging
ToastIcon.displayName = 'ToastIcon';

export default ToastIcon;
