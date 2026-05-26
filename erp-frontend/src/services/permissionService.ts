// src/services/permissionService.ts
//
// Scope-aware, elevation-conscious permission service.
// Reads from the login response and caches in localStorage.

// Legacy superuser roles kept for backward compat with any code that still
// calls isSuperUser(). New code should use hasPermission / getScope instead.
const SUPERUSER_ROLES = ['Director', 'Principal', 'MD / CEO', 'Operations Manager'];

// Matches the SCOPE_RANK in permissions/models.py
const SCOPE_RANK: Record<string, number> = {
  own_records: 1,
  assigned_clients: 2,
  ajo_group: 2,
  own_branch: 3,
  global: 4,
};

export interface EffectivePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  scope: string;
  scope_ajo_group_id: number | null;
  approval_limit: string | null; // decimal string, null = unlimited
  is_elevated: boolean;
  elevated_fields: string[];
}

class PermissionService {
  private permissions: string[] = [];
  private rolePermissions: Record<string, string[]> = {};
  private excludedPermissions: string[] = [];
  private userRoles: string[] = [];

  // New fields from the scope-aware system
  private userScope: string = 'own_branch';
  private approvalLimit: string | null = null;   // null = unlimited
  private hasElevatedOverride: boolean = false;
  private elevatedFields: string[] = [];
  private effectivePermissions: EffectivePermission | null = null;

  // ── Hydration ──────────────────────────────────────────────────────────────

  setPermissions(userData: any) {
    const effectivePermissions =
      userData.permission_codes && userData.permission_codes.length > 0
        ? userData.permission_codes
        : userData.roles_permission_codes || [];

    this.permissions = effectivePermissions;
    this.rolePermissions = userData.role_permission_codes || {};
    this.excludedPermissions = userData.excluded_permission_codes || [];
    this.userRoles = userData.roles || [];

    // New scope / elevation data (present when the backend returns effective_permissions)
    const eff: EffectivePermission | undefined = userData.effective_permissions;
    if (eff) {
      this.userScope       = eff.scope ?? 'own_branch';
      this.approvalLimit   = eff.approval_limit ?? null;
      this.hasElevatedOverride = eff.is_elevated ?? false;
      this.elevatedFields  = eff.elevated_fields ?? [];
      this.effectivePermissions = eff;
    } else {
      // Fallback: infer scope from the role name
      this.userScope = this._inferScopeFromRoles(this.userRoles);
      this.approvalLimit = null;
      this.hasElevatedOverride = false;
      this.elevatedFields = [];
      this.effectivePermissions = null;
    }

    localStorage.setItem('userPermissions',     JSON.stringify(this.permissions));
    localStorage.setItem('rolePermissions',     JSON.stringify(this.rolePermissions));
    localStorage.setItem('excludedPermissions', JSON.stringify(this.excludedPermissions));
    localStorage.setItem('userRoles',           JSON.stringify(this.userRoles));
    localStorage.setItem('userScope',           this.userScope);
    localStorage.setItem('approvalLimit',       JSON.stringify(this.approvalLimit));
    localStorage.setItem('hasElevatedOverride', JSON.stringify(this.hasElevatedOverride));
    localStorage.setItem('elevatedFields',      JSON.stringify(this.elevatedFields));
    if (this.effectivePermissions) {
      localStorage.setItem('effectivePermissions', JSON.stringify(this.effectivePermissions));
    }

    window.dispatchEvent(new CustomEvent('permissions:updated'));
  }

  private _inferScopeFromRoles(roles: string[]): string {
    if (roles.some(r => ['MD / CEO', 'Operations Manager', 'Auditor'].includes(r))) return 'global';
    if (roles.some(r => r === 'Loan Officer')) return 'assigned_clients';
    return 'own_branch';
  }

  // ── Scope helpers ──────────────────────────────────────────────────────────

  getScope(): string {
    if (this.userScope) return this.userScope;
    const stored = localStorage.getItem('userScope');
    if (stored) this.userScope = stored;
    return this.userScope || 'own_branch';
  }

  getScopeRank(): number {
    return SCOPE_RANK[this.getScope()] ?? 3;
  }

  hasGlobalScope(): boolean {
    return this.getScope() === 'global';
  }

  canAccessBranch(branchId: string | number, userBranchId: string | number | null): boolean {
    const scope = this.getScope();
    if (scope === 'global') return true;
    if (scope === 'own_branch') return String(branchId) === String(userBranchId);
    return false;
  }

  // ── Approval limit helpers ─────────────────────────────────────────────────

  getApprovalLimit(): number | null {
    if (this.approvalLimit === undefined) {
      const stored = localStorage.getItem('approvalLimit');
      try { this.approvalLimit = stored ? JSON.parse(stored) : null; } catch { this.approvalLimit = null; }
    }
    if (this.approvalLimit === null) return null;   // unlimited
    return parseFloat(this.approvalLimit);
  }

  canApproveAmount(amount: number): boolean {
    const limit = this.getApprovalLimit();
    if (limit === null) return true;   // unlimited
    return amount <= limit;
  }

  // ── Elevation helpers ──────────────────────────────────────────────────────

