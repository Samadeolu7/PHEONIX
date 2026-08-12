// RoleBasedLayout - Main layout component with role-based navigation
import React, { useState } from 'react';
import { GitBranch } from 'lucide-react';
import { Outlet, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { RoleBasedNavigation } from './RoleBasedNavigation';
import { useAuth } from '../../contexts/AuthContext';
import RoleSidebarPanel from '../dashboard/RoleSidebarPanel';
import { ThreadProvider } from '../../contexts/ThreadContext';
import { ThreadPanel } from '../threads/ThreadPanel';
import { GlobalThreadToggle } from '../threads/GlobalThreadToggle';
import { useNotificationSocket } from '../../hooks/useRealtimeSocket';

interface RoleBasedLayoutProps {
  children?: React.ReactNode;
}

const RoleBasedLayout: React.FC<RoleBasedLayoutProps> = ({ children }) => {
  const { user, selectedRole, activeBranch, isDirectorPlus } = useAuth();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const queryClient = useQueryClient();

  // Single app-wide notification socket (replaces the bell's/Discussions
  // badge's polling with a push — see NotificationDropdown.tsx,
  // ThreadWidget.tsx). No-ops internally while logged out (see
  // useRealtimeSocket: it only connects once an access token exists).
  useNotificationSocket(() => {
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['threads'] });
  });

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
    return (
      <ThreadProvider>
        <div className="min-h-screen bg-gray-50">{children || <Outlet />}</div>
        <ThreadPanel />
      </ThreadProvider>
    );
  }

  const effectiveRole = selectedRole || 'Officer';

  return (
    <ThreadProvider>
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

        {/* Thread slide panel — fixed overlay, available on all authenticated pages */}
        <ThreadPanel />

        {/* Floating "Discuss" toggle — resolves the current route to its
            ModulePage catalog row and shows itself only when a director has
            marked that page threadable. See GlobalThreadToggle.tsx. */}
        <GlobalThreadToggle />
      </div>
    </ThreadProvider>
  );
};

export default RoleBasedLayout;
