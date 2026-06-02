import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Settings, LogOut, User as UserIcon, Users, Shield,
  ChevronLeft, ChevronRight, Home, LayoutDashboard,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { BRAND } from '../../constants/brand';
import NotificationDropdown from '../notifications/NotificationDropdown';
import RenderedSidebarButton from '../dashboard/RenderedSidebarButton';
import { getRoleSidebarButtons } from '../../config/roleSidebarConfig';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedRole } = useAuth();
  const [user, setUser] = React.useState<any>(null);
  const [collapsed, setCollapsed] = React.useState(false);
  const [clock, setClock] = React.useState(new Date());

  const effectiveRole = selectedRole || 'Officer';
  const sidebarButtons = getRoleSidebarButtons(effectiveRole);

  React.useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) setUser(JSON.parse(userData));
  }, []);

  React.useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  const handleLogout = () => {
    try {
      authService.logout();
    } catch {
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
      if (dashboard?.id) { navigate(`/dashboard/${dashboard.id}`); return; }
    } catch { /* fall through */ }
    navigate('/dashboard/role-based');
  };

  const userInitials = React.useMemo(() => {
    if (user?.first_name && user?.last_name)
      return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
    if (user?.username) return user.username.slice(0, 2).toUpperCase();
    return 'U';
  }, [user]);

  const formattedDate = clock.toLocaleDateString('en-NG', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const formattedTime = clock.toLocaleTimeString('en-NG', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });

  const navy = BRAND.colors.navyPrimary;
  const navyDark = BRAND.colors.navyDark;
  const gold = BRAND.colors.gold;
  const goldLight = BRAND.colors.goldLight;

  return (
    <div className="flex h-screen" style={{ background: BRAND.colors.offWhite }}>
      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside
        className="flex flex-col flex-shrink-0 transition-all duration-300 ease-in-out relative"
        style={{
          width: collapsed ? 72 : 256,
          background: `linear-gradient(180deg, ${navyDark} 0%, ${navy} 60%, #162570 100%)`,
          boxShadow: '4px 0 24px rgba(10,24,87,0.18)',
        }}
      >
        {/* Brand header */}
        <div
          className="flex items-center px-4 py-5 flex-shrink-0"
          style={{ borderBottom: `1px solid rgba(183,151,88,0.25)` }}
        >
          <button
            onClick={handleLogoClick}
            className="flex items-center min-w-0 group"
            title="Go to my dashboard"
          >
            <img
              src={BRAND.logoUrl}
              alt={BRAND.shortName}
              className="flex-shrink-0 rounded-lg object-contain transition-transform duration-200 group-hover:scale-105"
              style={{
                width: 40, height: 40,
                border: `2px solid ${gold}`,
                background: navy,
                padding: 3,
              }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            {!collapsed && (
              <div className="ml-3 min-w-0">
                <span
                  className="block text-sm font-black tracking-wider leading-tight"
                  style={{ color: gold }}
                >
                  {BRAND.shortName}
                </span>
                <span className="block text-xs font-medium" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Enterprise ERP
                </span>
              </div>
            )}
          </button>
        </div>

        {/* Toggle collapse button */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className="absolute -right-3 top-16 z-10 flex items-center justify-center w-6 h-6 rounded-full shadow-md transition-colors duration-200"
          style={{ background: gold, color: navy }}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed
            ? <ChevronRight className="w-3.5 h-3.5" />
            : <ChevronLeft className="w-3.5 h-3.5" />}
        </button>

        {/* Navigation area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-1 scrollbar-thin">
          {/* Quick home link */}
          <div className="px-3">
            <Link
              to="/dashboard/role-based"
              className="flex items-center rounded-lg px-3 py-2.5 transition-all duration-150 group"
              style={{
                background: location.pathname.startsWith('/dashboard/role-based')
                  ? `rgba(183,151,88,0.18)`
                  : 'transparent',
                borderLeft: location.pathname.startsWith('/dashboard/role-based')
                  ? `3px solid ${gold}`
                  : '3px solid transparent',
              }}
              title="Home"
            >
              <Home
                className="flex-shrink-0 w-5 h-5"
                style={{
                  color: location.pathname.startsWith('/dashboard/role-based')
                    ? gold : 'rgba(255,255,255,0.6)',
                }}
              />
              {!collapsed && (
                <span
                  className="ml-3 text-sm font-medium whitespace-nowrap"
                  style={{
                    color: location.pathname.startsWith('/dashboard/role-based')
                      ? gold : 'rgba(255,255,255,0.75)',
                  }}
                >
                  Home
                </span>
              )}
            </Link>
          </div>

          {/* Main navigation */}
          <nav className="px-2">
            {sidebarButtons.map(btn => (
              <RenderedSidebarButton
                key={btn.id}
                button={btn}
                level={0}
                onNavigate={url => navigate(url)}
              />
            ))}
          </nav>

          {/* Admin Section */}
          {(user?.is_owner || user?.is_staff) && (
            <div className="px-3 pt-4">
              {!collapsed && (
                <p
                  className="px-3 mb-2 text-xs font-bold uppercase tracking-widest"
                  style={{ color: `rgba(183,151,88,0.65)` }}
                >
                  System Admin
                </p>
              )}
              <div className="space-y-1">
                <Link
                  to="/admin/users"
                  className="flex items-center rounded-lg px-3 py-2.5 transition-all duration-150"
                  style={{
                    background: location.pathname.startsWith('/admin/users')
                      ? `rgba(183,151,88,0.18)` : 'transparent',
                    borderLeft: location.pathname.startsWith('/admin/users')
                      ? `3px solid ${gold}` : '3px solid transparent',
                  }}
                  title="User Management"
                >
                  <Users
                    className="flex-shrink-0 w-5 h-5"
                    style={{ color: location.pathname.startsWith('/admin/users') ? gold : 'rgba(255,255,255,0.55)' }}
                  />
                  {!collapsed && (
                    <span
                      className="ml-3 text-sm font-medium whitespace-nowrap"
                      style={{ color: location.pathname.startsWith('/admin/users') ? gold : 'rgba(255,255,255,0.7)' }}
                    >
                      User Management
                    </span>
                  )}
                </Link>
                <Link
                  to="/admin/forms"
                  className="flex items-center rounded-lg px-3 py-2.5 transition-all duration-150"
                  style={{
                    background: location.pathname.startsWith('/admin/forms')
                      ? `rgba(183,151,88,0.18)` : 'transparent',
                    borderLeft: location.pathname.startsWith('/admin/forms')
                      ? `3px solid ${gold}` : '3px solid transparent',
                  }}
                  title="Forms & Workflows"
                >
                  <Shield
                    className="flex-shrink-0 w-5 h-5"
                    style={{ color: location.pathname.startsWith('/admin/forms') ? gold : 'rgba(255,255,255,0.55)' }}
                  />
                  {!collapsed && (
                    <span
                      className="ml-3 text-sm font-medium whitespace-nowrap"
                      style={{ color: location.pathname.startsWith('/admin/forms') ? gold : 'rgba(255,255,255,0.7)' }}
                    >
                      Forms & Workflows
                    </span>
                  )}
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* User section */}
        <div
          className="flex-shrink-0 px-3 py-4"
          style={{ borderTop: `1px solid rgba(183,151,88,0.20)` }}
        >
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
            <div className={`flex items-center ${collapsed ? '' : 'min-w-0 flex-1'}`}>
              <div
                className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold"
                style={{
                  background: `linear-gradient(135deg, ${gold}, ${BRAND.colors.goldDark})`,
                  color: navy,
                  boxShadow: `0 0 0 2px ${navy}, 0 0 0 4px ${gold}`,
                }}
              >
                {userInitials}
              </div>
              {!collapsed && (
                <div className="ml-3 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'rgba(255,255,255,0.92)' }}>
                    {user?.first_name
                      ? `${user.first_name} ${user.last_name || ''}`.trim()
                      : user?.username || 'User'}
                  </p>
                  <p className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    {user?.email}
                  </p>
                </div>
              )}
            </div>
            {!collapsed && (
              <div className="flex items-center space-x-1 ml-2">
                <Link
                  to="/account/settings"
                  title="Settings"
                  className="p-1.5 rounded-lg transition-colors duration-150"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = gold)}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                >
                  <Settings className="w-4 h-4" />
                </Link>
                <button
                  onClick={handleLogout}
                  title="Logout"
                  className="p-1.5 rounded-lg transition-colors duration-150"
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fc8181')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          {collapsed && (
            <button
              onClick={handleLogout}
              title="Logout"
              className="mt-3 w-full flex justify-center p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.45)' }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fc8181')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.45)')}
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top header */}
        <header
          className="flex-shrink-0 flex items-center justify-between px-6 py-3"
          style={{
            background: '#ffffff',
            borderBottom: `2px solid ${BRAND.colors.border}`,
            boxShadow: '0 1px 8px rgba(10,24,87,0.07)',
          }}
        >
          {/* Left: page identity */}
          <div className="flex items-center space-x-3">
            <LayoutDashboard className="w-5 h-5 flex-shrink-0" style={{ color: navy }} />
            <div>
              <h1
                className="text-base font-bold leading-tight"
                id="page-title"
                style={{ color: navy }}
              >
                Dashboard
              </h1>
              <p className="text-xs" id="page-breadcrumb" style={{ color: BRAND.colors.textSecondary }}>
                Home
              </p>
            </div>
          </div>

          {/* Right: clock + notifications */}
          <div className="flex items-center space-x-5">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-sm font-semibold" style={{ color: navy }}>{formattedTime}</span>
              <span className="text-xs" style={{ color: BRAND.colors.textSecondary }}>{formattedDate}</span>
            </div>

            <div
              className="w-px h-6 hidden sm:block"
              style={{ background: BRAND.colors.border }}
            />

            <NotificationDropdown />

            <Link
              to="/account/settings"
              className="p-2 rounded-lg transition-colors duration-150"
              style={{ color: BRAND.colors.textSecondary }}
              title="Settings"
              onMouseEnter={e => (e.currentTarget.style.color = navy)}
              onMouseLeave={e => (e.currentTarget.style.color = BRAND.colors.textSecondary)}
            >
              <Settings className="w-5 h-5" />
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto p-6"
          style={{ background: BRAND.colors.offWhite }}
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
