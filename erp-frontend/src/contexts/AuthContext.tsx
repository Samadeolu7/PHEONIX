// src/contexts/AuthContext.tsx
import * as React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import { User as RealUser } from '../services/authService';
import { UserWithRole, UserRole } from '../types/roles';
import { roleService } from '../services/roleService';
import { tokenManager } from '../services/tokenManager';
import { permissionService } from '@/services/permissionService';
import { navConfigService } from '../services/navConfigService';
import { queryClient } from '../lib/queryClient';

// Use the real User type from authService
type User = RealUser;

// Legacy mock user interface for backward compatibility
interface MockUser {
  id: number;
  name: string;
  email: string;
  role: 'user' | 'admin' | 'sys_admin';
  tenant: string;
}

export interface ActiveBranch {
  id: number;
  name: string;
}

const ACTIVE_BRANCH_KEY = 'activeBranch';

interface AuthContextType {
  user: User | null;
  userWithRole: UserWithRole | null;
  selectedRole: UserRole | null;
  loading: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  // Role management
  setRole: (role: UserRole) => void;
  clearRole: () => void;
  hasRole: (role: UserRole) => boolean;
  // Branch switching (director/admin/operations/owner only)
  activeBranch: ActiveBranch | null;
  setActiveBranch: (branch: ActiveBranch | null) => void;
  isDirectorPlus: boolean;
  // True when the user holds an active temporary cross-branch grant
  // (UserPermissionOverride.target_branch) — narrower than isDirectorPlus:
  // lets the branch switcher offer just {home branch, granted branch(es)}.
  hasTempBranchAccess: boolean;
  // testing helpers (only present at runtime; safe to ignore in types)
  __setMockRole?: (role: MockUser['role']) => void;
  __seedMockUser?: (user: Partial<MockUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// decide behavior based on Vite env var (set in .env as VITE_USE_MOCK_AUTH=true)
const USE_MOCK = (import.meta as any).env?.VITE_USE_MOCK_AUTH === 'true';

// keys for localStorage when mock is used
const MOCK_STORAGE_KEY = 'mock_auth_user_v1';

// small helper to simulate network latency in mock mode
const wait = (ms = 200) => new Promise(resolve => setTimeout(resolve, ms));

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeBranch, setActiveBranchState] = useState<ActiveBranch | null>(() => {
    try {
      const raw = localStorage.getItem(ACTIVE_BRANCH_KEY);
      return raw ? (JSON.parse(raw) as ActiveBranch) : null;
    } catch {
      return null;
    }
  });

  // Helper function to set selected role from user
  const setSelectedRoleFromUser = (userData: User | null) => {
    if (!userData || !userData.roles || userData.roles.length === 0) {
      setSelectedRole(null);
      return;
    }

    // First try to get stored role from roleService
    const storedRole = roleService.getSelectedRole();

    // Check if stored role exists and is valid (exists in user's roles)
    if (storedRole && userData.roles.includes(storedRole)) {
      setSelectedRole(storedRole);
      return;
    }

    // Otherwise default to the first role
    const firstRole = userData.roles[0] as UserRole;
    setSelectedRole(firstRole);
    roleService.setSelectedRole(firstRole);
  };

