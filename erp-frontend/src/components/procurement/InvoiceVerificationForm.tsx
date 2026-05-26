import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useVerifyRequisitionInvoice } from '../../hooks/useProcurement';
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
import { Upload, AlertCircle, CheckCircle } from 'lucide-react';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

// Validation schema
const invoiceVerificationSchema = z.object({
  vendor_invoice_number: z.string().min(1, 'Invoice number is required'),
  vendor_invoice_date: z.string().min(1, 'Invoice date is required'),
  vendor_invoice_amount: z
    .string()
    .min(1, 'Invoice amount is required')
    .refine(val => DECIMAL_INPUT_REGEX.test(val), 'Use a valid amount with up to 2 decimals')
    .refine(
      val => !isNaN(Number(val)) && Number(val) > 0,
      'Invoice amount must be a positive number'
    ),
  vendor_invoice_file: z
    .instanceof(FileList)
    .optional()
    .refine(
      files => !files || files.length === 0 || files[0].size <= 5000000,
      'File size must be less than 5MB'
    )
    .refine(
      files =>
        !files ||
        files.length === 0 ||
        ['application/pdf', 'image/jpeg', 'image/png'].includes(files[0].type),
      'Only PDF, JPEG, and PNG files are allowed'
    ),
});

type InvoiceVerificationFormData = z.infer<typeof invoiceVerificationSchema>;

interface InvoiceVerificationFormProps {
  requisitionId: number;
  onSuccess?: () => void;
}

export const InvoiceVerificationForm: React.FC<InvoiceVerificationFormProps> = ({
  requisitionId,
  onSuccess,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InvoiceVerificationFormData>({
    resolver: zodResolver(invoiceVerificationSchema),
  });

  const verifyInvoiceMutation = useVerifyRequisitionInvoice();

  const onSubmit = async (data: InvoiceVerificationFormData) => {
    const formData = new FormData();
    formData.append('vendor_invoice_number', data.vendor_invoice_number);
    formData.append('vendor_invoice_date', data.vendor_invoice_date);
    formData.append('vendor_invoice_amount', data.vendor_invoice_amount);

    if (data.vendor_invoice_file && data.vendor_invoice_file.length > 0) {
      formData.append('vendor_invoice_file', data.vendor_invoice_file[0]);
    }

    verifyInvoiceMutation.mutate(
      { id: requisitionId, data: formData },
      {
        onSuccess: () => {
          reset();
          onSuccess?.();
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Vendor Invoice Verification
        </CardTitle>
        <CardDescription>
          Upload and verify the vendor invoice before approving this purchase requisition
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Invoice verification is required before the purchase
            requisition can be approved. This ensures proper documentation and control over the
            procurement process.
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Invoice Number */}
          <div className="space-y-2">
            <Label htmlFor="vendor_invoice_number">
              Vendor Invoice Number <span className="text-red-500">*</span>
            </Label>
            <Input
              id="vendor_invoice_number"
              {...register('vendor_invoice_number')}
              placeholder="Enter vendor invoice number"
              disabled={isSubmitting}
            />
            {errors.vendor_invoice_number && (
              <p className="text-sm text-red-500">{errors.vendor_invoice_number.message}</p>
            )}
          </div>

          {/* Invoice Date */}
          <div className="space-y-2">
            <Label htmlFor="vendor_invoice_date">
              Invoice Date <span className="text-red-500">*</span>
            </Label>
            <Input
              id="vendor_invoice_date"
              type="date"
              {...register('vendor_invoice_date')}
              disabled={isSubmitting}
            />
            {errors.vendor_invoice_date && (
              <p className="text-sm text-red-500">{errors.vendor_invoice_date.message}</p>
            )}
          </div>

          {/* Invoice Amount */}
          <div className="space-y-2">
            <Label htmlFor="vendor_invoice_amount">
              Invoice Amount <span className="text-red-500">*</span>
            </Label>
            <Input
              id="vendor_invoice_amount"
              type="text"
              inputMode="decimal"
              {...register('vendor_invoice_amount')}
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {errors.vendor_invoice_amount && (
              <p className="text-sm text-red-500">{errors.vendor_invoice_amount.message}</p>
            )}
          </div>

          {/* Invoice File Upload */}
          <div className="space-y-2">
            <Label htmlFor="vendor_invoice_file">Invoice File (Optional)</Label>
            <Input
              id="vendor_invoice_file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              {...register('vendor_invoice_file')}
              disabled={isSubmitting}
            />
            <p className="text-sm text-gray-500">Upload PDF, JPEG, or PNG file (max 5MB)</p>
            {errors.vendor_invoice_file && (
              <p className="text-sm text-red-500">{errors.vendor_invoice_file.message}</p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex gap-3">
            <Button type="submit" disabled={isSubmitting} className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              {isSubmitting ? 'Verifying...' : 'Verify Invoice'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
