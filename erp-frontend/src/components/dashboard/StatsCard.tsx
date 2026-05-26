// Enhanced StatsCard component with real-time data and theming
import React, { useState, useEffect, useCallback } from 'react';
import {
  LucideIcon,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  Eye,
  EyeOff,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getIcon } from '../../utils/iconUtils';
import { HoverAnimation } from '../ui/Animations';

export interface StatsCardData {
  id: string;
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
    period: string;
  };
  icon: LucideIcon | string; // Allow both component and string
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray' | 'indigo' | 'pink';
  category?: string;
  permissions?: string[];
  onClick?: () => void;
  priority?: number;
  refreshInterval?: number; // in seconds
  lastUpdated?: Date;
  isLoading?: boolean;
  error?: string;
  format?: 'number' | 'currency' | 'percentage';
  prefix?: string;
  suffix?: string;
  showTrend?: boolean;
  size?: 'small' | 'medium' | 'large';
  layout?: 'horizontal' | 'vertical';
  theme?: 'light' | 'dark' | 'gradient';
}

export interface StatsCardProps extends StatsCardData {
  className?: string;
  onRefresh?: (id: string) => Promise<void>;
  onVisibilityToggle?: (id: string, visible: boolean) => void;
  isVisible?: boolean;
  showControls?: boolean;
  realTimeEnabled?: boolean;
}

const colorThemes = {
  blue: {
    light: {
      bg: 'bg-blue-50',
      icon: 'text-blue-600',
      border: 'border-blue-200',
      text: 'text-blue-900',
      accent: 'bg-blue-100',
    },
    dark: {
      bg: 'bg-blue-900/20',
      icon: 'text-blue-400',
      border: 'border-blue-700',
      text: 'text-blue-100',
      accent: 'bg-blue-800/30',
    },
    gradient: 'bg-gradient-to-br from-blue-500 to-blue-600',
  },
  green: {
    light: {
      bg: 'bg-green-50',
      icon: 'text-green-600',
      border: 'border-green-200',
      text: 'text-green-900',
      accent: 'bg-green-100',
    },
    dark: {
      bg: 'bg-green-900/20',
      icon: 'text-green-400',
      border: 'border-green-700',
      text: 'text-green-100',
      accent: 'bg-green-800/30',
    },
    gradient: 'bg-gradient-to-br from-green-500 to-green-600',
  },
  yellow: {
    light: {
      bg: 'bg-yellow-50',
      icon: 'text-yellow-600',
      border: 'border-yellow-200',
      text: 'text-yellow-900',
      accent: 'bg-yellow-100',
    },
    dark: {
      bg: 'bg-yellow-900/20',
      icon: 'text-yellow-400',
      border: 'border-yellow-700',
      text: 'text-yellow-100',
      accent: 'bg-yellow-800/30',
    },
    gradient: 'bg-gradient-to-br from-yellow-500 to-yellow-600',
  },
  red: {
    light: {
      bg: 'bg-red-50',
      icon: 'text-red-600',
      border: 'border-red-200',
      text: 'text-red-900',
      accent: 'bg-red-100',
    },
    dark: {
      bg: 'bg-red-900/20',
      icon: 'text-red-400',
      border: 'border-red-700',
      text: 'text-red-100',
      accent: 'bg-red-800/30',
    },
    gradient: 'bg-gradient-to-br from-red-500 to-red-600',
  },
  purple: {
    light: {
      bg: 'bg-purple-50',
      icon: 'text-purple-600',
      border: 'border-purple-200',
      text: 'text-purple-900',
      accent: 'bg-purple-100',
    },
    dark: {
      bg: 'bg-purple-900/20',
      icon: 'text-purple-400',
      border: 'border-purple-700',
      text: 'text-purple-100',
      accent: 'bg-purple-800/30',
    },
    gradient: 'bg-gradient-to-br from-purple-500 to-purple-600',
  },
  gray: {
    light: {
      bg: 'bg-gray-50',
      icon: 'text-gray-600',
      border: 'border-gray-200',
      text: 'text-gray-900',
      accent: 'bg-gray-100',
    },
    dark: {
      bg: 'bg-gray-900/20',
      icon: 'text-gray-400',
      border: 'border-gray-700',
      text: 'text-gray-100',
      accent: 'bg-gray-800/30',
    },
    gradient: 'bg-gradient-to-br from-gray-500 to-gray-600',
  },
  indigo: {
    light: {
      bg: 'bg-indigo-50',
      icon: 'text-indigo-600',
      border: 'border-indigo-200',
      text: 'text-indigo-900',
      accent: 'bg-indigo-100',
    },
    dark: {
      bg: 'bg-indigo-900/20',
      icon: 'text-indigo-400',
      border: 'border-indigo-700',
      text: 'text-indigo-100',
      accent: 'bg-indigo-800/30',
    },
    gradient: 'bg-gradient-to-br from-indigo-500 to-indigo-600',
  },
  pink: {
    light: {
      bg: 'bg-pink-50',
      icon: 'text-pink-600',
      border: 'border-pink-200',
      text: 'text-pink-900',
      accent: 'bg-pink-100',
    },
    dark: {
      bg: 'bg-pink-900/20',
      icon: 'text-pink-400',
      border: 'border-pink-700',
      text: 'text-pink-100',
      accent: 'bg-pink-800/30',
    },
    gradient: 'bg-gradient-to-br from-pink-500 to-pink-600',
  },
};

