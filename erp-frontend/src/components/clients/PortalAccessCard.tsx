/**
 * "Online portal access" for a client: shows whether they have a portal
 * account and lets staff email them a single-use invitation to set one up.
 * Invitations are the default (and, unless open sign-up is enabled, the
 * only) way to create a customer portal account.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Mail, RefreshCw, XCircle } from 'lucide-react';
import { api } from '../../services/api';

interface Invite {
  id: number;
  email: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
  created_by_name: string | null;
}

interface Access {
  account: {
    email: string;
    is_active: boolean;
    created_at: string;
    last_login: string | null;
  } | null;
  invitations: Invite[];
}

const BADGE: Record<Invite['status'], string> = {
  pending: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  revoked: 'bg-gray-100 text-gray-600',
  expired: 'bg-amber-100 text-amber-700',
};

const fmt = (d: string | null) =>
  d
    ? new Date(d).toLocaleString('en-NG', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function errText(e: unknown): string {
  const err = e as { status?: number; response?: { data?: Record<string, unknown> } };
  if (err?.status === 403) return 'You do not have permission to manage online access.';
  const d = err?.response?.data;
  if (!d) return 'Request failed.';
  if (typeof d.detail === 'string') return d.detail;
  return Object.values(d).flat().map(String).join(' ');
}

export default function PortalAccessCard({
  clientId,
  defaultEmail,
}: {
  clientId: number;
  defaultEmail?: string | null;
}) {
  const [access, setAccess] = useState<Access | null>(null);
  const [blocked, setBlocked] = useState<'' | 'permission' | 'scope'>('');
  const [email, setEmail] = useState(defaultEmail || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      setAccess(
        await api.get('/portal/staff/invitations/for-client/', { params: { client: clientId } })
      );
    } catch (e) {
      // Explain why instead of hiding — staff otherwise can't tell what's missing.
      const status = (e as { status?: number })?.status;
      if (status === 403) setBlocked('permission');
      else if (status === 404) setBlocked('scope');
      else setError(errText(e));
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (blocked) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold flex items-center gap-2 text-gray-900 mb-2">
          <Globe size={18} className="text-blue-600" /> Online Portal Access
        </h3>
        <p className="text-sm text-gray-600">
          {blocked === 'permission' ? (
            <>
              Your role can&apos;t manage online access yet. Ask an administrator to grant{' '}
              <strong>Clients → Online Portal Access</strong> (view and create) in Permission Setup.
            </>
          ) : (
            <>
              This client belongs to another branch. Online access can be managed by staff at the
              client&apos;s branch or by a director.
            </>
          )}
        </p>
      </div>
    );
  }

  const pending = access?.invitations.find(i => i.status === 'pending');

  const send = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api.post('/portal/staff/invitations/', { client: clientId, email });
      setNotice(`Invitation emailed to ${email}. The link expires in 72 hours.`);
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: number) => {
    if (!window.confirm('Cancel this invitation? The link will stop working.')) return;
    setBusy(true);
    setError('');
    try {
      await api.post(`/portal/staff/invitations/${id}/revoke/`, {});
      await load();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold flex items-center gap-2 text-gray-900">
          <Globe size={18} className="text-blue-600" /> Online Portal Access
        </h3>
        <button onClick={load} className="p-1.5 rounded hover:bg-gray-100" aria-label="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2 mb-3">{error}</div>}
      {notice && (
        <div className="bg-green-50 text-green-800 text-sm rounded p-2 mb-3">{notice}</div>
      )}

      {!access ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : access.account ? (
        <div className="text-sm space-y-1">
          <p>
            <span className="inline-block px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 mr-2">
              {access.account.is_active ? 'Active' : 'Disabled'}
            </span>
            Signs in as <strong>{access.account.email}</strong>
          </p>
          <p className="text-xs text-gray-500">
            Account created {fmt(access.account.created_at)} · last sign-in{' '}
            {fmt(access.account.last_login)}
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            This client has no online account. Send an invitation so they can apply for loans and
            track applications online. Only send it to an email address you have confirmed belongs
            to the client.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="client@example.com"
              className="flex-1 min-w-[220px] border rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={send}
              disabled={busy || !email}
              className="flex items-center gap-1 px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
            >
              <Mail size={14} /> {pending ? 'Send a new invitation' : 'Send invitation'}
            </button>
          </div>
          {pending && (
            <p className="text-xs text-gray-500 mt-2">
              Sending a new invitation cancels the one sent to {pending.email}.
            </p>
          )}
        </div>
      )}

      {access && access.invitations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            Invitations
          </h4>
          <ul className="divide-y text-sm">
            {access.invitations.map(i => (
              <li key={i.id} className="py-1.5 flex items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs mr-2 ${BADGE[i.status]}`}>
                    {i.status}
                  </span>
                  {i.email}
                  <span className="block text-xs text-gray-500">
                    sent {fmt(i.created_at)}
                    {i.created_by_name ? ` by ${i.created_by_name}` : ''}
                    {i.status === 'pending' ? ` · expires ${fmt(i.expires_at)}` : ''}
                  </span>
                </span>
                {i.status === 'pending' && (
                  <button
                    onClick={() => revoke(i.id)}
                    disabled={busy}
                    className="text-xs text-red-700 flex items-center gap-1 shrink-0"
                  >
                    <XCircle size={12} /> Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
