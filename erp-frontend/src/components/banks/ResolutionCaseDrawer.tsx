/**
 * ResolutionCaseDrawer
 *
 * One resolution case with everything an approver needs side by side —
 * bank line vs ERP payment, name/date/reference checks, red flags, who
 * proposed and reviewed it, the officer's track record, dispute response,
 * evidence — and only the actions this user is allowed to take.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle2, FileText } from 'lucide-react';
import { resolutionService, ResolutionCase } from '../../services/resolutionService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useToast } from '../../hooks/useToast';

type Action = 'recommend' | 'reject_review' | 'approve' | 'reject' | 'dissolve' | 'respond' | 'cancel';

const ACTION_LABEL: Record<Action, string> = {
  recommend: 'Recommend to director',
  reject_review: 'Reject',
  approve: 'Approve',
  reject: 'Reject',
  dissolve: 'Dissolve',
  respond: 'Send response',
  cancel: 'Withdraw',
};

function fmt(v: string | null | undefined) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const Check: React.FC<{ ok: boolean | undefined; label: string; bad?: string }> = ({ ok, label, bad }) => (
  <li className={`flex items-start gap-2 text-sm ${ok ? 'text-green-800' : 'text-red-700'}`}>
    {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
    <span>{ok ? label : bad ?? label}</span>
  </li>
);

export const ResolutionCaseDrawer: React.FC<{
  caseId: number;
  onClose: () => void;
  onChanged: () => void;
}> = ({ caseId, onClose, onChanged }) => {
  const { success, error: showError } = useToast();
  const [c, setC] = useState<ResolutionCase | null>(null);
  const [pending, setPending] = useState<Action | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    resolutionService.get(caseId).then(setC).catch((e) => showError(e instanceof Error ? e.message : 'Could not load case'));
  }, [caseId, showError]);
  useEffect(() => { load(); }, [load]);

  const contradicted = c?.facts?.checks?.name_check === 'CONTRADICTED';
  const minLen = pending === 'approve' && contradicted ? 30 : pending === 'cancel' ? 0 : 10;

  const run = async () => {
    if (!c || !pending) return;
    setBusy(true);
    try {
      const t = text.trim();
      if (pending === 'recommend') await resolutionService.review(c.id, true, t);
      else if (pending === 'reject_review') await resolutionService.review(c.id, false, t);
      else if (pending === 'approve') await resolutionService.approve(c.id, t);
      else if (pending === 'reject') await resolutionService.reject(c.id, t);
      else if (pending === 'dissolve') await resolutionService.dissolve(c.id, t);
      else if (pending === 'respond') await resolutionService.respond(c.id, t);
      else if (pending === 'cancel') await resolutionService.cancel(c.id);
      success(`${c.reference_number}: done.`);
      setPending(null);
      setText('');
      load();
      onChanged();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const f = c?.facts ?? {};
  const checks = f.checks ?? {};
  const a = c?.actions;
  const available: Action[] = a
    ? ([
        a.can_review && 'recommend',
        a.can_review && 'reject_review',
        a.can_approve && 'approve',
        a.can_reject && !a.can_review && 'reject',
        a.can_dissolve && 'dissolve',
        a.can_respond && 'respond',
        a.can_cancel && 'cancel',
      ].filter(Boolean) as Action[])
    : [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-2xl bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Resolution case">
        <div className="sticky top-0 bg-white border-b px-4 sm:px-5 py-3 flex items-center justify-between z-10">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">
              {c ? `${c.reference_number} · ${c.kind_label}` : 'Loading…'}
            </h2>
            {c && (
              <p className="text-xs text-gray-500">
                {formatNaira(c.amount)} · {c.status_label} · {c.branch_name ?? '—'} · {c.bank_account_name}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800"><X className="w-5 h-5" /></button>
        </div>

        {c && (
          <div className="p-4 sm:p-5 space-y-5">
            {(f.flags?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-semibold text-red-800 mb-1">Things to check</p>
                <ul className="list-disc pl-5 text-sm text-red-800 space-y-0.5">
                  {f.flags!.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            )}
            {a?.is_clean && c.status === 'recommended' && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                Clean case: exact amount, name matches, dates within 2 days, no history concerns.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Recorded in the ERP</p>
                <p className="text-lg font-bold">{formatNaira(f.erp?.amount ?? c.amount)}</p>
                <dl className="text-sm text-gray-700 space-y-0.5 mt-1">
                  <div><dt className="inline text-gray-500">Client: </dt><dd className="inline">{f.erp?.client_name || '—'}</dd></div>
                  <div><dt className="inline text-gray-500">Loan: </dt><dd className="inline">{f.erp?.loan_number || '—'}</dd></div>
                  <div><dt className="inline text-gray-500">Date claimed: </dt><dd className="inline">{f.erp?.date_claimed || '—'}</dd></div>
                  <div><dt className="inline text-gray-500">Entered at: </dt><dd className="inline">{fmt(f.erp?.posted_at)}</dd></div>
                  <div><dt className="inline text-gray-500">Reference: </dt><dd className="inline">{f.erp?.reference || '—'}</dd></div>
                  <div><dt className="inline text-gray-500">Posted by: </dt><dd className="inline">{f.erp?.officer_name || '—'}</dd></div>
                </dl>
                <p className="text-xs text-gray-500 mt-1 break-words">{f.erp?.description}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Bank statement</p>
                {f.bank ? (
                  <>
                    <p className="text-lg font-bold">{formatNaira(f.bank.amount)}</p>
                    <dl className="text-sm text-gray-700 space-y-0.5 mt-1">
                      <div><dt className="inline text-gray-500">Date: </dt><dd className="inline">{f.bank.date}</dd></div>
                      <div><dt className="inline text-gray-500">Account: </dt><dd className="inline">{f.bank.account}</dd></div>
                      <div><dt className="inline text-gray-500">Bank ref: </dt><dd className="inline break-all">{f.bank.bank_ref || '—'}</dd></div>
                    </dl>
                    <p className="text-sm text-gray-900 mt-1 break-words font-medium">{f.bank.narration}</p>
                    {f.bank.matched_to && (
                      <p className="text-xs text-amber-800 bg-amber-50 rounded p-2 mt-2">
                        Currently matched to: {f.bank.matched_to.description} ({f.bank.matched_to.date}) — posted by{' '}
                        {f.bank.matched_to.officer_name || 'unknown'}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No bank line — the proposer says the money never arrived.</p>
                )}
              </div>
            </div>

            {f.bank && (
              <ul className="space-y-1">
                {checks.payer_reference && (
                  <Check
                    ok={!!checks.payer_reference_in_bank_line}
                    label={`Receipt reference ${checks.payer_reference} is on the bank line`}
                    bad={`Receipt reference ${checks.payer_reference} is NOT on the bank line`}
                  />
                )}
                <Check ok={checks.amount_equal} label="Amounts are exactly equal" bad="Amounts differ" />
                <Check
                  ok={checks.name_check === 'CONFIRMED'}
                  label="Bank narration names the loan's client"
                  bad={checks.name_check === 'CONTRADICTED' ? 'Bank narration names a DIFFERENT person' : 'Could not confirm the payer name'}
                />
                <Check ok={(checks.date_gap_days ?? 99) <= 2} label={`Dates ${checks.date_gap_days ?? '?'} day(s) apart`} />
                <Check ok={!checks.posted_after_bank_line} label="Entered in ERP before the money arrived" bad="Entered in ERP after the money had already arrived" />
                <Check ok={checks.reference_in_bank_line} label="Payment reference appears in the bank line" bad="Payment reference not found in the bank line" />
              </ul>
            )}

            <div className="rounded-lg border border-gray-200 p-3 text-sm space-y-2">
              <p><span className="text-gray-500">Proposed by </span><strong>{c.proposed_by_name}</strong> · {fmt(c.proposed_at)}</p>
              <p className="text-gray-800 whitespace-pre-wrap">{c.reason}</p>
              {c.evidence_url && (
                <a href={c.evidence_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-700 underline">
                  <FileText className="w-4 h-4" /> View evidence
                </a>
              )}
              {c.reviewed_by_name && (
                <p><span className="text-gray-500">Recommended by </span><strong>{c.reviewed_by_name}</strong> · {fmt(c.reviewed_at)}<br />{c.review_notes}</p>
              )}
              {c.kind === 'dispute' && (
                <p>
                  <span className="text-gray-500">Other officer ({c.respondent_name || 'unknown'}): </span>
                  {c.respondent_response
                    ? <span className="whitespace-pre-wrap">{c.respondent_response}</span>
                    : <em className="text-gray-500">no response yet{c.dispute_wait_until ? ` — approval opens ${fmt(c.dispute_wait_until)}` : ''}</em>}
                </p>
              )}
              {c.approved_by_name && <p><span className="text-gray-500">Approved by </span><strong>{c.approved_by_name}</strong> · {fmt(c.approved_at)} — {c.approval_notes}</p>}
              {c.reversal_reference && <p><span className="text-gray-500">Reversal: </span>{c.reversal_reference}</p>}
              {c.rejected_by_name && <p className="text-red-700">Rejected by {c.rejected_by_name} · {fmt(c.rejected_at)} — {c.rejection_reason}</p>}
              {c.dissolved_by_name && <p className="text-red-700">Dissolved by {c.dissolved_by_name} · {fmt(c.dissolved_at)} — {c.dissolve_reason}</p>}
            </div>

            {f.officer_record && Object.keys(f.officer_record).length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  ['Open "not in bank"', f.officer_record.open_not_in_bank],
                  ['Disputes raised', f.officer_record.disputes_raised],
                  ['Disputes rejected (30d)', f.officer_record.disputes_rejected_30d],
                  ['Cases dissolved', f.officer_record.cases_dissolved],
                ].map(([label, v]) => (
                  <div key={label as string} className={`rounded-lg border p-2 ${(v as number) > 0 && label !== 'Disputes raised' && label !== 'Open "not in bank"' ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
                    <p className="text-lg font-bold">{v ?? 0}</p>
                    <p className="text-[11px] text-gray-500">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {a?.waiting_for_respondent && (
              <p className="text-sm text-amber-800 bg-amber-50 rounded p-2">
                Waiting for the other officer to respond (or 24 hours to pass) before this dispute can be approved.
              </p>
            )}

            {available.length > 0 && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {available.map((act) => (
                    <button
                      key={act}
                      onClick={() => { setPending(act); setText(''); }}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                        pending === act ? 'ring-2 ring-offset-1 ring-amber-500' : ''
                      } ${
                        act === 'approve' || act === 'recommend'
                          ? 'bg-green-600 text-white border-green-600'
                          : act === 'dissolve' || act === 'reject' || act === 'reject_review'
                          ? 'bg-white text-red-700 border-red-300'
                          : 'bg-white text-gray-800 border-gray-300'
                      }`}
                    >
                      {ACTION_LABEL[act]}
                    </button>
                  ))}
                </div>
                {pending && pending !== 'cancel' && (
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder={
                      pending === 'approve' && contradicted
                        ? "The names don't match — explain why you're approving (at least 30 characters)."
                        : 'Notes (at least 10 characters) — these stay on the record.'
                    }
                  />
                )}
                {pending && (
                  <button
                    onClick={run}
                    disabled={busy || text.trim().length < minLen}
                    className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium disabled:opacity-50"
                  >
                    {busy ? 'Working…' : `Confirm: ${ACTION_LABEL[pending]}`}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ResolutionCaseDrawer;
