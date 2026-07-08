/**
 * Bank Reconciliation Page
 * Step 4 of Cash Process - Monthly bank reconciliation with statement vs book balance comparison
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, PlusIcon, CheckCircle2Icon, FileTextIcon } from 'lucide-react';
import {
  useBankReconciliations,
  useCreateBankReconciliation,
  useUpdateBankReconciliation,
  useSubmitBankReconciliationForReview,
  useApproveBankReconciliation,
  useDeleteBankReconciliation,
} from '../../hooks/useTreasury';
import { CreateBankReconciliationRequest, BankReconciliation } from '../../types/treasury';
import { useAuth } from '../../contexts/AuthContext';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Input } from '@/components/ui/Input';
import { Calendar } from '@/components/ui/Calendar';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/Popover';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/Table';

import Textarea from '@/components/ui/Textarea';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '../../components/ui/Separator';

import { cn } from '../../lib/utils';

const bankReconciliationSchema = z.object({
  bank_account: z.number({
    required_error: 'Please select a bank account',
  }),
  bank_opening_balance: z.string().min(1, 'Bank opening balance is required'),
  gl_opening_balance: z.string().min(1, 'GL opening balance is required'),
  bank_closing_balance: z.string().min(1, 'Bank closing balance is required'),
  gl_closing_balance: z.string().min(1, 'GL closing balance is required'),
  deposits_in_transit: z.string().optional(),
  outstanding_checks: z.string().optional(),
  bank_charges: z.string().optional(),
  bank_interest: z.string().optional(),
  bank_errors: z.string().optional(),
  gl_errors: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof bankReconciliationSchema>;

export const BankReconciliationPage: React.FC = () => {
  const { user } = useAuth();
  const { canUserApprove } = useApprovalGuard();
  const [periodStart, setPeriodStart] = useState<Date | undefined>();
  const [periodEnd, setPeriodEnd] = useState<Date | undefined>();
  const [selectedReconciliation, setSelectedReconciliation] = useState<BankReconciliation | null>(
    null
  );
  const [isFormVisible, setIsFormVisible] = useState(false);

  const { data: reconciliations = [], isLoading } = useBankReconciliations();
  const createMutation = useCreateBankReconciliation();
  const updateMutation = useUpdateBankReconciliation();
  const submitMutation = useSubmitBankReconciliationForReview();
  const approveMutation = useApproveBankReconciliation();
  const deleteMutation = useDeleteBankReconciliation();

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(bankReconciliationSchema),
  });

  // Watch all balance fields for calculation
  const bankOpeningBalance = parseFloat(watch('bank_opening_balance') || '0');
  const glOpeningBalance = parseFloat(watch('gl_opening_balance') || '0');
  const bankClosingBalance = parseFloat(watch('bank_closing_balance') || '0');
  const glClosingBalance = parseFloat(watch('gl_closing_balance') || '0');
  const depositsInTransit = parseFloat(watch('deposits_in_transit') || '0');
  const outstandingChecks = parseFloat(watch('outstanding_checks') || '0');
  const bankCharges = parseFloat(watch('bank_charges') || '0');
  const bankInterest = parseFloat(watch('bank_interest') || '0');
  const bankErrors = parseFloat(watch('bank_errors') || '0');
  const glErrors = parseFloat(watch('gl_errors') || '0');

  // Calculate reconciled balance
  // Formula: Bank Balance + Deposits in Transit - Outstanding Checks + Bank Interest - Bank Charges + Bank Errors
  const reconciledBalance =
    bankClosingBalance +
    depositsInTransit -
    outstandingChecks +
    bankInterest -
    bankCharges +
    bankErrors;

  // Calculate variance
  const variance = reconciledBalance - (glClosingBalance + glErrors);

  const onSubmit = async (data: FormData) => {
    if (!periodStart || !periodEnd) {
      alert('Please select reconciliation period');
      return;
    }

    const payload: CreateBankReconciliationRequest = {
      ...data,
      reconciliation_period_start: format(periodStart, 'yyyy-MM-dd'),
      reconciliation_period_end: format(periodEnd, 'yyyy-MM-dd'),
      deposits_in_transit: data.deposits_in_transit || '0',
      outstanding_checks: data.outstanding_checks || '0',
      bank_charges: data.bank_charges || '0',
      bank_interest: data.bank_interest || '0',
      bank_errors: data.bank_errors || '0',
      gl_errors: data.gl_errors || '0',
    };

    if (selectedReconciliation) {
      await updateMutation.mutateAsync({
        id: selectedReconciliation.id,
        data: payload,
      });
    } else {
      await createMutation.mutateAsync(payload);
    }

    reset();
    setPeriodStart(undefined);
    setPeriodEnd(undefined);
    setSelectedReconciliation(null);
    setIsFormVisible(false);
  };

  const handleEdit = (reconciliation: BankReconciliation) => {
    setSelectedReconciliation(reconciliation);
    setPeriodStart(new Date(reconciliation.reconciliation_period_start));
    setPeriodEnd(new Date(reconciliation.reconciliation_period_end));

    setValue('bank_account', reconciliation.bank_account);
    setValue('bank_opening_balance', reconciliation.bank_opening_balance);
    setValue('gl_opening_balance', reconciliation.gl_opening_balance);
    setValue('bank_closing_balance', reconciliation.bank_closing_balance);
    setValue('gl_closing_balance', reconciliation.gl_closing_balance);
    setValue('deposits_in_transit', reconciliation.deposits_in_transit);
    setValue('outstanding_checks', reconciliation.outstanding_checks);
    setValue('bank_charges', reconciliation.bank_charges);
    setValue('bank_interest', reconciliation.bank_interest);
    setValue('bank_errors', reconciliation.bank_errors);
    setValue('gl_errors', reconciliation.gl_errors);
    setValue('notes', reconciliation.notes || '');

    setIsFormVisible(true);
  };

  const handleSubmitForReview = async (id: number) => {
    await submitMutation.mutateAsync(id);
  };

  const handleApprove = async (id: number) => {
    if (confirm('Are you sure you want to approve this reconciliation?')) {
      await approveMutation.mutateAsync(id);
    }
  };

  const handleDelete = async (id: number) => {
    if (confirm('Are you sure you want to delete this reconciliation?')) {
      await deleteMutation.mutateAsync(id);
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Bank Reconciliations</h1>
          <p className="text-muted-foreground">
            Monthly reconciliation of bank statements with general ledger
          </p>
        </div>
        <Button onClick={() => setIsFormVisible(!isFormVisible)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          {isFormVisible ? 'Hide Form' : 'New Reconciliation'}
        </Button>
      </div>

      {/* New/Edit Reconciliation Form */}
      {isFormVisible && (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedReconciliation ? 'Edit Bank Reconciliation' : 'New Bank Reconciliation'}
              </CardTitle>
              <CardDescription>
                Match bank statement to general ledger for the selected period
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Reconciliation Period */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>
                    Period Start <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !periodStart && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodStart ? format(periodStart, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={periodStart}
                        onSelect={setPeriodStart}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="space-y-2">
                  <Label>
                    Period End <span className="text-red-500">*</span>
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !periodEnd && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {periodEnd ? format(periodEnd, 'PPP') : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={periodEnd}
                        onSelect={setPeriodEnd}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <Separator />

              {/* Opening Balances */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Opening Balances</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_opening_balance">
                      Bank Opening Balance <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bank_opening_balance"
                      type="text"
                      inputMode="decimal"
                      {...register('bank_opening_balance')}
                      placeholder="0.00"
                    />
                    {errors.bank_opening_balance && (
                      <p className="text-sm text-red-500">{errors.bank_opening_balance.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gl_opening_balance">
                      GL Opening Balance <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="gl_opening_balance"
                      type="text"
                      inputMode="decimal"
                      {...register('gl_opening_balance')}
                      placeholder="0.00"
                    />
                    {errors.gl_opening_balance && (
                      <p className="text-sm text-red-500">{errors.gl_opening_balance.message}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Closing Balances */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Closing Balances</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bank_closing_balance">
                      Bank Closing Balance <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="bank_closing_balance"
                      type="text"
                      inputMode="decimal"
                      {...register('bank_closing_balance')}
                      placeholder="0.00"
                    />
                    {errors.bank_closing_balance && (
                      <p className="text-sm text-red-500">{errors.bank_closing_balance.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gl_closing_balance">
                      GL Closing Balance <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="gl_closing_balance"
                      type="text"
                      inputMode="decimal"
                      {...register('gl_closing_balance')}
                      placeholder="0.00"
                    />
                    {errors.gl_closing_balance && (
                      <p className="text-sm text-red-500">{errors.gl_closing_balance.message}</p>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Reconciling Items */}
              <div>
                <h3 className="text-lg font-semibold mb-4">Reconciling Items</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="deposits_in_transit">Deposits in Transit</Label>
                    <Input
                      id="deposits_in_transit"
                      type="text"
                      inputMode="decimal"
                      {...register('deposits_in_transit')}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="outstanding_checks">Outstanding Checks</Label>
                    <Input
                      id="outstanding_checks"
                      type="text"
                      inputMode="decimal"
                      {...register('outstanding_checks')}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bank_charges">Bank Charges</Label>
                    <Input
                      id="bank_charges"
                      type="text"
                      inputMode="decimal"
                      {...register('bank_charges')}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bank_interest">Bank Interest</Label>
                    <Input
                      id="bank_interest"
                      type="text"
                      inputMode="decimal"
                      {...register('bank_interest')}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bank_errors">Bank Errors (+/-)</Label>
                    <Input
                      id="bank_errors"
                      type="text"
                      inputMode="decimal"
                      {...register('bank_errors')}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="gl_errors">GL Errors (+/-)</Label>
                    <Input
                      id="gl_errors"
                      type="text"
                      inputMode="decimal"
                      {...register('gl_errors')}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Reconciliation Summary */}
              <Card className={variance === 0 ? 'border-green-500' : 'border-yellow-500'}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {variance === 0 ? (
                      <CheckCircle2Icon className="h-5 w-5 text-green-600" />
                    ) : (
                      <FileTextIcon className="h-5 w-5 text-yellow-600" />
                    )}
                    Reconciliation Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span>Reconciled Balance:</span>
                    <span className="font-bold">{reconciledBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Adjusted GL Balance:</span>
                    <span className="font-bold">{(glClosingBalance + glErrors).toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Variance:</span>
                    <span
                      className={cn(
                        'text-2xl font-bold',
                        variance === 0 ? 'text-green-600' : 'text-yellow-600'
                      )}
                    >
                      {variance.toFixed(2)}
                      {variance === 0 && (
                        <CheckCircle2Icon className="inline ml-2 h-5 w-5 text-green-600" />
                      )}
                    </span>
                  </div>
                  {variance === 0 && (
                    <Alert>
                      <CheckCircle2Icon className="h-4 w-4" />
                      <AlertDescription>
                        Reconciliation is balanced! Ready to submit for review.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              {/* Notes */}
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  {...register('notes')}
                  placeholder="Additional reconciliation notes..."
                  rows={3}
                />
              </div>

              {/* User Attribution */}
              {user && (
                <Alert>
                  <AlertDescription>
                    Reconciliation prepared by: <strong>{user.email}</strong>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsFormVisible(false);
                setSelectedReconciliation(null);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? 'Saving...'
                : selectedReconciliation
                  ? 'Update Reconciliation'
                  : 'Create Reconciliation'}
            </Button>
          </div>
        </form>
      )}

      {/* Reconciliations List */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Reconciliations History</CardTitle>
          <CardDescription>All bank reconciliations ordered by date</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading...</div>
          ) : reconciliations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No bank reconciliations found. Create your first reconciliation above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Bank Account</TableHead>
                  <TableHead className="text-right">Bank Balance</TableHead>
                  <TableHead className="text-right">GL Balance</TableHead>
                  <TableHead className="text-right">Variance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliations.map(recon => (
                  <TableRow key={recon.id}>
                    <TableCell>
                      {format(new Date(recon.reconciliation_period_start), 'MMM d')} -{' '}
                      {format(new Date(recon.reconciliation_period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>{recon.bank_account_name}</TableCell>
                    <TableCell className="text-right">
                      {parseFloat(recon.bank_closing_balance).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      {parseFloat(recon.gl_closing_balance).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={
                          parseFloat(recon.variance) === 0
                            ? 'text-green-600 font-semibold'
                            : 'text-yellow-600 font-semibold'
                        }
                      >
                        {parseFloat(recon.variance).toFixed(2)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          recon.status === 'approved'
                            ? 'default'
                            : recon.status === 'completed'
                              ? 'default'
                              : 'outline'
                        }
                      >
                        {recon.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {recon.status === 'draft' && (
                          <>
                            <Button size="sm" variant="outline" onClick={() => handleEdit(recon)}>
                              Edit
                            </Button>
                            <Button size="sm" onClick={() => handleSubmitForReview(recon.id)}>
                              Submit
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleDelete(recon.id)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                        {canUserApprove && recon.status === 'in_progress' && (
                          <Button size="sm" onClick={() => handleApprove(recon.id)}>
                            Approve
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
