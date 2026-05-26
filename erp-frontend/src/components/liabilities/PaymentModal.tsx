import React, { useState } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import Dialog, {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';

import { Button } from '@/components/ui/Button';

import Textarea from '@/components/ui/Textarea';

import { Input } from '@/components/ui/Input';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

import { Alert, AlertDescription } from '@/components/ui/Alert';

import { Label } from '../ui/Label';
import { MakePaymentRequest } from '../../types/liabilities';
import { useMakePayment } from '../../hooks/usePayables';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';

// ============================================================================
// PAYMENT MODAL COMPONENT
// ============================================================================

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  payableId: number;
  payableReference: string;
  amountDue: string;
  onSuccess?: () => void;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  payableId,
  payableReference,
  amountDue,
  onSuccess,
}) => {
  const { user } = useAuth();
  const [formData, setFormData] = useState<MakePaymentRequest>({
    amount: amountDue,
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'bank_transfer',
    reference_number: '',
    notes: '',
    posted_by: user?.id || 1,
  });

  const makePaymentMutation = useMakePayment();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await makePaymentMutation.mutateAsync({
        id: payableId,
        data: formData,
      });

      if (result.success) {
        onSuccess?.();
        onClose();
        // Show success toast
      }
    } catch (error) {
      // Error is handled by React Query
      console.error('Payment failed:', error);
    }
  };

  const handleChange = (field: keyof MakePaymentRequest, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleClose = () => {
    if (!makePaymentMutation.isPending) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Make Payment</DialogTitle>
          <DialogDescription>Record payment for payable: {payableReference}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount Due Display */}
          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Outstanding Amount:</span>
              <span className="text-lg font-bold">{formatCurrency(parseFloat(amountDue))}</span>
            </div>
          </div>

          {/* Payment Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Payment Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              min="0.01"
              max={amountDue}
              value={formData.amount}
              onChange={e => handleChange('amount', e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Maximum: {formatCurrency(parseFloat(amountDue))}
            </p>
          </div>

          {/* Payment Date */}
          <div className="space-y-2">
            <Label htmlFor="payment_date">Payment Date *</Label>
            <Input
              id="payment_date"
              type="date"
              value={formData.payment_date}
              onChange={e => handleChange('payment_date', e.target.value)}
              required
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-2">
            <Label htmlFor="payment_method">Payment Method *</Label>
            <Select
              value={formData.payment_method}
              onValueChange={value => handleChange('payment_method', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                <SelectItem value="check">Check</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="credit_card">Credit Card</SelectItem>
                <SelectItem value="debit_card">Debit Card</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference_number">Reference Number</Label>
            <Input
              id="reference_number"
              value={formData.reference_number}
              onChange={e => handleChange('reference_number', e.target.value)}
              placeholder="Transaction reference or check number"
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={e => handleChange('notes', e.target.value)}
              placeholder="Additional payment notes..."
              rows={3}
            />
          </div>

          {/* Accountability Notice */}
          <Alert>
            <AlertDescription className="text-xs">
              This payment will be recorded under your user account (
              {user?.username || user?.email || `User #${formData.posted_by}`}) for accountability
              tracking.
            </AlertDescription>
          </Alert>

          {/* Error Display */}
          {makePaymentMutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>
                {makePaymentMutation.error?.message || 'Failed to process payment'}
              </AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={makePaymentMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={makePaymentMutation.isPending}>
              {makePaymentMutation.isPending ? 'Processing...' : 'Make Payment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
