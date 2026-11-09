/**
 * Resolution Cases
 *
 * Queue for reconciliation fixes raised from Pending Bank Repayments:
 *   To review  — branch managers recommend or reject
 *   To approve — directors approve (clean cases can be ticked and bulk-approved;
 *                disputes and anything flagged must be opened one by one)
 *   Mine       — cases I raised, cases on my payments, disputes against me
 *   History    — approved / rejected / dissolved / withdrawn
 * Data: /api/banks/resolutions/ (banks/views.py; rules in banks/resolution_service.py).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import { resolutionService, ResolutionCase, ResolutionQueue } from '../../services/resolutionService';
import { ResolutionCaseDrawer } from '../../components/banks/ResolutionCaseDrawer';
import { formatNaira } from '../../services/dashboardStatsService';
import { useToast } from '../../hooks/useToast';

const TABS: { key: ResolutionQueue; label: string }[] = [
  { key: 'review', label: 'To review' },
  { key: 'approve', label: 'To approve' },
  { key: 'mine', label: 'Mine' },
  { key: 'history', label: 'History' },
];

const STATUS_CLS: Record<string, string> = {
  proposed: 'bg-blue-100 text-blue-800',
  recommended: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
  dissolved: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

function initialTab(): ResolutionQueue {
  const t = new URLSearchParams(window.location.search).get('tab');
  return (['review', 'approve', 'mine', 'history'] as const).find((x) => x === t) ?? 'mine';
}

function initialCase(): number | null {
  const id = Number(new URLSearchParams(window.location.search).get('case'));
  return Number.isFinite(id) && id > 0 ? id : null;
}

const ResolutionCasesPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const [tab, setTab] = useState<ResolutionQueue>(initialTab);
  const [rows, setRows] = useState<ResolutionCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(initialCase);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await resolutionService.list(tab));
      setSelected(new Set());
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not load cases');
    } finally {
      setLoading(false);
    }
  }, [tab, showError]);
  useEffect(() => { load(); }, [load]);

  const cleanRows = tab === 'approve' ? rows.filter((r) => r.actions.can_approve && r.actions.is_clean) : [];
  const toggle = (id: number) =>
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const bulkApprove = async () => {
    setBulkBusy(true);
    try {
      const res = await resolutionService.bulkApprove([...selected], bulkNotes.trim());
      success(`Approved ${res.approved.length}. ${res.skipped.length ? `${res.skipped.length} skipped — open them individually.` : ''}`);
      setBulkNotes('');
      load();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Bulk approval failed');
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="w-7 h-7 text-amber-600" />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Resolution Cases</h1>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-700 bg-white border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>
      <p className="text-gray-600 mb-4">
        Fixes for repayments recorded in the system but not found in the bank. A branch manager reviews each
        case, then a director approves it — three different people every time. Nothing changes in the books
        until the director approves, and a director can dissolve an approval later if it looks wrong.
      </p>

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

      {cleanRows.length > 0 && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 space-y-2">
          <p className="text-sm text-green-900">
            <strong>{cleanRows.length} clean case(s)</strong> — exact amount, name matches, dates within 2 days, no
            history concerns. Tick them to approve together. Disputes and flagged cases must be opened one by one.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              value={bulkNotes}
              onChange={(e) => setBulkNotes(e.target.value)}
              placeholder="Approval note for all ticked cases (at least 10 characters)"
              className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <button
              disabled={selected.size === 0 || bulkNotes.trim().length < 10 || bulkBusy}
              onClick={bulkApprove}
              className="rounded-lg bg-green-600 text-white text-sm font-medium px-4 py-1.5 disabled:opacity-50"
            >
              {bulkBusy ? 'Approving…' : `Approve ${selected.size} ticked`}
            </button>
          </div>
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center text-gray-500">Nothing here.</div>
      )}

      {rows.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                {cleanRows.length > 0 && <th className="px-3 py-2" />}
                <th className="px-4 py-2 font-medium">Case</th>
                <th className="px-4 py-2 font-medium text-right">Amount</th>
                <th className="px-4 py-2 font-medium">Client / payment</th>
                <th className="px-4 py-2 font-medium">Raised by</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => {
                const flags = r.facts?.flags?.length ?? 0;
                const bulkable = r.actions.can_approve && r.actions.is_clean;
                return (
                  <tr key={r.id} className="align-top hover:bg-gray-50 cursor-pointer" onClick={() => setOpenId(r.id)}>
                    {cleanRows.length > 0 && (
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        {bulkable && (
                          <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.reference_number}`} />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <p className="font-semibold text-gray-900">{r.reference_number}</p>
                      <p className="text-xs text-gray-500">{r.kind_label}</p>
                      {r.kind === 'dispute' && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Dispute</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatNaira(r.amount)}</td>
                    <td className="px-4 py-3 text-gray-700 min-w-[14rem]">
                      <p>{r.facts?.erp?.client_name || '—'} {r.facts?.erp?.loan_number ? `· ${r.facts.erp.loan_number}` : ''}</p>
                      <p className="text-xs text-gray-500">Posted by {r.facts?.erp?.officer_name || '—'} · {r.branch_name ?? ''}</p>
                      {flags > 0 && <p className="text-xs text-red-600">{flags} thing(s) to check</p>}
                      {r.actions.is_clean && <p className="text-xs text-green-700">Clean</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {r.proposed_by_name}
                      <div className="text-xs text-gray-400">{new Date(r.proposed_at).toLocaleDateString('en-GB')}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_CLS[r.status] ?? ''}`}>{r.status_label}</span>
                      {r.actions.waiting_for_respondent && <p className="text-[11px] text-amber-700 mt-1">Waiting for other officer</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {openId !== null && (
        <ResolutionCaseDrawer caseId={openId} onClose={() => setOpenId(null)} onChanged={load} />
      )}
    </div>
  );
};

export default ResolutionCasesPage;
