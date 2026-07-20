import React, { useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, Unlink, AlertTriangle } from 'lucide-react';
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

function MatchedLineCard({
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
    <div className="rounded border border-green-200 bg-green-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-xs font-semibold text-green-700">Current Match</span>
          {line.match_confidence && (
            <span className="rounded bg-green-200 px-1.5 py-0.5 text-[10px] font-medium text-green-800">
              {line.match_confidence}
            </span>
          )}
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
        {line.matched_at && (
          <>
            <div className="text-gray-500">Matched At</div>
            <div className="text-gray-800">
              {new Date(line.matched_at).toLocaleDateString('en-GB', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </>
        )}
      </div>

      {line.narration && <div className="mt-2 text-xs text-gray-600">{line.narration}</div>}

      {canApprove && line.reconciliation_id && (
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

      {canApprove && !line.reconciliation_id && (
        <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
          <AlertTriangle className="h-3 w-3" /> No reconciliation record — unmatch unavailable
        </div>
      )}
    </div>
  );
}

function HistoricalLineCard({
  line,
  onNavigate,
}: {
  line: PaymentTraceLine;
  onNavigate: (reconciliationId: number) => void;
}) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-xs font-semibold text-amber-700">Historical Match</span>
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
        <div className="text-gray-500">Amount</div>
        <div className="font-medium text-gray-800">{formatAmount(line.amount)}</div>
        <div className="text-gray-500">Value Date</div>
        <div className="text-gray-800">{line.value_date}</div>
      </div>

      {line.narration && <div className="mt-2 text-xs text-gray-600">{line.narration}</div>}

      {(line.unmatched_by || line.unmatched_reason) && (
        <div className="mt-2 rounded bg-amber-100 p-2 text-xs">
          {line.unmatched_by && (
            <div className="text-amber-700">
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
            </div>
          )}
          {line.unmatched_reason && (
            <div className="mt-1 text-amber-600">{line.unmatched_reason}</div>
          )}
        </div>
      )}
    </div>
  );
}

export function MatchSection({
  currentMatches,
  historicalMatches,
  canApprove,
  onUnmatch,
  onNavigate,
}: {
  currentMatches: PaymentTraceLine[];
  historicalMatches: PaymentTraceLine[];
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  if (currentMatches.length === 0 && historicalMatches.length === 0) {
    return (
      <div className="text-xs italic text-gray-400">
        No statement line currently or previously matched this payment.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {currentMatches.length > 0 && (
        <div className="space-y-2">
          {currentMatches.map(line => (
            <MatchedLineCard
              key={line.id}
              line={line}
              canApprove={canApprove}
              onUnmatch={onUnmatch}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {historicalMatches.length > 0 && (
        <div className="space-y-2">
          {historicalMatches.map(line => (
            <HistoricalLineCard key={line.id} line={line} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}
