// src/components/ThemeProvider.tsx

import React, { ReactNode } from 'react';
import { useDashboardTheme } from '../hooks/useDashboardTheme';

interface ThemeProviderProps {
  children: ReactNode;
  className?: string;
}

/**
 * Component that applies theme styles to its children
 * Use this to wrap pages that should inherit dashboard theme
 */
export const ThemedContainer: React.FC<ThemeProviderProps> = ({ children, className = '' }) => {
  const { theme, isThemeActive } = useDashboardTheme();

  if (!isThemeActive || !theme) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={className}
      style={{
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        minHeight: '100vh',
      }}
    >
      {children}
    </div>
  );
};

/**
 * Hook to inject theme styles into any component
 */
export const useThemeStyles = () => {
  const { theme, isThemeActive } = useDashboardTheme();

  if (!isThemeActive || !theme) {
    return {};
  }

  return {
    backgroundColor: theme.backgroundColor,
    color: theme.textColor,
    fontFamily: theme.fontFamily,
  };
};

/**
 * Themed widget wrapper - applies widget-specific styling
 */
interface ThemedWidgetProps {
  children: ReactNode;
  className?: string;
}

export const ThemedWidget: React.FC<ThemedWidgetProps> = ({ children, className = '' }) => {
  const { theme, isThemeActive } = useDashboardTheme();

  if (!isThemeActive || !theme) {
    return <div className={`bg-white rounded-lg shadow p-4 ${className}`}>{children}</div>;
  }

  return (
    <div
      className={className}
      style={{
        backgroundColor: '#ffffff',
        borderRadius: `${theme.widgetBorderRadius}px`,
        boxShadow: theme.widgetShadow,
        padding: '1rem',
      }}
    >
      {children}
    </div>
  );
};