  isElevated(): boolean {
    if (typeof this.hasElevatedOverride === 'boolean') return this.hasElevatedOverride;
    const stored = localStorage.getItem('hasElevatedOverride');
    try { this.hasElevatedOverride = stored ? JSON.parse(stored) : false; } catch { this.hasElevatedOverride = false; }
    return this.hasElevatedOverride;
  }

  getElevatedFields(): string[] {
    if (this.elevatedFields.length > 0) return this.elevatedFields;
    const stored = localStorage.getItem('elevatedFields');
    try { this.elevatedFields = stored ? JSON.parse(stored) : []; } catch { this.elevatedFields = []; }
    return this.elevatedFields;
  }

  getEffectivePermissions(): EffectivePermission | null {
    if (this.effectivePermissions) return this.effectivePermissions;
    const stored = localStorage.getItem('effectivePermissions');
    if (stored) {
      try { this.effectivePermissions = JSON.parse(stored); } catch { /* ignore */ }
    }
    return this.effectivePermissions;
  }

  // ── Role helpers ───────────────────────────────────────────────────────────

  getUserRoles(): string[] {
    if (this.userRoles.length === 0) {
      const stored = localStorage.getItem('userRoles');
      if (stored) {
        try { this.userRoles = JSON.parse(stored); } catch (e) { /* ignore */ }
      }
    }
    return this.userRoles;
  }

  isSuperUser(): boolean {
    const roles = this.getUserRoles();
    return roles.some(r => SUPERUSER_ROLES.includes(r));
  }

  isAuditor(): boolean {
    return this.getUserRoles().some(r => r.toLowerCase() === 'auditor');
  }

  // ── Permission checks ──────────────────────────────────────────────────────

  getPermissions(): string[] {
    if (this.permissions.length === 0) {
      const stored = localStorage.getItem('userPermissions');
      if (stored) {
        try { this.permissions = JSON.parse(stored); } catch (e) { /* ignore */ }
      }
    }
    return this.permissions;
  }

  getExcludedPermissions(): string[] {
    if (this.excludedPermissions.length === 0) {
      const stored = localStorage.getItem('excludedPermissions');
      if (stored) {
        try { this.excludedPermissions = JSON.parse(stored); } catch (e) { /* ignore */ }
      }
    }
    return this.excludedPermissions;
  }

  getRolePermissions(roleName: string): string[] {
    if (this.rolePermissions[roleName]) return this.rolePermissions[roleName];
    const stored = localStorage.getItem('rolePermissions');
    if (stored) {
      try {
        this.rolePermissions = JSON.parse(stored);
        return this.rolePermissions[roleName] || [];
      } catch (e) { /* ignore */ }
    }
    return [];
  }

  hasPermission(permissionCode: string): boolean {
    if (this.getExcludedPermissions().includes(permissionCode)) return false;

    // Auditors can never write — enforce here as a safety net
    if (this.isAuditor()) {
      if (
        permissionCode.endsWith('-create') ||
        permissionCode.endsWith('-edit') ||
        permissionCode.endsWith('-delete') ||
        permissionCode.endsWith('-approve') ||
        permissionCode.endsWith('-bulk-approve') ||
        permissionCode.endsWith('-reject')
      ) {
        return false;
      }
    }

    const perms = this.getPermissions();
    return perms.includes('*') || perms.includes(permissionCode);
  }

  hasAnyPermission(permissionCodes: string[]): boolean {
    return permissionCodes.some(code => this.hasPermission(code));
  }

  hasAllPermissions(permissionCodes: string[]): boolean {
    return permissionCodes.every(code => this.hasPermission(code));
  }

  // ── Debug ──────────────────────────────────────────────────────────────────

  debugPermissions() {
    console.log('📋 permissions:', this.permissions);
    console.log('🔒 excluded:',   this.excludedPermissions);
    console.log('🌐 scope:',      this.userScope);
    console.log('💰 limit:',      this.approvalLimit);
    console.log('⚠️  elevated:',  this.hasElevatedOverride, this.elevatedFields);
    console.log('👤 roles:',      this.userRoles);
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────

  clearPermissions() {
    this.permissions = [];
    this.rolePermissions = {};
    this.excludedPermissions = [];
    this.userRoles = [];
    this.userScope = 'own_branch';
    this.approvalLimit = null;
    this.hasElevatedOverride = false;
    this.elevatedFields = [];
    this.effectivePermissions = null;

    [
      'userPermissions', 'rolePermissions', 'excludedPermissions', 'userRoles',
      'userScope', 'approvalLimit', 'hasElevatedOverride', 'elevatedFields',
      'effectivePermissions',
    ].forEach(k => localStorage.removeItem(k));

    window.dispatchEvent(new CustomEvent('permissions:cleared'));
  }
}

export const permissionService = new PermissionService();


class PermissionService {
  private permissions: string[] = [];
  private rolePermissions: Record<string, string[]> = {};
  private excludedPermissions: string[] = [];
  private userRoles: string[] = [];

