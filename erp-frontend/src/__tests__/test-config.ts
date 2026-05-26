// Test Configuration for Quality Assurance Suite
import { vi } from 'vitest';

// Performance thresholds for different operations
export const PERFORMANCE_THRESHOLDS = {
  // Dashboard rendering thresholds (in milliseconds)
  DASHBOARD_INITIAL_RENDER: 500,
  DASHBOARD_RE_RENDER: 100,
  DASHBOARD_WITH_LARGE_DATASET: 1000,

  // Stats calculation thresholds
  STATS_CALCULATION_SMALL: 50, // < 100 stats
  STATS_CALCULATION_MEDIUM: 100, // 100-1000 stats
  STATS_CALCULATION_LARGE: 500, // 1000-10000 stats

  // Component rendering thresholds
  STATS_CARD_RENDER: 10,
  MODULE_CARD_RENDER: 15,
  NAVIGATION_RENDER: 25,

  // API response thresholds
  API_RESPONSE_FAST: 200,
  API_RESPONSE_ACCEPTABLE: 1000,
  API_RESPONSE_SLOW: 3000,

  // Memory usage thresholds (in MB)
  MEMORY_USAGE_LIMIT: 50,
  MEMORY_LEAK_THRESHOLD: 10,
} as const;

// Accessibility testing configuration
export const ACCESSIBILITY_CONFIG = {
  // WCAG 2.1 AA compliance rules
  WCAG_RULES: {
    'color-contrast': { level: 'AA', threshold: 4.5 },
    'keyboard-navigation': { required: true },
    'focus-indicators': { required: true },
    'aria-labels': { required: true },
    'semantic-markup': { required: true },
  },

  // Axe-core configuration
  AXE_CONFIG: {
    rules: {
      'color-contrast': { enabled: true },
      keyboard: { enabled: true },
      'aria-allowed-attr': { enabled: true },
      'aria-required-attr': { enabled: true },
      'aria-valid-attr-value': { enabled: true },
      'button-name': { enabled: true },
      'link-name': { enabled: true },
      label: { enabled: true },
    },
    tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
  },

  // Keyboard navigation test sequences
  KEYBOARD_SEQUENCES: {
    TAB_NAVIGATION: ['Tab', 'Tab', 'Tab', 'Shift+Tab'],
    ARROW_NAVIGATION: ['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'],
    ACTIVATION: ['Enter', ' '], // Enter and Space
    ESCAPE: ['Escape'],
  },
} as const;

// Role-based testing configuration
export const ROLE_TESTING_CONFIG = {
  // All user roles to test
  USER_ROLES: ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'] as const,

  // Permission categories
  PERMISSION_CATEGORIES: {
    ADMIN: ['admin.system_settings', 'admin.user_management'],
    FINANCIAL: ['financial.invoice_generation', 'financial.view_reports'],
    STUDENT: ['student.entitlements', 'client.view_enrollment'],
    OPERATIONS: ['operations.procurement', 'operations.inventory'],
  },

  // Pages to test for role-based access
  PROTECTED_PAGES: [
    { path: '/admin/users', permission: 'admin.user_management' },
    { path: '/admin/roles', permission: 'admin.system_settings' },
    { path: '/financial/invoices', permission: 'financial.invoice_generation' },
    { path: '/financial/reports', permission: 'financial.view_reports' },
    { path: '/student/entitlements', permission: 'student.entitlements' },
    { path: '/operations/procurement', permission: 'operations.procurement' },
  ],

  // Dashboard modules to test
  DASHBOARD_MODULES: [
    { id: 'financial', permissions: ['financial.view'] },
    { id: 'client-services', permissions: ['client.view'] },
    { id: 'operations', permissions: ['operations.view'] },
    { id: 'administration', permissions: ['admin.view'] },
  ],
} as const;

// Test data configuration
export const TEST_DATA_CONFIG = {
  // Dataset sizes for performance testing
  DATASET_SIZES: {
    SMALL: 10,
    MEDIUM: 100,
    LARGE: 1000,
    EXTRA_LARGE: 10000,
  },

  // Mock data generation settings
  MOCK_DATA: {
    STATS_CARDS_COUNT: 20,
    NAVIGATION_MODULES_COUNT: 4,
    QUICK_ACTIONS_COUNT: 6,
    ACTIVITY_ITEMS_COUNT: 50,
  },

  // API response simulation delays
  API_DELAYS: {
    FAST: 50,
    NORMAL: 200,
    SLOW: 1000,
    VERY_SLOW: 3000,
  },
} as const;

