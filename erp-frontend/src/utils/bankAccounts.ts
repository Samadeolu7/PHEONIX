/**
 * Bank accounts a payment for `branchId` may use: that branch's own accounts
 * plus company-wide ones (no branch). Money for one branch posted into another
 * branch's bank account lands on the wrong reconciliation, so the server
 * refuses it (TransactionEntry.clean / PaymentRoutingService) — the pickers
 * hide those accounts so nobody picks one by mistake.
 *
 * `branchId` null/undefined = branch not known yet → nothing is hidden.
 */
export function bankAccountsForBranch<T extends { owning_branch?: number | null }>(
  accounts: T[] | undefined | null,
  branchId: number | null | undefined,
): T[] {
  const list = accounts ?? [];
  if (branchId == null) return list;
  return list.filter((a) => a.owning_branch == null || a.owning_branch === branchId);
}

/**
 * GL accounts usable for a posting in `branchId` (the ledger requires every
 * line's account to be in the transaction's branch). Unknown branch on either
 * side → kept.
 */
export function glAccountsForBranch<T>(accounts: T[] | undefined | null, branchId: number | null | undefined): T[] {
  const list = accounts ?? [];
  if (branchId == null) return list;
  return list.filter((a) => {
    const b = (a as { branch_id?: number | null }).branch_id;
    return b == null || b === branchId;
  });
}

/** Branch id from a value that may be a number, a {id} object, or a string. */
export function branchIdOf(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof value === 'object' && 'id' in (value as Record<string, unknown>)) {
    return branchIdOf((value as { id: unknown }).id);
  }
  return null;
}
