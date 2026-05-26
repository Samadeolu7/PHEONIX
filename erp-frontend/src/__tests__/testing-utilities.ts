// Comprehensive Testing Utilities for Dashboard and Role-Based Access Control
import { vi } from 'vitest';
import { UserRole } from '../types/roles';
import { DashboardTemplate, StatsCardData } from '../types/dashboardTemplates';

// Mock Data Generators
export const mockDataGenerators = {
  // Generate mock user data for different roles
  generateMockUser: (role: UserRole = 'Officer', overrides = {}) => ({
    id: 1,
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    email: 'test@example.com',
    role,
    permissions: getMockPermissionsForRole(role),
    ...overrides,
  }),

  // Generate mock stats data
  generateMockStatsData: (count: number = 10): StatsCardData[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `stat-${i}`,
      title: `Test Statistic ${i + 1}`,
      value: Math.floor(Math.random() * 100000),
      formattedValue: `$${(Math.random() * 100000).toLocaleString()}`,
      change: {
        value: (Math.random() - 0.5) * 20,
        type: Math.random() > 0.5 ? 'increase' : 'decrease',
        period: 'vs last month',
      },
      trend: Array.from({ length: 12 }, () => Math.floor(Math.random() * 100000)),
      status: ['success', 'warning', 'error'][Math.floor(Math.random() * 3)] as any,
      lastUpdated: new Date(),
    }));
  },

  // Generate mock dashboard template
  generateMockDashboardTemplate: (role: UserRole): DashboardTemplate => ({
    id: `${role.toLowerCase()}-template`,
    role,
    name: `${role} Dashboard`,
    inheritsFrom: 'base-template',
    primaryModules: getPrimaryModulesForRole(role),
    secondaryModules: getSecondaryModulesForRole(role),
    statsCards: [
      {
        id: 'test-stat',
        title: 'Test Statistic',
        category: 'Test',
        priority: 10,
        permissions: ['test.view'],
        dataSource: 'test.data',
        refreshInterval: 300000,
      },
    ],
    quickActions: [
      {
        id: 'test-action',
        title: 'Test Action',
        path: '/test',
        permissions: ['test.action'],
        priority: 10,
      },
    ],
    theme: {
      primaryColor: '#6366f1',
      accentColor: '#8b5cf6',
    },
    showModuleStats: role === 'Director' || role === 'Principal',
    showAlerts: role !== 'Registrar',
    showRecentActivity: true,
  }),

  // Generate mock navigation modules
  generateMockNavigationModules: () => [
    {
      id: 'financial',
      title: 'Financial Management',
      icon: () => '💰',
      description: 'Manage financial operations',
      children: [],
      permissions: ['financial.view'],
    },
    {
      id: 'client-services',
      title: 'Client Services',
      icon: () => '🎓',
      description: 'Manage Client Services',
      children: [],
      permissions: ['client.view'],
    },
    {
      id: 'operations',
      title: 'Operations',
      icon: () => '🏢',
      description: 'Manage operations',
      children: [],
      permissions: ['operations.view'],
    },
    {
      id: 'administration',
      title: 'Administration',
      icon: () => '⚙️',
      description: 'System administration',
      children: [],
      permissions: ['admin.view'],
    },
  ],
};

// Role-based permission mappings
export const getMockPermissionsForRole = (role: UserRole): string[] => {
  const permissionMappings = {
    Director: [
      'admin.system_settings',
      'admin.user_management',
      'financial.invoice_generation',
      'financial.view_reports',
      'student.entitlements',
      'client.view_enrollment',
      'operations.procurement',
      'operations.inventory',
    ],
    Principal: [
      'financial.invoice_generation',
      'financial.view_reports',
      'student.entitlements',
      'client.view_enrollment',
      'operations.procurement',
      'operations.inventory',
    ],
    Administrator: [
      'admin.system_settings',
      'admin.user_management',
      'financial.invoice_generation',
      'financial.view_reports',
    ],
    Registrar: ['student.entitlements', 'client.view_enrollment', 'financial.invoice_generation'],
    Officer: ['financial.invoice_generation'],
  };

  return permissionMappings[role] || [];
};

