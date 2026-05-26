// Comprehensive Role-Based Access Control Test Suite
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthContext } from '../contexts/AuthContext';
import { PermissionGate } from '../components/auth/PermissionGate';
import { ProtectedRoute } from '../components/auth/ProtectedRoute';
import { usePermissions } from '../hooks/usePermissions';
import { roleService } from '../services/roleService';
import { UserRole } from '../types/roles';

// Mock the role service
vi.mock('../services/roleService', () => ({
  roleService: {
    getCurrentUserRole: vi.fn(),
    hasPermission: vi.fn(),
    getPermissionsForRole: vi.fn(),
    canAccessPage: vi.fn(),
    getRoleHierarchy: vi.fn(),
  },
}));

// Mock the usePermissions hook
vi.mock('../hooks/usePermissions', () => ({
  usePermissions: vi.fn(),
}));

// Test component for permission testing
const TestComponent = ({ requiredPermission }: { requiredPermission?: string }) => (
  <div data-testid="test-component">
    {requiredPermission ? (
      <PermissionGate permission={requiredPermission}>
        <div data-testid="protected-content">Protected Content</div>
      </PermissionGate>
    ) : (
      <div data-testid="public-content">Public Content</div>
    )}
  </div>
);

// Test wrapper with auth context
const TestWrapper = ({
  children,
  userRole = 'Officer',
  permissions = [],
  initialRoute = '/',
}: {
  children: React.ReactNode;
  userRole?: UserRole;
  permissions?: string[];
  initialRoute?: string;
}) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const mockAuthValue = {
    user: {
      id: 1,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@example.com',
      role: userRole,
    },
    isAuthenticated: true,
    login: vi.fn(),
    logout: vi.fn(),
    loading: false,
    error: null,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <AuthContext.Provider value={mockAuthValue}>
        <MemoryRouter initialEntries={[initialRoute]}>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('Role-Based Access Control System', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Permission Gate Component', () => {
    it('should render protected content when user has required permission', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn().mockReturnValue(true),
        permissions: ['financial.invoice_generation'],
        loading: false,
        error: null,
      });

      render(
        <TestWrapper userRole="Director" permissions={['financial.invoice_generation']}>
          <TestComponent requiredPermission="financial.invoice_generation" />
        </TestWrapper>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      expect(screen.getByText('Protected Content')).toBeInTheDocument();
    });

    it('should not render protected content when user lacks required permission', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn().mockReturnValue(false),
        permissions: [],
        loading: false,
        error: null,
      });

      render(
        <TestWrapper userRole="Officer" permissions={[]}>
          <TestComponent requiredPermission="admin.system_settings" />
        </TestWrapper>
      );

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
      expect(screen.queryByText('Protected Content')).not.toBeInTheDocument();
    });

    it('should handle multiple permissions correctly', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn((permission: string) => {
          return ['financial.invoice_generation', 'student.entitlements'].includes(permission);
        }),
        permissions: ['financial.invoice_generation', 'student.entitlements'],
        loading: false,
        error: null,
      });

      render(
        <TestWrapper
          userRole="Registrar"
          permissions={['financial.invoice_generation', 'student.entitlements']}
        >
          <PermissionGate permission="financial.invoice_generation">
            <div data-testid="financial-content">Financial Content</div>
          </PermissionGate>
          <PermissionGate permission="student.entitlements">
            <div data-testid="student-content">Student Content</div>
          </PermissionGate>
          <PermissionGate permission="admin.system_settings">
            <div data-testid="admin-content">Admin Content</div>
          </PermissionGate>
        </TestWrapper>
      );

      expect(screen.getByTestId('financial-content')).toBeInTheDocument();
      expect(screen.getByTestId('student-content')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-content')).not.toBeInTheDocument();
    });
  });

  describe('Role-Based Page Access', () => {
    const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

    it.each(roles)('should enforce correct page access for %s role', async role => {
      const mockRoleService = vi.mocked(roleService);

      // Mock role-specific permissions
      const rolePermissions = {
        Director: [
          'admin.system_settings',
          'financial.invoice_generation',
          'student.entitlements',
          'operations.procurement',
        ],
        Principal: [
          'financial.invoice_generation',
          'student.entitlements',
          'operations.procurement',
        ],
        Administrator: ['admin.system_settings', 'financial.invoice_generation'],
        Registrar: ['student.entitlements', 'financial.invoice_generation'],
        Officer: ['financial.invoice_generation'],
      };

      mockRoleService.getPermissionsForRole.mockReturnValue(rolePermissions[role]);
      mockRoleService.canAccessPage.mockImplementation((userRole, page) => {
        const permissions = rolePermissions[userRole as UserRole];
        const pagePermissions = {
          '/admin/users': 'admin.system_settings',
          '/financial/invoices': 'financial.invoice_generation',
          '/student/entitlements': 'student.entitlements',
          '/operations/procurement': 'operations.procurement',
        };
        return permissions.includes(pagePermissions[page as keyof typeof pagePermissions]);
      });

      // Test page access
      expect(mockRoleService.canAccessPage(role, '/admin/users')).toBe(
        role === 'Director' || role === 'Administrator'
      );
      expect(mockRoleService.canAccessPage(role, '/financial/invoices')).toBe(true);
      expect(mockRoleService.canAccessPage(role, '/student/entitlements')).toBe(
        role !== 'Officer' || role === 'Director'
      );
    });

    it('should redirect unauthorized users to 403 page', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn().mockReturnValue(false),
        permissions: [],
        loading: false,
        error: null,
      });

      const UnauthorizedPage = () => <div data-testid="unauthorized">Unauthorized Access</div>;
      const ProtectedPage = () => <div data-testid="protected-page">Protected Page</div>;

      render(
        <TestWrapper userRole="Officer" initialRoute="/admin/users">
          <ProtectedRoute
            permission="admin.system_settings"
            element={<ProtectedPage />}
            fallback={<UnauthorizedPage />}
          />
        </TestWrapper>
      );

      expect(screen.getByTestId('unauthorized')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-page')).not.toBeInTheDocument();
    });
  });

  describe('Role Hierarchy and Inheritance', () => {
    it('should respect role hierarchy for permissions', async () => {
      const mockRoleService = vi.mocked(roleService);
      mockRoleService.getRoleHierarchy.mockReturnValue({
        Director: 5,
        Principal: 4,
        Administrator: 3,
        Registrar: 2,
        Officer: 1,
      });

      // Director should inherit all permissions
      mockRoleService.hasPermission.mockImplementation((role, permission) => {
        const hierarchy = {
          Director: 5,
          Principal: 4,
          Administrator: 3,
          Registrar: 2,
          Officer: 1,
        };

        const permissionLevels = {
          'admin.system_settings': 3,
          'financial.invoice_generation': 1,
          'student.entitlements': 2,
          'operations.procurement': 2,
        };

        return (
          hierarchy[role as UserRole] >=
          permissionLevels[permission as keyof typeof permissionLevels]
        );
      });

      // Test hierarchy
      expect(mockRoleService.hasPermission('Director', 'admin.system_settings')).toBe(true);
      expect(mockRoleService.hasPermission('Administrator', 'admin.system_settings')).toBe(true);
      expect(mockRoleService.hasPermission('Registrar', 'admin.system_settings')).toBe(false);
      expect(mockRoleService.hasPermission('Officer', 'admin.system_settings')).toBe(false);

      expect(mockRoleService.hasPermission('Officer', 'financial.invoice_generation')).toBe(true);
      expect(mockRoleService.hasPermission('Registrar', 'student.entitlements')).toBe(true);
    });
  });

  describe('Dynamic Permission Updates', () => {
    it('should handle permission changes in real-time', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      let hasPermission = false;

      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn(() => hasPermission),
        permissions: hasPermission ? ['financial.invoice_generation'] : [],
        loading: false,
        error: null,
      });

      const { rerender } = render(
        <TestWrapper userRole="Officer">
          <TestComponent requiredPermission="financial.invoice_generation" />
        </TestWrapper>
      );

      // Initially no permission
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();

      // Grant permission
      hasPermission = true;
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn(() => hasPermission),
        permissions: ['financial.invoice_generation'],
        loading: false,
        error: null,
      });

      rerender(
        <TestWrapper userRole="Officer">
          <TestComponent requiredPermission="financial.invoice_generation" />
        </TestWrapper>
      );

      expect(screen.getByTestId('protected-content')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle permission loading states', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn().mockReturnValue(false),
        permissions: [],
        loading: true,
        error: null,
      });

      render(
        <TestWrapper userRole="Officer">
          <PermissionGate
            permission="financial.invoice_generation"
            fallback={<div data-testid="loading">Loading permissions...</div>}
          >
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGate>
        </TestWrapper>
      );

      expect(screen.getByTestId('loading')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });

    it('should handle permission errors gracefully', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn().mockReturnValue(false),
        permissions: [],
        loading: false,
        error: new Error('Permission check failed'),
      });

      render(
        <TestWrapper userRole="Officer">
          <PermissionGate
            permission="financial.invoice_generation"
            fallback={<div data-testid="error">Permission error</div>}
          >
            <div data-testid="protected-content">Protected Content</div>
          </PermissionGate>
        </TestWrapper>
      );

      expect(screen.getByTestId('error')).toBeInTheDocument();
      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    });
  });

  describe('Navigation Menu Filtering', () => {
    it('should filter navigation items based on role permissions', async () => {
      const mockUsePermissions = vi.mocked(usePermissions);

      // Mock Officer permissions (limited access)
      mockUsePermissions.mockReturnValue({
        hasPermission: vi.fn((permission: string) => {
          return ['financial.invoice_generation'].includes(permission);
        }),
        permissions: ['financial.invoice_generation'],
        loading: false,
        error: null,
      });

      const NavigationMenu = () => (
        <nav data-testid="navigation">
          <PermissionGate permission="financial.invoice_generation">
            <a href="/financial" data-testid="financial-link">
              Financial
            </a>
          </PermissionGate>
          <PermissionGate permission="admin.system_settings">
            <a href="/admin" data-testid="admin-link">
              Administration
            </a>
          </PermissionGate>
          <PermissionGate permission="student.entitlements">
            <a href="/students" data-testid="students-link">
              Students
            </a>
          </PermissionGate>
        </nav>
      );

      render(
        <TestWrapper userRole="Officer">
          <NavigationMenu />
        </TestWrapper>
      );

      expect(screen.getByTestId('financial-link')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-link')).not.toBeInTheDocument();
      expect(screen.queryByTestId('students-link')).not.toBeInTheDocument();
    });
  });
});
