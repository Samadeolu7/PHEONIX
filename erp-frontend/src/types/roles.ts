// Role definitions for Phoenix ERP System
// Based on Phoenix Software Access Table requirements

export type UserRole = 'Director' | 'Principal' | 'Administrator' | 'Registrar' | 'Officer';

export interface RoleOption {
  value: UserRole;
  label: string;
  description: string;
}

export const AVAILABLE_ROLES: RoleOption[] = [
  {
    value: 'Director',
    label: 'Director',
    description: 'Full system access and administrative privileges',
  },
  {
    value: 'Principal',
    label: 'Principal',
    description: 'Academic and administrative oversight',
  },
  {
    value: 'Administrator',
    label: 'Administrator',
    description: 'Full navigation access — cannot approve or delete records',
  },
  {
    value: 'Registrar',
    label: 'Registrar',
    description: 'Student records and academic administration',
  },
  {
    value: 'Officer',
    label: 'Officer',
    description: 'Operational tasks and data entry',
  },
];

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
// Edit this list to change who can approve requests system-wide.
// All approval UIs import from here — this is the single source of truth.
export const APPROVER_ROLES: UserRole[] = ['Director', 'Principal'];

export const canApprove = (role: UserRole | null | undefined): boolean => {
  if (!role) return false;
  return APPROVER_ROLES.includes(role);
};
