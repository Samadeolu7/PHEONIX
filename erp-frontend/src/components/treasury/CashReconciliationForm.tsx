/**
 * Cash Reconciliation Form Component
 * Step 3 of Cash Process - Daily reconciliation with denomination breakdown
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, PlusIcon, MinusIcon, CheckCircle2Icon, AlertCircleIcon } from 'lucide-react';
import {
  useCreateCashReconciliation,
  useUpdateCashReconciliation,
  useFinanceOfficerSignoff,
  useCashierAccount,
  useTodayCollectionsByCashier,
} from '../../hooks/useTreasury';
import { CreateCashReconciliationRequest, CashReconciliation } from '../../types/treasury';
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

// Common denominations (can be customized per currency)
const DENOMINATIONS = [
  '1000',
  '500',
  '200',
  '100',
  '50',
  '20',
  '10',
  '5',
  '1',
  '0.50',
  '0.25',
  '0.10',
  '0.05',
];

const reconciliationSchema = z.object({
  cashier_account: z.number(),
  reconciliation_date: z.string().optional(),
  physical_count: z.string().min(1, 'Physical count is required'),
  variance_explanation: z.string().optional(),
  deposit_slip_number: z.string().optional(),
});

type FormData = z.infer<typeof reconciliationSchema>;

interface CashReconciliationFormProps {
  cashierAccountId: number;
  reconciliation?: CashReconciliation;
  onSuccess?: () => void;
  onCancel?: () => void;
  showFinanceSignoff?: boolean;
}

export const CashReconciliationForm: React.FC<CashReconciliationFormProps> = ({
  cashierAccountId,
  reconciliation,
  onSuccess,
  onCancel,
  showFinanceSignoff = false,
}) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(
    reconciliation?.reconciliation_date ? new Date(reconciliation.reconciliation_date) : new Date()
  );
  const [denominationCounts, setDenominationCounts] = useState<{ [key: string]: number }>(
    reconciliation?.denomination_details || {}
  );
  const [signoffNotes, setSignoffNotes] = useState('');

  const { data: cashierAccount } = useCashierAccount(cashierAccountId);
  const { data: todayCollections = [] } = useTodayCollectionsByCashier(cashierAccountId);

  const createMutation = useCreateCashReconciliation();
  const updateMutation = useUpdateCashReconciliation();
  const signoffMutation = useFinanceOfficerSignoff();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<FormData>({
    resolver: zodResolver(reconciliationSchema),
    defaultValues: reconciliation
      ? {
          cashier_account: reconciliation.cashier_account,
          physical_count: reconciliation.physical_count,
          variance_explanation: reconciliation.variance_explanation || '',
          deposit_slip_number: reconciliation.deposit_slip_number || '',
        }
      : {
          cashier_account: cashierAccountId,
        },
  });

  // Calculate physical count from denominations
  const calculatePhysicalCount = () => {
    return Object.entries(denominationCounts).reduce((sum, [denom, count]) => {
      return sum + parseFloat(denom) * count;
    }, 0);
  };

  // Update physical count when denominations change
  useEffect(() => {
    const total = calculatePhysicalCount();
    setValue('physical_count', total.toFixed(2));
  }, [denominationCounts, setValue]);

  const physicalCount = parseFloat(watch('physical_count') || '0');
  const systemBalance = parseFloat(cashierAccount?.current_balance || '0');
  const variance = physicalCount - systemBalance;

  const handleDenominationChange = (denom: string, count: number) => {
    setDenominationCounts(prev => ({
      ...prev,
      [denom]: Math.max(0, count),
    }));
  };

  const onSubmit = async (data: FormData) => {
    const payload: CreateCashReconciliationRequest = {
      ...data,
      reconciliation_date: format(date, 'yyyy-MM-dd'),
      denomination_details: denominationCounts,
    };

    if (reconciliation) {
      await updateMutation.mutateAsync({
        id: reconciliation.id,
        data: payload,
      });
    } else {
      await createMutation.mutateAsync(payload);
    }

    onSuccess?.();
  };

  const handleFinanceSignoff = async () => {
    if (!reconciliation) return;

    await signoffMutation.mutateAsync({
      id: reconciliation.id,
      data: { finance_officer_notes: signoffNotes },
    });

    onSuccess?.();
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isSigningOff = signoffMutation.isPending;

  // Calculate today's statistics
  const todayCollectionsTotal = todayCollections.reduce(
    (sum, col) => sum + parseFloat(col.amount_collected),
    0
  );

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle>Cash Reconciliation</CardTitle>
          <CardDescription>
            Daily reconciliation for {cashierAccount?.name} on {format(date, 'PPP')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm text-muted-foreground">System Balance</Label>
              <div className="text-2xl font-bold">{systemBalance.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Physical Count</Label>
              <div className="text-2xl font-bold">{physicalCount.toFixed(2)}</div>
            </div>
            <div>
              <Label className="text-sm text-muted-foreground">Variance</Label>
              <div
                className={cn(
                  'text-2xl font-bold',
                  variance === 0
                    ? 'text-green-600'
                    : variance > 0
                      ? 'text-blue-600'
                      : 'text-red-600'
                )}
              >
                {variance.toFixed(2)}
                {variance === 0 && (
                  <CheckCircle2Icon className="inline ml-2 h-5 w-5 text-green-600" />
                )}
                {variance !== 0 && <AlertCircleIcon className="inline ml-2 h-5 w-5" />}
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground">Today's Collections</Label>
              <div className="font-medium">{todayCollections.length} receipts</div>
            </div>
            <div>
              <Label className="text-muted-foreground">Total Amount Collected</Label>
              <div className="font-medium">{todayCollectionsTotal.toFixed(2)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Finance Officer Sign-off (if applicable) */}
      {showFinanceSignoff && reconciliation && !reconciliation.finance_officer_signoff && (
        <Card className="border-yellow-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircleIcon className="h-5 w-5 text-yellow-600" />
              Finance Officer Sign-off Required
            </CardTitle>
            <CardDescription>
              Review and verify the reconciliation before signing off
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Sign-off Notes</Label>
              <Textarea
                value={signoffNotes}
                onChange={e => setSignoffNotes(e.target.value)}
                placeholder="Verification notes (optional)"
                rows={3}
              />
            </div>
            <Button onClick={handleFinanceSignoff} disabled={isSigningOff} className="w-full">
              {isSigningOff ? 'Signing off...' : 'Complete Finance Officer Sign-off'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Reconciliation Form */}
      {!showFinanceSignoff && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Date Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Reconciliation Date</CardTitle>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Denomination Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Cash Count by Denomination</CardTitle>
              <CardDescription>
                Count physical cash by denomination. Total will calculate automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DENOMINATIONS.map(denom => {
                  const count = denominationCounts[denom] || 0;
                  const subtotal = parseFloat(denom) * count;

                  return (
                    <div key={denom} className="flex items-center gap-4">
                      <div className="w-20">
                        <Badge variant="outline">{denom}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleDenominationChange(denom, count - 1)}
                        >
                          <MinusIcon className="h-4 w-4" />
                        </Button>
                        <Input
                          type="number"
                          value={count}
                          onChange={e =>
                            handleDenominationChange(denom, parseInt(e.target.value) || 0)
                          }
                          className="w-24 text-center"
                          min="0"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleDenominationChange(denom, count + 1)}
                        >
                          <PlusIcon className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex-1 text-right font-medium">= {subtotal.toFixed(2)}</div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Variance Handling */}
          {variance !== 0 && (
            <Card className={cn(variance < 0 ? 'border-red-500' : 'border-blue-500')}>
              <CardHeader>
                <CardTitle>
                  {variance > 0 ? 'Cash Over' : 'Cash Short'}: {Math.abs(variance).toFixed(2)}
                </CardTitle>
                <CardDescription>
                  Please explain the variance between system and physical count
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="variance_explanation">
                    Variance Explanation <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="variance_explanation"
                    {...register('variance_explanation')}
                    placeholder="Explain the reason for the variance..."
                    rows={3}
                  />
                  {errors.variance_explanation && (
                    <p className="text-sm text-red-500">{errors.variance_explanation.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Deposit Information */}
          <Card>
            <CardHeader>
              <CardTitle>Bank Deposit Information</CardTitle>
              <CardDescription>
                Enter deposit slip number if cash has been deposited to bank
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="deposit_slip_number">Deposit Slip Number (Optional)</Label>
                <Input
                  id="deposit_slip_number"
                  {...register('deposit_slip_number')}
                  placeholder="Bank deposit slip number"
                />
              </div>
            </CardContent>
          </Card>

          {/* User Attribution */}
          {user && (
            <Alert>
              <AlertDescription>
                Reconciliation will be performed by: <strong>{user.email}</strong>
              </AlertDescription>
            </Alert>
          )}

          {/* Form Actions */}
          <div className="flex justify-end gap-4">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : reconciliation
                  ? 'Update Reconciliation'
                  : 'Create Reconciliation'}
            </Button>
          </div>
        </form>
      )}

      {/* Display Existing Reconciliation Details */}
      {reconciliation && showFinanceSignoff && (
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <Label className="text-muted-foreground">Prepared By</Label>
                <div className="font-medium">{reconciliation.reconciled_by_name || 'N/A'}</div>
              </div>
              <div>
                <Label className="text-muted-foreground">Status</Label>
                <Badge
                  variant={
                    reconciliation.status === 'balanced'
                      ? 'default'
                      : reconciliation.status === 'resolved'
                        ? 'default'
                        : 'destructive'
                  }
                >
                  {reconciliation.status}
                </Badge>
              </div>
            </div>

            {reconciliation.variance_explanation && (
              <div>
                <Label className="text-muted-foreground">Variance Explanation</Label>
                <p className="mt-1">{reconciliation.variance_explanation}</p>
              </div>
            )}

            {reconciliation.deposit_slip_number && (
              <div>
                <Label className="text-muted-foreground">Deposit Slip Number</Label>
                <div className="font-medium">{reconciliation.deposit_slip_number}</div>
              </div>
            )}

            {reconciliation.finance_officer_signoff && (
              <Alert>
                <CheckCircle2Icon className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  <strong>Signed off by:</strong> {reconciliation.finance_officer_signoff_name}
                  <br />
                  <strong>Date:</strong>{' '}
                  {reconciliation.finance_officer_signoff_at &&
                    format(new Date(reconciliation.finance_officer_signoff_at), 'PPP p')}
                  {reconciliation.finance_officer_notes && (
                    <>
                      <br />
                      <strong>Notes:</strong> {reconciliation.finance_officer_notes}
                    </>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
