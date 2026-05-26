// src/utils/themeStorage.ts

import { DashboardTheme } from '../types';

const THEME_STORAGE_KEY = 'activeDashboardTheme';
const DASHBOARD_ID_KEY = 'activeDashboardId';
const SIDEBAR_STATE_KEY = 'sidebarCollapsed';
const SIDEBAR_CONFIG_KEY = 'activeSidebarConfig';

export const themeStorage = {
  // Save active theme
  saveTheme(theme: DashboardTheme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
    } catch (error) {
      console.error('Failed to save theme:', error);
    }
  },

  // Get active theme
  getTheme(): DashboardTheme | null {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load theme:', error);
      return null;
    }
  },

  // Clear theme
  clearTheme(): void {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear theme:', error);
    }
  },

  // Save active dashboard ID
  saveDashboardId(dashboardId: string): void {
    try {
      localStorage.setItem(DASHBOARD_ID_KEY, dashboardId);
    } catch (error) {
      console.error('Failed to save dashboard ID:', error);
    }
  },

  // Get active dashboard ID
  getDashboardId(): string | null {
    try {
      return localStorage.getItem(DASHBOARD_ID_KEY);
    } catch (error) {
      console.error('Failed to load dashboard ID:', error);
      return null;
    }
  },

  // Save sidebar state (collapsed/expanded)
  saveSidebarState(collapsed: boolean): void {
    try {
      localStorage.setItem(SIDEBAR_STATE_KEY, JSON.stringify(collapsed));
    } catch (error) {
      console.error('Failed to save sidebar state:', error);
    }
  },

  // Get sidebar state
  getSidebarState(): boolean {
    try {
      const stored = localStorage.getItem(SIDEBAR_STATE_KEY);
      return stored ? JSON.parse(stored) : false;
    } catch (error) {
      console.error('Failed to load sidebar state:', error);
      return false;
    }
  },

  // Save sidebar configuration (navigation structure)
  saveSidebarConfig(config: any): void {
    try {
      localStorage.setItem(SIDEBAR_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error('Failed to save sidebar config:', error);
    }
  },

  // Get sidebar configuration
  getSidebarConfig(): any | null {
    try {
      const stored = localStorage.getItem(SIDEBAR_CONFIG_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Failed to load sidebar config:', error);
      return null;
    }
  },

  // Clear all dashboard-related storage
  clearAll(): void {
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
      localStorage.removeItem(DASHBOARD_ID_KEY);
      localStorage.removeItem(SIDEBAR_STATE_KEY);
      localStorage.removeItem(SIDEBAR_CONFIG_KEY);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  },

  // Check if a theme is currently active
  hasActiveTheme(): boolean {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  },

  // Get dashboard return URL (for navigation back to dashboard)
  saveDashboardReturnUrl(url: string): void {
    try {
      localStorage.setItem('dashboardReturnUrl', url);
    } catch (error) {
      console.error('Failed to save return URL:', error);
    }
  },

  getDashboardReturnUrl(): string | null {
    try {
      return localStorage.getItem('dashboardReturnUrl');
    } catch (error) {
      console.error('Failed to load return URL:', error);
      return null;
    }
  },
};