// Test environment configuration
export const TEST_ENVIRONMENT_CONFIG = {
  // Browser viewport sizes for responsive testing
  VIEWPORTS: {
    MOBILE: { width: 375, height: 667 },
    TABLET: { width: 768, height: 1024 },
    DESKTOP: { width: 1920, height: 1080 },
    LARGE_DESKTOP: { width: 2560, height: 1440 },
  },

  // Network conditions for testing
  NETWORK_CONDITIONS: {
    FAST_3G: {
      downloadThroughput: (1.5 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    },
    SLOW_3G: {
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
      latency: 300,
    },
    OFFLINE: { downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
  },

  // Test timeouts
  TIMEOUTS: {
    UNIT_TEST: 5000,
    INTEGRATION_TEST: 10000,
    E2E_TEST: 30000,
    PERFORMANCE_TEST: 60000,
  },
} as const;

// Global test setup
export const setupTestEnvironment = () => {
  // Mock performance API if not available
  if (!global.performance) {
    global.performance = {
      now: vi.fn(() => Date.now()),
      mark: vi.fn(),
      measure: vi.fn(),
      getEntriesByType: vi.fn(() => []),
      getEntriesByName: vi.fn(() => []),
    } as any;
  }

  // Mock IntersectionObserver for virtual scrolling tests
  global.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock ResizeObserver for responsive tests
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));

  // Mock matchMedia for responsive and accessibility tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock localStorage
  const localStorageMock = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  };
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
  });

  // Mock sessionStorage
  Object.defineProperty(window, 'sessionStorage', {
    value: localStorageMock,
  });

  // Mock console methods to reduce noise in tests
  global.console = {
    ...console,
    log: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
};

// Test cleanup
export const cleanupTestEnvironment = () => {
  vi.clearAllMocks();
  vi.resetAllMocks();

  // Clear any timers
  vi.clearAllTimers();

  // Reset DOM
  document.body.innerHTML = '';

  // Clear local/session storage mocks
  if (window.localStorage) {
    window.localStorage.clear();
  }
  if (window.sessionStorage) {
    window.sessionStorage.clear();
  }
};

// Test utilities for common assertions
export const testAssertions = {
  // Assert component renders within performance threshold
  assertRenderPerformance: (duration: number, threshold: number, componentName: string) => {
    if (duration > threshold) {
      throw new Error(
        `${componentName} render time (${duration}ms) exceeded threshold (${threshold}ms)`
      );
    }
  },

  // Assert accessibility compliance
  assertAccessibility: (violations: any[]) => {
    if (violations.length > 0) {
      const messages = violations.map(v => `${v.id}: ${v.description}`);
      throw new Error(`Accessibility violations:\n${messages.join('\n')}`);
    }
  },

  // Assert role-based access
  assertRoleAccess: (
    hasAccess: boolean,
    shouldHaveAccess: boolean,
    role: string,
    resource: string
  ) => {
    if (hasAccess !== shouldHaveAccess) {
      throw new Error(
        `Role access assertion failed: ${role} ${shouldHaveAccess ? 'should' : 'should not'} have access to ${resource}`
      );
    }
  },

  // Assert memory usage within limits
  assertMemoryUsage: (currentUsage: number, limit: number) => {
    if (currentUsage > limit) {
      throw new Error(`Memory usage (${currentUsage}MB) exceeded limit (${limit}MB)`);
    }
  },
};

// Export configuration object
export const testConfig = {
  performance: PERFORMANCE_THRESHOLDS,
  accessibility: ACCESSIBILITY_CONFIG,
  roles: ROLE_TESTING_CONFIG,
  data: TEST_DATA_CONFIG,
  environment: TEST_ENVIRONMENT_CONFIG,
  setup: setupTestEnvironment,
  cleanup: cleanupTestEnvironment,
  assertions: testAssertions,
} as const;

export default testConfig;
