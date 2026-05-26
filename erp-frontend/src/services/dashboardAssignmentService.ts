// Dashboard assignment service implementation
import {
  DashboardAssignment,
  DashboardVersion,
  DashboardUsageAnalytics,
  DashboardRollbackPoint,
  DashboardAssignmentHistory,
  DashboardAssignmentService,
  DashboardVersionService,
  DashboardAnalyticsService,
} from '../types/dashboardAssignment';
import { UserRole } from '../types/roles';
import { DashboardTemplate } from '../types/dashboardTemplates';
import { dashboardTemplates } from '../data/dashboardTemplates';

// Mock data for development - in production this would connect to backend APIs
class MockDashboardAssignmentService implements DashboardAssignmentService {
  private assignments: DashboardAssignment[] = [
    {
      id: 'assign-1',
      roleId: 'Director',
      templateId: 'director-template',
      templateVersion: 1,
      assignedBy: 'admin-user-1',
      assignedAt: new Date('2024-01-15'),
      activatedAt: new Date('2024-01-15'),
      isActive: true,
      isDefault: true,
      metadata: {
        description: 'Default director dashboard with full system access',
        tags: ['executive', 'comprehensive'],
      },
    },
    {
      id: 'assign-2',
      roleId: 'Principal',
      templateId: 'principal-template',
      templateVersion: 1,
      assignedBy: 'admin-user-1',
      assignedAt: new Date('2024-01-15'),
      activatedAt: new Date('2024-01-15'),
      isActive: true,
      isDefault: true,
      metadata: {
        description: 'Academic leadership dashboard',
        tags: ['academic', 'leadership'],
      },
    },
    {
      id: 'assign-3',
      roleId: 'Administrator',
      templateId: 'administrator-template',
      templateVersion: 1,
      assignedBy: 'admin-user-1',
      assignedAt: new Date('2024-01-15'),
      activatedAt: new Date('2024-01-15'),
      isActive: true,
      isDefault: true,
      metadata: {
        description: 'System administration dashboard',
        tags: ['admin', 'system'],
      },
    },
    {
      id: 'assign-4',
      roleId: 'Registrar',
      templateId: 'registrar-template',
      templateVersion: 1,
      assignedBy: 'admin-user-1',
      assignedAt: new Date('2024-01-15'),
      activatedAt: new Date('2024-01-15'),
      isActive: true,
      isDefault: true,
      metadata: {
        description: 'Client Services focused dashboard',
        tags: ['client-services', 'registrar'],
      },
    },
    {
      id: 'assign-5',
      roleId: 'Officer',
      templateId: 'officer-template',
      templateVersion: 1,
      assignedBy: 'admin-user-1',
      assignedAt: new Date('2024-01-15'),
      activatedAt: new Date('2024-01-15'),
      isActive: true,
      isDefault: true,
      metadata: {
        description: 'Operational tasks dashboard',
        tags: ['operations', 'daily-tasks'],
      },
    },
  ];

  private assignmentHistory: DashboardAssignmentHistory[] = [];

  async assignDashboardToRole(
    roleId: UserRole,
    templateId: string,
    templateVersion: number,
    assignedBy: string
  ): Promise<DashboardAssignment> {
    // Check if assignment already exists
    const existingAssignment = this.assignments.find(
      a => a.roleId === roleId && a.templateId === templateId
    );

    if (existingAssignment) {
      // Update existing assignment
      existingAssignment.templateVersion = templateVersion;
      existingAssignment.assignedBy = assignedBy;
      existingAssignment.assignedAt = new Date();

      // Log history
      this.logAssignmentHistory({
        templateId,
        roleId,
        action: 'updated',
        performedBy: assignedBy,
        performedAt: new Date(),
        newState: existingAssignment,
        reason: 'Template version updated',
      });

      return existingAssignment;
    }

    // Create new assignment
    const newAssignment: DashboardAssignment = {
      id: `assign-${Date.now()}`,
      roleId,
      templateId,
      templateVersion,
      assignedBy,
      assignedAt: new Date(),
      isActive: false, // New assignments start inactive
      isDefault: false,
      metadata: {
        description: `Dashboard assignment for ${roleId}`,
        tags: [roleId.toLowerCase()],
      },
    };

    this.assignments.push(newAssignment);

    // Log history
    this.logAssignmentHistory({
      templateId,
      roleId,
      action: 'assigned',
      performedBy: assignedBy,
      performedAt: new Date(),
      newState: newAssignment,
      reason: 'New dashboard assigned',
    });

    return newAssignment;
  }

