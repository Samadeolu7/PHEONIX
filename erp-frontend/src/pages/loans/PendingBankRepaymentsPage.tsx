/**
 * Pending Bank Repayments
 *
 * Open repayment gaps found by statement reconciliation, visible to every
 * member of the branch:
 *   In bank, not recorded (bank_only) — whoever recognises the payer takes the
 *     line and records the repayment in Loan Collection.
 *   Recorded, not in bank (erp_only) — a repayment was entered in the ERP but
 *     the money never arrived; the officer who recorded it (or whoever takes
 *     it) follows up — deposit the cash, or report the bank reference.
 * Lines clear automatically the next time the statement is reconciled and
 * both sides match.
 * Data: /api/banks/pending-repayments/ (banks/views.py::PendingRepaymentsView).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Landmark, RefreshCw } from 'lucide-react';
import {
  pendingRepaymentService,
  PendingRepayment,
  PendingRepaymentKind,
  PendingRepaymentStatus,
  PendingRepaymentTotals,
} from '../../services/pendingRepaymentService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useToast } from '../../hooks/useToast';

const KINDS: { key: PendingRepaymentKind; label: string; help: React.ReactNode }[] = [
  {
    key: 'bank_only',
    label: 'In bank, not recorded',
    help: (
      <>
        Money reached your branch&apos;s bank account but no repayment was recorded. If you recognise the
        payer, click <strong>I&apos;ll handle this</strong> so nobody records it twice, then record the
        repayment in Loan Collection.
      </>
    ),
  },
  {
    key: 'erp_only',
    label: 'Recorded, not in bank',
    help: (
      <>
        A repayment was recorded in the system but the money never showed up in the bank. The officer who
        recorded it should deposit the cash or tell a manager the bank reference. Click{' '}
        <strong>I&apos;ll handle this</strong> to show you&apos;re following it up.
      </>
    ),
  },
];

const TABS: { key: PendingRepaymentStatus; label: string }[] = [
  { key: 'unclaimed', label: 'Not taken' },
  { key: 'mine', label: 'Mine' },
  { key: 'claimed', label: 'Taken' },
  { key: 'all', label: 'All' },
];

function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function initialKind(): PendingRepaymentKind {
  const k = new URLSearchParams(window.location.search).get('kind');
  return k === 'erp_only' ? 'erp_only' : 'bank_only';
}

const PendingBankRepaymentsPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [kind, setKind] = useState<PendingRepaymentKind>(initialKind);
  const [tab, setTab] = useState<PendingRepaymentStatus>('unclaimed');
  const [rows, setRows] = useState<PendingRepayment[]>([]);
  const [totals, setTotals] = useState<PendingRepaymentTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await pendingRepaymentService.list(kind, tab);
      setRows(data.results);
      setTotals(data.totals);
      setLoadError(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load pending repayments');
    } finally {
      setLoading(false);
    }
  }, [kind, tab]);

  useEffect(() => { load(); }, [load]);

  const act = async (row: PendingRepayment, action: 'claim' | 'release') => {
    setBusyId(row.id);
    try {
      if (action === 'claim') {
        await pendingRepaymentService.claim(row.id);
        success(
          row.kind === 'bank_only'
            ? 'Taken — now record the repayment in Loan Collection. This line clears at the next reconciliation.'
            : 'Taken — deposit the cash or give a manager the bank reference. This line clears at the next reconciliation.'
        );
      } else {
        await pendingRepaymentService.release(row.id);
        success('Released — someone else can take this line now.');
      }
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not update — please try again');
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const kindTotals = totals ? totals[kind] : null;
  const isErp = kind === 'erp_only';

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Landmark className="w-7 h-7 text-amber-600" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Pending Bank Repayments</h1>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>
      <p className="text-gray-600 mb-4">
        Repayments that don&apos;t match between the bank statement and the system for your branch. Each
        line disappears the next time the bank statement is reconciled and both sides agree.
      </p>

      {/* Which side of the gap */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {KINDS.map((k) => {
          const t = totals?.[k.key];
          const active = kind === k.key;
          return (
            <button
              key={k.key}
              onClick={() => setKind(k.key)}
              className={`rounded-lg border p-4 text-left transition ${
                active ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <p className="text-sm font-semibold text-gray-900">{k.label}</p>
              <p className="text-xl font-bold text-gray-900">
                {t ? `${t.count} · ${formatNaira(t.amount)}` : '—'}
              </p>
              {t && t.unclaimed_count > 0 && (
                <p className="text-xs text-red-600">{t.unclaimed_count} not taken by anyone</p>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-gray-600 mb-4">{KINDS.find((k) => k.key === kind)?.help}</p>

      {kindTotals && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat label="Pending" value={String(kindTotals.count)} sub={formatNaira(kindTotals.amount)} />
          <Stat
            label="Not taken by anyone"
            value={String(kindTotals.unclaimed_count)}
            sub={formatNaira(kindTotals.unclaimed_amount)}
            highlight={kindTotals.unclaimed_count > 0}
          />
          {isErp && totals ? (
            <Stat
              label="Recorded by me"
              value={String(totals.erp_only.recorded_by_me_count)}
              highlight={totals.erp_only.recorded_by_me_count > 0}
            />
          ) : (
            <Stat label="Taken by me" value={String(kindTotals.claimed_by_me_count)} />
          )}
          <Stat label="Oldest" value={kindTotals.oldest_days === null ? '—' : `${kindTotals.oldest_days} day(s)`} />
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px ${
              tab === t.key ? 'border-amber-600 text-amber-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loadError && <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{loadError}</div>}

      {!loading && !loadError && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">
          Nothing here.
        </div>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th className="px-4 py-2 font-medium">{isErp ? 'Recorded on' : 'Bank date'}</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium">{isErp ? 'ERP narration' : 'Narration (payer)'}</th>
                {isErp && <th className="px-4 py-2 font-medium">Recorded by</th>}
                <th className="px-4 py-2 font-medium">Bank account</th>
                <th className="px-4 py-2 font-medium">Taken by</th>
                <th className="px-4 py-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.id} className={`align-top ${row.recorded_by_me ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatDate(row.date)}
                    {row.days_pending !== null && (
                      <div className={`text-xs ${row.days_pending > 3 ? 'text-red-600' : 'text-gray-500'}`}>
                        {row.days_pending} day(s) ago
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatNaira(row.amount)}</td>
                  <td className="px-4 py-3 text-gray-800 min-w-[16rem] break-words">{row.narration || '—'}</td>
                  {isErp && (
                    <td className="px-4 py-3 text-gray-600">
                      {row.recorded_by_me ? (
                        <span className="font-semibold text-amber-700">You</span>
                      ) : (
                        row.recorded_by_name || <span className="text-gray-400">Unknown</span>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 text-gray-600">
                    {row.bank_account_name}
                    {row.branch_name && <div className="text-xs text-gray-400">{row.branch_name}</div>}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {row.claimed_by_name ? (
                      <>
                        <span className={row.claimed_by_me ? 'font-semibold text-amber-700' : ''}>
                          {row.claimed_by_me ? 'You' : row.claimed_by_name}
                        </span>
                        {row.claimed_at && <div className="text-xs text-gray-400">{formatDate(row.claimed_at)}</div>}
                      </>
                    ) : (
                      <span className="text-gray-400">Nobody yet</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!row.claimed_by && (
                      <button
                        disabled={busyId === row.id}
                        onClick={() => act(row, 'claim')}
                        className="text-sm text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                      >
                        I&apos;ll handle this
                      </button>
                    )}
                    {row.claimed_by_me && (
                      <div className="flex justify-end gap-2">
                        {row.kind === 'bank_only' && (
                          <button
                            onClick={() => navigate('/loans/collection')}
                            className="text-sm text-white bg-green-600 hover:bg-green-700 px-3 py-1.5 rounded-lg"
                          >
                            Record repayment
                          </button>
                        )}
                        <button
                          disabled={busyId === row.id}
                          onClick={() => act(row, 'release')}
                          className="text-sm text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-50 px-3 py-1.5 rounded-lg"
                        >
                          Release
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; sub?: string; highlight?: boolean }> = ({ label, value, sub, highlight }) => (
  <div className={`rounded-lg border p-4 ${highlight ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
    <p className="text-xs text-gray-500">{label}</p>
    <p className={`text-xl font-bold ${highlight ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
    {sub && <p className="text-xs text-gray-500">{sub}</p>}
  </div>
);

export default PendingBankRepaymentsPage;
