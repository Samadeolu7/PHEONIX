// RoleBasedNavigation - Horizontal navigation bar with permission-based modules
import React, { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Home,
  Menu,
  X,
  DollarSign,
  Package,
  Users,
  LogOut,
  User,
  Settings,
  Grid,
  Wallet,
  Clock,
  LayoutDashboard,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { usePermission } from '@/hooks/usePermissions';
import { BRAND } from '../../constants/brand';
import NotificationDropdown from '../notifications/NotificationDropdown';
import { api } from '../../services/api';

// Module definitions with their paths and required permissions
const NAV_MODULES = [
  {
    id: 'financial',
    title: 'Financial Management',
    path: '/financial-management',
    icon: DollarSign,
    description: 'Revenue, expenses, and financial reporting',
    requiredPermissions: [
      'invoice-list',
      'receivables-list',
      'fee-structure-list',
      'entitlement-list',
      'accounts-view',
    ],
  },
  {
    id: 'client-services',
    title: 'Client Services',
    path: '/client-services',
    icon: Users,
    description: 'Borrower profiles, KYC, loan applications, and account management',
    requiredPermissions: ['client-view', 'classification-view', 'entitlement-list'],
  },
  {
    id: 'operations',
    title: 'Operations',
    path: '/operations',
    icon: Package,
    description: 'Procurement, inventory, and resource management',
    requiredPermissions: ['po-list', 'pr-list', 'item-list', 'consumption-list', 'voucher-list'],
  },
  {
    id: 'administration',
    title: 'Administration',
    path: '/administration',
    icon: Users,
    description: 'HR, payroll, and system administration',
    requiredPermissions: ['staff-list', 'branch-list', 'payroll-list', 'leave-list'],
  },
  {
    id: 'treasury',
    title: 'Treasury & Expenses',
    path: '/treasury',
    icon: Wallet,
    description: 'Petty cash, expenses, and bank management',
    requiredPermissions: ['accounts-view'],
  },
  {
    id: 'all-access',
    title: 'All Access',
    path: '/all-access',
    icon: Grid,
    description: 'Search and access every feature available to your role',
    requiredPermissions: [], // Always show
  },
];

// Role colours — Krystar Trust brand palette
const ROLE_COLORS: Record<string, { primary: string; accent: string }> = {
  Director: { primary: '#0a1857', accent: '#162570' }, // deep navy
  Principal: { primary: '#1a5c3a', accent: '#1e8a57' }, // forest green
  Administrator: { primary: '#4a1a7a', accent: '#6d28d9' }, // violet
  Registrar: { primary: '#7a3010', accent: '#c2410c' }, // warm brown-red
  Officer: { primary: '#0e4d6e', accent: '#0891b2' }, // teal-blue
};

// Default color for unknown roles
const DEFAULT_ROLE_COLOR = { primary: BRAND.colors.navyPrimary, accent: BRAND.colors.navyLight };

interface RoleBasedNavigationProps {
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
}

export const RoleBasedNavigation: React.FC<RoleBasedNavigationProps> = ({
  isMobileMenuOpen,
  setIsMobileMenuOpen,
}) => {
  const { user, selectedRole, logout } = useAuth();
  const { hasPermission } = usePermission();
  const location = useLocation();
  const navigate = useNavigate();

  // Debug logging
  useEffect(() => {
    console.log('🔍 RoleBasedNavigation - selectedRole:', selectedRole);
    console.log('🔍 RoleBasedNavigation - user roles:', user?.roles);
  }, [selectedRole, user]);

  // Normalize the role name (ensure it matches the keys in ROLE_COLORS)
  const normalizedRole = (() => {
    if (!selectedRole) return 'Officer';

    // Try exact match first
    if (ROLE_COLORS[selectedRole]) return selectedRole;

    // Try case-insensitive match
    const match = Object.keys(ROLE_COLORS).find(
      key => key.toLowerCase() === selectedRole.toLowerCase()
    );

    return match || 'Officer';
  })();

  // Get role color
  const roleColor = ROLE_COLORS[normalizedRole] || DEFAULT_ROLE_COLOR;

  // Director and Principal bypass all permission checks — they see every module
  const SUPERUSER_ROLES = ['Director', 'Principal'];
  const isSuperUser = selectedRole ? SUPERUSER_ROLES.includes(selectedRole) : false;

  // Filter modules based on user permissions (superusers always see all modules)
  const accessibleModules = NAV_MODULES.filter(
    module =>
      isSuperUser ||
      module.requiredPermissions.length === 0 ||
      module.requiredPermissions.some(perm => hasPermission(perm))
  );

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleLogoClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    closeMobileMenu();
    try {
      const response = await api.get('/dashboards/default/');
      const dashboard = response.data?.data || response.data;
      if (dashboard?.id) {
        navigate(`/dashboard/${dashboard.id}`);
        return;
      }
    } catch {
      // no default found — fall through
    }
    navigate('/dashboard/role-based');
  };

  const isActivePath = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const userName =
    user?.first_name && user?.last_name
      ? `${user.first_name} ${user.last_name}`
      : user?.username || 'User';

  return (
    <>
      {/* Main Navigation Bar */}
      <nav
        className="fixed top-0 left-0 right-0 z-50 shadow-sm"
        style={{ backgroundColor: roleColor.primary }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left side - Logo and Desktop Navigation */}
            <div className="flex items-center space-x-8">
              {/* Krystar Trust Logo + Brand — navigates to user's default dashboard */}
              <button
                onClick={handleLogoClick}
                className="flex items-center space-x-2 text-white hover:text-gray-200 transition-colors"
                title="Go to my dashboard"
              >
                <div className="flex items-center space-x-2">
                  <img
                    src={BRAND.logoUrl}
                    alt={BRAND.shortName}
                    className="h-8 w-8 rounded-full object-contain"
                    style={{
                      border: `2px solid ${BRAND.colors.gold}`,
                      background: 'rgba(255,255,255,0.1)',
                      padding: '1px',
                    }}
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="hidden sm:flex flex-col leading-none">
                    <span className="font-bold text-sm" style={{ color: BRAND.colors.gold }}>
                      {BRAND.shortName}
                    </span>
                    <span className="text-white/70 text-xs hidden md:block">ERP</span>
                  </div>
                </div>
              </button>

              {/* Desktop Navigation Links */}
              <div className="hidden lg:flex items-center space-x-1">
                {/* Module Links - Only show accessible modules */}
                {accessibleModules.map(module => {
                  const Icon = module.icon;
                  return (
                    <Link
                      key={module.id}
                      to={module.path}
                      className={`px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center space-x-1 ${
                        isActivePath(module.path)
                          ? 'bg-white/20 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{module.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Right side - User Menu and Mobile Menu Button */}
            <div className="flex items-center space-x-4">
              {/* Pending Approvals shortcut */}
              <Link
                to="/approvals"
                className={`hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActivePath('/approvals')
                    ? 'bg-white/20 text-white'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                <Clock className="h-4 w-4" />
                <span>Approvals</span>
              </Link>
              {/* Role Badge - Show normalized role */}
              <div className="hidden sm:block">
                <span
                  className="px-3 py-1 rounded-full text-xs font-medium"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                  }}
                >
                  {normalizedRole}
                </span>
              </div>

              {/* User Menu - Desktop */}
              <div className="hidden lg:flex items-center space-x-3">
                <div className="flex items-center space-x-2 text-white/80">
                  <User className="h-4 w-4" />
                  <span className="text-sm">{userName}</span>
                </div>

                <div className="flex items-center space-x-1">
                  <div className="text-white/80 hover:text-white">
                    <NotificationDropdown />
                  </div>

                  <Link
                    to="/dashboard/select"
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                    title="My Dashboards"
                  >
                    <LayoutDashboard className="h-4 w-4" />
                  </Link>

                  <button
                    onClick={() => navigate('/admin/users')}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                    title="Settings"
                  >
                    <Settings className="h-4 w-4" />
                  </button>

                  <button
                    onClick={handleLogout}
                    className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 text-white hover:bg-white/10 rounded-md transition-colors z-50 relative"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <>
          {/* Backdrop to close menu when clicking outside */}
          <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={closeMobileMenu} />

          {/* Mobile Navigation Menu */}
          <div
            className="fixed top-16 left-0 right-0 z-50 lg:hidden overflow-y-auto"
            style={{
              backgroundColor: roleColor.primary,
              maxHeight: 'calc(100vh - 4rem)',
            }}
          >
            <div className="px-4 py-4 space-y-2">
              {/* Krystar Trust Logo + User Info in mobile menu */}
              <div className="flex items-center space-x-3 pb-4 border-b border-white/20">
                <img
                  src={BRAND.logoUrl}
                  alt={BRAND.shortName}
                  className="w-10 h-10 rounded-full object-contain"
                  style={{ border: `2px solid ${BRAND.colors.gold}`, padding: '1px' }}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div>
                  <div className="text-white font-medium">{userName}</div>
                  <div className="text-white/70 text-sm">{normalizedRole} · {BRAND.shortName} ERP</div>
                </div>
              </div>

              {/* Navigation Links - Only show accessible modules */}
              <div className="space-y-1 py-2">
                {accessibleModules.map(module => {
                  const Icon = module.icon;
                  return (
                    <Link
                      key={module.id}
                      to={module.path}
                      onClick={closeMobileMenu}
                      className={`flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium transition-colors ${
                        isActivePath(module.path)
                          ? 'bg-white/20 text-white'
                          : 'text-white/80 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      <div>
                        <div>{module.title}</div>
                        <div className="text-white/60 text-sm">{module.description}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-white/20 space-y-1">
                <Link
                  to="/approvals"
                  onClick={closeMobileMenu}
                  className={`flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium transition-colors ${
                    isActivePath('/approvals')
                      ? 'bg-white/20 text-white'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <Clock className="h-5 w-5" />
                  <span>Pending Approvals</span>
                </Link>
                <Link
                  to="/dashboard/select"
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <LayoutDashboard className="h-5 w-5" />
                  <span>My Dashboards</span>
                </Link>

                <Link
                  to="/dashboard/settings"
                  onClick={closeMobileMenu}
                  className="flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <Settings className="h-5 w-5" />
                  <span>Dashboard Settings</span>
                </Link>

                <button
                  onClick={() => {
                    closeMobileMenu();
                    handleLogout();
                  }}
                  className="flex items-center space-x-3 px-3 py-3 rounded-md text-base font-medium text-white/80 hover:text-white hover:bg-white/10 transition-colors w-full"
                >
                  <LogOut className="h-5 w-5" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default RoleBasedNavigation;