  // --- Real backend loaders ---
  const loadUserReal = async () => {
    try {
      // Tab-scoped: sessionStorage only. authService.login() no longer persists
      // to localStorage, which used to let a login in one tab silently take
      // over a session still active in another tab on the same machine.
      const token = sessionStorage.getItem('accessToken');
      const storedUser = sessionStorage.getItem('user');

      if (!token) {
        setUser(null);
        setSelectedRole(null);
        setLoading(false);
        return;
      }

      // If we have a stored user, use it immediately
      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);
          // Batch all three updates together so selectedRole is never null
          // while loading is false (avoids spurious 403 redirects in ProtectedRoute).
          setUser(parsedUser);
          setSelectedRoleFromUser(parsedUser);
          setLoading(false);
          return;
        } catch (e: unknown) {
          console.error('Failed to parse stored user:', e);
        }
      }

      // Otherwise fetch from API
      const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
      const response = await fetch(`${baseUrl}/auth/me/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const userData = await response.json();
        sessionStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);

        // Hydrate permissionService (permissions, scope, page matrix) — the
        // storedUser early-return above skips this fetch entirely when a
        // cached user already exists, so this path only runs on a genuinely
        // fresh session restore; still needs the same hydration login does.
        permissionService.setPermissions(userData);

        // Set selected role from user roles
        setSelectedRoleFromUser(userData);
      } else {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('refreshToken');
        sessionStorage.removeItem('user');
        setUser(null);
        setSelectedRole(null);
      }
    } catch (error: unknown) {
      console.error('Failed to load user (real):', error);
      setUser(null);
      setSelectedRole(null);
    } finally {
      setLoading(false);
    }
  };

  const loginReal = async (email: string, password: string) => {
    // This should not be used directly - LoginPageStyled uses authService.login()
    // But keep it for compatibility
    const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api';
    const response = await fetch(`${baseUrl}/auth/login/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: email, password }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    // Store tokens using same keys/storage as authService (tab-scoped)
    if (data.access) {
      sessionStorage.setItem('accessToken', data.access);
      sessionStorage.setItem('refreshToken', data.refresh);
    }
    // Set user from response
    const userData = data.user ?? data;
    sessionStorage.setItem('user', JSON.stringify(userData));
    setUser(userData);

    // Set selected role from user roles
    setSelectedRoleFromUser(userData);
  };

  const logoutReal = () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('user');
    // Defensive: purge any pre-fix localStorage remnants too.
    ['accessToken', 'refreshToken', 'user', 'rememberMe', 'savedCredentials'].forEach(key =>
      localStorage.removeItem(key)
    );

    // Clear role selection
    roleService.clearSelectedRole();

    // Clear permissions from permissionService
    permissionService.clearPermissions();

    // Clear branch selection
    localStorage.removeItem(ACTIVE_BRANCH_KEY);
    setActiveBranchState(null);

    setUser(null);
    setSelectedRole(null);
    const logoutBase = import.meta.env.VITE_API_BASE_URL || '/api';
    fetch(`${logoutBase}/auth/logout/`, { method: 'POST' }).catch(() => {});
  };
  // --- Mock implementations ---
  const loadUserMock = async () => {
    try {
      await wait(100);
      const raw = localStorage.getItem(MOCK_STORAGE_KEY);
      if (raw) {
        const parsedUser = JSON.parse(raw);
        setUser(parsedUser);
        setSelectedRoleFromUser(parsedUser);
      } else {
        setUser(null);
        setSelectedRole(null);
      }
    } catch (err: unknown) {
      console.error('Failed to load mock user', err);
      setUser(null);
      setSelectedRole(null);
    } finally {
      setLoading(false);
    }
  };

  const loginMock = async (email: string, password: string) => {
    await wait(300);
    // simple deterministic mock: admin@example.com -> admin, sysadmin@example.com -> sys_admin
    const role: MockUser['role'] = email.includes('sys')
      ? 'sys_admin'
      : email.includes('admin')
        ? 'admin'
        : 'user';

    // Create a mock user that matches the real User interface
    const mockUser: User = {
      id: Math.floor(Math.random() * 10000),
      username: email.split('@')[0],
      email,
      first_name: '',
      last_name: '',
      tenant_id: 1,
      tenant_name: 'Mock Tenant',
      is_owner: role === 'sys_admin' || role === 'admin',
      is_staff: role === 'admin',
      is_system_admin: role === 'sys_admin',
      is_active_user: true,
      branch_id: null,
      branch_name: null,
      assigned_dashboard: null,
      assigned_dashboard_id: null,
      assigned_dashboard_slug: null,
      roles: [role],
      permissions: [],
    };

    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(mockUser));
    setUser(mockUser);
    setSelectedRoleFromUser(mockUser);
  };

  const logoutMock = () => {
    localStorage.removeItem(MOCK_STORAGE_KEY);
    // Clear role selection
    roleService.clearSelectedRole();
    setUser(null);
    setSelectedRole(null);
  };

  // helpers for tests/dev
  const setMockRole = (role: MockUser['role']) => {
    const current = user;
    if (!current) return;
    const updated: User = {
      ...current,
      is_owner: role === 'sys_admin' || role === 'admin',
      is_staff: role === 'admin',
      is_system_admin: role === 'sys_admin',
      roles: [role],
    };
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(updated));
    setUser(updated);
    setSelectedRoleFromUser(updated);
  };

  const seedMockUser = (u: Partial<MockUser>) => {
    const role = u.role ?? 'user';
    const seeded: User = {
      id: u.id ?? 1,
      username: u.name ?? 'mockuser',
      email: u.email ?? 'mockuser@example.com',
      first_name: '',
      last_name: '',
      tenant_id: 1,
      tenant_name: u.tenant ?? 'mock-tenant',
      is_owner: role === 'sys_admin' || role === 'admin',
      is_staff: role === 'admin',
      is_system_admin: role === 'sys_admin',
      is_active_user: true,
      branch_id: null,
      branch_name: null,
      assigned_dashboard: null,
      assigned_dashboard_id: null,
      assigned_dashboard_slug: null,
      roles: [role],
      permissions: [],
    };
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(seeded));
    setUser(seeded);
    setSelectedRoleFromUser(seeded);
  };

  // Role management methods
  const setRole = (role: UserRole) => {
    roleService.setSelectedRole(role);
    setSelectedRole(role);
  };

  const clearRole = () => {
    roleService.clearSelectedRole();
    setSelectedRole(null);
  };

  // Branch switching
  const setActiveBranch = (branch: ActiveBranch | null) => {
    if (branch) {
      localStorage.setItem(ACTIVE_BRANCH_KEY, JSON.stringify(branch));
    } else {
      localStorage.removeItem(ACTIVE_BRANCH_KEY);
    }
    setActiveBranchState(branch);
    // The <main key={activeBranch?.id}> remount alone doesn't force React
    // Query to refetch (refetchOnMount is false), so cached data from the
    // previous branch could otherwise linger silently after switching.
    queryClient.invalidateQueries();
  };

  // Mirrors the backend's actual elevated-user check (common.views's
  // _is_elevated_user / users.auth's _has_global_scope) instead of matching
  // selectedRole against a hardcoded set of role names — a role like
  // "MD / CEO" or "Auditor" is global-scope on the backend regardless of
  // what it's literally named, so this can't drift out of sync with it.
  const isDirectorPlus = user?.has_global_scope ?? false;
  const hasTempBranchAccess = (user?.temp_branch_access?.length ?? 0) > 0;

  const hasRole = (role: UserRole) => {
    return selectedRole === role;
  };

  // Create userWithRole when user or selectedRole changes
  const userWithRole: UserWithRole | null = user
    ? roleService.combineUserWithRole(user, selectedRole || undefined)
    : null;

  // Refresh nav config from server whenever the user first authenticates.
  // This keeps the sidebar in sync across all devices without blocking rendering.
  useEffect(() => {
    if (user) {
      navConfigService.fetchAll().catch(() => { /* non-fatal */ });
    }
  }, [user?.id]);

  // --- mount effect ---
  useEffect(() => {
    // Load selected role on mount from roleService
    const storedRole = roleService.getSelectedRole();

    // If we have a user, validate stored role against user's roles
    if (user && user.roles && user.roles.length > 0) {
      if (storedRole && user.roles.includes(storedRole)) {
        setSelectedRole(storedRole);
      } else {
        // Default to first role
        const firstRole = user.roles[0] as UserRole;
        setSelectedRole(firstRole);
        roleService.setSelectedRole(firstRole);
      }
    }

    if (USE_MOCK) {
      loadUserMock();
    } else {
      loadUserReal();

      // Listen for token refresh events in real mode
      const unsubscribe = tokenManager.addRefreshListener(_tokens => {
        // Force reload user data to ensure we stay authenticated
        loadUserReal();
      });

      // Listen for custom login event
      const handleLoginEvent = () => {
        loadUserReal();
      };

      // Listen for role change events
      const handleRoleChange = (event: CustomEvent) => {
        setSelectedRole(event.detail.role);
      };

      const handleRoleCleared = () => {
        setSelectedRole(null);
      };

      window.addEventListener('auth:login', handleLoginEvent);
      window.addEventListener('role:changed', handleRoleChange as EventListener);
      window.addEventListener('role:cleared', handleRoleCleared);

      return () => {
        unsubscribe();
        window.removeEventListener('auth:login', handleLoginEvent);
        window.removeEventListener('role:changed', handleRoleChange as EventListener);
        window.removeEventListener('role:cleared', handleRoleCleared);
      };
    }
  }, []); // Empty dependency array - runs once on mount

  // Update selected role when user changes
  useEffect(() => {
    if (user && user.roles && user.roles.length > 0) {
      const storedRole = roleService.getSelectedRole();
      if (storedRole && user.roles.includes(storedRole)) {
        setSelectedRole(storedRole);
      } else {
        const firstRole = user.roles[0] as UserRole;
        setSelectedRole(firstRole);
        roleService.setSelectedRole(firstRole);
      }
    } else {
      setSelectedRole(null);
    }
  }, [user]);

  // conditionally delegate to mock or real
  const login = USE_MOCK ? loginMock : loginReal;
  const logout = USE_MOCK ? logoutMock : logoutReal;

  const isAdmin = Boolean(user?.is_owner || user?.is_staff || user?.is_system_admin);

  // expose test helpers only when using mock (keeps API consistent)
  const value: AuthContextType = {
    user,
    userWithRole,
    selectedRole,
    loading,
    isLoading: loading,
    isAuthenticated: !!user,
    login,
    logout,
    isAdmin,
    // Role management
    setRole,
    clearRole,
    hasRole,
    // Branch switching
    activeBranch,
    setActiveBranch,
    isDirectorPlus,
    hasTempBranchAccess,
    ...(USE_MOCK ? { __setMockRole: setMockRole, __seedMockUser: seedMockUser } : {}),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
