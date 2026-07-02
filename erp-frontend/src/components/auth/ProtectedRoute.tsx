// components/auth/ProtectedRoute.tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '@/hooks/usePermissions';
import { permissionService } from '../../services/permissionService';
import type { PageAction } from '../../services/permissionService';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requiredPermission?: string; // legacy flat code — kept as the "no matrix entry" fallback
  module?: string;             // NEW — module:page primary path (preferred)
  page?: string;
  action?: PageAction;         // defaults to 'view'
  fallbackPath?: string; // where to go if permission missing
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAuth = true,
  requiredPermission,
  module,
  page,
  action = 'view',
  fallbackPath = '/error/403',
}) => {
  const location = useLocation();
  const { isAuthenticated, loading, selectedRole } = useAuth();
  const { hasPermission, resolvePageAccess } = usePermission();

  // Wildcard: global-scope superusers bypass all fine-grained checks.
  const isSuperWildcard = permissionService.hasGlobalScope() && permissionService.isSuperUser();

  // View-only pages are open to any authenticated user who has a role.
  // selectedRole is guaranteed non-null here (the loading spinner below handles the null case).
  // Using selectedRole from AuthContext rather than permissionService.getUserRoles() to avoid
  // a race where the singleton hasn't been hydrated from localStorage yet.
  const isViewPermission =
    action === 'view' || (typeof requiredPermission === 'string' && requiredPermission.endsWith('-view'));
  const hasAnyRole = selectedRole != null;

  const isWildcard = isSuperWildcard || (isViewPermission && hasAnyRole);

  // module:page is the primary check when provided. 'allow'/'deny' are
  // definitive verdicts from the matrix. 'unknown' (no registry entry for
  // this page yet — a migration-in-progress gap, not a real access decision)
  // falls through to the legacy requiredPermission check below, same as if
  // module/page had never been passed.
  const moduleVerdict = module && page ? resolvePageAccess(module, page, action) : null;

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

  // Wildcard users (global scope + elevated roles confirmed by backend) bypass
  // both the module:page and legacy code checks, but are still required to be
  // authenticated above.
  if (!isWildcard) {
    // module:page is the primary, definitive check when it resolves.
    if (moduleVerdict === 'deny') {
      console.log('❌ ProtectedRoute: Redirecting to forbidden - PAGE ACCESS DENIED', {
        module, page, action, selectedRole,
      });
      return <Navigate to={fallbackPath} replace />;
    }
    // moduleVerdict is 'allow' → skip the legacy check entirely.
    // moduleVerdict is null (no module/page passed) or 'unknown' (registry
    // gap) → fall back to the legacy requiredPermission code, same as before
    // module/page existed.
    if (moduleVerdict !== 'allow' && requiredPermission && !hasPermission(requiredPermission)) {
      console.log('❌ ProtectedRoute: Redirecting to forbidden - MISSING PERMISSION', {
        requiredPermission,
        moduleVerdict,
        selectedRole,
      });
      return <Navigate to={fallbackPath} replace />;
    }
  }

  console.log('✅ ProtectedRoute: Access granted');
  return <>{children}</>;
};
