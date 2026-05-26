// Dashboard template types for role-based dashboard system
import { UserRole } from './roles';
import { FunctionalCategory, PageId } from './permissions';
import { NavigationModule } from './navigation';

export interface StatsCard {
  id: string;
  title: string;
  value: string | number;
  change?: {
    value: number;
    type: 'increase' | 'decrease';
    period: string;
  };
  icon: string; // Lucide icon name
  color: 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'gray';
  category: FunctionalCategory;
  permissions?: PageId[];
  onClick?: string; // Navigation path
  priority: number; // Display priority (1 = highest)
}

export interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  path: string;
  permissions?: PageId[];
  category: FunctionalCategory;
  priority: number;
  isPrimary?: boolean;
}

export interface DashboardWidget {
  id: string;
  type: 'stats' | 'chart' | 'list' | 'activity' | 'alerts';
  title: string;
  size: 'small' | 'medium' | 'large' | 'full';
  position: { x: number; y: number; w: number; h: number };
  config: Record<string, any>;
  permissions?: PageId[];
  visible: boolean;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  role: UserRole;

  // Template configuration
  showWelcomeBanner: boolean;
  showQuickStats: boolean;
  showModuleCards: boolean;
  showActivityFeed: boolean;
  showAlerts: boolean;

  // Content configuration
  primaryModules: string[]; // Module IDs to show prominently
  secondaryModules: string[]; // Module IDs to show in secondary position
  statsCards: StatsCard[];
  quickActions: QuickAction[];
  widgets: DashboardWidget[];

  // Layout configuration
  layout: 'grid' | 'list' | 'mixed';
  maxModulesPerRow: number;
  showModuleStats: boolean;

  // Theme and styling
  theme: {
    primaryColor: string;
    backgroundColor: string;
    accentColor?: string;
  };

  // Inheritance
  inheritsFrom?: string; // Base template ID
  customizations?: Partial<DashboardTemplate>;
}

export interface BaseDashboardTemplate {
  id: string;
  name: string;
  description: string;

  // Base configuration that all roles inherit
  showWelcomeBanner: boolean;
  showQuickStats: boolean;
  showModuleCards: boolean;
  showActivityFeed: boolean;
  showAlerts: boolean;

  // Base stats cards available to all roles
  baseStatsCards: StatsCard[];
  baseQuickActions: QuickAction[];
  baseWidgets: DashboardWidget[];

  // Base layout
  layout: 'grid' | 'list' | 'mixed';
  maxModulesPerRow: number;
  showModuleStats: boolean;

  // Base theme
  theme: {
    primaryColor: string;
    backgroundColor: string;
  };
}

export interface RolePermissionMapping {
  role: UserRole;
  permissions: PageId[];
  modules: string[]; // Module IDs this role has access to
  categories: FunctionalCategory[]; // Functional categories this role can access
}

export interface DashboardTemplateEngine {
  baseTemplate: BaseDashboardTemplate;
  roleTemplates: Record<UserRole, DashboardTemplate>;
  rolePermissions: Record<UserRole, RolePermissionMapping>;

  // Methods for template generation
  generateTemplateForRole(role: UserRole): DashboardTemplate;
  filterContentByPermissions(content: any[], permissions: PageId[]): any[];
  calculateStatsForRole(role: UserRole, modules: string[]): StatsCard[];
  getQuickActionsForRole(role: UserRole): QuickAction[];
}

// Template inheritance utilities
export interface TemplateInheritance {
  mergeTemplates(base: BaseDashboardTemplate, role: Partial<DashboardTemplate>): DashboardTemplate;
  applyRoleCustomizations(
    template: DashboardTemplate,
    customizations: Partial<DashboardTemplate>
  ): DashboardTemplate;
  validateTemplate(template: DashboardTemplate): boolean;
}

// Stats calculation interfaces
export interface StatsCalculator {
  calculateFinancialStats(permissions: PageId[]): StatsCard[];
  calculateStudentStats(permissions: PageId[]): StatsCard[];
  calculateOperationsStats(permissions: PageId[]): StatsCard[];
  calculateAdminStats(permissions: PageId[]): StatsCard[];
  calculateSystemStats(permissions: PageId[]): StatsCard[];
}

// Module visibility configuration
export interface ModuleVisibilityConfig {
  role: UserRole;
  primaryModules: string[];
  secondaryModules: string[];
  hiddenModules: string[];
  moduleOrder: string[];
}

export type DashboardTemplateId =
  | 'base-template'
  | 'director-template'
  | 'principal-template'
  | 'administrator-template'
  | 'registrar-template'
  | 'officer-template';
