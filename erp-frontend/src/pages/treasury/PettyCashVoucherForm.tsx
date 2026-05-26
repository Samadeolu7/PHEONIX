/**
 * Petty Cash Voucher Form Page
 * Create and edit petty cash voucher requests with multi-row expense line items
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  FileTextIcon,
  SaveIcon,
  XIcon,
  SendIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  WalletIcon,
  PlusIcon,
  Trash2Icon,
  TagIcon,
} from 'lucide-react';
import {
  useCreatePettyCashVoucher,
  useUpdatePettyCashVoucher,
  usePettyCashVoucher,
  useSubmitVoucher,
  useDefaultPettyCashFund,
} from '../../hooks/usePettyCash';
import { useExpenseCategories, useCreateExpenseCategory } from '../../hooks/useExpenseCategories';
import { useExpenseAccounts } from '../../hooks/useAccountsSimple';
import { CreatePettyCashVoucher } from '../../types/pettyCash';

// ─── Line item types & helpers ────────────────────────────────────────────────

interface LineItem {
  id: string;
  category: string; // expense category id as string
  description: string;
  amount: string;
}

const generateId = () => Math.random().toString(36).slice(2, 9);

const emptyLineItem = (): LineItem => ({
  id: generateId(),
  category: '',
  description: '',
  amount: '',
});

// ─── Create Category Modal ────────────────────────────────────────────────────
interface CreateCategoryModalProps {
  onClose: () => void;
  onConfirm: () => void;
  data: {
    name: string;
    code: string;
    description: string;
    expense_account: number | undefined;
    requires_approval: boolean;
  };
  onChange: (data: any) => void;
  error: string | null;
  expenseAccounts: any[];
  isPending: boolean;
}

const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  onClose,
  onConfirm,
  data,
  onChange,
  error,
  expenseAccounts,
  isPending,
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Create Expense Category</h3>
        <button
          type="button"
          onClick={onClose}
          title="Close"
          className="text-gray-400 hover:text-gray-600"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-2">
          <AlertTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.name}
            onChange={e => onChange({ ...data, name: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g., Office Supplies"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category Code <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.code}
            onChange={e => onChange({ ...data, code: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="e.g., EXP-OFFICE"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Expense Account <span className="text-red-500">*</span>
          </label>
          <select
            title="Expense account"
            value={data.expense_account ?? ''}
            onChange={e =>
              onChange({ ...data, expense_account: Number(e.target.value) || undefined })
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="">Select expense account…</option>
            {(expenseAccounts ?? []).map((acc: any) => (
              <option key={acc.id} value={acc.id}>
                {acc.code} – {acc.name}
              </option>
            ))}
          </select>
          {(!expenseAccounts || expenseAccounts.length === 0) && (
            <p className="mt-1 text-xs text-amber-600">
              No expense accounts found. Set up your chart of accounts first.
            </p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description <span className="text-gray-400 text-xs">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={data.description}
            onChange={e => onChange({ ...data, description: e.target.value })}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
            placeholder="Optional description…"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="cat_requires_approval"
            checked={data.requires_approval}
            onChange={e => onChange({ ...data, requires_approval: e.target.checked })}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="cat_requires_approval" className="text-sm text-gray-700">
            Requires approval before posting
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <SaveIcon className="h-4 w-4" />
          {isPending ? 'Creating…' : 'Create Category'}
        </button>
      </div>
    </div>
  </div>
);

export const PettyCashVoucherForm: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;

  // ── Header state (applies to the whole voucher)
  const [fundId, setFundId] = useState(0);
  const [payeeName, setPayeeName] = useState('');
  const [requestDate, setRequestDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // ── Line items (one row per expense)
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLineItem()]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // ── Remote data
  const { data: existingVoucher, isLoading: loadingVoucher } = usePettyCashVoucher(
    parseInt(id || '0'),
    isEditMode
  );
  const { data: defaultFund, isLoading: loadingFund, error: fundError } = useDefaultPettyCashFund();
  const funds = defaultFund ? [defaultFund] : [];

  // Expense categories
  const { data: categoriesResponse, refetch: refetchCategories } = useExpenseCategories();
  const expenseCategories: any[] = Array.isArray(categoriesResponse)
    ? categoriesResponse
    : ((categoriesResponse as any)?.results ?? []);
  const createCategoryMutation = useCreateExpenseCategory();
  const { data: expenseAccountsData } = useExpenseAccounts();

  // ── Category creation modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    code: '',
    description: '',
    expense_account: undefined as number | undefined,
    requires_approval: false,
  });

  // ── Mutations
  const createMutation = useCreatePettyCashVoucher();
  const updateMutation = useUpdatePettyCashVoucher();
  const submitMutation = useSubmitVoucher();

  // ── Populate from existing voucher (edit mode)
  useEffect(() => {
    if (existingVoucher && isEditMode) {
      setPayeeName(existingVoucher.payee_name);
      setRequestDate(existingVoucher.voucher_date ?? format(new Date(), 'yyyy-MM-dd'));
      setFundId(existingVoucher.fund);
      setLineItems([
        {
          id: generateId(),
          category: existingVoucher.expense_category?.toString() ?? '',
          description: existingVoucher.purpose ?? '',
          amount: existingVoucher.amount,
        },
      ]);
    }
  }, [existingVoucher, isEditMode]);

  // ── Auto-set fund from default
  useEffect(() => {
    if (funds.length > 0 && !fundId) {
      setFundId(funds[0].id);
    }
  }, [funds]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values
  const totalAmount = lineItems.reduce((sum, item) => sum + parseFloat(item.amount || '0'), 0);
  const availableBalance = funds.length > 0 ? parseFloat(funds[0].current_balance) : Infinity;
  const overBudget = totalAmount > 0 && totalAmount > availableBalance;

  // ── Line item CRUD helpers
  const addLineItem = () => setLineItems(prev => [...prev, emptyLineItem()]);

  const removeLineItem = (itemId: string) => {
    if (lineItems.length === 1) return; // always keep at least one row
    setLineItems(prev => prev.filter(item => item.id !== itemId));
  };

  const updateLineItem = (itemId: string, field: keyof LineItem, value: string) => {
    setLineItems(prev =>
      prev.map(item => (item.id === itemId ? { ...item, [field]: value } : item))
    );
    if (errors[`line_${itemId}`]) {
      setErrors(prev => {
        const e = { ...prev };
        delete e[`line_${itemId}`];
        return e;
      });
    }
  };

  const resetCategoryModal = () => {
    setShowCategoryModal(false);
    setPendingRowId(null);
    setCategoryError(null);
    setNewCategoryData({
      name: '',
      code: '',
      description: '',
      expense_account: undefined,
      requires_approval: false,
    });
  };

  const openCategoryModal = (rowId?: string) => {
    setPendingRowId(rowId ?? null);
    setCategoryError(null);
    setShowCategoryModal(true);
  };

  const handleCreateCategory = async () => {
    setCategoryError(null);
    if (!newCategoryData.name.trim()) {
      setCategoryError('Category name is required');
      return;
    }
    if (!newCategoryData.code.trim()) {
      setCategoryError('Category code is required');
      return;
    }
    if (!newCategoryData.expense_account) {
      setCategoryError('Expense account is required');
      return;
    }
    try {
      const created = await createCategoryMutation.mutateAsync({
        name: newCategoryData.name,
        code: newCategoryData.code,
        description: newCategoryData.description,
        expense_account: newCategoryData.expense_account,
        requires_approval: newCategoryData.requires_approval,
      });
      await refetchCategories();
      // Auto-select in the row that triggered the modal (if any)
      if (pendingRowId) {
        updateLineItem(pendingRowId, 'category', created.id.toString());
      }
      resetCategoryModal();
    } catch (err: any) {
      setCategoryError(
        err.response?.data?.name?.[0] ??
          err.response?.data?.code?.[0] ??
          err.response?.data?.expense_account?.[0] ??
          err.response?.data?.detail ??
          err.response?.data?.message ??
          'Failed to create category'
      );
    }
  };

  const getCategoryLabel = (catId: string): string => {
    const cat = (expenseCategories as any[]).find((c: any) => c.id.toString() === catId);
    return cat?.name ?? `Category ${catId}`;
  };

  // ── Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!payeeName.trim()) newErrors.payee_name = 'Payee name is required';
    if (!requestDate) newErrors.request_date = 'Request date is required';

    if (lineItems.length === 0) {
      newErrors.line_items = 'Add at least one expense line item';
    } else {
      lineItems.forEach(item => {
        if (!item.category) {
          newErrors[`line_${item.id}`] = 'Select a category';
        } else if (!item.amount || parseFloat(item.amount) <= 0) {
          newErrors[`line_${item.id}`] = 'Enter a valid amount';
        } else if (!item.description.trim()) {
          newErrors[`line_${item.id}`] = 'Description is required';
        }
      });
    }

    if (totalAmount <= 0) {
      newErrors.total = 'Total amount must be greater than 0';
    } else if (overBudget) {
      newErrors.total = `Total (₦${totalAmount.toLocaleString()}) exceeds available balance (₦${availableBalance.toLocaleString()})`;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Build single-voucher payload by aggregating all line items
  const buildPayload = (): CreatePettyCashVoucher => {
    const combinedPurpose = lineItems
      .map((item, i) => `${i + 1}. [${getCategoryLabel(item.category)}] ${item.description}`)
      .join('\n');
    return {
      fund: fundId,
      expense_category: parseInt(lineItems[0]?.category || '0') || null,
      amount: totalAmount.toFixed(2),
      purpose: combinedPurpose,
      payee_name: payeeName,
      voucher_date: requestDate,
    };
  };

  const handleSaveDraft = async () => {
    if (!payeeName || lineItems.every(l => !l.amount)) {
      setErrors({
        general: 'Payee name and at least one line item amount are required to save a draft',
      });
      return;
    }
    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (isEditMode) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      navigate('/treasury/petty-cash');
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Failed to save voucher' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      let voucherId: number;
      const payload = buildPayload();

      if (isEditMode) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: payload });
        voucherId = parseInt(id!);
      } else {
        const result = await createMutation.mutateAsync(payload);
        voucherId = result.id;
      }

      await submitMutation.mutateAsync(voucherId);
      navigate('/treasury/petty-cash');
    } catch (error: any) {
      setErrors({ general: error.response?.data?.message || 'Failed to submit voucher' });
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading skeleton
  if (isEditMode && loadingVoucher) {
    return (
      <div className="p-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Non-editable status guard
  if (isEditMode && existingVoucher && existingVoucher.status !== 'draft') {
    return (
      <div className="p-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-900">Cannot Edit Voucher</h3>
              <p className="text-sm text-yellow-700 mt-1">
                This voucher is in <strong>{existingVoucher.status}</strong> status and cannot be
                edited.
              </p>
              <button
                onClick={() => navigate('/treasury/petty-cash')}
                className="mt-4 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileTextIcon className="h-8 w-8" />
          {isEditMode ? 'Edit Petty Cash Voucher' : 'New Petty Cash Voucher'}
        </h1>
        <p className="text-gray-600 mt-1">
          {isEditMode
            ? 'Update voucher details'
            : 'Add one or more expense line items — the total will be requested from petty cash'}
        </p>
      </div>

      {/* General error */}
      {errors.general && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Error</h3>
              <p className="text-sm text-red-700 mt-1">{errors.general}</p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Voucher header card ── */}
        <div className="bg-white rounded-lg shadow p-6 space-y-5">
          {/* Fund info panel — always shown, auto-selected */}
          {loadingFund ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-500">Loading petty cash fund…</p>
            </div>
          ) : fundError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                Petty cash GL account not set up. Contact your administrator.
              </p>
            </div>
          ) : funds.length > 0 ? (
            <div
              className={`rounded-lg border px-4 py-3 flex items-center gap-3 ${
                overBudget ? 'border-red-300 bg-red-50' : 'border-blue-200 bg-blue-50'
              }`}
            >
              <WalletIcon
                className={`h-5 w-5 flex-shrink-0 ${overBudget ? 'text-red-600' : 'text-blue-600'}`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-800">{funds[0].fund_name}</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Available balance: ₦{availableBalance.toLocaleString()}
                </p>
              </div>
              {totalAmount > 0 && (
                <div className="text-right">
                  <p className="text-xs text-gray-500">This request</p>
                  <p
                    className={`text-sm font-bold ${overBudget ? 'text-red-700' : 'text-blue-800'}`}
                  >
                    ₦
                    {totalAmount.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  {overBudget && <p className="text-xs text-red-600 mt-0.5">Exceeds balance</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-700">
                No active petty cash fund found. Contact your administrator.
              </p>
            </div>
          )}

          {/* Request date + Payee name — side by side */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Request Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                title="Request Date"
                value={requestDate}
                onChange={e => setRequestDate(e.target.value)}
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.request_date ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.request_date && (
                <p className="text-red-500 text-sm mt-1">{errors.request_date}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Payee Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={payeeName}
                onChange={e => setPayeeName(e.target.value)}
                placeholder="Person / company receiving payment"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.payee_name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.payee_name && (
                <p className="text-red-500 text-sm mt-1">{errors.payee_name}</p>
              )}
            </div>
          </div>
        </div>

        {/* ── Expense line items table ── */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Expense Line Items</h2>
          {errors.line_items && <p className="text-red-500 text-sm mb-3">{errors.line_items}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-600 text-left">
                  <th className="px-3 py-2.5 w-8 font-medium border-b border-gray-200">#</th>
                  <th className="px-3 py-2.5 w-52 font-medium border-b border-gray-200">
                    <span className="flex items-center gap-2">
                      <span>
                        Category <span className="text-red-500">*</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openCategoryModal()}
                        title="Create a new expense category"
                        className="flex items-center gap-1 text-xs font-normal text-blue-600 hover:text-blue-800 border border-blue-300 rounded px-1.5 py-0.5 hover:bg-blue-50 transition-colors"
                      >
                        <PlusIcon className="h-3 w-3" />
                        New
                      </button>
                    </span>
                  </th>
                  <th className="px-3 py-2.5 font-medium border-b border-gray-200">
                    Description <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2.5 w-40 text-right font-medium border-b border-gray-200">
                    Amount (₦) <span className="text-red-500">*</span>
                  </th>
                  <th className="px-3 py-2.5 w-10 border-b border-gray-200"></th>
                </tr>
              </thead>

              <tbody>
                {lineItems.map((item, index) => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 transition-colors ${
                      errors[`line_${item.id}`] ? 'bg-red-50' : 'hover:bg-gray-50'
                    }`}
                  >
                    {/* Row number */}
                    <td className="px-3 py-2 text-center text-gray-400 font-mono text-xs">
                      {index + 1}
                    </td>

                    {/* Category */}
                    <td className="px-3 py-2">
                      {expenseCategories.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => openCategoryModal(item.id)}
                          className="w-full px-2 py-1.5 border border-dashed border-blue-400 rounded-md text-sm text-blue-600 hover:bg-blue-50 flex items-center gap-1.5 transition-colors"
                        >
                          <TagIcon className="h-3.5 w-3.5" />
                          No categories — click to create one
                        </button>
                      ) : (
                        <select
                          title={`Expense category for row ${index + 1}`}
                          value={item.category}
                          onChange={e => updateLineItem(item.id, 'category', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Select category…</option>
                          {expenseCategories.map((cat: any) => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Description */}
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={e => updateLineItem(item.id, 'description', e.target.value)}
                        placeholder="Brief description of this expense…"
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      {errors[`line_${item.id}`] && (
                        <p className="text-red-500 text-xs mt-1">{errors[`line_${item.id}`]}</p>
                      )}
                    </td>

                    {/* Amount */}
                    <td className="px-3 py-2">
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none pointer-events-none">
                          ₦
                        </span>
                        <input
                          type="number"
                          value={item.amount}
                          onChange={e => updateLineItem(item.id, 'amount', e.target.value)}
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          title={`Amount for row ${index + 1}`}
                          className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </td>

                    {/* Delete row */}
                    <td className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => removeLineItem(item.id)}
                        disabled={lineItems.length === 1}
                        title="Remove this line"
                        className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2Icon className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Footer: Add row button + running total */}
              <tfoot>
                <tr className="bg-gray-50">
                  <td colSpan={3} className="px-3 py-3">
                    <button
                      type="button"
                      onClick={addLineItem}
                      className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium transition-colors"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Add Line Item
                    </button>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="text-xs text-gray-400 uppercase tracking-wide mb-0.5">Total</p>
                    <p
                      className={`text-xl font-bold ${
                        overBudget ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      ₦
                      {totalAmount.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Over-budget / total error */}
          {errors.total && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600">
              <AlertCircleIcon className="h-4 w-4 flex-shrink-0" />
              {errors.total}
            </div>
          )}
        </div>

        {/* ── Actions ── */}
        <div className="flex justify-end gap-3 bg-white rounded-lg shadow p-6">
          <button
            type="button"
            onClick={() => navigate('/treasury/petty-cash')}
            disabled={submitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <XIcon className="h-4 w-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={submitting}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
          >
            <SaveIcon className="h-4 w-4" />
            Save Draft
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
          >
            <SendIcon className="h-4 w-4" />
            {submitting ? 'Submitting…' : 'Submit for Approval'}
          </button>
        </div>
      </form>

      {/* ── Create Category Modal ── */}
      {showCategoryModal && (
        <CreateCategoryModal
          onClose={resetCategoryModal}
          onConfirm={handleCreateCategory}
          data={newCategoryData}
          onChange={setNewCategoryData}
          error={categoryError}
          expenseAccounts={expenseAccountsData ?? []}
          isPending={createCategoryMutation.isPending}
        />
      )}
    </div>
  );
};