  async unassignDashboardFromRole(roleId: UserRole, templateId: string): Promise<void> {
    const index = this.assignments.findIndex(
      a => a.roleId === roleId && a.templateId === templateId
    );

    if (index !== -1) {
      const assignment = this.assignments[index];
      this.assignments.splice(index, 1);

      // Log history
      this.logAssignmentHistory({
        templateId,
        roleId,
        action: 'assigned',
        performedBy: 'system',
        performedAt: new Date(),
        previousState: assignment,
        reason: 'Dashboard unassigned',
      });
    }
  }

  async getAssignmentsForRole(roleId: UserRole): Promise<DashboardAssignment[]> {
    return this.assignments.filter(a => a.roleId === roleId);
  }

  async getActiveAssignmentForRole(roleId: UserRole): Promise<DashboardAssignment | null> {
    return this.assignments.find(a => a.roleId === roleId && a.isActive && a.isDefault) || null;
  }

  async activateAssignment(assignmentId: string, activatedBy: string): Promise<void> {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    // Deactivate other assignments for the same role
    this.assignments
      .filter(a => a.roleId === assignment.roleId && a.id !== assignmentId)
      .forEach(a => {
        a.isActive = false;
        a.deactivatedAt = new Date();
      });

    // Activate this assignment
    assignment.isActive = true;
    assignment.activatedAt = new Date();
    delete assignment.deactivatedAt;

    // Log history
    this.logAssignmentHistory({
      templateId: assignment.templateId,
      roleId: assignment.roleId,
      action: 'activated',
      performedBy: activatedBy,
      performedAt: new Date(),
      newState: assignment,
      reason: 'Dashboard activated',
    });
  }

  async deactivateAssignment(assignmentId: string, deactivatedBy: string): Promise<void> {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    assignment.isActive = false;
    assignment.deactivatedAt = new Date();

    // Log history
    this.logAssignmentHistory({
      templateId: assignment.templateId,
      roleId: assignment.roleId,
      action: 'deactivated',
      performedBy: deactivatedBy,
      performedAt: new Date(),
      newState: assignment,
      reason: 'Dashboard deactivated',
    });
  }

  async setDefaultAssignment(assignmentId: string): Promise<void> {
    const assignment = this.assignments.find(a => a.id === assignmentId);
    if (!assignment) {
      throw new Error('Assignment not found');
    }

    // Remove default flag from other assignments for the same role
    this.assignments
      .filter(a => a.roleId === assignment.roleId && a.id !== assignmentId)
      .forEach(a => (a.isDefault = false));

    // Set this as default
    assignment.isDefault = true;
  }

  async bulkAssignDashboard(
    roleIds: UserRole[],
    templateId: string,
    templateVersion: number,
    assignedBy: string
  ): Promise<DashboardAssignment[]> {
    const assignments: DashboardAssignment[] = [];

    for (const roleId of roleIds) {
      const assignment = await this.assignDashboardToRole(
        roleId,
        templateId,
        templateVersion,
        assignedBy
      );
      assignments.push(assignment);
    }

    return assignments;
  }

  async bulkActivateAssignments(assignmentIds: string[], activatedBy: string): Promise<void> {
    for (const assignmentId of assignmentIds) {
      await this.activateAssignment(assignmentId, activatedBy);
    }
  }

  async bulkDeactivateAssignments(assignmentIds: string[], deactivatedBy: string): Promise<void> {
    for (const assignmentId of assignmentIds) {
      await this.deactivateAssignment(assignmentId, deactivatedBy);
    }
  }

  // Get all assignments (for admin interface)
  async getAllAssignments(): Promise<DashboardAssignment[]> {
    return [...this.assignments];
  }

