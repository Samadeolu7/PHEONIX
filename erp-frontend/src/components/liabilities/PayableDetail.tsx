import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

import { Button } from '@/components/ui/Button';

import { Alert, AlertDescription } from '@/components/ui/Alert';

import { usePayable, useValidateThreeWayMatch } from '../../hooks/usePayables';
import { PaymentModal } from './PaymentModal';
import { ThreeWayMatchResultDisplay } from './ThreeWayMatchResult';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/formatters';
import {
  ArrowLeft,
  FileText,
  DollarSign,
  Calendar,
  User,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
} from 'lucide-react';

// ============================================================================
// PAYABLE DETAIL COMPONENT
// ============================================================================

interface PayableDetailProps {
  payableId: number;
}

export const PayableDetail: React.FC<PayableDetailProps> = ({ payableId }) => {
  const navigate = useNavigate();
  const { data: payable, isLoading, error, refetch } = usePayable(payableId);
  const validateMutation = useValidateThreeWayMatch();

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

  const handleValidate = async () => {
    try {
      await validateMutation.mutateAsync(payableId);
      refetch();
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading payable details...</div>
      </div>
    );
  }

  if (error || !payable) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-destructive">
          Error loading payable: {error?.message || 'Payable not found'}
        </div>
      </div>
    );
  }

  const canMakePayment =
    payable.status !== 'paid' &&
    payable.status !== 'cancelled' &&
    parseFloat(payable.outstanding_amount) > 0;

  const needsValidation = payable.purchase_order !== null && payable.three_way_match_status === 'not_validated';

  const StatusBadge = () => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'outline',
      partial: 'secondary',
      paid: 'default',
      overdue: 'destructive',
      cancelled: 'outline',
    };

    return <Badge variant={variants[payable.status]}>{payable.status.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{payable.invoice_number}</h1>
            <p className="text-sm text-muted-foreground">Invoice: {payable.invoice_number}</p>
          </div>
        </div>
        <StatusBadge />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {needsValidation && (
          <Button variant="outline" onClick={handleValidate} disabled={validateMutation.isPending}>
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {validateMutation.isPending ? 'Validating...' : 'Validate 3-Way Match'}
          </Button>
        )}
        {canMakePayment && (
          <Button onClick={() => setIsPaymentModalOpen(true)}>
            <DollarSign className="h-4 w-4 mr-2" />
            Make Payment
          </Button>
        )}
      </div>

      {/* Validation Alert */}
      {payable.three_way_match_status === 'failed' && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            3-way match validation failed. Review the validation results below.
          </AlertDescription>
        </Alert>
      )}

      {payable.status === 'overdue' && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            This payable is overdue. Due date was {formatDate(payable.due_date)}.
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vendor Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Vendor Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Vendor:</span>
                <span className="font-medium">{payable.vendor_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="capitalize">{payable.vendor_type}</span>
              </div>
              {payable.purchase_order_details && (
                <>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Purchase Order:</span>
                    <span className="font-medium">{payable.purchase_order_details.po_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PO Date:</span>
                    <span>{formatDate(payable.purchase_order_details.order_date)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">PO Amount:</span>
                    <span>{formatCurrency(parseFloat(payable.purchase_order_details.total_amount))}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Invoice Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Invoice Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Number:</span>
                <span className="font-medium">{payable.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice Date:</span>
                <span>{formatDate(payable.invoice_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Due Date:</span>
                <span>{formatDate(payable.due_date)}</span>
              </div>
              {payable.payment_terms && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Payment Terms:</span>
                  <span className="capitalize">{payable.payment_terms.replace('_', ' ')}</span>
                </div>
              )}
              {payable.description && (
                <>
                  <Separator />
                  <div>
                    <span className="text-muted-foreground">Description:</span>
                    <p className="mt-1">{payable.description}</p>
                  </div>
                </>
              )}
              {payable.notes && (
                <div>
                  <span className="text-muted-foreground">Notes:</span>
                  <p className="mt-1 text-sm">{payable.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Accountability */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Accountability
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Posted By:</span>
                <span className="font-medium">
                  {payable.posted_by_name || `User #${payable.posted_by}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Posted At:</span>
                <span>{formatDateTime(payable.posted_at)}</span>
              </div>
              {payable.posting_notes && (
                <div>
                  <span className="text-muted-foreground">Posting Notes:</span>
                  <p className="mt-1 text-sm">{payable.posting_notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3-Way Match Results */}
          {payable.three_way_match_result && (
            <ThreeWayMatchResultDisplay result={payable.three_way_match_result} />
          )}
        </div>

        {/* Right Column - Summary */}
        <div className="space-y-6">
          {/* Amount Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Amount Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span>{formatCurrency(parseFloat(payable.amount))}</span>
              </div>
              {payable.tax_amount && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax:</span>
                  <span>{formatCurrency(parseFloat(payable.tax_amount))}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-lg font-semibold">
                <span>Total:</span>
                <span>{formatCurrency(parseFloat(payable.total_amount ?? payable.amount))}</span>
              </div>
              <Separator />
              <div className="flex justify-between">
                <span className="text-muted-foreground">Paid:</span>
                <span className="text-green-600">
                  {formatCurrency(parseFloat(payable.amount_paid))}
                </span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span>Due:</span>
                <span className="text-red-600">
                  {formatCurrency(parseFloat(payable.outstanding_amount))}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Dates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Important Dates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created:</span>
                <span className="text-sm">{formatDateTime(payable.created_at)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated:</span>
                <span className="text-sm">{formatDateTime(payable.updated_at)}</span>
              </div>
              {payable.validated_at && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Validated:</span>
                  <span className="text-sm">{formatDateTime(payable.validated_at)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        payableId={payable.id}
        payableReference={payable.invoice_number}
        amountDue={payable.outstanding_amount}
        onSuccess={() => {
          refetch();
          setIsPaymentModalOpen(false);
        }}
      />
    </div>
  );
};

export default PayableDetail;
