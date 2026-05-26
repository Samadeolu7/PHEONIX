import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, FileText, GraduationCap, Coins } from 'lucide-react';
import { CustomerReceivable } from '../../services/receivablesService';
import PaymentRecordingModal, { PaymentData } from './PaymentRecordingModal';
import { invoiceService, Invoice } from '../../services/invoiceService';
import { entitlementService, FeeEntitlement } from '../../services/entitlementService';
import { useToast } from '../../hooks/useToast';

interface UnifiedPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  receivable: CustomerReceivable;
  onPaymentRecorded?: () => void;
}

// Placeholder component for non-invoice receivable types
const PaymentNotImplementedModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  receivable: CustomerReceivable;
}> = ({ isOpen, onClose, receivable }) => {
  if (!isOpen) return null;

  const getReceivableTypeInfo = () => {
    const typeConfig = {
      entitlement: {
        icon: GraduationCap,
        label: 'Repayment / Fee',
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
      },
      loan: {
        icon: Coins,
        label: 'Loan',
        color: 'text-purple-600',
        bgColor: 'bg-purple-50',
        borderColor: 'border-purple-200',
      },
      other: {
        icon: FileText,
        label: 'Other',
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
      },
    };

    return typeConfig[receivable.receivable_type as keyof typeof typeConfig] || typeConfig.other;
  };

  const typeInfo = getReceivableTypeInfo();
  const TypeIcon = typeInfo.icon;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
        <div className="mt-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              <AlertTriangle className="h-6 w-6 text-yellow-600 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Payment Modal Not Available</h3>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="h-6 w-6" />
            </button>
          </div>

          {/* Receivable Summary */}
          <div className={`mb-4 p-3 rounded-lg border ${typeInfo.bgColor} ${typeInfo.borderColor}`}>
            <div className="flex items-center mb-2">
              <TypeIcon className={`h-5 w-5 ${typeInfo.color} mr-2`} />
              <span className={`text-sm font-medium ${typeInfo.color}`}>{typeInfo.label}</span>
            </div>
            <p className="text-sm text-gray-600 mb-1">
              Reference: <span className="font-medium">{receivable.reference_number}</span>
            </p>
            <p className="text-sm text-gray-600 mb-1">
              Client: <span className="font-medium">{receivable.client_name}</span>
            </p>
            <p className="text-sm font-medium text-gray-900">
              Outstanding Balance:{' '}
              <span className="text-green-600">
                {new Intl.NumberFormat('en-NG', {
                  style: 'currency',
                  currency: 'NGN',
                  minimumFractionDigits: 0,
                }).format(parseFloat(receivable.balance))}
              </span>
            </p>
          </div>

          {/* Message */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-yellow-800">
                  Payment Modal Not Yet Implemented
                </p>
                <p className="text-sm text-yellow-700 mt-1">
                  The payment recording modal for {typeInfo.label.toLowerCase()} receivables is not
                  yet available. Please use the dedicated payment page for this receivable type.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Entitlement Payment Wrapper Component
const EntitlementPaymentWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  entitlementId: number;
  onPaymentRecorded?: () => void;
}> = ({ isOpen, onClose, entitlementId, onPaymentRecorded }) => {
  const [entitlement, setEntitlement] = useState<FeeEntitlement | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success, error: showError } = useToast();

  // Fetch entitlement data when modal opens
  useEffect(() => {
    if (isOpen && entitlementId) {
      fetchEntitlement();
    }
  }, [isOpen, entitlementId]);

  const fetchEntitlement = async () => {
    try {
      setIsLoading(true);
      const entitlementData = await entitlementService.getEntitlement(entitlementId);
      setEntitlement(entitlementData);
    } catch (error: any) {
      console.error('Failed to fetch entitlement:', error);
      showError('Failed to load entitlement details');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSubmit = async (paymentData: PaymentData) => {
    try {
      setIsSubmitting(true);
      await entitlementService.recordPayment(entitlementId, {
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        bank_account_id: paymentData.bank_account_id,
        reference: paymentData.reference,
        notes: paymentData.notes,
      });

      success('Payment recorded successfully');
      onClose();
      if (onPaymentRecorded) {
        onPaymentRecorded();
      }
    } catch (error: any) {
      console.error('Payment recording error:', error);
      showError(error.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while fetching entitlement
  if (isOpen && isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading entitlement details...</span>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no entitlement data
  if (!entitlement) {
    return null;
  }

  // Convert entitlement to invoice-like format for PaymentRecordingModal
  const invoiceForModal: Invoice = {
    id: entitlement.id,
    client: entitlement.client.id,
    client_name: entitlement.client.full_name,
    invoice_number: `ENT-${entitlement.id}`,
    invoice_date: entitlement.valid_from,
    due_date: entitlement.valid_until,
    description: `Fee Entitlement - ${entitlement.fee_structure.name}`,
    amount: entitlement.total_amount,
    amount_paid: entitlement.amount_paid,
    balance: entitlement.balance,
    fee_structure: entitlement.fee_structure.id,
    fee_structure_name: entitlement.fee_structure.name,
    status: entitlement.status === 'active' ? 'partial' : 'draft',
    metadata: {},
    is_overdue: false,
    created_at: entitlement.valid_from,
    updated_at: entitlement.valid_from,
  };

  return (
    <PaymentRecordingModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handlePaymentSubmit}
      invoice={invoiceForModal}
      isLoading={isSubmitting}
    />
  );
};

// Invoice Payment Wrapper Component
const InvoicePaymentWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  invoiceId: number;
  onPaymentRecorded?: () => void;
}> = ({ isOpen, onClose, invoiceId, onPaymentRecorded }) => {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { success, error: showError } = useToast();

  // Fetch invoice data when modal opens
  useEffect(() => {
    if (isOpen && invoiceId) {
      fetchInvoice();
    }
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    try {
      setIsLoading(true);
      const invoiceData = await invoiceService.getInvoice(invoiceId);
      setInvoice(invoiceData);
    } catch (error: any) {
      console.error('Failed to fetch invoice:', error);
      showError('Failed to load invoice details');
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaymentSubmit = async (paymentData: PaymentData) => {
    try {
      setIsSubmitting(true);
      await invoiceService.recordPayment(invoiceId, {
        amount: paymentData.amount,
        payment_date: paymentData.payment_date,
        payment_method: paymentData.payment_method,
        bank_account_id: paymentData.bank_account_id,
        reference: paymentData.reference,
        notes: paymentData.notes,
        line_item_allocations: paymentData.line_item_allocations,
      });

      success('Payment recorded successfully');
      onClose();
      if (onPaymentRecorded) {
        onPaymentRecorded();
      }
    } catch (error: any) {
      console.error('Payment recording error:', error);
      showError(error.message || 'Failed to record payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show loading state while fetching invoice
  if (isOpen && isLoading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-full max-w-md shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading invoice details...</span>
          </div>
        </div>
      </div>
    );
  }

  // Don't render if no invoice data
  if (!invoice) {
    return null;
  }

  return (
    <PaymentRecordingModal
      isOpen={isOpen}
      onClose={onClose}
      onSubmit={handlePaymentSubmit}
      invoice={invoice}
      isLoading={isSubmitting}
    />
  );
};

const UnifiedPaymentModal: React.FC<UnifiedPaymentModalProps> = ({
  isOpen,
  onClose,
  receivable,
  onPaymentRecorded,
}) => {
  // For invoice receivables, use the invoice payment wrapper
  if (receivable.receivable_type === 'invoice') {
    return (
      <InvoicePaymentWrapper
        isOpen={isOpen}
        onClose={onClose}
        invoiceId={receivable.object_id}
        onPaymentRecorded={onPaymentRecorded}
      />
    );
  }

  // For entitlement receivables, use the entitlement payment wrapper
  if (receivable.receivable_type === 'entitlement') {
    return (
      <EntitlementPaymentWrapper
        isOpen={isOpen}
        onClose={onClose}
        entitlementId={receivable.object_id}
        onPaymentRecorded={onPaymentRecorded}
      />
    );
  }

  // For other receivable types (loan, other), show the placeholder modal
  return <PaymentNotImplementedModal isOpen={isOpen} onClose={onClose} receivable={receivable} />;
};

export default UnifiedPaymentModal;
