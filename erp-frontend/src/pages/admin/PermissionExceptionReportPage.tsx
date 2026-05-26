/**
 * pages/admin/PermissionExceptionReportPage.tsx
 *
 * Shows all active elevated permission overrides across the tenant.
 * An "exception" is any override where the user's grant EXCEEDS their
 * role baseline (is_elevated = true).
 *
 * Data source: GET /api/permissions/exception-report/
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  rolePermissionService,
  UserPermissionOverride,
} from '@/services/rolePermissionService';

// ── Helpers ───────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<string, string> = {
  global:           'Global',
  own_branch:       'Own Branch',
  assigned_clients: 'Assigned Clients',
  ajo_group:        'Ajo Group',
  own_records:      'Own Records',
};

function ExpiryCell({ override }: { override: UserPermissionOverride }) {
  if (override.expiry_type === 'permanent') {
    return <span className="text-xs text-gray-400">Permanent</span>;
  }
  const expires = override.effective_expires_at;
  if (!expires) return <span className="text-xs text-gray-400">—</span>;

  const date = new Date(expires);
  const hours = override.hours_until_expiry;
  const color =
    hours !== undefined && hours !== null && hours < 2
      ? 'text-red-600'
      : hours !== undefined && hours !== null && hours < 24
      ? 'text-yellow-600'
      : 'text-gray-600';

  return (
    <div>
      <div className={`text-xs font-medium ${color}`}>
        {date.toLocaleDateString()} {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </div>
      {hours !== null && hours !== undefined && (
        <div className={`text-xs ${color}`}>
          {hours < 1 ? '< 1h' : `${Math.round(hours)}h`} remaining
        </div>
      )}
    </div>
  );
}

function ElevatedFields({ fields }: { fields: string[] }) {
  if (!fields?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {fields.map(f => (
        <span key={f} className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
          {f.replace('can_', '')}
        </span>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PermissionExceptionReportPage() {
  const [data, setData] = useState<UserPermissionOverride[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState('');
  const [filterExpiry, setFilterExpiry] = useState('all'); // 'all' | 'expiring24h' | 'permanent'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await rolePermissionService.getExceptionReport();
      setData(items);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = data.filter(o => {
    if (filterUser) {
      const name = o.user_display ?? String(o.user);
      if (!name.toLowerCase().includes(filterUser.toLowerCase())) return false;
    }
    if (filterExpiry === 'expiring24h') {
      if (o.expiry_type === 'permanent') return false;
      const hours = o.hours_until_expiry;
      if (hours === null || hours === undefined || hours > 24) return false;
    }
    if (filterExpiry === 'permanent') {
      if (o.expiry_type !== 'permanent') return false;
    }
    return true;
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Permission Exception Report</h1>
          <p className="text-sm text-gray-500 mt-1">
            Active overrides where user permissions exceed their role baseline.
            These require monitoring per your access control policy.
          </p>
        </div>
        <button
          onClick={load}
          className="text-sm px-3 py-2 border rounded-lg hover:bg-gray-50 text-gray-600"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-3xl font-bold text-amber-600">{data.length}</div>
          <div className="text-sm text-gray-500 mt-1">Total Elevated Overrides</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-3xl font-bold text-red-600">
            {data.filter(o => {
              const h = o.hours_until_expiry;
              return o.expiry_type !== 'permanent' && h !== null && h !== undefined && h <= 24;
            }).length}
          </div>
          <div className="text-sm text-gray-500 mt-1">Expiring Within 24h</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-3xl font-bold text-blue-600">
            {data.filter(o => o.expiry_type === 'permanent').length}
          </div>
          <div className="text-sm text-gray-500 mt-1">Permanent Elevations</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border rounded-xl p-4 flex gap-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Filter by User</label>
          <input
            type="text"
            value={filterUser}
            onChange={e => setFilterUser(e.target.value)}
            placeholder="Search name or email…"
            className="border rounded-lg px-3 py-1.5 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Expiry</label>
          <select
            value={filterExpiry}
            onChange={e => setFilterExpiry(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm"
            title="Filter by Expiry"
          >
            <option value="all">All</option>
            <option value="expiring24h">Expiring in 24h</option>
            <option value="permanent">Permanent only</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b bg-amber-50 flex items-center gap-2">
          <span className="text-amber-600 font-medium text-sm">
            ⚠ {filtered.length} elevated override{filtered.length !== 1 ? 's' : ''}
          </span>
          {filtered.length < data.length && (
            <span className="text-xs text-gray-400">(filtered from {data.length} total)</span>
          )}
        </div>

        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            {data.length === 0
              ? '✓ No elevated overrides found. All users are within their role baseline.'
              : 'No overrides match the current filter.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">User</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Elevated Fields</th>
                  <th className="px-4 py-3 text-left">Scope</th>
                  <th className="px-4 py-3 text-left">Approval Limit</th>
                  <th className="px-4 py-3 text-left">Expiry</th>
                  <th className="px-4 py-3 text-left">Granted By</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(o => (
                  <tr key={o.id} className="hover:bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-800">{o.user_display ?? `#${o.user}`}</div>
                      <Link
                        to={`/admin/user-overrides?user=${o.user}`}
                        className="text-xs text-blue-500 hover:underline"
                      >
                        View all overrides →
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-gray-800">
                        {o.action_name ?? o.page_title ?? o.module_name ?? '(Global)'}
                      </div>
                      {o.action_code && (
                        <div className="text-xs text-gray-400 font-mono">{o.action_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {/* Backend doesn't return elevated_fields on list—show badge */}
                      <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
                        ⚠ Elevated
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {o.scope ? (
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                          {SCOPE_LABELS[o.scope] ?? o.scope}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {o.approval_limit != null ? (
                        <span className="text-xs font-mono font-semibold text-gray-800">
                          ₦{Number(o.approval_limit).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ExpiryCell override={o} />
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {o.granted_by_display ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/admin/user-overrides?user=${o.user}`}
                        className="text-xs px-2 py-1 border rounded hover:bg-blue-50 text-blue-600 border-blue-200"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Guidance note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700">
        <strong>Audit Note:</strong> All elevated overrides are logged in the Permission Elevation Log.
        Review permanent elevations periodically and revoke any that are no longer business-justified.
      </div>
    </div>
  );
}