  // Get assignment history
  async getAssignmentHistory(
    templateId?: string,
    roleId?: UserRole
  ): Promise<DashboardAssignmentHistory[]> {
    let history = [...this.assignmentHistory];

    if (templateId) {
      history = history.filter(h => h.templateId === templateId);
    }

    if (roleId) {
      history = history.filter(h => h.roleId === roleId);
    }

    return history.sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());
  }

  private logAssignmentHistory(entry: Omit<DashboardAssignmentHistory, 'id'>): void {
    this.assignmentHistory.push({
      id: `history-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...entry,
    });
  }
}

// Dashboard version service implementation
class MockDashboardVersionService implements DashboardVersionService {
  private versions: Record<string, DashboardVersion[]> = {};
  private rollbackHistory: DashboardRollbackPoint[] = [];

  constructor() {
    // Initialize with current templates as version 1
    Object.entries(dashboardTemplates).forEach(([roleId, template]) => {
      const templateId = template.id;
      this.versions[templateId] = [
        {
          id: `version-${templateId}-1`,
          templateId,
          version: 1,
          template,
          createdBy: 'system',
          createdAt: new Date('2024-01-01'),
          changelog: 'Initial template version',
          isPublished: true,
          metadata: {
            description: `Initial version of ${template.name}`,
            tags: ['initial', 'stable'],
          },
        },
      ];
    });
  }

  async createVersion(
    templateId: string,
    template: DashboardTemplate,
    createdBy: string,
    changelog?: string
  ): Promise<DashboardVersion> {
    if (!this.versions[templateId]) {
      this.versions[templateId] = [];
    }

    const versions = this.versions[templateId];
    const latestVersion = Math.max(...versions.map(v => v.version), 0);
    const newVersion = latestVersion + 1;

    const version: DashboardVersion = {
      id: `version-${templateId}-${newVersion}`,
      templateId,
      version: newVersion,
      template,
      createdBy,
      createdAt: new Date(),
      changelog: changelog || `Version ${newVersion}`,
      isPublished: false,
      parentVersion: latestVersion > 0 ? latestVersion : undefined,
      metadata: {
        description: `Version ${newVersion} of ${template.name}`,
        tags: ['draft'],
      },
    };

    versions.push(version);
    return version;
  }

  async getVersions(templateId: string): Promise<DashboardVersion[]> {
    return this.versions[templateId] || [];
  }

  async getVersion(templateId: string, version: number): Promise<DashboardVersion | null> {
    const versions = this.versions[templateId] || [];
    return versions.find(v => v.version === version) || null;
  }

  async getLatestVersion(templateId: string): Promise<DashboardVersion | null> {
    const versions = this.versions[templateId] || [];
    if (versions.length === 0) return null;

    return versions.reduce((latest, current) =>
      current.version > latest.version ? current : latest
    );
  }

  async publishVersion(templateId: string, version: number, publishedBy: string): Promise<void> {
    const versionObj = await this.getVersion(templateId, version);
    if (!versionObj) {
      throw new Error('Version not found');
    }

    versionObj.isPublished = true;
    if (versionObj.metadata) {
      versionObj.metadata.tags = versionObj.metadata.tags?.filter(tag => tag !== 'draft') || [];
      versionObj.metadata.tags.push('published');
    }
  }

  async unpublishVersion(
    templateId: string,
    version: number,
    unpublishedBy: string
  ): Promise<void> {
    const versionObj = await this.getVersion(templateId, version);
    if (!versionObj) {
      throw new Error('Version not found');
    }

    versionObj.isPublished = false;
    if (versionObj.metadata) {
      versionObj.metadata.tags = versionObj.metadata.tags?.filter(tag => tag !== 'published') || [];
      versionObj.metadata.tags.push('unpublished');
    }
  }

  async rollbackToVersion(
    templateId: string,
    targetVersion: number,
    rolledBackBy: string,
    reason: string
  ): Promise<DashboardRollbackPoint> {
    const currentVersion = await this.getLatestVersion(templateId);
    const targetVersionObj = await this.getVersion(templateId, targetVersion);

    if (!currentVersion || !targetVersionObj) {
      throw new Error('Version not found for rollback');
    }

    // Create rollback point
    const rollbackPoint: DashboardRollbackPoint = {
      id: `rollback-${Date.now()}`,
      templateId,
      fromVersion: currentVersion.version,
      toVersion: targetVersion,
      rolledBackBy,
      rolledBackAt: new Date(),
      reason,
      affectedUsers: [], // Would be populated from actual user data
      rollbackData: {
        previousAssignments: [], // Would be populated from assignment service
        restoredTemplate: targetVersionObj.template,
      },
    };

    this.rollbackHistory.push(rollbackPoint);

    // In a real implementation, this would:
    // 1. Update all active assignments to use the target version
    // 2. Notify affected users
    // 3. Log the rollback in audit trails

    return rollbackPoint;
  }

  async getRollbackHistory(templateId: string): Promise<DashboardRollbackPoint[]> {
    return this.rollbackHistory
      .filter(r => r.templateId === templateId)
      .sort((a, b) => b.rolledBackAt.getTime() - a.rolledBackAt.getTime());
  }
}

// Dashboard analytics service implementation
class MockDashboardAnalyticsService implements DashboardAnalyticsService {
  private analytics: DashboardUsageAnalytics[] = [];
  private sessions: Map<string, { startTime: Date; interactions: number }> = new Map();

  // Generate some mock analytics data
  constructor() {
    this.generateMockAnalytics();
  }

  async trackDashboardView(
    templateId: string,
    templateVersion: number,
    roleId: UserRole,
    userId: string,
    sessionId: string
  ): Promise<void> {
    // Start or update session
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, { startTime: new Date(), interactions: 0 });
    }

    // Find or create analytics record
    let analytics = this.analytics.find(
      a => a.templateId === templateId && a.userId === userId && a.sessionId === sessionId
    );

    if (!analytics) {
      analytics = {
        id: `analytics-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        templateId,
        templateVersion,
        roleId,
        userId,
        sessionId,
        viewCount: 0,
        totalTimeSpent: 0,
        lastAccessed: new Date(),
        firstAccessed: new Date(),
        widgetInteractions: {},
        quickActionClicks: {},
        moduleAccesses: {},
        loadTime: Math.random() * 2000 + 500, // Mock load time
        errorCount: 0,
        customizationsMade: 0,
        metadata: {
          browser: 'Chrome',
          device: 'Desktop',
          screenResolution: '1920x1080',
        },
      };
      this.analytics.push(analytics);
    }

    analytics.viewCount++;
    analytics.lastAccessed = new Date();
  }

  async trackWidgetInteraction(
    templateId: string,
    widgetId: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const analytics = this.analytics.find(
      a => a.templateId === templateId && a.userId === userId && a.sessionId === sessionId
    );

    if (analytics) {
      analytics.widgetInteractions[widgetId] = (analytics.widgetInteractions[widgetId] || 0) + 1;

      const session = this.sessions.get(sessionId);
      if (session) {
        session.interactions++;
      }
    }
  }

  async trackQuickActionClick(
    templateId: string,
    actionId: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const analytics = this.analytics.find(
      a => a.templateId === templateId && a.userId === userId && a.sessionId === sessionId
    );

    if (analytics) {
      analytics.quickActionClicks[actionId] = (analytics.quickActionClicks[actionId] || 0) + 1;
    }
  }

  async trackModuleAccess(
    templateId: string,
    moduleId: string,
    userId: string,
    sessionId: string
  ): Promise<void> {
    const analytics = this.analytics.find(
      a => a.templateId === templateId && a.userId === userId && a.sessionId === sessionId
    );

    if (analytics) {
      analytics.moduleAccesses[moduleId] = (analytics.moduleAccesses[moduleId] || 0) + 1;
    }
  }

  async getDashboardUsageAnalytics(
    templateId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]> {
    let filtered = this.analytics.filter(a => a.templateId === templateId);

    if (dateRange) {
      filtered = filtered.filter(
        a => a.lastAccessed >= dateRange.from && a.lastAccessed <= dateRange.to
      );
    }

    return filtered;
  }

  async getRoleUsageAnalytics(
    roleId: UserRole,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]> {
    let filtered = this.analytics.filter(a => a.roleId === roleId);

    if (dateRange) {
      filtered = filtered.filter(
        a => a.lastAccessed >= dateRange.from && a.lastAccessed <= dateRange.to
      );
    }

    return filtered;
  }

  async getUserUsageAnalytics(
    userId: string,
    dateRange?: { from: Date; to: Date }
  ): Promise<DashboardUsageAnalytics[]> {
    let filtered = this.analytics.filter(a => a.userId === userId);

    if (dateRange) {
      filtered = filtered.filter(
        a => a.lastAccessed >= dateRange.from && a.lastAccessed <= dateRange.to
      );
    }

    return filtered;
  }

  async getPopularWidgets(
    templateId?: string,
    roleId?: UserRole
  ): Promise<Array<{ widgetId: string; interactionCount: number }>> {
    let filtered = this.analytics;

    if (templateId) {
      filtered = filtered.filter(a => a.templateId === templateId);
    }

    if (roleId) {
      filtered = filtered.filter(a => a.roleId === roleId);
    }

    const widgetCounts: Record<string, number> = {};

    filtered.forEach(analytics => {
      Object.entries(analytics.widgetInteractions).forEach(([widgetId, count]) => {
        widgetCounts[widgetId] = (widgetCounts[widgetId] || 0) + count;
      });
    });

    return Object.entries(widgetCounts)
      .map(([widgetId, interactionCount]) => ({ widgetId, interactionCount }))
      .sort((a, b) => b.interactionCount - a.interactionCount);
  }

  async getPopularQuickActions(
    templateId?: string,
    roleId?: UserRole
  ): Promise<Array<{ actionId: string; clickCount: number }>> {
    let filtered = this.analytics;

    if (templateId) {
      filtered = filtered.filter(a => a.templateId === templateId);
    }

    if (roleId) {
      filtered = filtered.filter(a => a.roleId === roleId);
    }

    const actionCounts: Record<string, number> = {};

    filtered.forEach(analytics => {
      Object.entries(analytics.quickActionClicks).forEach(([actionId, count]) => {
        actionCounts[actionId] = (actionCounts[actionId] || 0) + count;
      });
    });

    return Object.entries(actionCounts)
      .map(([actionId, clickCount]) => ({ actionId, clickCount }))
      .sort((a, b) => b.clickCount - a.clickCount);
  }

  async getDashboardPerformanceMetrics(
    templateId: string
  ): Promise<{ avgLoadTime: number; errorRate: number; userSatisfaction: number }> {
    const templateAnalytics = this.analytics.filter(a => a.templateId === templateId);

    if (templateAnalytics.length === 0) {
      return { avgLoadTime: 0, errorRate: 0, userSatisfaction: 0 };
    }

    const avgLoadTime =
      templateAnalytics.reduce((sum, a) => sum + a.loadTime, 0) / templateAnalytics.length;
    const totalViews = templateAnalytics.reduce((sum, a) => sum + a.viewCount, 0);
    const totalErrors = templateAnalytics.reduce((sum, a) => sum + a.errorCount, 0);
    const errorRate = totalViews > 0 ? (totalErrors / totalViews) * 100 : 0;

    const ratingsCount = templateAnalytics.filter(a => a.feedbackRating).length;
    const avgRating =
      ratingsCount > 0
        ? templateAnalytics.reduce((sum, a) => sum + (a.feedbackRating || 0), 0) / ratingsCount
        : 0;
    const userSatisfaction = (avgRating / 5) * 100;

    return { avgLoadTime, errorRate, userSatisfaction };
  }

  private generateMockAnalytics(): void {
    const templateIds = Object.keys(dashboardTemplates);
    const userIds = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];
    const roles: UserRole[] = ['Director', 'Principal', 'Administrator', 'Registrar', 'Officer'];

    // Generate analytics for the last 30 days
    for (let i = 0; i < 30; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);

      templateIds.forEach(templateId => {
        userIds.forEach(userId => {
          const roleIndex = userIds.indexOf(userId) % roles.length;
          const role = roles[roleIndex];
          const sessionId = `session-${userId}-${i}`;

          const analytics: DashboardUsageAnalytics = {
            id: `analytics-${templateId}-${userId}-${i}`,
            templateId,
            templateVersion: 1,
            roleId: role,
            userId,
            sessionId,
            viewCount: Math.floor(Math.random() * 10) + 1,
            totalTimeSpent: Math.floor(Math.random() * 3600) + 300, // 5 minutes to 1 hour
            lastAccessed: date,
            firstAccessed: date,
            widgetInteractions: {
              'activity-feed': Math.floor(Math.random() * 5),
              'system-alerts': Math.floor(Math.random() * 3),
              'stats-overview': Math.floor(Math.random() * 8),
            },
            quickActionClicks: {
              'create-invoice': Math.floor(Math.random() * 3),
              'record-payment': Math.floor(Math.random() * 2),
              'student-entitlements': Math.floor(Math.random() * 4),
            },
            moduleAccesses: {
              financial: Math.floor(Math.random() * 6),
              'client-services': Math.floor(Math.random() * 4),
              operations: Math.floor(Math.random() * 3),
            },
            loadTime: Math.random() * 2000 + 500,
            errorCount: Math.random() > 0.9 ? 1 : 0,
            customizationsMade: Math.random() > 0.8 ? 1 : 0,
            feedbackRating: Math.random() > 0.7 ? Math.floor(Math.random() * 2) + 4 : undefined,
            metadata: {
              browser: ['Chrome', 'Firefox', 'Safari'][Math.floor(Math.random() * 3)],
              device: ['Desktop', 'Tablet', 'Mobile'][Math.floor(Math.random() * 3)],
              screenResolution: ['1920x1080', '1366x768', '1440x900'][
                Math.floor(Math.random() * 3)
              ],
            },
          };

          this.analytics.push(analytics);
        });
      });
    }
  }
}

// Export service instances
export const dashboardAssignmentService = new MockDashboardAssignmentService();
export const dashboardVersionService = new MockDashboardVersionService();
export const dashboardAnalyticsService = new MockDashboardAnalyticsService();

// Export service classes for testing
export {
  MockDashboardAssignmentService,
  MockDashboardVersionService,
  MockDashboardAnalyticsService,
};
