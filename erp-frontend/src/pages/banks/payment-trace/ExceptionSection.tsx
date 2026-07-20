import React, { useState } from 'react';
import { Link2, ExternalLink, Unlink } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { MIN_REASON_LENGTH, type PaymentTraceException } from '../../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

function ExceptionTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    erp_only: 'bg-purple-100 text-purple-700',
    bank_only: 'bg-sky-100 text-sky-700',
    amount_diff: 'bg-amber-100 text-amber-700',
  };
  const labels: Record<string, string> = {
    erp_only: 'ERP Only',
    bank_only: 'Bank Only',
    amount_diff: 'Amount Diff',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
        styles[type] || 'bg-gray-100 text-gray-600'
      )}
    >
      {labels[type] || type}
    </span>
  );
}

function ExceptionStatusDot({ resolved }: { resolved: boolean }) {
  return (
    <span
      className={cn(
        'inline-block h-2 w-2 rounded-full',
        resolved ? 'bg-green-500' : 'bg-amber-500'
      )}
    />
  );
}

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
        onChange={e => setReason(e.target.value)}
        placeholder={`${label} — reason (min ${MIN_REASON_LENGTH} chars)`}
        className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs"
      />
      <button
        disabled={!valid}
        onClick={() => {
          onConfirm(reason.trim());
          setReason('');
        }}
        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
      >
        Confirm
      </button>
      <button
        onClick={onCancel}
        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
      >
        Cancel
      </button>
    </div>
  );
}

function SingleException({
  exc,
  canApprove,
  onUnresolve,
  onNavigate,
}: {
  exc: PaymentTraceException;
  canApprove: boolean;
  onUnresolve: (exc: PaymentTraceException, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  const [showUnresolve, setShowUnresolve] = useState(false);

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ExceptionStatusDot resolved={exc.resolved} />
          <span
            className={cn(
              'text-xs font-semibold',
              exc.resolved ? 'text-green-700' : 'text-amber-700'
            )}
          >
            {exc.resolved ? 'Resolved' : 'Open'}
          </span>
          <ExceptionTypeBadge type={exc.exception_type} />
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="font-mono">#{exc.id}</span>
          {exc.reconciliation_id && (
            <button
              onClick={() => onNavigate(exc.reconciliation_id)}
              className="flex items-center gap-0.5 text-blue-600 hover:underline"
            >
              recon <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="text-gray-500">Amount</div>
        <div className="font-medium text-gray-800">{formatAmount(exc.amount)}</div>
        <div className="text-gray-500">Direction</div>
        <div className="text-gray-800">{exc.direction}</div>
        {exc.date && (
          <>
            <div className="text-gray-500">Date</div>
            <div className="text-gray-800">{exc.date}</div>
          </>
        )}
        {exc.narration && (
          <>
            <div className="text-gray-500">Narration</div>
            <div className="text-gray-800">{exc.narration}</div>
          </>
        )}
        {exc.officer_name && (
          <>
            <div className="text-gray-500">Officer</div>
            <div className="text-gray-800">{exc.officer_name}</div>
          </>
        )}
      </div>

      {exc.resolved && (
        <div className="mt-2 rounded bg-green-50 p-2 text-xs">
          <div className="text-green-700">
            Resolved by <span className="font-medium">{exc.resolved_by || '—'}</span>
            {exc.resolved_at && (
              <span className="ml-1 text-green-600">
                —{' '}
                {new Date(exc.resolved_at).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </span>
            )}
          </div>
          {exc.resolution_notes && (
            <div className="mt-1 text-green-600">{exc.resolution_notes}</div>
          )}
        </div>
      )}

      {exc.netted_with && (
        <div className="mt-2 flex items-start gap-2 rounded bg-purple-50 p-2 text-xs">
          <Link2 className="mt-0.5 h-3 w-3 shrink-0 text-purple-600" />
          <div>
            <span className="font-medium text-purple-700">Netted with</span>{' '}
            <span className="text-purple-600">
              {exc.netted_with.exception_type} #{exc.netted_with.id}
              {exc.netted_with.transaction_reference &&
                ` (${exc.netted_with.transaction_reference})`}
              {' — '}
              {formatAmount(exc.netted_with.amount)}
            </span>
            {exc.netted_with.narration && (
              <div className="mt-0.5 text-purple-500">{exc.netted_with.narration}</div>
            )}
          </div>
        </div>
      )}

      {canApprove && exc.resolved && (
        <div className="mt-2">
          {showUnresolve ? (
            <ReasonPrompt
              label="Unresolve"
              onConfirm={reason => {
                onUnresolve(exc, reason);
                setShowUnresolve(false);
              }}
              onCancel={() => setShowUnresolve(false)}
            />
          ) : (
            <button
              onClick={() => setShowUnresolve(true)}
              className="flex items-center gap-1 rounded border border-amber-300 px-2 py-1 text-xs text-amber-700 hover:bg-amber-50"
            >
              <Unlink className="h-3 w-3" /> Unresolve
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ExceptionSection({
  exceptions,
  canApprove,
  onUnresolve,
  onNavigate,
}: {
  exceptions: PaymentTraceException[];
  canApprove: boolean;
  onUnresolve: (exc: PaymentTraceException, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  if (exceptions.length === 0) return null;

  const resolved = exceptions.filter(e => e.resolved);
  const open = exceptions.filter(e => !e.resolved);

  return (
    <div className="space-y-2">
      {open.length > 0 && (
        <div className="space-y-2">
          {open.map(exc => (
            <SingleException
              key={exc.id}
              exc={exc}
              canApprove={canApprove}
              onUnresolve={onUnresolve}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
      {resolved.length > 0 && (
        <div className="space-y-2">
          {resolved.map(exc => (
            <SingleException
              key={exc.id}
              exc={exc}
              canApprove={canApprove}
              onUnresolve={onUnresolve}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
