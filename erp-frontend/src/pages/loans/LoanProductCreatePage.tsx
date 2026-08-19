/**
 * Loan Product Create Page
 * Creates the underlying Product record (product_type=LOAN) and its LoanProduct
 * configuration in one form. Route: /loans/products/create
 *
 * Two API calls happen on submit: POST /products/products/ then POST /loans/products/
 * (LoanProduct.name/code/description/is_active are read-only, sourced from Product —
 * see loans/serializers.py). If the second call fails after the first succeeds, the
 * created product id is kept so retrying doesn't create a duplicate Product row.
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ChevronLeft, Loader2, Save, Landmark } from 'lucide-react';
import { api as apiClient } from '../../services/api';
import { LoanProduct, TermUnit } from '../../services/loanService';
import { useCreateLoanProduct } from '../../hooks/useLoans';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { branchService } from '../../services/branchService';
import { useAuth } from '../../contexts/AuthContext';

// ── Reusable GL account select ───────────────────────────────────────────────

function AccountSelect({
  label, description, value, onChange, accounts, required,
}: {
  label: string;
  description?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  accounts: Account[];
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {description && <p className="text-xs text-gray-400 mb-1">{description}</p>}
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label={label}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        <option value="">— Select account —</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );
}

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
];

interface Branch {
  id: number;
  name: string;
}

export default function LoanProductCreatePage() {
  const navigate = useNavigate();
  const { user, activeBranch } = useAuth();
  const createProductMutation = useCreateLoanProduct();

  // Basic info (base Product record)
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [branch, setBranch] = useState<number | ''>('');
  const [isActive, setIsActive] = useState(true);

  // LoanProduct config
  const [form, setForm] = useState<Partial<LoanProduct>>({
    default_interest_rate: '0',
    interest_calculation_method: 'straight_line',
    min_loan_amount: '0',
    max_loan_amount: '0',
    term_unit: 'months' as TermUnit,
    min_term_months: 1,
    max_term_months: 12,
    first_repayment_buffer_days: 0,
    allowed_repayment_frequencies: ['monthly'],
    processing_fee_type: 'percentage',
    processing_fee_amount: '0',
    processing_fee_percentage: '0',
    insurance_rate: '0',
    late_payment_penalty_type: 'percentage',
    late_payment_penalty: '0',
    grace_period_days: 0,
    requires_collateral: false,
    collateral_percentage: '0',
    requires_guarantor: false,
    min_guarantors: 1,
    requires_approval: true,
    disbursement_account: null,
    interest_income_account: null,
    fee_income_account: null,
    penalty_income_account: null,
    insurance_income_account: null,
    accrued_interest_account: null,
    unearned_interest_income_account: null,
    interest_writeoff_expense_account: null,
  });

  // Support data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([]);
  const [liabilityAccounts, setLiabilityAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Kept once the base Product is created, so a retry after a LoanProduct
  // failure re-uses it instead of creating a duplicate Product row.
  const [createdProductId, setCreatedProductId] = useState<number | null>(null);

  useEffect(() => {
    branchService.getBranches().then((data: any) => {
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      setBranches(list);
    }).catch(() => {});
    accountService.getAccounts({ account_type: 'INCOME' }).then(setIncomeAccounts).catch(() => {});
    accountService.getAccounts({ account_type: 'ASSET' }).then(setAssetAccounts).catch(() => {});
    accountService.getAccounts({ account_type: 'LIABILITY' }).then(setLiabilityAccounts).catch(() => {});
    accountService.getAccounts({ account_type: 'EXPENSE' }).then(setExpenseAccounts).catch(() => {});
  }, []);

  // Default the branch to the user's own/active branch once branches load
  useEffect(() => {
    if (branch === '' && branches.length > 0) {
      const preferred = activeBranch?.id ?? user?.branch_id ?? null;
      if (preferred && branches.some(b => b.id === preferred)) {
        setBranch(preferred);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  const toggleFreq = (val: string) => {
    const current = (form.allowed_repayment_frequencies ?? []) as string[];
    setForm(prev => ({
      ...prev,
      allowed_repayment_frequencies: current.includes(val)
        ? current.filter(f => f !== val)
        : [...current, val],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('Product name is required.'); return; }
    if (!code.trim()) { setError('Product code is required.'); return; }
    if (!branch) { setError('Branch is required.'); return; }
    if (!(form.allowed_repayment_frequencies ?? []).length) {
      setError('Select at least one allowed repayment frequency.'); return;
    }

    setSubmitting(true);
    try {
      let productId = createdProductId;
      if (!productId) {
        const product = await apiClient.post('/products/products/', {
          name: name.trim(),
          code: code.trim(),
          description: description.trim(),
          product_class: 'FINANCIAL',
          product_type: 'LOAN',
          is_active: isActive,
          branch,
          // Required by ProductSerializer.validate() for LOAN/SAVINGS product
          // types — the LoanProduct-level default_interest_rate below is the
          // one actually used for loan calculations; this just satisfies the
          // base Product record's own validation.
          interest_rate: form.default_interest_rate || '0',
        });
        productId = product.id;
        setCreatedProductId(productId);
      }

      const loanProduct = await new Promise<LoanProduct>((resolve, reject) => {
        createProductMutation.mutate(
          { ...form, product: productId! },
          { onSuccess: resolve, onError: reject }
        );
      });

      navigate(`/loans/products/${loanProduct.id}/config`);
    } catch (err: any) {
      setError(
        err?.response?.data?.detail ||
        err?.message ||
        (createdProductId
          ? 'Base product was created, but saving loan configuration failed. Fix the fields below and retry.'
          : 'Failed to create loan product.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/loans/products')}
            aria-label="Back to loan products"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-blue-100 flex items-center justify-center">
            <Landmark className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900">New Loan Product</h1>
            <p className="text-xs text-gray-500">Define interest, terms, fees, and GL account mappings</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Name *</label>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Business Growth Loan"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Product Code *</label>
                <input
                  type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. BGL"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Short description shown to loan officers"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Branch *</label>
                <select
                  value={branch}
                  onChange={e => setBranch(e.target.value ? Number(e.target.value) : '')}
                  aria-label="Branch"
                  disabled={!!createdProductId}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:bg-gray-100"
                >
                  <option value="">— Select branch —</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-5">
                  <input type="checkbox" className="rounded border-gray-300"
                    checked={isActive} onChange={e => setIsActive(e.target.checked)} />
                  Active immediately
                </label>
              </div>
            </div>
          </div>

          {/* Interest */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Interest &amp; Calculation</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual Interest Rate (%)</label>
                <input
                  type="number" min={0} max={100} step="0.01"
                  value={form.default_interest_rate ?? ''}
                  onChange={e => setForm(p => ({ ...p, default_interest_rate: e.target.value }))}
                  placeholder="15.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Calculation Method</label>
                <select
                  value={form.interest_calculation_method ?? 'straight_line'}
                  onChange={e => setForm(p => ({ ...p, interest_calculation_method: e.target.value as LoanProduct['interest_calculation_method'] }))}
                  aria-label="Interest calculation method"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="straight_line">Straight Line</option>
                  <option value="reducing_balance">Reducing Balance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Loan Limits */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Loan Amount &amp; Term Limits</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Min Loan Amount (₦)</label>
                <input type="number" min={0} step="0.01"
                  value={form.min_loan_amount ?? ''}
                  onChange={e => setForm(p => ({ ...p, min_loan_amount: e.target.value }))}
                  placeholder="1000.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Max Loan Amount (₦)</label>
                <input type="number" min={0} step="0.01"
                  value={form.max_loan_amount ?? ''}
                  onChange={e => setForm(p => ({ ...p, max_loan_amount: e.target.value }))}
                  placeholder="10000000.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Term Unit</label>
                <div className="flex gap-3">
                  {(['days', 'weeks', 'months'] as const).map(u => (
                    <label key={u} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors capitalize ${
                      form.term_unit === u
                        ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}>
                      <input
                        type="radio" name="term_unit" className="hidden"
                        checked={form.term_unit === u}
                        onChange={() => setForm(p => ({ ...p, term_unit: u }))}
                      />
                      {u.charAt(0).toUpperCase() + u.slice(1)}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Min Term ({form.term_unit ?? 'months'})
                </label>
                <input type="number" min={1}
                  value={form.min_term_months ?? ''}
                  onChange={e => setForm(p => ({ ...p, min_term_months: Number(e.target.value) }))}
                  placeholder="1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Max Term ({form.term_unit ?? 'months'})
                </label>
                <input type="number" min={1}
                  value={form.max_term_months ?? ''}
                  onChange={e => setForm(p => ({ ...p, max_term_months: Number(e.target.value) }))}
                  placeholder="12"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>

              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">First Repayment Buffer (days)</label>
                <input type="number" min={0}
                  value={form.first_repayment_buffer_days ?? 0}
                  onChange={e => setForm(p => ({ ...p, first_repayment_buffer_days: Number(e.target.value) }))}
                  placeholder="0"
                  className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Repayment Frequencies */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Allowed Repayment Frequencies *</h3>
            <p className="text-xs text-gray-400 mb-3">Select all schedules this product supports.</p>
            <div className="flex flex-wrap gap-3">
              {FREQ_OPTIONS.map(f => {
                const checked = ((form.allowed_repayment_frequencies ?? []) as string[]).includes(f.value);
                return (
                  <label key={f.value} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm cursor-pointer transition-colors ${
                    checked ? 'bg-blue-50 border-blue-400 text-blue-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}>
                    <input type="checkbox" className="hidden" checked={checked} onChange={() => toggleFreq(f.value)} />
                    {checked ? '✓' : ''} {f.label}
                  </label>
                );
              })}
            </div>
          </div>

          {/* Fees & Insurance */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Processing Fee &amp; Insurance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fee Type</label>
                <select
                  value={form.processing_fee_type ?? 'percentage'}
                  onChange={e => setForm(p => ({ ...p, processing_fee_type: e.target.value as 'fixed' | 'percentage' }))}
                  aria-label="Processing fee type"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              {form.processing_fee_type === 'fixed' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₦)</label>
                  <input type="number" min={0} step="0.01"
                    value={form.processing_fee_amount ?? '0'}
                    onChange={e => setForm(p => ({ ...p, processing_fee_amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Percentage (%)</label>
                  <input type="number" min={0} max={100} step="0.01"
                    value={form.processing_fee_percentage ?? '0'}
                    onChange={e => setForm(p => ({ ...p, processing_fee_percentage: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Rate (%)</label>
                <input type="number" min={0} max={100} step="0.01"
                  value={form.insurance_rate ?? '0'}
                  onChange={e => setForm(p => ({ ...p, insurance_rate: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Penalties */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Late Payment Penalty</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Penalty Type</label>
                <select
                  value={form.late_payment_penalty_type ?? 'percentage'}
                  onChange={e => setForm(p => ({ ...p, late_payment_penalty_type: e.target.value as 'fixed' | 'percentage' }))}
                  aria-label="Penalty type"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                >
                  <option value="percentage">Percentage of Outstanding</option>
                  <option value="fixed">Fixed Amount</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {form.late_payment_penalty_type === 'fixed' ? 'Penalty Amount (₦)' : 'Penalty Rate (%)'}
                </label>
                <input type="number" min={0} step="0.01"
                  value={form.late_payment_penalty ?? '0'}
                  onChange={e => setForm(p => ({ ...p, late_payment_penalty: e.target.value }))}
                  placeholder="0.00"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days)</label>
                <input type="number" min={0}
                  value={form.grace_period_days ?? 0}
                  onChange={e => setForm(p => ({ ...p, grace_period_days: Number(e.target.value) }))}
                  placeholder="0"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                />
              </div>
            </div>
          </div>

          {/* Requirements */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-4">Approval Requirements</h3>
            <div className="grid grid-cols-2 gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300"
                  checked={form.requires_approval ?? true}
                  onChange={e => setForm(p => ({ ...p, requires_approval: e.target.checked }))}
                />
                Requires approval before disbursement
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300"
                  checked={form.requires_collateral ?? false}
                  onChange={e => setForm(p => ({ ...p, requires_collateral: e.target.checked }))}
                />
                Requires collateral
              </label>
              {form.requires_collateral && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Collateral % of Loan</label>
                  <input type="number" min={0} max={200} step="0.01"
                    value={form.collateral_percentage ?? '0'}
                    onChange={e => setForm(p => ({ ...p, collateral_percentage: e.target.value }))}
                    placeholder="100"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" className="rounded border-gray-300"
                  checked={form.requires_guarantor ?? false}
                  onChange={e => setForm(p => ({ ...p, requires_guarantor: e.target.checked }))}
                />
                Requires guarantor
              </label>
              {form.requires_guarantor && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Guarantors</label>
                  <input type="number" min={1}
                    value={form.min_guarantors ?? 1}
                    onChange={e => setForm(p => ({ ...p, min_guarantors: Number(e.target.value) }))}
                    placeholder="1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
              )}
            </div>
          </div>

          {/* GL Accounts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-800 mb-1">GL Account Mappings</h3>
            <p className="text-xs text-gray-400 mb-4">
              All optional at creation — leave blank and set later from the product's Configure
              page if the chart of accounts isn't ready yet.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <AccountSelect
                label="Disbursement Account" accounts={assetAccounts}
                value={form.disbursement_account ?? null}
                onChange={v => setForm(p => ({ ...p, disbursement_account: v }))}
              />
              <AccountSelect
                label="Interest Income Account" accounts={incomeAccounts}
                value={form.interest_income_account ?? null}
                onChange={v => setForm(p => ({ ...p, interest_income_account: v }))}
              />
              <AccountSelect
                label="Fee Income Account" accounts={incomeAccounts}
                value={form.fee_income_account ?? null}
                onChange={v => setForm(p => ({ ...p, fee_income_account: v }))}
              />
              <AccountSelect
                label="Penalty Income Account" accounts={incomeAccounts}
                value={form.penalty_income_account ?? null}
                onChange={v => setForm(p => ({ ...p, penalty_income_account: v }))}
              />
              <AccountSelect
                label="Insurance Income Account" accounts={incomeAccounts}
                value={form.insurance_income_account ?? null}
                onChange={v => setForm(p => ({ ...p, insurance_income_account: v }))}
              />
              <AccountSelect
                label="Interest Receivable Account" accounts={assetAccounts}
                value={form.accrued_interest_account ?? null}
                onChange={v => setForm(p => ({ ...p, accrued_interest_account: v }))}
              />
              <AccountSelect
                label="Unearned Interest Income (Liability)" accounts={liabilityAccounts}
                value={form.unearned_interest_income_account ?? null}
                onChange={v => setForm(p => ({ ...p, unearned_interest_income_account: v }))}
                description="Set together with Interest Receivable to defer interest income recognition to the repayment schedule instead of booking it at disbursement."
              />
              <AccountSelect
                label="Interest Write-off Expense Account" accounts={expenseAccounts}
                value={form.interest_writeoff_expense_account ?? null}
                onChange={v => setForm(p => ({ ...p, interest_writeoff_expense_account: v }))}
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pb-8">
            <button type="submit" disabled={submitting}
              className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create Loan Product
            </button>
            <button type="button" onClick={() => navigate('/loans/products')}
              className="flex items-center gap-1.5 text-gray-600 border border-gray-300 text-sm px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
