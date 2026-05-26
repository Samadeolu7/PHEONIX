import { authService } from './authService';
import { api } from './api';

export interface WorkflowPermissions {
  canCreateDraft: boolean;
  canSubmitForApproval: boolean;
  canCreateWithWorkflow: boolean;
  canConvertToPO: boolean;
  canApproveRequisitions: boolean;
  canRejectRequisitions: boolean;
}

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  errorMessage?: string;
}

export interface UserPermissionData {
  user_id: number;
  permissions: string[];
  roles: string[];
  is_owner: boolean;
  is_staff: boolean;
  department?: string;
  branch_id?: number;
}

class RequisitionPermissionService {
  private permissionCache: Map<number, WorkflowPermissions> = new Map();
  private cacheExpiry: Map<number, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get user permissions for requisition workflows
   */
  async getUserPermissions(userId?: number): Promise<WorkflowPermissions> {
    const currentUser = authService.getStoredUser();
    const targetUserId = userId || currentUser?.id;

    if (!targetUserId) {
      return this.getDefaultPermissions();
    }

    // Check cache first
    const cached = this.getCachedPermissions(targetUserId);
    if (cached) {
      return cached;
    }

    try {
      // Fetch permissions from backend
      const permissions = await this.fetchUserPermissions(targetUserId);

      // Cache the result
      this.setCachedPermissions(targetUserId, permissions);

      return permissions;
    } catch (error) {
      console.error('Failed to fetch user permissions:', error);
      // Fallback to basic permissions based on stored user data
      return this.getBasicPermissions(currentUser);
    }
  }

  /**
   * Check if user can create draft requisitions
   */
  async canCreateDraft(userId?: number): Promise<PermissionCheckResult> {
    const permissions = await this.getUserPermissions(userId);

    if (!permissions.canCreateDraft) {
      return {
        allowed: false,
        reason: 'insufficient_permissions',
        errorMessage: 'You do not have permission to create draft requisitions',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can submit requisitions for manual approval
   */
  async canSubmitForApproval(userId?: number): Promise<PermissionCheckResult> {
    const permissions = await this.getUserPermissions(userId);

    if (!permissions.canSubmitForApproval) {
      return {
        allowed: false,
        reason: 'insufficient_permissions',
        errorMessage: 'You do not have permission to submit requisitions for approval',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can create requisitions with workflow
   */
  async canCreateWithWorkflow(userId?: number): Promise<PermissionCheckResult> {
    const permissions = await this.getUserPermissions(userId);

    if (!permissions.canCreateWithWorkflow) {
      return {
        allowed: false,
        reason: 'workflow_not_available',
        errorMessage: 'Workflow creation is not available for your account',
      };
    }

    return { allowed: true };
  }

  /**
   * Check if user can convert approved requisitions to POs
   */
  async canConvertToPO(userId?: number): Promise<PermissionCheckResult> {
    const permissions = await this.getUserPermissions(userId);

    if (!permissions.canConvertToPO) {
      return {
        allowed: false,
        reason: 'insufficient_permissions',
        errorMessage: 'You do not have permission to convert requisitions to purchase orders',
      };
    }

    return { allowed: true };
  }

  /**
   * Get permission-based error message for submission type
   */
  getPermissionErrorMessage(submissionType: 'draft' | 'manual' | 'workflow'): string {
    switch (submissionType) {
      case 'draft':
        return 'You do not have permission to save draft requisitions';
      case 'manual':
        return 'You do not have permission to submit requisitions for manual approval';
      case 'workflow':
        return 'You do not have permission to create requisitions with automated workflow';
      default:
        return 'You do not have permission to perform this action';
    }
  }

  /**
   * Clear permission cache for a user
   */
  clearUserPermissionCache(userId: number): void {
    this.permissionCache.delete(userId);
    this.cacheExpiry.delete(userId);
  }

  /**
   * Clear all permission caches
   */
  clearAllPermissionCaches(): void {
    this.permissionCache.clear();
    this.cacheExpiry.clear();
  }

  /**
   * Fetch user permissions from backend
   */
  private async fetchUserPermissions(userId: number): Promise<WorkflowPermissions> {
    try {
      const response = await api.get(`/users/${userId}/permissions/`);
      return this.mapBackendPermissions(response);
    } catch (error) {
      // If specific endpoint doesn't exist, try to get from current user data
      const currentUser = authService.getStoredUser();
      if (currentUser && currentUser.id === userId) {
        return this.getBasicPermissions(currentUser);
      }
      throw error;
    }
  }

  /**
   * Map backend permission response to WorkflowPermissions
   */
  private mapBackendPermissions(permissionData: any): WorkflowPermissions {
    const permissions = permissionData.permissions || [];
    const roles = permissionData.roles || [];
    const isOwner = permissionData.is_owner || false;
    const isStaff = permissionData.is_staff || false;

    return {
      canCreateDraft:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaserequisition',
          'requisition.create_draft',
        ]) ||
        isOwner ||
        isStaff,

      canSubmitForApproval:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaserequisition',
          'procurement.change_purchaserequisition',
          'requisition.submit_approval',
        ]) ||
        isOwner ||
        isStaff,

      canCreateWithWorkflow:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaserequisition',
          'workflow.create_requisition',
          'requisition.create_workflow',
        ]) || isOwner,

      canConvertToPO:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaseorder',
          'procurement.change_purchaserequisition',
          'requisition.convert_po',
        ]) ||
        isOwner ||
        isStaff,

