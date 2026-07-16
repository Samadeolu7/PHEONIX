import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useAllExpenseCategories } from '../../hooks/useExpenseCategories';
import { reconciliationService } from '../../services/reconciliationService';
import type { ReconciliationException } from '../../types/banks';

interface PostToExpenseModalProps {
  reconciliationId: number;
  exception: ReconciliationException;
  onClose: () => void;
  onSuccess: (updated: ReconciliationException) => void;
  onError: (message: string) => void;
}

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

/**
 * Creates a draft Expense + pending BankPayment from a bank-only DEBIT
 * exception (e.g. stamp duty, bank charges) — see
 * ResolveExceptionToExpenseView (banks/views.py). Amount/date come straight
 * from the bank line and aren't editable here, so the eventual auto-resolve
 * match lines up exactly with what the bank statement shows. This does NOT
 * resolve the exception — it resolves automatically once the payment is
 * approved and posted, and a later rerun matches it.
 */
export const PostToExpenseModal: React.FC<PostToExpenseModalProps> = ({
  reconciliationId,
  exception,
  onClose,
  onSuccess,
  onError,
}) => {
  const { data: categories, isLoading: categoriesLoading } = useAllExpenseCategories();
  const [categoryId, setCategoryId] = useState<string>('');
  const [payeeName, setPayeeName] = useState('');
  const [description, setDescription] = useState(exception.bank_narration || '');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryId) return;
    setSubmitting(true);
    try {
      const updated = await reconciliationService.resolveExceptionToExpense(
        reconciliationId,
        exception.id,
        {
          category: Number(categoryId),
          payee_name: payeeName || undefined,
          description: description || undefined,
        }
      );
      onSuccess(updated);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to post exception to expense');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">Post to Expense</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <p className="text-xs text-gray-500">
            Creates a draft expense and a pending payment for this bank charge. It still
            needs a director's approval before it posts and this exception resolves.
          </p>

          <div className="bg-gray-50 rounded-md p-3 text-sm">
            <p className="text-gray-900">{exception.bank_narration || '—'}</p>
            <p className="text-gray-500 mt-1">
              {formatAmount(exception.bank_amount)} on {exception.bank_date}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expense Category <span className="text-red-500">*</span>
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">
                {categoriesLoading ? 'Loading categories…' : 'Select a category'}
              </option>
              {categories?.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payee Name
            </label>
            <input
              type="text"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
              placeholder="Optional"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !categoryId}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Draft Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PostToExpenseModal;
