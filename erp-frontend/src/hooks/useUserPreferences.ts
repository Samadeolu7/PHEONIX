import { useState, useEffect, useCallback } from 'react';
import { UserPreferences } from '../types/userPreferences';
import { userPreferencesService } from '../services/userPreferencesService';

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize preferences on mount
  useEffect(() => {
    const initPrefs = userPreferencesService.initializePreferences();
    setPreferences(initPrefs);
    setIsLoading(false);
  }, []);

  // Update preferences
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    const updatedPrefs = userPreferencesService.updatePreferences(updates);
    setPreferences(updatedPrefs);
    return updatedPrefs;
  }, []);

  // Theme methods
  const setTheme = useCallback((theme: 'light' | 'dark' | 'auto') => {
    userPreferencesService.setTheme(theme);
    setPreferences(userPreferencesService.getPreferences());
  }, []);

  const getTheme = useCallback(() => {
    return userPreferencesService.getTheme();
  }, []);

  // Language methods
  const setLanguage = useCallback((language: string) => {
    userPreferencesService.setLanguage(language);
    setPreferences(userPreferencesService.getPreferences());
  }, []);

  const getLanguage = useCallback(() => {
    return userPreferencesService.getLanguage();
  }, []);

  // Timezone methods
  const setTimezone = useCallback((timezone: string) => {
    userPreferencesService.setTimezone(timezone);
    setPreferences(userPreferencesService.getPreferences());
  }, []);

  const getTimezone = useCallback(() => {
    return userPreferencesService.getTimezone();
  }, []);

  // UI state methods
  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    userPreferencesService.setSidebarCollapsed(collapsed);
    setPreferences(userPreferencesService.getPreferences());
  }, []);

  const isSidebarCollapsed = useCallback(() => {
    return userPreferencesService.isSidebarCollapsed();
  }, []);

  const setCompactMode = useCallback((compact: boolean) => {
    userPreferencesService.setCompactMode(compact);
    setPreferences(userPreferencesService.getPreferences());
  }, []);

  const isCompactMode = useCallback(() => {
    return userPreferencesService.isCompactMode();
  }, []);

  // Notification methods
  const updateNotificationPreferences = useCallback(
    (notifications: Partial<UserPreferences['notifications']>) => {
      userPreferencesService.updateNotificationPreferences(notifications);
      setPreferences(userPreferencesService.getPreferences());
    },
    []
  );

  const getNotificationPreferences = useCallback(() => {
    return userPreferencesService.getNotificationPreferences();
  }, []);

  // Reset preferences
  const resetPreferences = useCallback(() => {
    const defaultPrefs = userPreferencesService.resetPreferences();
    setPreferences(defaultPrefs);
    return defaultPrefs;
  }, []);

  return {
    preferences,
    isLoading,
    updatePreferences,

    // Theme
    theme: preferences?.theme || 'light',
    setTheme,
    getTheme,

    // Language
    language: preferences?.language || 'en',
    setLanguage,
    getLanguage,

    // Timezone
    timezone: preferences?.timezone || 'UTC',
    setTimezone,
    getTimezone,

    // UI State
    sidebarCollapsed: preferences?.sidebarCollapsed || false,
    setSidebarCollapsed,
    isSidebarCollapsed,

    compactMode: preferences?.compactMode || false,
    setCompactMode,
    isCompactMode,

    // Notifications
    notifications: preferences?.notifications || { email: true, push: true, inApp: true },
    updateNotificationPreferences,
    getNotificationPreferences,

    // Utilities
    resetPreferences,
  };
}
