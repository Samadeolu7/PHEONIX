import React from 'react';

export interface SearchSummaryData {
  payments: number;
  statementLines: number;
  currentMatches: number;
  historicalMatches: number;
  openExceptions: number;
  resolvedExceptions: number;
  reversals: number;
}

const STATS = [
  { key: 'payments' as const, label: 'Payments', color: 'bg-blue-100 text-blue-700' },
  { key: 'statementLines' as const, label: 'Statement Lines', color: 'bg-gray-100 text-gray-700' },
  {
    key: 'currentMatches' as const,
    label: 'Current Matches',
    color: 'bg-green-100 text-green-700',
  },
  { key: 'historicalMatches' as const, label: 'Historical', color: 'bg-amber-100 text-amber-700' },
  { key: 'openExceptions' as const, label: 'Open Exceptions', color: 'bg-red-100 text-red-700' },
  { key: 'resolvedExceptions' as const, label: 'Resolved', color: 'bg-green-100 text-green-700' },
  { key: 'reversals' as const, label: 'Reversals', color: 'bg-red-100 text-red-700' },
];

export function SearchSummary({ summary }: { summary: SearchSummaryData }) {
  return (
    <div className="flex flex-wrap gap-2">
      {STATS.map(s => {
        const value = summary[s.key];
        if (s.key === 'reversals' && value === 0) return null;
        return (
          <span
            key={s.key}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${s.color}`}
          >
            {s.label}: {value}
          </span>
        );
      })}
    </div>
  );
}
