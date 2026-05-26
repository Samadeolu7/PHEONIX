import React from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import { Bell, Settings, LogOut, User as UserIcon, Users, Shield } from 'lucide-react';
import { authService } from '../../services/authService';
import { BRAND } from '../../constants/brand';
import NotificationDropdown from '../notifications/NotificationDropdown';
import { api } from '../../services/api';

export default function AppLayout() {
  const navigate = useNavigate();
  const [user, setUser] = React.useState<any>(null);

  React.useEffect(() => {
    // Load user from auth
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleLogout = () => {
    // Use centralized authService to clear tokens and perform any cleanup
    try {
      authService.logout();
    } catch (err: unknown) {
      // fallback: clear local keys
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
    navigate('/login');
  };

  const handleLogoClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const response = await api.get('/dashboards/default/');
      const dashboard = response.data?.data || response.data;
      if (dashboard?.id) {
        navigate(`/dashboard/${dashboard.id}`);
        return;
      }
    } catch {
      // no default found — fall through to role-based
    }
    navigate('/dashboard/role-based');
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={handleLogoClick}
            className="flex items-center space-x-2 w-full text-left hover:opacity-80 transition-opacity"
            title="Go to my dashboard"
          >
            <img
              src={BRAND.logoUrl}
              alt={BRAND.shortName}
              className="w-8 h-8 rounded-full object-contain"
              style={{
                border: `2px solid ${BRAND.colors.gold}`,
                background: BRAND.colors.navyPrimary,
                padding: '2px',
              }}
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <span className="text-base font-bold" style={{ color: BRAND.colors.navyPrimary }}>
              {BRAND.shortName} ERP
            </span>
          </button>
        </div>

        {/* Navigation will be injected here by MainNavigation */}
        <div className="flex-1 overflow-y-auto">
          <nav id="main-navigation" className="p-4">
            {/* MainNavigation component will populate this */}
          </nav>

          {/* Admin Section - Static links for system management */}
          {(user?.is_owner || user?.is_staff) && (
            <div className="px-4 pb-4">
              <div className="mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Admin
                </h3>
              </div>
              <div className="space-y-1">
                <Link
                  to="/admin/users"
                  className="flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Users className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium">User Management</span>
                </Link>
                <Link
                  to="/admin/forms"
                  className="flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Shield className="w-5 h-5 text-gray-500" />
                  <span className="text-sm font-medium">Forms & Workflows</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <UserIcon className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{user?.name || 'User'}</p>
                <p className="text-xs text-gray-500">{user?.email}</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Link
                to="/account/settings"
                title="Account settings"
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Settings className="w-4 h-4" />
              </Link>
              <button
                onClick={handleLogout}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-gray-900" id="page-title">
                Dashboard
              </h1>
              <p className="text-sm text-gray-500" id="page-breadcrumb">
                Home
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {/* Notifications */}
              <NotificationDropdown />

              {/* Settings */}
              <button className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
