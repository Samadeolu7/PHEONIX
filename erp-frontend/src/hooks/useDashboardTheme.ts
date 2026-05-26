// src/hooks/useDashboardTheme.ts

import { useContext } from 'react';
import { DashboardThemeContext } from '../contexts/DashboardThemeContext';

export const useDashboardTheme = () => {
  const context = useContext(DashboardThemeContext);

  if (!context) {
    throw new Error('useDashboardTheme must be used within DashboardThemeProvider');
  }

  return context;
};

// Helper hook to get theme-aware styles
export const useThemedStyles = () => {
  const { theme } = useDashboardTheme();

  if (!theme) {
    return {
      primaryColor: '#3b82f6',
      secondaryColor: '#10b981',
      accentColor: '#f59e0b',
      backgroundColor: '#f9fafb',
      textColor: '#1f2937',
      fontFamily: 'Inter, system-ui, sans-serif',
      widgetBorderRadius: 8,
      widgetShadow: '0 1px 3px rgba(0,0,0,0.12)',
    };
  }

  return theme;
};

// Helper to check if we're in a themed context
export const useIsThemed = () => {
  const { isThemeActive } = useDashboardTheme();
  return isThemeActive;
};
