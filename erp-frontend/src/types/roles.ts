// Role definitions for Phoenix ERP System
// Roles are open strings (any name can be created in admin).
// Access control uses a numeric rank (1–5) instead of hardcoded name matching.

export type UserRole = string;

export interface RoleOption {
  value: string;
  label: string;
  description: string;
  rank: number;
}

export const AVAILABLE_ROLES: RoleOption[] = [
  {
    value: 'Director',
    label: 'Director',
    description: 'Full system access and administrative privileges',
    rank: 5,
  },
  {
    value: 'Principal',
    label: 'Principal',
    description: 'Full navigation — highest non-system rank',
    rank: 4,
  },
  {
    value: 'Branch Manager',
    label: 'Branch Manager',
    description: 'Full branch scope — microfinance-tenant equivalent of Principal',
    rank: 4,
  },
  {
    value: 'Administrator',
    label: 'Administrator',
    description: 'Full navigation access — cannot approve or delete records',
    rank: 3,
  },
  {
    value: 'Credit Officer',
    label: 'Credit Officer',
    description: 'Loan origination, client management, savings — data scoped to own portfolio',
    rank: 2,
  },
  {
    value: 'Finance Officer',
    label: 'Finance Officer',
    description: 'Financial operations and journal entries',
    rank: 2,
  },
  {
    value: 'Accountant',
    label: 'Accountant',
    description: 'Financial operations and journal entries',
    rank: 2,
  },
  {
    value: 'HR Officer',
    label: 'HR Officer',
    description: 'Human resources operations',
    rank: 2,
  },
  {
    value: 'HR Manager',
    label: 'HR Manager',
    description: 'Human resources management',
    rank: 2,
  },
  {
    value: 'Procurement Officer',
    label: 'Procurement Officer',
    description: 'Procurement and supplier management',
    rank: 2,
  },
  {
    value: 'Store Officer',
    label: 'Store Officer',
    description: 'Inventory and store management',
    rank: 2,
  },
  {
    value: 'Officer',
    label: 'Officer',
    description: 'General operational tasks',
    rank: 2,
  },
  {
    value: 'Registrar',
    label: 'Registrar',
    description: 'Client/student records and registration',
    rank: 1,
  },
];

// Rank lookup — normalises casing for resilience
const ROLE_RANK_MAP: Record<string, number> = Object.fromEntries(
  AVAILABLE_ROLES.map(r => [r.value.toLowerCase(), r.rank])
);

/** Return the numeric rank (1–5) for any role string. Unknown roles default to 1. */
export function getRoleRank(role: string | null | undefined): number {
  if (!role) return 0;
  return ROLE_RANK_MAP[role.toLowerCase()] ?? 1;
}

export interface UserWithRole {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  tenant_id: number | null;
  tenant_name: string | null;
  is_owner: boolean;
  is_staff: boolean;
  is_system_admin: boolean;
  is_active_user: boolean;
  branch_id: number | null;
  branch_name?: string | null;
  assigned_dashboard?: number | null;
  assigned_dashboard_id?: number | null;
  assigned_dashboard_slug?: string | null;
  roles: string[];
  permissions?: string[];
  // Temporary role selection (until backend integration)
  selectedRole?: UserRole;
}

export interface RoleSelectionData {
  selectedRole: UserRole;
  timestamp: Date;
}

// ─── Approval authority ───────────────────────────────────────────────────────
// Approvers are rank 4+ (Principal and Director).
export const APPROVER_MIN_RANK = 4;

export const canApprove = (role: UserRole | null | undefined): boolean =>
  getRoleRank(role) >= APPROVER_MIN_RANK;
