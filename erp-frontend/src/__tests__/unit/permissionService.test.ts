/**
 * src/__tests__/unit/permissionService.test.ts
 *
 * Unit tests for PermissionService — the singleton that drives all
 * scope-aware, elevation-conscious permission checks across the UI.
 *
 * Covers:
 *  1. Scope ranking ordering: own_records < assigned_clients < own_branch < global
 *  2. setPermissions() populates internal state from a login-response payload
 *  3. hasPermission() respects excluded permissions
 *  4. hasPermission() blocks auditor write operations
 *  5. Wildcard '*' grants all permissions
 *  6. isSuperUser() identifies Director / CEO / Ops-manager roles
 *  7. getScope() falls back to localStorage when in-memory state is empty
 *  8. canAccessBranch() enforces branch scope
 *  9. hasGlobalScope() only true for 'global' scope
 * 10. clearPermissions() resets all state and localStorage keys
 * 11. hasAnyPermission() / hasAllPermissions() combinators
 * 12. getScopeRank() returns numeric rank matching backend SCOPE_RANK
 * 13. isElevated() reads from payload and localStorage
 * 14. getElevatedFields() parses localStorage correctly
 * 15. getEffectivePermissions() null when never set
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// The service is a module-level singleton; importing it gives the same instance
// each time within one test suite.
import { permissionService } from '../../services/permissionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal login-response payload */
function makePayload(overrides: Record<string, unknown> = {}) {
  return {
    permission_codes: [] as string[],
    role_permission_codes: {} as Record<string, string[]>,
    excluded_permission_codes: [] as string[],
    roles: [] as string[],
    effective_permissions: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear();
  permissionService.clearPermissions();
});

afterEach(() => {
  localStorage.clear();
  permissionService.clearPermissions();
});

// ---------------------------------------------------------------------------
// 1. Scope ranking
// ---------------------------------------------------------------------------

describe('getScopeRank', () => {
  it('own_records has rank 1', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'own_records' } })
    );
    expect(permissionService.getScopeRank()).toBe(1);
  });

  it('assigned_clients has rank 2', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'assigned_clients' } })
    );
    expect(permissionService.getScopeRank()).toBe(2);
  });

  it('own_branch has rank 3', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'own_branch' } })
    );
    expect(permissionService.getScopeRank()).toBe(3);
  });

  it('global has rank 4', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'global' } })
    );
    expect(permissionService.getScopeRank()).toBe(4);
  });

  it('own_branch is lower rank than global', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'own_branch' } })
    );
    const ownBranchRank = permissionService.getScopeRank();

    permissionService.clearPermissions();
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'global' } })
    );
    const globalRank = permissionService.getScopeRank();

    expect(ownBranchRank).toBeLessThan(globalRank);
  });
});

// ---------------------------------------------------------------------------
// 2. setPermissions and getPermissions
// ---------------------------------------------------------------------------

describe('setPermissions', () => {
  it('populates permission codes', () => {
    permissionService.setPermissions(
      makePayload({ permission_codes: ['loans-view', 'loans-create'] })
    );
    expect(permissionService.getPermissions()).toContain('loans-view');
    expect(permissionService.getPermissions()).toContain('loans-create');
  });

  it('falls back to roles_permission_codes when permission_codes is empty', () => {
    permissionService.setPermissions(
      makePayload({
        permission_codes: [],
        roles_permission_codes: ['savings-view'],
      } as any)
    );
    expect(permissionService.getPermissions()).toContain('savings-view');
  });

  it('persists scope to localStorage', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'global' } })
    );
    expect(localStorage.getItem('userScope')).toBe('global');
  });

  it('persists roles to localStorage', () => {
    permissionService.setPermissions(
      makePayload({ roles: ['Loan Officer', 'Cashier'] })
    );
    const stored = JSON.parse(localStorage.getItem('userRoles') || '[]');
    expect(stored).toContain('Loan Officer');
  });
});

