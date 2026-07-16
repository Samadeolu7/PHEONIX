import React, { useEffect, useState } from 'react';
import { ShieldAlert, History } from 'lucide-react';
import { reconciliationService } from '../../services/reconciliationService';
import type { ManualOverrideEvent } from '../../types/banks';

const TYPE_LABELS: Record<ManualOverrideEvent['type'], string> = {
  unmatch: 'Unmatch',
  netted: 'Netted',
  resolve_to_expense: 'Posted to Expense',
};

const TYPE_STYLES: Record<ManualOverrideEvent['type'], string> = {
  unmatch: 'bg-red-100 text-red-800',
  netted: 'bg-purple-100 text-purple-800',
  resolve_to_expense: 'bg-amber-100 text-amber-800',
};

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Audit trail for the three most abuse-prone manual reconciliation
 * pathways added alongside the resolve-flexibility features — unmatch,
 * link-resolve (netting), and resolve-to-expense. Each is otherwise only
 * visible by digging through individual reconciliations one at a time.
 */
const ManualOverridesReportPage: React.FC = () => {
  const [events, setEvents] = useState<ManualOverrideEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ManualOverrideEvent['type']>('all');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await reconciliationService.getManualOverridesReport({
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      });
      setEvents(data.results);
    } catch (err: any) {
      setError(err.message || 'Failed to load the manual overrides report');
    } finally {
      setLoading(false);
    }
  };

  const visibleEvents = events.filter((e) => typeFilter === 'all' || e.type === typeFilter);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ShieldAlert className="w-7 h-7 text-blue-600" />
        <h1 className="text-3xl font-bold text-gray-900">Manual Overrides</h1>
      </div>
      <p className="text-gray-600 mb-6">
        Every unmatch, netted (linked) resolution, and post-to-expense action across
        reconciliations you have access to — who did it, when, and why. These are the
        manual pathways most worth a second look, not a verdict on any of them.
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
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All</option>
            <option value="unmatch">Unmatch</option>
            <option value="netted">Netted</option>
            <option value="resolve_to_expense">Posted to Expense</option>
          </select>
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

      {!loading && !error && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {visibleEvents.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No manual overrides yet</h3>
              <p className="text-gray-600">
                Unmatches, netted resolutions, and expense postings will show up here as they happen.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {visibleEvents.map((event) => (
                <li key={`${event.type}-${event.reference_id}`} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${TYPE_STYLES[event.type]}`}
                        >
                          {TYPE_LABELS[event.type]}
                        </span>
                        <span className="text-xs text-gray-400">{event.direction}</span>
                        {event.actor_name && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                            {event.actor_name}
                          </span>
                        )}
                        {event.type === 'resolve_to_expense' && (
                          <span className="text-xs text-gray-500">
                            {event.payment_number} · {event.payment_status}
                            {event.exception_resolved ? ' · closed' : ' · awaiting match'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-900 mt-1 truncate">{event.narration || '—'}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {formatAmount(event.amount)} · {event.bank_account_name || `Account #${event.bank_account_id}`}{' '}
                        · {new Date(event.action_at).toLocaleString()}
                      </p>
                      {event.reason && (
                        <p className="text-xs text-gray-500 mt-1 italic">"{event.reason}"</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default ManualOverridesReportPage;
