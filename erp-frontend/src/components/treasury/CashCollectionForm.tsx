/**
 * Cash Collection Form Component
 * Step 1 of Cash Process - Cashier issues receipt for payment received
 */

import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, DollarSignIcon, PrinterIcon } from 'lucide-react';
import {
  useCreateCashCollection,
  useUpdateCashCollection,
  useActiveCashierAccounts,
} from '../../hooks/useTreasury';
import { CreateCashCollectionRequest, CashCollection } from '../../types/treasury';
import { cashCollectionService } from '../../services/treasuryService';
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

const cashCollectionSchema = z.object({
  cashier_account: z.number({
    required_error: 'Please select a cashier account',
  }),
  client: z.number().optional(),
  collection_date: z.string().optional(),
  amount_due: z.string().min(1, 'Amount due is required'),
  amount_collected: z.string().min(1, 'Amount collected is required'),
  variance_action: z.enum(['none', 'savings', 'debt', 'waive', 'refund']).optional(),
  payment_purpose: z.string().min(1, 'Payment purpose is required'),
  reference_number: z.string().optional(),
  collection_mode: z.enum(['cash', 'mobile_money', 'bank_deposit', 'cheque']).optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof cashCollectionSchema>;

interface CashCollectionFormProps {
  collection?: CashCollection;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CashCollectionForm: React.FC<CashCollectionFormProps> = ({
  collection,
  onSuccess,
  onCancel,
}) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date | undefined>(
    collection?.collection_date ? new Date(collection.collection_date) : new Date()
  );

  const { data: cashierAccounts = [], isLoading: loadingCashiers } = useActiveCashierAccounts();
  const createMutation = useCreateCashCollection();
  const updateMutation = useUpdateCashCollection();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(cashCollectionSchema),
    defaultValues: collection
      ? {
          cashier_account: collection.cashier_account,
          client: collection.client,
          amount_due: collection.amount_due,
          amount_collected: collection.amount_collected,
          variance_action: collection.variance_action,
          payment_purpose: collection.payment_purpose,
          reference_number: collection.reference_number || '',
          collection_mode: collection.collection_mode,
          notes: collection.notes || '',
        }
      : {
          collection_mode: 'cash',
          variance_action: 'none',
        },
  });

  const amountDue = watch('amount_due');
  const amountCollected = watch('amount_collected');
  const varianceAction = watch('variance_action');

  // Calculate variance
  const calculateVariance = () => {
    if (!amountDue || !amountCollected) return 0;
    return parseFloat(amountCollected) - parseFloat(amountDue);
  };

  const variance = calculateVariance();

  const onSubmit = async (data: FormData) => {
    const payload: CreateCashCollectionRequest = {
      ...data,
      collection_date: date ? format(date, 'yyyy-MM-dd') : undefined,
    };

    if (collection) {
      await updateMutation.mutateAsync({
        id: collection.id,
        data: payload,
      });
    } else {
      await createMutation.mutateAsync(payload);
    }

    onSuccess?.();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{collection ? 'Edit Cash Collection' : 'New Cash Collection'}</CardTitle>
          <CardDescription>
            Record cash received from client. Receipt number will be generated automatically.
          </CardDescription>
          {user && (
            <Alert>
              <AlertDescription>
                Collection will be recorded by: <strong>{user.email}</strong>
              </AlertDescription>
            </Alert>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Cashier Account */}
          <div className="space-y-2">
            <Label htmlFor="cashier_account">
              Cashier Account <span className="text-red-500">*</span>
            </Label>
            <Select
              onValueChange={value => setValue('cashier_account', parseInt(value))}
              defaultValue={collection?.cashier_account.toString()}
              disabled={loadingCashiers}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select cashier account" />
              </SelectTrigger>
              <SelectContent>
                {cashierAccounts.map(account => (
                  <SelectItem key={account.id} value={account.id.toString()}>
                    {account.name} ({account.account_number}) - Balance:{' '}
                    {parseFloat(account.current_balance).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.cashier_account && (
              <p className="text-sm text-red-500">{errors.cashier_account.message}</p>
            )}
          </div>

          {/* Collection Date */}
          <div className="space-y-2">
            <Label>Collection Date</Label>
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
                <Calendar mode="single" selected={date} onSelect={setDate} initialFocus />
              </PopoverContent>
            </Popover>
          </div>

          {/* Payment Purpose */}
          <div className="space-y-2">
            <Label htmlFor="payment_purpose">
              Payment Purpose <span className="text-red-500">*</span>
            </Label>
            <Input
              id="payment_purpose"
              {...register('payment_purpose')}
              placeholder="e.g., Tuition Fee, Loan Payment, Product Purchase"
            />
            {errors.payment_purpose && (
              <p className="text-sm text-red-500">{errors.payment_purpose.message}</p>
            )}
          </div>

          {/* Reference Number */}
          <div className="space-y-2">
            <Label htmlFor="reference_number">Reference Number (Optional)</Label>
            <Input
              id="reference_number"
              {...register('reference_number')}
              placeholder="Invoice/Transaction reference"
            />
          </div>

          {/* Collection Mode */}
          <div className="space-y-2">
            <Label htmlFor="collection_mode">Collection Mode</Label>
            <Select
              onValueChange={value => setValue('collection_mode', value as any)}
              defaultValue={watch('collection_mode') || 'cash'}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select collection mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="mobile_money">Mobile Money</SelectItem>
                <SelectItem value="bank_deposit">Bank Deposit</SelectItem>
                <SelectItem value="cheque">Cheque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Amounts */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="amount_due">
                Amount Due <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <DollarSignIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount_due"
                  type="number"
                  step="0.01"
                  className="pl-10"
                  {...register('amount_due')}
                  placeholder="0.00"
                />
              </div>
              {errors.amount_due && (
                <p className="text-sm text-red-500">{errors.amount_due.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount_collected">
                Amount Collected <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <DollarSignIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="amount_collected"
                  type="number"
                  step="0.01"
                  className="pl-10"
                  {...register('amount_collected')}
                  placeholder="0.00"
                />
              </div>
              {errors.amount_collected && (
                <p className="text-sm text-red-500">{errors.amount_collected.message}</p>
              )}
            </div>
          </div>

          {/* Variance Display */}
          {amountDue && amountCollected && variance !== 0 && (
            <Alert variant={variance < 0 ? 'destructive' : 'default'}>
              <AlertDescription>
                <strong>
                  {variance > 0 ? 'Overpayment' : 'Underpayment'}: {Math.abs(variance).toFixed(2)}
                </strong>
                <div className="mt-2 space-y-2">
                  <Label htmlFor="variance_action">How to handle variance?</Label>
                  <Select
                    onValueChange={value => setValue('variance_action', value as any)}
                    defaultValue={varianceAction}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Action</SelectItem>
                      <SelectItem value="savings">Credit to Client Savings</SelectItem>
                      <SelectItem value="debt">Add to Client Debt</SelectItem>
                      <SelectItem value="waive">Waive Difference</SelectItem>
                      <SelectItem value="refund">Refund to Client</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              {...register('notes')}
              placeholder="Additional notes about this collection"
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Form Actions */}
      <div className="flex justify-end gap-4">
        {collection && (
          <Button
            type="button"
            variant="outline"
            title="Download Deposit Slip PDF"
            onClick={async () => {
              try {
                await cashCollectionService.downloadDepositSlip(collection.id);
              } catch (err) {
                console.error('Failed to download deposit slip:', err);
              }
            }}
          >
            <PrinterIcon className="h-4 w-4 mr-2" />
            Deposit Slip
          </Button>
        )}
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : collection ? 'Update Collection' : 'Create Collection'}
        </Button>
      </div>
    </form>
  );
};
