import React from 'react';
import type { PaymentTraceLeg } from '../../../types/banks';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

export function JournalEntryView({ legs }: { legs: PaymentTraceLeg[] }) {
  if (legs.length === 0) return null;

  const debits = legs.filter(l => l.side === 'DR');
  const credits = legs.filter(l => l.side === 'CR');

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {debits.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Debit
          </div>
          <div className="space-y-1">
            {debits.map((leg, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded bg-red-50 px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-700">
                  <span className="font-mono text-gray-500">{leg.account_code}</span>{' '}
                  {leg.account_name}
                </span>
                <span className="font-medium text-red-700">{formatAmount(leg.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {credits.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
            Credit
          </div>
          <div className="space-y-1">
            {credits.map((leg, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded bg-green-50 px-2.5 py-1.5 text-xs"
              >
                <span className="text-gray-700">
                  <span className="font-mono text-gray-500">{leg.account_code}</span>{' '}
                  {leg.account_name}
                </span>
                <span className="font-medium text-green-700">{formatAmount(leg.amount)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