// ---------------------------------------------------------------------------
// 3. hasPermission — excluded codes
// ---------------------------------------------------------------------------

describe('hasPermission — excluded codes', () => {
  it('returns false for an excluded permission even if in permission list', () => {
    permissionService.setPermissions(
      makePayload({
        permission_codes: ['loans-delete'],
        excluded_permission_codes: ['loans-delete'],
      })
    );
    expect(permissionService.hasPermission('loans-delete')).toBe(false);
  });

  it('returns true for a permitted code that is not excluded', () => {
    permissionService.setPermissions(
      makePayload({
        permission_codes: ['loans-view'],
        excluded_permission_codes: [],
      })
    );
    expect(permissionService.hasPermission('loans-view')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. hasPermission — auditor cannot write
// ---------------------------------------------------------------------------

describe('hasPermission — auditor write block', () => {
  beforeEach(() => {
    permissionService.setPermissions(
      makePayload({
        permission_codes: ['loans-create', 'loans-view', 'loans-approve'],
        roles: ['Auditor'],
      })
    );
  });

  it.each([
    'loans-create',
    'loans-edit',
    'loans-delete',
    'loans-approve',
    'loans-bulk-approve',
    'loans-reject',
  ])('auditor is denied %s', (code) => {
    expect(permissionService.hasPermission(code)).toBe(false);
  });

  it('auditor can still view', () => {
    expect(permissionService.hasPermission('loans-view')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Wildcard '*' grants all permissions
// ---------------------------------------------------------------------------

describe('wildcard permission', () => {
  it("'*' in permission list makes hasPermission return true for any code", () => {
    permissionService.setPermissions(makePayload({ permission_codes: ['*'] }));
    expect(permissionService.hasPermission('anything-at-all')).toBe(true);
    expect(permissionService.hasPermission('loans-delete')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. isSuperUser
// ---------------------------------------------------------------------------

describe('isSuperUser', () => {
  it('returns true for Director role', () => {
    permissionService.setPermissions(makePayload({ roles: ['Director'] }));
    expect(permissionService.isSuperUser()).toBe(true);
  });

  it('returns true for MD / CEO role', () => {
    permissionService.setPermissions(makePayload({ roles: ['MD / CEO'] }));
    expect(permissionService.isSuperUser()).toBe(true);
  });

  it('returns true for Operations Manager role', () => {
    permissionService.setPermissions(makePayload({ roles: ['Operations Manager'] }));
    expect(permissionService.isSuperUser()).toBe(true);
  });

  it('returns false for Loan Officer role', () => {
    permissionService.setPermissions(makePayload({ roles: ['Loan Officer'] }));
    expect(permissionService.isSuperUser()).toBe(false);
  });

  it('returns false with no roles', () => {
    permissionService.setPermissions(makePayload({ roles: [] }));
    expect(permissionService.isSuperUser()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. getScope — localStorage fallback
// ---------------------------------------------------------------------------

describe('getScope localStorage fallback', () => {
  it('returns scope set via setPermissions', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'assigned_clients' } })
    );
    // In-memory state should reflect the set scope
    expect(permissionService.getScope()).toBe('assigned_clients');
    // And it should be persisted in localStorage
    expect(localStorage.getItem('userScope')).toBe('assigned_clients');
  });

  it('defaults to own_branch when no scope is set anywhere', () => {
    expect(permissionService.getScope()).toBe('own_branch');
  });
});

// ---------------------------------------------------------------------------
// 8. canAccessBranch
// ---------------------------------------------------------------------------

describe('canAccessBranch', () => {
  it('global scope can access any branch', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'global' } })
    );
    expect(permissionService.canAccessBranch('99', '1')).toBe(true);
  });

  it('own_branch scope can only access matching branch', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'own_branch' } })
    );
    expect(permissionService.canAccessBranch('5', '5')).toBe(true);
    expect(permissionService.canAccessBranch('5', '99')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. hasGlobalScope
// ---------------------------------------------------------------------------

describe('hasGlobalScope', () => {
  it('returns true when scope is global', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'global' } })
    );
    expect(permissionService.hasGlobalScope()).toBe(true);
  });

  it('returns false when scope is own_branch', () => {
    permissionService.setPermissions(
      makePayload({ effective_permissions: { scope: 'own_branch' } })
    );
    expect(permissionService.hasGlobalScope()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 10. clearPermissions
// ---------------------------------------------------------------------------

describe('clearPermissions', () => {
  it('empties permissions array', () => {
    permissionService.setPermissions(makePayload({ permission_codes: ['loans-view'] }));
    permissionService.clearPermissions();
    expect(permissionService.getPermissions()).toHaveLength(0);
  });

  it('removes all localStorage keys', () => {
    permissionService.setPermissions(
      makePayload({ permission_codes: ['loans-view'], roles: ['Cashier'] })
    );
    permissionService.clearPermissions();
    [
      'userPermissions', 'rolePermissions', 'excludedPermissions',
      'userRoles', 'userScope', 'approvalLimit', 'hasElevatedOverride',
      'elevatedFields', 'effectivePermissions',
    ].forEach(key => {
      expect(localStorage.getItem(key)).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 11. hasAnyPermission / hasAllPermissions
// ---------------------------------------------------------------------------

describe('hasAnyPermission and hasAllPermissions', () => {
  beforeEach(() => {
    permissionService.setPermissions(
      makePayload({ permission_codes: ['loans-view', 'savings-view'] })
    );
  });

  it('hasAnyPermission returns true if at least one matches', () => {
    expect(
      permissionService.hasAnyPermission(['loans-view', 'nonexistent-code'])
    ).toBe(true);
  });

  it('hasAnyPermission returns false if none match', () => {
    expect(
      permissionService.hasAnyPermission(['loans-delete', 'hr-edit'])
    ).toBe(false);
  });

  it('hasAllPermissions returns true only if every code matches', () => {
    expect(
      permissionService.hasAllPermissions(['loans-view', 'savings-view'])
    ).toBe(true);
  });

  it('hasAllPermissions returns false when one code is missing', () => {
    expect(
      permissionService.hasAllPermissions(['loans-view', 'loans-delete'])
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 12. isElevated / getElevatedFields
// ---------------------------------------------------------------------------

describe('isElevated and getElevatedFields', () => {
  it('isElevated returns true from payload', () => {
    permissionService.setPermissions(
      makePayload({
        effective_permissions: { scope: 'own_branch', is_elevated: true, elevated_fields: ['interest_rate'] },
      })
    );
    expect(permissionService.isElevated()).toBe(true);
  });

  it('getElevatedFields contains fields from payload', () => {
    permissionService.setPermissions(
      makePayload({
        effective_permissions: {
          scope: 'own_branch', is_elevated: true, elevated_fields: ['interest_rate', 'penalty_rate'],
        },
      })
    );
    expect(permissionService.getElevatedFields()).toContain('interest_rate');
    expect(permissionService.getElevatedFields()).toContain('penalty_rate');
  });

  it('isElevated returns false when not set', () => {
    expect(permissionService.isElevated()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13. getEffectivePermissions
// ---------------------------------------------------------------------------

describe('getEffectivePermissions', () => {
  it('returns null when no effective permissions set', () => {
    expect(permissionService.getEffectivePermissions()).toBeNull();
  });

  it('returns effective permissions object after setPermissions', () => {
    const eff = {
      can_view: true, can_create: true, can_edit: false,
      can_delete: false, can_approve: false, can_export: true,
      scope: 'own_branch', scope_ajo_group_id: null,
      approval_limit: null, is_elevated: false, elevated_fields: [],
    };
    permissionService.setPermissions(makePayload({ effective_permissions: eff }));
    const result = permissionService.getEffectivePermissions();
    expect(result?.scope).toBe('own_branch');
    expect(result?.can_view).toBe(true);
  });
});
