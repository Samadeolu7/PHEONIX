/**
 * Staff inbox for loan applications submitted through the customer portal.
 *
 * Applications are a staging area: accepting one creates (or links) a client
 * and a *pending* loan application, which then follows the normal approval →
 * disbursement workflow. Nothing here approves or disburses money.
 *
 * Route: /loans/online-applications   Permission page: loans / online-loan-applications
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Globe,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';
import { api } from '../../services/api';

const BASE = '/portal/staff/applications';

type Status = 'submitted' | 'under_review' | 'converted' | 'rejected' | 'withdrawn';

interface Row {
  id: number;
  reference: string;
  status: Status;
  status_display: string;
  applicant_name: string;
  phone_primary: string;
  email: string;
  product_name: string;
  branch_name: string;
  requested_amount: number;
  term: number;
  term_unit: string;
  repayment_frequency: string;
  submitted_at: string;
  assigned_to_name: string | null;
}

interface Detail extends Row {
  [key: string]: unknown;
  converted_loan: number | null;
  converted_loan_number: string | null;
  converted_client: number | null;
  converted_client_code: string | null;
  customer_email_verified: boolean;
}

interface Match {
  id: number;
  client_id: string;
  full_name: string;
  phone_primary: string;
  branch_name: string | null;
  matched_on: string[];
}

const BADGE: Record<Status, string> = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-700',
  converted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  withdrawn: 'bg-gray-100 text-gray-600',
};

const naira = (v: unknown) =>
  `₦${Number(v || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function errText(e: unknown): string {
  const d = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (!d) return 'Request failed.';
  if (typeof d.detail === 'string') return d.detail;
  return Object.entries(d)
    .map(
      ([k, v]) =>
        `${k}: ${Array.isArray(v) ? v.join(' ') : typeof v === 'object' ? JSON.stringify(v) : v}`
    )
    .join(' · ');
}

const SECTIONS: { title: string; fields: [string, string][] }[] = [
  {
    title: 'Loan',
    fields: [
      ['product_name', 'Product'],
      ['requested_amount', 'Amount'],
      ['term', 'Term'],
      ['repayment_frequency', 'Repayment'],
      ['branch_name', 'Branch'],
      ['loan_purpose', 'Purpose'],
    ],
  },
  {
    title: 'Applicant',
    fields: [
      ['title', 'Title'],
      ['first_name', 'First name'],
      ['middle_name', 'Middle name'],
      ['last_name', 'Last name'],
      ['gender', 'Gender'],
      ['date_of_birth', 'Date of birth'],
      ['marital_status', 'Marital status'],
      ['phone_primary', 'Phone'],
      ['phone_secondary', 'Other phone'],
      ['email', 'Email'],
      ['address_street', 'Address'],
      ['address_city', 'City'],
      ['address_state', 'State'],
    ],
  },
  {
    title: 'Identity (verify before accepting)',
    fields: [
      ['nin', 'NIN'],
      ['bvn', 'BVN'],
    ],
  },
  {
    title: 'Work & income',
    fields: [
      ['employment_status', 'Employment'],
      ['occupation', 'Occupation'],
      ['employer_name', 'Employer / business'],
      ['employer_address', 'Employer address'],
      ['monthly_income', 'Monthly income'],
    ],
  },
  {
    title: 'Next of kin & bank',
    fields: [
      ['next_of_kin_name', 'Next of kin'],
      ['next_of_kin_relationship', 'Relationship'],
      ['next_of_kin_phone', 'NOK phone'],
      ['bank_name', 'Bank'],
      ['bank_account_name', 'Account name'],
      ['bank_account_number', 'Account number'],
    ],
  },
];

function DetailPanel({ id, onChanged }: { id: number; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [rejectMsg, setRejectMsg] = useState('');
  const [notes, setNotes] = useState('');
  const [mode, setMode] = useState<'none' | 'reject' | 'convert'>('none');

  const load = useCallback(async () => {
    setError('');
    try {
      // services/api returns the parsed JSON body directly (not an axios {data} wrapper).
      setD(await api.get(`${BASE}/${id}/`));
      setMatches(await api.get(`${BASE}/${id}/matching-clients/`));
    } catch (e) {
      setError(errText(e));
    }
  }, [id]);

  useEffect(() => {
    setMode('none');
    setD(null);
    load();
  }, [load]);

  const act = async (path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      setD(await api.post(`${BASE}/${id}/${path}/`, body || {}));
      setMode('none');
      onChanged();
    } catch (e) {
      const data = (e as { response?: { status?: number; data?: { matches?: Match[] } } })
        ?.response;
      if (data?.status === 409 && data.data?.matches) setMatches(data.data.matches);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <div className="p-6 text-sm text-gray-500">{error || 'Loading…'}</div>;
  const open = d.status === 'submitted' || d.status === 'under_review';
  const idMatch = matches?.some(m => m.matched_on.includes('nin') || m.matched_on.includes('bvn'));

  return (
    <div className="p-5 overflow-y-auto">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <h2 className="text-lg font-semibold">{d.applicant_name}</h2>
          <p className="text-xs text-gray-500">
            {d.reference} · submitted {new Date(d.submitted_at).toLocaleString('en-NG')}
          </p>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${BADGE[d.status]}`}>
          {d.status_display}
        </span>
      </div>

      {error && (
        <div className="flex gap-2 items-start bg-red-50 text-red-700 text-sm rounded p-3 mb-3">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> <span>{error}</span>
        </div>
      )}

      {d.status === 'converted' && d.converted_loan && (
        <div className="bg-green-50 text-green-800 text-sm rounded p-3 mb-3">
          Accepted: client <strong>{d.converted_client_code}</strong>, loan application{' '}
          <Link className="underline" to={`/loans/accounts/${d.converted_loan}`}>
            {d.converted_loan_number}
          </Link>{' '}
          (pending approval).
        </div>
      )}

      {matches && matches.length > 0 && open && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-3 text-sm">
          <p className="font-medium text-amber-900 mb-2">
            Possible existing client{matches.length > 1 ? 's' : ''}
          </p>
          <ul className="space-y-1">
            {matches.map(m => (
              <li key={m.id} className="flex items-center justify-between gap-2">
                <span>
                  {m.full_name} ({m.client_id}) · {m.branch_name} · matched on{' '}
                  <strong>{m.matched_on.join(', ')}</strong>
                </span>
                <button
                  disabled={busy}
                  className="text-xs px-2 py-1 rounded bg-amber-600 text-white disabled:opacity-50"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Link this application to ${m.full_name} (${m.client_id})? Only do this after confirming it is the same person.`
                      )
                    ) {
                      act('convert', { client_id: m.id, staff_notes: notes });
                    }
                  }}
                >
                  Link & accept
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!d.customer_email_verified && (
        <p className="text-xs text-amber-700 mb-3">
          Applicant&apos;s email address is not verified.
        </p>
      )}

      {SECTIONS.map(s => (
        <div key={s.title} className="mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">
            {s.title}
          </h3>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
            {s.fields.map(([k, label]) => {
              let v = d[k] as unknown;
              if (k === 'requested_amount' || k === 'monthly_income') v = naira(v);
              if (k === 'term') v = `${d.term} ${d.term_unit}`;
              return (
                <React.Fragment key={k}>
                  <dt className="text-gray-500">{label}</dt>
                  <dd className="col-span-2 break-words">{(v as string) || '—'}</dd>
                </React.Fragment>
              );
            })}
          </dl>
        </div>
      ))}

      {open && (
        <div className="border-t pt-4 space-y-3">
          {d.status === 'submitted' && (
            <button
              disabled={busy}
              onClick={() => act('start-review')}
              className="px-3 py-2 text-sm rounded border"
            >
              Start review (assign to me)
            </button>
          )}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Internal notes (never shown to the applicant)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full border rounded p-2 text-sm"
            />
          </div>
          {mode === 'none' && (
            <div className="flex gap-2">
              <button
                disabled={busy}
                onClick={() => setMode('convert')}
                className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-green-600 text-white disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" /> Accept
              </button>
              <button
                disabled={busy}
                onClick={() => setMode('reject')}
                className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-red-600 text-white disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" /> Decline
              </button>
            </div>
          )}
          {mode === 'convert' && (
            <div className="bg-gray-50 rounded p-3 text-sm">
              <p className="mb-2">
                This creates a new client record and a <strong>pending</strong> loan application at{' '}
                {d.branch_name}. Confirm you have verified the applicant&apos;s identity (NIN/BVN).
              </p>
              {idMatch ? (
                <p className="text-amber-700">
                  An existing client has the same NIN/BVN — use &quot;Link & accept&quot; above
                  instead.
                </p>
              ) : (
                <div className="flex gap-2">
                  <button
                    disabled={busy}
                    className="px-3 py-2 rounded bg-green-600 text-white disabled:opacity-50"
                    onClick={() => act('convert', { create_new_client: true, staff_notes: notes })}
                  >
                    {busy ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Create client & loan application'
                    )}
                  </button>
                  <button className="px-3 py-2 rounded border" onClick={() => setMode('none')}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}
          {mode === 'reject' && (
            <div className="bg-gray-50 rounded p-3 text-sm">
              <label className="block text-xs text-gray-500 mb-1">
                Message to the applicant (shown on their portal)
              </label>
              <textarea
                value={rejectMsg}
                onChange={e => setRejectMsg(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full border rounded p-2 mb-2"
              />
              <div className="flex gap-2">
                <button
                  disabled={busy || !rejectMsg.trim()}
                  className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-50"
                  onClick={() => act('reject', { customer_message: rejectMsg, staff_notes: notes })}
                >
                  Decline application
                </button>
                <button className="px-3 py-2 rounded border" onClick={() => setMode('none')}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function OnlineApplicationsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string>('open');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params: Record<string, string> = { page_size: '100' };
      if (status !== 'open' && status !== 'all') params.status = status;
      if (search.trim()) params.search = search.trim();
      const res = await api.get(`${BASE}/`, { params });
      let data: Row[] = res?.results ?? res ?? [];
      if (status === 'open')
        data = data.filter(r => r.status === 'submitted' || r.status === 'under_review');
      setRows(data);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link to="/loans" className="text-gray-500 hover:text-gray-700">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <Globe className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-xl font-semibold">Online Applications</h1>
          <p className="text-xs text-gray-500">
            Loan applications submitted by customers through the online portal.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {[
          ['open', 'Open'],
          ['submitted', 'New'],
          ['under_review', 'Under review'],
          ['converted', 'Accepted'],
          ['rejected', 'Declined'],
          ['withdrawn', 'Withdrawn'],
          ['all', 'All'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setStatus(v)}
            className={`px-3 py-1.5 rounded-full text-sm border ${status === v ? 'bg-blue-600 text-white border-blue-600' : 'bg-white'}`}
          >
            {l}
          </button>
        ))}
        <div className="flex items-center gap-1 border rounded-full px-3 bg-white ml-auto">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Name, phone, reference"
            className="py-1.5 text-sm outline-none"
          />
        </div>
        <button onClick={load} className="p-2 rounded border bg-white" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-3">{error}</div>}

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 bg-white rounded-lg border divide-y max-h-[75vh] overflow-y-auto">
          {rows.length === 0 && !loading && (
            <p className="p-4 text-sm text-gray-500">No applications.</p>
          )}
          {rows.map(r => (
            <button
              key={r.id}
              onClick={() => setSelected(r.id)}
              className={`w-full text-left p-3 hover:bg-gray-50 ${selected === r.id ? 'bg-blue-50' : ''}`}
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium text-sm">{r.applicant_name}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs ${BADGE[r.status]}`}>
                  {r.status_display}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {naira(r.requested_amount)} · {r.product_name} · {r.branch_name}
              </div>
              <div className="text-xs text-gray-400">
                {r.reference} · {new Date(r.submitted_at).toLocaleDateString('en-NG')}
                {r.assigned_to_name ? ` · ${r.assigned_to_name}` : ''}
              </div>
            </button>
          ))}
        </div>
        <div className="lg:col-span-3 bg-white rounded-lg border min-h-[300px]">
          {selected ? (
            <DetailPanel id={selected} onChanged={load} />
          ) : (
            <p className="p-6 text-sm text-gray-500">Select an application to review.</p>
          )}
        </div>
      </div>
    </div>
  );
}
