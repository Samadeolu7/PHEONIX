import React, { useState } from 'react';
import { clientService } from '@/services/clientService';

const ProspectPublicRegistrationPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    branch_code: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    gender: 'male',
    phone_primary: '',
    email: '',
    date_of_birth: '',
    address_street: '',
    address_city: '',
    address_state: '',
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const res = await clientService.createPublicProspect({
        branch_code: form.branch_code,
        first_name: form.first_name,
        middle_name: form.middle_name || undefined,
        last_name: form.last_name,
        gender: form.gender as 'male' | 'female' | 'other',
        phone_primary: form.phone_primary,
        email: form.email || undefined,
        date_of_birth: form.date_of_birth || undefined,
        address_street: form.address_street || undefined,
        address_city: form.address_city || undefined,
        address_state: form.address_state || undefined,
      });
      setResult(`Submitted successfully. Prospect reference: ${res.client_id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to submit prospect registration');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: 10,
    border: '1px solid #d1d5db',
    borderRadius: 8,
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #f5f7fa 0%, #e4ecf8 100%)',
        padding: '2rem 1rem',
      }}
    >
      <div style={{ maxWidth: 700, margin: '0 auto', background: '#fff', borderRadius: 12, padding: 20 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 8 }}>Prospect Registration</h1>
        <p style={{ color: '#6b7280', marginBottom: 16 }}>
          Public onboarding for prospects. No fee is charged at this step.
        </p>

        {error && (
          <div style={{ marginBottom: 12, background: '#fef2f2', color: '#b91c1c', padding: 10, borderRadius: 8 }}>
            {error}
          </div>
        )}
        {result && (
          <div style={{ marginBottom: 12, background: '#ecfdf5', color: '#065f46', padding: 10, borderRadius: 8 }}>
            {result}
          </div>
        )}

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label>Branch Code *</label>
              <input
                value={form.branch_code}
                onChange={e => setForm(prev => ({ ...prev, branch_code: e.target.value.toUpperCase() }))}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label>Gender *</label>
              <select
                value={form.gender}
                onChange={e => setForm(prev => ({ ...prev, gender: e.target.value }))}
                style={inputStyle}
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label>First Name *</label>
              <input
                value={form.first_name}
                onChange={e => setForm(prev => ({ ...prev, first_name: e.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label>Middle Name</label>
              <input
                value={form.middle_name}
                onChange={e => setForm(prev => ({ ...prev, middle_name: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Last Name *</label>
              <input
                value={form.last_name}
                onChange={e => setForm(prev => ({ ...prev, last_name: e.target.value }))}
                style={inputStyle}
                required
              />
            </div>
            <div>
              <label>Phone *</label>
              <input
                value={form.phone_primary}
                onChange={e => setForm(prev => ({ ...prev, phone_primary: e.target.value }))}
                style={inputStyle}
                required
              />
            </div>

            <div>
              <label>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label>Date of Birth</label>
              <input
                type="date"
                value={form.date_of_birth}
                onChange={e => setForm(prev => ({ ...prev, date_of_birth: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label>Address</label>
              <input
                value={form.address_street}
                onChange={e => setForm(prev => ({ ...prev, address_street: e.target.value }))}
                style={inputStyle}
              />
            </div>
            <div>
              <label>City</label>
              <input
                value={form.address_city}
                onChange={e => setForm(prev => ({ ...prev, address_city: e.target.value }))}
                style={inputStyle}
              />
            </div>

            <div>
              <label>State</label>
              <input
                value={form.address_state}
                onChange={e => setForm(prev => ({ ...prev, address_state: e.target.value }))}
                style={inputStyle}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 16,
              padding: '10px 16px',
              borderRadius: 8,
              border: 0,
              background: '#1f2937',
              color: '#fff',
              cursor: 'pointer',
            }}
          >
            {loading ? 'Submitting...' : 'Submit Prospect Registration'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ProspectPublicRegistrationPage;
