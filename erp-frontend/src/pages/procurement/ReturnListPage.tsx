import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  RotateCcw,
  Truck,
  Calendar,
  User,
  Building,
  DollarSign,
  FileText,
  CreditCard,
} from 'lucide-react';

import {
  usePurchaseReturns,
  usePostPurchaseReturn,
  useUpdatePurchaseReturnStatus,
  useAllProcurementSuppliers,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { PurchaseReturn } from '../../services/procurementService';

const ReturnListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterReasonCategory, setFilterReasonCategory] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('-created_at');

  // React Query hooks
  const {
    data: returnsData,
    isLoading,
    error,
  } = usePurchaseReturns({
    search: searchQuery || undefined,
    status: filterStatus === 'all' ? undefined : filterStatus,
    supplier_id: filterSupplier === 'all' ? undefined : parseInt(filterSupplier),
    return_reason_category: filterReasonCategory === 'all' ? undefined : filterReasonCategory,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ordering: sortBy,
  });

  const { data: suppliersData } = useAllProcurementSuppliers();

  // Mutations
  const postReturnMutation = usePostPurchaseReturn();
  const updateReturnStatusMutation = useUpdatePurchaseReturnStatus();

  const returns = returnsData?.results || [];
  const suppliers = suppliersData || [];
  const processing = postReturnMutation.isPending || updateReturnStatusMutation.isPending;

  const handleApproveReturn = async (returnId: number) => {
    try {
      await updateReturnStatusMutation.mutateAsync({
        id: returnId,
        status: 'approved',
      });
      toast.success('Return approved successfully!');
    } catch (err: unknown) {
      console.error('Failed to approve return:', err);
      toast.error('Failed to approve return');
    }
  };

  const handleRejectReturn = async (returnId: number) => {
    const comments = prompt('Enter rejection reason:');
    if (!comments) return;

    try {
      await updateReturnStatusMutation.mutateAsync({
        id: returnId,
        status: 'cancelled',
      });
      toast.success('Return rejected');
    } catch (err: unknown) {
      console.error('Failed to reject return:', err);
      toast.error('Failed to reject return');
    }
  };

  const handleProcessReturn = async (returnId: number) => {
    if (!confirm('Process this return? This will post it to inventory and accounting.')) return;

    try {
      await postReturnMutation.mutateAsync({
        id: returnId,
        data: {}, // Post with current data
      });
      toast.success('Return processed successfully!');
    } catch (err: unknown) {
      console.error('Failed to process return:', err);
      toast.error('Failed to process return');
    }
  };

  const handleCompleteReturn = async (returnId: number) => {
    if (!confirm('Complete this return? This will finalize the return process.')) return;

    try {
      await updateReturnStatusMutation.mutateAsync({
        id: returnId,
        status: 'completed',
      });
      toast.success('Return completed successfully!');
    } catch (err: unknown) {
      console.error('Failed to complete return:', err);
      toast.error('Failed to complete return');
    }
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'draft':
        return '#6b7280';
      case 'submitted':
        return '#f59e0b';
      case 'approved':
        return '#10b981';
      case 'processed':
        return '#8b5cf6';
      case 'completed':
        return '#059669';
      case 'cancelled':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  };

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'submitted':
        return 'Submitted';
      case 'approved':
        return 'Approved';
      case 'processed':
        return 'Processed';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      draft: FileText,
      submitted: Clock,
      approved: CheckCircle,
      processed: Truck,
      completed: CheckCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    return <Icon size={16} />;
  };

  const getReasonCategoryColor = (category: string): string => {
    switch (category) {
      case 'quality_issue':
        return '#ef4444';
      case 'wrong_delivery':
        return '#f59e0b';
      case 'damaged_goods':
        return '#dc2626';
      case 'expired_items':
        return '#7c2d12';
      case 'overdelivery':
        return '#3b82f6';
      case 'other':
        return '#6b7280';
      default:
        return '#6b7280';
    }
  };

  const getReasonCategoryLabel = (category: string): string => {
    switch (category) {
      case 'quality_issue':
        return 'Quality Issue';
      case 'wrong_delivery':
        return 'Wrong Delivery';
      case 'damaged_goods':
        return 'Damaged Goods';
      case 'expired_items':
        return 'Expired Items';
      case 'overdelivery':
        return 'Over Delivery';
      case 'other':
        return 'Other';
      default:
        return 'Unknown';
    }
  };

  const getRefundMethodIcon = (method: string) => {
    switch (method) {
      case 'credit_note':
        return <CreditCard size={14} />;
      case 'cash_refund':
        return <DollarSign size={14} />;
      case 'replacement':
        return <RotateCcw size={14} />;
      case 'account_credit':
        return <FileText size={14} />;
      default:
        return <FileText size={14} />;
    }
  };

  const getRefundMethodLabel = (method: string): string => {
    switch (method) {
      case 'credit_note':
        return 'Credit Note';
      case 'cash_refund':
        return 'Cash Refund';
      case 'replacement':
        return 'Replacement';
      case 'account_credit':
        return 'Account Credit';
      default:
        return 'Unknown';
    }
  };

  const canApprove = (returnItem: PurchaseReturn) =>
    ['draft', 'submitted'].includes(returnItem.status);

  const canReject = (returnItem: PurchaseReturn) =>
    ['draft', 'submitted'].includes(returnItem.status);

  const canEdit = (returnItem: PurchaseReturn) => ['draft'].includes(returnItem.status);

  const canProcess = (returnItem: PurchaseReturn) => returnItem.status === 'approved';

  const canComplete = (returnItem: PurchaseReturn) => returnItem.status === 'processed';

  if (error) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading Purchase Returns</h3>
          <p>Failed to load purchase returns. Please try again.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '16px',
          }}
        >
          <div>
            <h1
              style={{
                margin: '0 0 8px 0',
                fontSize: '32px',
                fontWeight: 'bold',
                color: '#1f2937',
              }}
            >
              Purchase Returns
            </h1>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Manage returns to suppliers with credit note tracking and status workflow
            </p>
          </div>
          <button
            onClick={() => navigate('/procurement/returns/create')}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={20} />
            Create Return
          </button>
        </div>

        {/* Search and Filters */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: '16px',
          }}
        >
          <div style={{ position: 'relative', flex: '1', minWidth: '300px' }}>
            <Search
              size={20}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280',
              }}
            />
            <input
              type="text"
              placeholder="Search by return number, GRN number, or supplier..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 12px 12px 44px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: '#6b7280' }} />
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              style={{
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                minWidth: '150px',
              }}
            >
              <option value="all">All Status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="approved">Approved</option>
              <option value="processed">Processed</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="all">All Suppliers</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id.toString()}>
                {supplier.name}
              </option>
            ))}
          </select>

          <select
            value={filterReasonCategory}
            onChange={e => setFilterReasonCategory(e.target.value)}
            style={{
              padding: '12px',
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="all">All Reasons</option>
            <option value="quality_issue">Quality Issue</option>
            <option value="wrong_delivery">Wrong Delivery</option>
            <option value="damaged_goods">Damaged Goods</option>
            <option value="expired_items">Expired Items</option>
            <option value="overdelivery">Over Delivery</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Date Filters */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: '#6b7280' }} />
            <label style={{ fontSize: '14px', color: '#374151' }}>From:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '14px', color: '#374151' }}>To:</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '2px solid #e5e7eb',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '2px solid #e5e7eb',
              borderRadius: '6px',
              fontSize: '14px',
              minWidth: '150px',
            }}
          >
            <option value="-created_at">Newest First</option>
            <option value="created_at">Oldest First</option>
            <option value="return_number">Return Number</option>
            <option value="-return_date">Latest Return Date</option>
            <option value="return_date">Earliest Return Date</option>
            <option value="supplier_name">Supplier Name</option>
            <option value="-total_return_value">Highest Value</option>
            <option value="total_return_value">Lowest Value</option>
          </select>
        </div>
      </div>

      {/* Returns Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '48px' }}>
          <div style={{ color: '#6b7280' }}>Loading purchase returns...</div>
        </div>
      ) : returns.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '48px',
            background: '#f9fafb',
            borderRadius: '12px',
          }}
        >
          <RotateCcw size={64} style={{ margin: '0 auto 24px', color: '#d1d5db' }} />
          <h3 style={{ margin: '0 0 8px 0', fontSize: '20px', color: '#374151' }}>
            No Purchase Returns Found
          </h3>
          <p style={{ margin: '0 0 24px 0', color: '#6b7280' }}>
            {searchQuery ||
            filterStatus !== 'all' ||
            filterSupplier !== 'all' ||
            filterReasonCategory !== 'all'
              ? 'No returns match your current filters.'
              : 'Get started by creating your first purchase return.'}
          </p>
          <button
            onClick={() => navigate('/procurement/returns/create')}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              background: '#3b82f6',
              color: 'white',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Plus size={16} />
            Create Return
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '16px' }}>
          {returns.map(returnItem => (
            <div
              key={returnItem.id}
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = '#3b82f6';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.15)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = '#e5e7eb';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '16px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                      {returnItem.return_number}
                    </h3>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 12px',
                        borderRadius: '20px',
                        background: `${getStatusColor(returnItem.status)}20`,
                        color: getStatusColor(returnItem.status),
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {getStatusIcon(returnItem.status)}
                      {getStatusLabel(returnItem.status)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: `${getReasonCategoryColor(returnItem.return_reason_category)}20`,
                        color: getReasonCategoryColor(returnItem.return_reason_category),
                        fontSize: '11px',
                        fontWeight: 600,
                      }}
                    >
                      <AlertCircle size={12} />
                      {getReasonCategoryLabel(returnItem.return_reason_category)}
                    </div>
                  </div>

                  <div
                    style={{ display: 'flex', gap: '24px', marginBottom: '8px', flexWrap: 'wrap' }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Building size={14} />
                      <strong>Supplier:</strong> {returnItem.supplier_name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <FileText size={14} />
                      <strong>GRN:</strong> {returnItem.grn_number}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <Calendar size={14} />
                      <strong>Return Date:</strong>{' '}
                      {new Date(returnItem.return_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div
                    style={{ display: 'flex', gap: '24px', marginBottom: '8px', flexWrap: 'wrap' }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <User size={14} />
                      <strong>Created By:</strong> {returnItem.created_by_name}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: '#6b7280',
                        fontSize: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {getRefundMethodIcon(returnItem.refund_method)}
                      <strong>Refund Method:</strong>{' '}
                      {getRefundMethodLabel(returnItem.refund_method)}
                    </p>
                  </div>

                  {returnItem.credit_note_number && (
                    <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                      <strong>Credit Note:</strong> {returnItem.credit_note_number}
                      {returnItem.credit_note_amount &&
                        ` (₦${parseFloat(returnItem.credit_note_amount).toLocaleString()})`}
                    </p>
                  )}

                  <p style={{ margin: '0 0 8px 0', color: '#6b7280', fontSize: '14px' }}>
                    <strong>Items:</strong> {returnItem.items.length} item
                    {returnItem.items.length !== 1 ? 's' : ''}
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    style={{
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#1f2937',
                      marginBottom: '4px',
                    }}
                  >
                    ₦{parseFloat(returnItem.total_amount || '0').toLocaleString()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Return Value</div>
                </div>
              </div>

              {/* Notes */}
              {returnItem.notes && (
                <div
                  style={{
                    marginBottom: '16px',
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '6px',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151', fontStyle: 'italic' }}>
                    <strong>Notes:</strong> "{returnItem.notes}"
                  </p>
                </div>
              )}

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: '8px',
                  justifyContent: 'flex-end',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={() => navigate(`/procurement/returns/${returnItem.id}/view`)}
                  style={{
                    padding: '8px 16px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    background: 'white',
                    cursor: 'pointer',
                    fontSize: '12px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    color: '#374151',
                  }}
                >
                  <Eye size={14} />
                  View
                </button>

                {canEdit(returnItem) && (
                  <button
                    onClick={() => navigate(`/procurement/returns/${returnItem.id}/edit`)}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      background: 'white',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      color: '#374151',
                    }}
                  >
                    <Edit size={14} />
                    Edit
                  </button>
                )}

                {canUserApprove && canApprove(returnItem) && (
                  <button
                    onClick={() => handleApproveReturn(returnItem.id)}
                    disabled={processing}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      background: processing ? '#9ca3af' : '#10b981',
                      color: 'white',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle size={14} />
                    Approve
                  </button>
                )}

                {canUserApprove && canReject(returnItem) && (
                  <button
                    onClick={() => handleRejectReturn(returnItem.id)}
                    disabled={processing}
                    style={{
                      padding: '8px 16px',
                      border: '1px solid #ef4444',
                      borderRadius: '6px',
                      background: 'white',
                      color: '#ef4444',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                )}

                {canProcess(returnItem) && (
                  <button
                    onClick={() => handleProcessReturn(returnItem.id)}
                    disabled={processing}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      background: processing ? '#9ca3af' : '#8b5cf6',
                      color: 'white',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Truck size={14} />
                    Process
                  </button>
                )}

                {canComplete(returnItem) && (
                  <button
                    onClick={() => handleCompleteReturn(returnItem.id)}
                    disabled={processing}
                    style={{
                      padding: '8px 16px',
                      border: 'none',
                      borderRadius: '6px',
                      background: processing ? '#9ca3af' : '#059669',
                      color: 'white',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '12px',
                      fontWeight: 500,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <CheckCircle size={14} />
                    Complete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReturnListPage;
