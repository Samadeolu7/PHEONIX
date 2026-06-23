import React, { useState } from 'react';
import { Lock, AlertTriangle, Loader2, CheckCircle } from 'lucide-react';
import { api } from '../../services/api';

export default function CloseYearPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const [confirm, setConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const confirmPhrase = `CLOSE ${year}`;

  async function handleClose() {
    if (confirmText !== confirmPhrase) return;
    setLoading(true);
    setError('');
    try {
      await api.post('/accounts/periods/close-year/', { year });
      setSuccess(`Financial year ${year} has been closed successfully. All accounts are now locked for this period.`);
      setConfirm(false);
      setConfirmText('');
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ??
        'Failed to close year. Ensure all accounting periods for the year are closed first.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Close Financial Year</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lock all accounting periods for the selected year and carry forward balances.
          </p>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-800">
            <p className="font-semibold mb-1">Warning — Permanent Action</p>
            <ul className="list-disc list-inside space-y-1">
              <li>All accounting periods for {year} will be locked</li>
              <li>No further journal entries can be posted to this year</li>
              <li>Retained earnings will be carried forward automatically</li>
              <li>This action requires Principal / Director authorization</li>
            </ul>
          </div>
        </div>

        {success && (
          <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm mb-4">
            <CheckCircle className="w-5 h-5 shrink-0" />
            <div>{success}</div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Financial Year to Close</label>
          <select
            value={year}
            onChange={e => { setYear(Number(e.target.value)); setConfirm(false); setConfirmText(''); }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            disabled={loading}
          >
            {[currentYear - 1, currentYear - 2, currentYear - 3].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {!confirm ? (
          <button
            onClick={() => setConfirm(true)}
            disabled={!!success}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 disabled:opacity-50"
          >
            <Lock className="w-5 h-5" /> Close Year {year}
          </button>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-red-200 p-5">
            <p className="text-sm text-gray-700 mb-3">
              Type <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono">{confirmPhrase}</code> to confirm:
            </p>
            <input
              type="text"
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder={confirmPhrase}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono mb-3 focus:outline-none focus:ring-2 focus:ring-red-300"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setConfirm(false); setConfirmText(''); }}
                className="flex-1 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                disabled={confirmText !== confirmPhrase || loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                Confirm — Close {year}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
