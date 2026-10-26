import React from 'react';
import { AlertTriangle, CalendarClock, CheckCircle2, ShieldAlert } from 'lucide-react';
import type { LiquidityAssessment } from '../../types/bankBorrowing';

const naira = (v: string | number | undefined | null) =>
  `₦${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (iso: string | null | undefined) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

interface Props {
  assessment: LiquidityAssessment;
  /** approval: speaks to the director deciding whether to override; disbursement: to the one releasing the cash. */
  stage: 'approval' | 'disbursement';
}

/**
 * Explains why a branch cannot fund a loan right now, how much it can lend today, when the full
 * amount becomes available, and which upcoming payments would be left short if the loan goes out.
 */
export const LiquidityImpactPanel: React.FC<Props> = ({ assessment: a, stage }) => {
  const shortfall = Number(a.shortfall_today ?? 0);
  const rate = Math.round(Number(a.collection_rate ?? 0) * 100);

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Loan amount</p>
          <p className="text-base font-semibold text-gray-900">{naira(a.amount)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">{a.branch_name} can lend today</p>
          <p className={`text-base font-semibold ${a.ok ? 'text-green-700' : 'text-amber-700'}`}>
            {naira(a.available_today)}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Full amount available</p>
          <p className="text-base font-semibold text-gray-900">
            {a.ok ? 'Now' : a.earliest_available_date ? day(a.earliest_available_date) : `Not within ${a.lookahead_days} days`}
          </p>
        </div>
      </div>

      {a.ok && !a.override && (
        <p className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="w-4 h-4" /> This branch can fund the loan without touching committed payments.
        </p>
      )}

      {!a.ok && shortfall > 0 && (
        <p className="flex items-start gap-2 text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            {stage === 'approval'
              ? `Approving now would need ${naira(shortfall)} more than the branch can safely lend.`
              : `Paying out now needs ${naira(shortfall)} more than the branch can safely lend.`}
          </span>
        </p>
      )}

      {a.breaches?.length > 0 && (
        <div>
          <p className="font-medium text-gray-900 mb-2 flex items-center gap-2">
            <CalendarClock className="w-4 h-4" />
            {stage === 'approval' ? 'If you override, these payments are at risk' : 'If you disburse, these payments are at risk'}
          </p>
          <ul className="space-y-2">
            {a.breaches.map((b) => (
              <li key={b.date} className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="font-medium text-red-800">
                  {day(b.date)} — {naira(b.shortfall)} short
                </p>
                <ul className="mt-1 list-disc list-inside text-red-700">
                  {b.obligations.map((o, i) => (
                    <li key={i}>
                      {o.description} — {naira(o.amount)}
                      {o.overdue ? ' (already overdue)' : ''}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-gray-600">
            To cover it, {a.branch_name} needs the shortfall collected from repayments or transferred in from another
            branch before the date shown.
          </p>
        </div>
      )}

      {a.advice?.length > 0 && (
        <ul className="list-disc list-inside text-gray-700 space-y-1">
          {a.advice.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      )}

      <p className="text-xs text-gray-500">
        Based on {a.branch_name}&apos;s cash and bank balance {naira(a.cash_now)}, {naira(a.committed_outflows_total)} of
        committed payments in the next {a.lookahead_days} days, and {naira(a.expected_inflows_total)} of expected
        repayments (counting {rate}% of what is due, based on how well this branch has collected recently
        {Number(a.expected_recovery_total ?? 0) > 0 ? `, including ${naira(a.expected_recovery_total)} expected from recovering old debt` : ''}).
      </p>

      {a.override && (
        <div className="rounded-lg border border-purple-200 bg-purple-50 p-3 text-purple-900">
          <p className="font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4" /> Approved under a director override
          </p>
          <p className="mt-1">
            {a.override.by ?? 'A director'} overrode the block when {naira(a.override.available_then)} was available.
            Reason: “{a.override.reason}”
          </p>
        </div>
      )}
    </div>
  );
};

export default LiquidityImpactPanel;
