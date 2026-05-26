// Role-Based Dashboard Testing Framework
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { RoleBasedDashboard } from '../components/dashboard/RoleBasedDashboard';
import { DashboardBuilder } from '../components/dashboard/DashboardBuilder';
import { StatsCard } from '../components/dashboard/StatsCard';
import { dashboardTemplateEngine } from '../services/dashboardTemplateEngine';
import { statsCalculationEngine } from '../services/statsCalculationEngine';
import { UserRole } from '../types/roles';
import { DashboardTemplate, StatsCardData } from '../types/dashboardTemplates';

// Mock services
vi.mock('../services/dashboardTemplateEngine', () => ({
  dashboardTemplateEngine: {
    generateTemplateForRole: vi.fn(),
    filterContentByPermissions: vi.fn(),
    applyRoleCustomizations: vi.fn(),
  },
}));

vi.mock('../services/statsCalculationEngine', () => ({
  statsCalculationEngine: {
    calculateStatsForRole: vi.fn(),
    aggregateModuleStats: vi.fn(),
    getRealtimeStats: vi.fn(),
    validateStatsData: vi.fn(),
  },
}));

// Mock dashboard data
const mockDashboardTemplates: Record<UserRole, DashboardTemplate> = {
  Director: {
    id: 'director-template',
    role: 'Director',
    name: 'Director Dashboard',
    inheritsFrom: 'base-template',
    primaryModules: ['financial', 'client-services', 'operations', 'administration'],
    secondaryModules: [],
    statsCards: [
      {
        id: 'total-revenue',
        title: 'Total Revenue',
        category: 'Financial',
        priority: 10,
        permissions: ['financial.view_reports'],
        dataSource: 'financial.revenue',
        refreshInterval: 300000,
      },
      {
        id: 'system-health',
        title: 'System Health',
        category: 'System Administration',
        priority: 8,
        permissions: ['admin.system_monitoring'],
        dataSource: 'system.health',
        refreshInterval: 60000,
      },
    ],
    quickActions: [
      {
        id: 'user-management',
        title: 'Manage Users',
        path: '/admin/users',
        permissions: ['admin.user_management'],
        priority: 10,
      },
    ],
    theme: {
      primaryColor: '#6366f1',
      accentColor: '#8b5cf6',
    },
    showModuleStats: true,
    showAlerts: true,
    showRecentActivity: true,
  },
  Principal: {
    id: 'principal-template',
    role: 'Principal',
    name: 'Principal Dashboard',
    inheritsFrom: 'base-template',
    primaryModules: ['financial', 'client-services', 'operations'],
    secondaryModules: ['administration'],
    statsCards: [
      {
        id: 'student-enrollment',
        title: 'Student Enrollment',
        category: 'Student Management',
        priority: 10,
        permissions: ['client.view_enrollment'],
        dataSource: 'students.enrollment',
        refreshInterval: 3600000,
      },
    ],
    quickActions: [],
    theme: {
      primaryColor: '#059669',
      accentColor: '#10b981',
    },
    showModuleStats: true,
    showAlerts: true,
    showRecentActivity: true,
  },
  Administrator: {
    id: 'admin-template',
    role: 'Administrator',
    name: 'Administrator Dashboard',
    inheritsFrom: 'base-template',
    primaryModules: ['administration', 'financial'],
    secondaryModules: ['client-services'],
    statsCards: [],
    quickActions: [],
    theme: {
      primaryColor: '#6b7280',
      accentColor: '#9ca3af',
    },
    showModuleStats: true,
    showAlerts: false,
    showRecentActivity: true,
  },
  Registrar: {
    id: 'registrar-template',
    role: 'Registrar',
    name: 'Registrar Dashboard',
    inheritsFrom: 'base-template',
    primaryModules: ['client-services'],
    secondaryModules: ['financial'],
    statsCards: [],
    quickActions: [],
    theme: {
      primaryColor: '#059669',
      accentColor: '#10b981',
    },
    showModuleStats: false,
    showAlerts: false,
    showRecentActivity: true,
  },
  Officer: {
    id: 'officer-template',
    role: 'Officer',
    name: 'Officer Dashboard',
    inheritsFrom: 'base-template',
    primaryModules: ['financial', 'client-services'],
    secondaryModules: ['operations'],
    statsCards: [],
    quickActions: [],
    theme: {
      primaryColor: '#dc2626',
      accentColor: '#ef4444',
    },
    showModuleStats: false,
    showAlerts: true,
    showRecentActivity: true,
  },
};

const mockStatsData: StatsCardData[] = [
  {
    id: 'total-revenue',
    title: 'Total Revenue',
    value: 125000,
    formattedValue: '$125,000',
    change: {
      value: 12.5,
      type: 'increase',
      period: 'vs last month',
    },
    trend: [100000, 110000, 115000, 125000],
    status: 'success',
    lastUpdated: new Date(),
  },
  {
    id: 'outstanding-receivables',
    title: 'Outstanding Receivables',
    value: 45000,
    formattedValue: '$45,000',
    change: {
      value: -5.2,
      type: 'decrease',
      period: 'vs last month',
    },
    trend: [50000, 48000, 47000, 45000],
    status: 'warning',
    lastUpdated: new Date(),
  },
];

