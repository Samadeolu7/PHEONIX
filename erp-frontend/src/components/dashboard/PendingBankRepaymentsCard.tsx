/**
 * PendingBankRepaymentsCard
 *
 * Role-based dashboard notification for every member of a branch: open
 * repayment gaps from statement reconciliation — money in the bank with no
 * recorded repayment, and recorded repayments that never reached the bank.
 * Renders nothing when the branch has neither.
 * Data: /api/banks/pending-repayments/summary/ (banks/views.py::PendingRepaymentsSummaryView).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark } from 'lucide-react';
import {
  pendingRepaymentService,
  PendingRepaymentKind,
  PendingRepaymentKindTotals,
  PendingRepaymentTotals,
} from '../../services/pendingRepaymentService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useAutoRefresh } from '../../hooks/useAutoRefresh';

const AUTO_REFRESH_MS = 3 * 60_000;

export default function PendingBankRepaymentsCard() {
  const navigate = useNavigate();
  const [data, setData] = useState<PendingRepaymentTotals | null>(null);

  const load = useCallback(() => {
    pendingRepaymentService.summary().then(setData).catch(() => setData(null));
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, AUTO_REFRESH_MS, true);

  const hasWaitingCases = !!data?.cases &&
    (data.cases.to_review + data.cases.to_approve + data.cases.disputes_against_me) > 0;
  if (!data || (data.count === 0 && !hasWaitingCases)) return null;

  // Red while anything is unclaimed; amber once everything has an owner.
  const accent = data.unclaimed_count > 0 ? '#f87171' : '#fbbf24';
  const open = (kind: PendingRepaymentKind, branchId?: number | null) =>
    navigate(`/loans/pending-bank-repayments?kind=${kind}${branchId ? `&branch=${branchId}` : ''}`);
  const mineToExplain = data.erp_only.recorded_by_me_count;
  // More than one branch visible = director / global role: show where the gaps are.
  const branches = (data.by_branch ?? []).filter((b) => b.count > 0);
  const multiBranch = branches.length > 1;
  const waiting = data.cases;
  const waitingItems = [
    waiting?.to_approve ? { n: waiting.to_approve, label: 'waiting for your approval', tab: 'approve' } : null,
    waiting?.to_review ? { n: waiting.to_review, label: 'waiting for your review', tab: 'review' } : null,
    waiting?.disputes_against_me ? { n: waiting.disputes_against_me, label: 'dispute(s) about your payments — respond', tab: 'mine' } : null,
  ].filter(Boolean) as { n: number; label: string; tab: string }[];

  return (
    <div
      className="w-full rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderLeft: `4px solid ${accent}` }}
    >
      <p className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
        <Landmark className="h-3.5 w-3.5" style={{ color: accent }} />
        Pending bank repayments · {multiBranch ? 'all branches' : 'branch'}
        {data.oldest_days !== null && <span className="ml-auto">Oldest: {data.oldest_days}d</span>}
      </p>
      {waitingItems.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {waitingItems.map((w) => (
            <button
              key={w.tab}
              type="button"
              onClick={() => navigate(`/banks/reconciliations/resolutions?tab=${w.tab}`)}
              className="rounded-full px-3 py-1 text-xs font-semibold"
              style={{ background: 'rgba(251,191,36,0.18)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.4)' }}
            >
              {w.n} case(s) {w.label}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Side
          title="In bank, not recorded"
          totals={data.bank_only}
          hint="Check if any are your clients"
          onClick={() => open('bank_only')}
        />
        <Side
          title="Recorded, not in bank"
          totals={data.erp_only}
          hint={mineToExplain > 0 ? `${mineToExplain} recorded by you` : 'Deposit or explain'}
          urgent={mineToExplain > 0}
          onClick={() => open('erp_only')}
        />
      </div>
      {multiBranch && (
        <div className="mt-3 space-y-1">
          {branches.map((b) => (
            <button
              key={b.branch_id ?? 'none'}
              type="button"
              onClick={() => open(b.bank_only_count > 0 ? 'bank_only' : 'erp_only', b.branch_id)}
              className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1 text-left text-xs hover:bg-white/10"
              title={`Open ${b.branch_name}`}
            >
              <span className="truncate text-white">{b.branch_name}</span>
              <span style={{ color: 'rgba(255,255,255,0.65)' }} className="text-right">
                {b.bank_only_count} in bank · {b.erp_only_count} not in bank · {formatNaira(b.amount)}
                {b.unclaimed_count > 0 && <span style={{ color: '#f87171' }}> · {b.unclaimed_count} not taken</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Side({
  title, totals, hint, urgent, onClick,
}: {
  title: string;
  totals: PendingRepaymentKindTotals;
  hint: string;
  urgent?: boolean;
  onClick: () => void;
}) {
  const empty = totals.count === 0;
  const color = empty ? 'rgba(255,255,255,0.45)' : totals.unclaimed_count > 0 || urgent ? '#f87171' : '#fbbf24';
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg p-3 text-left"
      style={{ background: 'rgba(255,255,255,0.05)' }}
      title={`Open: ${title}`}
    >
      <p className="text-xs" style={{ color: 'rgba(255,255,255,0.70)' }}>{title}</p>
      <p className="text-xl font-black leading-tight" style={{ color }}>
        {empty ? 'None' : `${totals.count} · ${formatNaira(totals.amount)}`}
      </p>
      {!empty && (
        <p className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
          {totals.unclaimed_count > 0 ? `${totals.unclaimed_count} not taken · ` : ''}{hint}
        </p>
      )}
    </button>
  );
}
