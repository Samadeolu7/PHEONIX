// Dashboard assignment system types
import { UserRole } from './roles';
import { DashboardTemplate } from './dashboardTemplates';

export interface DashboardAssignment {
  id: string;
  roleId: UserRole;
  templateId: string;
  templateVersion: number;
  assignedBy: string; // User ID who made the assignment
  assignedAt: Date;
  activatedAt?: Date;
  deactivatedAt?: Date;
  isActive: boolean;
  isDefault: boolean; // Whether this is the default template for the role
  metadata?: {
    description?: string;
    tags?: string[];
    customizations?: Record<string, any>;
  };
}

export interface DashboardVersion {
  id: string;
  templateId: string;
  version: number;
  template: DashboardTemplate;
  createdBy: string;
  createdAt: Date;
  changelog?: string;
  isPublished: boolean;
  parentVersion?: number; // For tracking version history
  metadata?: {
    description?: string;
    tags?: string[];
    breaking_changes?: boolean;
  };
}

export interface DashboardUsageAnalytics {
  id: string;
  templateId: string;
  templateVersion: number;
  roleId: UserRole;
  userId: string;
  sessionId: string;

  // Usage metrics
  viewCount: number;
  totalTimeSpent: number; // in seconds
  lastAccessed: Date;
  firstAccessed: Date;

  // Interaction metrics
  widgetInteractions: Record<string, number>; // widget ID -> interaction count
  quickActionClicks: Record<string, number>; // action ID -> click count
  moduleAccesses: Record<string, number>; // module ID -> access count

  // Performance metrics
  loadTime: number; // in milliseconds
  errorCount: number;

  // User behavior
  customizationsMade: number;
  feedbackRating?: number; // 1-5 scale
  feedbackComments?: string;

  metadata?: {
    browser?: string;
    device?: string;
    screenResolution?: string;
    location?: string;
  };
}

export interface DashboardAssignmentRule {
  id: string;
  name: string;
  description: string;

  // Rule conditions
  conditions: {
    roles?: UserRole[];
    departments?: string[];
    branches?: string[];
    userAttributes?: Record<string, any>;
  };

  // Assignment configuration
  templateId: string;
  templateVersion: number;
  priority: number; // Higher priority rules override lower ones

  // Rule metadata
  createdBy: string;
  createdAt: Date;
  updatedBy?: string;
  updatedAt?: Date;
  isActive: boolean;

  // Scheduling
  effectiveFrom?: Date;
  effectiveUntil?: Date;

  metadata?: {
    tags?: string[];
    notes?: string;
  };
}

export interface DashboardRollbackPoint {
  id: string;
  templateId: string;
  fromVersion: number;
  toVersion: number;
  rolledBackBy: string;
  rolledBackAt: Date;
  reason: string;
  affectedUsers: string[]; // User IDs affected by the rollback
  rollbackData: {
    previousAssignments: DashboardAssignment[];
    restoredTemplate: DashboardTemplate;
  };
}

export interface DashboardAssignmentHistory {
  id: string;
  templateId: string;
  roleId: UserRole;
  action: 'assigned' | 'activated' | 'deactivated' | 'updated' | 'rolled_back';
  performedBy: string;
  performedAt: Date;
  previousState?: Partial<DashboardAssignment>;
  newState?: Partial<DashboardAssignment>;
  reason?: string;
  metadata?: Record<string, any>;
}

// Service interfaces
export interface DashboardAssignmentService {
  // Assignment management
  assignDashboardToRole(
    roleId: UserRole,
    templateId: string,
    templateVersion: number,
    assignedBy: string
  ): Promise<DashboardAssignment>;
  unassignDashboardFromRole(roleId: UserRole, templateId: string): Promise<void>;
  getAssignmentsForRole(roleId: UserRole): Promise<DashboardAssignment[]>;
  getActiveAssignmentForRole(roleId: UserRole): Promise<DashboardAssignment | null>;

  // Activation/Deactivation
  activateAssignment(assignmentId: string, activatedBy: string): Promise<void>;
  deactivateAssignment(assignmentId: string, deactivatedBy: string): Promise<void>;
  setDefaultAssignment(assignmentId: string): Promise<void>;

