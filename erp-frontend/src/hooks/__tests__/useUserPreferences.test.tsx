import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useUserPreferences } from '../useUserPreferences';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock Intl.DateTimeFormat for timezone detection
Object.defineProperty(Intl, 'DateTimeFormat', {
  value: vi.fn(() => ({
    resolvedOptions: () => ({ timeZone: 'America/New_York' }),
  })),
});

describe('useUserPreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize with default preferences', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useUserPreferences());

    expect(result.current.preferences).toEqual({
      theme: 'light',
      language: 'en',
      timezone: 'America/New_York',
      sidebarCollapsed: false,
      compactMode: false,
      notifications: {
        email: true,
        push: true,
        inApp: true,
      },
    });
    expect(result.current.isLoading).toBe(false);
  });

  it('should load preferences from localStorage', () => {
    const storedPrefs = {
      theme: 'dark',
      language: 'es',
      timezone: 'Europe/Madrid',
      sidebarCollapsed: true,
      compactMode: true,
      notifications: {
        email: false,
        push: true,
        inApp: false,
      },
    };

    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedPrefs));

    const { result } = renderHook(() => useUserPreferences());

    expect(result.current.preferences).toEqual(storedPrefs);
  });

  it('should update theme preference', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useUserPreferences());

    act(() => {
      result.current.setTheme('dark');
    });

    expect(result.current.theme).toBe('dark');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'erp-user-preferences',
      expect.stringContaining('"theme":"dark"')
    );
  });

  it('should update language preference', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useUserPreferences());

    act(() => {
      result.current.setLanguage('fr');
    });

    expect(result.current.language).toBe('fr');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'erp-user-preferences',
      expect.stringContaining('"language":"fr"')
    );
  });

  it('should update notification preferences', () => {
    localStorageMock.getItem.mockReturnValue(null);

    const { result } = renderHook(() => useUserPreferences());

    act(() => {
      result.current.updateNotificationPreferences({ email: false });
    });

    expect(result.current.notifications.email).toBe(false);
    expect(result.current.notifications.push).toBe(true);
    expect(result.current.notifications.inApp).toBe(true);
  });

  it('should reset preferences to defaults', () => {
    const storedPrefs = {
      theme: 'dark',
      language: 'es',
      timezone: 'Europe/Madrid',
      sidebarCollapsed: true,
      compactMode: true,
      notifications: {
        email: false,
        push: false,
        inApp: false,
      },
    };

    localStorageMock.getItem.mockReturnValue(JSON.stringify(storedPrefs));

    const { result } = renderHook(() => useUserPreferences());

    // Verify stored preferences are loaded
    expect(result.current.theme).toBe('dark');

    act(() => {
      result.current.resetPreferences();
    });

    // Verify preferences are reset to defaults
    expect(result.current.theme).toBe('light');
    expect(result.current.language).toBe('en');
    expect(result.current.sidebarCollapsed).toBe(false);
    expect(result.current.compactMode).toBe(false);
    expect(result.current.notifications).toEqual({
      email: true,
      push: true,
      inApp: true,
    });
  });
});
