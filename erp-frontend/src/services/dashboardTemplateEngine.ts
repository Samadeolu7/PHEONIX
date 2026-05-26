// Dashboard template engine for role-based dashboard system
import {
  DashboardTemplate,
  BaseDashboardTemplate,
  StatsCard,
  QuickAction,
  DashboardWidget,
  RolePermissionMapping,
  ModuleVisibilityConfig,
  DashboardTemplateEngine,
  TemplateInheritance,
  StatsCalculator,
} from '../types/dashboardTemplates';
import { UserRole } from '../types/roles';
import { PageId } from '../types/permissions';
import {
  baseDashboardTemplate,
  dashboardTemplates,
  rolePermissionMappings,
  moduleVisibilityConfigs,
} from '../data/dashboardTemplates';
import { navigationModules } from '../data/navigationModules';

export class DashboardTemplateEngineImpl implements DashboardTemplateEngine {
  baseTemplate: BaseDashboardTemplate;
  roleTemplates: Record<UserRole, DashboardTemplate>;
  rolePermissions: Record<UserRole, RolePermissionMapping>;

  constructor() {
    this.baseTemplate = baseDashboardTemplate;
    this.roleTemplates = dashboardTemplates;
    this.rolePermissions = rolePermissionMappings;
  }

  // Generate a complete dashboard template for a specific role
  generateTemplateForRole(role: UserRole): DashboardTemplate {
    const roleTemplate = this.roleTemplates[role];
    const rolePermissions = this.rolePermissions[role];

    if (!roleTemplate || !rolePermissions) {
      throw new Error(`Template or permissions not found for role: ${role}`);
    }

    // Set current role for template generation context
    this.currentRole = role;

    // Start with the role template
    const template: DashboardTemplate = { ...roleTemplate };

    // Filter stats cards based on permissions
    template.statsCards = this.filterContentByPermissions(
      template.statsCards,
      rolePermissions.permissions
    );

    // Filter quick actions based on permissions
    template.quickActions = this.filterContentByPermissions(
      template.quickActions,
      rolePermissions.permissions
    );

    // Filter widgets based on permissions
    template.widgets = this.filterContentByPermissions(
      template.widgets,
      rolePermissions.permissions
    );

    // Calculate dynamic stats for the role
    const dynamicStats = this.calculateStatsForRole(role, rolePermissions.modules);
    template.statsCards = this.mergeStats(template.statsCards, dynamicStats);

    // Get role-specific quick actions
    const roleQuickActions = this.getQuickActionsForRole(role);
    template.quickActions = this.mergeQuickActions(template.quickActions, roleQuickActions);

    // Clear current role context
    this.currentRole = null;

    return template;
  }

  // Filter content arrays based on user permissions
  filterContentByPermissions<T extends { permissions?: PageId[] }>(
    content: T[],
    userPermissions: PageId[]
  ): T[] {
    return content.filter(item => {
      // If no permissions specified, item is available to all
      if (!item.permissions || item.permissions.length === 0) {
        return true;
      }

      // Check if user has at least one of the required permissions
      return item.permissions.some(permission => userPermissions.includes(permission));
    });
  }

  // Calculate role-specific stats based on modules and permissions
  calculateStatsForRole(role: UserRole, modules: string[]): StatsCard[] {
    const calculator = new StatsCalculatorImpl();
    const rolePermissions = this.rolePermissions[role];
    const dynamicStats: StatsCard[] = [];

    // Calculate stats for each accessible module
    if (modules.includes('financial')) {
      dynamicStats.push(...calculator.calculateFinancialStats(rolePermissions.permissions));
    }

    if (modules.includes('client-services')) {
      dynamicStats.push(...calculator.calculateStudentStats(rolePermissions.permissions));
    }

    if (modules.includes('operations')) {
      dynamicStats.push(...calculator.calculateOperationsStats(rolePermissions.permissions));
    }

    if (modules.includes('administration')) {
      dynamicStats.push(...calculator.calculateAdminStats(rolePermissions.permissions));
    }

    // Add system stats for all roles
    dynamicStats.push(...calculator.calculateSystemStats(rolePermissions.permissions));

    return dynamicStats;
  }

  // Get role-specific quick actions
  getQuickActionsForRole(role: UserRole): QuickAction[] {
    const rolePermissions = this.rolePermissions[role];
    const baseActions = this.baseTemplate.baseQuickActions;

    // Filter base actions by permissions
    const filteredActions = this.filterContentByPermissions(
      baseActions,
      rolePermissions.permissions
    );

    // Sort by priority and role relevance
    return filteredActions
      .sort((a, b) => {
        // Primary actions first
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;

        // Then by priority
        return b.priority - a.priority;
      })
      .slice(0, 8); // Limit to 8 quick actions
  }

