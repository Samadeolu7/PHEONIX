// src/services/permissionService.ts
//
// Scope-aware, elevation-conscious permission service.
// Reads from the login response and caches in localStorage.

import { getRoleRank } from '../types/roles';

// Superuser threshold — rank 4+ (Principal, Director) bypass fine-grained permission checks.
const SUPERUSER_MIN_RANK = 4;

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

// Shape of one entry in userData.page_permissions.pages, matching
// PermissionResolver.resolve_bulk_matrix()'s per-page output (permissions/services.py).
export interface PagePermission {
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
  can_export: boolean;
  scope: string;
  approval_limit: string | null;
}

export type PageAction = 'view' | 'create' | 'edit' | 'delete' | 'approve' | 'export';

const PAGE_ACTION_FLAG: Record<PageAction, keyof PagePermission> = {
  view: 'can_view',
  create: 'can_create',
  edit: 'can_edit',
  delete: 'can_delete',
  approve: 'can_approve',
  export: 'can_export',
};

interface PageMatrix {
  wildcard: boolean;
  legacyMode: boolean;
  pages: Record<string, PagePermission>;
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

  // Bulk module:page permission matrix (see PermissionResolver.resolve_bulk_matrix)
  private pageMatrix: PageMatrix = { wildcard: false, legacyMode: false, pages: {} };

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

    // Bulk module:page matrix (page_permissions.{wildcard,legacy_mode,pages})
    const rawMatrix = userData.page_permissions;
    if (rawMatrix && typeof rawMatrix === 'object') {
      this.pageMatrix = {
        wildcard: !!rawMatrix.wildcard,
        legacyMode: !!rawMatrix.legacy_mode,
        pages: rawMatrix.pages || {},
      };
    } else {
      this.pageMatrix = { wildcard: false, legacyMode: false, pages: {} };
    }
    localStorage.setItem('pageMatrix', JSON.stringify(this.pageMatrix));

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

  // ── Page-level (module:page) permission matrix ────────────────────────────

  private _getPageMatrix(): PageMatrix {
    if (this.pageMatrix.wildcard || this.pageMatrix.legacyMode || Object.keys(this.pageMatrix.pages).length > 0) {
      return this.pageMatrix;
    }
    const stored = localStorage.getItem('pageMatrix');
    if (stored) {
      try { this.pageMatrix = JSON.parse(stored); } catch { /* ignore */ }
    }
    return this.pageMatrix;
  }

  /** Full page permission map, keyed "module:page" — for nav-building consumers. */
  getPagePermissions(): Record<string, PagePermission> {
    return this._getPageMatrix().pages;
  }

  /**
   * Whether the user has can_view on ANY page within the given registry
   * module — for coarse, module-level nav surfaces (e.g. a dashboard tile
   * grouping several pages under one "Bank & Cash" tile) where checking one
   * specific page would be too narrow.
   */
  hasAnyPageAccessInModule(module: string): boolean {
    const matrix = this._getPageMatrix();
    if (matrix.wildcard || this.getPermissions().includes('*')) return true;
    if (matrix.legacyMode) return true; // legacy mode grants view broadly
    const prefix = `${module}:`;
    return Object.entries(matrix.pages).some(([key, perm]) => key.startsWith(prefix) && perm.can_view);
  }

  /**
   * Tri-state resolution for a module:page:action target:
   *  - 'allow' / 'deny': the matrix has a definite answer.
   *  - 'unknown': no matrix entry exists for this page at all (registry gap
   *    during migration — the page hasn't been added to PERMISSION_REGISTRY/
   *    synced to the backend Module/ModulePage catalog yet). Callers that
   *    still have a legacy fallback (like ProtectedRoute's requiredPermission
   *    prop) should use 'unknown' to decide whether to fall back; callers
   *    with no fallback should treat 'unknown' the same as 'deny'.
   */
  resolvePageAccess(module: string, page: string, action: PageAction = 'view'): 'allow' | 'deny' | 'unknown' {
    const matrix = this._getPageMatrix();
    if (matrix.wildcard || this.getPermissions().includes('*')) return 'allow';

    // Mirror the auditor write-block safety net already enforced in hasPermission().
    if (this.isAuditor() && action !== 'view' && action !== 'export') return 'deny';

    if (matrix.legacyMode) {
      // Mirrors PermissionResolver._legacy_mode_baseline: view/create/edit/delete
      // allowed, approve/export require explicit grants.
      return (action !== 'approve' && action !== 'export') ? 'allow' : 'deny';
    }

    const entry = matrix.pages[`${module}:${page}`];
    if (!entry) return 'unknown';
    return entry[PAGE_ACTION_FLAG[action]] ? 'allow' : 'deny';
  }

  /**
   * Whether the user can perform `action` (default 'view') on the given
   * module:page. This is the module:page counterpart to hasPermission(code)
   * — prefer this for anything derived from RolePermissionPolicy rather than
   * the legacy flat permission_codes vocabulary.
   *
   * Deliberately fails CLOSED on a matrix miss ('unknown' → false) — unlike
   * the backend's HasActionPermission, which fails open on resolver errors
   * as an operational safety net, a missing entry here means the page isn't
   * in the registry/matrix yet, and silently granting access would be worse
   * than a page briefly not appearing. Callers that need to distinguish
   * "denied" from "no entry yet" (e.g. for a legacy-code fallback during
   * migration) should call resolvePageAccess() directly instead.
   */
  hasPageAccess(module: string, page: string, action: PageAction = 'view'): boolean {
    return this.resolvePageAccess(module, page, action) === 'allow';
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
    return roles.some(r => getRoleRank(r) >= SUPERUSER_MIN_RANK);
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
    console.log('🗺️  page matrix:', this._getPageMatrix());
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
    this.pageMatrix = { wildcard: false, legacyMode: false, pages: {} };

    [
      'userPermissions', 'rolePermissions', 'excludedPermissions', 'userRoles',
      'userScope', 'approvalLimit', 'hasElevatedOverride', 'elevatedFields',
      'effectivePermissions', 'pageMatrix',
    ].forEach(k => localStorage.removeItem(k));

    window.dispatchEvent(new CustomEvent('permissions:cleared'));
  }
}

export const permissionService = new PermissionService();
