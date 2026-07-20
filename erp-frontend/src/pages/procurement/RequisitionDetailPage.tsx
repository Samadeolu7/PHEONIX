import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ShoppingCart,
  User,
  Building,
  Calendar,
  Package,
  DollarSign,
  MessageSquare,
  Paperclip,
  Download,
  Send,
  Eye,
  Plus,
  Workflow,
  Bell,
  Quote,
  Trash2,
} from 'lucide-react';

import { useQueryClient } from '@tanstack/react-query';
import {
  usePurchaseRequisition,
  useSubmitRequisition,
  useApproveRequisition,
  useRejectRequisition,
  useConvertRequisitionToPOWithDetails,
  useDeletePurchaseRequisition,
  useCompareQuotes,
  useConvertQuoteToPO,
  useVerifyRequisitionInvoice,
  procurementKeys,
  quotesKeys,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { useAuth } from '../../contexts/AuthContext';
import {
  PurchaseRequisition,
  RequisitionStatus,
  UrgencyLevel,
  ApprovalStatus,
  getProcurementStatusColor,
  getProcurementStatusLabel,
  getUrgencyColor,
  getUrgencyLabel,
} from '../../types/procurement';
import WorkflowStatusTracker from '../../components/procurement/WorkflowStatusTracker';
import NotificationManager from '../../components/procurement/NotificationManager';
import WorkflowStatusDisplay from '../../components/procurement/WorkflowStatusDisplay';
import ConvertToPOModal from '../../components/procurement/ConvertToPOModal';
import QuoteRequestForm from '../../components/procurement/QuoteRequestForm';
import QuoteComparison from '../../components/procurement/QuoteComparison';
import ConvertQuoteToPOModal from '../../components/procurement/ConvertQuoteToPOModal';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;
const isValidDecimalInput = (value: string) => value === '' || DECIMAL_INPUT_REGEX.test(value);

const RequisitionDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { userWithRole, isAdmin } = useAuth();

  // User is an approver if they are staff, admin, or have the approve permission
  const isApprover =
    isAdmin ||
    !!userWithRole?.is_staff ||
    (userWithRole?.permissions ?? []).some(p => p.includes('approve'));

  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject'>('approve');
  const [approvalComments, setApprovalComments] = useState('');
  const [showInvoiceVerificationModal, setShowInvoiceVerificationModal] = useState(false);
  const [invoiceData, setInvoiceData] = useState({
    vendor_invoice_number: '',
    vendor_invoice_date: '',
    vendor_invoice_amount: '',
  });
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  // const [showWorkflowPanel, setShowWorkflowPanel] = useState(false);
  // const [showNotificationPanel, setShowNotificationPanel] = useState(false);
  // const [showCommentsSection, setShowCommentsSection] = useState(false);
  // const [newComment, setNewComment] = useState('');
  const [showConvertToPOModal, setShowConvertToPOModal] = useState(false);
  const [showQuoteRequestForm, setShowQuoteRequestForm] = useState(false);
  const [showConvertQuoteToPOModal, setShowConvertQuoteToPOModal] = useState(false);
  const [selectedQuoteForConversion, setSelectedQuoteForConversion] = useState<any>(null);

  // React Query hooks
  const queryClient = useQueryClient();
  const { data: requisition, isLoading, error } = usePurchaseRequisition(parseInt(id || '0'), !!id);

  // Quote comparison hook - only fetch if requisition is approved
  const { data: quotes, isLoading: quotesLoading } = useCompareQuotes(
    parseInt(id || '0'),
    !!requisition && requisition.status === 'approved'
  );

  // Mutations
  const submitRequisitionMutation = useSubmitRequisition();
  const approveRequisitionMutation = useApproveRequisition();
  const rejectRequisitionMutation = useRejectRequisition();
  const convertToPOMutation = useConvertRequisitionToPOWithDetails();
  const deleteRequisitionMutation = useDeletePurchaseRequisition();
  const convertQuoteToPOMutation = useConvertQuoteToPO();
  const verifyInvoiceMutation = useVerifyRequisitionInvoice();

  const processing =
    submitRequisitionMutation.isPending ||
    approveRequisitionMutation.isPending ||
    rejectRequisitionMutation.isPending ||
    convertToPOMutation.isPending ||
    deleteRequisitionMutation.isPending ||
    convertQuoteToPOMutation.isPending ||
    verifyInvoiceMutation.isPending;

  // Quote handlers
  const handleQuoteSelected = (_quote: any) => {
    queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
    if (requisition?.id) {
      queryClient.invalidateQueries({ queryKey: quotesKeys.quotesComparison(requisition.id) });
    }
  };

  const handleConvertQuoteToPO = (quote: any) => {
    setSelectedQuoteForConversion(quote);
    setShowConvertQuoteToPOModal(true);
  };

  const handleQuoteToPOConversion = async (conversionData: {
    supplier: number;
    delivery_location: number;
    expected_delivery_date: string;
    contact_person?: string;
    contact_phone?: string;
    contact_email?: string;
    notes?: string;
  }) => {
    if (!selectedQuoteForConversion?.id) return;

    try {
      const response = await convertQuoteToPOMutation.mutateAsync({
        quoteId: selectedQuoteForConversion.id,
        data: conversionData,
      });

      toast.success('Quote converted to Purchase Order successfully!');
      setShowConvertQuoteToPOModal(false);
      setSelectedQuoteForConversion(null);

      // Navigate to the new PO
      if (response.id) {
        navigate(`/procurement/orders/${response.id}/view`);
      } else {
        queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
        queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      }
    } catch (err: unknown) {
      console.error('Failed to convert quote to PO:', err);
      toast.error(
        `Failed to convert quote to PO: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  // Enhanced quote request functionality
  const canRequestQuotesEnhanced = (req: PurchaseRequisition) => {
    if (req.status !== 'approved' || !req.items || req.items.length === 0) {
      return false;
    }

    // Check if quotes exist and filter suppliers who already have quotes
    if (quotes && quotes.quotes && quotes.quotes.length > 0) {
      // Allow requesting quotes from suppliers who haven't submitted yet
      return true;
    }

    return true;
  };

  // Get suppliers who already have quotes to disable them in the quote request form
  const getSuppliersWithQuotes = () => {
    if (!quotes || !quotes.quotes || quotes.quotes.length === 0) return [];
    return quotes.quotes.map(q => q.supplier);
  };

  const handleSubmitRequisition = async () => {
    if (!requisition?.id) return;

    try {
      await submitRequisitionMutation.mutateAsync(requisition.id);
      toast.success('Requisition submitted successfully!');
    } catch (err: unknown) {
      console.error('Failed to submit requisition:', err);
      toast.error(
        `Failed to submit requisition: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const handleVerifyInvoice = async () => {
    if (!requisition?.id) return;

    if (!invoiceData.vendor_invoice_number || !invoiceData.vendor_invoice_date) {
      toast.error('Invoice number and date are required');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('vendor_invoice_number', invoiceData.vendor_invoice_number);
      formData.append('vendor_invoice_date', invoiceData.vendor_invoice_date);
      if (invoiceData.vendor_invoice_amount) {
        formData.append('vendor_invoice_amount', invoiceData.vendor_invoice_amount);
      }
      if (invoiceFile) {
        formData.append('vendor_invoice_file', invoiceFile);
      }

      await verifyInvoiceMutation.mutateAsync({ id: requisition.id, data: formData });
      toast.success('Vendor invoice verified successfully!');
      setShowInvoiceVerificationModal(false);
      setInvoiceData({
        vendor_invoice_number: '',
        vendor_invoice_date: '',
        vendor_invoice_amount: '',
      });
      setInvoiceFile(null);
    } catch (err: unknown) {
      console.error('Failed to verify invoice:', err);
      // Prefer server-provided validation message when available
      const serverMsg =
        (err as any)?.response?.data?.detail ||
        (err as any)?.response?.data?.error ||
        (err as any)?.message ||
        'Failed to verify invoice';
      // Keep the modal open so user can correct inputs when verification is required
      toast.error(serverMsg);
    }
  };

  const handleApprovalAction = async () => {
    if (!requisition?.id) return;

    try {
      if (approvalAction === 'approve') {
        await approveRequisitionMutation.mutateAsync({ id: requisition.id, data: {} });
        toast.success('Requisition approved successfully!');
      } else {
        if (!approvalComments.trim()) {
          toast.error('Rejection reason is required');
          return;
        }
        await rejectRequisitionMutation.mutateAsync({
          id: requisition.id,
          data: { reason: approvalComments },
        });
        toast.success('Requisition rejected successfully');
      }

      setShowApprovalModal(false);
      setApprovalComments('');
    } catch (err: unknown) {
      console.error('Failed to process approval:', err);
      toast.error(
        `Failed to ${approvalAction} requisition: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const handleConvertToPO = async (conversionData: {
    supplier: number;
    delivery_location: number;
    expected_delivery_date: string;
  }) => {
    if (!requisition?.id) return;

    try {
      const response = await convertToPOMutation.mutateAsync({
        id: requisition.id,
        conversionData,
      });

      toast.success('Requisition converted to Purchase Order successfully!');
      setShowConvertToPOModal(false);

      // Navigate to the new PO
      if (response.id) {
        navigate(`/procurement/orders/${response.id}/view`);
      } else {
        queryClient.invalidateQueries({ queryKey: procurementKeys.requisitions() });
        queryClient.invalidateQueries({ queryKey: procurementKeys.purchaseOrders() });
      }
    } catch (err: unknown) {
      console.error('Failed to convert requisition:', err);
      toast.error(
        `Failed to convert requisition to PO: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const handleDeleteRequisition = async () => {
    if (!requisition?.id) return;

    if (
      !confirm('Are you sure you want to delete this requisition? This action cannot be undone.')
    ) {
      return;
    }

    try {
      await deleteRequisitionMutation.mutateAsync(requisition.id);
      toast.success('Requisition deleted successfully!');
      navigate('/procurement/requisitions');
    } catch (err: unknown) {
      console.error('Failed to delete requisition:', err);
      toast.error(
        `Failed to delete requisition: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  };

  const canApprove = (req: PurchaseRequisition) =>
    req.status === 'submitted' && req.items && req.items.length > 0 && isApprover;

  const canReject = (req: PurchaseRequisition) =>
    req.status === 'submitted' && req.items && req.items.length > 0 && isApprover;

  const canSubmit = (req: PurchaseRequisition) => req.status === 'draft';

  const canEdit = (req: PurchaseRequisition) =>
    [RequisitionStatus.DRAFT, RequisitionStatus.REJECTED].includes(req.status);

  const canConvertToPO = (req: PurchaseRequisition) => req.status === RequisitionStatus.APPROVED;

  const canRequestQuotes = (req: PurchaseRequisition) =>
    req.status === 'approved' && req.items && req.items.length > 0;

  const canDelete = (req: PurchaseRequisition) =>
    [RequisitionStatus.DRAFT, RequisitionStatus.REJECTED, RequisitionStatus.CANCELLED].includes(
      req.status
    );

  // Compatibility aliases: some components use `getStatusColor`/`getStatusLabel`
  // while shared utils export `getProcurementStatusColor`/`getProcurementStatusLabel`.
  const getStatusColor = getProcurementStatusColor;
  const getStatusLabel = getProcurementStatusLabel;
  const getStatusIcon = (status: RequisitionStatus) => {
    const icons = {
      [RequisitionStatus.DRAFT]: FileText,
      [RequisitionStatus.SUBMITTED]: Clock,
      [RequisitionStatus.UNDER_REVIEW]: AlertCircle,
      [RequisitionStatus.APPROVED]: CheckCircle,
      [RequisitionStatus.REJECTED]: XCircle,
      [RequisitionStatus.CONVERTED]: ShoppingCart,
      [RequisitionStatus.CANCELLED]: XCircle,
    };
    const Icon = icons[status] || AlertCircle;
    return <Icon size={20} />;
  };

  const getApprovalStatusIcon = (status: ApprovalStatus) => {
    const icons = {
      [ApprovalStatus.PENDING]: Clock,
      [ApprovalStatus.APPROVED]: CheckCircle,
      [ApprovalStatus.REJECTED]: XCircle,
      [ApprovalStatus.DELEGATED]: User,
    };
    const Icon = icons[status] || Clock;
    return <Icon size={16} />;
  };

  const getApprovalStatusColor = (status: ApprovalStatus) => {
    const colors = {
      [ApprovalStatus.PENDING]: '#f59e0b',
      [ApprovalStatus.APPROVED]: '#10b981',
      [ApprovalStatus.REJECTED]: '#ef4444',
      [ApprovalStatus.DELEGATED]: '#6366f1',
    };
    return colors[status] || '#6b7280';
  };

  if (isLoading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#6b7280' }}>Loading requisition details...</div>
      </div>
    );
  }

  if (error || !requisition) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <div style={{ color: '#ef4444', marginBottom: '16px' }}>
          <AlertCircle size={48} style={{ margin: '0 auto 16px' }} />
          <h3>Error Loading Requisition</h3>
          <p>Failed to load requisition details. Please try again.</p>
        </div>
        <button
          onClick={() => navigate('/procurement/requisitions')}
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
          Back to Requisitions
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
            onClick={() => navigate('/procurement/requisitions')}
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
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}
            >
              <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#1f2937' }}>
                {requisition.pr_number || `Requisition #${requisition.id}`}
              </h1>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '6px 16px',
                  borderRadius: '20px',
                  background: `${getProcurementStatusColor(requisition.status)}20`,
                  color: getProcurementStatusColor(requisition.status),
                  fontSize: '14px',
                  fontWeight: 600,
                }}
              >
                {getStatusIcon(requisition.status)}
                {getProcurementStatusLabel(requisition.status)}
              </div>
            </div>
            <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
              Purchase Requisition Details
            </p>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {canEdit(requisition) && (
              <button
                onClick={() => navigate(`/procurement/requisitions/${requisition.id}/edit`)}
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

            {canSubmit(requisition) && (
              <button
                onClick={handleSubmitRequisition}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#3b82f6',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Send size={16} />
                Submit
              </button>
            )}

            {canApprove(requisition) && (
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
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={16} />
                Approve
              </button>
            )}

            {canReject(requisition) && (
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

            {canRequestQuotesEnhanced(requisition) && (
              <button
                onClick={() => setShowQuoteRequestForm(true)}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#f59e0b',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Quote size={16} />
                Request Quotes
              </button>
            )}

            {canConvertToPO(requisition) && (
              <button
                onClick={() => setShowConvertToPOModal(true)}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#8b5cf6',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <ShoppingCart size={16} />
                Convert to PO
              </button>
            )}

            {canDelete(requisition) && (
              <button
                onClick={handleDeleteRequisition}
                disabled={processing}
                style={{
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background: processing ? '#9ca3af' : '#ef4444',
                  color: 'white',
                  cursor: processing ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <Trash2 size={16} />
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Requisition Header Information */}
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
              Requisition Information
            </h3>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <User size={16} style={{ color: '#6b7280' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '12px',
                      color: '#6b7280',
                      fontWeight: 500,
                    }}
                  >
                    REQUESTER
                  </p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                    {requisition.requested_by_name || 'Unknown'}
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                    ID: {requisition.requested_by}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Building size={16} style={{ color: '#6b7280' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '12px',
                      color: '#6b7280',
                      fontWeight: 500,
                    }}
                  >
                    DEPARTMENT
                  </p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                    {requisition.department || 'Unknown'}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Calendar size={16} style={{ color: '#6b7280' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '12px',
                      color: '#6b7280',
                      fontWeight: 500,
                    }}
                  >
                    REQUEST DATE
                  </p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                    {new Date(requisition.request_date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Calendar size={16} style={{ color: '#6b7280' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '12px',
                      color: '#6b7280',
                      fontWeight: 500,
                    }}
                  >
                    REQUIRED BY DATE
                  </p>
                  <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                    {new Date(requisition.required_by_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {requisition.budget_code && (
              <div style={{ marginBottom: '20px' }}>
                <p
                  style={{
                    margin: '0 0 4px 0',
                    fontSize: '12px',
                    color: '#6b7280',
                    fontWeight: 500,
                  }}
                >
                  BUDGET CODE
                </p>
                <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 500 }}>
                  {requisition.budget_code}
                </p>
              </div>
            )}

            <div>
              <p
                style={{ margin: '0 0 8px 0', fontSize: '12px', color: '#6b7280', fontWeight: 500 }}
              >
                PURPOSE
              </p>
              <div
                style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                }}
              >
                <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                  {requisition.purpose || 'No purpose specified'}
                </p>
              </div>
            </div>

            {requisition.notes && (
              <div style={{ marginTop: '20px' }}>
                <p
                  style={{
                    margin: '0 0 8px 0',
                    fontSize: '12px',
                    color: '#6b7280',
                    fontWeight: 500,
                  }}
                >
                  ADDITIONAL NOTES
                </p>
                <div
                  style={{
                    padding: '16px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                  }}
                >
                  <p style={{ margin: 0, fontSize: '14px', color: '#374151', lineHeight: '1.5' }}>
                    {requisition.notes}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Workflow Status Display */}
          <WorkflowStatusDisplay requisition={requisition} />

          {/* Vendor Invoice Verification Section */}
          {/* {(requisition.status === 'submitted' || requisition.vendor_invoice_number) && (
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
                marginTop: '20px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <FileText size={20} style={{ color: '#3b82f6' }} />
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                    Vendor Invoice Verification
                  </h3>
                </div>
                {requisition.status === 'submitted' && !requisition.invoice_verified_at && (
                  <button
                    onClick={() => setShowInvoiceVerificationModal(true)}
                    disabled={processing}
                    style={{
                      padding: '10px 16px',
                      border: 'none',
                      borderRadius: '8px',
                      background: processing ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      cursor: processing ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <CheckCircle size={16} />
                    Verify Invoice
                  </button>
                )}
              </div>

              {requisition.vendor_invoice_number ? (
                <>
                  <div
                    style={{
                      padding: '16px',
                      background: requisition.invoice_verified_at ? '#ecfdf5' : '#fef3c7',
                      borderRadius: '8px',
                      border: `1px solid ${requisition.invoice_verified_at ? '#10b981' : '#f59e0b'}`,
                      marginBottom: '16px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px',
                      }}
                    >
                      {requisition.invoice_verified_at ? (
                        <CheckCircle size={16} style={{ color: '#10b981' }} />
                      ) : (
                        <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                      )}
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: requisition.invoice_verified_at ? '#065f46' : '#92400e',
                        }}
                      >
                        {requisition.invoice_verified_at
                          ? 'Invoice Verified'
                          : 'Invoice Pending Verification'}
                      </span>
                    </div>

                    {requisition.invoice_verified_at && (
                      <p style={{ margin: '4px 0 0 24px', fontSize: '13px', color: '#065f46' }}>
                        Verified on {new Date(requisition.invoice_verified_at).toLocaleDateString()}
                      </p>
                    )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      marginBottom: '24px',
                    }}
                  >
                    <button
                      onClick={() => navigate('/procurement')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#6b7280',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <ArrowLeft size={20} />
                    </button>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '8px',
                        }}
                      >
                        <h1
                          style={{
                            margin: 0,
                            fontSize: '32px',
                            fontWeight: 'bold',
                            color: '#1f2937',
                          }}
                        >
                          {requisition.pr_number || `Requisition #${requisition.id}`}
                        </h1>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '6px 16px',
                            borderRadius: '20px',
                            background: `${getProcurementStatusColor(requisition.status)}20`,
                            color: getProcurementStatusColor(requisition.status),
                            fontSize: '14px',
                            fontWeight: 600,
                          }}
                        >
                          {getStatusIcon(requisition.status)}
                          {getProcurementStatusLabel(requisition.status)}
                        </div>
                      </div>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: '16px' }}>
                        Purchase Requisition Details
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: '16px',
                      marginBottom: '24px',
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '12px',
                          color: '#6b7280',
                          fontWeight: 500,
                        }}
                      >
                        INVOICE NUMBER
                      </p>
                      <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 600 }}>
                        {requisition.vendor_invoice_number}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          margin: '0 0 4px 0',
                          fontSize: '12px',
                          color: '#6b7280',
                          fontWeight: 500,
                        }}
                      >
                        INVOICE DATE
                      </p>
                      <p style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 600 }}>
                        {requisition.vendor_invoice_date
                          ? new Date(requisition.vendor_invoice_date).toLocaleDateString()
                          : 'N/A'}
                      </p>
                    </div>
                    {requisition.vendor_invoice_amount && (
                      <div>
                        <p
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: '12px',
                            color: '#6b7280',
                            fontWeight: 500,
                          }}
                        >
                          INVOICE AMOUNT
                        </p>
                        <p
                          style={{ margin: 0, fontSize: '14px', color: '#1f2937', fontWeight: 600 }}
                        >
                          ₦{parseFloat(requisition.vendor_invoice_amount).toLocaleString()}
                        </p>
                      </div>
                    )}
                    {requisition.vendor_invoice_file && (
                      <div>
                        <p
                          style={{
                            margin: '0 0 4px 0',
                            fontSize: '12px',
                            color: '#6b7280',
                            fontWeight: 500,
                          }}
                        >
                          INVOICE FILE
                        </p>
                        <a
                          href={requisition.vendor_invoice_file}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            color: '#3b82f6',
                            textDecoration: 'none',
                            fontSize: '14px',
                            fontWeight: 500,
                          }}
                        >
                          <Download size={14} />
                          Download Invoice
                        </a>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div
                  style={{
                    padding: '24px',
                    background: '#fef2f2',
                    borderRadius: '8px',
                    border: '1px solid #fecaca',
                    textAlign: 'center',
                  }}
                >
                  <AlertCircle size={24} style={{ color: '#dc2626', marginBottom: '8px' }} />
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#991b1b',
                    }}
                  >
                    Vendor Invoice Required for Approval
                  </p>
                  <p style={{ margin: 0, fontSize: '13px', color: '#7f1d1d' }}>
                    Please verify the vendor invoice details before this requisition can be
                    approved.
                  </p>
                </div>
              )}
            </div>
          )} */}

          {/* Requisition Items */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#1f2937' }}>
                Requisition Items ({requisition.items?.length || 0})
              </h3>
              <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#1f2937' }}>
                ₦{parseFloat(requisition.estimated_total || '0').toLocaleString()}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {(requisition.items || []).map((item, index) => (
                <div
                  key={item.id || index}
                  style={{
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    padding: '20px',
                    background: '#fafbfc',
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
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '12px',
                          marginBottom: '8px',
                        }}
                      >
                        <Package size={16} style={{ color: '#6b7280' }} />
                        <h4
                          style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1f2937' }}
                        >
                          {item.item_name || 'Unknown Item'}
                        </h4>
                        <span
                          style={{
                            fontSize: '12px',
                            color: '#6b7280',
                            background: '#f3f4f6',
                            padding: '2px 8px',
                            borderRadius: '4px',
                          }}
                        >
                          {item.item_sku || 'N/A'}
                        </span>
                      </div>

                      <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#6b7280' }}>
                        {item.description || 'No description available'}
                      </p>

                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                          gap: '12px',
                          marginBottom: '12px',
                        }}
                      >
                        <div>
                          <p
                            style={{
                              margin: '0 0 2px 0',
                              fontSize: '11px',
                              color: '#6b7280',
                              fontWeight: 500,
                            }}
                          >
                            QUANTITY
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '14px',
                              color: '#1f2937',
                              fontWeight: 500,
                            }}
                          >
                            {item.quantity || '0'}
                          </p>
                        </div>

                        <div>
                          <p
                            style={{
                              margin: '0 0 2px 0',
                              fontSize: '11px',
                              color: '#6b7280',
                              fontWeight: 500,
                            }}
                          >
                            UNIT PRICE
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '14px',
                              color: '#1f2937',
                              fontWeight: 500,
                            }}
                          >
                            ₦{parseFloat(item.estimated_unit_price || '0').toLocaleString()}
                          </p>
                        </div>

                        <div>
                          <p
                            style={{
                              margin: '0 0 2px 0',
                              fontSize: '11px',
                              color: '#6b7280',
                              fontWeight: 500,
                            }}
                          >
                            TOTAL PRICE
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '14px',
                              color: '#1f2937',
                              fontWeight: 500,
                            }}
                          >
                            ₦{parseFloat(item.total_price || '0').toLocaleString()}
                          </p>
                        </div>
                      </div>

                      {item.notes && (
                        <div style={{ marginTop: '12px' }}>
                          <p
                            style={{
                              margin: '0 0 4px 0',
                              fontSize: '11px',
                              color: '#6b7280',
                              fontWeight: 500,
                            }}
                          >
                            NOTES
                          </p>
                          <p
                            style={{
                              margin: 0,
                              fontSize: '13px',
                              color: '#6b7280',
                              fontStyle: 'italic',
                            }}
                          >
                            {item.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quote Comparison Section - Only show for approved requisitions */}
          {requisition.status === 'approved' && (
            <div>
              {quotesLoading ? (
                <div
                  style={{
                    background: 'white',
                    border: '2px solid #e5e7eb',
                    borderRadius: '12px',
                    padding: '24px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ color: '#6b7280' }}>Loading quotes...</div>
                </div>
              ) : (
                <QuoteComparison
                  quotes={quotes || { requisition_id: requisition.id, count: 0, quotes: [] }}
                  requisitionId={requisition.id}
                  onQuoteSelected={handleQuoteSelected}
                  onConvertToPO={handleConvertQuoteToPO}
                />
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Summary Card */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Items:</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>
                  {requisition.items.length}
                </span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '14px', color: '#6b7280' }}>Total Quantity:</span>
                <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>
                  {requisition.items.reduce(
                    (sum, item) => sum + parseFloat(item.quantity || '0'),
                    0
                  )}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid #e5e7eb',
                }}
              >
                <span style={{ fontSize: '16px', fontWeight: 600, color: '#1f2937' }}>
                  Total Cost:
                </span>
                <span style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937' }}>
                  ₦{parseFloat(requisition.total_price).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Approval Workflow */}
          <div
            style={{
              background: 'white',
              border: '2px solid #e5e7eb',
              borderRadius: '12px',
              padding: '24px',
            }}
          >
            <h3
              style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#1f2937' }}
            >
              Approval Workflow
            </h3>

            {requisition.approval_workflow && requisition.approval_workflow.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {requisition.approval_workflow.map((step, index) => (
                  <div
                    key={step.id || index}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '16px',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      background: step.status === ApprovalStatus.PENDING ? '#fef3c7' : '#f9fafb',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: getApprovalStatusColor(step.status),
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 600,
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>

                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontSize: '14px', fontWeight: 500, color: '#1f2937' }}>
                          {step.approver?.first_name + ' ' + step.approver?.last_name ||
                            step.approver_name ||
                            'Unknown'}
                        </span>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: `${getApprovalStatusColor(step.status)}20`,
                            color: getApprovalStatusColor(step.status),
                            fontSize: '11px',
                            fontWeight: 600,
                          }}
                        >
                          {getApprovalStatusIcon(step.status)}
                          {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                        </div>
                      </div>

                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#6b7280' }}>
                        {step.approver.email}
                      </p>

                      {step.comments && (
                        <p
                          style={{
                            margin: '8px 0 0 0',
                            fontSize: '13px',
                            color: '#374151',
                            fontStyle: 'italic',
                          }}
                        >
                          "{step.comments}"
                        </p>
                      )}

                      {(step.approved_at || step.rejected_at) && (
                        <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
                          {step.approved_at
                            ? `Approved on ${new Date(step.approved_at).toLocaleDateString()}`
                            : `Rejected on ${new Date(step.rejected_at!).toLocaleDateString()}`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
                <Clock size={24} style={{ margin: '0 auto 8px', display: 'block' }} />
                <p style={{ margin: 0, fontSize: '14px' }}>No approval workflow configured</p>
              </div>
            )}
          </div>

          {/* Conversion Status */}
          {requisition.status === RequisitionStatus.CONVERTED && requisition.converted_to_po_id && (
            <div
              style={{
                background: 'white',
                border: '2px solid #e5e7eb',
                borderRadius: '12px',
                padding: '24px',
              }}
            >
              <h3
                style={{
                  margin: '0 0 16px 0',
                  fontSize: '18px',
                  fontWeight: 600,
                  color: '#1f2937',
                }}
              >
                Conversion Status
              </h3>

              <div
                style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}
              >
                <ShoppingCart size={20} style={{ color: '#8b5cf6' }} />
                <div>
                  <p
                    style={{
                      margin: '0 0 4px 0',
                      fontSize: '14px',
                      fontWeight: 500,
                      color: '#1f2937',
                    }}
                  >
                    Converted to Purchase Order
                  </p>
                  <p style={{ margin: 0, fontSize: '12px', color: '#6b7280' }}>
                    PO #{requisition.converted_to_po_id}
                  </p>
                </div>
              </div>

              {requisition.converted_at && (
                <p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#6b7280' }}>
                  Converted on {new Date(requisition.converted_at).toLocaleDateString()}
                </p>
              )}

              <button
                onClick={() =>
                  navigate(`/procurement/orders/${requisition.converted_to_po_id}/view`)
                }
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #8b5cf6',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#8b5cf6',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <Eye size={16} />
                View Purchase Order
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Workflow Integration Panels */}
      {/* {showWorkflowPanel && (
                <div style={{ marginTop: '24px' }}>
                    <WorkflowStatusTracker
                        entityType="requisition"
                        entityId={requisition.id!}
                        showDetails={true}
                        compact={false}
                        className="mb-6"
                    />
                </div>
            )}

            {showNotificationPanel && (
                <div style={{ marginTop: '24px' }}>
                    <NotificationManager
                        entityType="requisition"
                        entityId={requisition.id!}
                        entityData={requisition}
                        trigger={requisition.status === 'submitted' ? 'requisition_submitted' : undefined}
                        onNotificationSent={(notificationId) => {
                            console.log('Notification sent:', notificationId);
                            toast.success('Notification sent successfully');
                        }}
                        className="mb-6"
                    />
                </div>
            )} */}

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
          onClick={() => setShowApprovalModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '500px',
              margin: '20px',
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3
              style={{ margin: '0 0 16px 0', fontSize: '20px', fontWeight: 600, color: '#1f2937' }}
            >
              {approvalAction === 'approve' ? 'Approve Requisition' : 'Reject Requisition'}
            </h3>

            <p style={{ margin: '0 0 16px 0', fontSize: '14px', color: '#6b7280' }}>
              {approvalAction === 'approve'
                ? 'Add any comments about your approval (optional):'
                : 'Please provide a reason for rejection:'}
            </p>

            <textarea
              value={approvalComments}
              onChange={e => setApprovalComments(e.target.value)}
              placeholder={
                approvalAction === 'approve'
                  ? 'Optional approval comments...'
                  : 'Rejection reason...'
              }
              rows={4}
              style={{
                width: '100%',
                padding: '12px',
                border: '2px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '14px',
                resize: 'vertical',
                marginBottom: '20px',
              }}
            />

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
                  fontWeight: 600,
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

      {/* Invoice Verification Modal */}
      {showInvoiceVerificationModal && (
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
          onClick={() => setShowInvoiceVerificationModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '90vh',
              overflow: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}
            >
              <FileText size={24} style={{ color: '#3b82f6' }} />
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1f2937' }}>
                Verify Vendor Invoice
              </h3>
            </div>

            <div
              style={{
                background: '#fef3c7',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                padding: '12px',
                marginBottom: '24px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertCircle size={16} style={{ color: '#f59e0b' }} />
                <p style={{ margin: 0, fontSize: '14px', color: '#92400e', fontWeight: 500 }}>
                  Invoice verification is required before approval
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Invoice Number <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="text"
                  value={invoiceData.vendor_invoice_number}
                  onChange={e =>
                    setInvoiceData({ ...invoiceData, vendor_invoice_number: e.target.value })
                  }
                  placeholder="Enter vendor invoice number"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Invoice Date <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="date"
                  value={invoiceData.vendor_invoice_date}
                  onChange={e =>
                    setInvoiceData({ ...invoiceData, vendor_invoice_date: e.target.value })
                  }
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Invoice Amount
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={invoiceData.vendor_invoice_amount}
                  onChange={e => {
                    if (!isValidDecimalInput(e.target.value)) {
                      return;
                    }
                    setInvoiceData({ ...invoiceData, vendor_invoice_amount: e.target.value });
                  }}
                  placeholder="Enter invoice amount"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#374151',
                  }}
                >
                  Invoice File (PDF/Image)
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                  }}
                />
                {invoiceFile && (
                  <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                    Selected: {invoiceFile.name}
                  </p>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button
                onClick={() => {
                  setShowInvoiceVerificationModal(false);
                  setInvoiceData({
                    vendor_invoice_number: '',
                    vendor_invoice_date: '',
                    vendor_invoice_amount: '',
                  });
                  setInvoiceFile(null);
                }}
                style={{
                  flex: 1,
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
                onClick={handleVerifyInvoice}
                disabled={
                  processing ||
                  !invoiceData.vendor_invoice_number ||
                  !invoiceData.vendor_invoice_date
                }
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  border: 'none',
                  borderRadius: '8px',
                  background:
                    processing ||
                    !invoiceData.vendor_invoice_number ||
                    !invoiceData.vendor_invoice_date
                      ? '#9ca3af'
                      : '#3b82f6',
                  color: 'white',
                  cursor:
                    processing ||
                    !invoiceData.vendor_invoice_number ||
                    !invoiceData.vendor_invoice_date
                      ? 'not-allowed'
                      : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                <CheckCircle size={16} />
                {processing ? 'Verifying...' : 'Verify Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Convert to PO Modal */}
      <ConvertToPOModal
        isOpen={showConvertToPOModal}
        onClose={() => setShowConvertToPOModal(false)}
        onConfirm={handleConvertToPO}
        requisition={requisition}
        isLoading={processing}
      />

      {/* Quote Request Form */}
      <QuoteRequestForm
        isOpen={showQuoteRequestForm}
        onClose={() => setShowQuoteRequestForm(false)}
        requisition={requisition}
        suppliersWithQuotes={getSuppliersWithQuotes()}
        onSuccess={() => {
          if (requisition?.id) {
            queryClient.invalidateQueries({ queryKey: quotesKeys.quotes() });
            queryClient.invalidateQueries({
              queryKey: quotesKeys.quotesComparison(requisition.id),
            });
          }
        }}
      />

      {/* Convert Quote to PO Modal */}
      {selectedQuoteForConversion && (
        <ConvertQuoteToPOModal
          quote={selectedQuoteForConversion}
          isOpen={showConvertQuoteToPOModal}
          onClose={() => {
            setShowConvertQuoteToPOModal(false);
            setSelectedQuoteForConversion(null);
          }}
          onConvert={handleQuoteToPOConversion}
        />
      )}
    </div>
  );
};

export default RequisitionDetailPage;