  /**
   * Set permissions from login response
   */
  setPermissions(userData: any) {
    // Prefer permission_codes (effective: role-level + user-specific) when available,
    // fall back to roles_permission_codes (role-level only).
    const effectivePermissions =
      userData.permission_codes && userData.permission_codes.length > 0
        ? userData.permission_codes
        : userData.roles_permission_codes || [];
    this.permissions = effectivePermissions;
    this.rolePermissions = userData.role_permission_codes || {};
    this.excludedPermissions = userData.excluded_permission_codes || [];
    this.userRoles = userData.roles || [];

    localStorage.setItem('userPermissions', JSON.stringify(this.permissions));
    localStorage.setItem('rolePermissions', JSON.stringify(this.rolePermissions));
    localStorage.setItem('excludedPermissions', JSON.stringify(this.excludedPermissions));
    localStorage.setItem('userRoles', JSON.stringify(this.userRoles));

    // Dispatch event to notify components
    window.dispatchEvent(new CustomEvent('permissions:updated'));
  }

  /**
   * Get the current user's roles
   */
  getUserRoles(): string[] {
    if (this.userRoles.length === 0) {
      const stored = localStorage.getItem('userRoles');
      if (stored) {
        try {
          this.userRoles = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse stored userRoles', e);
        }
      }
    }
    return this.userRoles;
  }

  /**
   * Returns true only if the user has Director or Principal role.
   * Only superusers may delete records or approve requests.
   */
  isSuperUser(): boolean {
    const roles = this.getUserRoles();
    return roles.some(r => SUPERUSER_ROLES.includes(r));
  }

  /**
   * Get all permissions for the current user
   */
  getPermissions(): string[] {
    if (this.permissions.length === 0) {
      // Try to load from localStorage
      const stored = localStorage.getItem('userPermissions');
      if (stored) {
        try {
          this.permissions = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse stored permissions', e);
        }
      }
    }
    return this.permissions;
  }

  /**
   * Get explicitly excluded permission codes for the current user
   */
  getExcludedPermissions(): string[] {
    if (this.excludedPermissions.length === 0) {
      const stored = localStorage.getItem('excludedPermissions');
      if (stored) {
        try {
          this.excludedPermissions = JSON.parse(stored);
        } catch (e) {
          console.error('Failed to parse stored excludedPermissions', e);
        }
      }
    }
    return this.excludedPermissions;
  }

  /**
   * Get permissions for a specific role
   */
  getRolePermissions(roleName: string): string[] {
    // Try from memory first
    if (this.rolePermissions[roleName]) {
      return this.rolePermissions[roleName];
    }

    // Try from localStorage
    const stored = localStorage.getItem('rolePermissions');
    if (stored) {
      try {
        this.rolePermissions = JSON.parse(stored);
        return this.rolePermissions[roleName] || [];
      } catch (e) {
        console.error('Failed to parse rolePermissions', e);
      }
    }

    return [];
  }

  /**
   * Check if user has a specific permission.
   * A wildcard '*' grants access to everything unless the code is explicitly excluded.
   */
  hasPermission(permissionCode: string): boolean {
    // Exclusions take priority over wildcard grants
    if (this.getExcludedPermissions().includes(permissionCode)) {
      return false;
    }
    // Only Director / Principal may delete records or approve/reject requests
    if (!this.isSuperUser()) {
      if (
        permissionCode.endsWith('-delete') ||
        permissionCode.endsWith('-approve') ||
        permissionCode.endsWith('-bulk-approve') ||
        permissionCode.endsWith('-reject')
      ) {
        return false;
      }
    }
    const perms = this.getPermissions();
    return perms.includes('*') || perms.includes(permissionCode);
  }

  hasAnyPermission(permissionCodes: string[]): boolean {
    return permissionCodes.some(code => this.hasPermission(code));
  }

  hasAllPermissions(permissionCodes: string[]): boolean {
    return permissionCodes.every(code => this.hasPermission(code));
  }

  // In permissionService.ts, add this method temporarily
  debugPermissions() {
    console.log('🔍 Current permissions in service:', this.permissions);
    console.log('🔍 Current rolePermissions:', this.rolePermissions);
    console.log('🔍 Current excludedPermissions:', this.excludedPermissions);
    console.log('🔍 localStorage userPermissions:', localStorage.getItem('userPermissions'));
    console.log('🔍 localStorage rolePermissions:', localStorage.getItem('rolePermissions'));
    console.log(
      '🔍 localStorage excludedPermissions:',
      localStorage.getItem('excludedPermissions')
    );
  }

  /**
   * Clear all permissions (on logout)
   */
  // In permissionService.ts
  clearPermissions() {
    this.permissions = [];
    this.rolePermissions = {};
    this.excludedPermissions = [];
    this.userRoles = [];
    localStorage.removeItem('userPermissions');
    localStorage.removeItem('rolePermissions');
    localStorage.removeItem('excludedPermissions');
    localStorage.removeItem('userRoles');

    // Dispatch event to notify components
    window.dispatchEvent(new CustomEvent('permissions:cleared'));

    console.log('🗑️ Permissions cleared');
  }
}

// Create and export a singleton instance
export const permissionService = new PermissionService();
