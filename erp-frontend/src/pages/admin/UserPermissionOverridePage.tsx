/**
 * pages/admin/UserPermissionOverridePage.tsx
 *
 * Admin page for viewing and managing per-user permission overrides.
 *
 * Layout
 * ──────
 * • User selector at the top
 * • Role baseline (greyed) card
 * • Active overrides table with elevation badges, expiry countdown, grant reason
 * • "Grant Override" modal
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
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

const EXPIRY_LABELS: Record<string, string> = {
  permanent: 'Permanent',
  date:      'Date',
  datetime:  'Date/Time',
  duration:  'Duration',
};

function ExpiryBadge({ override }: { override: UserPermissionOverride }) {
  if (override.expiry_type === 'permanent') {
    return <span className="text-xs text-gray-400">Permanent</span>;
  }
  const hours = override.hours_until_expiry;
  if (hours === null || hours === undefined) return null;
  const color = hours < 2 ? 'bg-red-100 text-red-700' : hours < 24 ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700';
  return (
    <span className={`text-xs px-2 py-0.5 rounded ${color}`}>
      {hours < 1 ? '< 1h' : `${Math.round(hours)}h`} left
    </span>
  );
}

function ElevationBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded font-medium">
      ⚠ Elevated
    </span>
  );
}

function FlagPills({ override }: { override: UserPermissionOverride }) {
  const flags = [
    { key: 'can_view',   label: 'View' },
    { key: 'can_create', label: 'Create' },
    { key: 'can_edit',   label: 'Edit' },
    { key: 'can_delete', label: 'Delete' },
    { key: 'can_approve',label: 'Approve' },
    { key: 'can_export', label: 'Export' },
  ] as const;

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map(({ key, label }) => {
        const val = override[key];
        if (val === null || val === undefined) return null;
        return (
          <span
            key={key}
            className={`text-xs px-1.5 py-0.5 rounded ${
              val ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700 line-through'
            }`}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

// ── Grant Override Modal ───────────────────────────────────────────────────────

interface GrantModalProps {
  userId: number;
  onClose: () => void;
  onSaved: () => void;
}

const SCOPE_OPTIONS = [
  { value: '', label: '— Inherit from role —' },
  { value: 'global',           label: 'Global' },
  { value: 'own_branch',       label: 'Own Branch' },
  { value: 'assigned_clients', label: 'Assigned Clients' },
  { value: 'own_records',      label: 'Own Records' },
];

function GrantModal({ userId, onClose, onSaved }: GrantModalProps) {
  const [form, setForm] = useState<Partial<UserPermissionOverride>>({
    user: userId,
    expiry_type: 'permanent',
    expiry_behavior: 'auto_revoke',
    is_active: true,
    is_suspended: false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, val: unknown) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await rolePermissionService.createUserOverride(form as Omit<UserPermissionOverride, 'id'>);
      onSaved();
    } catch (err: any) {
      const msg = err?.response?.data?.detail ?? err?.message ?? 'Failed to save override.';
      setError(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 overflow-y-auto max-h-[90vh]">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">Grant Permission Override</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Permission flags */}
          <fieldset className="border rounded p-3 space-y-2">
            <legend className="text-sm font-medium text-gray-600 px-1">Permission Flags</legend>
            <p className="text-xs text-gray-400">Leave unchecked to inherit from role. Check to explicitly grant or deny.</p>
            <div className="grid grid-cols-3 gap-2">
              {(['can_view','can_create','can_edit','can_delete','can_approve','can_export'] as const).map(flag => (
                <label key={flag} className="flex items-center gap-2 text-sm capitalize cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form[flag] === true}
                    onChange={e => set(flag, e.target.checked ? true : null)}
                    className="rounded"
                  />
                  {flag.replace('can_', '')}
                </label>
              ))}
            </div>
          </fieldset>

          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Scope</label>
            <select
              value={form.scope ?? ''}
              onChange={e => set('scope', e.target.value || null)}
              className="w-full border rounded px-3 py-2 text-sm"
              title="Data Scope"
            >
              {SCOPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Approval limit */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Approval Limit (leave blank to inherit)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={form.approval_limit ?? ''}
              onChange={e => set('approval_limit', e.target.value || null)}
              placeholder="e.g. 500000"
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>

          {/* Expiry */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Type</label>
            <select
              value={form.expiry_type}
              onChange={e => set('expiry_type', e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
              title="Expiry Type"
            >
              <option value="permanent">Permanent</option>
              <option value="date">Expires on Date</option>
              <option value="datetime">Expires at Date/Time</option>
              <option value="duration">Expires After Hours</option>
            </select>
          </div>

          {form.expiry_type === 'date' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input type="date" title="Expiry Date" placeholder="YYYY-MM-DD" onChange={e => set('expires_at', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          )}

          {form.expiry_type === 'datetime' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date & Time</label>
              <input type="datetime-local" title="Expiry Date and Time" placeholder="YYYY-MM-DD HH:MM" onChange={e => set('expires_at', e.target.value)} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          )}

          {form.expiry_type === 'duration' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration (hours)</label>
              <input type="number" min={1} title="Duration in hours" placeholder="e.g. 48" onChange={e => set('expire_after_hours', parseInt(e.target.value))} className="w-full border rounded px-3 py-2 text-sm" />
            </div>
          )}

          {form.expiry_type !== 'permanent' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">On Expiry</label>
              <select
                value={form.expiry_behavior}
                onChange={e => set('expiry_behavior', e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
                title="Expiry Behavior"
              >
                <option value="auto_revoke">Auto-Revoke</option>
                <option value="auto_suspend">Auto-Suspend</option>
                <option value="alert_only">Alert Only (keep active)</option>
              </select>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Grant Reason</label>
            <textarea
              rows={2}
              value={form.grant_reason ?? ''}
              onChange={e => set('grant_reason', e.target.value)}
              placeholder="Why is this override needed?"
              className="w-full border rounded px-3 py-2 text-sm resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded border hover:bg-gray-50">Cancel</button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Grant Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

interface UserOption {
  id: number;
  email: string;
  full_name?: string;
}

export default function UserPermissionOverridePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    searchParams.get('user') ? Number(searchParams.get('user')) : null
  );
  const [overrides, setOverrides] = useState<UserPermissionOverride[]>([]);
  const [loading, setLoading] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Load users list
  useEffect(() => {
    // Use the existing users API endpoint
    import('@/services/api').then(({ api }) => {
      api.get('/users/staff-users/?limit=200').then((res: any) => {
        const list: UserOption[] = (res?.results ?? res ?? []).map((u: any) => ({
          id: u.id,
          email: u.email,
          full_name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email,
        }));
        setUsers(list);
      }).catch(() => {/* ignore */});
    });
  }, []);

  const loadOverrides = useCallback(async () => {
    if (!selectedUserId) return;
    setLoading(true);
    try {
      const data = await rolePermissionService.getUserOverrides({ user: selectedUserId });
      setOverrides(data);
    } catch {
      setOverrides([]);
    } finally {
      setLoading(false);
    }
  }, [selectedUserId]);

  useEffect(() => {
    loadOverrides();
  }, [loadOverrides]);

  useEffect(() => {
    if (selectedUserId) {
      setSearchParams({ user: String(selectedUserId) }, { replace: true });
    }
  }, [selectedUserId, setSearchParams]);

  const handleRevoke = async (id: number) => {
    if (!window.confirm('Revoke this override?')) return;
    setActionLoading(id);
    try {
      await rolePermissionService.revokeUserOverride(id, 'Revoked via admin panel');
      await loadOverrides();
    } finally {
      setActionLoading(null);
    }
  };

  const handleSuspend = async (id: number) => {
    setActionLoading(id);
    try {
      await rolePermissionService.suspendUserOverride(id);
      await loadOverrides();
    } finally {
      setActionLoading(null);
    }
  };

  const handleReinstate = async (id: number) => {
    setActionLoading(id);
    try {
      await rolePermissionService.reinstateUserOverride(id);
      await loadOverrides();
    } finally {
      setActionLoading(null);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Permission Overrides</h1>
          <p className="text-sm text-gray-500 mt-1">
            View and manage individual permission grants that extend or restrict role defaults.
          </p>
        </div>
        {selectedUserId && (
          <button
            onClick={() => setShowGrantModal(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
          >
            + Grant Override
          </button>
        )}
      </div>

      {/* User selector */}
      <div className="bg-white rounded-xl border p-4 space-y-2">
        <label className="block text-sm font-medium text-gray-700">Select User</label>
        <select
          value={selectedUserId ?? ''}
          onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : null)}
          className="w-full max-w-md border rounded-lg px-3 py-2 text-sm"
          title="Select User"
        >
          <option value="">— Choose a user —</option>
          {users.map(u => (
            <option key={u.id} value={u.id}>
              {u.full_name} ({u.email})
            </option>
          ))}
        </select>
      </div>

      {/* Overrides table */}
      {selectedUserId && (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">
              Overrides for {selectedUser?.full_name ?? `User #${selectedUserId}`}
            </h2>
            <span className="text-sm text-gray-400">
              {overrides.length} override{overrides.length !== 1 ? 's' : ''}
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
          ) : overrides.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">
              No overrides found for this user.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Target</th>
                    <th className="px-4 py-3 text-left">Flags</th>
                    <th className="px-4 py-3 text-left">Scope</th>
                    <th className="px-4 py-3 text-left">Limit</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Expiry</th>
                    <th className="px-4 py-3 text-left">Granted By</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overrides.map(o => (
                    <tr key={o.id} className={`hover:bg-gray-50 ${!o.is_currently_active ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">
                          {o.action_name ?? o.page_title ?? o.module_name ?? '(All)'}
                        </div>
                        {o.action_code && (
                          <div className="text-xs text-gray-400 font-mono">{o.action_code}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <FlagPills override={o} />
                      </td>
                      <td className="px-4 py-3">
                        {o.scope ? (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                            {SCOPE_LABELS[o.scope] ?? o.scope}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">inherit</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {o.approval_limit != null ? (
                          <span className="text-xs font-mono">
                            ₦{Number(o.approval_limit).toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">inherit</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {o.is_elevated && <ElevationBadge />}
                          {!o.is_active && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded">Revoked</span>
                          )}
                          {o.is_suspended && (
                            <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded">Suspended</span>
                          )}
                          {o.is_active && !o.is_suspended && !o.is_elevated && (
                            <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded">Active</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <ExpiryBadge override={o} />
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {o.granted_by_display ?? '—'}
                      </td>
                      <td className="px-4 py-3 max-w-[160px]">
                        <span className="text-xs text-gray-500 line-clamp-2">
                          {o.grant_reason || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {o.is_active && !o.is_suspended && (
                            <button
                              onClick={() => handleSuspend(o.id!)}
                              disabled={actionLoading === o.id}
                              className="text-xs px-2 py-1 border rounded hover:bg-yellow-50 text-yellow-600 border-yellow-200"
                            >
                              Suspend
                            </button>
                          )}
                          {o.is_suspended && (
                            <button
                              onClick={() => handleReinstate(o.id!)}
                              disabled={actionLoading === o.id}
                              className="text-xs px-2 py-1 border rounded hover:bg-green-50 text-green-600 border-green-200"
                            >
                              Reinstate
                            </button>
                          )}
                          {o.is_active && (
                            <button
                              onClick={() => handleRevoke(o.id!)}
                              disabled={actionLoading === o.id}
                              className="text-xs px-2 py-1 border rounded hover:bg-red-50 text-red-600 border-red-200"
                            >
                              Revoke
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Grant modal */}
      {showGrantModal && selectedUserId && (
        <GrantModal
          userId={selectedUserId}
          onClose={() => setShowGrantModal(false)}
          onSaved={() => {
            setShowGrantModal(false);
            loadOverrides();
          }}
        />
      )}
    </div>
  );
}
