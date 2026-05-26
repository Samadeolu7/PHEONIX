import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Building,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  Calendar,
  FileText,
  Upload,
  Download,
  Trash2,
  AlertTriangle,
  ShoppingCart,
  Receipt,
} from 'lucide-react';
import { useSupplier } from '../../hooks/useSuppliers';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supplierService, SupplierDocument } from '../../services/supplierService';
import { procurementService } from '../../services/procurementService';
import { listPayables } from '../../services/liabilitiesService';

const SupplierDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const supplierId = id ? parseInt(id) : 0;

  // React Query hook
  const { data: supplier, isLoading, error } = useSupplier(supplierId, !!id);

  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'documents'>('overview');

  // Real Purchase Orders for this supplier
  const { data: posData, isLoading: loadingPOs } = useQuery({
    queryKey: ['supplier-purchase-orders', supplierId],
    queryFn: () => procurementService.getPurchaseOrders({ supplier: supplierId }),
    enabled: activeTab === 'transactions' && supplierId > 0,
  });

  // Real AP / Invoice records for this supplier
  const { data: apData, isLoading: loadingAP } = useQuery({
    queryKey: ['supplier-payables', supplierId],
    queryFn: () => listPayables({ vendor_type: 'supplier', vendor_id: supplierId }),
    enabled: activeTab === 'transactions' && supplierId > 0,
  });

  const supplierPOs = posData?.results ?? [];
  const supplierPayables = apData?.results ?? [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '400px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              border: '4px solid #e5e7eb',
              borderTop: '4px solid #3b82f6',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              margin: '0 auto 16px',
            }}
          />
          <p style={{ color: '#6b7280' }}>Loading supplier details...</p>
        </div>
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div style={{ maxWidth: '800px', margin: '0 auto', padding: '1.5rem' }}>
        <div
          style={{
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            padding: '16px',
            textAlign: 'center',
          }}
        >
          <h2 style={{ color: '#dc2626', marginBottom: '8px' }}>Error</h2>
          <p style={{ color: '#dc2626', marginBottom: '16px' }}>
            Failed to load supplier details. Please try again.
          </p>
          <button
            onClick={() => navigate('/procurement/suppliers')}
            style={{
              padding: '8px 16px',
              background: '#dc2626',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Back to Suppliers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/procurement/suppliers')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'transparent',
            border: '1px solid #d1d5db',
            borderRadius: '0.375rem',
            cursor: 'pointer',
            marginBottom: '1rem',
          }}
        >
          <ArrowLeft style={{ width: '1rem', height: '1rem' }} />
          Back to Suppliers
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1
              style={{
                fontSize: '1.875rem',
                fontWeight: 700,
                marginBottom: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Building style={{ width: '2rem', height: '2rem', color: '#14b8a6' }} />
              {supplier.name}
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', color: '#6b7280' }}>
              <span>Code: {supplier.code}</span>
              <span
                style={{
                  padding: '0.25rem 0.5rem',
                  background: supplier.is_active ? '#d1fae5' : '#fee2e2',
                  color: supplier.is_active ? '#065f46' : '#991b1b',
                  borderRadius: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                }}
              >
                {supplier.is_active ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate(`/procurement/suppliers/${supplier.id}/edit`)}
            style={{
              padding: '0.5rem 1rem',
              background: '#14b8a6',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 500,
            }}
          >
            <Edit style={{ width: '1rem', height: '1rem' }} />
            Edit Supplier
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ borderBottom: '1px solid #e5e7eb' }}>
          <nav style={{ display: 'flex', gap: '2rem' }}>
            {[
              { key: 'overview', label: 'Overview', count: null },
              {
                key: 'transactions',
                label: 'Transactions',
                count: supplierPOs.length + supplierPayables.length || null,
              },
              { key: 'documents', label: 'Documents', count: null },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                style={{
                  padding: '0.75rem 0',
                  background: 'transparent',
                  border: 'none',
                  borderBottom:
                    activeTab === tab.key ? '2px solid #14b8a6' : '2px solid transparent',
                  color: activeTab === tab.key ? '#14b8a6' : '#6b7280',
                  fontWeight: activeTab === tab.key ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                {tab.label}
                {tab.count !== null && (
                  <span
                    style={{
                      marginLeft: '0.375rem',
                      padding: '0.1rem 0.4rem',
                      background: activeTab === tab.key ? '#ccfbf1' : '#f3f4f6',
                      color: activeTab === tab.key ? '#0f766e' : '#6b7280',
                      borderRadius: '0.75rem',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '1rem',
            }}
          >
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <CreditCard style={{ width: '1.25rem', height: '1.25rem', color: '#dc2626' }} />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>
                  Outstanding Balance
                </h3>
              </div>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#dc2626', margin: 0 }}>
                {formatCurrency(supplier.outstanding_balance)}
              </p>
            </div>

            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <CreditCard style={{ width: '1.25rem', height: '1.25rem', color: '#059669' }} />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>
                  Credit Limit
                </h3>
              </div>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', margin: 0 }}>
                {formatCurrency(supplier.credit_limit)}
              </p>
            </div>

            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                }}
              >
                <Calendar style={{ width: '1.25rem', height: '1.25rem', color: '#3b82f6' }} />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>
                  Payment Terms
                </h3>
              </div>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6', margin: 0 }}>
                {supplier.payment_terms}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {/* Contact Information */}
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  color: '#111827',
                }}
              >
                Contact Information
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {supplier.contact_person && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Building style={{ width: '1rem', height: '1rem', color: '#6b7280' }} />
                    <span style={{ fontSize: '0.875rem' }}>{supplier.contact_person}</span>
                  </div>
                )}

                {supplier.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Mail style={{ width: '1rem', height: '1rem', color: '#6b7280' }} />
                    <a
                      href={`mailto:${supplier.email}`}
                      style={{ fontSize: '0.875rem', color: '#3b82f6', textDecoration: 'none' }}
                    >
                      {supplier.email}
                    </a>
                  </div>
                )}

                {supplier.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Phone style={{ width: '1rem', height: '1rem', color: '#6b7280' }} />
                    <a
                      href={`tel:${supplier.phone}`}
                      style={{ fontSize: '0.875rem', color: '#3b82f6', textDecoration: 'none' }}
                    >
                      {supplier.phone}
                    </a>
                  </div>
                )}
              </div>
            </div>

            {/* Address Information */}
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  color: '#111827',
                }}
              >
                Address Information
              </h3>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                <MapPin
                  style={{ width: '1rem', height: '1rem', color: '#6b7280', marginTop: '0.125rem' }}
                />
                <div style={{ fontSize: '0.875rem', lineHeight: '1.4' }}>
                  {supplier.address && <div>{supplier.address}</div>}
                  <div>{[supplier.city, supplier.country].filter(Boolean).join(', ')}</div>
                </div>
              </div>
            </div>

            {/* Business Information */}
            <div
              style={{
                background: 'white',
                padding: '1.5rem',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                border: '1px solid #e5e7eb',
              }}
            >
              <h3
                style={{
                  fontSize: '1.125rem',
                  fontWeight: 600,
                  marginBottom: '1rem',
                  color: '#111827',
                }}
              >
                Business Information
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {supplier.tax_id && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
                      Tax ID:
                    </span>
                    <div style={{ fontSize: '0.875rem' }}>{supplier.tax_id}</div>
                  </div>
                )}

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
                    Created:
                  </span>
                  <div style={{ fontSize: '0.875rem' }}>{formatDate(supplier.created_at)}</div>
                </div>

                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', fontWeight: 500 }}>
                    Last Updated:
                  </span>
                  <div style={{ fontSize: '0.875rem' }}>{formatDate(supplier.updated_at)}</div>
                </div>
              </div>
            </div>

            {/* Notes - Remove this section since notes property doesn't exist */}
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* ── Purchase Orders ── */}
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <ShoppingCart style={{ width: '1.125rem', height: '1.125rem', color: '#3b82f6' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                Purchase Orders
              </h3>
              {!loadingPOs && (
                <span
                  style={{
                    padding: '0.1rem 0.5rem',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    borderRadius: '0.75rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {supplierPOs.length}
                </span>
              )}
            </div>

            {loadingPOs ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                Loading purchase orders…
              </div>
            ) : supplierPOs.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                <ShoppingCart
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    color: '#9ca3af',
                    margin: '0 auto 0.75rem',
                  }}
                />
                <p style={{ color: '#6b7280', margin: 0 }}>No purchase orders for this supplier.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {[
                      'PO Number',
                      'Order Date',
                      'Delivery Date',
                      'Amount',
                      'Received',
                      'Status',
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '0.625rem 0.75rem',
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#374151',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierPOs.map(po => {
                    const statusColors: Record<string, { bg: string; text: string }> = {
                      draft: { bg: '#f3f4f6', text: '#374151' },
                      submitted: { bg: '#eff6ff', text: '#1d4ed8' },
                      approved: { bg: '#d1fae5', text: '#065f46' },
                      sent: { bg: '#e0e7ff', text: '#3730a3' },
                      acknowledged: { bg: '#fef3c7', text: '#78350f' },
                      partially_received: { bg: '#fef9c3', text: '#854d0e' },
                      received: { bg: '#d1fae5', text: '#065f46' },
                      cancelled: { bg: '#fee2e2', text: '#991b1b' },
                    };
                    const sc = statusColors[po.status] ?? { bg: '#f3f4f6', text: '#374151' };
                    return (
                      <tr
                        key={po.id}
                        style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                        onClick={() => navigate(`/procurement/purchase-orders/${po.id}`)}
                      >
                        <td
                          style={{
                            padding: '0.625rem 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: '#3b82f6',
                          }}
                        >
                          {po.po_number}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {po.order_date ? formatDate(po.order_date) : '—'}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—'}
                        </td>
                        <td
                          style={{
                            padding: '0.625rem 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          {formatCurrency(po.total_amount)}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {parseFloat(po.received_percentage).toFixed(0)}%
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem' }}>
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              background: sc.bg,
                              color: sc.text,
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              textTransform: 'capitalize',
                            }}
                          >
                            {po.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Accounts Payable / Invoices ── */}
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '1rem 1.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Receipt style={{ width: '1.125rem', height: '1.125rem', color: '#f59e0b' }} />
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: '#111827' }}>
                Accounts Payable / Invoices
              </h3>
              {!loadingAP && (
                <span
                  style={{
                    padding: '0.1rem 0.5rem',
                    background: '#fffbeb',
                    color: '#b45309',
                    borderRadius: '0.75rem',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                  }}
                >
                  {supplierPayables.length}
                </span>
              )}
            </div>

            {loadingAP ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                Loading invoices…
              </div>
            ) : supplierPayables.length === 0 ? (
              <div style={{ padding: '2.5rem', textAlign: 'center' }}>
                <Receipt
                  style={{
                    width: '2.5rem',
                    height: '2.5rem',
                    color: '#9ca3af',
                    margin: '0 auto 0.75rem',
                  }}
                />
                <p style={{ color: '#6b7280', margin: 0 }}>No accounts payable records found.</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f9fafb' }}>
                  <tr>
                    {[
                      'Reference',
                      'Invoice No.',
                      'Invoice Date',
                      'Due Date',
                      'Total',
                      'Balance Due',
                      'Status',
                    ].map(h => (
                      <th
                        key={h}
                        style={{
                          padding: '0.625rem 0.75rem',
                          textAlign: 'left',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          color: '#374151',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {supplierPayables.map(ap => {
                    const apStatusColors: Record<string, { bg: string; text: string }> = {
                      pending: { bg: '#fef3c7', text: '#78350f' },
                      partial: { bg: '#e0e7ff', text: '#3730a3' },
                      paid: { bg: '#d1fae5', text: '#065f46' },
                      overdue: { bg: '#fee2e2', text: '#991b1b' },
                      cancelled: { bg: '#f3f4f6', text: '#374151' },
                    };
                    const asc = apStatusColors[ap.status] ?? { bg: '#f3f4f6', text: '#374151' };
                    return (
                      <tr key={ap.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td
                          style={{
                            padding: '0.625rem 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                          }}
                        >
                          {ap.reference_number}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {ap.invoice_number}
                          {ap.purchase_order_number && (
                            <div style={{ fontSize: '0.7rem', color: '#6b7280' }}>
                              PO: {ap.purchase_order_number}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {formatDate(ap.invoice_date)}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem', fontSize: '0.875rem' }}>
                          {formatDate(ap.due_date)}
                        </td>
                        <td
                          style={{
                            padding: '0.625rem 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 500,
                          }}
                        >
                          {formatCurrency(ap.total_amount)}
                        </td>
                        <td
                          style={{
                            padding: '0.625rem 0.75rem',
                            fontSize: '0.875rem',
                            fontWeight: 600,
                            color: parseFloat(ap.amount_due) > 0 ? '#dc2626' : '#059669',
                          }}
                        >
                          {formatCurrency(ap.amount_due)}
                        </td>
                        <td style={{ padding: '0.625rem 0.75rem' }}>
                          <span
                            style={{
                              padding: '0.2rem 0.5rem',
                              background: asc.bg,
                              color: asc.text,
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              textTransform: 'capitalize',
                            }}
                          >
                            {ap.status}
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
      )}

      {activeTab === 'documents' && <SupplierDocumentsTab supplierId={supplierId} />}
    </div>
  );
};

/* ─── Documents sub-component ─── */

const SupplierDocumentsTab: React.FC<{ supplierId: number }> = ({ supplierId }) => {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data: documents = [], isLoading } = useQuery<SupplierDocument[]>({
    queryKey: ['supplier-documents', supplierId],
    queryFn: () => supplierService.getSupplierDocuments(supplierId),
  });

  const { data: categories = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ['supplier-document-categories'],
    queryFn: () => supplierService.getDocumentCategories(),
  });

  const uploadMutation = useMutation({
    mutationFn: (formData: FormData) => supplierService.uploadSupplierDocument(formData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-documents', supplierId] });
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: number) => supplierService.deleteSupplierDocument(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier-documents', supplierId] });
    },
  });

  const resetForm = () => {
    setShowUpload(false);
    setTitle('');
    setCategory('');
    setDescription('');
    setExpiryDate('');
    setFile(null);
  };

  const handleUpload = () => {
    if (!file || !title || !category) return;
    const formData = new FormData();
    formData.append('supplier', String(supplierId));
    formData.append('title', title);
    formData.append('category', category);
    formData.append('file', file);
    if (description) formData.append('description', description);
    if (expiryDate) formData.append('expiry_date', expiryDate);
    uploadMutation.mutate(formData);
  };

  return (
    <div className="bg-white rounded-lg shadow border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
        <button
          onClick={() => setShowUpload(s => !s)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
        >
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Document title"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                title="Document category"
              >
                <option value="">Select category</option>
                {categories.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                title="Expiry date"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                File <span className="text-red-500">*</span>
              </label>
              <input
                type="file"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                title="Choose file to upload"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Optional description"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleUpload}
              disabled={!file || !title || !category || uploadMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Upload'}
            </button>
            <button
              onClick={resetForm}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Documents list */}
      <div className="p-4">
        {isLoading ? (
          <p className="text-center text-gray-500 py-8">Loading documents...</p>
        ) : documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Title</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Expiry</th>
                  <th className="pb-2 font-medium">Uploaded By</th>
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => (
                  <tr key={doc.id} className="border-b border-gray-100">
                    <td className="py-3 font-medium text-gray-900">{doc.title}</td>
                    <td className="py-3 text-gray-600">{doc.category_display}</td>
                    <td className="py-3">
                      {doc.expiry_date ? (
                        <span
                          className={`inline-flex items-center gap-1 ${doc.is_expired ? 'text-red-600' : 'text-gray-600'}`}
                        >
                          {doc.is_expired && <AlertTriangle className="w-3 h-3" />}
                          {new Date(doc.expiry_date).toLocaleDateString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="py-3 text-gray-600">{doc.uploaded_by_name ?? '—'}</td>
                    <td className="py-3 text-gray-600">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <a
                          href={doc.file}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-blue-600 hover:text-blue-800"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => {
                            if (window.confirm('Delete this document?')) {
                              deleteMutation.mutate(doc.id);
                            }
                          }}
                          className="p-1 text-red-600 hover:text-red-800"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupplierDetailPage;
