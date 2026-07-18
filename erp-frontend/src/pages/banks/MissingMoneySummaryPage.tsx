import React, { useEffect, useState } from 'react';
import { AlertTriangle, Banknote, MessageSquare, Sparkles, Users, X } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { BulkLinkBankChargeModal } from '../../components/banks/BulkLinkBankChargeModal';
import { CleanUpStrandedPairsModal } from '../../components/banks/CleanUpStrandedPairsModal';
import { CreateOfficerEvidenceThreadsModal } from '../../components/banks/CreateOfficerEvidenceThreadsModal';
import { useToast } from '../../hooks/useToast';
import type {
  MissingMoneyBankAccountRow,
  MissingMoneyOfficerRow,
  MissingMoneySummary,
  ReconciliationException,
} from '../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

type DrilldownTarget =
  | { kind: 'officer'; id: number | 'unattributed'; label: string }
  | { kind: 'bank_account'; id: number; label: string };

/**
 * How much is actually missing right now, and from whom — unresolved
 * erp_only (attributable to the officer who recorded it) and bank_only
 * (attributable to the bank account) totals, each broken down and
 * clickable through to the underlying list. See MissingMoneySummaryView
 * (banks/views.py).
 */
const MissingMoneySummaryPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [summary, setSummary] = useState<MissingMoneySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [drilldown, setDrilldown] = useState<DrilldownTarget | null>(null);
  const [drilldownRows, setDrilldownRows] = useState<ReconciliationException[] | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);

  const [bulkLinkTarget, setBulkLinkTarget] = useState<{ id: number; name: string } | null>(null);
  const [showCleanUpModal, setShowCleanUpModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await reconciliationService.getMissingMoneySummary({
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load the missing money summary');
    } finally {
      setLoading(false);
    }
  };

  const openOfficerDrilldown = (row: MissingMoneyOfficerRow) => {
    setDrilldown({ kind: 'officer', id: row.officer_id ?? 'unattributed', label: row.officer_name });
  };

  const openBankAccountDrilldown = (row: MissingMoneyBankAccountRow) => {
    setDrilldown({
      kind: 'bank_account',
      id: row.bank_account_id,
      label: row.bank_account_name || `Account #${row.bank_account_id}`,
    });
  };

  useEffect(() => {
    if (!drilldown) {
      setDrilldownRows(null);
      return;
    }
    let cancelled = false;
    setDrilldownLoading(true);
    setDrilldownError(null);
    const promise =
      drilldown.kind === 'officer'
        ? reconciliationService.getMissingMoneyByOfficer(drilldown.id as number | 'unattributed')
        : reconciliationService.getMissingMoneyByBankAccount(drilldown.id as number);
    promise
      .then((rows) => {
        if (!cancelled) setDrilldownRows(rows);
      })
      .catch((err: any) => {
        if (!cancelled) setDrilldownError(err.message || 'Failed to load the detail list');
      })
      .finally(() => {
        if (!cancelled) setDrilldownLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [drilldown]);

  const totals = summary?.totals;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-7 h-7 text-red-600" />
          <h1 className="text-3xl font-bold text-gray-900">Missing Money Summary</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCleanUpModal(true)}
            className="flex items-center gap-1.5 text-sm text-amber-700 bg-amber-50 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100"
          >
            <Sparkles className="w-4 h-4" />
            Clean Up Stranded Pairs
          </button>
          <button
            onClick={() => setShowEvidenceModal(true)}
            className="flex items-center gap-1.5 text-sm text-purple-700 bg-purple-50 border border-purple-300 px-3 py-1.5 rounded-lg hover:bg-purple-100"
          >
            <MessageSquare className="w-4 h-4" />
            Request Evidence From Officers
          </button>
        </div>
      </div>
      <p className="text-gray-600 mb-6">
        Every unresolved bank_only and erp_only exception, totalled and broken down by who
        recorded it (erp_only) or which bank account it's on (bank_only). Click a row to see
        the underlying list. amount_diff is excluded — it already has a matched counterpart
        with a captured discrepancy, not genuinely missing money.
      </p>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {!loading && !error && totals && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">ERP recorded, never hit the bank</p>
              <p className="text-2xl font-bold text-amber-600">{formatAmount(totals.erp_only.amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{totals.erp_only.count} exception(s)</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">In the bank, no ERP record</p>
              <p className="text-2xl font-bold text-red-600">{formatAmount(totals.bank_only.amount)}</p>
              <p className="text-xs text-gray-500 mt-1">{totals.bank_only.count} exception(s)</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Grand total</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(totals.grand_total_amount)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                <Users className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">By Officer (ERP-only)</h2>
              </div>
              {summary.by_officer.length === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-6 text-center">Nothing outstanding.</p>
              ) : (
                <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                  {summary.by_officer.map((row) => (
                    <li key={row.officer_id ?? 'unattributed'}>
                      <button
                        onClick={() => openOfficerDrilldown(row)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                      >
                        <span className="min-w-0">
                          <span
                            className={`block text-sm font-medium truncate ${
                              row.officer_id === null ? 'text-amber-700' : 'text-gray-900'
                            }`}
                          >
                            {row.officer_name}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {row.branch_name || '—'} · {row.count} item(s)
                          </span>
                        </span>
                        <span className="text-sm font-semibold text-amber-600 shrink-0 ml-3">
                          {formatAmount(row.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
                <Banknote className="w-4 h-4 text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-900">By Bank Account (bank-only)</h2>
              </div>
              {summary.by_bank_account.length === 0 ? (
                <p className="text-sm text-gray-500 px-4 py-6 text-center">Nothing outstanding.</p>
              ) : (
                <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                  {summary.by_bank_account.map((row) => (
                    <li key={row.bank_account_id} className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                      <button
                        onClick={() => openBankAccountDrilldown(row)}
                        className="flex-1 min-w-0 flex items-center justify-between text-left"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">
                            {row.bank_account_name || `Account #${row.bank_account_id}`}
                          </span>
                          <span className="block text-xs text-gray-500">{row.count} item(s)</span>
                        </span>
                        <span className="text-sm font-semibold text-red-600 shrink-0 ml-3">
                          {formatAmount(row.amount)}
                        </span>
                      </button>
                      <button
                        onClick={() =>
                          setBulkLinkTarget({
                            id: row.bank_account_id,
                            name: row.bank_account_name || `Account #${row.bank_account_id}`,
                          })
                        }
                        className="shrink-0 px-2 py-1 text-xs font-medium text-purple-700 border border-purple-200 rounded-md hover:bg-purple-50"
                        title="Auto-link bank-charge fee pairs on this account"
                      >
                        Bulk-Link
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {drilldown && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-gray-900">{drilldown.label}</h2>
              <button onClick={() => setDrilldown(null)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              {drilldownLoading && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              )}
              {drilldownError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {drilldownError}
                </div>
              )}
              {!drilldownLoading && !drilldownError && drilldownRows && (
                drilldownRows.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-6">No outstanding items.</p>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {drilldownRows.map((exc) => (
                      <li key={exc.id} className="py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-sm text-gray-900 truncate">
                              {exc.bank_narration || exc.erp_narration || '—'}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {exc.bank_date || exc.erp_date} · {exc.direction}
                              {exc.is_high_priority && (
                                <span className="ml-2 text-red-600 font-medium">High priority</span>
                              )}
                            </p>
                          </div>
                          <span className="text-sm font-semibold text-gray-900 shrink-0">
                            {formatAmount(exc.bank_amount ?? exc.erp_amount)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {bulkLinkTarget && (
        <BulkLinkBankChargeModal
          bankAccountId={bulkLinkTarget.id}
          bankAccountName={bulkLinkTarget.name}
          onClose={() => setBulkLinkTarget(null)}
          onSuccess={() => {
            success('Bank charges bulk-linked — reloading summary');
            load();
          }}
          onError={showError}
        />
      )}

      {showCleanUpModal && (
        <CleanUpStrandedPairsModal
          onClose={() => setShowCleanUpModal(false)}
          onSuccess={() => {
            success('Stranded pairs cleaned up — reloading summary');
            load();
          }}
          onError={showError}
        />
      )}

      {showEvidenceModal && (
        <CreateOfficerEvidenceThreadsModal
          onClose={() => setShowEvidenceModal(false)}
          onSuccess={() => {
            success('Evidence request threads created');
            load();
          }}
          onError={showError}
        />
      )}
    </div>
  );
};

export default MissingMoneySummaryPage;
