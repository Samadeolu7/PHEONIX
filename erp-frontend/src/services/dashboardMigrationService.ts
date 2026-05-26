// Dashboard migration service for transitioning to role-based system
import { api } from '../api/api';
import { UserRole } from '../types/roles';
import { DashboardTemplate } from '../types/dashboardTemplates';
import { dashboardTemplateEngine } from './dashboardTemplateEngine';
import { dashboardBackendIntegration } from './dashboardBackendIntegration';

export interface MigrationResult {
  success: boolean;
  dashboardId: string;
  fromRole?: UserRole;
  toRole?: UserRole;
  errors?: string[];
  warnings?: string[];
}

export interface MigrationSummary {
  totalDashboards: number;
  successful: number;
  failed: number;
  warnings: number;
  results: MigrationResult[];
  startTime: string;
  endTime: string;
  duration: number;
}

export interface LegacyDashboardData {
  id: string;
  name: string;
  slug: string;
  layout_config: any;
  widgets: any[];
  user_assignments?: Array<{
    user_id: number;
    username: string;
    role?: string;
  }>;
  created_at: string;
  updated_at: string;
}

export class DashboardMigrationService {
  private static instance: DashboardMigrationService;
  private migrationLog: string[] = [];

  private constructor() {}

  public static getInstance(): DashboardMigrationService {
    if (!DashboardMigrationService.instance) {
      DashboardMigrationService.instance = new DashboardMigrationService();
    }
    return DashboardMigrationService.instance;
  }

  // ===== MAIN MIGRATION METHODS =====

  /**
   * Perform complete migration of existing dashboards to role-based system
   */
  public async performFullMigration(): Promise<MigrationSummary> {
    const startTime = new Date().toISOString();
    this.log('Starting full dashboard migration to role-based system');

    try {
      // Step 1: Backup existing dashboards
      await this.backupExistingDashboards();

      // Step 2: Analyze existing dashboards
      const legacyDashboards = await this.analyzeLegacyDashboards();
      this.log(`Found ${legacyDashboards.length} legacy dashboards to migrate`);

      // Step 3: Create role-based templates
      await this.ensureRoleBasedTemplatesExist();

      // Step 4: Migrate each dashboard
      const results: MigrationResult[] = [];
      for (const dashboard of legacyDashboards) {
        const result = await this.migrateSingleDashboard(dashboard);
        results.push(result);
      }

      // Step 5: Update user assignments
      await this.migrateUserAssignments(legacyDashboards);

      // Step 6: Validate migration
      await this.validateMigration();

      const endTime = new Date().toISOString();
      const summary: MigrationSummary = {
        totalDashboards: legacyDashboards.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length,
        warnings: results.filter(r => r.warnings && r.warnings.length > 0).length,
        results,
        startTime,
        endTime,
        duration: new Date(endTime).getTime() - new Date(startTime).getTime(),
      };

      this.log(`Migration completed: ${summary.successful}/${summary.totalDashboards} successful`);
      return summary;
    } catch (error) {
      this.log(`Migration failed: ${error}`);
      throw error;
    }
  }

