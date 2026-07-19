import React, { useState } from 'react';
import { AlertTriangle, ArrowRight, Link2, Search, Unlink, X } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermissions';
import {
  MIN_REASON_LENGTH,
  type PaymentTraceException,
  type PaymentTraceLine,
  type PaymentTracePayment,
  type PaymentTraceResponse,
} from '../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

function ExceptionCard({ exc }: { exc: PaymentTraceException }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-700">
          exc #{exc.id} · {exc.exception_type} · {exc.direction} · {formatAmount(exc.amount)} · {exc.date}
        </span>
        <span className={exc.resolved ? 'text-green-700' : 'text-amber-700'}>
          {exc.resolved ? 'resolved' : 'open'}
        </span>
      </div>
      {exc.narration && <div className="mt-1 text-gray-600">{exc.narration}</div>}
      {exc.officer_name && <div className="text-gray-500">officer: {exc.officer_name}</div>}
      {exc.resolved && (
        <div className="mt-1 text-gray-500">
          by {exc.resolved_by || '—'} — {exc.resolution_notes || 'no notes'}
        </div>
      )}
      {exc.netted_with && (
        <div className="mt-1 flex items-center gap-1 text-purple-700">
          <Link2 className="h-3 w-3" />
          netted with exc #{exc.netted_with.id} ({exc.netted_with.exception_type}, {formatAmount(exc.netted_with.amount)}
          {exc.netted_with.transaction_reference ? `, ${exc.netted_with.transaction_reference}` : ''}) — {exc.netted_with.narration}
        </div>
      )}
    </div>
  );
}

/** Inline "type a reason, confirm" control shared by Unmatch and Unresolve —
 * both require a MIN_REASON_LENGTH explanation, same as every other
 * override action in this module (see ReconciliationDetailPage). */
function ReasonPrompt({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length >= MIN_REASON_LENGTH;
  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        autoFocus
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder={`${label} — reason (min ${MIN_REASON_LENGTH} chars)`}
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <button
        disabled={!valid}
        onClick={() => onConfirm(reason.trim())}
        title={!valid ? `At least ${MIN_REASON_LENGTH} characters required` : undefined}
        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
      >
        Confirm
      </button>
      <button onClick={onCancel} className="rounded border border-gray-300 px-2 py-1 text-xs">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

function LineRow({
  line,
  instanceKey,
  canApprove,
  onUnmatch,
  onNavigate,
}: {
  line: PaymentTraceLine;
  instanceKey: string;
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="rounded border border-gray-200 p-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{line.bank_account}</span> · {line.direction} · {formatAmount(line.amount)} ·{' '}
          {line.value_date}
        </span>
        <span className="flex items-center gap-2">
          <span className={line.matched ? 'text-green-700' : 'text-amber-700'}>
            {line.matched ? `matched (${line.match_confidence || '?'})` : 'unmatched'}
          </span>
          {line.reconciliation_id && (
            <button
              onClick={() => onNavigate(line.reconciliation_id as number)}
              className="flex items-center gap-0.5 text-blue-600 hover:underline"
            >
              open recon <ArrowRight className="h-3 w-3" />
            </button>
          )}
        </span>
      </div>
      {line.narration && <div className="mt-1 text-gray-600">{line.narration}</div>}
      {line.claiming_transaction && (
        <div className="mt-1 text-gray-600">
          claimed by <span className="font-medium">{line.claiming_transaction.reference_number}</span> —{' '}
          {line.claiming_transaction.description}
          {line.claiming_transaction.created_by ? ` (by ${line.claiming_transaction.created_by})` : ''}
        </div>
      )}
      {!line.matched && line.unmatched_reason && (
        <div className="mt-1 text-gray-500">
          unmatched by {line.unmatched_by || '—'} at {line.unmatched_at ? new Date(line.unmatched_at).toLocaleString() : '—'}
          {' — '}
          {line.unmatched_reason}
        </div>
      )}
      {line.exceptions.length > 0 && (
        <div className="mt-2 space-y-1">
          {line.exceptions.map((exc) => (
            <ExceptionCard key={exc.id} exc={exc} />
          ))}
        </div>
      )}
      {line.matched && canApprove && line.reconciliation_id && (
        <div>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="mt-2 flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              <Unlink className="h-3 w-3" /> Unmatch this line
            </button>
          ) : (
            <ReasonPrompt
              label="Unmatch"
              onConfirm={(reason) => {
                onUnmatch(line, reason);
                setConfirming(false);
              }}
              onCancel={() => setConfirming(false)}
            />
          )}
        </div>
      )}
      {line.matched && canApprove && !line.reconciliation_id && (
        <div className="mt-2 flex items-center gap-1 text-gray-400">
          <AlertTriangle className="h-3 w-3" /> no reconciliation record for this date — unmatch unavailable
        </div>
      )}
      <div className="mt-1 text-[10px] text-gray-400">{instanceKey}</div>
    </div>
  );
}

