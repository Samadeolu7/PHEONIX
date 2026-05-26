// Central hook for approval authority checks.
// Any component that renders approve/reject buttons should call this hook.
// To change who can approve system-wide, edit APPROVER_ROLES in types/roles.ts.

import { canApprove } from '../types/roles';
import { useAuth } from '../contexts/AuthContext';

export function useApprovalGuard(): { canUserApprove: boolean } {
  const { selectedRole } = useAuth();
  return { canUserApprove: canApprove(selectedRole) };
}
