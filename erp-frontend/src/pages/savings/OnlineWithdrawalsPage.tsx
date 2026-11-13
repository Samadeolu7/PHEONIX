/**
 * Withdrawal requests that clients sent from the online portal.
 *
 * Nothing is paid from here. "Forward for approval" creates a normal savings
 * withdrawal request in your name (you must be the client's account manager
 * or officer if the product requires it), which then follows the usual
 * approval tiers, notice period and disbursement in Savings → Withdrawals.
 *
 * Route: /savings/online-withdrawals   Permission: savings / savings-withdrawals
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Globe, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../services/api';

interface Row {
  id: number;
  reference: string;
  client_name: string;
  client_code: string;
  client_id: number;
  account_number: string;
  branch_name: string | null;
  amount: number;
  payout_preference_display: string;
  reason: string;
  status: 'submitted' | 'forwarded' | 'declined' | 'cancelled';
  status_display: string;
  submitted_at: string;
  customer_email: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  customer_message: string;
  staff_notes: string;
  forwarded_request: number | null;
  forwarded_status: string | null;
  balance_now: { balance: number; available: number; minimum_balance: number } | null;
}

const naira = (v: unknown) =>
  `₦${Number(v || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const BADGE: Record<Row['status'], string> = {
  submitted: 'bg-blue-100 text-blue-700',
  forwarded: 'bg-green-100 text-green-700',
  declined: 'bg-red-100 text-red-700',
  cancelled: 'bg-gray-100 text-gray-600',
};

function errText(e: unknown): string {
  const err = e as { status?: number; response?: { data?: Record<string, unknown> } };
  if (err?.status === 403) return 'You do not have permission for this action.';
  const d = err?.response?.data;
  if (!d) return 'Request failed.';
  if (typeof d.detail === 'string') return d.detail;
  return Object.values(d).flat().map(String).join(' ');
}

export default function OnlineWithdrawalsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState('submitted');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [declining, setDeclining] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await api.get('/portal/staff/withdrawals/', {
        params: { status, page_size: 100 },
      });
      setRows(res?.results ?? res ?? []);
    } catch (e) {
      setError(errText(e));
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (
    id: number,
    path: 'forward' | 'decline',
    body: Record<string, string> = {}
  ) => {
    setBusyId(id);
    setError('');
    try {
      await api.post(`/portal/staff/withdrawals/${id}/${path}/`, body);
      setDeclining(null);
      setMessage('');
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-1">
        <Link to="/savings" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Globe className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-semibold">Online Withdrawal Requests</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Requests clients sent from the online portal. Confirm with the client first, then forward.
        Forwarding creates a normal withdrawal request that goes through the usual approvals and
        payout in{' '}
        <Link to="/savings/withdrawals" className="underline">
          Savings Withdrawal
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['submitted', 'Waiting'],
          ['forwarded', 'Forwarded'],
          ['declined', 'Declined'],
          ['cancelled', 'Cancelled by client'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatus(v)}
            className={`px-3 py-1.5 rounded-full text-sm border ${status === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
          >
            {l}
          </button>
        ))}
        <button onClick={load} className="p-2 rounded border bg-white ml-auto" aria-label="Refresh">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-3">{error}</div>}
      {rows.length === 0 && <p className="text-sm text-gray-500">No requests.</p>}

      <div className="space-y-3">
        {rows.map(r => (
          <div key={r.id} className="bg-white border rounded-lg p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-medium">
                  <Link to={`/clients/${r.client_id}`} className="hover:underline">
                    {r.client_name}
                  </Link>{' '}
                  <span className="text-xs text-gray-500">({r.client_code})</span>
                </div>
                <div className="text-xs text-gray-500">
                  {r.reference} · {r.account_number} · {r.branch_name} ·{' '}
                  {new Date(r.submitted_at).toLocaleString('en-NG')}
                </div>
              </div>
              <div className="text-right">
                <div className="text-lg font-semibold">{naira(r.amount)}</div>
                <span className={`px-2 py-0.5 rounded-full text-xs ${BADGE[r.status]}`}>
                  {r.status_display}
                </span>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-700">
              Prefers: {r.payout_preference_display}
              {r.reason && <> · Reason: {r.reason}</>}
            </div>
            {r.balance_now && (
              <div className="mt-1 text-xs text-gray-500">
                Balance now {naira(r.balance_now.balance)} · available{' '}
                {naira(r.balance_now.available)}
                {Number(r.balance_now.minimum_balance) > 0 && (
                  <> · minimum {naira(r.balance_now.minimum_balance)}</>
                )}
              </div>
            )}
            {r.status === 'forwarded' && (
              <div className="mt-2 text-xs text-gray-600">
                Forwarded by {r.reviewed_by_name} — workflow status:{' '}
                <strong>{r.forwarded_status}</strong>
              </div>
            )}
            {r.status === 'declined' && r.customer_message && (
              <div className="mt-2 text-xs text-gray-600">Told client: {r.customer_message}</div>
            )}

            {r.status === 'submitted' &&
              (declining === r.id ? (
                <div className="mt-3 bg-gray-50 rounded p-3">
                  <label className="block text-xs text-gray-500 mb-1">
                    Message to the client (they will see this)
                  </label>
                  <textarea
                    rows={2}
                    maxLength={1000}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    className="w-full border rounded p-2 text-sm mb-2"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busyId === r.id || !message.trim()}
                      onClick={() => act(r.id, 'decline', { customer_message: message })}
                      className="px-3 py-1.5 text-sm rounded bg-red-600 text-white disabled:opacity-50"
                    >
                      Decline request
                    </button>
                    <button
                      onClick={() => setDeclining(null)}
                      className="px-3 py-1.5 text-sm rounded border"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Forward ${naira(r.amount)} for ${r.client_name} into the withdrawal approval workflow? Confirm with the client first.`
                        )
                      )
                        act(r.id, 'forward');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded bg-green-600 text-white disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> Forward for approval
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => {
                      setDeclining(r.id);
                      setMessage('');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm rounded border text-red-700"
                  >
                    <XCircle className="w-4 h-4" /> Decline
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}