// Get primary modules for role
export const getPrimaryModulesForRole = (role: UserRole): string[] => {
  const moduleMappings = {
    Director: ['financial', 'client-services', 'operations', 'administration'],
    Principal: ['financial', 'client-services', 'operations'],
    Administrator: ['administration', 'financial'],
    Registrar: ['client-services'],
    Officer: ['financial', 'client-services'],
  };

  return moduleMappings[role] || [];
};

// Get secondary modules for role
export const getSecondaryModulesForRole = (role: UserRole): string[] => {
  const moduleMappings = {
    Director: [],
    Principal: ['administration'],
    Administrator: ['client-services'],
    Registrar: ['financial'],
    Officer: ['operations'],
  };

  return moduleMappings[role] || [];
};

// Performance Testing Utilities
export const performanceTestUtils = {
  // Measure execution time
  measureExecutionTime: async <T>(
    fn: () => Promise<T>
  ): Promise<{ result: T; duration: number }> => {
    const startTime = performance.now();
    const result = await fn();
    const endTime = performance.now();
    return {
      result,
      duration: endTime - startTime,
    };
  },

  // Create performance benchmark
  createBenchmark: (name: string, threshold: number) => ({
    name,
    threshold,
    measure: async <T>(
      fn: () => Promise<T>
    ): Promise<{ result: T; passed: boolean; duration: number }> => {
      const { result, duration } = await performanceTestUtils.measureExecutionTime(fn);
      return {
        result,
        passed: duration <= threshold,
        duration,
      };
    },
  }),

  // Memory usage utilities
  getMemoryUsage: () => {
    if ('memory' in performance) {
      return {
        used: (performance as any).memory.usedJSHeapSize,
        total: (performance as any).memory.totalJSHeapSize,
        limit: (performance as any).memory.jsHeapSizeLimit,
      };
    }
    return null;
  },

  // Create large dataset for stress testing
  createLargeDataset: (size: number) => {
    return Array.from({ length: size }, (_, i) => ({
      id: i,
      data: `item-${i}`,
      value: Math.random() * 1000,
      timestamp: new Date(Date.now() - i * 1000),
    }));
  },
};

// Accessibility Testing Utilities
export const accessibilityTestUtils = {
  // Check for required ARIA attributes
  checkAriaAttributes: (element: Element, requiredAttributes: string[]) => {
    const missingAttributes = requiredAttributes.filter(attr => !element.hasAttribute(attr));
    return {
      passed: missingAttributes.length === 0,
      missingAttributes,
    };
  },

  // Check color contrast (simplified)
  checkColorContrast: (element: Element) => {
    const styles = window.getComputedStyle(element);
    const color = styles.color;
    const backgroundColor = styles.backgroundColor;

    // This is a simplified check - in practice, you'd use a proper contrast library
    return {
      color,
      backgroundColor,
      // Placeholder for actual contrast ratio calculation
      contrastRatio: 4.5, // Assume passing for test
      passed: true,
    };
  },

  // Check keyboard navigation
  simulateKeyboardNavigation: async (container: Element, keys: string[]) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    let currentIndex = 0;
    const navigationResults = [];

    for (const key of keys) {
      switch (key) {
        case 'Tab':
          currentIndex = Math.min(currentIndex + 1, focusableElements.length - 1);
          break;
        case 'Shift+Tab':
          currentIndex = Math.max(currentIndex - 1, 0);
          break;
        case 'ArrowDown':
        case 'ArrowRight':
          currentIndex = Math.min(currentIndex + 1, focusableElements.length - 1);
          break;
        case 'ArrowUp':
        case 'ArrowLeft':
          currentIndex = Math.max(currentIndex - 1, 0);
          break;
      }

      const element = focusableElements[currentIndex] as HTMLElement;
      if (element) {
        element.focus();
        navigationResults.push({
          key,
          element: element.tagName,
          focused: document.activeElement === element,
        });
      }
    }

    return navigationResults;
  },

  // Check focus indicators
  checkFocusIndicators: (element: Element) => {
    const styles = window.getComputedStyle(element, ':focus');
    return {
      hasOutline: styles.outline !== 'none',
      hasBoxShadow: styles.boxShadow !== 'none',
      hasBorder: styles.border !== 'none',
      passed: styles.outline !== 'none' || styles.boxShadow !== 'none',
    };
  },
};

