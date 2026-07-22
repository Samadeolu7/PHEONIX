import React, { useState } from 'react';
import { useElevationLog } from '../../hooks/useRolePermissions';

interface ElevationLogEntry {
  id: number;
  user: number;
  user_display: string;
  override: number | null;
  override_summary: string | null;
  action_code: string;
  record_type: string;
  record_id: string;
  branch: number | null;
  branch_name: string | null;
  scope_used: string;
  approval_amount: string | null;
  field_changes: Record<string, { before: unknown; after: unknown }>;
  logged_at: string;
}

const SCOPE_LABELS: Record<string, string> = {
  global:           'Global',
  own_branch:       'Own Branch',
  assigned_clients: 'Assigned Clients',
  ajo_group:        'Ajo Group',
  own_records:      'Own Records',
};

function FieldChangesBadge({ changes }: { changes: Record<string, { before: unknown; after: unknown }> }) {
  const keys = Object.keys(changes);
  if (!keys.length) return <span className="text-xs text-gray-400">—</span>;

  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-blue-600 hover:underline">
        {keys.length} field{keys.length > 1 ? 's' : ''} changed
      </summary>
      <div className="mt-1 space-y-1 pl-2 border-l-2 border-blue-100">
        {keys.map(k => (
          <div key={k}>
            <span className="font-mono text-gray-500">{k}:</span>{' '}
            <span className="text-red-500 line-through">{String(changes[k].before ?? '—')}</span>
            {' → '}
            <span className="text-green-600">{String(changes[k].after ?? '—')}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function PermissionElevationLogPage() {
  const [filterUser, setFilterUser] = useState('');
  const [filterRecordType, setFilterRecordType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [paramsApplied, setParamsApplied] = useState<Record<string, string>>({});

  const { data: entries = [], isLoading: loading } = useElevationLog(
    Object.keys(paramsApplied).length > 0 ? paramsApplied : undefined
  );

  const displayed = filterUser
    ? entries.filter((e: ElevationLogEntry) =>
        (e.user_display ?? '').toLowerCase().includes(filterUser.toLowerCase())
      )
    : entries;

  const recordTypes = Array.from(new Set(entries.map((e: ElevationLogEntry) => e.record_type))).sort();

  const handleApply = () => {
    const params: Record<string, string> = {};
    if (filterRecordType) params.record_type = filterRecordType;
    if (filterFrom) params.from = filterFrom;
    if (filterTo) params.to = filterTo;
    setParamsApplied(params);
  };

  const handleClear = () => {
    setFilterUser('');
    setFilterRecordType('');
    setFilterFrom('');
    setFilterTo('');
    setParamsApplied({});
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Permission Elevation Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          Immutable audit trail of every action performed while a user held an elevated override.
          Records cannot be edited or deleted.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">User (client-side filter)</label>
          <input
            type="text"
            title="Filter by user name or email"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            placeholder="Search user…"
            className="border rounded-lg px-3 py-1.5 text-sm w-44"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Record Type</label>
          <select
            title="Filter by record type"
            value={filterRecordType}
            onChange={e => setFilterRecordType(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm w-44"
          >
            <option value="">All types</option>
            {recordTypes.map(rt => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
          <input
            type="date"
            title="Filter from date"
            placeholder="YYYY-MM-DD"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
          <input
            type="date"
            title="Filter to date"
            placeholder="YYYY-MM-DD"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={handleApply}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Apply
        </button>
        {(filterRecordType || filterFrom || filterTo || filterUser) && (
          <button
            onClick={handleClear}
            className="px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50 text-gray-500"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="text-sm text-gray-500">
        Showing <strong className="text-gray-800">{displayed.length}</strong> of{' '}
        <strong className="text-gray-800">{entries.length}</strong> entries
        {entries.length >= 500 && (
          <span className="ml-2 text-amber-600">(capped at 500 — narrow your date range)</span>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : displayed.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            No elevation log entries found for the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Timestamp</th>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Action</th>
                  <th className="px-4 py-3 text-left">Record</th>
                  <th className="px-4 py-3 text-left">Branch</th>
                  <th className="px-4 py-3 text-left">Scope</th>
                  <th className="px-4 py-3 text-left">Amount</th>
                  <th className="px-4 py-3 text-left">Changes</th>
                  <th className="px-4 py-3 text-left">Override</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.map((e: ElevationLogEntry) => (
                  <tr key={e.id} className="hover:bg-amber-50/20">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                      {formatDate(e.logged_at)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{e.user_display}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                        {e.action_code}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-700">{e.record_type}</div>
                      <div className="text-xs text-gray-400 font-mono">#{e.record_id}</div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {e.branch_name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      {e.scope_used ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {SCOPE_LABELS[e.scope_used] ?? e.scope_used}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {e.approval_amount != null
                        ? `₦${Number(e.approval_amount).toLocaleString()}`
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <FieldChangesBadge changes={e.field_changes ?? {}} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[140px]">
                      <span className="line-clamp-2">{e.override_summary ?? '—'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Immutability notice */}
      <div className="bg-gray-50 border rounded-xl p-4 text-xs text-gray-500">
        <strong>Note:</strong> These records are immutable. They cannot be edited, deleted, or
        backdated. Each entry is written automatically when an elevated action is executed.
      </div>
    </div>
  );
}
