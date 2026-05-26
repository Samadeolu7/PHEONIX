import React, { useState, useEffect } from 'react';
import { cn } from '../../lib/utils';

// Animation variants for different types of transitions
export const animationVariants = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.3, ease: 'easeInOut' },
  },
  slideInFromRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  slideInFromLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  slideInFromTop: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  slideInFromBottom: {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
    transition: { duration: 0.3, ease: 'easeOut' },
  },
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.95 },
    transition: { duration: 0.2, ease: 'easeOut' },
  },
  bounce: {
    initial: { opacity: 0, scale: 0.3 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.3 },
    transition: {
      duration: 0.5,
      ease: 'easeOut',
      scale: {
        type: 'spring',
        damping: 10,
        stiffness: 100,
      },
    },
  },
};

// CSS-based animation classes for better performance
export const cssAnimations = {
  fadeIn: 'animate-fade-in',
  slideInRight: 'animate-slide-in-right',
  slideInLeft: 'animate-slide-in-left',
  slideInUp: 'animate-slide-in-up',
  slideInDown: 'animate-slide-in-down',
  scaleIn: 'animate-scale-in',
  bounce: 'animate-bounce-in',
  pulse: 'animate-pulse',
  spin: 'animate-spin',
  ping: 'animate-ping',
};

interface AnimatedContainerProps {
  children: React.ReactNode;
  animation?: keyof typeof animationVariants;
  delay?: number;
  duration?: number;
  className?: string;
  trigger?: boolean;
}

export const AnimatedContainer: React.FC<AnimatedContainerProps> = ({
  children,
  animation = 'fadeIn',
  delay = 0,
  duration,
  className = '',
  trigger = true,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (trigger) {
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, delay * 1000);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [trigger, delay]);

  const variant = animationVariants[animation];
  const customDuration = duration || variant.transition.duration;

  return (
    <div
      className={cn('transition-all', isVisible ? 'opacity-100' : 'opacity-0', className)}
      style={{
        transform: isVisible
          ? 'translateX(0) translateY(0) scale(1)'
          : animation.includes('Right')
            ? 'translateX(20px)'
            : animation.includes('Left')
              ? 'translateX(-20px)'
              : animation.includes('Top')
                ? 'translateY(-20px)'
                : animation.includes('Bottom')
                  ? 'translateY(20px)'
                  : animation.includes('scale')
                    ? 'scale(0.95)'
                    : 'translateX(0) translateY(0) scale(1)',
        transitionDuration: `${customDuration}s`,
        transitionDelay: `${delay}s`,
        transitionTimingFunction:
          variant.transition.ease === 'easeOut' ? 'ease-out' : 'ease-in-out',
      }}
    >
      {children}
    </div>
  );
};

interface StaggeredAnimationProps {
  children: React.ReactNode[];
  staggerDelay?: number;
  animation?: keyof typeof animationVariants;
  className?: string;
}

export const StaggeredAnimation: React.FC<StaggeredAnimationProps> = ({
  children,
  staggerDelay = 0.1,
  animation = 'fadeIn',
  className = '',
}) => {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <AnimatedContainer key={index} animation={animation} delay={index * staggerDelay}>
          {child}
        </AnimatedContainer>
      ))}
    </div>
  );
};

interface HoverAnimationProps {
  children: React.ReactNode;
  scale?: number;
  lift?: boolean;
  glow?: boolean;
  className?: string;
}

export const HoverAnimation: React.FC<HoverAnimationProps> = ({
  children,
  scale = 1.02,
  lift = false,
  glow = false,
  className = '',
}) => {
  return (
    <div
      className={cn(
        'transition-all duration-200 ease-out cursor-pointer',
        lift && 'hover:shadow-lg hover:-translate-y-1',
        glow && 'hover:shadow-xl hover:shadow-blue-500/25',
        className
      )}
      style={{
        transform: 'scale(1)',
        transition: 'transform 0.2s ease-out, box-shadow 0.2s ease-out',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = `scale(${scale})`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)';
      }}
    >
      {children}
    </div>
  );
};

interface LoadingAnimationProps {
  type?: 'spinner' | 'dots' | 'pulse' | 'skeleton';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  type = 'spinner',
  size = 'md',
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };

  if (type === 'spinner') {
    return (
      <div
        className={cn(
          'animate-spin rounded-full border-2 border-gray-300 border-t-blue-600',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  if (type === 'dots') {
    return (
      <div className={cn('flex space-x-1', className)}>
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={cn(
              'bg-blue-600 rounded-full animate-pulse',
              size === 'sm' ? 'w-1 h-1' : size === 'md' ? 'w-2 h-2' : 'w-3 h-3'
            )}
            style={{
              animationDelay: `${i * 0.2}s`,
              animationDuration: '1s',
            }}
          />
        ))}
      </div>
    );
  }

  if (type === 'pulse') {
    return (
      <div className={cn('bg-gray-300 rounded animate-pulse', sizeClasses[size], className)} />
    );
  }

  if (type === 'skeleton') {
    return (
      <div className={cn('animate-pulse space-y-2', className)}>
        <div className="h-4 bg-gray-300 rounded w-3/4"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2"></div>
        <div className="h-4 bg-gray-300 rounded w-5/6"></div>
      </div>
    );
  }

  return null;
};

interface PageTransitionProps {
  children: React.ReactNode;
  isVisible: boolean;
  direction?: 'left' | 'right' | 'up' | 'down';
  className?: string;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  isVisible,
  direction = 'right',
  className = '',
}) => {
  const getTransform = () => {
    if (!isVisible) {
      switch (direction) {
        case 'left':
          return 'translateX(-100%)';
        case 'right':
          return 'translateX(100%)';
        case 'up':
          return 'translateY(-100%)';
        case 'down':
          return 'translateY(100%)';
        default:
          return 'translateX(100%)';
      }
    }
    return 'translateX(0) translateY(0)';
  };

  return (
    <div
      className={cn('transition-transform duration-300 ease-in-out', className)}
      style={{
        transform: getTransform(),
        opacity: isVisible ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
};

// Custom hook for managing animation states
export const useAnimation = (initialState = false) => {
  const [isAnimating, setIsAnimating] = useState(initialState);
  const [animationClass, setAnimationClass] = useState('');

  const startAnimation = (animationName: keyof typeof cssAnimations, duration = 300) => {
    setIsAnimating(true);
    setAnimationClass(cssAnimations[animationName]);

    setTimeout(() => {
      setIsAnimating(false);
      setAnimationClass('');
    }, duration);
  };

  return {
    isAnimating,
    animationClass,
    startAnimation,
  };
};
