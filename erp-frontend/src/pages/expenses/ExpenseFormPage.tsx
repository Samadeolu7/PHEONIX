import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, X, Upload } from 'lucide-react';
import { useCreateExpense, useUpdateExpense, useExpense } from '../../hooks/useExpenses';
import { useExpenseCategories } from '../../hooks/useExpenseCategories';
import { useToast } from '../../contexts/ToastContext';
import { CreateExpense, ExpenseType, PaymentMethod, PayeeType } from '../../types/expense';
import { useBankAccounts } from '../../hooks/useBanks';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const ExpenseFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const toast = useToast();

  const [formData, setFormData] = useState<CreateExpense>({
    category: 0,
    expense_date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    payee_name: '',
    payee_type: 'other',
    payment_method: 'cash',
    payment_reference: '',
    bank_account: null,
    expense_type: 'direct_cash',
    status: 'draft',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const { data: existingExpense } = useExpense(parseInt(id || '0'), isEdit);
  const { data: categoriesData } = useExpenseCategories();
  const { data: bankAccountsData } = useBankAccounts({ is_active: true });
  const createMutation = useCreateExpense();
  const updateMutation = useUpdateExpense();

  const categories = categoriesData?.results || [];
  const bankAccounts = Array.isArray(bankAccountsData)
    ? bankAccountsData
    : (bankAccountsData as any)?.results || [];
  const needsBankAccount = ['bank_transfer', 'cheque', 'card'].includes(
    formData.payment_method || ''
  );

  useEffect(() => {
    if (existingExpense) {
      setFormData({
        category: existingExpense.category,
        expense_date: existingExpense.expense_date,
        description: existingExpense.description,
        amount: existingExpense.amount,
        payee_name: existingExpense.payee_name,
        payee_type: existingExpense.payee_type,
        payment_method: existingExpense.payment_method,
        payment_reference: existingExpense.payment_reference,
        bank_account: existingExpense.bank_account ?? null,
        expense_type: existingExpense.expense_type,
        status: existingExpense.status,
      });
    }
  }, [existingExpense]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.category) newErrors.category = 'Category is required';
    if (!formData.expense_date) newErrors.expense_date = 'Date is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.amount || parseFloat(formData.amount.toString()) <= 0)
      newErrors.amount = 'Amount must be greater than 0';
    if (needsBankAccount && !formData.bank_account)
      newErrors.bank_account = 'Please select the bank account used for this payment';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: formData });
        toast.success('Expense updated successfully');
      } else {
        const created = await createMutation.mutateAsync(formData);
        toast.success('Expense created successfully');
        navigate(`/expenses/${created.id}`);
        return;
      }
      navigate('/expenses');
    } catch (err: any) {
      const detail = err?.response?.data;
      if (detail && typeof detail === 'object') {
        const fieldErrors: Record<string, string> = {};
        for (const [key, val] of Object.entries(detail)) {
          fieldErrors[key] = Array.isArray(val) ? val[0] : String(val);
        }
        setErrors(fieldErrors);
      } else {
        toast.error('Failed to save expense');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (field: keyof CreateExpense, value: any) => {
    if (field === 'amount' && typeof value === 'string' && !DECIMAL_INPUT_REGEX.test(value)) {
      return;
    }
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/expenses')}
          className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Expense' : 'New Expense'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEdit
              ? 'Update existing expense record'
              : 'Record a new direct or reimbursement expense'}
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-5"
      >
        {/* Expense Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Expense Type</label>
          <select
            value={formData.expense_type}
            onChange={e => handleChange('expense_type', e.target.value as ExpenseType)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="direct_cash">Direct Cash</option>
            <option value="reimbursement">Employee Reimbursement</option>
            <option value="procurement">Procurement-Initiated</option>
          </select>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Category <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category}
            onChange={e => handleChange('category', parseInt(e.target.value))}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.category ? 'border-red-400' : 'border-gray-300'
            }`}
          >
            <option value={0}>Select category...</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.code})
              </option>
            ))}
          </select>
          {errors.category && <p className="text-red-500 text-xs mt-1">{errors.category}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Expense Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={formData.expense_date}
            onChange={e => handleChange('expense_date', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.expense_date ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {errors.expense_date && (
            <p className="text-red-500 text-xs mt-1">{errors.expense_date}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={formData.description}
            onChange={e => handleChange('description', e.target.value)}
            placeholder="Purpose of the expense..."
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none ${
              errors.description ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {errors.description && <p className="text-red-500 text-xs mt-1">{errors.description}</p>}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Amount (₦) <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.amount}
            onChange={e => handleChange('amount', e.target.value)}
            placeholder="0.00"
            className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.amount ? 'border-red-400' : 'border-gray-300'
            }`}
          />
          {errors.amount && <p className="text-red-500 text-xs mt-1">{errors.amount}</p>}
        </div>

        {/* Payee */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payee Name</label>
            <input
              type="text"
              value={formData.payee_name}
              onChange={e => handleChange('payee_name', e.target.value)}
              placeholder="Who is being paid?"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payee Type</label>
            <select
              value={formData.payee_type}
              onChange={e => handleChange('payee_type', e.target.value as PayeeType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="other">Other</option>
              <option value="supplier">Supplier</option>
              <option value="employee">Employee</option>
            </select>
          </div>
        </div>

        {/* Payment */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Payment Method</label>
            <select
              value={formData.payment_method}
              onChange={e => {
                handleChange('payment_method', e.target.value as PaymentMethod);
                // Clear bank account when switching to cash
                if (e.target.value === 'cash') handleChange('bank_account', null);
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cheque">Cheque</option>
              <option value="card">Card</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Payment Reference
            </label>
            <input
              type="text"
              value={formData.payment_reference}
              onChange={e => handleChange('payment_reference', e.target.value)}
              placeholder="Cheque #, transfer ref..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Bank Account selector — shown only for non-cash payments */}
        {needsBankAccount && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Bank Account <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.bank_account ?? ''}
              onChange={e =>
                handleChange('bank_account', e.target.value ? parseInt(e.target.value) : null)
              }
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.bank_account ? 'border-red-400' : 'border-gray-300'
              }`}
            >
              <option value="">Select bank account...</option>
              {bankAccounts.map((acct: any) => (
                <option key={acct.id} value={acct.id}>
                  {acct.bank_display_name ?? acct.bank_name} — {acct.account_number} (
                  {acct.account_name})
                </option>
              ))}
            </select>
            {errors.bank_account && (
              <p className="text-red-500 text-xs mt-1">{errors.bank_account}</p>
            )}
            {bankAccounts.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">
                No bank accounts found.{' '}
                <Link to="/banks/accounts/new" className="underline">
                  Set up a bank account
                </Link>{' '}
                first.
              </p>
            )}
          </div>
        )}

        {/* Accounting note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-800 mb-1">Accounting Effect on Post:</p>
          <p className="text-xs text-blue-700">
            <span className="font-mono">Dr. Expense Account (category)</span>
            {' → '}
            {needsBankAccount && formData.bank_account ? (
              <span className="font-mono">
                Cr.{' '}
                {bankAccounts.find((a: any) => a.id === formData.bank_account)?.account_name ??
                  'Bank Account'}
              </span>
            ) : formData.payment_method === 'cash' ? (
              <span className="font-mono">Cr. Cash Account</span>
            ) : (
              <span className="font-mono">Cr. Bank / Accounts Payable</span>
            )}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => navigate('/expenses')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {submitting ? 'Saving...' : isEdit ? 'Update Expense' : 'Create Expense'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ExpenseFormPage;
