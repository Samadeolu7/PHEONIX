/**
 * Loan Product Config Page
 * Manage dynamic fee lines and savings requirements for a specific loan product.
 * Route: /loans/products/:id/config
 *
 * Tabs:
 *   1. Fee Lines — add / edit / remove income fees (admin fee, registration, risk premium, etc.)
 *   2. Savings Requirements — configure required savings balance before a loan is allowed
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronLeft,
  BadgeDollarSign,
  ShieldCheck,
  Settings2,
} from 'lucide-react';
import { api as apiClient } from '../../api';
import {
  loanService,
  LoanProduct,
  LoanProductFee,
  LoanProductSavingsRequirement,
} from '../../services/loanService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '—' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Sub-component: Fee line form (inline) ───────────────────────────────────

interface FeeFormProps {
  productId: number;
  initial?: LoanProductFee;
  onSaved: (fee: LoanProductFee) => void;
  onCancel: () => void;
  incomeAccounts: Account[];
  savingsProducts: { id: number; name: string }[];
}

function FeeLineForm({ productId, initial, onSaved, onCancel, incomeAccounts, savingsProducts }: FeeFormProps) {
  const isEdit = !!initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [feeType, setFeeType] = useState<'fixed' | 'percentage'>(initial?.fee_type ?? 'fixed');
  const [fixedAmount, setFixedAmount] = useState(initial?.fixed_amount ?? '0');
  const [percentage, setPercentage] = useState(initial?.percentage ?? '0');
  const [glAccount, setGlAccount] = useState<string>(String(initial?.gl_income_account ?? ''));
  const [trigger, setTrigger] = useState<'registration' | 'approval' | 'disbursement'>(initial?.posting_trigger ?? 'registration');
  const [debitDest, setDebitDest] = useState<'cashier' | 'savings' | 'user_choice'>(initial?.debit_destination ?? 'cashier');
  const [defaultSavingsProduct, setDefaultSavingsProduct] = useState<string>(String(initial?.default_savings_product ?? ''));
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [order, setOrder] = useState(initial?.order ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!glAccount) { setError('GL income account is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<LoanProductFee> = {
        loan_product: productId,
        name: name.trim(),
        fee_type: feeType,
        fixed_amount: feeType === 'fixed' ? fixedAmount : '0',
        percentage: feeType === 'percentage' ? percentage : '0',
        gl_income_account: Number(glAccount),
        posting_trigger: trigger,
        debit_destination: debitDest,
        default_savings_product: (debitDest === 'savings' && defaultSavingsProduct) ? Number(defaultSavingsProduct) : null,
        is_active: isActive,
        order,
      };
      const saved = isEdit
        ? await loanService.updateProductFee(initial!.id, payload)
        : await loanService.createProductFee(payload);
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message ?? e?.detail ?? 'Failed to save fee.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-3"
    >
      <p className="text-sm font-semibold text-blue-800 mb-3">{isEdit ? 'Edit Fee Line' : 'Add Fee Line'}</p>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {/* Name */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Fee Name *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Admin Fee, Registration Fee"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {/* Order */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
          <input
            type="number"
            min={1}
            value={order}
            onChange={e => setOrder(Number(e.target.value))}
            title="Display order"
            placeholder="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>
        {/* Fee Type */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Fee Type</label>
          <select
            value={feeType}
            onChange={e => setFeeType(e.target.value as 'fixed' | 'percentage')}
            aria-label="Fee type"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="fixed">Fixed Amount</option>
            <option value="percentage">Percentage of Loan</option>
          </select>
        </div>
        {/* Amount / Percentage */}
        {feeType === 'fixed' ? (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₦)</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={fixedAmount}
              onChange={e => setFixedAmount(e.target.value)}
              title="Fixed fee amount"
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Percentage (%)</label>
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={percentage}
              onChange={e => setPercentage(e.target.value)}
              title="Fee percentage"
              placeholder="0.00"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        )}
        {/* GL Income Account */}
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">GL Income Account *</label>
          <select
            value={glAccount}
            onChange={e => setGlAccount(e.target.value)}
            aria-label="GL income account"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="">— Select account —</option>
            {incomeAccounts.map(a => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        {/* Posting Trigger */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Post Fee At</label>
          <select
            value={trigger}
            onChange={e => setTrigger(e.target.value as 'registration' | 'approval' | 'disbursement')}
            aria-label="Posting trigger"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="registration">At Registration</option>
            <option value="approval">At Approval</option>
            <option value="disbursement">At Disbursement</option>
          </select>
        </div>
        {/* Debit Destination */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Debit To</label>
          <select
            value={debitDest}
            onChange={e => setDebitDest(e.target.value as 'cashier' | 'savings' | 'user_choice')}
            aria-label="Debit destination"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value="cashier">Cashier Account</option>
            <option value="savings">Client Savings Account</option>
            <option value="user_choice">User Chooses at Registration</option>
          </select>
        </div>
        {/* Default Savings Product (shown when destination = savings) */}
        {debitDest === 'savings' && (
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Savings Product</label>
            <select
              value={defaultSavingsProduct}
              onChange={e => setDefaultSavingsProduct(e.target.value)}
              aria-label="Default savings product"
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">— Any active savings account —</option>
              {savingsProducts.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">If blank, the first active savings account will be used.</p>
          </div>
        )}
        {/* Active toggle */}
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="fee-active"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="fee-active" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isEdit ? 'Update' : 'Add Fee'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-gray-600 border border-gray-300 text-sm px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </form>
  );
}

// ── Sub-component: Savings requirement form (inline) ─────────────────────────

interface SavingsReqFormProps {
  productId: number;
  initial?: LoanProductSavingsRequirement;
  onSaved: (req: LoanProductSavingsRequirement) => void;
  onCancel: () => void;
  savingsProducts: { id: number; name: string }[];
}

function SavingsRequirementForm({ productId, initial, onSaved, onCancel, savingsProducts }: SavingsReqFormProps) {
  const isEdit = !!initial;
  const [savingsProduct, setSavingsProduct] = useState<string>(String(initial?.savings_product ?? ''));
  const [reqType, setReqType] = useState<'percentage' | 'fixed'>(initial?.requirement_type ?? 'percentage');
  const [value, setValue] = useState(initial?.value ?? '10');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!savingsProduct) { setError('Savings product is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<LoanProductSavingsRequirement> = {
        loan_product: productId,
        savings_product: Number(savingsProduct),
        requirement_type: reqType,
        value,
        is_active: isActive,
      };
      const saved = isEdit
        ? await loanService.updateSavingsRequirement(initial!.id, payload)
        : await loanService.createSavingsRequirement(payload);
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message ?? e?.detail ?? 'Failed to save requirement.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-green-50 border border-green-200 rounded-xl p-4 mb-3"
    >
      <p className="text-sm font-semibold text-green-800 mb-3">
        {isEdit ? 'Edit Savings Requirement' : 'Add Savings Requirement'}
      </p>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Savings Product *</label>
          <select
            value={savingsProduct}
            onChange={e => setSavingsProduct(e.target.value)}
            aria-label="Savings product"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="">— Select savings product —</option>
            {savingsProducts.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Requirement Type</label>
          <select
            value={reqType}
            onChange={e => setReqType(e.target.value as 'percentage' | 'fixed')}
            aria-label="Requirement type"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          >
            <option value="percentage">% of Loan Amount</option>
            <option value="fixed">Fixed Amount (₦)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            {reqType === 'percentage' ? 'Percentage (%)' : 'Amount (₦)'}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={value}
            onChange={e => setValue(e.target.value)}
            title="Requirement value"
            placeholder="10"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          />
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="req-active"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="req-active" className="text-sm text-gray-700">Active (enforced as hard block)</label>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isEdit ? 'Update' : 'Add Requirement'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1.5 text-gray-600 border border-gray-300 text-sm px-4 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Cancel
        </button>
      </div>
    </form>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

type Tab = 'settings' | 'fees' | 'savings_requirements';

export default function LoanProductConfigPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();

  const [product, setProduct] = useState<LoanProduct | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('settings');

  // ── Settings tab state ───────────────────────────────────────────────────
  const [settingsForm, setSettingsForm] = useState<Partial<LoanProduct>>({});
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Fee lines state
  const [fees, setFees] = useState<LoanProductFee[]>([]);
  const [feesLoading, setFeesLoading] = useState(false);
  const [feesError, setFeesError] = useState<string | null>(null);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [editingFee, setEditingFee] = useState<LoanProductFee | null>(null);
  const [deletingFeeId, setDeletingFeeId] = useState<number | null>(null);

  // Savings requirements state
  const [requirements, setRequirements] = useState<LoanProductSavingsRequirement[]>([]);
  const [reqLoading, setReqLoading] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [showReqForm, setShowReqForm] = useState(false);
  const [editingReq, setEditingReq] = useState<LoanProductSavingsRequirement | null>(null);
  const [deletingReqId, setDeletingReqId] = useState<number | null>(null);

  // Support data
  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [assetAccounts, setAssetAccounts] = useState<Account[]>([]);
  const [liabilityAccounts, setLiabilityAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [savingsProducts, setSavingsProducts] = useState<{ id: number; name: string }[]>([]);

  // Load product
  useEffect(() => {
    loanService.getProduct(productId).then(p => {
      setProduct(p);
      setSettingsForm({
        default_interest_rate: p.default_interest_rate,
        interest_calculation_method: p.interest_calculation_method,
        min_loan_amount: p.min_loan_amount,
        max_loan_amount: p.max_loan_amount,
        term_unit: p.term_unit ?? 'months',
        min_term_months: p.min_term_months,
        max_term_months: p.max_term_months,
        first_repayment_buffer_days: p.first_repayment_buffer_days ?? 0,
        allowed_repayment_frequencies: p.allowed_repayment_frequencies,
        processing_fee_type: p.processing_fee_type,
        processing_fee_amount: p.processing_fee_amount,
        processing_fee_percentage: p.processing_fee_percentage,
        insurance_rate: p.insurance_rate,
        late_payment_penalty_type: p.late_payment_penalty_type,
        late_payment_penalty: p.late_payment_penalty,
        grace_period_days: p.grace_period_days,
        requires_collateral: p.requires_collateral,
        collateral_percentage: p.collateral_percentage,
        requires_guarantor: p.requires_guarantor,
        min_guarantors: p.min_guarantors,
        requires_approval: p.requires_approval,
        interest_income_account: p.interest_income_account,
        accrued_interest_account: p.accrued_interest_account,
        unearned_interest_income_account: p.unearned_interest_income_account,
        interest_writeoff_expense_account: p.interest_writeoff_expense_account,
      });
    }).catch(() => {});
  }, [productId]);

  // Load GL accounts by type (for the Deferred Interest Income section)
  useEffect(() => {
    accountService.getAccounts({ account_type: 'INCOME' }).then(data => {
      setIncomeAccounts(Array.isArray(data) ? data : (data as any)?.results ?? []);
    }).catch(() => {});
    accountService.getAccounts({ account_type: 'ASSET' }).then(data => {
      setAssetAccounts(Array.isArray(data) ? data : (data as any)?.results ?? []);
    }).catch(() => {});
    accountService.getAccounts({ account_type: 'LIABILITY' }).then(data => {
      setLiabilityAccounts(Array.isArray(data) ? data : (data as any)?.results ?? []);
    }).catch(() => {});
    accountService.getAccounts({ account_type: 'EXPENSE' }).then(data => {
      setExpenseAccounts(Array.isArray(data) ? data : (data as any)?.results ?? []);
    }).catch(() => {});
  }, []);

  // Load savings products list (product_type=SAVINGS via products endpoint)
  useEffect(() => {
    apiClient.get('/products/products/', { params: { product_type: 'SAVINGS', is_active: true } })
      .then((response: any) => {
        const body = response?.data ?? response;
        const list = Array.isArray(body) ? body : (body?.results ?? []);
        setSavingsProducts(list.map((p: any) => ({ id: p.id, name: p.name })));
      })
      .catch(() => {});
  }, []);

  const loadFees = useCallback(async () => {
    setFeesLoading(true);
    setFeesError(null);
    try {
      const data = await loanService.listProductFees(productId);
      setFees(data.sort((a, b) => a.order - b.order));
    } catch (e: any) {
      setFeesError(e?.message ?? 'Failed to load fees.');
    } finally {
      setFeesLoading(false);
    }
  }, [productId]);

  const loadRequirements = useCallback(async () => {
    setReqLoading(true);
    setReqError(null);
    try {
      const data = await loanService.listSavingsRequirements(productId);
      setRequirements(data);
    } catch (e: any) {
      setReqError(e?.message ?? 'Failed to load savings requirements.');
    } finally {
      setReqLoading(false);
    }
  }, [productId]);

  useEffect(() => { loadFees(); }, [loadFees]);
  useEffect(() => { loadRequirements(); }, [loadRequirements]);

  // ── Settings save handler ────────────────────────────────────────────────
  const handleSettingsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsSaved(false);
    try {
      const updated = await loanService.updateProduct(productId, settingsForm);
      setProduct(updated);
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err: any) {
      setSettingsError(
        err?.detail ?? err?.message ?? 'Failed to save settings.'
      );
    } finally {
      setSettingsSaving(false);
    }
  };

  const FREQ_OPTIONS = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Bi-weekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
  ];
  const toggleFreq = (val: string) => {
    const current = (settingsForm.allowed_repayment_frequencies ?? []) as string[];
    setSettingsForm(prev => ({
      ...prev,
      allowed_repayment_frequencies: current.includes(val)
        ? current.filter(f => f !== val)
        : [...current, val],
    }));
  };
  const handleFeeSaved = (fee: LoanProductFee) => {
    setFees(prev => {
      const idx = prev.findIndex(f => f.id === fee.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = fee; return next.sort((a, b) => a.order - b.order); }
      return [...prev, fee].sort((a, b) => a.order - b.order);
    });
    setShowFeeForm(false);
    setEditingFee(null);
  };

  const handleDeleteFee = async (feeId: number) => {
    setDeletingFeeId(feeId);
    try {
      await loanService.deleteProductFee(feeId);
      setFees(prev => prev.filter(f => f.id !== feeId));
    } catch {
      // silently ignore
    } finally {
      setDeletingFeeId(null);
    }
  };

  // Requirement handlers
  const handleReqSaved = (req: LoanProductSavingsRequirement) => {
    setRequirements(prev => {
      const idx = prev.findIndex(r => r.id === req.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = req; return next; }
      return [...prev, req];
    });
    setShowReqForm(false);
    setEditingReq(null);
  };

  const handleDeleteReq = async (reqId: number) => {
    setDeletingReqId(reqId);
    try {
      await loanService.deleteSavingsRequirement(reqId);
      setRequirements(prev => prev.filter(r => r.id !== reqId));
    } catch {
      // silently ignore
    } finally {
      setDeletingReqId(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/loans/products')}
            aria-label="Back to loan products"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold text-gray-900">
              {product ? `Configure: ${product.name}` : 'Loan Product Configuration'}
            </h1>
            <p className="text-xs text-gray-500">Manage fees and savings requirements for this product</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-gray-800 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Product Settings
          </button>
          <button
            onClick={() => setActiveTab('fees')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'fees'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BadgeDollarSign className="w-4 h-4" />
            Fee Lines
            {fees.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'fees' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>{fees.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('savings_requirements')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'savings_requirements'
                ? 'bg-green-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Savings Requirements
            {requirements.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'savings_requirements' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
              }`}>{requirements.length}</span>
            )}
          </button>
        </div>

        {/* ── TAB: PRODUCT SETTINGS ── */}
        {activeTab === 'settings' && (
          <form onSubmit={handleSettingsSave} className="space-y-5">
            {settingsError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {settingsError}
              </div>
            )}
            {settingsSaved && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700">
                Settings saved successfully.
              </div>
            )}

            {/* Interest */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Interest &amp; Calculation</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Annual Interest Rate (%)</label>
                  <input
                    type="number" min={0} max={100} step="0.01"
                    value={settingsForm.default_interest_rate ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, default_interest_rate: e.target.value }))}
                    placeholder="15.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Calculation Method</label>
                  <select
                    value={settingsForm.interest_calculation_method ?? 'straight_line'}
                    onChange={e => setSettingsForm(p => ({ ...p, interest_calculation_method: e.target.value as LoanProduct['interest_calculation_method'] }))}
                    aria-label="Interest calculation method"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="straight_line">Straight Line</option>
                    <option value="reducing_balance">Reducing Balance</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Deferred / Unearned Interest Income */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-1">Deferred Interest Income (Optional)</h3>
              <p className="text-xs text-gray-400 mb-4">
                Leave these blank to keep the default behavior (interest income credited only
                when a payment is collected). Set all three to instead book the full scheduled
                interest immediately and permanently at disbursement, deferred via a liability
                and recognized as earned per the repayment schedule's due dates.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Interest Income Account</label>
                  <select
                    value={settingsForm.interest_income_account ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, interest_income_account: e.target.value ? Number(e.target.value) : null }))}
                    aria-label="Interest income account"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">— Select account —</option>
                    {incomeAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Unearned Interest Income (Liability)</label>
                  <select
                    value={settingsForm.unearned_interest_income_account ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, unearned_interest_income_account: e.target.value ? Number(e.target.value) : null }))}
                    aria-label="Unearned interest income account"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">— Select account —</option>
                    {liabilityAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Interest Receivable Account</label>
                  <select
                    value={settingsForm.accrued_interest_account ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, accrued_interest_account: e.target.value ? Number(e.target.value) : null }))}
                    aria-label="Interest receivable account"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">— Select account —</option>
                    {assetAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Interest Write-off Expense Account</label>
                  <select
                    value={settingsForm.interest_writeoff_expense_account ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, interest_writeoff_expense_account: e.target.value ? Number(e.target.value) : null }))}
                    aria-label="Interest write-off expense account"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="">— Select account —</option>
                    {expenseAccounts.map(a => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    Used only if a loan under this product is written off with remaining unearned interest.
                  </p>
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
                    value={settingsForm.min_loan_amount ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, min_loan_amount: e.target.value }))}
                    placeholder="1000.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Max Loan Amount (₦)</label>
                  <input type="number" min={0} step="0.01"
                    value={settingsForm.max_loan_amount ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, max_loan_amount: e.target.value }))}
                    placeholder="10000000.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>

                {/* Term Unit — determines what min/max term values mean */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Term Unit</label>
                  <div className="flex gap-3">
                    {(['days', 'weeks', 'months'] as const).map(u => (
                      <label key={u} className={`flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm cursor-pointer transition-colors capitalize ${
                        settingsForm.term_unit === u
                          ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}>
                        <input
                          type="radio"
                          name="term_unit"
                          className="hidden"
                          checked={settingsForm.term_unit === u}
                          onChange={() => setSettingsForm(p => ({ ...p, term_unit: u }))}
                        />
                        {u.charAt(0).toUpperCase() + u.slice(1)}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    Min/Max term values below are expressed in this unit. Loan officers will enter the term in {settingsForm.term_unit ?? 'months'} when applying.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Min Term ({settingsForm.term_unit ?? 'months'})
                  </label>
                  <input type="number" min={1}
                    value={settingsForm.min_term_months ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, min_term_months: Number(e.target.value) }))}
                    placeholder="1"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Max Term ({settingsForm.term_unit ?? 'months'})
                  </label>
                  <input type="number" min={1}
                    value={settingsForm.max_term_months ?? ''}
                    onChange={e => setSettingsForm(p => ({ ...p, max_term_months: Number(e.target.value) }))}
                    placeholder="120"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>

                {/* First-repayment buffer */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    First Repayment Buffer (days)
                  </label>
                  <input type="number" min={0}
                    value={settingsForm.first_repayment_buffer_days ?? 0}
                    onChange={e => setSettingsForm(p => ({ ...p, first_repayment_buffer_days: Number(e.target.value) }))}
                    placeholder="0"
                    className="w-48 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Minimum calendar days from disbursement before the first installment is due.
                    0 = first repayment follows normal cadence. E.g. 14 means the first weekly
                    repayment won't fall before day 14.
                  </p>
                </div>
              </div>
            </div>

            {/* Repayment Frequencies */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Allowed Repayment Frequencies</h3>
              <p className="text-xs text-gray-400 mb-3">Select all schedules this product supports.</p>
              <div className="flex flex-wrap gap-3">
                {FREQ_OPTIONS.map(f => {
                  const checked = ((settingsForm.allowed_repayment_frequencies ?? []) as string[]).includes(f.value);
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

            {/* Fees */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">Legacy Processing Fee (Product-Level)</h3>
              <p className="text-xs text-gray-400 mb-3">Use the Fee Lines tab for the new per-fee GL system. This field is for legacy compatibility.</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fee Type</label>
                  <select
                    value={settingsForm.processing_fee_type ?? 'percentage'}
                    onChange={e => setSettingsForm(p => ({ ...p, processing_fee_type: e.target.value as 'fixed' | 'percentage' }))}
                    aria-label="Processing fee type"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="percentage">Percentage</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                {settingsForm.processing_fee_type === 'fixed' ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₦)</label>
                    <input type="number" min={0} step="0.01"
                      value={settingsForm.processing_fee_amount ?? '0'}
                      onChange={e => setSettingsForm(p => ({ ...p, processing_fee_amount: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Percentage (%)</label>
                    <input type="number" min={0} max={100} step="0.01"
                      value={settingsForm.processing_fee_percentage ?? '0'}
                      onChange={e => setSettingsForm(p => ({ ...p, processing_fee_percentage: e.target.value }))}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Insurance Rate (%)</label>
                  <input type="number" min={0} max={100} step="0.01"
                    value={settingsForm.insurance_rate ?? '0'}
                    onChange={e => setSettingsForm(p => ({ ...p, insurance_rate: e.target.value }))}
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
                    value={settingsForm.late_payment_penalty_type ?? 'percentage'}
                    onChange={e => setSettingsForm(p => ({ ...p, late_payment_penalty_type: e.target.value as 'fixed' | 'percentage' }))}
                    aria-label="Penalty type"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  >
                    <option value="percentage">Percentage of Outstanding</option>
                    <option value="fixed">Fixed Amount</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {settingsForm.late_payment_penalty_type === 'fixed' ? 'Penalty Amount (₦)' : 'Penalty Rate (%)'}
                  </label>
                  <input type="number" min={0} step="0.01"
                    value={settingsForm.late_payment_penalty ?? '0'}
                    onChange={e => setSettingsForm(p => ({ ...p, late_payment_penalty: e.target.value }))}
                    placeholder="0.00"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Grace Period (days)</label>
                  <input type="number" min={0}
                    value={settingsForm.grace_period_days ?? 0}
                    onChange={e => setSettingsForm(p => ({ ...p, grace_period_days: Number(e.target.value) }))}
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
                    checked={settingsForm.requires_approval ?? true}
                    onChange={e => setSettingsForm(p => ({ ...p, requires_approval: e.target.checked }))}
                  />
                  Requires approval before disbursement
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300"
                    checked={settingsForm.requires_collateral ?? false}
                    onChange={e => setSettingsForm(p => ({ ...p, requires_collateral: e.target.checked }))}
                  />
                  Requires collateral
                </label>
                {settingsForm.requires_collateral && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Collateral % of Loan</label>
                    <input type="number" min={0} max={200} step="0.01"
                      value={settingsForm.collateral_percentage ?? '0'}
                      onChange={e => setSettingsForm(p => ({ ...p, collateral_percentage: e.target.value }))}
                      placeholder="100"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" className="rounded border-gray-300"
                    checked={settingsForm.requires_guarantor ?? false}
                    onChange={e => setSettingsForm(p => ({ ...p, requires_guarantor: e.target.checked }))}
                  />
                  Requires guarantor
                </label>
                {settingsForm.requires_guarantor && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Guarantors</label>
                    <input type="number" min={1}
                      value={settingsForm.min_guarantors ?? 1}
                      onChange={e => setSettingsForm(p => ({ ...p, min_guarantors: Number(e.target.value) }))}
                      placeholder="1"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="submit" disabled={settingsSaving}
                className="flex items-center gap-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {settingsSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save Settings
              </button>
            </div>
          </form>
        )}

        {/* ── TAB: FEE LINES ── */}
        {activeTab === 'fees' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Income Fee Lines</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Each fee is posted to its own GL income account at the configured trigger point.
                </p>
              </div>
              {!showFeeForm && !editingFee && (
                <button
                  onClick={() => setShowFeeForm(true)}
                  className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Fee
                </button>
              )}
            </div>

            {feesError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {feesError}
              </div>
            )}

            {/* Add form */}
            {showFeeForm && !editingFee && (
              <FeeLineForm
                productId={productId}
                incomeAccounts={incomeAccounts}
                savingsProducts={savingsProducts}
                onSaved={handleFeeSaved}
                onCancel={() => setShowFeeForm(false)}
              />
            )}

            {feesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : fees.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <BadgeDollarSign className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No fee lines configured yet.</p>
                <p className="text-xs text-gray-400 mt-1">Click "Add Fee" to create your first fee line.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount / %</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">GL Account</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Post At</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Debit To</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {fees.map(fee => (
                      <React.Fragment key={fee.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{fee.order}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{fee.name}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              fee.fee_type === 'fixed'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-purple-100 text-purple-700'
                            }`}>
                              {fee.fee_type === 'fixed' ? 'Fixed' : 'Percentage'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {fee.fee_type === 'fixed'
                              ? `₦${fmt(fee.fixed_amount)}`
                              : `${fmt(fee.percentage)}%`}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs">
                            {fee.gl_income_account_name ?? `Account #${fee.gl_income_account}`}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600">
                            {fee.posting_trigger === 'registration' ? 'At Registration'
                              : fee.posting_trigger === 'approval' ? 'At Approval'
                              : 'At Disbursement'}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {fee.debit_destination === 'cashier' && (
                              <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">Cashier</span>
                            )}
                            {fee.debit_destination === 'savings' && (
                              <span className="bg-indigo-100 text-indigo-700 rounded px-1.5 py-0.5">
                                Savings{fee.default_savings_product_name ? ` (${fee.default_savings_product_name})` : ''}
                              </span>
                            )}
                            {fee.debit_destination === 'user_choice' && (
                              <span className="bg-amber-100 text-amber-700 rounded px-1.5 py-0.5">User Chooses</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block w-2 h-2 rounded-full ${fee.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditingFee(fee); setShowFeeForm(false); }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteFee(fee.id)}
                                disabled={deletingFeeId === fee.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingFeeId === fee.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editingFee?.id === fee.id && (
                          <tr>
                            <td colSpan={9} className="px-4 py-2">
                              <FeeLineForm
                                productId={productId}
                                initial={editingFee}
                                incomeAccounts={incomeAccounts}
                                savingsProducts={savingsProducts}
                                onSaved={handleFeeSaved}
                                onCancel={() => setEditingFee(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: SAVINGS REQUIREMENTS ── */}
        {activeTab === 'savings_requirements' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Savings Balance Requirements</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  A client must meet ALL active requirements before a loan can be created (hard block).
                </p>
              </div>
              {!showReqForm && !editingReq && (
                <button
                  onClick={() => setShowReqForm(true)}
                  className="flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add Requirement
                </button>
              )}
            </div>

            {reqError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {reqError}
              </div>
            )}

            {/* Add form */}
            {showReqForm && !editingReq && (
              <SavingsRequirementForm
                productId={productId}
                savingsProducts={savingsProducts}
                onSaved={handleReqSaved}
                onCancel={() => setShowReqForm(false)}
              />
            )}

            {reqLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-green-500" />
              </div>
            ) : requirements.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-10 text-center">
                <ShieldCheck className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No savings requirements configured.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Without a requirement, loans can be created regardless of savings balance.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Savings Product</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requirement</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Value</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {requirements.map(req => (
                      <React.Fragment key={req.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {req.savings_product_name ?? `Product #${req.savings_product}`}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              req.requirement_type === 'percentage'
                                ? 'bg-teal-100 text-teal-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {req.requirement_type === 'percentage' ? '% of loan' : 'Fixed amount'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {req.requirement_type === 'percentage'
                              ? `${fmt(req.value)}%`
                              : `₦${fmt(req.value)}`}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block w-2 h-2 rounded-full ${req.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditingReq(req); setShowReqForm(false); }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteReq(req.id)}
                                disabled={deletingReqId === req.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingReqId === req.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editingReq?.id === req.id && (
                          <tr>
                            <td colSpan={5} className="px-4 py-2">
                              <SavingsRequirementForm
                                productId={productId}
                                initial={editingReq}
                                savingsProducts={savingsProducts}
                                onSaved={handleReqSaved}
                                onCancel={() => setEditingReq(null)}
                              />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
