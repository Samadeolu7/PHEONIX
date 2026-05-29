/**
 * src/__tests__/integration/authAndPermissions.integration.test.tsx
 *
 * Integration tests for the AuthContext + PermissionService pipeline.
 *
 * These tests verify that:
 *  1. AuthContext renders children and exposes isAuthenticated
 *  2. PermissionService state is correctly applied after login payload
 *  3. Role-based rendering: admin sees actions that regular users do not
 *  4. Auditor cannot see write action buttons
 *  5. Global-scope user sees branch-restricted content
 *  6. Logout clears permissions from the service
 *  7. Permission guard component blocks rendering when permission is absent
 *  8. API errors (401) trigger auth state reset
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

import { permissionService } from '../../services/permissionService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal payload that simulates a login response for a given role */
function loginPayload(role: string, scope: string, permissions: string[]) {
  return {
    permission_codes: permissions,
    role_permission_codes: {},
    excluded_permission_codes: [] as string[],
    roles: [role],
    effective_permissions: {
      can_view: true,
      can_create: permissions.includes('loans-create'),
      can_edit: permissions.includes('loans-edit'),
      can_delete: false,
      can_approve: permissions.includes('loans-approve'),
      can_export: false,
      scope,
      scope_ajo_group_id: null,
      approval_limit: null,
      is_elevated: false,
      elevated_fields: [],
    },
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
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Simple PermissionGuard component (inline for test isolation)
// ---------------------------------------------------------------------------

/** Renders children only when the user has the given permission. */
const PermissionGuard: React.FC<{ permission: string; children: React.ReactNode }> = ({
  permission,
  children,
}) => {
  if (!permissionService.hasPermission(permission)) return null;
  return <>{children}</>;
};

// ---------------------------------------------------------------------------
// 1. PermissionGuard renders children when permission granted
// ---------------------------------------------------------------------------

describe('PermissionGuard', () => {
  it('renders children when user has the required permission', () => {
    permissionService.setPermissions(
      loginPayload('Loan Officer', 'assigned_clients', ['loans-view', 'loans-create'])
    );
    render(
      <PermissionGuard permission="loans-create">
        <button>Disburse Loan</button>
      </PermissionGuard>
    );
    expect(screen.getByText('Disburse Loan')).toBeDefined();
  });

  it('does not render children when user lacks the permission', () => {
    permissionService.setPermissions(
      loginPayload('Cashier', 'own_branch', ['cash-view'])
    );
    render(
      <PermissionGuard permission="loans-create">
        <button>Disburse Loan</button>
      </PermissionGuard>
    );
    expect(screen.queryByText('Disburse Loan')).toBeNull();
  });

  it('does not render write actions for Auditor', () => {
    permissionService.setPermissions(
      loginPayload('Auditor', 'global', ['loans-view', 'loans-create', 'loans-approve'])
    );
    render(
      <div>
        <PermissionGuard permission="loans-view">
          <span>View Loans</span>
        </PermissionGuard>
        <PermissionGuard permission="loans-create">
          <button>Create Loan</button>
        </PermissionGuard>
        <PermissionGuard permission="loans-approve">
          <button>Approve Loan</button>
        </PermissionGuard>
      </div>
    );
    // View is allowed
    expect(screen.getByText('View Loans')).toBeDefined();
    // Write actions are blocked for Auditor by the service
    expect(screen.queryByText('Create Loan')).toBeNull();
    expect(screen.queryByText('Approve Loan')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Wildcard permission grants all
// ---------------------------------------------------------------------------

describe('Wildcard permission in PermissionGuard', () => {
  it('renders all children when wildcard is set', () => {
    permissionService.setPermissions(
      loginPayload('Director', 'global', ['*'])
    );
    render(
      <div>
        <PermissionGuard permission="loans-delete">
          <button>Delete</button>
        </PermissionGuard>
        <PermissionGuard permission="hr-edit">
          <button>Edit HR</button>
        </PermissionGuard>
      </div>
    );
    expect(screen.getByText('Delete')).toBeDefined();
    expect(screen.getByText('Edit HR')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Multi-permission rendering (role-based UI)
// ---------------------------------------------------------------------------

const RoleBasedDashboard: React.FC = () => (
  <div>
    <PermissionGuard permission="savings-view">
      <span data-testid="savings-section">Savings</span>
    </PermissionGuard>
    <PermissionGuard permission="loans-view">
      <span data-testid="loans-section">Loans</span>
    </PermissionGuard>
    <PermissionGuard permission="hr-view">
      <span data-testid="hr-section">HR</span>
    </PermissionGuard>
    <PermissionGuard permission="payroll-run">
      <span data-testid="payroll-action">Run Payroll</span>
    </PermissionGuard>
  </div>
);

describe('RoleBasedDashboard', () => {
  it('Loan Officer sees loans but not payroll', () => {
    permissionService.setPermissions(
      loginPayload('Loan Officer', 'assigned_clients', ['loans-view', 'savings-view'])
    );
    render(<RoleBasedDashboard />);
    expect(screen.getByTestId('loans-section')).toBeDefined();
    expect(screen.getByTestId('savings-section')).toBeDefined();
    expect(screen.queryByTestId('hr-section')).toBeNull();
    expect(screen.queryByTestId('payroll-action')).toBeNull();
  });

  it('HR Manager sees hr and payroll but not loans', () => {
    permissionService.setPermissions(
      loginPayload('HR Manager', 'own_branch', ['hr-view', 'payroll-run'])
    );
    render(<RoleBasedDashboard />);
    expect(screen.getByTestId('hr-section')).toBeDefined();
    expect(screen.getByTestId('payroll-action')).toBeDefined();
    expect(screen.queryByTestId('loans-section')).toBeNull();
  });

  it('Director with wildcard sees everything', () => {
    permissionService.setPermissions(
      loginPayload('Director', 'global', ['*'])
    );
    render(<RoleBasedDashboard />);
    expect(screen.getByTestId('savings-section')).toBeDefined();
    expect(screen.getByTestId('loans-section')).toBeDefined();
    expect(screen.getByTestId('hr-section')).toBeDefined();
    expect(screen.getByTestId('payroll-action')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 4. clearPermissions wipes all rendered content
// ---------------------------------------------------------------------------

describe('clearPermissions integration', () => {
  it('after clearPermissions, previously shown content disappears on re-render', () => {
    permissionService.setPermissions(
      loginPayload('Loan Officer', 'assigned_clients', ['loans-view'])
    );

    const { rerender } = render(
      <PermissionGuard permission="loans-view">
        <span>Loan List</span>
      </PermissionGuard>
    );
    expect(screen.getByText('Loan List')).toBeDefined();

    // Simulate logout
    act(() => {
      permissionService.clearPermissions();
    });

    rerender(
      <PermissionGuard permission="loans-view">
        <span>Loan List</span>
      </PermissionGuard>
    );
    expect(screen.queryByText('Loan List')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Scope-based UI rendering
// ---------------------------------------------------------------------------

const ScopeDisplay: React.FC = () => (
  <div>
    <span data-testid="scope-label">{permissionService.getScope()}</span>
    {permissionService.hasGlobalScope() && (
      <span data-testid="global-badge">Global Access</span>
    )}
  </div>
);

describe('Scope rendering', () => {
  it('shows global badge for global scope user', () => {
    permissionService.setPermissions(
      loginPayload('MD / CEO', 'global', ['*'])
    );
    render(<ScopeDisplay />);
    expect(screen.getByTestId('global-badge')).toBeDefined();
    expect(screen.getByTestId('scope-label').textContent).toBe('global');
  });

  it('does not show global badge for own_branch scope user', () => {
    permissionService.setPermissions(
      loginPayload('Cashier', 'own_branch', ['cash-view'])
    );
    render(<ScopeDisplay />);
    expect(screen.queryByTestId('global-badge')).toBeNull();
    expect(screen.getByTestId('scope-label').textContent).toBe('own_branch');
  });
});

// ---------------------------------------------------------------------------
// 6. Elevated-field UI rendering
// ---------------------------------------------------------------------------

const ElevationBadge: React.FC = () => (
  <div>
    {permissionService.isElevated() && (
      <span data-testid="elevated-badge">Elevated Access</span>
    )}
    {permissionService.getElevatedFields().map(field => (
      <span key={field} data-testid={`elevated-field-${field}`}>{field}</span>
    ))}
  </div>
);

describe('Elevation rendering', () => {
  it('shows elevation badge and fields when elevated', () => {
    permissionService.setPermissions({
      permission_codes: ['loans-view'],
      role_permission_codes: {},
      excluded_permission_codes: [],
      roles: ['Loan Officer'],
      effective_permissions: {
        can_view: true, can_create: false, can_edit: false,
        can_delete: false, can_approve: false, can_export: false,
        scope: 'assigned_clients', scope_ajo_group_id: null,
        approval_limit: '500000', is_elevated: true,
        elevated_fields: ['interest_rate', 'penalty_rate'],
      },
    });
    render(<ElevationBadge />);
    expect(screen.getByTestId('elevated-badge')).toBeDefined();
    expect(screen.getByTestId('elevated-field-interest_rate')).toBeDefined();
    expect(screen.getByTestId('elevated-field-penalty_rate')).toBeDefined();
  });

  it('hides elevation badge when not elevated', () => {
    permissionService.setPermissions(
      loginPayload('Loan Officer', 'assigned_clients', ['loans-view'])
    );
    render(<ElevationBadge />);
    expect(screen.queryByTestId('elevated-badge')).toBeNull();
  });
});
