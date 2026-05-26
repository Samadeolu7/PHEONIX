// Route configuration with role-based access control
import { RouteObject } from 'react-router-dom';
import { PageId, PAGE_DEFINITIONS } from '../types/permissions';
import { UserRole } from '../types/roles';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { ForbiddenPage, NotFoundPage } from '../pages/error/ErrorPage';
import React from 'react';

// Route configuration interface
export interface ProtectedRouteConfig extends Omit<RouteObject, 'element'> {
  pageId?: PageId;
  roles?: UserRole[];
  requireAuth?: boolean;
  element: React.ComponentType<any>;
  children?: ProtectedRouteConfig[];
}

// Create a protected route element
export const createProtectedRoute = (
  Component: React.ComponentType<any>,
  pageId?: PageId,
  requireAuth: boolean = true
): React.ReactElement => {
  return React.createElement(ProtectedRoute, {
    pageId,
    requireAuth,
    children: React.createElement(Component),
  });
};

// Generate route configuration from page definitions
export const generateRouteConfig = (
  pageDefinitions: typeof PAGE_DEFINITIONS,
  componentMap: Record<PageId, React.ComponentType<any>>
): RouteObject[] => {
  const routes: RouteObject[] = [];

  pageDefinitions.forEach(page => {
    const Component = componentMap[page.id];
    if (Component) {
      routes.push({
        path: page.path,
        element: createProtectedRoute(Component, page.id),
      });
    }
  });

  return routes;
};

// Error route configurations
export const errorRoutes: RouteObject[] = [
  {
    path: '/error/403',
    element: React.createElement(ForbiddenPage),
  },
  {
    path: '/error/404',
    element: React.createElement(NotFoundPage),
  },
  {
    path: '*',
    element: React.createElement(NotFoundPage),
  },
];

// Helper function to check if a path requires authentication
export const requiresAuth = (path: string): boolean => {
  // Public paths that don't require authentication
  const publicPaths = ['/login', '/error/403', '/error/404', '/'];
  return !publicPaths.some(publicPath => path.startsWith(publicPath));
};

// Helper function to get page ID from path
export const getPageIdFromPath = (path: string): PageId | undefined => {
  const page = PAGE_DEFINITIONS.find(p => p.path === path);
  return page?.id;
};

// Helper function to check if user can access a route
export const canAccessRoute = (path: string, userRole: UserRole | null): boolean => {
  if (!requiresAuth(path)) return true;
  if (!userRole) return false;

  const pageId = getPageIdFromPath(path);
  if (!pageId) return true; // Allow access to undefined pages

  const page = PAGE_DEFINITIONS.find(p => p.id === pageId);
  if (!page) return true;

  // Check if user's role is in the allowed roles for this page
  const allowedRoles = PAGE_DEFINITIONS.find(p => p.id === pageId);
  // This would need to be cross-referenced with PHOENIX_ACCESS_TABLE
  // For now, we'll use the permission checking utilities
  return true; // This will be handled by the ProtectedRoute component
};

// Route metadata for navigation and breadcrumbs
export interface RouteMetadata {
  pageId: PageId;
  title: string;
  breadcrumbs: Array<{
    label: string;
    path?: string;
  }>;
  category: string;
}

// Generate route metadata
export const getRouteMetadata = (path: string): RouteMetadata | null => {
  const page = PAGE_DEFINITIONS.find(p => p.path === path);
  if (!page) return null;

  // Generate breadcrumbs based on path structure
  const pathSegments = path.split('/').filter(Boolean);
  const breadcrumbs = [
    { label: 'Home', path: '/' },
    { label: page.category },
    { label: page.title },
  ];

  return {
    pageId: page.id,
    title: page.title,
    breadcrumbs,
    category: page.category,
  };
};

// Navigation helper functions
export const getNavigationItems = (userRole: UserRole | null) => {
  if (!userRole) return [];

  // This would filter PAGE_DEFINITIONS based on user permissions
  // For now, return all pages (filtering will be done by PermissionAwareNavigation)
  return PAGE_DEFINITIONS;
};

// Route validation
export const validateRouteAccess = (
  path: string,
  userRole: UserRole | null
): { canAccess: boolean; redirectTo?: string } => {
  if (!requiresAuth(path)) {
    return { canAccess: true };
  }

  if (!userRole) {
    return { canAccess: false, redirectTo: '/login' };
  }

  const pageId = getPageIdFromPath(path);
  if (!pageId) {
    return { canAccess: true }; // Allow access to undefined pages
  }

  // This would use the permission checking utilities
  // For now, we'll let the ProtectedRoute component handle it
  return { canAccess: true };
};
