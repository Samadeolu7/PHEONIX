import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Receipt,
  Plus,
  DollarSign,
  Clock,
  AlertCircle,
  CheckCircle,
  Calendar,
  User,
  Search,
  Filter,
  Download,
  TrendingUp,
} from 'lucide-react';
import api from '../utils/api';

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  client_name: string;
  total_amount: number;
  paid_amount: number;
  amount_due: number;
  status: 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  is_overdue: boolean;
}

interface Summary {
  total_invoices: number;
  total_amount: number;
  total_paid: number;
  total_outstanding: number;
  overdue_count: number;
  overdue_amount: number;
}

const InvoiceList = () => {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showOverdue, setShowOverdue] = useState(false);

  useEffect(() => {
    loadInvoices();
    loadSummary();
  }, [statusFilter, showOverdue]);

  const loadInvoices = async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (showOverdue) params.overdue = 'true';

      const response = await api.get('/inventory/invoices/', params);
      if (response.success) {
        setInvoices(response.data || []);
      }
    } catch (error) {
      console.error('Failed to load invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await api.get('/inventory/invoices/summary/');
      if (response.success) {
        setSummary(response.summary);
      }
    } catch (error) {
      console.error('Failed to load summary:', error);
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: '#6b7280',
      sent: '#3b82f6',
      partial: '#f59e0b',
      paid: '#10b981',
      overdue: '#ef4444',
      cancelled: '#9ca3af',
    };
    return colors[status] || '#6b7280';
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      draft: Clock,
      sent: Receipt,
      partial: AlertCircle,
      paid: CheckCircle,
      overdue: AlertCircle,
      cancelled: AlertCircle,
    };
    return icons[status] || Receipt;
  };

  const filteredInvoices = invoices.filter(
    invoice =>
      invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.client_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb', padding: '24px' }}>
      {/* Header */}
      <div
        style={{
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1
            style={{ fontSize: '28px', fontWeight: 'bold', color: '#1f2937', marginBottom: '8px' }}
          >
            Sales Invoices
          </h1>
          <p style={{ color: '#6b7280' }}>Manage and track customer invoices</p>
        </div>
        <button
          onClick={() => navigate('/invoices/create')}
          style={{
            background: '#3b82f6',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '8px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '14px',
            fontWeight: '500',
          }}
        >
          <Plus size={20} />
          Create Invoice
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                  Total Invoices
                </p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
                  {summary.total_invoices}
                </p>
              </div>
              <div style={{ padding: '12px', background: '#dbeafe', borderRadius: '8px' }}>
                <Receipt size={24} color="#3b82f6" />
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                  Total Billed
                </p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#1f2937' }}>
                  ${summary.total_amount.toLocaleString()}
                </p>
              </div>
              <div style={{ padding: '12px', background: '#dcfce7', borderRadius: '8px' }}>
                <TrendingUp size={24} color="#10b981" />
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                  Amount Paid
                </p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>
                  ${summary.total_paid.toLocaleString()}
                </p>
              </div>
              <div style={{ padding: '12px', background: '#dcfce7', borderRadius: '8px' }}>
                <CheckCircle size={24} color="#10b981" />
              </div>
            </div>
          </div>

          <div
            style={{
              background: 'white',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}
          >
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
            >
              <div>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '8px' }}>
                  Outstanding
                </p>
                <p style={{ fontSize: '24px', fontWeight: 'bold', color: '#ef4444' }}>
                  ${summary.total_outstanding.toLocaleString()}
                </p>
                {summary.overdue_count > 0 && (
                  <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                    {summary.overdue_count} overdue
                  </p>
                )}
              </div>
              <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px' }}>
                <AlertCircle size={24} color="#ef4444" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        style={{
          background: 'white',
          padding: '20px',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          marginBottom: '24px',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
          }}
        >
          <div style={{ position: 'relative' }}>
            <Search
              size={20}
              color="#6b7280"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              type="text"
              placeholder="Search invoices..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 10px 10px 40px',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{
              padding: '10px',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
            }}
          >
            <option value="all">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="partial">Partially Paid</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={showOverdue}
              onChange={e => setShowOverdue(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: '14px', color: '#374151' }}>Show Only Overdue</span>
          </label>
        </div>
      </div>

      {/* Invoice List */}
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}
      >
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            Loading invoices...
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            <Receipt size={48} color="#d1d5db" style={{ margin: '0 auto 16px' }} />
            <p>No invoices found</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Invoice #
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Client
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Date
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'left',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Due Date
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Amount
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Paid
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Balance
                </th>
                <th
                  style={{
                    padding: '12px',
                    textAlign: 'center',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#6b7280',
                  }}
                >
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map(invoice => {
                const StatusIcon = getStatusIcon(invoice.status);
                return (
                  <tr
                    key={invoice.id}
                    onClick={() => navigate(`/invoices/${invoice.id}`)}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      cursor: 'pointer',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                  >
                    <td style={{ padding: '16px' }}>
                      <span style={{ fontWeight: '500', color: '#1f2937' }}>
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ color: '#374151' }}>{invoice.client_name}</span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span style={{ color: '#6b7280', fontSize: '14px' }}>
                        {invoice.invoice_date}
                      </span>
                    </td>
                    <td style={{ padding: '16px' }}>
                      <span
                        style={{
                          color: invoice.is_overdue ? '#ef4444' : '#6b7280',
                          fontSize: '14px',
                          fontWeight: invoice.is_overdue ? '500' : 'normal',
                        }}
                      >
                        {invoice.due_date}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <span style={{ fontWeight: '500', color: '#1f2937' }}>
                        ${invoice.total_amount.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <span style={{ color: '#10b981' }}>
                        ${invoice.paid_amount.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      <span
                        style={{
                          fontWeight: '500',
                          color: invoice.amount_due > 0 ? '#ef4444' : '#10b981',
                        }}
                      >
                        ${invoice.amount_due.toLocaleString()}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'center' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 12px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          background: `${getStatusColor(invoice.status)}20`,
                          color: getStatusColor(invoice.status),
                        }}
                      >
                        <StatusIcon size={14} />
                        {invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default InvoiceList;
