import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBankAccounts, useCreateBankPayment } from '../../hooks/useBanks';
import { useExpenseCategories } from '../../hooks/useExpenseCategories';
import { listAllPayables } from '../../services/liabilitiesService';
import { expenseService } from '../../services/expenseService';
import { supplierService } from '../../services/supplierService';
import type { AccountsPayableListItem } from '../../types/liabilities';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const fmtNGN = (value: string | number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    parseFloat(String(value || 0)) || 0
  );

const BankPaymentFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: bankAccounts = [] } = useBankAccounts({ is_active: true });
  const createPayment = useCreateBankPayment();

  // Expense categories - loaded once, used for direct expense payments
  const { data: categoriesData, isLoading: loadingCategories } = useExpenseCategories();
  const expenseCategories = categoriesData?.results ?? [];

  const [paymentType, setPaymentType] = useState<'payable' | 'expense' | 'on_account'>('payable');
  const [error, setError] = useState<string | null>(null);

  // Only fetch payables when in payable mode
  const { data: payablesData, isLoading: loadingPayables } = useQuery({
    queryKey: ['payables-list'],
    queryFn: () => listAllPayables(),
    enabled: paymentType === 'payable',
    staleTime: 30_000,
  });
  // Only show payables that still have an outstanding balance
  const payables = (payablesData ?? []).filter(
    p => p.status !== 'paid' && p.status !== 'cancelled'
  );

  // Only fetch suppliers when in on_account mode
  const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['suppliers-active'],
    queryFn: () => supplierService.getAllSuppliers({ is_active: true }),
    enabled: paymentType === 'on_account',
    staleTime: 60_000,
  });
  const suppliers = suppliersData ?? [];

  const [formData, setFormData] = useState({
    bank_account: '',
    amount: '',
    description: '',
    reference_number: '',
    payment_date: new Date().toISOString().split('T')[0],
    // payable-specific
    accounts_payable: '',
    bypass_validation: false,
    // expense-specific
    expense_category: '',
    payee_name: '',
    posting_notes: '',
    // on-account-specific
    supplier: '',
  });

  // Selected payable record (for info panel + over-payment warning)
  const selectedPayable = payables.find(p => String(p.id) === formData.accounts_payable) ?? null;
  const payableOutstanding = selectedPayable ? parseFloat(selectedPayable.amount_due) : null;
  const paymentAmount = parseFloat(formData.amount);
  const isOverPayment =
    payableOutstanding !== null && !isNaN(paymentAmount) && paymentAmount > payableOutstanding;

  const resetTypeFields = () =>
    setFormData(prev => ({
      ...prev,
      accounts_payable: '',
      expense_category: '',
      payee_name: '',
      supplier: '',
      amount: '',
      description: '',
    }));

  const getPayableDue = (payable: AccountsPayableListItem) => {
    if (payable.amount_due) return payable.amount_due;
    if (payable.total_amount && payable.amount_paid) {
      const due = Number(payable.total_amount) - Number(payable.amount_paid);
      return due > 0 ? due.toFixed(2) : '0.00';
    }
    return payable.total_amount;
  };

  const handlePayableChange = (id: string) => {
    const payable = payables.find(item => item.id === Number(id));
    const outstanding = payable ? getPayableDue(payable) : undefined;
    setFormData(prev => ({
      ...prev,
      accounts_payable: id,
      amount: outstanding ? String(outstanding) : prev.amount,
      description: payable
        ? `Payment for ${payable.invoice_number} (${payable.vendor_name})`
        : prev.description,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!formData.bank_account) {
      setError('Please select a bank account');
      return;
    }
    if (!formData.amount || isNaN(parseFloat(formData.amount)) || parseFloat(formData.amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (!formData.description.trim()) {
      setError('Please provide a description');
      return;
    }
    if (paymentType === 'payable' && !formData.accounts_payable) {
      setError('Please select an accounts payable item');
      return;
    }
    if (paymentType === 'expense' && !formData.expense_category) {
      setError('Please select an expense category');
      return;
    }
    if (paymentType === 'on_account' && !formData.supplier) {
      setError('Please select a supplier');
      return;
    }

    try {
      let expenseId: number | undefined;

      if (paymentType === 'expense') {
        const newExpense = await expenseService.createExpense({
          category: Number(formData.expense_category),
          expense_date: formData.payment_date,
          description: formData.description,
          amount: formData.amount,
          payee_name: formData.payee_name || undefined,
          payment_method: 'bank_transfer',
          expense_type: 'direct_cash',
        });
        expenseId = newExpense.id;
      }

      await createPayment.mutateAsync({
        bank_account: Number(formData.bank_account),
        amount: formData.amount,
        description: formData.description,
        reference_number: formData.reference_number || undefined,
        payment_date: formData.payment_date,
        accounts_payable: paymentType === 'payable' ? Number(formData.accounts_payable) : undefined,
        expense: expenseId,
        supplier: paymentType === 'on_account' ? Number(formData.supplier) : undefined,
        posting_notes: formData.posting_notes || undefined,
        bypass_validation: formData.bypass_validation,
      });

      navigate('/banks/payments');
    } catch (err: unknown) {
      const errObj = err as {
        response?: { data?: { detail?: string; message?: string; non_field_errors?: string[] } };
        details?: { detail?: string; message?: string; non_field_errors?: string[] };
        message?: string;
      };
      const data = errObj?.response?.data ?? errObj?.details;
      const message =
        data?.detail ||
        data?.message ||
        (data?.non_field_errors?.length ? data.non_field_errors.join(' ') : null) ||
        (err instanceof Error ? err.message : 'Failed to create payment');
      setError(message as string);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/banks/payments')}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Bank Payments
        </button>
        <h1 className="text-3xl font-bold text-gray-900">New Bank Payment</h1>
        <p className="text-gray-600 mt-1">
          Pay a supplier invoice or record a direct expense from a bank account
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {/* Payment Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Payment Type *</label>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="payable"
                  checked={paymentType === 'payable'}
                  onChange={() => {
                    setPaymentType('payable');
                    resetTypeFields();
                  }}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Supplier / Accounts Payable</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="expense"
                  checked={paymentType === 'expense'}
                  onChange={() => {
                    setPaymentType('expense');
                    resetTypeFields();
                  }}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Direct Expense</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  value="on_account"
                  checked={paymentType === 'on_account'}
                  onChange={() => {
                    setPaymentType('on_account');
                    resetTypeFields();
                  }}
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span>Payment on Account</span>
              </label>
            </div>
          </div>

          {/* Accounts Payable */}
          {paymentType === 'payable' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-payable">
                Accounts Payable *
              </label>
              {loadingPayables ? (
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading payables...
                </div>
              ) : (
                <select
                  id="bp-payable"
                  value={formData.accounts_payable}
                  onChange={e => handlePayableChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select payable...</option>
                  {payables.map(item => (
                    <option key={item.id} value={item.id}>
                      {item.invoice_number} {item.vendor_name} (Due: {item.amount_due})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Selected AP info card */}
          {paymentType === 'payable' && selectedPayable && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-1 text-sm">
              <p className="font-semibold text-blue-800">
                {selectedPayable.invoice_number} — {selectedPayable.vendor_name}
              </p>
              <div className="grid grid-cols-3 gap-4 mt-2">
                <div>
                  <span className="text-blue-600 text-xs uppercase tracking-wide">
                    Invoice Total
                  </span>
                  <p className="font-medium text-gray-900">
    ₦{parseFloat(selectedPayable.total_amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-blue-600 text-xs uppercase tracking-wide">Paid</span>
                  <p className="font-medium text-gray-900">
                    ₦{parseFloat(selectedPayable.amount_paid).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <span className="text-blue-600 text-xs uppercase tracking-wide">Outstanding</span>
                  <p className="font-semibold text-red-600">
                    ₦{parseFloat(selectedPayable.amount_due).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Due date: {selectedPayable.due_date} · Status:{' '}
                <span className="capitalize font-medium">{selectedPayable.status}</span>
              </p>
            </div>
          )}

          {/* Over-payment warning */}
          {isOverPayment && (
            <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
              <span className="mt-0.5">⚠️</span>
              <span>
                Payment amount ({fmtNGN(paymentAmount)}) exceeds the outstanding balance
                ({fmtNGN(payableOutstanding!)}). Confirm this is a deliberate over-payment
                or adjust the amount.
              </span>
            </div>
          )}

          {/* Direct Expense: category + payee */}
          {paymentType === 'expense' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="bp-category"
                >
                  Expense Category *
                </label>
                {loadingCategories ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading categories...
                  </div>
                ) : (
                  <select
                    id="bp-category"
                    value={formData.expense_category}
                    onChange={e =>
                      setFormData(prev => ({ ...prev, expense_category: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select category...</option>
                    {expenseCategories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-payee">
                  Payee Name
                </label>
                <input
                  id="bp-payee"
                  type="text"
                  value={formData.payee_name}
                  onChange={e => setFormData(prev => ({ ...prev, payee_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Vendor / recipient"
                />
              </div>
            </div>
          )}

          {/* Payment on Account: supplier selector */}
          {paymentType === 'on_account' && (
            <div className="space-y-3">
              <div>
                <label
                  className="block text-sm font-medium text-gray-700 mb-1"
                  htmlFor="bp-supplier"
                >
                  Supplier *
                </label>
                {loadingSuppliers ? (
                  <div className="flex items-center gap-2 text-gray-500 text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading suppliers...
                  </div>
                ) : (
                  <select
                    id="bp-supplier"
                    value={formData.supplier}
                    onChange={e => setFormData(prev => ({ ...prev, supplier: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.supplier_code})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                <p className="font-medium">ℹ️ Payment on Account</p>
                <p className="mt-1">
                  This payment will be posted to <strong>Advances to Suppliers</strong> (asset) and
                  debited from the selected bank account. When the supplier&apos;s invoice or PO
                  arrives, the advance will be applied to clear the balance — leaving either a
                  credit (change owed back) or a debit (amount still outstanding).
                </p>
              </div>
            </div>
          )}

          {/* Bank Account + Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-bank">
                Bank Account *
              </label>
              <select
                id="bp-bank"
                value={formData.bank_account}
                onChange={e => setFormData(prev => ({ ...prev, bank_account: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select bank account...</option>
                {bankAccounts.map(account => (
                  <option key={account.id} value={account.id}>
                    {account.account_name} ({account.account_number})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-date">
                Payment Date *
              </label>
              <input
                id="bp-date"
                type="date"
                value={formData.payment_date}
                onChange={e => setFormData(prev => ({ ...prev, payment_date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-amount">
              Amount *
            </label>
            <input
              id="bp-amount"
              type="text"
              inputMode="decimal"
              value={formData.amount}
              onChange={e => {
                if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                  setFormData(prev => ({ ...prev, amount: e.target.value }));
                }
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-desc">
              Description *
            </label>
            <textarea
              id="bp-desc"
              value={formData.description}
              onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              rows={3}
            />
          </div>

          {/* Reference + Posting Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-ref">
                External Reference
              </label>
              <input
                id="bp-ref"
                type="text"
                value={formData.reference_number}
                onChange={e => setFormData(prev => ({ ...prev, reference_number: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Bank slip / invoice ref"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="bp-notes">
                Posting Notes
              </label>
              <input
                id="bp-notes"
                type="text"
                value={formData.posting_notes}
                onChange={e => setFormData(prev => ({ ...prev, posting_notes: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {paymentType === 'payable' && (
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.bypass_validation}
                onChange={e =>
                  setFormData(prev => ({ ...prev, bypass_validation: e.target.checked }))
                }
                className="text-blue-600 focus:ring-blue-500"
              />
              Bypass 3-way matching validation
            </label>
          )}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => navigate('/banks/payments')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createPayment.isPending}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {createPayment.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {createPayment.isPending ? 'Submitting...' : 'Create Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default BankPaymentFormPage;