  /**
   * Migrate a single dashboard to role-based system
   */
  public async migrateSingleDashboard(dashboard: LegacyDashboardData): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: false,
      dashboardId: dashboard.id,
      errors: [],
      warnings: [],
    };

    try {
      this.log(`Migrating dashboard: ${dashboard.name} (${dashboard.id})`);

      // Step 1: Analyze dashboard to determine appropriate role
      const inferredRole = this.inferRoleFromDashboard(dashboard);
      result.toRole = inferredRole;

      // Step 2: Generate role-based template
      const template = dashboardTemplateEngine.generateTemplateForRole(inferredRole);

      // Step 3: Merge legacy configuration with template
      const migratedConfig = await this.mergeLegacyWithTemplate(dashboard, template);

      // Step 4: Create new role-based dashboard
      const newDashboard = await this.createRoleBasedDashboard(
        dashboard,
        migratedConfig,
        inferredRole
      );

      // Step 5: Preserve user assignments
      await this.preserveUserAssignments(dashboard, newDashboard.id);

      // Step 6: Mark original as migrated
      await this.markDashboardAsMigrated(dashboard.id, newDashboard.id);

      result.success = true;
      this.log(`Successfully migrated dashboard ${dashboard.id} to role-based system`);
    } catch (error) {
      result.errors?.push(`Migration failed: ${error}`);
      this.log(`Failed to migrate dashboard ${dashboard.id}: ${error}`);
    }

    return result;
  }

  // ===== ANALYSIS AND INFERENCE =====

  /**
   * Analyze existing dashboards to understand current usage patterns
   */
  private async analyzeLegacyDashboards(): Promise<LegacyDashboardData[]> {
    try {
      const response = await api.get('/dashboards/migration/analyze/');
      return response.data?.dashboards || [];
    } catch (error) {
      // Fallback to regular dashboard endpoint
      this.log('Migration analysis endpoint not available, using fallback');
      const response = await api.get('/dashboards/');
      const dashboards = response.data?.data || response.data?.results || response.data || [];

      // Enhance with user assignment data
      return await Promise.all(
        dashboards.map(async (dashboard: any) => {
          try {
            const assignments = await this.getDashboardAssignments(dashboard.id);
            return {
              ...dashboard,
              user_assignments: assignments,
            };
          } catch (error) {
            return dashboard;
          }
        })
      );
    }
  }

  /**
   * Infer appropriate role from dashboard configuration and usage
   */
  private inferRoleFromDashboard(dashboard: LegacyDashboardData): UserRole {
    const config = dashboard.layout_config || {};
    const widgets = dashboard.widgets || [];
    const assignments = dashboard.user_assignments || [];

    // Check user assignments for role hints
    if (assignments.length > 0) {
      const roleHints = assignments
        .map(a => a.role)
        .filter(Boolean)
        .map(role => this.mapLegacyRoleToUserRole(role!));

      if (roleHints.length > 0) {
        // Use most common role
        const roleCounts = roleHints.reduce(
          (acc, role) => {
            acc[role] = (acc[role] || 0) + 1;
            return acc;
          },
          {} as Record<UserRole, number>
        );

        const mostCommonRole = Object.entries(roleCounts).sort(
          ([, a], [, b]) => b - a
        )[0][0] as UserRole;

        return mostCommonRole;
      }
    }

    // Analyze widgets and configuration
    const widgetTypes = widgets.map((w: any) => w.type || w.widget_type).filter(Boolean);
    const widgetCategories = widgets.map((w: any) => w.category).filter(Boolean);

    // Financial focus
    if (this.hasFinancialFocus(widgetTypes, widgetCategories, config)) {
      if (widgets.length > 8 || config.comprehensive) {
        return 'Director'; // Comprehensive financial view
      }
      return 'Administrator'; // Standard financial management
    }

    // Student management focus
    if (this.hasStudentFocus(widgetTypes, widgetCategories, config)) {
      return 'Registrar';
    }

    // Operations focus
    if (this.hasOperationsFocus(widgetTypes, widgetCategories, config)) {
      return 'Officer';
    }

    // Academic leadership focus
    if (this.hasAcademicFocus(widgetTypes, widgetCategories, config)) {
      return 'Principal';
    }

    // Default to Officer for simple dashboards
    return 'Officer';
  }

  /**
   * Check if dashboard has financial focus
   */
  private hasFinancialFocus(widgetTypes: string[], categories: string[], config: any): boolean {
    const financialKeywords = [
      'financial',
      'revenue',
      'receivables',
      'accounting',
      'invoice',
      'payment',
    ];

    return (
      widgetTypes.some(type =>
        financialKeywords.some(keyword => type.toLowerCase().includes(keyword))
      ) ||
      categories.some(cat =>
        financialKeywords.some(keyword => cat.toLowerCase().includes(keyword))
      ) ||
      config.focus === 'financial'
    );
  }

  /**
   * Check if dashboard has student management focus
   */
  private hasStudentFocus(widgetTypes: string[], categories: string[], config: any): boolean {
    const studentKeywords = ['student', 'enrollment', 'entitlement', 'client', 'registration'];

    return (
      widgetTypes.some(type =>
        studentKeywords.some(keyword => type.toLowerCase().includes(keyword))
      ) ||
      categories.some(cat =>
        studentKeywords.some(keyword => cat.toLowerCase().includes(keyword))
      ) ||
      config.focus === 'student'
    );
  }

  /**
   * Check if dashboard has operations focus
   */
  private hasOperationsFocus(widgetTypes: string[], categories: string[], config: any): boolean {
    const operationsKeywords = ['procurement', 'inventory', 'operations', 'supplier', 'purchase'];

    return (
      widgetTypes.some(type =>
        operationsKeywords.some(keyword => type.toLowerCase().includes(keyword))
      ) ||
      categories.some(cat =>
        operationsKeywords.some(keyword => cat.toLowerCase().includes(keyword))
      ) ||
      config.focus === 'operations'
    );
  }

  /**
   * Check if dashboard has academic leadership focus
   */
  private hasAcademicFocus(widgetTypes: string[], categories: string[], config: any): boolean {
    const academicKeywords = ['academic', 'curriculum', 'teacher', 'class', 'grade'];

    return (
      widgetTypes.some(type =>
        academicKeywords.some(keyword => type.toLowerCase().includes(keyword))
      ) ||
      categories.some(cat =>
        academicKeywords.some(keyword => cat.toLowerCase().includes(keyword))
      ) ||
      config.focus === 'academic'
    );
  }

  /**
   * Map legacy role strings to UserRole enum
   */
  private mapLegacyRoleToUserRole(legacyRole: string): UserRole {
    const roleMap: Record<string, UserRole> = {
      director: 'Director',
      principal: 'Principal',
      admin: 'Administrator',
      administrator: 'Administrator',
      registrar: 'Registrar',
      officer: 'Officer',
      staff: 'Officer',
      user: 'Officer',
    };

    return roleMap[legacyRole.toLowerCase()] || 'Officer';
  }

  // ===== MIGRATION UTILITIES =====

  /**
   * Merge legacy dashboard configuration with role-based template
   */
  private async mergeLegacyWithTemplate(
    legacy: LegacyDashboardData,
    template: DashboardTemplate
  ): Promise<any> {
    const legacyConfig = legacy.layout_config || {};
    const legacyWidgets = legacy.widgets || [];

    return {
      // Template configuration as base
      ...template,

      // Preserve legacy name and description
      name: legacy.name,
      description: `${legacy.name} (Migrated from legacy system)`,

      // Merge layout preferences
      layout: legacyConfig.layout || template.layout,
      maxModulesPerRow: legacyConfig.maxModulesPerRow || template.maxModulesPerRow,

      // Preserve compatible widgets
      widgets: [...template.widgets, ...this.convertLegacyWidgets(legacyWidgets, template.role)],

      // Migration metadata
      migration: {
        migratedFrom: legacy.id,
        migrationDate: new Date().toISOString(),
        legacyConfig: legacyConfig,
        preservedWidgets: legacyWidgets.length,
      },
    };
  }

  /**
   * Convert legacy widgets to new format
   */
  private convertLegacyWidgets(legacyWidgets: any[], role: UserRole): any[] {
    return legacyWidgets
      .filter(widget => this.isWidgetCompatible(widget, role))
      .map(widget => this.convertWidget(widget));
  }

  /**
   * Check if legacy widget is compatible with role
   */
  private isWidgetCompatible(widget: any, role: UserRole): boolean {
    // Basic compatibility check based on widget type and role permissions
    const widgetType = widget.type || widget.widget_type;

    // All roles can use basic widgets
    const basicWidgets = ['stats', 'chart', 'list', 'activity'];
    if (basicWidgets.includes(widgetType)) {
      return true;
    }

    // Role-specific widget compatibility
    const roleWidgetMap: Record<UserRole, string[]> = {
      Director: ['financial', 'comprehensive', 'executive', 'analytics'],
      Principal: ['academic', 'student', 'performance', 'overview'],
      Administrator: ['financial', 'system', 'user', 'settings'],
      Registrar: ['student', 'enrollment', 'entitlement', 'client'],
      Officer: ['operations', 'procurement', 'inventory', 'basic'],
    };

    const allowedWidgets = roleWidgetMap[role] || [];
    return allowedWidgets.some(allowed => widgetType.toLowerCase().includes(allowed.toLowerCase()));
  }

  /**
   * Convert legacy widget to new format
   */
  private convertWidget(legacyWidget: any): any {
    return {
      id: legacyWidget.id || `migrated-${Date.now()}-${Math.random()}`,
      type: legacyWidget.type || legacyWidget.widget_type || 'stats',
      title: legacyWidget.title || legacyWidget.name || 'Migrated Widget',
      size: legacyWidget.size || 'medium',
      position: legacyWidget.position || { x: 0, y: 0, w: 4, h: 3 },
      config: {
        ...legacyWidget.config,
        migrated: true,
        originalId: legacyWidget.id,
      },
      visible: legacyWidget.visible !== false,
    };
  }

  // ===== BACKEND OPERATIONS =====

  /**
   * Create new role-based dashboard in backend
   */
  private async createRoleBasedDashboard(
    legacy: LegacyDashboardData,
    config: any,
    role: UserRole
  ): Promise<any> {
    const dashboardData = {
      name: `${legacy.name} (Role-Based)`,
      slug: `${legacy.slug}-role-based`,
      description: `Role-based dashboard for ${role} (migrated from ${legacy.id})`,
      layout_config: config,
      is_role_based: true,
      target_role: role,
      migrated_from: legacy.id,
    };

    const response = await api.post('/dashboards/', dashboardData);
    return response.data?.data || response.data;
  }

  /**
   * Get dashboard assignments
   */
  private async getDashboardAssignments(dashboardId: string): Promise<any[]> {
    try {
      const response = await api.get(`/dashboards/${dashboardId}/assignments/`);
      return response.data?.assignments || [];
    } catch (error) {
      return [];
    }
  }

  /**
   * Preserve user assignments from legacy dashboard
   */
  private async preserveUserAssignments(
    legacy: LegacyDashboardData,
    newDashboardId: string
  ): Promise<void> {
    if (!legacy.user_assignments || legacy.user_assignments.length === 0) {
      return;
    }

    try {
      for (const assignment of legacy.user_assignments) {
        await api.post(`/dashboards/${newDashboardId}/assign/`, {
          user_id: assignment.user_id,
          preserve_from_migration: true,
          original_dashboard_id: legacy.id,
        });
      }
    } catch (error) {
      this.log(`Warning: Could not preserve all user assignments for ${legacy.id}: ${error}`);
    }
  }

  /**
   * Mark original dashboard as migrated
   */
  private async markDashboardAsMigrated(originalId: string, newId: string): Promise<void> {
    try {
      await api.patch(`/dashboards/${originalId}/`, {
        is_migrated: true,
        migrated_to: newId,
        migration_date: new Date().toISOString(),
      });
    } catch (error) {
      this.log(`Warning: Could not mark dashboard ${originalId} as migrated: ${error}`);
    }
  }

  // ===== SUPPORT OPERATIONS =====

  /**
   * Backup existing dashboards before migration
   */
  private async backupExistingDashboards(): Promise<void> {
    try {
      await api.post('/dashboards/backup/', {
        backup_type: 'pre_migration',
        timestamp: new Date().toISOString(),
      });
      this.log('Successfully backed up existing dashboards');
    } catch (error) {
      this.log(`Warning: Could not backup dashboards: ${error}`);
    }
  }

  /**
   * Ensure role-based templates exist in backend
   */
  private async ensureRoleBasedTemplatesExist(): Promise<void> {
    const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

    for (const role of roles) {
      try {
        const template = dashboardTemplateEngine.generateTemplateForRole(role);

        // Check if template already exists
        const existingResponse = await api.get(`/dashboards/templates/${role.toLowerCase()}/`);

        if (!existingResponse.data) {
          // Create template
          await api.post('/dashboards/templates/', {
            role: role,
            template_config: template,
            is_system_template: true,
          });
          this.log(`Created role-based template for ${role}`);
        }
      } catch (error) {
        this.log(`Warning: Could not ensure template for ${role}: ${error}`);
      }
    }
  }

  /**
   * Migrate user assignments to role-based system
   */
  private async migrateUserAssignments(dashboards: LegacyDashboardData[]): Promise<void> {
    try {
      const allAssignments = dashboards.flatMap(d =>
        (d.user_assignments || []).map(a => ({
          ...a,
          dashboard_id: d.id,
          inferred_role: this.inferRoleFromDashboard(d),
        }))
      );

      if (allAssignments.length > 0) {
        await api.post('/dashboards/assignments/migrate/', {
          assignments: allAssignments,
        });
        this.log(`Migrated ${allAssignments.length} user assignments`);
      }
    } catch (error) {
      this.log(`Warning: Could not migrate user assignments: ${error}`);
    }
  }

  /**
   * Validate migration results
   */
  private async validateMigration(): Promise<void> {
    try {
      const response = await api.post('/dashboards/migration/validate/');
      const validation = response.data;

      if (validation.success) {
        this.log('Migration validation passed');
      } else {
        this.log(`Migration validation warnings: ${validation.warnings?.join(', ')}`);
      }
    } catch (error) {
      this.log(`Warning: Could not validate migration: ${error}`);
    }
  }

  // ===== ROLLBACK OPERATIONS =====

  /**
   * Rollback migration if needed
   */
  public async rollbackMigration(migrationId?: string): Promise<void> {
    try {
      this.log('Starting migration rollback...');

      await api.post('/dashboards/migration/rollback/', {
        migration_id: migrationId,
        timestamp: new Date().toISOString(),
      });

      this.log('Migration rollback completed');
    } catch (error) {
      this.log(`Rollback failed: ${error}`);
      throw error;
    }
  }

  // ===== LOGGING =====

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${message}`;
    this.migrationLog.push(logEntry);
    console.log(`[DashboardMigration] ${message}`);
  }

  public getMigrationLog(): string[] {
    return [...this.migrationLog];
  }

  public clearLog(): void {
    this.migrationLog = [];
  }
}

// Export singleton instance
export const dashboardMigrationService = DashboardMigrationService.getInstance();
