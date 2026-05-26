/**
 * Cash Transfer Form Component
 * Step 2 of Cash Process - Transfer cash from cashier to main bank account
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, DollarSignIcon, UploadIcon } from 'lucide-react';
import {
  useCreateCashTransfer,
  useSubmitCashTransfer,
  useApproveCashTransfer,
  useRejectCashTransfer,
  useCashierAccount,
} from '../../hooks/useTreasury';
import { CashTransfer, CreateCashTransferRequest } from '../../types/treasury';
import { useAuth } from '../../contexts/AuthContext';
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
import { cn } from '../../lib/utils';

const cashTransferSchema = z.object({
  cashier_account: z.number({
    required_error: 'Please select a cashier account',
  }),
  destination_account: z.number({
    required_error: 'Please select destination account',
  }),
  amount: z.string().min(1, 'Amount is required'),
  bank_deposit_slip: z.string().optional(),
  bank_reference: z.string().optional(),
});

type FormData = z.infer<typeof cashTransferSchema>;

interface CashTransferFormProps {
  cashierAccountId: number;
  destinationAccountId?: number;
  transfer?: CashTransfer;
  onSuccess?: () => void;
  onCancel?: () => void;
  mode?: 'create' | 'approve';
}

export const CashTransferForm: React.FC<CashTransferFormProps> = ({
  cashierAccountId,
  destinationAccountId,
  transfer,
  onSuccess,
  onCancel,
  mode = 'create',
}) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(
    transfer?.transfer_date ? new Date(transfer.transfer_date) : new Date()
  );
  const [depositProof, setDepositProof] = useState<File | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');

  const { data: cashierAccount } = useCashierAccount(cashierAccountId);

  const createMutation = useCreateCashTransfer();
  const submitMutation = useSubmitCashTransfer();
  const approveMutation = useApproveCashTransfer();
  const rejectMutation = useRejectCashTransfer();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(cashTransferSchema),
    defaultValues: transfer
      ? {
          cashier_account: transfer.cashier_account,
          destination_account: transfer.destination_account,
          amount: transfer.amount,
          bank_deposit_slip: transfer.bank_deposit_slip || '',
          bank_reference: transfer.bank_reference || '',
        }
      : {
          cashier_account: cashierAccountId,
          destination_account: destinationAccountId,
        },
  });

  const amount = parseFloat(watch('amount') || '0');
  const cashierBalance = parseFloat(cashierAccount?.current_balance || '0');
  const hasInsufficientFunds = amount > cashierBalance;

  const onSubmit = async (data: FormData) => {
    const formData = new FormData();
    formData.append('cashier_account', data.cashier_account.toString());
    formData.append('destination_account', data.destination_account.toString());
    formData.append('amount', data.amount);
    formData.append('transfer_date', format(date, 'yyyy-MM-dd'));

    if (data.bank_deposit_slip) formData.append('bank_deposit_slip', data.bank_deposit_slip);
    if (data.bank_reference) formData.append('bank_reference', data.bank_reference);
    if (depositProof) formData.append('deposit_proof', depositProof);

    const payload: CreateCashTransferRequest = {
      cashier_account: data.cashier_account,
      destination_account: data.destination_account,
      amount: data.amount,
      transfer_date: format(date, 'yyyy-MM-dd'),
      bank_deposit_slip: data.bank_deposit_slip,
      bank_reference: data.bank_reference,
      deposit_proof: depositProof || undefined,
    };

    const result = await createMutation.mutateAsync(payload);

    // Auto-submit for approval
    await submitMutation.mutateAsync(result.id);

    onSuccess?.();
  };

  const handleApprove = async () => {
    if (!transfer) return;
    await approveMutation.mutateAsync({
      id: transfer.id,
      notes: approvalNotes,
    });
    onSuccess?.();
  };

  const handleReject = async () => {
    if (!transfer || !rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }
    await rejectMutation.mutateAsync({
      id: transfer.id,
      reason: rejectionReason,
    });
    onSuccess?.();
  };

  const isSubmitting = createMutation.isPending || submitMutation.isPending;
  const isProcessing = approveMutation.isPending || rejectMutation.isPending;

  // Approval mode view
  if (mode === 'approve' && transfer) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Cash Transfer #{transfer.transfer_number}</CardTitle>
            <CardDescription>Review and approve cash transfer to bank</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm text-muted-foreground">From Cashier</Label>
                <div className="font-medium">{transfer.cashier_name}</div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">To Bank Account</Label>
                <div className="font-medium">{transfer.destination_account_name}</div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Amount</Label>
                <div className="text-2xl font-bold">{parseFloat(transfer.amount).toFixed(2)}</div>
              </div>
              <div>
                <Label className="text-sm text-muted-foreground">Transfer Date</Label>
                <div className="font-medium">{format(new Date(transfer.transfer_date), 'PPP')}</div>
              </div>
              {transfer.bank_deposit_slip && (
                <div>
                  <Label className="text-sm text-muted-foreground">Deposit Slip</Label>
                  <div className="font-medium">{transfer.bank_deposit_slip}</div>
                </div>
              )}
              {transfer.bank_reference && (
                <div>
                  <Label className="text-sm text-muted-foreground">Bank Reference</Label>
                  <div className="font-medium">{transfer.bank_reference}</div>
                </div>
              )}
            </div>

            {transfer.deposit_proof && (
              <div>
                <Label className="text-sm text-muted-foreground">Deposit Proof</Label>
                <a
                  href={transfer.deposit_proof}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View Uploaded Document
                </a>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="approval_notes">Approval Notes (Optional)</Label>
              <Textarea
                id="approval_notes"
                value={approvalNotes}
                onChange={e => setApprovalNotes(e.target.value)}
                placeholder="Add notes about this approval..."
                rows={3}
              />
            </div>

            <div className="flex gap-4">
              <Button onClick={handleApprove} disabled={isProcessing} className="flex-1">
                {isProcessing ? 'Processing...' : 'Approve Transfer'}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  const reason = prompt('Please provide a reason for rejection:');
                  if (reason) {
                    setRejectionReason(reason);
                    handleReject();
                  }
                }}
                disabled={isProcessing}
                className="flex-1"
              >
                Reject Transfer
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Create mode view
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New Cash Transfer</CardTitle>
          <CardDescription>Transfer cash from cashier account to main bank account</CardDescription>
          {user && (
            <Alert>
              <AlertDescription>
                Transfer initiated by: <strong>{user.email}</strong>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cashier Balance Display */}
          {cashierAccount && (
            <Alert>
              <AlertDescription>
                <div className="flex justify-between items-center">
                  <span>Current Cashier Balance:</span>
                  <span className="text-lg font-bold">{cashierBalance.toFixed(2)}</span>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Transfer Date */}
          <div className="space-y-2">
            <Label>Transfer Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !date && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={d => d && setDate(d)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">
              Transfer Amount <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <DollarSignIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="amount"
                type="number"
                step="0.01"
                className="pl-10"
                {...register('amount')}
                placeholder="0.00"
              />
            </div>
            {errors.amount && <p className="text-sm text-red-500">{errors.amount.message}</p>}
            {hasInsufficientFunds && (
              <Alert variant="destructive">
                <AlertDescription>
                  Insufficient funds! Transfer amount exceeds cashier balance.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Bank Deposit Slip */}
          <div className="space-y-2">
            <Label htmlFor="bank_deposit_slip">Bank Deposit Slip Number</Label>
            <Input
              id="bank_deposit_slip"
              {...register('bank_deposit_slip')}
              placeholder="Teller slip number"
            />
          </div>

          {/* Bank Reference */}
          <div className="space-y-2">
            <Label htmlFor="bank_reference">Bank Reference Number (Optional)</Label>
            <Input
              id="bank_reference"
              {...register('bank_reference')}
              placeholder="Bank transaction reference"
            />
          </div>

          {/* Deposit Proof Upload */}
          <div className="space-y-2">
            <Label htmlFor="deposit_proof">Deposit Proof (Optional)</Label>
            <div className="flex items-center gap-4">
              <Input
                id="deposit_proof"
                type="file"
                accept="image/*,.pdf"
                onChange={e => setDepositProof(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {depositProof && (
                <Badge variant="outline">
                  <UploadIcon className="mr-2 h-3 w-3" />
                  {depositProof.name}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Upload deposit slip or bank receipt (Image or PDF)
            </p>
          </div>

          {/* Required Approvals Info */}
          {cashierAccount?.requires_dual_approval && (
            <Alert>
              <AlertDescription>
                This cashier account requires dual approval. Transfer will be submitted for approval
                after creation.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting || hasInsufficientFunds}>
          {isSubmitting ? 'Processing...' : 'Create & Submit Transfer'}
        </Button>
      </div>
    </form>
  );
};
