// Pension Remittance Page - List and process pension fund remittances
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Shield, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import hrService from '../../services/hrService';
import {
  PensionRemittance,
  PensionRemittanceStatus,
  CreatePensionRemittanceData,
  RemitPensionData,
} from '../../types/hr';

// ─── Status badge ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  PensionRemittanceStatus,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  draft: {
    label: 'Draft',
    color: '#92400e',
    bg: '#fef3c7',
    icon: <Clock size={14} />,
  },
  remitted: {
    label: 'Remitted',
    color: '#065f46',
    bg: '#d1fae5',
    icon: <CheckCircle size={14} />,
  },
  cancelled: {
    label: 'Cancelled',
    color: '#991b1b',
    bg: '#fee2e2',
    icon: <XCircle size={14} />,
  },
};

function StatusBadge({ status }: { status: PensionRemittanceStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '3px 10px',
        borderRadius: '9999px',
        fontSize: '12px',
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

// ─── Create Remittance Modal ──────────────────────────────────────────────────

interface CreateModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function CreateRemittanceModal({ onClose, onCreated }: CreateModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<CreatePensionRemittanceData>({
    period_start: '',
    period_end: '',
    remittance_date: new Date().toISOString().slice(0, 10),
    total_employee_pension: '',
    total_employer_pension: '',
    pension_provider: '',
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data: CreatePensionRemittanceData) => hrService.createPensionRemittance(data),
    onSuccess: () => {
      toast.success('Pension remittance created successfully');
      onCreated();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.non_field_errors?.[0] ||
        'Failed to create remittance';
      toast.error(msg);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const totalAmount =
    (parseFloat(String(form.total_employee_pension)) || 0) +
    (parseFloat(String(form.total_employer_pension)) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.period_start || !form.period_end || !form.remittance_date) {
      toast.error('Period start, period end, and remittance date are required');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>
          Create Pension Remittance
        </h2>

        <form onSubmit={handleSubmit}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '16px',
            }}
          >
            <div>
              <label style={labelStyle}>Period Start *</label>
              <input
                type="date"
                name="period_start"
                value={form.period_start}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Period End *</label>
              <input
                type="date"
                name="period_end"
                value={form.period_end}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Remittance Date *</label>
              <input
                type="date"
                name="remittance_date"
                value={form.remittance_date}
                onChange={handleChange}
                required
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Pension Provider</label>
              <input
                type="text"
                name="pension_provider"
                value={form.pension_provider}
                onChange={handleChange}
                placeholder="e.g. NLPC"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Employee Pension Total (₦)</label>
              <input
                type="number"
                step="0.01"
                name="total_employee_pension"
                value={form.total_employee_pension}
                onChange={handleChange}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Employer Pension Total (₦)</label>
              <input
                type="number"
                step="0.01"
                name="total_employer_pension"
                value={form.total_employer_pension}
                onChange={handleChange}
                placeholder="0.00"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Total Preview */}
          {totalAmount > 0 && (
            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ color: '#166534', fontSize: '14px', fontWeight: 600 }}>
                Total Remittance Amount:
              </span>
              <span style={{ color: '#166534', fontSize: '18px', fontWeight: 700 }}>
                ₦{totalAmount.toFixed(2)}
              </span>
            </div>
          )}

          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              name="notes"
              value={form.notes}
              onChange={handleChange}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Optional notes..."
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending} style={primaryBtnStyle}>
              {mutation.isPending ? 'Creating...' : 'Create Remittance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Remit Modal ─────────────────────────────────────────────────────────────

interface RemitModalProps {
  remittance: PensionRemittance;
  onClose: () => void;
  onRemitted: () => void;
}

function RemitModal({ remittance, onClose, onRemitted }: RemitModalProps) {
  const toast = useToast();
  const [form, setForm] = useState<RemitPensionData>({
    payment_account: 0,
    remittance_date: remittance.remittance_date,
    notes: '',
  });

  const mutation = useMutation({
    mutationFn: (data: RemitPensionData) => hrService.remitPension(remittance.id, data),
    onSuccess: () => {
      toast.success('Pension remitted and journal entry created');
      onRemitted();
      onClose();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.non_field_errors?.[0] ||
        'Failed to process remittance';
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.payment_account) {
      toast.error('Payment account ID is required');
      return;
    }
    mutation.mutate(form);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        zIndex: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          padding: '32px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: '#1f2937' }}>
          Process Pension Remittance
        </h2>
        <p style={{ margin: '0 0 24px 0', color: '#6b7280', fontSize: '14px' }}>
          Ref: <strong>{remittance.reference_number}</strong> — Total:{' '}
          <strong>₦{parseFloat(remittance.total_amount).toFixed(2)}</strong>
        </p>

        <div
          style={{
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            padding: '12px 16px',
            marginBottom: '20px',
            fontSize: '13px',
            color: '#1e40af',
          }}
        >
          <strong>GL entries that will be created:</strong>
          <ul style={{ margin: '6px 0 0 0', paddingLeft: '16px' }}>
            <li>
              DR Employee Pension Payable (260-002): ₦
              {parseFloat(remittance.total_employee_pension).toFixed(2)}
            </li>
            <li>
              DR Employer Pension Payable (260-003): ₦
              {parseFloat(remittance.total_employer_pension).toFixed(2)}
            </li>
            <li>CR Payment Account: ₦{parseFloat(remittance.total_amount).toFixed(2)}</li>
          </ul>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Payment Account ID *</label>
            <input
              type="number"
              value={form.payment_account || ''}
              onChange={e =>
                setForm(prev => ({ ...prev, payment_account: parseInt(e.target.value) || 0 }))
              }
              placeholder="Enter GL account ID for cash/bank"
              style={inputStyle}
              required
            />
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
              The bank/cash account to debit for the payment.
            </p>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Remittance Date</label>
            <input
              type="date"
              value={form.remittance_date}
              onChange={e => setForm(prev => ({ ...prev, remittance_date: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Optional notes..."
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onClose} style={cancelBtnStyle}>
              Cancel
            </button>
            <button type="submit" disabled={mutation.isPending} style={primaryBtnStyle}>
              {mutation.isPending ? 'Processing...' : 'Confirm Remittance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '6px',
  fontSize: '13px',
  fontWeight: 600,
  color: '#374151',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: '#059669',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  background: 'white',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
};

// ─── Main Page Component ──────────────────────────────────────────────────────

const PensionRemittancePage: React.FC = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeRemittance, setActiveRemittance] = useState<PensionRemittance | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['pension-remittances'],
    queryFn: () => hrService.getPensionRemittances({ page_size: 50 }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => hrService.cancelPensionRemittance(id),
    onSuccess: () => {
      toast.success('Remittance cancelled');
      queryClient.invalidateQueries({ queryKey: ['pension-remittances'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail || 'Failed to cancel');
    },
  });

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['pension-remittances'] });
  };

  const remittances = data?.results ?? [];

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
          <Link
            to="/hr"
            style={{
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              color: '#374151',
            }}
          >
            <ArrowLeft size={20} />
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Shield size={28} color="#059669" />
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: 700, color: '#1f2937' }}>
              Pension Remittances
            </h1>
          </div>
        </div>
        <p style={{ margin: '0 0 0 56px', color: '#6b7280', fontSize: '14px' }}>
          Manage and process pension fund remittances. Employee (8%) + Employer (10%) contributions.
        </p>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '24px',
        }}
      >
        <button
          onClick={handleRefresh}
          style={{
            padding: '8px 12px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            background: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '14px',
            color: '#374151',
          }}
        >
          <RefreshCw size={16} />
          Refresh
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '10px 18px',
            background: '#059669',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          <Plus size={18} />
          New Remittance
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#6b7280' }}>
          Loading remittances...
        </div>
      ) : isError ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px',
            color: '#dc2626',
            background: '#fee2e2',
            borderRadius: '12px',
          }}
        >
          Failed to load remittances. Please try again.
        </div>
      ) : remittances.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px',
            background: 'white',
            border: '2px dashed #d1d5db',
            borderRadius: '12px',
            color: '#6b7280',
          }}
        >
          <Shield size={48} color="#d1d5db" style={{ marginBottom: '16px' }} />
          <p style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '16px' }}>
            No remittances yet
          </p>
          <p style={{ margin: 0, fontSize: '14px' }}>
            Create a remittance to process pension fund payments.
          </p>
        </div>
      ) : (
        <div
          style={{
            background: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {[
                  'Reference',
                  'Period',
                  'Remittance Date',
                  'Emp. Pension',
                  'Empr. Pension',
                  'Total',
                  'Provider',
                  'Status',
                  'Actions',
                ].map(h => (
                  <th
                    key={h}
                    style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontSize: '12px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: '#6b7280',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {remittances.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{
                    borderBottom: idx < remittances.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 600 }}>
                      {r.reference_number}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <span style={{ fontSize: '13px' }}>
                      {r.period_start} → {r.period_end}
                    </span>
                  </td>
                  <td style={tdStyle}>{r.remittance_date}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    ₦
                    {parseFloat(r.total_employee_pension).toLocaleString('en-NG', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    ₦
                    {parseFloat(r.total_employer_pension).toLocaleString('en-NG', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                    ₦
                    {parseFloat(r.total_amount).toLocaleString('en-NG', {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={tdStyle}>{r.pension_provider || '—'}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={r.status} />
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      {r.status === 'draft' && (
                        <>
                          <button
                            onClick={() => setActiveRemittance(r)}
                            style={{
                              padding: '6px 12px',
                              background: '#059669',
                              color: 'white',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                              fontWeight: 600,
                            }}
                          >
                            Remit
                          </button>
                          <button
                            onClick={() => {
                              if (window.confirm('Cancel this remittance?')) {
                                cancelMutation.mutate(r.id);
                              }
                            }}
                            style={{
                              padding: '6px 12px',
                              background: 'white',
                              color: '#dc2626',
                              border: '1px solid #fca5a5',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '12px',
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                      {r.status === 'remitted' && r.journal_entry && (
                        <span style={{ fontSize: '12px', color: '#059669' }}>
                          JE #{r.journal_entry}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <CreateRemittanceModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['pension-remittances'] })}
        />
      )}
      {activeRemittance && (
        <RemitModal
          remittance={activeRemittance}
          onClose={() => setActiveRemittance(null)}
          onRemitted={() => queryClient.invalidateQueries({ queryKey: ['pension-remittances'] })}
        />
      )}
    </div>
  );
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '14px',
  color: '#374151',
};

export default PensionRemittancePage;
