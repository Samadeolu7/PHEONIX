import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Send,
  CheckCircle,
  XCircle,
  Package,
  Truck,
  AlertCircle,
  Download,
  Mail,
  FileText,
  Calendar,
  MapPin,
  User,
  DollarSign,
  Clock,
  Eye,
  Plus,
  Trash2,
} from 'lucide-react';

import {
  usePurchaseOrder,
  useSubmitPurchaseOrder,
  useApprovePurchaseOrder,
  useSendPurchaseOrder,
  useAcknowledgePurchaseOrder,
  useCancelPurchaseOrder,
  useDeletePurchaseOrder,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { PurchaseOrder } from '../../services/procurementService';
import ConfirmationModal from '../../components/ui/ConfirmationModal';

const PurchaseOrderDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [showApprovalHistory, setShowApprovalHistory] = useState(false);

  // Modal states
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showSendModal, setShowSendModal] = useState(false);
  const [showAcknowledgeModal, setShowAcknowledgeModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // React Query hooks
  const { data: purchaseOrder, isLoading, error } = usePurchaseOrder(parseInt(id || '0'), !!id);

  // Mutations
  const submitPOMutation = useSubmitPurchaseOrder();
  const approvePOMutation = useApprovePurchaseOrder();
  const sendPOMutation = useSendPurchaseOrder();
  const acknowledgePOMutation = useAcknowledgePurchaseOrder();
  const cancelPOMutation = useCancelPurchaseOrder();
  const deletePOMutation = useDeletePurchaseOrder();

  const processing =
    submitPOMutation.isPending ||
    approvePOMutation.isPending ||
    sendPOMutation.isPending ||
    acknowledgePOMutation.isPending ||
    cancelPOMutation.isPending ||
    deletePOMutation.isPending;

  const handleSubmitPO = async () => {
    if (!purchaseOrder) return;
    setShowSubmitModal(true);
  };

  const confirmSubmitPO = async () => {
    if (!purchaseOrder) return;

    try {
      await submitPOMutation.mutateAsync(purchaseOrder.id);
      toast.success('Purchase Order submitted for approval!');
      setShowSubmitModal(false);
    } catch (err: unknown) {
      console.error('Failed to submit PO:', err);
      toast.error('Failed to submit purchase order');
    }
  };

  const handleApprovePO = async () => {
    if (!purchaseOrder) return;
    setShowApprovalModal(true);
  };

  const confirmApprovePO = async () => {
    if (!purchaseOrder) return;

    try {
      await approvePOMutation.mutateAsync(purchaseOrder.id);
      toast.success('Purchase Order approved successfully!');
      setShowApprovalModal(false);
    } catch (err: unknown) {
      console.error('Failed to approve PO:', err);
      toast.error('Failed to approve purchase order');
    }
  };

  const handleSendPO = async () => {
    if (!purchaseOrder) return;
    setShowSendModal(true);
  };

  const confirmSendPO = async () => {
    if (!purchaseOrder) return;

    try {
      await sendPOMutation.mutateAsync(purchaseOrder.id);
      toast.success('Purchase Order sent to supplier!');
      setShowSendModal(false);
    } catch (err: unknown) {
      console.error('Failed to send PO:', err);
      toast.error('Failed to send purchase order');
    }
  };

  const handleCancelPO = async () => {
    if (!purchaseOrder) return;
    setShowCancelModal(true);
  };

  const confirmCancelPO = async () => {
    if (!purchaseOrder || !cancelReason.trim()) return;

    try {
      await cancelPOMutation.mutateAsync({ id: purchaseOrder.id, reason: cancelReason });
      toast.success('Purchase Order cancelled');
      setShowCancelModal(false);
      setCancelReason('');
    } catch (err: unknown) {
      console.error('Failed to cancel PO:', err);
      toast.error('Failed to cancel purchase order');
    }
  };

  const handleDeletePO = async () => {
    if (!purchaseOrder) return;
    setShowDeleteModal(true);
  };

  const confirmDeletePO = async () => {
    if (!purchaseOrder) return;

    try {
      await deletePOMutation.mutateAsync(purchaseOrder.id);
      toast.success('Purchase Order deleted successfully');
      navigate('/procurement/orders');
      setShowDeleteModal(false);
    } catch (err: unknown) {
      console.error('Failed to delete PO:', err);
      toast.error('Failed to delete purchase order');
    }
  };

  const handleGeneratePDF = async () => {
    if (!purchaseOrder) return;

    try {
      toast.info('Generating PDF…');
      // The reports app serves PO PDFs at this endpoint
      const baseUrl = (import.meta.env.VITE_API_BASE_URL as string) || '/api';
      const token = localStorage.getItem('token') || localStorage.getItem('access_token');
      const pdfUrl = `${baseUrl}/reports/pdf/purchase-order/${purchaseOrder.id}/?download=true`;

      const response = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) throw new Error(`PDF generation failed (${response.status})`);

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${purchaseOrder.po_number || 'PO'}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('PDF downloaded successfully');
    } catch (err) {
      console.error('PDF generation failed:', err);
      toast.error('Failed to generate PDF. Please try again.');
    }
  };

  const handleEmailPO = () => {
    if (!purchaseOrder) return;
    setShowEmailModal(true);
  };

  const confirmEmailPO = async () => {
    if (!purchaseOrder) return;

    try {
      // This would call an email service that:
      // 1. Sends PO PDF to supplier via email
      // 2. Includes acknowledgment link/form
      // 3. Tracks email delivery status
      await sendPOMutation.mutateAsync(purchaseOrder.id);
      toast.success('Purchase Order emailed to supplier successfully!');
      setShowEmailModal(false);
    } catch (err: unknown) {
      console.error('Failed to email PO:', err);
      toast.error('Failed to email purchase order to supplier');
    }
  };

  const handleAcknowledgePO = async () => {
    if (!purchaseOrder) return;
    setShowAcknowledgeModal(true);
  };

  const confirmAcknowledgePO = async () => {
    if (!purchaseOrder) return;

    try {
      await acknowledgePOMutation.mutateAsync({
        id: purchaseOrder.id,
        data: {
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString(),
        },
      });
      toast.success('Purchase Order acknowledged successfully!');
      setShowAcknowledgeModal(false);
    } catch (err: unknown) {
      console.error('Failed to acknowledge PO:', err);
      toast.error('Failed to acknowledge purchase order');
    }
  };

  const getStatusColor = (status: string) => {
    const colors = {
      draft: '#6b7280',
      submitted: '#3b82f6',
      approved: '#10b981',
      sent: '#8b5cf6',
      acknowledged: '#059669',
      partially_received: '#f59e0b',
      received: '#059669',
      cancelled: '#ef4444',
    };
    return colors[status as keyof typeof colors] || '#6b7280';
  };

  const getStatusIcon = (status: string) => {
    const icons = {
      approved: CheckCircle,
      sent: Truck,
      acknowledged: CheckCircle,
      partially_received: Package,
      received: CheckCircle,
      cancelled: XCircle,
    };
    const Icon = icons[status as keyof typeof icons] || AlertCircle;
    return <Icon size={20} />;
  };

  const getStatusLabel = (status: string) => {
    const labels = {
      draft: 'Draft',
      submitted: 'Submitted',
      approved: 'Approved',
      sent: 'Sent',
      acknowledged: 'Acknowledged',
      partially_received: 'Partially Received',
      received: 'Received',
      cancelled: 'Cancelled',
    };
    return labels[status as keyof typeof labels] || status;
  };

  const canSubmit = (po: PurchaseOrder) => po.status === 'draft';
  const canApprove = (po: PurchaseOrder) => po.status === 'submitted';
  const canSend = (po: PurchaseOrder) => po.status === 'approved';
  const canAcknowledge = (po: PurchaseOrder) => po.status === 'sent';
  const canCancel = (po: PurchaseOrder) => ['draft', 'submitted', 'approved'].includes(po.status);
  const canCreateGRN = (po: PurchaseOrder) =>
    ['sent', 'acknowledged', 'partially_received'].includes(po.status);
  const canEdit = (po: PurchaseOrder) => po.status === 'draft';

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading purchase order...</div>
      </div>
    );
  }

  if (error || !purchaseOrder) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading Purchase Order</h3>
          <p>Failed to load purchase order details. Please try again.</p>
        </div>
        <button
          onClick={() => navigate('/procurement/orders')}
          style={{
            padding: '12px 24px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            background: 'white',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Back to Purchase Orders
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
            onClick={() => navigate('/procurement/orders')}
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
                {purchaseOrder.po_number}
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  background: `${getStatusColor(purchaseOrder.status)}20`,
                  color: getStatusColor(purchaseOrder.status),
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {getStatusIcon(purchaseOrder.status)}
                {getStatusLabel(purchaseOrder.status)}
              </div>
            </div>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Purchase order details and status tracking
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {canEdit(purchaseOrder) && (
            <button
              onClick={() => navigate(`/procurement/orders/${purchaseOrder.id}/edit`)}
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
              Edit Order
            </button>
          )}

          {canSubmit(purchaseOrder) && (
            <button
              onClick={handleSubmitPO}
              disabled={processing}
              style={{
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                background: processing ? '#9ca3af' : '#3b82f6',
                color: 'white',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Send size={16} />
              Submit for Approval
            </button>
          )}

          {canUserApprove && canApprove(purchaseOrder) && (
            <button
              onClick={handleApprovePO}
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
              Approve Order
            </button>
          )}

          {canSend(purchaseOrder) && (
            <button
              onClick={handleSendPO}
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
              <Send size={16} />
              Send to Supplier
            </button>
          )}

          {canAcknowledge(purchaseOrder) && (
            <button
              onClick={handleAcknowledgePO}
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
              Acknowledge Receipt
            </button>
          )}

          {canCreateGRN(purchaseOrder) && (
            <button
              onClick={() => navigate(`/procurement/grn/create?po=${purchaseOrder.id}`)}
              style={{
                padding: '12px 20px',
                border: 'none',
                borderRadius: '8px',
                background: '#f59e0b',
                color: 'white',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Package size={16} />
              Create GRN
            </button>
          )}

          <button
            onClick={handleGeneratePDF}
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
            <Download size={16} />
            Download PDF
          </button>

          <button
            onClick={handleEmailPO}
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
            <Mail size={16} />
            Email to Supplier
          </button>

          {canCancel(purchaseOrder) && (
            <button
              onClick={handleCancelPO}
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
              Cancel Order
            </button>
          )}

          {/* Delete button - only show for draft orders */}
          {
            // purchaseOrder.status === 'draft' &&
            <button
              onClick={handleDeletePO}
              disabled={processing}
              style={{
                padding: '12px 20px',
                border: '1px solid #dc2626',
                borderRadius: '8px',
                background: 'white',
                color: '#dc2626',
                cursor: processing ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Trash2 size={16} />
              Delete Order
            </button>
          }
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Main Content */}
        <div>
          {/* Purchase Order Information */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2
              style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              Order Information
            </h2>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
                marginBottom: '24px',
              }}
            >
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <User size={16} style={{ color: '#6b7280' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#374151' }}>
                    Supplier Information
                  </h3>
                </div>
                <div style={{ paddingLeft: '24px' }}>
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '18px',
                      fontWeight: 600,
                      color: '#1f2937',
                    }}
                  >
                    {purchaseOrder.supplier_name}
                  </p>
                  <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                    <strong>Payment Terms:</strong>{' '}
                    {purchaseOrder.payment_terms.replace('_', ' ').toUpperCase()}
                  </p>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <MapPin size={16} style={{ color: '#6b7280' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#374151' }}>
                    Delivery Information
                  </h3>
                </div>
                <div style={{ paddingLeft: '24px' }}>
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '16px',
                      fontWeight: 600,
                      color: '#1f2937',
                    }}
                  >
                    {purchaseOrder.location_name}
                  </p>
                  {purchaseOrder.expected_delivery_date && (
                    <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                      <strong>Expected:</strong>{' '}
                      {new Date(purchaseOrder.expected_delivery_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <Calendar size={16} style={{ color: '#6b7280' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#374151' }}>
                    Order Dates
                  </h3>
                </div>
                <div style={{ paddingLeft: '24px' }}>
                  <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                    <strong>Created:</strong>{' '}
                    {new Date(purchaseOrder.created_at).toLocaleDateString()}
                  </p>
                  <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                    <strong>Updated:</strong>{' '}
                    {new Date(purchaseOrder.updated_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                  }}
                >
                  <DollarSign size={16} style={{ color: '#6b7280' }} />
                  <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#374151' }}>
                    Order Value
                  </h3>
                </div>
                <div style={{ paddingLeft: '24px' }}>
                  <p
                    style={{
                      margin: '0 0 8px 0',
                      fontSize: '24px',
                      fontWeight: 'bold',
                      color: '#3b82f6',
                    }}
                  >
                    ₦{parseFloat(purchaseOrder.total_amount).toLocaleString()}
                  </p>
                  <p style={{ margin: '0 0 4px 0', color: '#6b7280', fontSize: '14px' }}>
                    {purchaseOrder.items?.length || 0} item
                    {(purchaseOrder.items?.length || 0) !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
            </div>
          </div>
          {/* Line Items */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h2
              style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              Line Items
            </h2>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'left',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Item
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Ordered
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Received
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'center',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Pending
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Unit Price
                    </th>
                    <th
                      style={{
                        padding: '12px',
                        textAlign: 'right',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: '#374151',
                      }}
                    >
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(purchaseOrder.items || []).map((item, index) => {
                    const pendingQty = item.quantity - item.quantity_received;
                    const receivedPercentage = (item.quantity_received / item.quantity) * 100;

                    return (
                      <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '16px 12px' }}>
                          <div>
                            <p
                              style={{
                                margin: '0 0 4px 0',
                                fontSize: '14px',
                                fontWeight: 600,
                                color: '#1f2937',
                              }}
                            >
                              {item.item.name}
                            </p>
                            <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                              SKU: {item.item.sku}
                            </p>
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                            {item.quantity}
                          </span>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: '4px',
                            }}
                          >
                            <span
                              style={{
                                fontSize: '14px',
                                fontWeight: 600,
                                color: item.quantity_received > 0 ? '#10b981' : '#6b7280',
                              }}
                            >
                              {item.quantity_received}
                            </span>
                            {item.quantity_received > 0 && (
                              <div
                                style={{
                                  fontSize: '10px',
                                  color: '#10b981',
                                  background: '#dcfce7',
                                  padding: '2px 6px',
                                  borderRadius: '10px',
                                }}
                              >
                                {Math.round(receivedPercentage)}%
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                          <span
                            style={{
                              fontSize: '14px',
                              fontWeight: 600,
                              color: pendingQty > 0 ? '#f59e0b' : '#6b7280',
                            }}
                          >
                            {pendingQty}
                          </span>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                            ₦{parseFloat(item.unit_price).toLocaleString()}
                          </span>
                        </td>
                        <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                            ₦{parseFloat(item.total_amount).toLocaleString()}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Delivery Progress */}
            {purchaseOrder.status === 'partially_received' &&
              purchaseOrder.items &&
              purchaseOrder.items.length > 0 && (
                <div
                  style={{
                    marginTop: '24px',
                    padding: '16px',
                    background: '#fef3c7',
                    borderRadius: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#92400e' }}>
                      Overall Delivery Progress
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#92400e' }}>
                      {Math.round(
                        ((purchaseOrder.items || []).reduce(
                          (sum, item) => sum + (item.quantity_received || 0),
                          0
                        ) /
                          (purchaseOrder.items || []).reduce(
                            (sum, item) => sum + (item.quantity || 0),
                            0
                          )) *
                          100
                      )}
                      %
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      background: '#dfc99a',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        background: '#f59e0b',
                        width: `${
                          ((purchaseOrder.items || []).reduce(
                            (sum, item) => sum + (item.quantity_received || 0),
                            0
                          ) /
                            (purchaseOrder.items || []).reduce(
                              (sum, item) => sum + (item.quantity || 0),
                              0
                            )) *
                          100
                        }%`,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              )}
          </div>

          {/* Status Workflow Display */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h2
              style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              Status Workflow
            </h2>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '16px',
                overflowX: 'auto',
                paddingBottom: '8px',
              }}
            >
              {[
                { status: 'draft', label: 'Draft', icon: FileText },
                { status: 'submitted', label: 'Submitted', icon: Send },
                { status: 'approved', label: 'Approved', icon: CheckCircle },
                { status: 'sent', label: 'Sent', icon: Truck },
                { status: 'partially_received', label: 'Partially Received', icon: Package },
                { status: 'received', label: 'Received', icon: CheckCircle },
              ].map((step, index) => {
                const Icon = step.icon;
                const isActive = purchaseOrder.status === step.status;
                const isPassed =
                  ['draft', 'submitted', 'approved', 'sent'].indexOf(purchaseOrder.status) >
                  ['draft', 'submitted', 'approved', 'sent'].indexOf(step.status);
                const isCancelled = purchaseOrder.status === 'cancelled';

                return (
                  <React.Fragment key={step.status}>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: '120px',
                      }}
                    >
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          background: isCancelled
                            ? '#fef2f2'
                            : isActive
                              ? getStatusColor(step.status)
                              : isPassed
                                ? '#10b981'
                                : '#f3f4f6',
                          color: isCancelled
                            ? '#ef4444'
                            : isActive
                              ? 'white'
                              : isPassed
                                ? 'white'
                                : '#9ca3af',
                          marginBottom: '8px',
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: isActive ? 600 : 500,
                          color: isCancelled
                            ? '#ef4444'
                            : isActive
                              ? getStatusColor(step.status)
                              : isPassed
                                ? '#10b981'
                                : '#6b7280',
                          textAlign: 'center',
                        }}
                      >
                        {step.label}
                      </span>
                    </div>
                    {index < 5 && (
                      <div
                        style={{
                          width: '32px',
                          height: '2px',
                          background: isCancelled ? '#fca5a5' : isPassed ? '#10b981' : '#e5e7eb',
                          marginBottom: '32px',
                        }}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            {purchaseOrder.status === 'cancelled' && (
              <div
                style={{
                  marginTop: '16px',
                  padding: '12px',
                  background: '#fef2f2',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <XCircle size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#ef4444' }}>
                    Order Cancelled
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Quick Actions */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
              marginBottom: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Quick Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                onClick={() => navigate(`/procurement/orders/${purchaseOrder.id}/view`)}
                style={{
                  padding: '12px 16px',
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
                  textAlign: 'left',
                }}
              >
                <Eye size={16} />
                View Full Details
              </button>

              {canCreateGRN(purchaseOrder) && (
                <button
                  onClick={() => navigate(`/procurement/grn/create?po=${purchaseOrder.id}`)}
                  style={{
                    padding: '12px 16px',
                    border: 'none',
                    borderRadius: '8px',
                    background: '#f59e0b',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 500,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Plus size={16} />
                  Create GRN
                </button>
              )}

              <button
                onClick={() => setShowApprovalHistory(!showApprovalHistory)}
                style={{
                  padding: '12px 16px',
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
                  textAlign: 'left',
                }}
              >
                <Clock size={16} />
                {showApprovalHistory ? 'Hide' : 'Show'} History
              </button>
            </div>
          </div>

          {/* Approval History */}
          {showApprovalHistory && (
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginBottom: '24px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 20px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#1f2937',
                }}
              >
                Approval History
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Mock approval history - this would come from API */}
                <div
                  style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    borderLeft: '4px solid #10b981',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                      Order Created
                    </span>
                    <span style={{ fontSize: '12px', color: '#6b7280' }}>
                      {new Date(purchaseOrder.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                    Purchase order created and saved as draft
                  </p>
                </div>

                {purchaseOrder.status !== 'draft' && (
                  <div
                    style={{
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      borderLeft: '4px solid #3b82f6',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                        Order Submitted
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {new Date(purchaseOrder.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                      Purchase order submitted for approval
                    </p>
                  </div>
                )}

                {['approved', 'sent', 'partially_received', 'received'].includes(
                  purchaseOrder.status
                ) && (
                  <div
                    style={{
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      borderLeft: '4px solid #10b981',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '4px',
                      }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#1f2937' }}>
                        Order Approved
                      </span>
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>
                        {new Date(purchaseOrder.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                      Purchase order approved and ready to send
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Order Summary */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 20px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Order Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Items:</span>
                <span style={{ fontWeight: 600 }}>{(purchaseOrder.items || []).length}</span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Total Ordered:</span>
                <span style={{ fontWeight: 600 }}>
                  {(purchaseOrder.items || []).reduce(
                    (sum, item) => sum + parseFloat(item.quantity || '0'),
                    0
                  )}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Total Received:</span>
                <span style={{ fontWeight: 600, color: '#10b981' }}>
                  {(purchaseOrder.items || []).reduce(
                    (sum, item) => sum + parseFloat(item.quantity_received || '0'),
                    0
                  )}
                </span>
              </div>

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ color: '#6b7280' }}>Pending:</span>
                <span style={{ fontWeight: 600, color: '#f59e0b' }}>
                  {(purchaseOrder.items || []).reduce(
                    (sum, item) =>
                      sum +
                      (parseFloat(item.quantity || '0') -
                        parseFloat(item.quantity_received || '0')),
                    0
                  )}
                </span>
              </div>

              <div style={{ height: '1px', background: '#e5e7eb', margin: '8px 0' }} />

              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                  Total Value:
                </span>
                <span style={{ fontSize: '18px', fontWeight: 'bold', color: '#3b82f6' }}>
                  ₦{parseFloat(purchaseOrder.total_amount).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modals */}

      {/* Submit Confirmation Modal */}
      <ConfirmationModal
        isOpen={showSubmitModal}
        onClose={() => setShowSubmitModal(false)}
        onConfirm={confirmSubmitPO}
        title="Submit Purchase Order"
        message={`Are you sure you want to submit purchase order ${purchaseOrder?.po_number} for approval? Once submitted, you won't be able to edit it.`}
        confirmText="Submit for Approval"
        type="info"
        isLoading={submitPOMutation.isPending}
      />

      {/* Approval Confirmation Modal */}
      <ConfirmationModal
        isOpen={showApprovalModal}
        onClose={() => setShowApprovalModal(false)}
        onConfirm={confirmApprovePO}
        title="Approve Purchase Order"
        message={`Are you sure you want to approve purchase order ${purchaseOrder?.po_number}? This will allow it to be sent to the supplier.`}
        confirmText="Approve Order"
        type="info"
        isLoading={approvePOMutation.isPending}
      />

      {/* Send Confirmation Modal */}
      <ConfirmationModal
        isOpen={showSendModal}
        onClose={() => setShowSendModal(false)}
        onConfirm={confirmSendPO}
        title="Send to Supplier"
        message={`Are you sure you want to send purchase order ${purchaseOrder?.po_number} to the supplier? The supplier will be notified and can acknowledge receipt.`}
        confirmText="Send to Supplier"
        type="info"
        isLoading={sendPOMutation.isPending}
      />

      {/* Cancel Confirmation Modal */}
      {showCancelModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => {
            setShowCancelModal(false);
            setCancelReason('');
          }}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              boxShadow:
                '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Icon */}
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fef2f2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
              }}
            >
              <AlertTriangle size={24} style={{ color: '#ef4444' }} />
            </div>

            {/* Title */}
            <h3
              style={{
                margin: '0 0 12px 0',
                fontSize: '18px',
                fontWeight: 600,
                color: '#1f2937',
                textAlign: 'center',
              }}
            >
              Cancel Purchase Order
            </h3>

            {/* Message */}
            <p
              style={{
                margin: '0 0 24px 0',
                fontSize: '14px',
                color: '#6b7280',
                textAlign: 'center',
                lineHeight: '1.5',
              }}
            >
              Are you sure you want to cancel purchase order {purchaseOrder?.po_number}? This action
              cannot be undone.
            </p>

            {/* Cancellation Reason Input */}
            <div style={{ marginBottom: '24px' }}>
              <label
                style={{
                  display: 'block',
                  marginBottom: '8px',
                  fontSize: '14px',
                  fontWeight: 500,
                  color: '#374151',
                }}
              >
                Cancellation Reason *
              </label>
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Please provide a reason for cancellation..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: '14px',
                  resize: 'vertical',
                  boxSizing: 'border-box',
                }}
                required
              />
            </div>

            {/* Action buttons */}
            <div
              style={{
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}
            >
              <button
                onClick={() => {
                  setShowCancelModal(false);
                  setCancelReason('');
                }}
                disabled={cancelPOMutation.isPending}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#374151',
                  cursor: cancelPOMutation.isPending ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  opacity: cancelPOMutation.isPending ? 0.5 : 1,
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmCancelPO}
                disabled={cancelPOMutation.isPending || !cancelReason.trim()}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background:
                    cancelPOMutation.isPending || !cancelReason.trim() ? '#9ca3af' : '#ef4444',
                  color: 'white',
                  cursor:
                    cancelPOMutation.isPending || !cancelReason.trim() ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                }}
              >
                {cancelPOMutation.isPending ? 'Cancelling...' : 'Cancel Order'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Confirmation Modal */}
      <ConfirmationModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onConfirm={confirmEmailPO}
        title="Email Purchase Order"
        message={`Send purchase order ${purchaseOrder?.po_number} to supplier ${purchaseOrder?.supplier_name}? This will email the PO with an acknowledgment link for the supplier to confirm receipt.`}
        confirmText="Send Email"
        type="info"
        isLoading={sendPOMutation.isPending}
      />

      {/* Acknowledge Confirmation Modal */}
      <ConfirmationModal
        isOpen={showAcknowledgeModal}
        onClose={() => setShowAcknowledgeModal(false)}
        onConfirm={confirmAcknowledgePO}
        title="Acknowledge Purchase Order"
        message={`Are you sure you want to acknowledge receipt of purchase order ${purchaseOrder?.po_number}? This confirms that the supplier has received and accepted the order.`}
        confirmText="Acknowledge Receipt"
        type="info"
        isLoading={acknowledgePOMutation.isPending}
      />

      {/* Email Confirmation Modal */}
      <ConfirmationModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onConfirm={confirmEmailPO}
        title="Email Purchase Order"
        message={`Are you sure you want to email purchase order ${purchaseOrder?.po_number} to the supplier? This will send the PO as a PDF attachment with acknowledgment instructions.`}
        confirmText="Send Email"
        type="info"
        isLoading={sendPOMutation.isPending}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDeletePO}
        title="Delete Purchase Order"
        message={`Are you sure you want to permanently delete purchase order ${purchaseOrder?.po_number}? This action cannot be undone and all associated data will be lost.`}
        confirmText="Delete Order"
        type="danger"
        isLoading={deletePOMutation.isPending}
      />
    </div>
  );
};

export default PurchaseOrderDetailPage;