  // Merge stats arrays, prioritizing template-specific stats
  private mergeStats(templateStats: StatsCard[], dynamicStats: StatsCard[]): StatsCard[] {
    const merged = [...templateStats];

    // Add dynamic stats that aren't already in template
    dynamicStats.forEach(dynamicStat => {
      if (!merged.find(stat => stat.id === dynamicStat.id)) {
        merged.push(dynamicStat);
      }
    });

    // Sort by priority and return top stats (different limits for different roles)
    const sortedStats = merged.sort((a, b) => b.priority - a.priority);

    // Role-specific limits for stats cards
    const role = this.getCurrentRole();
    const limits = {
      Director: 8, // Directors see more comprehensive stats
      Principal: 6, // Principals see moderate stats
      Administrator: 5, // Administrators see system-focused stats
      Registrar: 4, // Registrars see student-focused stats
      Officer: 4, // Officers see essential operational stats
    };

    const limit = limits[role] || 4;
    return sortedStats.slice(0, limit);
  }

  // Helper to get current role being processed
  private getCurrentRole(): UserRole {
    // This is a simple way to track the current role during template generation
    // In a more complex implementation, this could be passed as a parameter
    return this.currentRole || 'Officer';
  }

  private currentRole: UserRole | null = null;

  // Merge quick actions arrays
  private mergeQuickActions(
    templateActions: QuickAction[],
    roleActions: QuickAction[]
  ): QuickAction[] {
    const merged = [...templateActions];

    // Add role actions that aren't already in template
    roleActions.forEach(roleAction => {
      if (!merged.find(action => action.id === roleAction.id)) {
        merged.push(roleAction);
      }
    });

    return merged
      .sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return b.priority - a.priority;
      })
      .slice(0, 8);
  }
}

// Template inheritance implementation
export class TemplateInheritanceImpl implements TemplateInheritance {
  // Merge base template with role-specific customizations
  mergeTemplates(base: BaseDashboardTemplate, role: Partial<DashboardTemplate>): DashboardTemplate {
    return {
      // Base properties
      id: role.id || `${base.id}-role`,
      name: role.name || base.name,
      description: role.description || base.description,
      role: role.role || 'Officer',

      // Configuration (role overrides base)
      showWelcomeBanner: role.showWelcomeBanner ?? base.showWelcomeBanner,
      showQuickStats: role.showQuickStats ?? base.showQuickStats,
      showModuleCards: role.showModuleCards ?? base.showModuleCards,
      showActivityFeed: role.showActivityFeed ?? base.showActivityFeed,
      showAlerts: role.showAlerts ?? base.showAlerts,

      // Content (role extends base)
      primaryModules: role.primaryModules || [],
      secondaryModules: role.secondaryModules || [],
      statsCards: role.statsCards || [],
      quickActions: role.quickActions || [],
      widgets: [...base.baseWidgets, ...(role.widgets || [])],

      // Layout (role overrides base)
      layout: role.layout || base.layout,
      maxModulesPerRow: role.maxModulesPerRow || base.maxModulesPerRow,
      showModuleStats: role.showModuleStats ?? base.showModuleStats,

      // Theme (role overrides base)
      theme: {
        ...base.theme,
        ...(role.theme || {}),
      },

      // Inheritance
      inheritsFrom: base.id,
      customizations: role.customizations,
    };
  }

  // Apply role-specific customizations to a template
  applyRoleCustomizations(
    template: DashboardTemplate,
    customizations: Partial<DashboardTemplate>
  ): DashboardTemplate {
    return {
      ...template,
      ...customizations,

      // Merge arrays instead of replacing
      statsCards: customizations.statsCards
        ? [...template.statsCards, ...customizations.statsCards]
        : template.statsCards,

      quickActions: customizations.quickActions
        ? [...template.quickActions, ...customizations.quickActions]
        : template.quickActions,

      widgets: customizations.widgets
        ? [...template.widgets, ...customizations.widgets]
        : template.widgets,

      // Merge theme
      theme: {
        ...template.theme,
        ...(customizations.theme || {}),
      },
    };
  }

  // Validate template structure
  validateTemplate(template: DashboardTemplate): boolean {
    try {
      // Check required fields
      if (!template.id || !template.name || !template.role) {
        return false;
      }

      // Check arrays are valid
      if (
        !Array.isArray(template.statsCards) ||
        !Array.isArray(template.quickActions) ||
        !Array.isArray(template.widgets)
      ) {
        return false;
      }

      // Check theme structure
      if (!template.theme || !template.theme.primaryColor || !template.theme.backgroundColor) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Template validation error:', error);
      return false;
    }
  }
}

// Stats calculator implementation
export class StatsCalculatorImpl implements StatsCalculator {
  calculateFinancialStats(permissions: PageId[]): StatsCard[] {
    const stats: StatsCard[] = [];

    if (permissions.includes('financial.receivables_dashboard')) {
      stats.push({
        id: 'receivables-aging',
        title: 'Aging > 30 Days',
        value: '₦850K',
        icon: 'Clock',
        color: 'red',
        category: 'Financial Operations',
        onClick: '/receivables/aging-report',
        priority: 8,
      });
    }

    if (permissions.includes('financial.accounts_management')) {
      stats.push({
        id: 'monthly-revenue',
        title: 'Monthly Revenue',
        value: '₦3.2M',
        change: { value: 12.5, type: 'increase', period: 'vs last month' },
        icon: 'TrendingUp',
        color: 'green',
        category: 'Financial Operations',
        onClick: '/reports/financial/profit-loss',
        priority: 7,
      });
    }

    return stats;
  }

