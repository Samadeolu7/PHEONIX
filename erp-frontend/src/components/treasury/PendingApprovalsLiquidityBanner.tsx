import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { usePendingApprovalsHeadsUp } from '../../hooks/useBankBorrowings';
import type { PendingApprovalsHeadsUp } from '../../types/bankBorrowing';

function naira(v: string | number): string {
  const n = Number(v ?? 0);
  return `₦${(isNaN(n) ? 0 : n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  /** Limit to one branch (e.g. the loan being viewed). Omit for the approver's own branch / all branches for directors. */
  branchId?: number;
  /** Highlight this loan in the list (detail page). */
  currentLoanId?: number;
  enabled?: boolean;
  /** Start with the loan list expanded. */
  defaultExpanded?: boolean;
}

/**
 * Heads-up for approvers: when the loans waiting for approval in a branch add up to more than the branch
 * can lend today, approving one leaves less for the next. Lists the competing applications so the
 * approver can decide which to approve first, instead of finding out when later ones get blocked.
 */
export const PendingApprovalsLiquidityBanner: React.FC<Props> = ({
  branchId, currentLoanId, enabled = true, defaultExpanded = false,
}) => {
  const { data } = usePendingApprovalsHeadsUp(branchId, enabled);
  const flagged = (data?.branches ?? []).filter((b) => b.over_capacity);
  if (!flagged.length) return null;
  return (
    <div className="mb-4 space-y-3">
      {flagged.map((b) => (
        <BranchHeadsUp key={b.branch_id} heads={b} currentLoanId={currentLoanId} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  );
};

const BranchHeadsUp: React.FC<{ heads: PendingApprovalsHeadsUp; currentLoanId?: number; defaultExpanded: boolean }> = ({
  heads, currentLoanId, defaultExpanded,
}) => {
  const [open, setOpen] = useState(defaultExpanded);
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="flex-1">
          <p className="font-semibold">
            Prioritise approvals — {heads.branch_name} cannot fund every pending loan today
          </p>
          <p className="mt-1">{heads.message}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <span>Pending approval: <strong>{naira(heads.pending_total)}</strong> ({heads.pending_count})</span>
            <span>Available to lend today: <strong>{naira(heads.available_today)}</strong></span>
            <span>Short by: <strong className="text-red-700">{naira(heads.shortfall)}</strong></span>
          </div>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-800 hover:underline"
          >
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {open ? 'Hide' : 'Show'} the {heads.pending_count} pending loan{heads.pending_count !== 1 ? 's' : ''}
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-amber-200 bg-white">
              <table className="min-w-full text-xs text-gray-700">
                <thead className="bg-amber-100/60 text-left text-amber-900">
                  <tr>
                    <th className="px-3 py-2">Loan</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Waiting</th>
                    <th className="px-3 py-2">Today</th>
                  </tr>
                </thead>
                <tbody>
                  {heads.loans.map((l) => (
                    <tr key={l.loan_id} className={`border-t border-amber-100 ${l.loan_id === currentLoanId ? 'bg-amber-50 font-semibold' : ''}`}>
                      <td className="px-3 py-2">
                        <Link to={`/loans/accounts/${l.loan_id}`} className="text-blue-700 hover:underline">{l.loan_number}</Link>
                        {l.loan_id === currentLoanId && <span className="ml-1 text-amber-700">(this loan)</span>}
                      </td>
                      <td className="px-3 py-2">{l.client_name}</td>
                      <td className="px-3 py-2 text-right">{naira(l.amount)}</td>
                      <td className="px-3 py-2">
                        {l.days_waiting == null ? '—' : `${l.days_waiting} day${l.days_waiting === 1 ? '' : 's'}`}
                      </td>
                      <td className="px-3 py-2">
                        {l.fits_alone
                          ? <span className="text-green-700">Can be funded on its own</span>
                          : <span className="text-red-700">Too large for today's cash</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
