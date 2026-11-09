/**
 * FindMatchDrawer
 *
 * For a "Recorded, not in bank" payment: shows bank lines it could be, and
 * raises a resolution case (branch manager reviews, director approves).
 *   - Unmatched line   → "Link" case
 *   - Already matched  → "Dispute" case (receipt/screenshot required; the
 *                         officer whose payment holds the line is told)
 *   - Nothing fits     → "Money never arrived" → reversal case
 */
import React, { useEffect, useState } from 'react';
import { X, Upload, AlertTriangle } from 'lucide-react';
import { resolutionService, MatchCandidate, ResolutionKind } from '../../services/resolutionService';
import type { PendingRepayment } from '../../services/pendingRepaymentService';
import { formatNaira } from '../../services/dashboardStatsService';
import { useToast } from '../../hooks/useToast';

type Choice =
  | { kind: 'link'; candidate: MatchCandidate }
  | { kind: 'dispute'; candidate: MatchCandidate }
  | { kind: 'reversal' };

const NAME_BADGE: Record<string, { label: string; cls: string }> = {
  CONFIRMED: { label: 'Name matches', cls: 'bg-green-100 text-green-800' },
  UNKNOWN: { label: 'Name unclear', cls: 'bg-gray-100 text-gray-700' },
  CONTRADICTED: { label: 'Different name', cls: 'bg-red-100 text-red-700' },
};

function NameBadge({ check }: { check: string }) {
  const b = NAME_BADGE[check] ?? NAME_BADGE.UNKNOWN;
  return <span className={`text-[11px] px-2 py-0.5 rounded-full ${b.cls}`}>{b.label}</span>;
}

export const FindMatchDrawer: React.FC<{
  row: PendingRepayment;
  onClose: () => void;
  onSubmitted: () => void;
}> = ({ row, onClose, onSubmitted }) => {
  const { success, error: showError } = useToast();
  const [loading, setLoading] = useState(true);
  const [unmatched, setUnmatched] = useState<MatchCandidate[]>([]);
  const [matched, setMatched] = useState<MatchCandidate[]>([]);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [reason, setReason] = useState('');
  const [evidence, setEvidence] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    resolutionService
      .candidates(row.id)
      .then((d) => { setUnmatched(d.unmatched); setMatched(d.matched); })
      .catch((e) => showError(e instanceof Error ? e.message : 'Could not load bank lines'))
      .finally(() => setLoading(false));
  }, [row.id, showError]);

  const kind: ResolutionKind | null = choice?.kind ?? null;
  const needsEvidence = kind === 'dispute';
  const canSubmit = !!choice && reason.trim().length >= 10 && (!needsEvidence || !!evidence) && !submitting;

  const submit = async () => {
    if (!choice) return;
    setSubmitting(true);
    try {
      const c = await resolutionService.propose({
        erp_exception_id: row.id,
        kind: choice.kind,
        reason: reason.trim(),
        bank_exception_id: choice.kind === 'link' ? choice.candidate.bank_exception_id : undefined,
        bank_transaction_id: choice.kind !== 'reversal' ? choice.candidate.bank_transaction_id : undefined,
        evidence,
      });
      success(`${c.reference_number} sent to your branch manager for review.`);
      onSubmitted();
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not raise the case');
    } finally {
      setSubmitting(false);
    }
  };

  const isPicked = (k: string, id?: string) =>
    choice?.kind === k && (k === 'reversal' || (choice as { candidate: MatchCandidate }).candidate.bank_transaction_id === id);

  const CandidateRow = ({ c, k }: { c: MatchCandidate; k: 'link' | 'dispute' }) => (
    <button
      type="button"
      onClick={() => setChoice({ kind: k, candidate: c })}
      className={`w-full text-left rounded-lg border p-3 ${
        isPicked(k, c.bank_transaction_id) ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500' : 'border-gray-200 hover:bg-gray-50'
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-semibold">{formatNaira(c.amount)}</span>
        <span className="text-xs text-gray-500">{c.date} · {c.date_gap_days} day(s) apart</span>
      </div>
      <p className="text-sm text-gray-800 mt-1 break-words">{c.narration || '—'}</p>
      <div className="mt-1"><NameBadge check={c.name_check} /></div>
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-xl bg-white shadow-xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Find the bank line for this payment"
      >
        <div className="sticky top-0 bg-white border-b px-4 sm:px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Find the bank line</h2>
            <p className="text-xs text-gray-500">
              {formatNaira(row.amount)} · {row.date} · {row.narration}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-500 hover:text-gray-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-5">
          {loading && <p className="text-sm text-gray-500">Looking for bank lines of the same amount…</p>}

          {!loading && (
            <>
              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Unmatched bank lines</h3>
                <p className="text-xs text-gray-500 mb-2">Same account, same amount, within 7 days.</p>
                {unmatched.length === 0 ? (
                  <p className="text-sm text-gray-400">None found.</p>
                ) : (
                  <div className="space-y-2">{unmatched.map((c) => <CandidateRow key={c.bank_transaction_id} c={c} k="link" />)}</div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">Already matched to another payment</h3>
                <p className="text-xs text-gray-500 mb-2">
                  Pick one only if you can prove it&apos;s your client&apos;s money. This raises a dispute: you must
                  upload a receipt, and the other officer is told and can respond.
                </p>
                {matched.length === 0 ? (
                  <p className="text-sm text-gray-400">None found.</p>
                ) : (
                  <div className="space-y-2">{matched.map((c) => <CandidateRow key={c.bank_transaction_id} c={c} k="dispute" />)}</div>
                )}
              </section>

              <section>
                <button
                  type="button"
                  onClick={() => setChoice({ kind: 'reversal' })}
                  className={`w-full text-left rounded-lg border p-3 ${
                    isPicked('reversal') ? 'border-red-500 bg-red-50 ring-1 ring-red-500' : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <p className="font-semibold text-gray-900">The money never arrived</p>
                  <p className="text-xs text-gray-600">
                    Ask for this repayment to be reversed. The loan balance goes back up once a director approves.
                  </p>
                </button>
              </section>

              {choice && (
                <section className="space-y-3 border-t pt-4">
                  {choice.kind === 'dispute' && (
                    <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      Disputes are checked closely. The director sees who currently holds this line, your evidence,
                      and your dispute history.
                    </div>
                  )}
                  <label className="block">
                    <span className="text-sm font-medium text-gray-900">Explain why (at least 10 characters)</span>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder={
                        choice.kind === 'reversal'
                          ? 'e.g. Client promised to transfer but never did; cash was not collected.'
                          : "e.g. Client's son paid from his account, same day as the collection."
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-900">
                      Receipt or screenshot {needsEvidence ? '(required)' : '(optional)'}
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <Upload className="w-4 h-4 text-gray-500" />
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        onChange={(e) => setEvidence(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                    </div>
                  </label>
                  <button
                    disabled={!canSubmit}
                    onClick={submit}
                    className="w-full rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-medium py-2"
                  >
                    {submitting ? 'Sending…' : 'Send to branch manager'}
                  </button>
                  <p className="text-xs text-gray-500">
                    Nothing changes until your branch manager recommends it and a director approves.
                  </p>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FindMatchDrawer;
