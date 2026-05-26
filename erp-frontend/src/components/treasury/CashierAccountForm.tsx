/**
 * Cashier Account Creation/Edit Form Component
 */

import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { cashierAccountService } from '../../services/treasuryService';
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
import UserSelect from '../ui/UserSelect';

const cashierAccountSchema = z.object({
  account_number: z.string().min(1, 'Account number is required'),
  name: z.string().min(1, 'Name is required'),
  cashier: z.number().optional(),
  daily_collection_limit: z.string().optional(),
  requires_dual_approval: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

type FormData = z.infer<typeof cashierAccountSchema>;

interface CashierAccountFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
}

export const CashierAccountForm: React.FC<CashierAccountFormProps> = ({ onSuccess, onCancel }) => {
  const [selectedCashier, setSelectedCashier] = React.useState<number | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<FormData>({
    resolver: zodResolver(cashierAccountSchema),
    defaultValues: {
      requires_dual_approval: false,
      is_active: true,
    },
  });

  const handleCashierChange = (userId: number | null) => {
    setSelectedCashier(userId);
    if (userId !== null) {
      setValue('cashier', userId, { shouldValidate: true });
    }
  };

  const onSubmit = async (data: FormData) => {
    console.log('[CashierAccountForm] Submitting form data:', data);
    try {
      // Backend will auto-create the child bank account and auto-assign current user as cashier if not provided
      const payload: any = {
        account_number: data.account_number,
        name: data.name,
        daily_collection_limit: data.daily_collection_limit,
        requires_dual_approval: data.requires_dual_approval,
        is_active: data.is_active,
      };

      // Only include cashier if selected
      if (selectedCashier) {
        payload.cashier = selectedCashier;
      }

      await cashierAccountService.create(payload);

      onSuccess?.();
    } catch (error: any) {
      console.error('Error creating cashier account:', error);
      console.error('Error details:', error.details);
      console.error('Error response:', error.response);

      // Show detailed error message
      let errorMessage = 'Failed to create cashier account';
      if (error.details) {
        const errors = Object.entries(error.details)
          .map(
            ([field, messages]: [string, any]) =>
              `${field}: ${Array.isArray(messages) ? messages.join(', ') : messages}`
          )
          .join('\n');
        errorMessage += `:\n${errors}`;
      }
      alert(errorMessage);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <div className="px-6 py-6 space-y-5 max-h-[calc(90vh-220px)] overflow-y-auto">
        {/* Account Number */}
        <div className="space-y-2">
          <Label
            htmlFor="account_number"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Account Number <span className="text-red-500">*</span>
          </Label>
          <Input {...register('account_number')} placeholder="e.g., CASH-001" className="w-full" />
          {errors.account_number && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errors.account_number.message}
            </p>
          )}
        </div>

        {/* Name */}
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Cashier Account Name <span className="text-red-500">*</span>
          </Label>
          <Input {...register('name')} placeholder="e.g., Front Desk Cashier" className="w-full" />
          {errors.name && (
            <p className="text-sm text-red-600 dark:text-red-400">{errors.name.message}</p>
          )}
        </div>

        {/* Cashier (User Selector - optional, defaults to current user) */}
        <div className="space-y-2">
          <Label htmlFor="cashier" className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Assigned Cashier (Optional)
          </Label>
          <UserSelect
            value={selectedCashier}
            onChange={handleCashierChange}
            className="w-full"
            placeholder="Search and select a user (leave empty to auto-assign)"
            error={errors.cashier?.message}
          />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Leave empty to automatically assign this cashier account to yourself. Or search and
            select a specific user.
          </p>
        </div>

        {/* Daily Collection Limit */}
        <div className="space-y-2">
          <Label
            htmlFor="daily_collection_limit"
            className="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Daily Collection Limit (Optional)
          </Label>
          <Input
            type="number"
            step="0.01"
            {...register('daily_collection_limit')}
            placeholder="0.00"
            className="w-full"
          />
          {errors.daily_collection_limit && (
            <p className="text-sm text-red-600 dark:text-red-400">
              {errors.daily_collection_limit.message}
            </p>
          )}
        </div>

        {/* Requires Dual Approval */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="requires_dual_approval"
            {...register('requires_dual_approval')}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <Label
            htmlFor="requires_dual_approval"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            Requires Dual Approval
          </Label>
        </div>

        {/* Is Active */}
        <div className="flex items-center space-x-3">
          <input
            type="checkbox"
            id="is_active"
            {...register('is_active')}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            defaultChecked
          />
          <Label
            htmlFor="is_active"
            className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            Active
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 rounded-b-xl">
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Cashier Account'}
        </Button>
      </div>
    </form>
  );
};
