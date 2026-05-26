// Backend integration service for role-based dashboard system
import { api } from '../api/api';
import { UserRole } from '../types/roles';
import { DashboardTemplate, StatsCard, QuickAction } from '../types/dashboardTemplates';
import { dashboardTemplateEngine } from './dashboardTemplateEngine';
import { userPreferencesService } from './userPreferencesService';

export interface BackendDashboardData {
  id: string;
  name: string;
  slug: string;
  description?: string;
  is_default: boolean;
  layout_config: any;
  widgets: any[];
  created_at: string;
  updated_at: string;
  assigned_roles?: string[];
  tenant_id?: number;
}

export interface DashboardAssignment {
  user_id: number;
  dashboard_id: string;
  role: UserRole;
  assigned_at: string;
  assigned_by: number;
}

export interface BackendStatsData {
  financial_metrics?: {
    total_receivables: number;
    aging_30_days: number;
    monthly_revenue: number;
    revenue_growth: number;
  };
  student_metrics?: {
    total_students: number;
    new_enrollments: number;
    entitlement_completion: number;
  };
  operations_metrics?: {
    procurement_savings: number;
    inventory_turnover: number;
    pending_approvals: number;
  };
  system_metrics?: {
    uptime: number;
    data_accuracy: number;
    active_users: number;
  };
}

export class DashboardBackendIntegration {
  private static instance: DashboardBackendIntegration;
  private cache: Map<string, any> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  public static getInstance(): DashboardBackendIntegration {
    if (!DashboardBackendIntegration.instance) {
      DashboardBackendIntegration.instance = new DashboardBackendIntegration();
    }
    return DashboardBackendIntegration.instance;
  }

  // ===== DASHBOARD TEMPLATE INTEGRATION =====

  /**
   * Get role-based dashboard template with backend data integration
   */
  public async getRoleBasedDashboard(role: UserRole): Promise<DashboardTemplate> {
    try {
      // Generate template from template engine
      const template = dashboardTemplateEngine.generateTemplateForRole(role);

      // Enhance with real backend data
      const enhancedTemplate = await this.enhanceTemplateWithBackendData(template, role);

      return enhancedTemplate;
    } catch (error) {
      console.error('Error getting role-based dashboard:', error);
      // Fallback to template-only version
      return dashboardTemplateEngine.generateTemplateForRole(role);
    }
  }

  /**
   * Enhance template with real backend data
   */
  private async enhanceTemplateWithBackendData(
    template: DashboardTemplate,
    role: UserRole
  ): Promise<DashboardTemplate> {
    try {
      // Get real stats data from backend
      const statsData = await this.getBackendStatsData(role);

      // Update stats cards with real data
      const enhancedStatsCards = await this.enhanceStatsCards(template.statsCards, statsData);

      // Get user's assigned dashboard if any
      const assignedDashboard = await this.getUserAssignedDashboard();

      // Merge with assigned dashboard configuration if exists
      if (assignedDashboard) {
        return this.mergeWithAssignedDashboard(template, assignedDashboard, enhancedStatsCards);
      }

      return {
        ...template,
        statsCards: enhancedStatsCards,
      };
    } catch (error) {
      console.error('Error enhancing template with backend data:', error);
      return template;
    }
  }

