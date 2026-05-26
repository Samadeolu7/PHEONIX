// Swipeable card component for mobile interactions
import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../../lib/utils';

interface SwipeAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  color: 'red' | 'green' | 'blue' | 'yellow' | 'gray';
  action: () => void;
}

interface SwipeableCardProps {
  children: React.ReactNode;
  leftActions?: SwipeAction[];
  rightActions?: SwipeAction[];
  onSwipe?: (direction: 'left' | 'right', action?: SwipeAction) => void;
  swipeThreshold?: number;
  className?: string;
  disabled?: boolean;
}

const actionColors = {
  red: 'bg-red-500 text-white',
  green: 'bg-green-500 text-white',
  blue: 'bg-blue-500 text-white',
  yellow: 'bg-yellow-500 text-white',
  gray: 'bg-gray-500 text-white',
};

export const SwipeableCard: React.FC<SwipeableCardProps> = ({
  children,
  leftActions = [],
  rightActions = [],
  onSwipe,
  swipeThreshold = 80,
  className = '',
  disabled = false,
}) => {
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [showActions, setShowActions] = useState<'left' | 'right' | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>();

  const maxSwipeDistance = 120; // Maximum distance to swipe

  // Handle touch start
  const handleTouchStart = (e: React.TouchEvent) => {
    if (disabled) return;

    const touch = e.touches[0];
    setStartX(touch.clientX);
    setCurrentX(touch.clientX);
    setIsDragging(true);

    // Cancel any ongoing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
  };

  // Handle touch move
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || disabled) return;

    const touch = e.touches[0];
    setCurrentX(touch.clientX);

    const deltaX = touch.clientX - startX;
    const clampedDeltaX = Math.max(-maxSwipeDistance, Math.min(maxSwipeDistance, deltaX));

    setTranslateX(clampedDeltaX);

    // Show appropriate actions
    if (clampedDeltaX > 20 && leftActions.length > 0) {
      setShowActions('left');
    } else if (clampedDeltaX < -20 && rightActions.length > 0) {
      setShowActions('right');
    } else {
      setShowActions(null);
    }
  };

  // Handle touch end
  const handleTouchEnd = () => {
    if (!isDragging || disabled) return;

    setIsDragging(false);

    const deltaX = currentX - startX;
    const absDeltaX = Math.abs(deltaX);

    // Check if swipe threshold is met
    if (absDeltaX >= swipeThreshold) {
      const direction = deltaX > 0 ? 'left' : 'right';
      const actions = direction === 'left' ? leftActions : rightActions;

      if (actions.length > 0) {
        // Execute the first action or let parent handle
        const action = actions[0];
        onSwipe?.(direction, action);

        // Auto-execute action if only one
        if (actions.length === 1) {
          action.action();
        }
      }
    }

    // Animate back to center
    animateToPosition(0);
    setShowActions(null);
  };

  // Animate to specific position
  const animateToPosition = (targetX: number) => {
    const startTime = Date.now();
    const startX = translateX;
    const distance = targetX - startX;
    const duration = 200;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const currentPos = startX + distance * easeOut;

      setTranslateX(currentPos);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animate();
  };

  // Handle mouse events for desktop testing
  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    setStartX(e.clientX);
    setCurrentX(e.clientX);
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || disabled) return;

    setCurrentX(e.clientX);

    const deltaX = e.clientX - startX;
    const clampedDeltaX = Math.max(-maxSwipeDistance, Math.min(maxSwipeDistance, deltaX));

    setTranslateX(clampedDeltaX);

    if (clampedDeltaX > 20 && leftActions.length > 0) {
      setShowActions('left');
    } else if (clampedDeltaX < -20 && rightActions.length > 0) {
      setShowActions('right');
    } else {
      setShowActions(null);
    }
  };

  const handleMouseUp = () => {
    if (!isDragging || disabled) return;

    setIsDragging(false);

    const deltaX = currentX - startX;
    const absDeltaX = Math.abs(deltaX);

    if (absDeltaX >= swipeThreshold) {
      const direction = deltaX > 0 ? 'left' : 'right';
      const actions = direction === 'left' ? leftActions : rightActions;

      if (actions.length > 0) {
        const action = actions[0];
        onSwipe?.(direction, action);

        if (actions.length === 1) {
          action.action();
        }
      }
    }

    animateToPosition(0);
    setShowActions(null);
  };

  // Clean up animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <div className={cn('relative overflow-hidden', className)}>
      {/* Left Actions */}
      {leftActions.length > 0 && (
        <div className="absolute left-0 top-0 h-full flex items-center">
          {leftActions.map((action, index) => (
            <div
              key={action.id}
              className={cn(
                'h-full flex items-center justify-center px-4 transition-all duration-200',
                actionColors[action.color],
                showActions === 'left' ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                transform: `translateX(${Math.max(0, translateX - 60)}px)`,
              }}
            >
              <div className="flex flex-col items-center space-y-1">
                {action.icon && <div className="text-lg">{action.icon}</div>}
                <span className="text-xs font-medium">{action.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Right Actions */}
      {rightActions.length > 0 && (
        <div className="absolute right-0 top-0 h-full flex items-center">
          {rightActions.map((action, index) => (
            <div
              key={action.id}
              className={cn(
                'h-full flex items-center justify-center px-4 transition-all duration-200',
                actionColors[action.color],
                showActions === 'right' ? 'opacity-100' : 'opacity-0'
              )}
              style={{
                transform: `translateX(${Math.min(0, translateX + 60)}px)`,
              }}
            >
              <div className="flex flex-col items-center space-y-1">
                {action.icon && <div className="text-lg">{action.icon}</div>}
                <span className="text-xs font-medium">{action.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Card Content */}
      <div
        ref={cardRef}
        className={cn(
          'relative bg-white transition-transform duration-200 ease-out touch-pan-y',
          isDragging && 'transition-none',
          disabled && 'pointer-events-none'
        )}
        style={{
          transform: `translateX(${translateX}px)`,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {children}
      </div>

      {/* Swipe Indicator */}
      {(showActions === 'left' || showActions === 'right') && (
        <div className="absolute top-2 right-2 z-10">
          <div className="bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            {showActions === 'left' ? '← Swipe' : 'Swipe →'}
          </div>
        </div>
      )}
    </div>
  );
};

export default SwipeableCard;
