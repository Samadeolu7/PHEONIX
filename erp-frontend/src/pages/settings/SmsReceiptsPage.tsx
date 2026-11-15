/**
 * SMS receipts to customers — directors only (enforced by the API).
 *
 * Customers who can't use apps get an SMS whenever money moves on their
 * account. Staff can tell them: "no SMS = not recorded — call us".
 *
 * Route: /admin/sms-receipts
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, MessageSquare, Save, Send, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';

interface Settings {
  is_enabled: boolean;
  brand_name: string;
  support_phone: string;
  send_loan_disbursement: boolean;
  send_loan_repayment: boolean;
  send_savings_deposit: boolean;
  send_savings_withdrawal: boolean;
}
interface Provider {
  provider: 'log' | 'termii' | 'africas_talking' | 'twilio';
  sender_id: string;
  channel: 'dnd' | 'generic';
  username: string;
  from_number: string;
  secrets_saved: string[];
}
interface Recent {
  id: number;
  recipient_name: string;
  recipient_contact: string;
  message: string;
  status: string;
  error_message: string;
  created_at: string;
}
interface Payload {
  settings: Settings;
  provider: Provider;
  sample: string;
  recent: Recent[];
}

const PROVIDERS = [
  { value: 'log', label: 'Test mode (nothing is sent; messages are only logged)' },
  { value: 'termii', label: 'Termii' },
  { value: 'africas_talking', label: "Africa's Talking" },
  { value: 'twilio', label: 'Twilio' },
];

const STATUS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-blue-100 text-blue-700',
  delivered: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

function errText(e: unknown): string {
  const d = (e as { response?: { data?: Record<string, unknown> } })?.response?.data;
  if (d && typeof d.detail === 'string') return d.detail;
  if (d)
    return Object.entries(d)
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(' ') : v}`)
      .join(' · ');
  return 'Request failed.';
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
      <input
        type="checkbox"
        className="h-4 w-4"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Input({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function SmsReceiptsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [p, setP] = useState<Provider | null>(null);
  const [secret, setSecret] = useState({ api_key: '', auth_token: '', account_sid: '' });
  const [testPhone, setTestPhone] = useState('');
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (d: Payload) => {
    setData(d);
    setS(d.settings);
    setP(d.provider);
    setSecret({ api_key: '', auth_token: '', account_sid: '' });
  };

  const load = useCallback(async () => {
    try {
      apply(await api.get('/notifications/sms-receipts/'));
    } catch (e) {
      if ((e as { status?: number })?.status === 403) setForbidden(true);
      else setError(errText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="p-6 max-w-xl">
        <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
          <ShieldAlert className="w-5 h-5 shrink-0" />
          <div>
            <p className="font-medium">Directors only</p>
            <p>SMS receipt settings can only be changed by users with access to all branches.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!data || !s || !p)
    return <div className="p-6 text-sm text-gray-500">{error || 'Loading…'}</div>;

  const setSet = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v });
  const setProv = <K extends keyof Provider>(k: K, v: Provider[K]) => setP({ ...p, [k]: v });
  const saved = (k: string) => p.secrets_saved.includes(k);

  const save = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      apply(await api.put('/notifications/sms-receipts/', { ...s, ...p, ...secret }));
      setNotice('Saved.');
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await api.post('/notifications/sms-receipts/test/', { phone: testPhone });
      setNotice(
        r?.test_mode
          ? 'Test mode: the message was logged, not sent. Choose a provider to send real SMS.'
          : `Test SMS sent to ${testPhone}.`
      );
    } catch (e) {
      const d = (e as { response?: { data?: { error?: string } } })?.response?.data;
      setError(d?.error ? `The provider refused the message: ${d.error}` : errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <MessageSquare className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-semibold">SMS Receipts</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Customers get an SMS whenever money moves on their account, on any phone. Teach them:{' '}
        <strong>no SMS means it wasn&apos;t recorded, so call us</strong>. Receipts are sent only
        for postings staff make in the app today or yesterday, never for back-office corrections.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
      {notice && (
        <div className="bg-green-50 text-green-800 text-sm rounded p-3 mb-4">{notice}</div>
      )}
      {s.is_enabled && p.provider === 'log' && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded p-3 mb-4">
          Receipts are on but the provider is <strong>Test mode</strong>, so customers aren&apos;t
          receiving anything yet.
        </div>
      )}

      <section className="bg-white border rounded-xl p-5 mb-5">
        <h2 className="font-semibold mb-2">What to send</h2>
        <Toggle
          checked={s.is_enabled}
          onChange={v => setSet('is_enabled', v)}
          label="SMS receipts are switched on"
        />
        <div className="ml-6 border-l pl-4 mt-1">
          <Toggle
            checked={s.send_loan_disbursement}
            onChange={v => setSet('send_loan_disbursement', v)}
            label="Loan disbursed"
          />
          <Toggle
            checked={s.send_loan_repayment}
            onChange={v => setSet('send_loan_repayment', v)}
            label="Loan repayment received"
          />
          <Toggle
            checked={s.send_savings_deposit}
            onChange={v => setSet('send_savings_deposit', v)}
            label="Savings deposit"
          />
          <Toggle
            checked={s.send_savings_withdrawal}
            onChange={v => setSet('send_savings_withdrawal', v)}
            label="Savings withdrawal"
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4 mt-4">
          <Input
            label="Name at the start of each SMS"
            value={s.brand_name}
            onChange={v => setSet('brand_name', v.slice(0, 20))}
            placeholder="KTIL"
            hint="Short is best. Each SMS is limited to 160 characters."
          />
          <Input
            label="Number customers should call"
            value={s.support_phone}
            onChange={v => setSet('support_phone', v)}
            placeholder="0700 000 0000"
          />
        </div>
        <div className="text-xs text-gray-500">Example:</div>
        <div className="font-mono text-sm bg-gray-50 border rounded p-3 mt-1">{data.sample}</div>
      </section>

      <section className="bg-white border rounded-xl p-5 mb-5">
        <h2 className="font-semibold mb-3">SMS provider</h2>
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
          <select
            value={p.provider}
            onChange={e => setProv('provider', e.target.value as Provider['provider'])}
            className="w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            {PROVIDERS.map(o => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {p.provider !== 'log' && (
          <>
            <Input
              label="Sender ID (name customers see)"
              value={p.sender_id}
              onChange={v => setProv('sender_id', v.slice(0, 11))}
              placeholder="KRYSTAR"
              hint="3–11 letters/numbers, exactly as approved by the provider."
            />
            {p.provider === 'termii' && (
              <div className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
                <select
                  value={p.channel}
                  onChange={e => setProv('channel', e.target.value as Provider['channel'])}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="dnd">
                    Transactional (dnd): reaches customers on Do-Not-Disturb (recommended)
                  </option>
                  <option value="generic">Promotional (generic): does not reach DND numbers</option>
                </select>
              </div>
            )}
            {(p.provider === 'termii' || p.provider === 'africas_talking') && (
              <Input
                label="API key"
                type="password"
                value={secret.api_key}
                onChange={v => setSecret({ ...secret, api_key: v })}
                placeholder={saved('api_key') ? 'Saved (leave blank to keep)' : ''}
              />
            )}
            {p.provider === 'africas_talking' && (
              <Input label="Username" value={p.username} onChange={v => setProv('username', v)} />
            )}
            {p.provider === 'twilio' && (
              <>
                <Input
                  label="Account SID"
                  type="password"
                  value={secret.account_sid}
                  onChange={v => setSecret({ ...secret, account_sid: v })}
                  placeholder={saved('account_sid') ? 'Saved (leave blank to keep)' : ''}
                />
                <Input
                  label="Auth token"
                  type="password"
                  value={secret.auth_token}
                  onChange={v => setSecret({ ...secret, auth_token: v })}
                  placeholder={saved('auth_token') ? 'Saved (leave blank to keep)' : ''}
                />
                <Input
                  label="From (sender)"
                  value={p.from_number}
                  onChange={v => setProv('from_number', v)}
                />
              </>
            )}
            <p className="text-xs text-gray-500">
              Keys are stored on the server and never shown again.
            </p>
          </>
        )}
      </section>

      <div className="flex justify-end mb-6">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
        </button>
      </div>

      <section className="bg-white border rounded-xl p-5 mb-5">
        <h2 className="font-semibold mb-2">Send a test SMS</h2>
        <p className="text-xs text-gray-500 mb-3">
          Save first, then send a test to your own phone to check the provider works.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="08031234567"
            className="flex-1 min-w-[200px] border rounded-md px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={sendTest}
            disabled={busy || !testPhone}
            className="flex items-center gap-1 px-3 py-2 rounded-md border text-sm disabled:opacity-50"
          >
            <Send className="w-4 h-4" /> Send test
          </button>
        </div>
      </section>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-3">Recent receipts</h2>
        {data.recent.length === 0 ? (
          <p className="text-sm text-gray-500">None yet.</p>
        ) : (
          <ul className="divide-y text-sm">
            {data.recent.map(r => (
              <li key={r.id} className="py-2">
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {r.recipient_name} · {r.recipient_contact}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs ${STATUS[r.status] || 'bg-gray-100'}`}
                  >
                    {r.status}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-0.5">{r.message}</div>
                {r.error_message && (
                  <div className="text-xs text-red-700 mt-0.5">{r.error_message}</div>
                )}
                <div className="text-xs text-gray-400">
                  {new Date(r.created_at).toLocaleString('en-NG')}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