  calculateStudentStats(permissions: PageId[]): StatsCard[] {
    const stats: StatsCard[] = [];

    if (permissions.includes('students.client_management')) {
      stats.push({
        id: 'new-enrollments',
        title: 'New Enrollments',
        value: '47',
        change: { value: 15.2, type: 'increase', period: 'this month' },
        icon: 'UserPlus',
        color: 'blue',
        category: 'Client Management',
        onClick: '/clients',
        priority: 6,
      });
    }

    if (permissions.includes('students.entitlements')) {
      stats.push({
        id: 'entitlement-completion',
        title: 'Entitlement Completion',
        value: '94%',
        change: { value: 3.1, type: 'increase', period: 'this term' },
        icon: 'CheckCircle',
        color: 'green',
        category: 'Client Management',
        onClick: '/incomes/entitlements',
        priority: 5,
      });
    }

    return stats;
  }

  calculateOperationsStats(permissions: PageId[]): StatsCard[] {
    const stats: StatsCard[] = [];

    if (permissions.includes('operations.procurement_dashboard')) {
      stats.push({
        id: 'procurement-savings',
        title: 'Procurement Savings',
        value: '₦125K',
        change: { value: 8.7, type: 'increase', period: 'this quarter' },
        icon: 'TrendingDown',
        color: 'green',
        category: 'Operations',
        onClick: '/procurement/analytics/savings',
        priority: 4,
      });
    }

    if (permissions.includes('operations.inventory_management')) {
      stats.push({
        id: 'inventory-turnover',
        title: 'Inventory Turnover',
        value: '4.2x',
        change: { value: 0.3, type: 'increase', period: 'this year' },
        icon: 'RotateCcw',
        color: 'blue',
        category: 'Operations',
        onClick: '/inventory/reports/turnover',
        priority: 3,
      });
    }

    return stats;
  }

  calculateAdminStats(permissions: PageId[]): StatsCard[] {
    const stats: StatsCard[] = [];

    if (permissions.includes('admin.system_settings')) {
      stats.push({
        id: 'system-uptime',
        title: 'System Uptime',
        value: '99.8%',
        icon: 'Server',
        color: 'green',
        category: 'System Administration',
        onClick: '/admin/health',
        priority: 2,
      });
    }

    if (permissions.includes('users.add')) {
      stats.push({
        id: 'user-growth',
        title: 'User Growth',
        value: '12%',
        change: { value: 2.1, type: 'increase', period: 'this month' },
        icon: 'Users',
        color: 'blue',
        category: 'User Management',
        onClick: '/admin/users',
        priority: 1,
      });
    }

    return stats;
  }

  calculateSystemStats(permissions: PageId[]): StatsCard[] {
    // System stats available to all roles
    return [
      {
        id: 'data-accuracy',
        title: 'Data Accuracy',
        value: '99.2%',
        icon: 'Database',
        color: 'green',
        category: 'System Administration',
        priority: 0,
      },
    ];
  }
}

// Module visibility service
export class ModuleVisibilityService {
  static getVisibleModules(role: UserRole): string[] {
    const config = moduleVisibilityConfigs[role];
    if (!config) return [];

    return [...config.primaryModules, ...config.secondaryModules];
  }

  static getPrimaryModules(role: UserRole): string[] {
    const config = moduleVisibilityConfigs[role];
    return config?.primaryModules || [];
  }

  static getSecondaryModules(role: UserRole): string[] {
    const config = moduleVisibilityConfigs[role];
    return config?.secondaryModules || [];
  }

  static getModuleOrder(role: UserRole): string[] {
    const config = moduleVisibilityConfigs[role];
    return config?.moduleOrder || [];
  }

  static isModuleVisible(role: UserRole, moduleId: string): boolean {
    const config = moduleVisibilityConfigs[role];
    if (!config) return false;

    return (
      !config.hiddenModules.includes(moduleId) &&
      (config.primaryModules.includes(moduleId) || config.secondaryModules.includes(moduleId))
    );
  }

  static filterModulesByRole(role: UserRole): any[] {
    const visibleModuleIds = this.getVisibleModules(role);
    const moduleOrder = this.getModuleOrder(role);

    // Filter and sort modules
    const visibleModules = navigationModules.filter(module => visibleModuleIds.includes(module.id));

    // Sort by role-specific order
    return visibleModules.sort((a, b) => {
      const aIndex = moduleOrder.indexOf(a.id);
      const bIndex = moduleOrder.indexOf(b.id);

      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;

      return aIndex - bIndex;
    });
  }
}

// Export singleton instances
export const dashboardTemplateEngine = new DashboardTemplateEngineImpl();
export const templateInheritance = new TemplateInheritanceImpl();
export const statsCalculator = new StatsCalculatorImpl();
export const moduleVisibilityService = ModuleVisibilityService;
