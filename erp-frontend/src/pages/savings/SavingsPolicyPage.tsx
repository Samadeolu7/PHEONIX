/**
 * Savings Policy Page
 * View and update the compulsory savings policy (mandatory contribution amount).
 * Only Finance Officers / Administrators should be able to edit.
 */

import React, { useEffect, useState } from 'react';
import { Shield, Loader2, AlertCircle, CheckCircle, Edit2, X, Save } from 'lucide-react';
import {
  getCompulsorySavingsPolicies,
  updateCompulsorySavingsPolicy,
  createCompulsorySavingsPolicy,
  CompulsorySavingsPolicy,
} from '../../services/savingsService';

export default function SavingsPolicyPage() {
  const [policies, setPolicies] = useState<CompulsorySavingsPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState<number | null>(null); // id of policy being edited
  const [draftAmount, setDraftAmount] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  // New policy state
  const [showNew, setShowNew] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newEnabled, setNewEnabled] = useState(true);

  useEffect(() => {
    setLoading(true);
    getCompulsorySavingsPolicies()
      .then(data => setPolicies(data))
      .catch(e => {
        const err = e as { detail?: string; message?: string };
        setError(err?.detail ?? err?.message ?? 'Failed to load policy.');
      })
      .finally(() => setLoading(false));
  }, []);

  function startEdit(p: CompulsorySavingsPolicy) {
    setEditing(p.id);
    setDraftAmount(p.amount);
    setDraftEnabled(p.enabled);
    setSuccess(null);
    setError(null);
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(id: number) {
    const amt = parseFloat(draftAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateCompulsorySavingsPolicy(id, {
        amount: draftAmount,
        enabled: draftEnabled,
      });
      setPolicies(prev => prev.map(p => (p.id === id ? updated : p)));
      setEditing(null);
      setSuccess('Policy updated successfully.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to save policy.');
    } finally {
      setSaving(false);
    }
  }

  async function createNew() {
    const amt = parseFloat(newAmount);
    if (isNaN(amt) || amt <= 0) {
      setError('Amount must be a positive number.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createCompulsorySavingsPolicy({ amount: newAmount, enabled: newEnabled });
      setPolicies(prev => [...prev, created]);
      setShowNew(false);
      setNewAmount('');
      setNewEnabled(true);
      setSuccess('Policy created successfully.');
      setTimeout(() => setSuccess(null), 4000);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setError(err?.detail ?? err?.message ?? 'Failed to create policy.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-teal-100 flex items-center justify-center">
              <Shield className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Compulsory Savings Policy</h1>
              <p className="text-xs text-gray-500">Set the mandatory contribution amount for all members</p>
            </div>
          </div>
          {!showNew && (
            <button
              onClick={() => { setShowNew(true); setError(null); setSuccess(null); }}
              className="text-sm bg-teal-600 text-white rounded-lg px-3 py-1.5 hover:bg-teal-700 transition-colors"
            >
              + New Policy
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-6 space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{success}</p>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-teal-500" />
          </div>
        )}

        {/* New policy form */}
        {showNew && (
          <div className="bg-white rounded-xl border border-teal-200 p-5">
            <h2 className="text-sm font-semibold text-gray-800 mb-4">New Compulsory Savings Policy</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contribution Amount (₦)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmount}
                  onChange={e => setNewAmount(e.target.value)}
                  placeholder="e.g. 500.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                />
              </div>
              <div className="flex items-center gap-2 pt-5">
                <input
                  id="new-enabled"
                  type="checkbox"
                  checked={newEnabled}
                  onChange={e => setNewEnabled(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="new-enabled" className="text-sm text-gray-700">Enabled</label>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createNew}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm bg-teal-600 text-white rounded-lg px-4 py-2 hover:bg-teal-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              <button
                onClick={() => { setShowNew(false); setError(null); }}
                className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing policies */}
        {!loading && policies.map(p => (
          <div key={p.id} className="bg-white rounded-xl border border-gray-200 p-5">
            {editing === p.id ? (
              <>
                <h2 className="text-sm font-semibold text-gray-800 mb-4">Edit Policy #{p.id}</h2>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Contribution Amount (₦)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draftAmount}
                      onChange={e => setDraftAmount(e.target.value)}
                      title="Contribution amount in naira"
                      placeholder="e.g. 500.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-5">
                    <input
                      id={`enabled-${p.id}`}
                      type="checkbox"
                      checked={draftEnabled}
                      onChange={e => setDraftEnabled(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor={`enabled-${p.id}`} className="text-sm text-gray-700">Enabled</label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(p.id)}
                    disabled={saving}
                    className="flex items-center gap-1.5 text-sm bg-teal-600 text-white rounded-lg px-4 py-2 hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save
                  </button>
                  <button
                    onClick={cancelEdit}
                    className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg px-4 py-2 hover:bg-gray-50 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xl font-bold text-gray-900">
                      ₦{parseFloat(p.amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {p.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Policy #{p.id} &middot; Created {new Date(p.created_at).toLocaleDateString()}
                    {p.updated_at !== p.created_at && ` · Updated ${new Date(p.updated_at).toLocaleDateString()}`}
                  </p>
                </div>
                <button
                  onClick={() => startEdit(p)}
                  className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit
                </button>
              </div>
            )}
          </div>
        ))}

        {!loading && policies.length === 0 && !showNew && (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <div className="w-12 h-12 rounded-xl bg-teal-50 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-teal-400" />
            </div>
            <p className="text-sm font-medium text-gray-700">No compulsory savings policy set</p>
            <p className="text-xs text-gray-400 mt-1">Click "New Policy" to create one.</p>
          </div>
        )}
      </div>
    </div>
  );
}