function PaymentCard({
  payment,
  canApprove,
  onUnmatch,
  onUnresolve,
  onNavigate,
}: {
  payment: PaymentTracePayment;
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onUnresolve: (exc: PaymentTraceException, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  const [confirmingExcId, setConfirmingExcId] = useState<number | null>(null);
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold">{payment.reference_number}</span>
          <span className="ml-2 text-sm text-gray-500">{payment.date}</span>
          {payment.is_reversed && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px]">REVERSED</span>}
          {payment.is_reversal && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px]">REVERSAL</span>}
        </div>
        <span className="text-sm text-gray-500">{payment.created_by ? `by ${payment.created_by}` : ''}</span>
      </div>
      <div className="mt-1 text-sm text-gray-700">{payment.description}</div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-600">
        {payment.legs.map((leg, i) => (
          <span key={i} className="rounded bg-gray-100 px-2 py-0.5">
            {leg.account_code} {leg.account_name} · {leg.side} {formatAmount(leg.amount)}
          </span>
        ))}
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-gray-500">
          Claimed by ({payment.claimed_by_lines.length} line{payment.claimed_by_lines.length === 1 ? '' : 's'})
        </div>
        {payment.claimed_by_lines.length === 0 ? (
          <div className="mt-1 text-xs italic text-gray-400">No statement line currently or previously matched this payment.</div>
        ) : (
          <div className="mt-1 space-y-1">
            {payment.claimed_by_lines.map((line) => (
              <LineRow
                key={line.id}
                line={line}
                instanceKey={`payment-${payment.id}-line-${line.id}`}
                canApprove={canApprove}
                onUnmatch={onUnmatch}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        )}
      </div>

      {payment.exceptions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-medium text-gray-500">Exceptions</div>
          <div className="mt-1 space-y-1">
            {payment.exceptions.map((exc) => (
              <div key={exc.id}>
                <ExceptionCard exc={exc} />
                {exc.resolved && canApprove && (
                  <div>
                    {confirmingExcId === exc.id ? (
                      <ReasonPrompt
                        label="Unresolve"
                        onConfirm={(reason) => {
                          onUnresolve(exc, reason);
                          setConfirmingExcId(null);
                        }}
                        onCancel={() => setConfirmingExcId(null)}
                      />
                    ) : (
                      <button
                        onClick={() => setConfirmingExcId(exc.id)}
                        className="mt-1 flex items-center gap-1 rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
                      >
                        <Unlink className="h-3 w-3" /> Unresolve
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Investigation search for "someone came with strong evidence a particular
 * payment was wrongly linked". Search by reference number, exact amount,
 * or narration text and see the full linkage story on both sides — every
 * line that currently (or previously, before an unmatch) claimed a
 * payment, every exception either side appears in with its resolution
 * notes and netted counterpart. A director reads the story, decides which
 * pairing is false, and acts with Unmatch/Unresolve right here — which
 * frees the real counterpart to be found and paired next.
 */
const PaymentTracePage: React.FC = () => {
  const { success, error: showError } = useToast();
  const { hasPageAccess } = usePermission();
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');

  const [query, setQuery] = useState('');
  const [result, setResult] = useState<PaymentTraceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = async (q: string) => {
    if (q.trim().length < 3) {
      setError('Enter at least 3 characters — a reference number, an exact amount, or narration text.');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const data = await reconciliationService.tracePayment(q.trim());
      setResult(data);
      setSearched(true);
    } catch (err: any) {
      setError(err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const refresh = () => {
    if (query.trim().length >= 3) runSearch(query);
  };

  const handleUnmatch = async (line: PaymentTraceLine, reason: string) => {
    if (!line.reconciliation_id) return;
    try {
      await reconciliationService.unmatchTransaction(line.reconciliation_id, line.id, { reason });
      success('Line unmatched — the freed payment can now be re-linked to its true counterpart.');
      refresh();
    } catch (err: any) {
      showError(err.message || 'Failed to unmatch');
    }
  };

  const handleUnresolve = async (exc: PaymentTraceException, reason: string) => {
    try {
      await reconciliationService.unresolveException(exc.id, { reason });
      success('Exception reopened.');
      refresh();
    } catch (err: any) {
      showError(err.message || 'Failed to unresolve');
    }
  };

  const openRecon = (reconciliationId: number) => {
    window.open(`/banks/reconciliations/${reconciliationId}`, '_blank');
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Payment Trace</h1>
      <p className="mt-1 text-sm text-gray-500">
        Search a payment by reference, exact amount, or narration text to see its full linkage story — what it is
        currently matched to, what it was ever matched to before an unmatch, and every exception either side
        appears in. Use this when someone brings evidence a match is wrong.
      </p>

      <div className="mt-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
          placeholder="Reference number, exact amount (e.g. 42000), or narration text"
          className="w-full max-w-lg rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          onClick={() => runSearch(query)}
          disabled={loading}
          className="flex items-center gap-1 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          <Search className="h-4 w-4" /> {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="mt-3 rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}

      {searched && !loading && !error && (
        <div className="mt-6 space-y-8">
          <section>
            <h2 className="text-sm font-semibold text-gray-700">
              Payments ({result?.payments.length ?? 0})
            </h2>
            {result?.payments.length === 0 ? (
              <div className="mt-2 text-sm italic text-gray-400">No matching ERP payment found.</div>
            ) : (
              <div className="mt-2 space-y-3">
                {result?.payments.map((p) => (
                  <PaymentCard
                    key={p.id}
                    payment={p}
                    canApprove={canApprove}
                    onUnmatch={handleUnmatch}
                    onUnresolve={handleUnresolve}
                    onNavigate={openRecon}
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="text-sm font-semibold text-gray-700">
              Statement lines ({result?.lines.length ?? 0})
            </h2>
            {result?.lines.length === 0 ? (
              <div className="mt-2 text-sm italic text-gray-400">No matching statement line found.</div>
            ) : (
              <div className="mt-2 space-y-2">
                {result?.lines.map((line) => (
                  <LineRow
                    key={line.id}
                    line={line}
                    instanceKey={`toplevel-line-${line.id}`}
                    canApprove={canApprove}
                    onUnmatch={handleUnmatch}
                    onNavigate={openRecon}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default PaymentTracePage;
