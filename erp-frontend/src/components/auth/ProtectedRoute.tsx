// components/auth/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '@/hooks/usePermissions';
import { permissionService } from '../../services/permissionService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requiredPermission?: string; // optional permission ID
  fallbackPath?: string; // where to go if permission missing
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requiredPermission,
  fallbackPath = '/error/403',
}) => {
  const location = useLocation();
  const { isAuthenticated, loading, selectedRole } = useAuth();
  const { hasPermission } = usePermission();

  // Wildcard: global-scope superusers bypass all fine-grained checks.
  const isSuperWildcard = permissionService.hasGlobalScope() && permissionService.isSuperUser();

  // View-only pages are open to any authenticated user who has at least one role.
  // Write-level codes (create/edit/delete/approve) still require explicit backend grants.
  const isViewPermission = typeof requiredPermission === 'string' && requiredPermission.endsWith('-view');
  const hasAnyRole = permissionService.getUserRoles().length > 0;

  const isWildcard = isSuperWildcard || (isViewPermission && hasAnyRole);

  // Wait for auth to finish loading
  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '18px',
          color: '#666',
        }}
      >
        Loading...
      </div>
    );
  }

  // Check authentication if required
  if (requireAuth && !isAuthenticated) {
    console.log('❌ ProtectedRoute: Redirecting to login - NOT AUTHENTICATED');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // If the user is authenticated but the role hasn't been hydrated yet (race condition
  // between setLoading(false) and setSelectedRole), keep showing the spinner rather
  // than prematurely redirecting to /error/403.
  if (isAuthenticated && !selectedRole) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          height: '100vh',
          fontSize: '18px',
          color: '#666',
        }}
      >
        Loading...
      </div>
    );
  }

  // If authenticated and a specific permission is required, check it.
  // Wildcard users (global scope + elevated roles confirmed by backend) bypass the
  // specific code check, but are still required to be authenticated above.
  if (requiredPermission && !isWildcard && !hasPermission(requiredPermission)) {
    console.log('❌ ProtectedRoute: Redirecting to forbidden - MISSING PERMISSION', {
      requiredPermission,
      selectedRole,
    });
    return <Navigate to={fallbackPath} replace />;
  }

  console.log('✅ ProtectedRoute: Access granted');
  return <>{children}</>;
};
