// Page Access Enforcement Component - Enforces role-based page access across all routes
// Based on Phoenix Software Access Table requirements

import React from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { canUserAccessRoute, getRouteMapping, getBreadcrumbs } from '../../utils/routeMapping';
import { ForbiddenPage, NotFoundPage } from '../../pages/error/ErrorPage';

interface PageAccessEnforcementProps {
  children: React.ReactNode;
  fallbackComponent?: React.ComponentType;
  redirectTo?: string;
}

export const PageAccessEnforcement: React.FC<PageAccessEnforcementProps> = ({
  children,
  fallbackComponent: FallbackComponent = ForbiddenPage,
  redirectTo,
}) => {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  // Public routes that don't require authentication
  const publicRoutes = ['/', '/login', '/register', '/error/403', '/error/404'];

  const isPublicRoute = publicRoutes.some(
    route => location.pathname === route || location.pathname.startsWith(route + '/')
  );

  // Allow access to public routes
  if (isPublicRoute) {
    return <>{children}</>;
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated || !user) {
    if (redirectTo) {
      return <Navigate to={redirectTo} state={{ from: location }} replace />;
    }
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if user can access the current route
  const canAccess = canUserAccessRoute(location.pathname, user.role);

  if (!canAccess) {
    // Check if route exists in our mapping
    const routeMapping = getRouteMapping(location.pathname);

    if (!routeMapping) {
      // Route not found in mapping, show 404
      return <NotFoundPage />;
    }

    // Route exists but user doesn't have permission, show 403
    return <FallbackComponent />;
  }

  // User has access, render children
  return <>{children}</>;
};

// Higher-order component for page access enforcement
export const withPageAccessEnforcement = <P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    fallbackComponent?: React.ComponentType;
    redirectTo?: string;
  }
) => {
  const WrappedComponent: React.FC<P> = props => {
    return (
      <PageAccessEnforcement
        fallbackComponent={options?.fallbackComponent}
        redirectTo={options?.redirectTo}
      >
        <Component {...props} />
      </PageAccessEnforcement>
    );
  };

  WrappedComponent.displayName = `withPageAccessEnforcement(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Route-specific access enforcement
interface RouteAccessGuardProps {
  path: string;
  children: React.ReactNode;
  fallbackComponent?: React.ComponentType;
}

export const RouteAccessGuard: React.FC<RouteAccessGuardProps> = ({
  path,
  children,
  fallbackComponent: FallbackComponent = ForbiddenPage,
}) => {
  const { user } = useAuth();

  const canAccess = canUserAccessRoute(path, user?.role || null);

  if (!canAccess) {
    const routeMapping = getRouteMapping(path);

    if (!routeMapping) {
      return <NotFoundPage />;
    }

    return <FallbackComponent />;
  }

  return <>{children}</>;
};

// Breadcrumb component with access enforcement
interface AccessAwareBreadcrumbsProps {
  className?: string;
  separator?: React.ReactNode;
  maxItems?: number;
}

export const AccessAwareBreadcrumbs: React.FC<AccessAwareBreadcrumbsProps> = ({
  className = '',
  separator = '/',
  maxItems = 5,
}) => {
  const { user } = useAuth();
  const location = useLocation();

  const breadcrumbs = getBreadcrumbs(location.pathname);

  // Filter breadcrumbs based on user access
  const accessibleBreadcrumbs = breadcrumbs.filter(breadcrumb => {
    if (!breadcrumb.path) return true; // Always show non-clickable breadcrumbs
    return canUserAccessRoute(breadcrumb.path, user?.role || null);
  });

  // Limit breadcrumbs if needed
  const displayBreadcrumbs = maxItems
    ? accessibleBreadcrumbs.slice(-maxItems)
    : accessibleBreadcrumbs;

  if (displayBreadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className={`flex items-center space-x-2 text-sm text-gray-600 ${className}`}>
      {displayBreadcrumbs.map((breadcrumb, index) => (
        <React.Fragment key={index}>
          {index > 0 && <span className="text-gray-400">{separator}</span>}
          {breadcrumb.path ? (
            <Link to={breadcrumb.path} className="hover:text-blue-600 transition-colors">
              {breadcrumb.label}
            </Link>
          ) : (
            <span className="font-medium text-gray-900">{breadcrumb.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
};

// Page metadata component with access information
interface PageMetadataProps {
  className?: string;
  showAccessInfo?: boolean;
}

export const PageMetadata: React.FC<PageMetadataProps> = ({
  className = '',
  showAccessInfo = false,
}) => {
  const { user } = useAuth();
  const location = useLocation();

  const routeMapping = getRouteMapping(location.pathname);

  if (!routeMapping) {
    return null;
  }

  const canAccess = canUserAccessRoute(location.pathname, user?.role || null);

  return (
    <div className={`page-metadata ${className}`}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{routeMapping.title}</h1>
          {routeMapping.description && (
            <p className="text-gray-600 mt-1">{routeMapping.description}</p>
          )}
        </div>

        {showAccessInfo && (
          <div className="text-right">
            <div
              className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                canAccess ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}
            >
              {canAccess ? 'Authorized' : 'Unauthorized'}
            </div>
            <p className="text-xs text-gray-500 mt-1">Role: {user?.role || 'None'}</p>
          </div>
        )}
      </div>

      <AccessAwareBreadcrumbs className="mt-2" />
    </div>
  );
};

// Debug component for development
interface AccessDebugInfoProps {
  className?: string;
}

export const AccessDebugInfo: React.FC<AccessDebugInfoProps> = ({ className = '' }) => {
  const { user } = useAuth();
  const location = useLocation();

  const routeMapping = getRouteMapping(location.pathname);
  const canAccess = canUserAccessRoute(location.pathname, user?.role || null);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className={`bg-gray-100 border border-gray-300 rounded p-3 text-xs ${className}`}>
      <h4 className="font-semibold mb-2">Access Debug Info</h4>
      <div className="space-y-1">
        <p>
          <strong>Path:</strong> {location.pathname}
        </p>
        <p>
          <strong>User Role:</strong> {user?.role || 'None'}
        </p>
        <p>
          <strong>Can Access:</strong> {canAccess ? 'Yes' : 'No'}
        </p>
        {routeMapping && (
          <>
            <p>
              <strong>Page ID:</strong> {routeMapping.pageId}
            </p>
            <p>
              <strong>Category:</strong> {routeMapping.category}
            </p>
            <p>
              <strong>Required Roles:</strong> {routeMapping.roles.join(', ')}
            </p>
          </>
        )}
        {!routeMapping && (
          <p className="text-orange-600">
            <strong>Warning:</strong> Route not mapped
          </p>
        )}
      </div>
    </div>
  );
};

export default PageAccessEnforcement;
