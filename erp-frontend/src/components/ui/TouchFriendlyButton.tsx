// Touch-friendly button component for mobile interfaces
import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface TouchFriendlyButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  hapticFeedback?: boolean;
  children: React.ReactNode;
}

const variants = {
  primary: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm',
  secondary: 'bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white shadow-sm',
  outline: 'border border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-700',
  ghost: 'hover:bg-gray-100 active:bg-gray-200 text-gray-700',
  danger: 'bg-red-600 hover:bg-red-700 active:bg-red-800 text-white shadow-sm',
};

const sizes = {
  sm: 'px-3 py-2 text-sm min-h-[36px]',
  md: 'px-4 py-3 text-sm min-h-[44px]',
  lg: 'px-6 py-4 text-base min-h-[48px]',
  xl: 'px-8 py-5 text-lg min-h-[56px]',
};

export const TouchFriendlyButton: React.FC<TouchFriendlyButtonProps> = ({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconPosition = 'left',
  hapticFeedback = true,
  className = '',
  children,
  onClick,
  disabled,
  ...props
}) => {
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number }>>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rippleId = useRef(0);

  // Haptic feedback for supported devices
  const triggerHapticFeedback = () => {
    if (hapticFeedback && 'vibrate' in navigator) {
      navigator.vibrate(10); // Very short vibration
    }
  };

  // Handle touch start for visual feedback
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsPressed(true);

    // Create ripple effect
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      const newRipple = {
        id: rippleId.current++,
        x,
        y,
      };

      setRipples(prev => [...prev, newRipple]);

      // Remove ripple after animation
      setTimeout(() => {
        setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
      }, 600);
    }
  };

  const handleTouchEnd = () => {
    setIsPressed(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || loading) return;

    triggerHapticFeedback();
    onClick?.(e);
  };

  // Clean up ripples on unmount
  useEffect(() => {
    return () => {
      setRipples([]);
    };
  }, []);

  const isDisabled = disabled || loading;

  return (
    <button
      ref={buttonRef}
      className={cn(
        // Base styles
        'relative overflow-hidden rounded-lg font-medium transition-all duration-150 ease-out',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
        'select-none touch-manipulation', // Prevent text selection and improve touch response

        // Variant styles
        variants[variant],

        // Size styles
        sizes[size],

        // Width
        fullWidth && 'w-full',

        // Disabled state
        isDisabled && 'opacity-50 cursor-not-allowed',

        // Pressed state for touch feedback
        isPressed && !isDisabled && 'scale-95 transform',

        className
      )}
      disabled={isDisabled}
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      {...props}
    >
      {/* Ripple effects */}
      {ripples.map(ripple => (
        <span
          key={ripple.id}
          className="absolute pointer-events-none animate-ping"
          style={{
            left: ripple.x - 10,
            top: ripple.y - 10,
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: 'rgba(255, 255, 255, 0.3)',
            transform: 'scale(0)',
            animation: 'ripple 0.6s ease-out',
          }}
        />
      ))}

      {/* Button content */}
      <span className="relative flex items-center justify-center space-x-2">
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}

        {!loading && icon && iconPosition === 'left' && (
          <span className="flex-shrink-0">{icon}</span>
        )}

        <span className={cn(loading && 'ml-2')}>{children}</span>

        {!loading && icon && iconPosition === 'right' && (
          <span className="flex-shrink-0">{icon}</span>
        )}
      </span>
    </button>
  );
};

// Add ripple animation to global CSS
const rippleStyles = `
@keyframes ripple {
  0% {
    transform: scale(0);
    opacity: 1;
  }
  100% {
    transform: scale(4);
    opacity: 0;
  }
}
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('touch-friendly-button-styles')) {
  const style = document.createElement('style');
  style.id = 'touch-friendly-button-styles';
  style.textContent = rippleStyles;
  document.head.appendChild(style);
}

export default TouchFriendlyButton;
