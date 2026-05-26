import React, { useState, useEffect } from 'react';

import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/Table';

import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';

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

import { CreatePayableRequest, UpdatePayableRequest } from '../../types/liabilities';
import { useCreatePayable, useUpdatePayable } from '../../hooks/usePayables';
import { useAuth } from '../../contexts/AuthContext';
import { VendorSelect } from './VendorSelect';

// ============================================================================
// PAYABLE FORM COMPONENT
// ============================================================================

interface PayableFormProps {
  initialData?: Partial<CreatePayableRequest>;
  payableId?: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const PayableForm: React.FC<PayableFormProps> = ({
  initialData,
  payableId,
  onSuccess,
  onCancel,
}) => {
  const isEditMode = !!payableId;
  const { user } = useAuth();

  const [formData, setFormData] = useState<CreatePayableRequest>({
    vendor_type: initialData?.vendor_type || 'supplier',
    vendor_id: initialData?.vendor_id || 0,
    purchase_order_id: initialData?.purchase_order_id || null,
    invoice_number: initialData?.invoice_number || '',
    invoice_date: initialData?.invoice_date || new Date().toISOString().split('T')[0],
    due_date: initialData?.due_date || '',
    amount: initialData?.amount || '0.00',
    tax_amount: initialData?.tax_amount || '0.00',
    payment_terms: initialData?.payment_terms || 'net_30',
    description: initialData?.description || '',
    notes: initialData?.notes || '',
    posted_by: user?.id || 1,
    posting_notes: initialData?.posting_notes || '',
  });

  const createMutation = useCreatePayable();
  const updateMutation = useUpdatePayable();

  const mutation = isEditMode ? updateMutation : createMutation;

  // Calculate total amount
  const totalAmount = (
    parseFloat(formData.amount || '0') + parseFloat(formData.tax_amount || '0')
  ).toFixed(2);

  const handleChange = (field: keyof CreatePayableRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (isEditMode && payableId) {
        await updateMutation.mutateAsync({
          id: payableId,
          data: formData as UpdatePayableRequest,
        });
      } else {
        await createMutation.mutateAsync(formData);
      }

      onSuccess?.();
    } catch (error) {
      console.error('Failed to save payable:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Vendor Information */}
      <Card>
        <CardHeader>
          <CardTitle>Vendor Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="vendor_type">Vendor Type *</Label>
              <Select
                value={formData.vendor_type}
                onValueChange={value => handleChange('vendor_type', value)}
                disabled={isEditMode}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="client">Client</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <VendorSelect
                vendorType={formData.vendor_type}
                value={formData.vendor_id}
                onChange={vendorId => handleChange('vendor_id', vendorId)}
                label="Vendor"
                required
                disabled={isEditMode}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase_order_id">Purchase Order (Optional)</Label>
            <Input
              id="purchase_order_id"
              type="number"
              value={formData.purchase_order_id || ''}
              onChange={e =>
                handleChange('purchase_order_id', e.target.value ? parseInt(e.target.value) : null)
              }
              placeholder="Link to purchase order"
            />
            <p className="text-xs text-muted-foreground">
              3-way matching will be performed if PO is provided
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Details */}
      <Card>
        <CardHeader>
          <CardTitle>Invoice Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_number">Invoice Number *</Label>
              <Input
                id="invoice_number"
                value={formData.invoice_number}
                onChange={e => handleChange('invoice_number', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invoice_date">Invoice Date *</Label>
              <Input
                id="invoice_date"
                type="date"
                value={formData.invoice_date}
                onChange={e => handleChange('invoice_date', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date *</Label>
              <Input
                id="due_date"
                type="date"
                value={formData.due_date}
                onChange={e => handleChange('due_date', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_terms">Payment Terms *</Label>
              <Select
                value={formData.payment_terms}
                onValueChange={value => handleChange('payment_terms', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">Immediate</SelectItem>
                  <SelectItem value="net_7">Net 7</SelectItem>
                  <SelectItem value="net_15">Net 15</SelectItem>
                  <SelectItem value="net_30">Net 30</SelectItem>
                  <SelectItem value="net_45">Net 45</SelectItem>
                  <SelectItem value="net_60">Net 60</SelectItem>
                  <SelectItem value="net_90">Net 90</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={formData.description}
              onChange={e => handleChange('description', e.target.value)}
              placeholder="Brief description of the payable"
            />
          </div>
        </CardContent>
      </Card>

      {/* Amount Details */}
      <Card>
        <CardHeader>
          <CardTitle>Amount Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (excluding tax) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={e => handleChange('amount', e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tax_amount">Tax Amount *</Label>
              <Input
                id="tax_amount"
                type="number"
                step="0.01"
                min="0"
                value={formData.tax_amount}
                onChange={e => handleChange('tax_amount', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="p-4 bg-muted rounded-lg">
            <div className="flex justify-between items-center">
              <span className="font-medium">Total Amount:</span>
              <span className="text-2xl font-bold">${totalAmount}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={e => handleChange('notes', e.target.value)}
              placeholder="Additional notes about this payable..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="posting_notes">Posting Notes</Label>
            <Textarea
              id="posting_notes"
              value={formData.posting_notes}
              onChange={e => handleChange('posting_notes', e.target.value)}
              placeholder="Notes about why this payable is being created..."
              rows={2}
            />
          </div>

          <Alert>
            <AlertDescription className="text-xs">
              This payable will be recorded under your user account (
              {user?.username || user?.email || `User #${formData.posted_by}`}) for accountability
              tracking.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Error Display */}
      {mutation.isError && (
        <Alert variant="destructive">
          <AlertDescription>{mutation.error?.message || 'Failed to save payable'}</AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : isEditMode ? 'Update Payable' : 'Create Payable'}
        </Button>
      </div>
    </form>
  );
};

export default PayableForm;
