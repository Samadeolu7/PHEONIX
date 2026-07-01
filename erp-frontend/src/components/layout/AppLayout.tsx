import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  Settings, LogOut, User as UserIcon, Users, Shield,
  ChevronLeft, ChevronRight, Home, LayoutDashboard,
  GitBranch, ChevronDown, Check, X, MessageSquare,
} from 'lucide-react';
import { authService } from '../../services/authService';
import { BRAND } from '../../constants/brand';
import NotificationDropdown from '../notifications/NotificationDropdown';
import RenderedSidebarButton from '../dashboard/RenderedSidebarButton';
import { getRoleSidebarButtons } from '../../config/roleSidebarConfig';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { branchService, Branch } from '../../services/branchService';
import { ThreadProvider, useThreadContext } from '../../contexts/ThreadContext';
import { ThreadPanel } from '../threads/ThreadPanel';
import { ErrorBoundary } from '../error/ErrorBoundary';

// ---------------------------------------------------------------------------
// BranchSwitcher — only rendered for director / admin / operations / owner
// ---------------------------------------------------------------------------
function BranchSwitcher() {
  const { activeBranch, setActiveBranch, isDirectorPlus } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [loading, setLoading] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Load branches when dropdown opens
  React.useEffect(() => {
    if (!open || branches.length > 0) return;
    setLoading(true);
    branchService.listBranches()
      .then(setBranches)
      .catch(() => setBranches([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!isDirectorPlus) return null;

  const label = activeBranch ? activeBranch.name : 'All Branches';

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '5px 10px',
          borderRadius: '8px',
          border: `1px solid ${activeBranch ? BRAND.colors.primary : BRAND.colors.border}`,
          background: activeBranch ? `${BRAND.colors.primary}12` : '#f9fafb',
          color: activeBranch ? BRAND.colors.primary : BRAND.colors.textSecondary,
          fontSize: '13px',
          fontWeight: 500,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
        title="Switch branch view"
      >
        <GitBranch size={13} />
        {label}
        <ChevronDown size={12} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            minWidth: '200px',
            background: '#fff',
            border: `1px solid ${BRAND.colors.border}`,
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* All Branches option */}
          <button
            type="button"
            onClick={() => { setActiveBranch(null); setOpen(false); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '10px 14px',
              background: !activeBranch ? `${BRAND.colors.primary}0d` : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${BRAND.colors.border}`,
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              color: BRAND.colors.primary,
              textAlign: 'left',
            }}
          >
            All Branches
            {!activeBranch && <Check size={13} />}
          </button>

          {/* Branch list */}
          <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
            {loading && (
              <p style={{ padding: '12px 14px', fontSize: '12px', color: BRAND.colors.textSecondary }}>
                Loading…
              </p>
            )}
            {!loading && branches.length === 0 && (
              <p style={{ padding: '12px 14px', fontSize: '12px', color: BRAND.colors.textSecondary }}>
                No branches found.
              </p>
            )}
            {branches.map(b => (
              <button
                key={b.id}
                type="button"
                onClick={() => { setActiveBranch({ id: b.id, name: b.name }); setOpen(false); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '9px 14px',
                  background: activeBranch?.id === b.id ? `${BRAND.colors.primary}0d` : 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#374151',
                  textAlign: 'left',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f3f4f6'; }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background =
                    activeBranch?.id === b.id ? `${BRAND.colors.primary}0d` : 'transparent';
                }}
              >
                <span>{b.name}</span>
                {activeBranch?.id === b.id && <Check size={13} style={{ color: BRAND.colors.primary }} />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThreadsNavItem({ collapsed, navy, gold }: { collapsed: boolean; navy: string; gold: string }) {
  const { globalUnreadCount } = useThreadContext();
  const location = useLocation();
  const active = location.pathname === '/threads';
  return (
    <Link
      to="/threads"
      className="flex items-center rounded-lg px-3 py-2.5 transition-all duration-150 relative"
      style={{
        background: active ? `rgba(183,151,88,0.18)` : 'transparent',
        borderLeft: active ? `3px solid ${gold}` : '3px solid transparent',
      }}
      title="Discussions"
    >
      <div className="relative flex-shrink-0">
        <MessageSquare
          className="w-5 h-5"
          style={{ color: active ? gold : 'rgba(255,255,255,0.6)' }}
        />
        {globalUnreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center">
            {globalUnreadCount > 99 ? '99+' : globalUnreadCount}
          </span>
        )}
      </div>
      {!collapsed && (
        <span
          className="ml-3 text-sm font-medium whitespace-nowrap"
          style={{ color: active ? gold : 'rgba(255,255,255,0.75)' }}
        >
          Discussions
          {globalUnreadCount > 0 && (
            <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full">
              {globalUnreadCount}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

function AppLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { selectedRole, activeBranch, isDirectorPlus } = useAuth();
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
    const firstName = typeof user?.first_name === 'string' ? user.first_name : '';
    const lastName = typeof user?.last_name === 'string' ? user.last_name : '';
    const username = typeof user?.username === 'string' ? user.username : '';

    if (firstName && lastName) return `${firstName[0]}${lastName[0]}`.toUpperCase();
    if (username) return username.slice(0, 2).toUpperCase();
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

          {/* Discussions */}
          <div className="px-3">
            <ThreadsNavItem collapsed={collapsed} navy={navy} gold={gold} />
          </div>

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
                  {activeBranch && (
                    <p className="text-xs truncate font-medium" style={{ color: 'rgba(255,220,100,0.9)' }}>
                      {activeBranch.name}
                    </p>
                  )}
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

          {/* Centre-right: branch switcher */}
          <BranchSwitcher />

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

        {/* All-branches read-only banner */}
        {isDirectorPlus && !activeBranch && (
          <div className="flex flex-shrink-0 items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm font-medium text-amber-800">
            <GitBranch size={14} />
            Viewing all branches — select a branch from the top bar to create or edit records.
          </div>
        )}

        {/* Page content */}
        <main
          className="flex-1 overflow-x-hidden overflow-y-auto p-6"
          style={{ background: BRAND.colors.offWhite }}
        >
          <Outlet />
        </main>
      </div>

      {/* Thread slide panel — renders fixed-positioned, mounts once at app level */}
      <ErrorBoundary showRetry showHome={false}>
        <ThreadPanel />
      </ErrorBoundary>
    </div>
  );
}

export default function AppLayout() {
  return (
    <ThreadProvider>
      <AppLayoutInner />
    </ThreadProvider>
  );
}
