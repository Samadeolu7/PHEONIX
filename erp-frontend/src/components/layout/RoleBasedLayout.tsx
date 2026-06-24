// RoleBasedLayout - Main layout component with role-based navigation
import React, { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { RoleBasedNavigation } from './RoleBasedNavigation';
import { useAuth } from '../../contexts/AuthContext';
import RoleSidebarPanel from '../dashboard/RoleSidebarPanel';

interface RoleBasedLayoutProps {
  children?: React.ReactNode;
}

const RoleBasedLayout: React.FC<RoleBasedLayoutProps> = ({ children }) => {
  const { user, selectedRole, activeBranch, isDirectorPlus } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        onOpenSidebar={() => setIsSidebarOpen(true)}
      />

      {/* Sidebar navigation panel — available on every page */}
      <RoleSidebarPanel
        open={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        role={effectiveRole}
      />

      {/* All-branches read-only banner — sits directly below the fixed 64px navbar */}
      {isDirectorPlus && !activeBranch && (
        <div className="fixed left-0 right-0 top-16 z-40 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-sm font-medium text-amber-800">
          <GitBranch size={13} />
          Viewing all branches — select a branch from the top bar to create or edit records.
        </div>
      )}

      {/* Main Content — extra top padding when banner is visible.
          Key on activeBranch so every page remounts (re-fetches) on branch switch. */}
      <main
        key={activeBranch?.id ?? 'all'}
        className={`${isDirectorPlus && !activeBranch ? 'pt-24' : 'pt-16'}`}
      >
        {children || <Outlet />}
      </main>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </div>
  );
};

export default RoleBasedLayout;
