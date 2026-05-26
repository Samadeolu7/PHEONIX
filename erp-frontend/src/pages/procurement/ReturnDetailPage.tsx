import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
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
  Package,
  Hash,
  Eye,
  Download,
  Mail,
  Phone,
  MapPin,
  Clipboard,
  TrendingUp,
  TrendingDown,
  Activity,
  Info,
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import {
  usePurchaseReturn,
  usePostPurchaseReturn,
  useUpdatePurchaseReturnStatus,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { procurementService } from '../../services/procurementService';
import type { GLEntriesResponse } from '../../services/procurementService';

const ReturnDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalComments, setApprovalComments] = useState('');

  // React Query hooks
  const { data: returnData, isLoading, error } = usePurchaseReturn(parseInt(id || '0'), !!id);

  // Fetch GL entries when the return is posted
  const { data: glData } = useQuery<GLEntriesResponse>({
    queryKey: ['purchase-return-gl', id],
    queryFn: () => procurementService.getPurchaseReturnGLEntries(parseInt(id || '0')),
    enabled: !!returnData?.is_posted,
  });

  // Mutations
  const postReturnMutation = usePostPurchaseReturn();
  const updateReturnStatusMutation = useUpdatePurchaseReturnStatus();

  const processing = postReturnMutation.isPending || updateReturnStatusMutation.isPending;

  const handleApprovalAction = async () => {
    if (!returnData) return;

    try {
      if (approvalAction === 'approve') {
        await updateReturnStatusMutation.mutateAsync({
          id: returnData.id,
          status: 'approved',
        });
        toast.success('Return approved successfully!');
      } else {
        await updateReturnStatusMutation.mutateAsync({
          id: returnData.id,
          status: 'cancelled',
        });
        toast.success('Return rejected');
      }
      setShowApprovalModal(false);
      setApprovalComments('');
    } catch (err: unknown) {
      console.error(`Failed to ${approvalAction} return:`, err);
      toast.error(`Failed to ${approvalAction} return`);
    }
  };

  const handleProcessReturn = async () => {
    if (!returnData) return;

    if (!confirm('Process this return? This will post it to inventory and accounting.')) return;

    try {
      // Create the payload structure expected by the backend
      const postPayload = {
        grn: returnData.grn,
        supplier: returnData.supplier,
        return_date: returnData.return_date,
        return_reason: returnData.return_reason,
        status: returnData.status,
        total_amount: returnData.total_amount,
        refund_method: returnData.refund_method,
        refund_received: returnData.refund_received || false,
        refund_date: returnData.refund_date,
        notes: returnData.notes || '',
        items: returnData.items.map(item => ({
          grn_item: item.grn_item,
          item: item.item,
          quantity_returned: item.quantity_returned,
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          reason: item.reason,
        })),
      };

      await postReturnMutation.mutateAsync({
        id: returnData.id,
        data: postPayload,
      });
      toast.success('Return processed successfully!');
    } catch (err: unknown) {
      console.error('Failed to process return:', err);
      toast.error('Failed to process return');
    }
  };

  const handleCompleteReturn = async () => {
    if (!returnData) return;

    if (!confirm('Complete this return? This will finalize the return process.')) return;

    try {
      await updateReturnStatusMutation.mutateAsync({
        id: returnData.id,
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
      case 'pending':
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
      case 'pending':
        return 'Pending';

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
      // draft: FileText,
      pending: Clock,
      approved: CheckCircle,
      processed: Truck,
      completed: CheckCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    return <Icon size={20} />;
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
        return <CreditCard size={16} />;
      case 'cash_refund':
        return <DollarSign size={16} />;
      case 'replacement':
        return <RotateCcw size={16} />;
      case 'account_credit':
        return <FileText size={16} />;
      default:
        return <FileText size={16} />;
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

  const canApprove = (returnItem: any) => ['pending', 'draft'].includes(returnItem.status);

  const canReject = (returnItem: any) => ['pending', 'draft'].includes(returnItem.status);

  const canEdit = (returnItem: any) => ['pending', 'draft'].includes(returnItem.status);

  const canProcess = (returnItem: any) => returnItem.status === 'approved';

  const canComplete = (returnItem: any) => returnItem.status === 'processed';

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading purchase return details...</div>
      </div>
    );
  }

  if (error || !returnData) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading Purchase Return</h3>
          <p>Failed to load purchase return details. Please try again.</p>
        </div>
        <button
          onClick={() => navigate('/procurement/returns')}
          style={{
            padding: '12px 24px',
            border: 'none',
            borderRadius: '8px',
            background: '#3b82f6',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600,
          }}
        >
          Back to Returns
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
          <button
            onClick={() => navigate('/procurement/returns')}
            style={{
              padding: '8px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <div style={{ flex: 1 }}>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}
            >
              <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#1f2937' }}>
                {returnData.return_number}
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  background: `${getStatusColor(returnData.status)}20`,
                  color: getStatusColor(returnData.status),
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {getStatusIcon(returnData.status)}
                {getStatusLabel(returnData.status)}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 12px',
                  borderRadius: '12px',
                  background: `${getReasonCategoryColor(returnData.return_reason)}20`,
                  color: getReasonCategoryColor(returnData.return_reason),
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <AlertCircle size={14} />
                {getReasonCategoryLabel(returnData.return_reason)}
              </div>
            </div>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Purchase return details and status workflow
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {canEdit(returnData) && (
              <button
                onClick={() => navigate(`/procurement/returns/${returnData.id}/edit`)}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#374151',
                }}
              >
                <Edit size={16} />
                Edit
              </button>
            )}

            {canApprove(returnData) && (
              <button
                onClick={() => {
                  setApprovalAction('approve');
                  setShowApprovalModal(true);
                }}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#10b981',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={16} />
                Approve
              </button>
            )}

            {canReject(returnData) && (
              <button
                onClick={() => {
                  setApprovalAction('reject');
                  setShowApprovalModal(true);
                }}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #ef4444',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#ef4444',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <XCircle size={16} />
                Reject
              </button>
            )}

            {canProcess(returnData) && (
              <button
                onClick={handleProcessReturn}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Truck size={16} />
                Process
              </button>
            )}

            {canComplete(returnData) && (
              <button
                onClick={handleCompleteReturn}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#059669',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={16} />
                Complete
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '24px' }}>
        {/* Return Header Information */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          {/* Basic Information */}
          <div
            style={{
              padding: '24px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Info size={20} />
              Return Information
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  Return Number
                </label>
                <p style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                  {returnData.return_number}
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  Return Date
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Calendar size={14} />
                  {new Date(returnData.return_date).toLocaleDateString()}
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  Supplier
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Building size={14} />
                  {returnData.supplier_name}
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  GRN Reference
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <FileText size={14} />
                  <button
                    onClick={() => navigate(`/procurement/grn/${returnData.grn}/view`)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#3b82f6',
                      cursor: 'pointer',
                      textDecoration: 'underline',
                      fontSize: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {returnData.grn_number}
                    <ExternalLink size={12} />
                  </button>
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  Refund Method
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {getRefundMethodIcon(returnData.refund_method)}
                  {getRefundMethodLabel(returnData.refund_method)}
                </p>
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#6b7280',
                    marginBottom: '4px',
                  }}
                >
                  Status
                </label>
                <p
                  style={{
                    margin: 0,
                    fontSize: '14px',
                    color: '#374151',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  {getStatusIcon(returnData.status)}
                  {getStatusLabel(returnData.status)}
                </p>
              </div>
            </div>

            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#6b7280',
                  marginBottom: '4px',
                }}
              >
                Created At
              </label>
              <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>
                {new Date(returnData.created_at).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Financial Summary */}
          <div
            style={{
              padding: '24px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
            }}
          >
            <h3
              style={{
                margin: '0 0 20px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <DollarSign size={20} />
              Financial Summary
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <div
                style={{
                  textAlign: 'center',
                  padding: '20px',
                  background: '#f0f9ff',
                  borderRadius: '8px',
                  border: '2px solid #0ea5e9',
                }}
              >
                <div
                  style={{
                    fontSize: '28px',
                    fontWeight: 'bold',
                    color: '#0c4a6e',
                    marginBottom: '4px',
                  }}
                >
                  ₦{parseFloat(returnData.total_amount).toLocaleString()}
                </div>
                <div style={{ fontSize: '14px', color: '#075985' }}>Total Return Value</div>
              </div>
            </div>

            {returnData.credit_note_number && (
              <div
                style={{
                  padding: '16px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '8px',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: '#166534',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <CreditCard size={14} />
                  Credit Note Information
                </h4>
                <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#166534' }}>
                  <strong>Number:</strong> {returnData.credit_note_number}
                </p>
                {returnData.credit_note_amount && (
                  <p style={{ margin: 0, fontSize: '12px', color: '#166534' }}>
                    <strong>Amount:</strong> ₦
                    {parseFloat(returnData.credit_note_amount).toLocaleString()}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Status Workflow and Approval History */}
        <div
          style={{
            padding: '24px',
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
          }}
        >
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Activity size={20} />
            Status Workflow & Approval History
          </h3>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}
          >
            {/* Status Timeline */}
            {['pending', 'approved', 'processed', 'completed'].map((status, index) => {
              const isActive = status === returnData.status;
              const isPassed =
                ['pending', 'approved', 'processed'].indexOf(returnData.status) >= index;

              return (
                <div
                  key={status}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: `2px solid ${isActive ? getStatusColor(status) : isPassed ? '#d1d5db' : '#f3f4f6'}`,
                    background: isActive
                      ? `${getStatusColor(status)}10`
                      : isPassed
                        ? '#f9fafb'
                        : '#ffffff',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      color: isActive ? getStatusColor(status) : isPassed ? '#374151' : '#9ca3af',
                      marginBottom: '4px',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                  >
                    {getStatusIcon(status)}
                  </div>
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: isActive ? 600 : 500,
                      color: isActive ? getStatusColor(status) : isPassed ? '#374151' : '#9ca3af',
                    }}
                  >
                    {getStatusLabel(status)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Approval Information */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '16px',
            }}
          >
            {returnData.status !== 'pending' && (
              <div
                style={{
                  padding: '12px',
                  background: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '6px',
                }}
              >
                <h4
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: '#166534',
                  }}
                >
                  Status Information
                </h4>
                <p style={{ margin: '0 0 2px 0', fontSize: '14px', color: '#166534' }}>
                  Current Status: {getStatusLabel(returnData.status)}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: '#16a34a' }}>
                  Last Updated: {new Date(returnData.updated_at).toLocaleString()}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Returned Items */}
        <div
          style={{
            padding: '24px',
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
          }}
        >
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <Package size={20} />
            Returned Items ({returnData.items.length})
          </h3>

          <div style={{ display: 'grid', gap: '12px' }}>
            {returnData.items.map((item, index) => (
              <div
                key={item.id || index}
                style={{
                  padding: '16px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  background: '#fafafa',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px',
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <h4
                      style={{
                        margin: '0 0 4px 0',
                        fontSize: '16px',
                        fontWeight: 600,
                        color: '#1f2937',
                      }}
                    >
                      {item.item_name}
                    </h4>
                    <div
                      style={{ display: 'flex', gap: '16px', fontSize: '14px', color: '#374151' }}
                    >
                      <span>
                        <strong>Returned:</strong> {item.quantity_returned}
                      </span>
                      <span>
                        <strong>Unit Cost:</strong> ₦{parseFloat(item.unit_cost).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontSize: '18px',
                        fontWeight: 'bold',
                        color: '#1f2937',
                        marginBottom: '4px',
                      }}
                    >
                      ₦{parseFloat(item.total_cost).toLocaleString()}
                    </div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Return Value</div>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6b7280',
                        marginBottom: '2px',
                      }}
                    >
                      Return Reason
                    </label>
                    <p style={{ margin: 0, fontSize: '14px', color: '#374151' }}>{item.reason}</p>
                  </div>
                </div>

                {item.notes && (
                  <div
                    style={{
                      marginTop: '12px',
                      padding: '8px',
                      background: '#f9fafb',
                      borderRadius: '4px',
                    }}
                  >
                    <label
                      style={{
                        display: 'block',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: '#6b7280',
                        marginBottom: '2px',
                      }}
                    >
                      Notes
                    </label>
                    <p
                      style={{ margin: 0, fontSize: '14px', color: '#374151', fontStyle: 'italic' }}
                    >
                      "{item.notes}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Accounting Impact Summary */}
        <div
          style={{
            padding: '24px',
            background: 'white',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
          }}
        >
          <h3
            style={{
              margin: '0 0 20px 0',
              fontSize: '18px',
              fontWeight: 600,
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <TrendingDown size={20} />
            Accounting Impact
          </h3>

          {!returnData.is_posted ? (
            <div
              style={{
                padding: '16px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280', fontStyle: 'italic' }}>
                <strong>Note:</strong> Accounting entries will be automatically posted when the
                return is completed. This will reduce inventory value and accounts payable by the
                return amount.
              </p>
            </div>
          ) : glData && glData.entries && glData.entries.length > 0 ? (
            <>
              <div style={{ marginBottom: '12px', fontSize: '14px', color: '#6b7280' }}>
                Journal Entry:{' '}
                <strong style={{ color: '#1f2937' }}>
                  {glData.reference || `#${glData.journal_entry_id}`}
                </strong>
                {glData.date && <> &mdash; {new Date(glData.date).toLocaleDateString()}</>}
              </div>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '14px',
                }}
              >
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        color: '#6b7280',
                        fontWeight: 600,
                      }}
                    >
                      Account Code
                    </th>
                    <th
                      style={{
                        textAlign: 'left',
                        padding: '8px 12px',
                        color: '#6b7280',
                        fontWeight: 600,
                      }}
                    >
                      Account Name
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '8px 12px',
                        color: '#6b7280',
                        fontWeight: 600,
                      }}
                    >
                      Debit (₦)
                    </th>
                    <th
                      style={{
                        textAlign: 'right',
                        padding: '8px 12px',
                        color: '#6b7280',
                        fontWeight: 600,
                      }}
                    >
                      Credit (₦)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {glData.entries.map(entry => (
                    <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <td
                        style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#374151' }}
                      >
                        {entry.account_code}
                      </td>
                      <td style={{ padding: '10px 12px', color: '#374151' }}>
                        {entry.account_name}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: parseFloat(entry.debit) > 0 ? 600 : 400,
                          color: parseFloat(entry.debit) > 0 ? '#dc2626' : '#d1d5db',
                        }}
                      >
                        {parseFloat(entry.debit) > 0
                          ? parseFloat(entry.debit).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })
                          : '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: parseFloat(entry.credit) > 0 ? 600 : 400,
                          color: parseFloat(entry.credit) > 0 ? '#16a34a' : '#d1d5db',
                        }}
                      >
                        {parseFloat(entry.credit) > 0
                          ? parseFloat(entry.credit).toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid #e5e7eb' }}>
                    <td colSpan={2} style={{ padding: '10px 12px', fontWeight: 700 }}>
                      Total
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#dc2626',
                      }}
                    >
                      {glData.entries
                        .reduce((sum, e) => sum + parseFloat(e.debit), 0)
                        .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td
                      style={{
                        padding: '10px 12px',
                        textAlign: 'right',
                        fontWeight: 700,
                        color: '#16a34a',
                      }}
                    >
                      {glData.entries
                        .reduce((sum, e) => sum + parseFloat(e.credit), 0)
                        .toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </>
          ) : (
            <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#6b7280' }}>
                Posted — no journal entry details available.
              </p>
            </div>
          )}
        </div>

        {/* Notes */}
        {returnData.notes && (
          <div
            style={{
              padding: '24px',
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
            }}
          >
            <h3
              style={{
                margin: '0 0 16px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Clipboard size={20} />
              Notes
            </h3>
            <div
              style={{
                padding: '16px',
                background: '#f9fafb',
                borderRadius: '8px',
                border: '1px solid #e5e7eb',
              }}
            >
              <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                {returnData.notes}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
          >
            <h3
              style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              {approvalAction === 'approve' ? 'Approve Return' : 'Reject Return'}
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '6px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Comments {approvalAction === 'reject' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                value={approvalComments}
                onChange={e => setApprovalComments(e.target.value)}
                placeholder={`Enter ${approvalAction} comments...`}
                rows={4}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '14px',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setShowApprovalModal(false);
                  setApprovalComments('');
                }}
                style={{
                  padding: '12px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleApprovalAction}
                disabled={processing || (approvalAction === 'reject' && !approvalComments.trim())}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background:
                    processing || (approvalAction === 'reject' && !approvalComments.trim())
                      ? '#9ca3af'
                      : approvalAction === 'approve'
                        ? '#10b981'
                        : '#ef4444',
                  color: 'white',
                  cursor:
                    processing || (approvalAction === 'reject' && !approvalComments.trim())
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                {approvalAction === 'approve' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                {processing ? 'Processing...' : approvalAction === 'approve' ? 'Approve' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReturnDetailPage;
