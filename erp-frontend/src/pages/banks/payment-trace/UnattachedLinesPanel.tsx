import React, { useState } from 'react';
import { ExternalLink, Unlink, AlertTriangle } from 'lucide-react';
import { MIN_REASON_LENGTH, type PaymentTraceLine } from '../../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
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

function SingleLine({
  line,
  canApprove,
  onUnmatch,
  onNavigate,
}: {
  line: PaymentTraceLine;
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  const [showUnmatch, setShowUnmatch] = useState(false);

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${line.matched ? 'text-green-700' : 'text-amber-700'}`}
          >
            {line.matched ? `Matched (${line.match_confidence || '?'})` : 'Unmatched'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {line.reconciliation_id && (
            <button
              onClick={() => onNavigate(line.reconciliation_id)}
              className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
            >
              Open Recon <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div className="text-gray-500">Bank Account</div>
        <div className="font-medium text-gray-800">{line.bank_account}</div>
        <div className="text-gray-500">Direction</div>
        <div className="text-gray-800">{line.direction}</div>
        <div className="text-gray-500">Amount</div>
        <div className="font-medium text-gray-800">{formatAmount(line.amount)}</div>
        <div className="text-gray-500">Value Date</div>
        <div className="text-gray-800">{line.value_date}</div>
      </div>

      {line.narration && <div className="mt-2 text-xs text-gray-600">{line.narration}</div>}

      {line.claiming_transaction && (
        <div className="mt-2 text-xs text-gray-600">
          Claimed by{' '}
          <span className="font-medium">{line.claiming_transaction.reference_number}</span>
          {' — '}
          {line.claiming_transaction.description}
          {line.claiming_transaction.created_by && ` (by ${line.claiming_transaction.created_by})`}
        </div>
      )}

      {!line.matched && line.unmatched_reason && (
        <div className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-600">
          {line.unmatched_by && (
            <span>
              Unmatched by <span className="font-medium">{line.unmatched_by}</span>
              {line.unmatched_at && (
                <span className="ml-1">
                  —{' '}
                  {new Date(line.unmatched_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </span>
              )}
            </span>
          )}
          <div className="mt-1">{line.unmatched_reason}</div>
        </div>
      )}

      {canApprove && line.matched && line.reconciliation_id && (
        <div className="mt-2">
          {showUnmatch ? (
            <ReasonPrompt
              label="Unmatch"
              onConfirm={reason => {
                onUnmatch(line, reason);
                setShowUnmatch(false);
              }}
              onCancel={() => setShowUnmatch(false)}
            />
          ) : (
            <button
              onClick={() => setShowUnmatch(true)}
              className="flex items-center gap-1 rounded border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              <Unlink className="h-3 w-3" /> Unmatch
            </button>
          )}
        </div>
      )}

      {canApprove && line.matched && !line.reconciliation_id && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <AlertTriangle className="h-3 w-3" /> No reconciliation record — unmatch unavailable
        </div>
      )}
    </div>
  );
}

export function UnattachedLinesPanel({
  lines,
  canApprove,
  onUnmatch,
  onNavigate,
}: {
  lines: PaymentTraceLine[];
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  if (lines.length === 0) return null;

  return (
    <div className="space-y-2">
      {lines.map(line => (
        <SingleLine
          key={line.id}
          line={line}
          canApprove={canApprove}
          onUnmatch={onUnmatch}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
}