  // Bulk operations
  bulkAssignDashboard(
    roleIds: UserRole[],
    templateId: string,
    templateVersion: number,
    assignedBy: string
  ): Promise<DashboardAssignment[]>;
  bulkActivateAssignments(assignmentIds: string[], activatedBy: string): Promise<void>;
  bulkDeactivateAssignments(assignmentIds: string[], deactivatedBy: string): Promise<void>;
}

export interface DashboardVersionService {
  // Version management
  createVersion(
    templateId: string,
    template: DashboardTemplate,
    createdBy: string,
    changelog?: string
  ): Promise<DashboardVersion>;
  getVersions(templateId: string): Promise<DashboardVersion[]>;
  getVersion(templateId: string, version: number): Promise<DashboardVersion | null>;
  getLatestVersion(templateId: string): Promise<DashboardVersion | null>;

  // Publishing
  publishVersion(templateId: string, version: number, publishedBy: string): Promise<void>;
  unpublishVersion(templateId: string, version: number, unpublishedBy: string): Promise<void>;

  // Rollback
  rollbackToVersion(
    templateId: string,
    targetVersion: number,
    rolledBackBy: string,
    reason: string
  ): Promise<DashboardRollbackPoint>;
  getRollbackHistory(templateId: string): Promise<DashboardRollbackPoint[]>;
}

export interface DashboardAnalyticsService {
  // Usage tracking
  trackDashboardView(
    templateId: string,
    templateVersion: number,
    roleId: UserRole,
    userId: string,
    sessionId: string
  ): Promise<void>;
  trackWidgetInteraction(
    templateId: string,
    widgetId: string,
    userId: string,
    sessionId: string
  ): Promise<void>;
  trackQuickActionClick(
    templateId: string,
    actionId: string,
    userId: string,
    sessionId: string
  ): Promise<void>;
  trackModuleAccess(
    templateId: string,
    moduleId: string,
    userId: string,
    sessionId: string
  ): Promise<void>;

  // Analytics retrieval
  getDashboardUsageAnalytics(
    templateId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]>;
  getRoleUsageAnalytics(
    roleId: UserRole,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]>;
  getUserUsageAnalytics(
    userId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]>;

  // Aggregated analytics
  getPopularWidgets(
    templateId?: string,
    roleId?: UserRole
  ): Promise<Array<{ widgetId: string; interactionCount: number }>>;
  getPopularQuickActions(
    templateId?: string,
    roleId?: UserRole
  ): Promise<Array<{ actionId: string; clickCount: number }>>;
  getDashboardPerformanceMetrics(
    templateId: string
  ): Promise<{ avgLoadTime: number; errorRate: number; userSatisfaction: number }>;
}

// Assignment management state
export interface DashboardAssignmentState {
  assignments: DashboardAssignment[];
  versions: Record<string, DashboardVersion[]>; // templateId -> versions
  analytics: DashboardUsageAnalytics[];
  rollbackHistory: DashboardRollbackPoint[];
  assignmentHistory: DashboardAssignmentHistory[];

  // UI state
  selectedRole: UserRole | null;
  selectedTemplate: string | null;
  selectedVersion: number | null;
  isLoading: boolean;
  error: string | null;

  // Filters and pagination
  filters: {
    roles?: UserRole[];
    templates?: string[];
    dateRange?: { from: Date; to: Date };
    isActive?: boolean;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
}

// Component props interfaces
export interface DashboardAssignmentManagerProps {
  className?: string;
  onAssignmentChange?: (assignment: DashboardAssignment) => void;
}

export interface DashboardVersionManagerProps {
  templateId: string;
  className?: string;
  onVersionChange?: (version: DashboardVersion) => void;
}

export interface DashboardAnalyticsDashboardProps {
  className?: string;
  templateId?: string;
  roleId?: UserRole;
  dateRange?: { from: Date; to: Date };
}

export interface RoleAssignmentPanelProps {
  roleId: UserRole;
  className?: string;
  onAssignmentUpdate?: () => void;
}

export interface VersionHistoryPanelProps {
  templateId: string;
  className?: string;
  onVersionSelect?: (version: DashboardVersion) => void;
}

export interface UsageAnalyticsChartProps {
  analytics: DashboardUsageAnalytics[];
  chartType: 'usage' | 'interactions' | 'performance';
  className?: string;
}