const sizeClasses = {
  small: {
    container: 'p-3 sm:p-4',
    icon: 'h-4 w-4',
    iconContainer: 'p-1.5',
    title: 'text-xs sm:text-sm',
    value: 'text-base sm:text-lg',
    change: 'text-xs',
  },
  medium: {
    container: 'p-4 sm:p-6',
    icon: 'h-4 w-4 sm:h-5 sm:w-5',
    iconContainer: 'p-1.5 sm:p-2',
    title: 'text-sm',
    value: 'text-lg sm:text-2xl',
    change: 'text-xs sm:text-sm',
  },
  large: {
    container: 'p-6 sm:p-8',
    icon: 'h-5 w-5 sm:h-6 sm:w-6',
    iconContainer: 'p-2 sm:p-3',
    title: 'text-sm sm:text-base',
    value: 'text-xl sm:text-3xl',
    change: 'text-sm sm:text-base',
  },
};

export const StatsCard: React.FC<StatsCardProps> = ({
  id,
  title,
  value,
  change,
  icon,
  color = 'blue',
  category,
  onClick,
  className = '',
  onRefresh,
  onVisibilityToggle,
  isVisible = true,
  showControls = false,
  realTimeEnabled = false,
  refreshInterval = 30,
  lastUpdated,
  isLoading = false,
  error,
  format = 'number',
  prefix = '',
  suffix = '',
  showTrend = true,
  size = 'medium',
  layout = 'vertical',
  theme = 'light',
}) => {
  // Resolve icon component
  const Icon = getIcon(icon);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Auto-refresh functionality
  useEffect(() => {
    if (!realTimeEnabled || !refreshInterval || !onRefresh) return;

    const interval = setInterval(async () => {
      try {
        await onRefresh(id);
        setLocalError(null);
      } catch (err) {
        setLocalError('Failed to refresh data');
      }
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [id, realTimeEnabled, refreshInterval, onRefresh]);

  // Manual refresh handler
  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;

    setIsRefreshing(true);
    setLocalError(null);

    try {
      await onRefresh(id);
    } catch (err) {
      setLocalError('Failed to refresh data');
    } finally {
      setIsRefreshing(false);
    }
  }, [id, onRefresh, isRefreshing]);

  // Visibility toggle handler
  const handleVisibilityToggle = useCallback(() => {
    if (onVisibilityToggle) {
      onVisibilityToggle(id, !isVisible);
    }
  }, [id, isVisible, onVisibilityToggle]);

  // Format value based on format type
  const formatValue = useCallback(
    (val: string | number): string => {
      if (typeof val === 'string') return val;

      switch (format) {
        case 'currency':
          return new Intl.NumberFormat('en-NG', {
            style: 'currency',
            currency: 'NGN',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
          }).format(val);
        case 'percentage':
          return `${val}%`;
        case 'number':
        default:
          return new Intl.NumberFormat('en-US').format(val);
      }
    },
    [format]
  );

  const colors = colorThemes[color] || colorThemes.blue;
  const sizes = sizeClasses[size];
  const isClickable = !!onClick;
  const hasError = error || localError;

  // Don't render if not visible (for customization mode)
  if (!isVisible && showControls) {
    return null;
  }

  // Gradient theme handling
  const isGradient = theme === 'gradient';
  const colorScheme = isGradient ? null : colors[theme];

  // Fallback to default theme if colorScheme is undefined
  const safeColorScheme = colorScheme ||
    colors.light || {
      bg: 'bg-gray-50',
      icon: 'text-gray-600',
      border: 'border-gray-200',
      text: 'text-gray-900',
      accent: 'bg-gray-100',
    };

  if (isLoading) {
    return (
      <div
        className={cn(
          'bg-white rounded-lg shadow-sm border border-gray-200',
          sizes.container,
          className
        )}
      >
        <div className="animate-pulse">
          <div className="flex items-center justify-between mb-4">
            <div className="h-4 bg-gray-200 rounded w-24"></div>
            <div className={cn('rounded-lg bg-gray-200', sizes.iconContainer)}>
              <div className={cn('bg-gray-300 rounded', sizes.icon)}></div>
            </div>
          </div>
          <div className="h-8 bg-gray-200 rounded w-20 mb-2"></div>
          {showTrend && <div className="h-3 bg-gray-200 rounded w-16"></div>}
        </div>
      </div>
    );
  }

  return (
    <HoverAnimation scale={1.02} lift={true} glow={isClickable} className={className}>
      <div
        className={cn(
          'rounded-lg shadow-sm border metric-card-transition relative group',
          isGradient
            ? `${colors.gradient} text-white border-transparent`
            : `bg-white ${safeColorScheme.border} border`,
          isClickable && 'cursor-pointer',
          hasError && 'border-red-300 bg-red-50',
          sizes.container,
          layout === 'horizontal' && 'flex items-center space-x-4'
        )}
        onClick={onClick}
      >
        {/* Controls */}
        {showControls && (
          <div className="absolute top-2 right-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={e => {
                e.stopPropagation();
                handleRefresh();
              }}
              disabled={isRefreshing}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title="Refresh data"
            >
              <RefreshCw className={cn('h-3 w-3', isRefreshing && 'animate-spin')} />
            </button>
            <button
              onClick={e => {
                e.stopPropagation();
                handleVisibilityToggle();
              }}
              className="p-1 rounded hover:bg-gray-100 transition-colors"
              title={isVisible ? 'Hide card' : 'Show card'}
            >
              {isVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </button>
          </div>
        )}

        {/* Error State */}
        {hasError && (
          <div className="flex items-center space-x-2 mb-3 text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs">{hasError}</span>
          </div>
        )}

        {/* Header */}
        <div
          className={cn(
            'flex items-center justify-between',
            layout === 'vertical' && 'mb-4',
            layout === 'horizontal' && 'flex-1'
          )}
        >
          <div className={layout === 'horizontal' ? 'flex-1' : ''}>
            <h3
              className={cn(
                'font-medium',
                isGradient ? 'text-white/90' : safeColorScheme.text,
                sizes.title
              )}
            >
              {title}
            </h3>
            {category && (
              <p className={cn('text-xs mt-1', isGradient ? 'text-white/70' : 'text-gray-500')}>
                {category}
              </p>
            )}
          </div>

          <div
            className={cn(
              'rounded-lg border flex-shrink-0',
              isGradient
                ? 'bg-white/20 border-white/30'
                : `${safeColorScheme.bg} ${safeColorScheme.border}`,
              sizes.iconContainer
            )}
          >
            <Icon className={cn(isGradient ? 'text-white' : safeColorScheme.icon, sizes.icon)} />
          </div>
        </div>

        {/* Value and Trend */}
        <div className={layout === 'horizontal' ? 'flex-1' : ''}>
          <div className={cn(layout === 'vertical' && 'mb-2')}>
            <p
              className={cn('font-bold', isGradient ? 'text-white' : 'text-gray-900', sizes.value)}
            >
              {prefix}
              {formatValue(value)}
              {suffix}
            </p>
          </div>

          {/* Change Indicator */}
          {change && showTrend && (
            <div className="flex items-center space-x-1">
              {change.type === 'increase' ? (
                <TrendingUp
                  className={cn('h-4 w-4', isGradient ? 'text-white/80' : 'text-green-500')}
                />
              ) : (
                <TrendingDown
                  className={cn('h-4 w-4', isGradient ? 'text-white/80' : 'text-red-500')}
                />
              )}
              <span
                className={cn(
                  'font-medium',
                  sizes.change,
                  isGradient
                    ? 'text-white/90'
                    : change.type === 'increase'
                      ? 'text-green-600'
                      : 'text-red-600'
                )}
              >
                {change.value > 0 ? '+' : ''}
                {change.value}%
              </span>
              <span className={cn(sizes.change, isGradient ? 'text-white/70' : 'text-gray-500')}>
                vs {change.period}
              </span>
            </div>
          )}

          {/* Last Updated */}
          {lastUpdated && (
            <div className={cn('text-xs mt-2', isGradient ? 'text-white/60' : 'text-gray-400')}>
              Updated {lastUpdated.toLocaleTimeString()}
            </div>
          )}
        </div>
      </div>
    </HoverAnimation>
  );
};

export default StatsCard;
