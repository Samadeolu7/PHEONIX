import { useAuth } from '../contexts/AuthContext';

/**
 * The branch the user is working in right now: the topbar branch switcher's
 * pick, else their home branch. Directors on "All branches" get null (no
 * single branch), so callers should not hide anything for them.
 *
 * Used by bank-account pickers on forms whose posting belongs to the current
 * branch (expenses, bank payments, petty cash, invoices, receivables).
 */
export function useWorkingBranchId(): number | null {
  const { user, activeBranch, isDirectorPlus } = useAuth();
  if (activeBranch?.id) return activeBranch.id;
  if (isDirectorPlus) return null;
  const home = (user as { branch_id?: string | number | null } | null)?.branch_id;
  const n = home == null || home === '' ? NaN : Number(home);
  return Number.isFinite(n) ? n : null;
}

export default useWorkingBranchId;
