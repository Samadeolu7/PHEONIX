/**
 * Online portal settings — for directors (users with all-branch access).
 * Lets them switch the customer portal on/off, control open sign-up, set the
 * portal's web address and contacts, and choose which loan products are
 * offered online, all without server access. The backend enforces
 * director-only access and logs every change.
 *
 * Route: /admin/online-portal
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Globe, Loader2, Save, ShieldAlert } from 'lucide-react';
import { api } from '../../services/api';

interface Settings {
  is_enabled: boolean;
  allow_registration: boolean;
  max_open_applications: number;
  public_url: string;
  support_phone: string;
  support_email: string;
  terms_url: string;
  privacy_url: string;
}

interface Offering {
  id: number;
  is_active: boolean;
  display_name: string;
  public_description: string;
  max_online_amount: number | null;
  sort_order: number;
}

interface Product {
  loan_product: number;
  name: string;
  product_active: boolean;
  min_amount: number;
  max_amount: number;
  interest_rate: number;
  term_unit: string;
  min_term: number;
  max_term: number;
  offering: Offering | null;
}

interface Payload {
  settings: Settings;
  server_default_url: string;
  products: Product[];
}

const naira = (n: number | null | undefined) =>
  n == null ? '—' : `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

function errText(e: unknown): string {
  const err = e as { status?: number; response?: { data?: Record<string, unknown> } };
  const d = err?.response?.data;
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
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex items-start gap-3 py-3 cursor-pointer">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
      />
      <span>
        <span className="block font-medium text-sm text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </label>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  type?: string;
}) {
  return (
    <div className="mb-3">
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="w-full border rounded-md px-3 py-2 text-sm"
      />
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function ProductRow({
  p,
  onSave,
  onRemove,
  busy,
}: {
  p: Product;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onRemove: (id: number) => void;
}) {
  const o = p.offering;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(o?.display_name || '');
  const [desc, setDesc] = useState(o?.public_description || '');
  const [cap, setCap] = useState(o?.max_online_amount != null ? String(o.max_online_amount) : '');

  const offered = !!o?.is_active;
  const save = (is_active: boolean) =>
    onSave({
      loan_product: p.loan_product,
      is_active,
      display_name: name,
      public_description: desc,
      max_online_amount: cap ? Number(cap) : null,
      sort_order: o?.sort_order || 0,
    });

  return (
    <div className="border rounded-lg p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium text-sm">
            {p.name}
            {!p.product_active && (
              <span className="ml-2 text-xs text-amber-700">
                (product inactive — won&apos;t show)
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500">
            {naira(p.min_amount)}–{naira(p.max_amount)} · {p.interest_rate}% · {p.min_term}–
            {p.max_term} {p.term_unit}
            {offered && o?.max_online_amount != null
              ? ` · online limit ${naira(o.max_online_amount)}`
              : ''}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded-full text-xs ${offered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
          >
            {offered ? 'Offered online' : 'Not offered'}
          </span>
          <button
            type="button"
            className="text-xs px-2 py-1 border rounded"
            onClick={() => setOpen(v => !v)}
          >
            {open ? 'Close' : offered ? 'Edit' : 'Offer online'}
          </button>
        </div>
      </div>
      {open && (
        <div className="mt-3 border-t pt-3">
          <Text
            label="Name customers see (optional)"
            value={name}
            onChange={setName}
            placeholder={p.name}
          />
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Short description for customers (optional)
            </label>
            <textarea
              rows={2}
              maxLength={2000}
              value={desc}
              onChange={e => setDesc(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>
          <Text
            label="Maximum amount online (optional)"
            value={cap}
            onChange={v => setCap(v.replace(/[^\d.]/g, ''))}
            placeholder={String(p.max_amount)}
            hint="Leave empty to allow up to the product maximum."
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                save(true);
                setOpen(false);
              }}
              className="px-3 py-2 text-sm rounded bg-blue-600 text-white disabled:opacity-50"
            >
              {offered ? 'Save' : 'Offer this loan online'}
            </button>
            {o && offered && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      `Stop offering "${p.name}" online? Existing applications are kept.`
                    )
                  ) {
                    onRemove(o.id);
                    setOpen(false);
                  }
                }}
                className="px-3 py-2 text-sm rounded border text-red-700"
              >
                Stop offering online
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OnlinePortalSettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  const apply = (p: Payload) => {
    setData(p);
    setForm(p.settings);
  };

  const load = useCallback(async () => {
    try {
      apply(await api.get('/portal/staff/settings/'));
    } catch (e) {
      if ((e as { status?: number })?.status === 403) setForbidden(true);
      else setError(errText(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setForm(f => (f ? { ...f, [k]: v } : f));

  const run = async (fn: () => Promise<Payload>, okMsg: string) => {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      apply(await fn());
      setSaved(okMsg);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return (
      <div className="p-6 max-w-xl">
        <div className="flex gap-3 items-start bg-amber-50 border border-amber-200 rounded-lg p-4">
          <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Directors only</p>
            <p>Online portal settings can only be changed by users with access to all branches.</p>
          </div>
        </div>
      </div>
    );
  }
  if (!data || !form) {
    return <div className="p-6 text-sm text-gray-500">{error || 'Loading…'}</div>;
  }

  const offeredCount = data.products.filter(p => p.offering?.is_active).length;
  const portalLink =
    (form.public_url || data.server_default_url || '').replace(/\/$/, '') + '/portal';

  return (
    <div className="p-4 md:p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-1">
        <Globe className="w-6 h-6 text-blue-600" />
        <h1 className="text-xl font-semibold">Online Portal Settings</h1>
      </div>
      <p className="text-sm text-gray-500 mb-6">
        Controls the customer portal where clients apply for loans online. Changes take effect
        immediately and are logged.
      </p>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-4">{error}</div>}
      {data.settings.is_enabled && offeredCount === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 text-sm rounded p-3 mb-4">
          The portal is on, but <strong>no loans are offered online</strong>, so customers see an
          empty loan list. Choose at least one under &ldquo;Loans offered online&rdquo; below.
        </div>
      )}
      {saved && <div className="bg-green-50 text-green-800 text-sm rounded p-3 mb-4">{saved}</div>}

      <section className="bg-white border rounded-xl p-5 mb-5">
        <h2 className="font-semibold mb-1">Access</h2>
        <div className="divide-y">
          <Toggle
            checked={form.is_enabled}
            onChange={v => set('is_enabled', v)}
            label="Portal is switched on"
            hint={`When off, the portal is invisible to the public${form.is_enabled ? '' : ' (currently off)'}. Customers sign in at ${portalLink}`}
          />
          <Toggle
            checked={form.allow_registration}
            onChange={v => set('allow_registration', v)}
            label="Allow anyone to sign up"
            hint="Off (recommended): accounts are only created when staff invite a client from their client record. On: members of the public can also create accounts; staff then verify identity when reviewing their application."
          />
        </div>
        <div className="mt-3 max-w-xs">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Open applications per customer
          </label>
          <input
            type="number"
            min={1}
            max={5}
            value={form.max_open_applications}
            onChange={e =>
              set('max_open_applications', Math.max(1, Math.min(5, Number(e.target.value) || 1)))
            }
            className="w-24 border rounded-md px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="bg-white border rounded-xl p-5 mb-5">
        <h2 className="font-semibold mb-3">Web address &amp; contacts</h2>
        <Text
          label="Portal web address"
          value={form.public_url}
          onChange={v => set('public_url', v)}
          placeholder={data.server_default_url || 'https://erp.krystartrust.ng'}
          hint="Used for links in invitation, verification and password-reset emails. Just the site address, e.g. https://erp.krystartrust.ng"
        />
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Text
            label="Support phone"
            value={form.support_phone}
            onChange={v => set('support_phone', v)}
            placeholder="0700 000 0000"
          />
          <Text
            label="Support email"
            type="email"
            value={form.support_email}
            onChange={v => set('support_email', v)}
            placeholder="support@krystartrust.ng"
          />
        </div>
        <Text
          label="Terms of use page (link)"
          value={form.terms_url}
          onChange={v => set('terms_url', v)}
          placeholder="https://…"
        />
        <Text
          label="Privacy policy page (link)"
          value={form.privacy_url}
          onChange={v => set('privacy_url', v)}
          placeholder="https://…"
          hint="Customers are asked to accept these. Have them approved before switching the portal on."
        />
      </section>

      <div className="flex justify-end mb-8">
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => api.put('/portal/staff/settings/', form), 'Settings saved.')}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          settings
        </button>
      </div>

      <section className="bg-white border rounded-xl p-5">
        <h2 className="font-semibold mb-1">Loans offered online ({offeredCount})</h2>
        <p className="text-xs text-gray-500 mb-4">
          Only loans you switch on here appear on the portal. Amounts, interest and terms come from
          the loan product setup.
        </p>
        {data.products.length === 0 ? (
          <p className="text-sm text-gray-500">No loan products are set up yet.</p>
        ) : (
          <div className="space-y-2">
            {data.products.map(p => (
              <ProductRow
                key={`${p.loan_product}-${p.offering?.id ?? 'x'}-${p.offering?.is_active}`}
                p={p}
                busy={busy}
                onSave={body =>
                  run(
                    () => api.post('/portal/staff/settings/offerings/', body),
                    `${p.name} updated.`
                  )
                }
                onRemove={id =>
                  run(
                    () => api.post(`/portal/staff/settings/offerings/${id}/remove/`, {}),
                    `${p.name} is no longer offered online.`
                  )
                }
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
