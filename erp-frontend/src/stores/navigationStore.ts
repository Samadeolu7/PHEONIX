// Navigation state management with Zustand
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { NavigationState, BreadcrumbItem, UserPreferences } from '../types/navigation';

interface NavigationStore extends NavigationState {
  // Actions
  setCurrentModule: (moduleId: string | null) => void;
  setBreadcrumbs: (breadcrumbs: BreadcrumbItem[]) => void;
  addBreadcrumb: (breadcrumb: BreadcrumbItem) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  addRecentPage: (path: string, title: string) => void;
  toggleBookmark: (path: string) => void;
  clearRecentPages: () => void;
}

interface UserPreferencesStore {
  preferences: UserPreferences;
  setPreferences: (preferences: Partial<UserPreferences>) => void;
  setDashboardLayout: (layout: 'role-based' | 'workflow-centric') => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
  setSidebarPreference: (collapsed: boolean) => void;
}

export const useNavigationStore = create<NavigationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      currentModule: null,
      breadcrumbs: [],
      sidebarCollapsed: false,
      recentPages: [],
      bookmarks: [],

      // Actions
      setCurrentModule: moduleId => set({ currentModule: moduleId }),

      setBreadcrumbs: breadcrumbs => set({ breadcrumbs }),

      addBreadcrumb: breadcrumb =>
        set(state => ({
          breadcrumbs: [...state.breadcrumbs, breadcrumb],
        })),

      toggleSidebar: () =>
        set(state => ({
          sidebarCollapsed: !state.sidebarCollapsed,
        })),

      setSidebarCollapsed: collapsed => set({ sidebarCollapsed: collapsed }),

      addRecentPage: (path, title) =>
        set(state => {
          const existingIndex = state.recentPages.findIndex(page => page.path === path);
          let newRecentPages = [...state.recentPages];

          if (existingIndex >= 0) {
            // Move existing page to top
            const [existingPage] = newRecentPages.splice(existingIndex, 1);
            newRecentPages.unshift({ ...existingPage, timestamp: new Date() });
          } else {
            // Add new page to top
            newRecentPages.unshift({ path, title, timestamp: new Date() });
          }

          // Keep only last 10 pages
          newRecentPages = newRecentPages.slice(0, 10);

          return { recentPages: newRecentPages };
        }),

      toggleBookmark: path =>
        set(state => {
          const isBookmarked = state.bookmarks.includes(path);
          return {
            bookmarks: isBookmarked
              ? state.bookmarks.filter(bookmark => bookmark !== path)
              : [...state.bookmarks, path],
          };
        }),

      clearRecentPages: () => set({ recentPages: [] }),
    }),
    {
      name: 'navigation-store',
      partialize: state => ({
        sidebarCollapsed: state.sidebarCollapsed,
        recentPages: state.recentPages,
        bookmarks: state.bookmarks,
      }),
    }
  )
);

export const useUserPreferencesStore = create<UserPreferencesStore>()(
  persist(
    set => ({
      preferences: {
        dashboardLayout: 'role-based',
        theme: 'light',
        language: 'en',
        timezone: 'UTC',
        defaultModule: 'financial',
        sidebarCollapsed: false,
        notifications: {
          email: true,
          push: true,
          inApp: true,
        },
      },

      setPreferences: newPreferences =>
        set(state => ({
          preferences: { ...state.preferences, ...newPreferences },
        })),

      setDashboardLayout: layout =>
        set(state => ({
          preferences: { ...state.preferences, dashboardLayout: layout },
        })),

      setTheme: theme =>
        set(state => ({
          preferences: { ...state.preferences, theme },
        })),

      setSidebarPreference: collapsed =>
        set(state => ({
          preferences: { ...state.preferences, sidebarCollapsed: collapsed },
        })),
    }),
    {
      name: 'user-preferences-store',
    }
  )
);