      canApproveRequisitions:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.change_purchaserequisition',
          'requisition.approve',
        ]) ||
        isOwner ||
        isStaff,

      canRejectRequisitions:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.change_purchaserequisition',
          'requisition.reject',
        ]) ||
        isOwner ||
        isStaff,
    };
  }

  /**
   * Get basic permissions based on stored user data
   */
  private getBasicPermissions(user: any): WorkflowPermissions {
    if (!user) {
      return this.getDefaultPermissions();
    }

    const isOwner = user.is_owner || false;
    const isStaff = user.is_staff || false;
    const permissions = user.permissions || [];
    const roles = user.roles || [];

    return {
      canCreateDraft:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaserequisition',
          'requisition.create_draft',
        ]) ||
        isOwner ||
        isStaff ||
        true, // Allow basic users to create drafts

      canSubmitForApproval:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaserequisition',
          'requisition.submit_approval',
        ]) ||
        isOwner ||
        isStaff ||
        true, // Allow basic users to submit

      canCreateWithWorkflow:
        this.hasPermissionOrRole(permissions, roles, [
          'workflow.create_requisition',
          'requisition.create_workflow',
        ]) || isOwner, // Workflow typically requires higher permissions

      canConvertToPO:
        this.hasPermissionOrRole(permissions, roles, [
          'procurement.add_purchaseorder',
          'requisition.convert_po',
        ]) ||
        isOwner ||
        isStaff,

      canApproveRequisitions:
        this.hasPermissionOrRole(permissions, roles, ['requisition.approve']) || isOwner || isStaff,

      canRejectRequisitions:
        this.hasPermissionOrRole(permissions, roles, ['requisition.reject']) || isOwner || isStaff,
    };
  }

  /**
   * Get default permissions (no access)
   */
  private getDefaultPermissions(): WorkflowPermissions {
    return {
      canCreateDraft: false,
      canSubmitForApproval: false,
      canCreateWithWorkflow: false,
      canConvertToPO: false,
      canApproveRequisitions: false,
      canRejectRequisitions: false,
    };
  }

  /**
   * Check if user has any of the specified permissions or roles
   */
  private hasPermissionOrRole(
    userPermissions: string[],
    userRoles: string[],
    requiredPermissions: string[]
  ): boolean {
    return requiredPermissions.some(
      permission => userPermissions.includes(permission) || userRoles.includes(permission)
    );
  }

  /**
   * Get cached permissions if still valid
   */
  private getCachedPermissions(userId: number): WorkflowPermissions | null {
    const cached = this.permissionCache.get(userId);
    const expiry = this.cacheExpiry.get(userId);

    if (cached && expiry && Date.now() < expiry) {
      return cached;
    }

    // Clean up expired cache
    this.permissionCache.delete(userId);
    this.cacheExpiry.delete(userId);

    return null;
  }

  /**
   * Cache permissions with expiry
   */
  private setCachedPermissions(userId: number, permissions: WorkflowPermissions): void {
    this.permissionCache.set(userId, permissions);
    this.cacheExpiry.set(userId, Date.now() + this.CACHE_DURATION);
  }
}

export const requisitionPermissionService = new RequisitionPermissionService();
