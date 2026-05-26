// src/contexts/DashboardThemeContext.tsx

import React, { createContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { DashboardTheme } from '../types';
import { themeStorage } from '../utils/themeStorage';

interface DashboardThemeContextValue {
  theme: DashboardTheme | null;
  dashboardId: string | null;
  sidebarConfig: any | null;
  sidebarCollapsed: boolean;

  // Actions
  setTheme: (theme: DashboardTheme) => void;
  setDashboardId: (id: string) => void;
  setSidebarConfig: (config: any) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  clearTheme: () => void;

  // Helpers
  isThemeActive: boolean;
  applyTheme: (dashboardId: string, theme: DashboardTheme, sidebarConfig?: any) => void;
}

const defaultTheme: DashboardTheme = {
  primaryColor: '#3b82f6',
  secondaryColor: '#10b981',
  accentColor: '#f59e0b',
  backgroundColor: '#f9fafb',
  textColor: '#1f2937',
  fontFamily: 'Inter, system-ui, sans-serif',
  widgetBorderRadius: 8,
  widgetShadow: '0 1px 3px rgba(0,0,0,0.12)',
};

export const DashboardThemeContext = createContext<DashboardThemeContextValue>({
  theme: null,
  dashboardId: null,
  sidebarConfig: null,
  sidebarCollapsed: false,
  setTheme: () => {},
  setDashboardId: () => {},
  setSidebarConfig: () => {},
  setSidebarCollapsed: () => {},
  clearTheme: () => {},
  isThemeActive: false,
  applyTheme: () => {},
});

interface DashboardThemeProviderProps {
  children: ReactNode;
}

export const DashboardThemeProvider: React.FC<DashboardThemeProviderProps> = ({ children }) => {
  const [theme, setThemeState] = useState<DashboardTheme | null>(null);
  const [dashboardId, setDashboardIdState] = useState<string | null>(null);
  const [sidebarConfig, setSidebarConfigState] = useState<any | null>(null);
  const [sidebarCollapsed, setSidebarCollapsedState] = useState(false);

  // Load theme from localStorage on mount
  useEffect(() => {
    const storedTheme = themeStorage.getTheme();
    const storedDashboardId = themeStorage.getDashboardId();
    const storedSidebarConfig = themeStorage.getSidebarConfig();
    const storedSidebarState = themeStorage.getSidebarState();

    if (storedTheme) {
      setThemeState(storedTheme);
      applyThemeToDocument(storedTheme);
    }

    if (storedDashboardId) {
      setDashboardIdState(storedDashboardId);
    }

    if (storedSidebarConfig) {
      setSidebarConfigState(storedSidebarConfig);
    }

    setSidebarCollapsedState(storedSidebarState);
  }, []);

  // Apply theme to document (CSS variables)
  const applyThemeToDocument = useCallback((theme: DashboardTheme) => {
    const root = document.documentElement;

    root.style.setProperty('--theme-primary', theme.primaryColor);
    root.style.setProperty('--theme-secondary', theme.secondaryColor);
    root.style.setProperty('--theme-accent', theme.accentColor);
    root.style.setProperty('--theme-background', theme.backgroundColor);
    root.style.setProperty('--theme-text', theme.textColor);
    root.style.setProperty('--theme-font-family', theme.fontFamily);
    root.style.setProperty('--theme-border-radius', `${theme.widgetBorderRadius}px`);
    root.style.setProperty('--theme-shadow', theme.widgetShadow);
  }, []);

  const setTheme = useCallback(
    (newTheme: DashboardTheme) => {
      setThemeState(newTheme);
      themeStorage.saveTheme(newTheme);
      applyThemeToDocument(newTheme);
    },
    [applyThemeToDocument]
  );

  const setDashboardId = useCallback((id: string) => {
    setDashboardIdState(id);
    themeStorage.saveDashboardId(id);
  }, []);

  const setSidebarConfig = useCallback((config: any) => {
    setSidebarConfigState(config);
    themeStorage.saveSidebarConfig(config);
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setSidebarCollapsedState(collapsed);
    themeStorage.saveSidebarState(collapsed);
  }, []);

  const clearTheme = useCallback(() => {
    setThemeState(null);
    setDashboardIdState(null);
    setSidebarConfigState(null);
    setSidebarCollapsedState(false);
    themeStorage.clearAll();

    // Reset to default theme
    applyThemeToDocument(defaultTheme);
  }, [applyThemeToDocument]);

  // Helper function to apply all dashboard context at once
  const applyTheme = useCallback(
    (dashboardId: string, theme: DashboardTheme, sidebarConfig?: any) => {
      setDashboardId(dashboardId);
      setTheme(theme);
      if (sidebarConfig) {
        setSidebarConfig(sidebarConfig);
      }
    },
    [setDashboardId, setTheme, setSidebarConfig]
  );

  const value: DashboardThemeContextValue = {
    theme,
    dashboardId,
    sidebarConfig,
    sidebarCollapsed,
    setTheme,
    setDashboardId,
    setSidebarConfig,
    setSidebarCollapsed,
    clearTheme,
    isThemeActive: theme !== null,
    applyTheme,
  };

  return <DashboardThemeContext.Provider value={value}>{children}</DashboardThemeContext.Provider>;
};
