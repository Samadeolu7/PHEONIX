// Simplified user preferences service (local storage only, no dashboard customization)
import { UserPreferences } from '../types/userPreferences';

export class UserPreferencesService {
  private static instance: UserPreferencesService;
  private preferences: UserPreferences | null = null;
  private readonly STORAGE_KEY = 'erp-user-preferences';

  private constructor() {}

  public static getInstance(): UserPreferencesService {
    if (!UserPreferencesService.instance) {
      UserPreferencesService.instance = new UserPreferencesService();
    }
    return UserPreferencesService.instance;
  }

  // Initialize preferences with defaults
  public initializePreferences(): UserPreferences {
    // Try to load from local storage first
    const localPrefs = this.loadFromLocalStorage();
    if (localPrefs) {
      this.preferences = localPrefs;
      return localPrefs;
    }

    // Create default preferences
    const defaultPrefs = this.createDefaultPreferences();
    this.preferences = defaultPrefs;
    this.saveToLocalStorage(defaultPrefs);

    return defaultPrefs;
  }

  // Create default preferences
  private createDefaultPreferences(): UserPreferences {
    return {
      theme: 'light',
      language: 'en',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      sidebarCollapsed: false,
      compactMode: false,
      notifications: {
        email: true,
        push: true,
        inApp: true,
      },
    };
  }

  // Local storage methods
  private saveToLocalStorage(preferences: UserPreferences): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(preferences));
    } catch (error) {
      console.warn('Could not save preferences to local storage:', error);
    }
  }

  private loadFromLocalStorage(): UserPreferences | null {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.warn('Could not load preferences from local storage:', error);
      return null;
    }
  }

  // Public methods for updating preferences
  public updatePreferences(updates: Partial<UserPreferences>): UserPreferences {
    if (!this.preferences) {
      this.preferences = this.createDefaultPreferences();
    }

    const updatedPreferences = { ...this.preferences, ...updates };

    this.saveToLocalStorage(updatedPreferences);
    this.preferences = updatedPreferences;

    return updatedPreferences;
  }

  public getPreferences(): UserPreferences | null {
    return this.preferences;
  }

  // Theme-specific methods
  public getTheme(): 'light' | 'dark' | 'auto' {
    return this.preferences?.theme || 'light';
  }

  public setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.updatePreferences({ theme });
  }

  // Language methods
  public getLanguage(): string {
    return this.preferences?.language || 'en';
  }

  public setLanguage(language: string): void {
    this.updatePreferences({ language });
  }

  // Timezone methods
  public getTimezone(): string {
    return this.preferences?.timezone || 'UTC';
  }

  public setTimezone(timezone: string): void {
    this.updatePreferences({ timezone });
  }

  // UI state methods
  public isSidebarCollapsed(): boolean {
    return this.preferences?.sidebarCollapsed || false;
  }

  public setSidebarCollapsed(collapsed: boolean): void {
    this.updatePreferences({ sidebarCollapsed: collapsed });
  }

  public isCompactMode(): boolean {
    return this.preferences?.compactMode || false;
  }

  public setCompactMode(compact: boolean): void {
    this.updatePreferences({ compactMode: compact });
  }

  // Notification methods
  public getNotificationPreferences() {
    return (
      this.preferences?.notifications || {
        email: true,
        push: true,
        inApp: true,
      }
    );
  }

  public updateNotificationPreferences(
    notifications: Partial<UserPreferences['notifications']>
  ): void {
    const currentNotifications = this.getNotificationPreferences();
    this.updatePreferences({
      notifications: { ...currentNotifications, ...notifications },
    });
  }

  // Reset preferences to defaults
  public resetPreferences(): UserPreferences {
    const defaultPrefs = this.createDefaultPreferences();
    this.preferences = defaultPrefs;
    this.saveToLocalStorage(defaultPrefs);
    return defaultPrefs;
  }

  // Clear all preferences
  public clearPreferences(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      this.preferences = null;
    } catch (error) {
      console.warn('Could not clear preferences from local storage:', error);
    }
  }
}

// Export singleton instance
export const userPreferencesService = UserPreferencesService.getInstance();