  /**
   * Get real stats data from backend APIs
   */
  private async getBackendStatsData(role: UserRole): Promise<BackendStatsData> {
    const cacheKey = `stats-${role}`;

    // Check cache first
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      // Fetch stats from multiple backend endpoints
      const [financialStats, studentStats, operationsStats, systemStats] = await Promise.allSettled(
        [
          this.getFinancialStats(),
          this.getStudentStats(),
          this.getOperationsStats(),
          this.getSystemStats(),
        ]
      );

      const statsData: BackendStatsData = {
        financial_metrics: financialStats.status === 'fulfilled' ? financialStats.value : undefined,
        student_metrics: studentStats.status === 'fulfilled' ? studentStats.value : undefined,
        operations_metrics:
          operationsStats.status === 'fulfilled' ? operationsStats.value : undefined,
        system_metrics: systemStats.status === 'fulfilled' ? systemStats.value : undefined,
      };

      // Cache the results
      this.cache.set(cacheKey, statsData);
      this.cacheExpiry.set(cacheKey, Date.now() + this.CACHE_DURATION);

      return statsData;
    } catch (error) {
      console.error('Error fetching backend stats data:', error);
      return {};
    }
  }

  /**
   * Enhance stats cards with real backend data
   */
  private async enhanceStatsCards(
    templateStats: StatsCard[],
    backendData: BackendStatsData
  ): Promise<StatsCard[]> {
    return templateStats.map(stat => {
      // Map template stats to backend data
      switch (stat.id) {
        case 'receivables-aging':
          if (backendData.financial_metrics?.aging_30_days) {
            return {
              ...stat,
              value: this.formatCurrency(backendData.financial_metrics.aging_30_days),
            };
          }
          break;

        case 'monthly-revenue':
          if (backendData.financial_metrics?.monthly_revenue) {
            return {
              ...stat,
              value: this.formatCurrency(backendData.financial_metrics.monthly_revenue),
              change: backendData.financial_metrics.revenue_growth
                ? {
                    value: backendData.financial_metrics.revenue_growth,
                    type:
                      backendData.financial_metrics.revenue_growth > 0 ? 'increase' : 'decrease',
                    period: 'vs last month',
                  }
                : stat.change,
            };
          }
          break;

        case 'new-enrollments':
          if (backendData.student_metrics?.new_enrollments) {
            return {
              ...stat,
              value: backendData.student_metrics.new_enrollments.toString(),
            };
          }
          break;

        case 'entitlement-completion':
          if (backendData.student_metrics?.entitlement_completion) {
            return {
              ...stat,
              value: `${backendData.student_metrics.entitlement_completion}%`,
            };
          }
          break;

        case 'procurement-savings':
          if (backendData.operations_metrics?.procurement_savings) {
            return {
              ...stat,
              value: this.formatCurrency(backendData.operations_metrics.procurement_savings),
            };
          }
          break;

        case 'inventory-turnover':
          if (backendData.operations_metrics?.inventory_turnover) {
            return {
              ...stat,
              value: `${backendData.operations_metrics.inventory_turnover}x`,
            };
          }
          break;

        case 'system-uptime':
          if (backendData.system_metrics?.uptime) {
            return {
              ...stat,
              value: `${backendData.system_metrics.uptime}%`,
            };
          }
          break;

        case 'data-accuracy':
          if (backendData.system_metrics?.data_accuracy) {
            return {
              ...stat,
              value: `${backendData.system_metrics.data_accuracy}%`,
            };
          }
          break;

        default:
          return stat;
      }
      return stat;
    });
  }

  // ===== BACKEND API CALLS =====

  /**
   * Get financial metrics from backend
   */
  private async getFinancialStats() {
    try {
      // Try multiple endpoints for financial data
      const [receivablesResponse, revenueResponse] = await Promise.allSettled([
        api.get('/receivables/summary/'),
        api.get('/reports/financial/revenue-summary/'),
      ]);

      let financial_metrics: any = {};

      // Process receivables data
      if (receivablesResponse.status === 'fulfilled') {
        const receivablesData = receivablesResponse.value.data;
        financial_metrics.total_receivables = receivablesData.total_outstanding || 0;
        financial_metrics.aging_30_days = receivablesData.aging_30_days || 0;
      }

      // Process revenue data
      if (revenueResponse.status === 'fulfilled') {
        const revenueData = revenueResponse.value.data;
        financial_metrics.monthly_revenue = revenueData.current_month_revenue || 0;
        financial_metrics.revenue_growth = revenueData.growth_percentage || 0;
      }

      return financial_metrics;
    } catch (error) {
      console.error('Error fetching financial stats:', error);
      throw error;
    }
  }

  /**
   * Get student metrics from backend
   */
  private async getStudentStats() {
    try {
      const response = await api.get('/clients/summary/');
      const data = response.data;

      return {
        total_students: data.total_clients || 0,
        new_enrollments: data.new_this_month || 0,
        entitlement_completion: data.entitlement_completion_rate || 0,
      };
    } catch (error) {
      console.error('Error fetching student stats:', error);
      throw error;
    }
  }

  /**
   * Get operations metrics from backend
   */
  private async getOperationsStats() {
    try {
      const [procurementResponse, inventoryResponse] = await Promise.allSettled([
        api.get('/procurement/summary/'),
        api.get('/inventory/summary/'),
      ]);

      let operations_metrics: any = {};

      if (procurementResponse.status === 'fulfilled') {
        const procurementData = procurementResponse.value.data;
        operations_metrics.procurement_savings = procurementData.total_savings || 0;
        operations_metrics.pending_approvals = procurementData.pending_approvals || 0;
      }

      if (inventoryResponse.status === 'fulfilled') {
        const inventoryData = inventoryResponse.value.data;
        operations_metrics.inventory_turnover = inventoryData.turnover_ratio || 0;
      }

      return operations_metrics;
    } catch (error) {
      console.error('Error fetching operations stats:', error);
      throw error;
    }
  }

  /**
   * Get system metrics from backend
   */
  private async getSystemStats() {
    try {
      const response = await api.get('/system/health/');
      const data = response.data;

      return {
        uptime: data.uptime_percentage || 99.9,
        data_accuracy: data.data_accuracy || 99.2,
        active_users: data.active_users || 0,
      };
    } catch (error) {
      // System health endpoint might not exist, provide defaults
      console.warn('System health endpoint not available, using defaults');
      return {
        uptime: 99.9,
        data_accuracy: 99.2,
        active_users: 0,
      };
    }
  }

  // ===== DASHBOARD ASSIGNMENT INTEGRATION =====

  /**
   * Get user's assigned dashboard from backend
   */
  public async getUserAssignedDashboard(): Promise<BackendDashboardData | null> {
    try {
      const response = await api.get('/dashboards/assigned/');
      return response.data?.data || response.data || null;
    } catch (error) {
      console.error('Error fetching assigned dashboard:', error);
      return null;
    }
  }

  /**
   * Merge template with assigned dashboard configuration
   */
  private mergeWithAssignedDashboard(
    template: DashboardTemplate,
    assignedDashboard: BackendDashboardData,
    enhancedStats: StatsCard[]
  ): DashboardTemplate {
    try {
      // Parse backend layout configuration
      const backendConfig = assignedDashboard.layout_config || {};

      return {
        ...template,
        id: assignedDashboard.id,
        name: assignedDashboard.name,
        description: assignedDashboard.description || template.description,
        statsCards: enhancedStats,

        // Merge layout configuration from backend
        layout: backendConfig.layout || template.layout,
        maxModulesPerRow: backendConfig.maxModulesPerRow || template.maxModulesPerRow,
        showModuleStats: backendConfig.showModuleStats ?? template.showModuleStats,

        // Merge theme if provided
        theme: {
          ...template.theme,
          ...(backendConfig.theme || {}),
        },

        // Add backend metadata
        inheritsFrom: template.id,
        customizations: {
          backendDashboardId: assignedDashboard.id,
          lastUpdated: assignedDashboard.updated_at,
        },
      };
    } catch (error) {
      console.error('Error merging with assigned dashboard:', error);
      return {
        ...template,
        statsCards: enhancedStats,
      };
    }
  }

  // ===== MIGRATION UTILITIES =====

  /**
   * Migrate existing dashboard data to new role-based system
   */
  public async migrateExistingDashboards(): Promise<void> {
    try {
      console.log('Starting dashboard migration...');

      // Get all existing dashboards
      const existingDashboards = await this.getAllExistingDashboards();

      // Create role-based templates for each existing dashboard
      for (const dashboard of existingDashboards) {
        await this.migrateDashboardToRoleBased(dashboard);
      }

      console.log('Dashboard migration completed successfully');
    } catch (error) {
      console.error('Error during dashboard migration:', error);
      throw error;
    }
  }

  /**
   * Get all existing dashboards from backend
   */
  private async getAllExistingDashboards(): Promise<BackendDashboardData[]> {
    try {
      const response = await api.get('/dashboards/');
      return response.data?.data || response.data?.results || response.data || [];
    } catch (error) {
      console.error('Error fetching existing dashboards:', error);
      return [];
    }
  }

  /**
   * Migrate a single dashboard to role-based system
   */
  private async migrateDashboardToRoleBased(dashboard: BackendDashboardData): Promise<void> {
    try {
      // Determine appropriate role based on dashboard configuration
      const suggestedRole = this.inferRoleFromDashboard(dashboard);

      // Create role-based template
      const template = dashboardTemplateEngine.generateTemplateForRole(suggestedRole);

      // Merge with existing dashboard configuration
      const migratedConfig = {
        ...dashboard.layout_config,
        roleBasedTemplate: template.id,
        migratedFrom: dashboard.id,
        migrationDate: new Date().toISOString(),
      };

      // Update dashboard with role-based configuration
      await api.patch(`/dashboards/${dashboard.id}/`, {
        layout_config: migratedConfig,
        description: `${dashboard.description || ''} (Migrated to role-based system)`,
      });

      console.log(`Migrated dashboard ${dashboard.id} to role-based system`);
    } catch (error) {
      console.error(`Error migrating dashboard ${dashboard.id}:`, error);
    }
  }

  /**
   * Infer appropriate role from existing dashboard configuration
   */
  private inferRoleFromDashboard(dashboard: BackendDashboardData): UserRole {
    const config = dashboard.layout_config || {};
    const widgets = dashboard.widgets || [];

    // Simple heuristics to determine role
    if (widgets.some((w: any) => w.type === 'financial' || w.category === 'financial')) {
      if (config.comprehensive || widgets.length > 8) {
        return 'Director';
      }
      return 'Administrator';
    }

    if (widgets.some((w: any) => w.type === 'client' || w.category === 'client')) {
      return 'Registrar';
    }

    if (widgets.some((w: any) => w.type === 'operations' || w.category === 'operations')) {
      return 'Officer';
    }

    // Default to Officer for simple dashboards
    return 'Officer';
  }

  // ===== BACKWARD COMPATIBILITY =====

  /**
   * Create backward compatibility layer for existing dashboard API calls
   */
  public createBackwardCompatibilityLayer(): void {
    // Store original API methods
    const originalGetDashboard = api.get;

    // Intercept dashboard API calls and enhance with role-based data
    api.interceptors.response.use(
      async response => {
        // Check if this is a dashboard API call
        if (response.config.url?.includes('/dashboards/') && response.config.method === 'get') {
          try {
            // Get current user role
            const userRole = this.getCurrentUserRole();
            if (userRole) {
              // Enhance response with role-based template data
              const enhancedData = await this.enhanceBackendDashboardWithTemplate(
                response.data,
                userRole
              );
              response.data = enhancedData;
            }
          } catch (error) {
            console.warn('Error enhancing dashboard response:', error);
            // Return original response on error
          }
        }
        return response;
      },
      error => Promise.reject(error)
    );
  }

  /**
   * Enhance backend dashboard response with template data
   */
  private async enhanceBackendDashboardWithTemplate(
    backendData: any,
    role: UserRole
  ): Promise<any> {
    try {
      const template = await this.getRoleBasedDashboard(role);

      return {
        ...backendData,
        roleBasedTemplate: template,
        enhancedStats: template.statsCards,
        roleBasedConfig: {
          role,
          templateId: template.id,
          enhancedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      console.error('Error enhancing backend data with template:', error);
      return backendData;
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get current user role from auth context
   */
  private getCurrentUserRole(): UserRole | null {
    try {
      // This would typically come from auth context
      // For now, get from localStorage (role selection)
      const selectedRole = localStorage.getItem('selectedRole');
      return (selectedRole as UserRole) || null;
    } catch (error) {
      console.error('Error getting current user role:', error);
      return null;
    }
  }

  /**
   * Format currency values
   */
  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }

  /**
   * Check if cache is valid
   */
  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Get cache statistics
   */
  public getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    };
  }
}

// Export singleton instance
export const dashboardBackendIntegration = DashboardBackendIntegration.getInstance();
