// Navigation type definitions for modern ERP frontend
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export interface NavigationItem {
  id: string;
  title: string;
  path: string;
  icon?: LucideIcon;
  permissions?: string[];
  isNew?: boolean;
  isEnhanced?: boolean;
  badge?: {
    count: number;
    type: 'info' | 'warning' | 'error' | 'success';
  };
}

export interface NavigationModule {
  id: string;
  title: string;
  icon: LucideIcon;
  description: string;
  children: NavigationItem[];
  permissions?: string[];
  badge?: {
    count: number;
    type: 'info' | 'warning' | 'error' | 'success';
  };
  color?: string;
  stats?: {
    label: string;
    value: string | number;
  }[];
}

export interface BreadcrumbItem {
  label: string;
  path?: string;
  isActive?: boolean;
}

export interface NavigationState {
  currentModule: string | null;
  breadcrumbs: BreadcrumbItem[];
  sidebarCollapsed: boolean;
  recentPages: Array<{
    path: string;
    title: string;
    timestamp: Date;
  }>;
  bookmarks: string[];
}

export interface UserPreferences {
  // Dashboard preferences (role-based only)
  defaultModule: string;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  timezone: string;

  // Layout preferences
  sidebarCollapsed: boolean;
  widgetDensity: 'compact' | 'comfortable' | 'spacious';

  // Widget preferences
  widgetPreferences: {
    [widgetType: string]: {
      enabled: boolean;
      config: Record<string, any>;
      position?: {
        x: number;
        y: number;
        w: number;
        h: number;
      };
    };
  };

  // Navigation preferences
  favoritePages: string[];
  recentPagesLimit: number;

  // Notification preferences
  notifications: {
    email: boolean;
    push: boolean;
    inApp: boolean;
    desktop: boolean;
  };

  // Module-specific preferences
  modulePreferences: {
    [moduleId: string]: {
      defaultView: string;
      filters: Record<string, any>;
      sortPreferences: Record<string, 'asc' | 'desc'>;
    };
  };
}

export type NavigationLayout = 'grid' | 'list';
