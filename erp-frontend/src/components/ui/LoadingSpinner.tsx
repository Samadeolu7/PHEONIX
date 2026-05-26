import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: number;
  color?: string;
  className?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 24,
  color = '#3b82f6',
  className = '',
}) => {
  return (
    <Loader2
      size={size}
      className={`animate-spin ${className}`}
      style={{
        color,
        animation: 'spin 1s linear infinite',
      }}
    />
  );
};

export default LoadingSpinner;
