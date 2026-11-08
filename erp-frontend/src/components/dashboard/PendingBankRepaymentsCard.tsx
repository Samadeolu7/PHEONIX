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

  if (!data || data.count === 0) return null;

  // Red while anything is unclaimed; amber once everything has an owner.
  const accent = data.unclaimed_count > 0 ? '#f87171' : '#fbbf24';
  const open = (kind: PendingRepaymentKind) => navigate(`/loans/pending-bank-repayments?kind=${kind}`);
  const mineToExplain = data.erp_only.recorded_by_me_count;

  return (
    <div
      className="w-full rounded-xl p-4"
      style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.10)', borderLeft: `4px solid ${accent}` }}
    >
      <p className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
        <Landmark className="h-3.5 w-3.5" style={{ color: accent }} />
        Pending bank repayments · branch
        {data.oldest_days !== null && <span className="ml-auto">Oldest: {data.oldest_days}d</span>}
      </p>
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
