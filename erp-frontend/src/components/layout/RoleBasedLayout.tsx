// RoleBasedLayout - Main layout component with role-based navigation
import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { RoleBasedNavigation } from './RoleBasedNavigation';
import { useAuth } from '../../contexts/AuthContext';

interface RoleBasedLayoutProps {
  children?: React.ReactNode;
}

const RoleBasedLayout: React.FC<RoleBasedLayoutProps> = ({ children }) => {
  const { user, selectedRole } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Don't show navigation on auth pages
  const isAuthPage =
    location.pathname.startsWith('/login') ||
    location.pathname.startsWith('/register') ||
    location.pathname === '/';

  // Dashboard builder/setup pages have their own sidebar — no top nav needed.
  // The role-based dashboard page (/dashboard/role-based) DOES get the top nav.
  // /dashboard/select and /dashboard/settings also get the top nav.
  const NAV_VISIBLE_DASHBOARD_PATHS = [
    '/dashboard/role-based',
    '/dashboard/select',
    '/dashboard/settings',
  ];
  const isDashboardRoute =
    location.pathname.startsWith('/dashboard') &&
    !NAV_VISIBLE_DASHBOARD_PATHS.some(p => location.pathname === p || location.pathname.startsWith(p + '/'));

  // Don't show navigation if user is not authenticated, on auth pages, or on dashboard pages
  if (!user || isAuthPage || isDashboardRoute) {
    return <div className="min-h-screen bg-gray-50">{children || <Outlet />}</div>;
  }

  const effectiveRole = selectedRole || 'Officer';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navigation */}
      <RoleBasedNavigation
        role={effectiveRole}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      />

      {/* Main Content */}
      <main className="pt-16">
        {' '}
        {/* Add padding-top to account for fixed navigation */}
        {children || <Outlet />}
      </main>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default RoleBasedLayout;