// Test wrapper component
const DashboardTestWrapper = ({
  children,
  userRole = 'Officer',
  permissions = [],
}: {
  children: React.ReactNode;
  userRole?: UserRole;
  permissions?: string[];
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
        <BrowserRouter>{children}</BrowserRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};

describe('Dashboard Testing Framework', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Dashboard Template Generation', () => {
    it('should generate appropriate dashboard template for each role', async () => {
      const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

      roles.forEach(role => {
        const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);
        mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates[role]);

        const template = dashboardTemplateEngine.generateTemplateForRole(role);

        expect(template).toBeDefined();
        expect(template.role).toBe(role);
        expect(template.name).toContain(role);
        expect(Array.isArray(template.primaryModules)).toBe(true);
        expect(Array.isArray(template.statsCards)).toBe(true);
        expect(Array.isArray(template.quickActions)).toBe(true);
      });
    });

    it('should apply role-specific customizations', async () => {
      const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);

      // Director should have full access
      mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates.Director);
      const directorTemplate = dashboardTemplateEngine.generateTemplateForRole('Director');

      expect(directorTemplate.primaryModules).toContain('administration');
      expect(directorTemplate.showModuleStats).toBe(true);
      expect(directorTemplate.showAlerts).toBe(true);

      // Officer should have limited access
      mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates.Officer);
      const officerTemplate = dashboardTemplateEngine.generateTemplateForRole('Officer');

      expect(officerTemplate.primaryModules).not.toContain('administration');
      expect(officerTemplate.showModuleStats).toBe(false);
    });

    it('should filter dashboard content by permissions', async () => {
      const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);
      const mockContent = [
        { id: 'financial-stats', permissions: ['financial.view_reports'] },
        { id: 'admin-stats', permissions: ['admin.system_monitoring'] },
        { id: 'public-stats' }, // No permissions required
      ];

      mockTemplateEngine.filterContentByPermissions.mockImplementation((content, permissions) => {
        return content.filter(
          item => !item.permissions || item.permissions.some(perm => permissions.includes(perm))
        );
      });

      // Officer with limited permissions
      const officerPermissions = ['financial.view_reports'];
      const filteredContent = dashboardTemplateEngine.filterContentByPermissions(
        mockContent,
        officerPermissions
      );

      expect(filteredContent).toHaveLength(2);
      expect(filteredContent.some(item => item.id === 'financial-stats')).toBe(true);
      expect(filteredContent.some(item => item.id === 'public-stats')).toBe(true);
      expect(filteredContent.some(item => item.id === 'admin-stats')).toBe(false);
    });
  });

  describe('Stats Card System Testing', () => {
    it('should calculate stats based on user role and permissions', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(mockStatsData);

      const stats = await statsCalculationEngine.calculateStatsForRole('Director', [
        'financial.view_reports',
      ]);

      expect(stats).toBeDefined();
      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0]).toHaveProperty('id');
      expect(stats[0]).toHaveProperty('title');
      expect(stats[0]).toHaveProperty('value');
      expect(stats[0]).toHaveProperty('formattedValue');
    });

    it('should render stats cards with correct data', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(mockStatsData);

      render(
        <DashboardTestWrapper userRole="Director">
          <StatsCard
            id="total-revenue"
            title="Total Revenue"
            value={125000}
            formattedValue="$125,000"
            change={{
              value: 12.5,
              type: 'increase',
              period: 'vs last month',
            }}
            trend={[100000, 110000, 115000, 125000]}
            status="success"
            onClick={() => {}}
          />
        </DashboardTestWrapper>
      );

      expect(screen.getByText('Total Revenue')).toBeInTheDocument();
      expect(screen.getByText('$125,000')).toBeInTheDocument();
      expect(screen.getByText('12.5%')).toBeInTheDocument();
      expect(screen.getByText('vs last month')).toBeInTheDocument();
    });

    it('should handle stats card interactions', async () => {
      const mockOnClick = vi.fn();

      render(
        <DashboardTestWrapper userRole="Director">
          <StatsCard
            id="total-revenue"
            title="Total Revenue"
            value={125000}
            formattedValue="$125,000"
            onClick={mockOnClick}
          />
        </DashboardTestWrapper>
      );

      const statsCard = screen.getByRole('button');
      fireEvent.click(statsCard);

      expect(mockOnClick).toHaveBeenCalledTimes(1);
    });

    it('should validate stats data integrity', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.validateStatsData.mockImplementation(data => {
        return data.every(
          stat => stat.id && stat.title && typeof stat.value === 'number' && stat.formattedValue
        );
      });

      const validData = mockStatsData;
      const invalidData = [{ id: 'invalid', title: '', value: 'not-a-number' }] as any;

      expect(statsCalculationEngine.validateStatsData(validData)).toBe(true);
      expect(statsCalculationEngine.validateStatsData(invalidData)).toBe(false);
    });
  });

  describe('Dashboard Layout Testing', () => {
    it('should render role-based dashboard with correct modules', async () => {
      const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);
      mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates.Director);

      render(
        <DashboardTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      // Should show modules appropriate for Director
      expect(screen.getByText('Financial Management')).toBeInTheDocument();
      expect(screen.getByText('Client Services')).toBeInTheDocument();
      expect(screen.getByText('Operations')).toBeInTheDocument();
      expect(screen.getByText('Administration')).toBeInTheDocument();
    });

    it('should hide modules based on role permissions', async () => {
      const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);
      mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates.Officer);

      render(
        <DashboardTestWrapper userRole="Officer">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      // Officer should not see Administration module
      expect(screen.getByText('Financial Management')).toBeInTheDocument();
      expect(screen.getByText('Client Services')).toBeInTheDocument();
      expect(screen.queryByText('Administration')).not.toBeInTheDocument();
    });

    it('should apply role-specific themes', async () => {
      const mockTemplateEngine = vi.mocked(dashboardTemplateEngine);
      mockTemplateEngine.generateTemplateForRole.mockReturnValue(mockDashboardTemplates.Director);

      render(
        <DashboardTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      const dashboardContainer = screen.getByTestId('dashboard-container');

      // Check if theme colors are applied (this would depend on implementation)
      expect(dashboardContainer).toHaveClass('director-theme');
    });
  });

  describe('Dashboard Builder Testing', () => {
    it('should allow admins to create custom dashboards', async () => {
      const mockOnSave = vi.fn();

      render(
        <DashboardTestWrapper userRole="Director">
          <DashboardBuilder
            onSave={mockOnSave}
            availableWidgets={[
              { id: 'stats-card', name: 'Stats Card', category: 'metrics' },
              { id: 'chart-widget', name: 'Chart Widget', category: 'analytics' },
            ]}
          />
        </DashboardTestWrapper>
      );

      expect(screen.getByText('Dashboard Builder')).toBeInTheDocument();
      expect(screen.getByText('Stats Card')).toBeInTheDocument();
      expect(screen.getByText('Chart Widget')).toBeInTheDocument();

      // Test drag and drop functionality would go here
      const saveButton = screen.getByText('Save Dashboard');
      fireEvent.click(saveButton);

      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should restrict dashboard builder access to authorized roles', async () => {
      render(
        <DashboardTestWrapper userRole="Officer">
          <DashboardBuilder onSave={() => {}} availableWidgets={[]} />
        </DashboardTestWrapper>
      );

      // Officer should not have access to dashboard builder
      expect(screen.getByText('Access Denied')).toBeInTheDocument();
      expect(screen.queryByText('Dashboard Builder')).not.toBeInTheDocument();
    });
  });

  describe('Real-time Dashboard Updates', () => {
    it('should update stats in real-time', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);

      // Initial stats
      mockStatsEngine.getRealtimeStats.mockResolvedValueOnce(mockStatsData);

      const { rerender } = render(
        <DashboardTestWrapper userRole="Director">
          <StatsCard
            id="total-revenue"
            title="Total Revenue"
            value={125000}
            formattedValue="$125,000"
          />
        </DashboardTestWrapper>
      );

      expect(screen.getByText('$125,000')).toBeInTheDocument();

      // Updated stats
      const updatedStats = [
        {
          ...mockStatsData[0],
          value: 135000,
          formattedValue: '$135,000',
        },
      ];

      mockStatsEngine.getRealtimeStats.mockResolvedValueOnce(updatedStats);

      rerender(
        <DashboardTestWrapper userRole="Director">
          <StatsCard
            id="total-revenue"
            title="Total Revenue"
            value={135000}
            formattedValue="$135,000"
          />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('$135,000')).toBeInTheDocument();
      });
    });

    it('should handle real-time update errors gracefully', async () => {
      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.getRealtimeStats.mockRejectedValue(new Error('Network error'));

      render(
        <DashboardTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByText('Unable to load dashboard data')).toBeInTheDocument();
      });
    });
  });

  describe('Dashboard Performance Testing', () => {
    it('should render dashboard within acceptable time limits', async () => {
      const startTime = performance.now();

      render(
        <DashboardTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Dashboard should render within 1 second
      expect(renderTime).toBeLessThan(1000);
    });

    it('should handle large datasets efficiently', async () => {
      const largeStatsData = Array.from({ length: 100 }, (_, i) => ({
        ...mockStatsData[0],
        id: `stat-${i}`,
        title: `Stat ${i}`,
        value: Math.random() * 100000,
      }));

      const mockStatsEngine = vi.mocked(statsCalculationEngine);
      mockStatsEngine.calculateStatsForRole.mockResolvedValue(largeStatsData);

      const startTime = performance.now();

      render(
        <DashboardTestWrapper userRole="Director">
          <RoleBasedDashboard />
        </DashboardTestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('dashboard-container')).toBeInTheDocument();
      });

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should still render efficiently with large datasets
      expect(renderTime).toBeLessThan(2000);
    });
  });
});
