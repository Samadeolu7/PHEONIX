import React, { useEffect, useState } from 'react';
import { clientService } from '@/services/clientService';
import { accountService } from '@/services/accountService';
import { useToast } from '@/hooks/useToast';

type IncomeAccount = { id: number; name: string; code?: string };

const ClientRegistrationConfigPage: React.FC = () => {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configId, setConfigId] = useState<number | null>(null);
  const [incomeAccounts, setIncomeAccounts] = useState<IncomeAccount[]>([]);

  const [form, setForm] = useState({
    registration_income_account: '',
    id_fee_income_account: '',
    reactivation_income_account: '',
    daily_registration_fee: '0',
    daily_id_fee: '0',
    weekly_registration_fee: '0',
    weekly_id_fee: '0',
    monthly_registration_fee: '0',
    monthly_id_fee: '0',
    reactivation_fee: '1000',
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    try {
      const [configs, incomes] = await Promise.all([
        clientService.getRegistrationConfigs(),
        accountService.getAccounts({ account_type: 'INCOME', is_active: true }),
      ]);

      setIncomeAccounts((incomes || []).map((a: any) => ({ id: a.id, name: a.name, code: a.code })));

      const active = (configs || []).find(c => c.is_active) || configs?.[0];
      if (active) {
        setConfigId(active.id);
        setForm({
          registration_income_account: String(active.registration_income_account || ''),
          id_fee_income_account: String(active.id_fee_income_account || ''),
          reactivation_income_account: String(active.reactivation_income_account || ''),
          daily_registration_fee: active.daily_registration_fee || '0',
          daily_id_fee: active.daily_id_fee || '0',
          weekly_registration_fee: active.weekly_registration_fee || '0',
          weekly_id_fee: active.weekly_id_fee || '0',
          monthly_registration_fee: active.monthly_registration_fee || '0',
          monthly_id_fee: active.monthly_id_fee || '0',
          reactivation_fee: active.reactivation_fee || '1000',
          is_active: active.is_active,
        });
      }
    } catch (e: any) {
      error(e.message || 'Failed to load registration config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        registration_income_account: Number(form.registration_income_account),
        id_fee_income_account: Number(form.id_fee_income_account),
        reactivation_income_account: form.reactivation_income_account
          ? Number(form.reactivation_income_account)
          : null,
        daily_registration_fee: form.daily_registration_fee,
        daily_id_fee: form.daily_id_fee,
        weekly_registration_fee: form.weekly_registration_fee,
        weekly_id_fee: form.weekly_id_fee,
        monthly_registration_fee: form.monthly_registration_fee,
        monthly_id_fee: form.monthly_id_fee,
        reactivation_fee: form.reactivation_fee,
        is_active: form.is_active,
      };

      if (!payload.registration_income_account || !payload.id_fee_income_account) {
        error('Please select both income accounts.');
        setSaving(false);
        return;
      }

      if (configId) {
        await clientService.updateRegistrationConfig(configId, payload as any);
      } else {
        const created = await clientService.createRegistrationConfig(payload as any);
        setConfigId(created.id);
      }

      success('Client registration fee configuration saved.');
    } catch (e: any) {
      error(e.message || 'Failed to save registration config');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
        Client Registration Fee Configuration
      </h1>
      <p style={{ color: '#6b7280', marginBottom: '1.25rem' }}>
        Configure registration fee + ID card fee per client type. Fees are collected into cashier cash account and posted to selected income accounts.
      </p>

      {loading ? (
        <div>Loading...</div>
      ) : (
        <form onSubmit={onSave} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Registration Income Account</label>
              <select
                value={form.registration_income_account}
                onChange={e => setForm(prev => ({ ...prev, registration_income_account: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              >
                <option value="">Select income account...</option>
                {incomeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code ? `${acc.code} - ` : ''}
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>ID Fee Income Account</label>
              <select
                value={form.id_fee_income_account}
                onChange={e => setForm(prev => ({ ...prev, id_fee_income_account: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              >
                <option value="">Select income account...</option>
                {incomeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code ? `${acc.code} - ` : ''}
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, alignItems: 'center', marginBottom: 10 }}>
            <strong>Client Type</strong>
            <strong>Registration Fee</strong>
            <strong>ID Fee</strong>
          </div>

          {[
            ['Daily Contributor', 'daily_registration_fee', 'daily_id_fee'],
            ['Weekly Client', 'weekly_registration_fee', 'weekly_id_fee'],
            ['Monthly Client', 'monthly_registration_fee', 'monthly_id_fee'],
          ].map(([label, regKey, idKey]) => (
            <div key={label} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 10 }}>
              <div style={{ paddingTop: 8 }}>{label}</div>
              <input
                type="number"
                min="0"
                step="0.01"
                value={(form as any)[regKey]}
                onChange={e => setForm(prev => ({ ...prev, [regKey]: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={(form as any)[idKey]}
                onChange={e => setForm(prev => ({ ...prev, [idKey]: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              />
            </div>
          ))}

          <hr style={{ margin: '20px 0', border: 'none', borderTop: '1px solid #e5e7eb' }} />

          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>Reactivation Fee</h2>
          <p style={{ color: '#6b7280', marginBottom: 12, fontSize: '0.875rem' }}>
            Charged when a suspended, inactive, blacklisted, or dormant client is restored to active status.
            Deducted directly from the client's savings balance (no cash changes hands) — reactivation
            fails if their savings balance can't cover it. Falls back to the Registration Income Account
            above when no dedicated account is selected.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Reactivation Income Account</label>
              <select
                value={form.reactivation_income_account}
                onChange={e => setForm(prev => ({ ...prev, reactivation_income_account: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              >
                <option value="">Use Registration Income Account</option>
                {incomeAccounts.map(acc => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code ? `${acc.code} - ` : ''}
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Reactivation Fee</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.reactivation_fee}
                onChange={e => setForm(prev => ({ ...prev, reactivation_fee: e.target.value }))}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6 }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{ marginTop: 12, padding: '10px 16px', borderRadius: 6, border: 0, background: '#111827', color: '#fff' }}
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </form>
      )}
    </div>
  );
};

export default ClientRegistrationConfigPage;