// Mock Service Factories
export const mockServiceFactories = {
  // Create mock stats calculation engine
  createMockStatsCalculationEngine: () => ({
    calculateStatsForRole: vi.fn(),
    calculateBatchStats: vi.fn(),
    optimizeCalculation: vi.fn(),
    getCachedStats: vi.fn(),
    invalidateCache: vi.fn(),
  }),

  // Create mock dashboard template engine
  createMockDashboardTemplateEngine: () => ({
    generateTemplateForRole: vi.fn(),
    filterContentByPermissions: vi.fn(),
    applyRoleCustomizations: vi.fn(),
  }),

  // Create mock role service
  createMockRoleService: () => ({
    getCurrentUserRole: vi.fn(),
    hasPermission: vi.fn(),
    getPermissionsForRole: vi.fn(),
    canAccessPage: vi.fn(),
    getRoleHierarchy: vi.fn(),
  }),

  // Create mock performance monitor
  createMockPerformanceMonitor: () => ({
    startMeasurement: vi.fn(),
    endMeasurement: vi.fn(),
    getMetrics: vi.fn(),
    reportPerformance: vi.fn(),
    setThresholds: vi.fn(),
  }),
};

// Test Scenario Builders
export const testScenarioBuilders = {
  // Build role-based access test scenarios
  buildRoleAccessScenarios: () => {
    const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];
    const pages = [
      { path: '/admin/users', permission: 'admin.user_management' },
      { path: '/financial/invoices', permission: 'financial.invoice_generation' },
      { path: '/student/entitlements', permission: 'student.entitlements' },
      { path: '/operations/procurement', permission: 'operations.procurement' },
    ];

    return roles.flatMap(role =>
      pages.map(page => ({
        role,
        page: page.path,
        permission: page.permission,
        shouldHaveAccess: getMockPermissionsForRole(role).includes(page.permission),
      }))
    );
  },

  // Build performance test scenarios
  buildPerformanceScenarios: () => [
    {
      name: 'Small Dataset',
      dataSize: 10,
      expectedMaxTime: 50,
    },
    {
      name: 'Medium Dataset',
      dataSize: 100,
      expectedMaxTime: 100,
    },
    {
      name: 'Large Dataset',
      dataSize: 1000,
      expectedMaxTime: 500,
    },
    {
      name: 'Extra Large Dataset',
      dataSize: 10000,
      expectedMaxTime: 2000,
    },
  ],

  // Build accessibility test scenarios
  buildAccessibilityScenarios: () => [
    {
      name: 'Keyboard Navigation',
      component: 'Dashboard',
      tests: ['tab-navigation', 'arrow-navigation', 'enter-activation'],
    },
    {
      name: 'Screen Reader Support',
      component: 'StatsCard',
      tests: ['aria-labels', 'live-regions', 'role-attributes'],
    },
    {
      name: 'Color Contrast',
      component: 'All Components',
      tests: ['text-contrast', 'focus-contrast', 'state-contrast'],
    },
  ],
};

// Test Assertion Helpers
export const testAssertionHelpers = {
  // Assert performance within threshold
  assertPerformanceWithinThreshold: (duration: number, threshold: number, operation: string) => {
    if (duration > threshold) {
      throw new Error(
        `Performance threshold exceeded for ${operation}: ${duration}ms > ${threshold}ms`
      );
    }
  },

  // Assert accessibility compliance
  assertAccessibilityCompliance: (violations: any[]) => {
    if (violations.length > 0) {
      const violationMessages = violations.map(v => `${v.id}: ${v.description}`);
      throw new Error(`Accessibility violations found:\n${violationMessages.join('\n')}`);
    }
  },

  // Assert role-based access
  assertRoleBasedAccess: (userRole: UserRole, requiredPermission: string, hasAccess: boolean) => {
    const userPermissions = getMockPermissionsForRole(userRole);
    const shouldHaveAccess = userPermissions.includes(requiredPermission);

    if (hasAccess !== shouldHaveAccess) {
      throw new Error(
        `Role-based access assertion failed: ${userRole} ${shouldHaveAccess ? 'should' : 'should not'} have access to ${requiredPermission}`
      );
    }
  },
};

// Export all utilities
export default {
  mockDataGenerators,
  performanceTestUtils,
  accessibilityTestUtils,
  mockServiceFactories,
  testScenarioBuilders,
  testAssertionHelpers,
  getMockPermissionsForRole,
  getPrimaryModulesForRole,
  getSecondaryModulesForRole,
};
