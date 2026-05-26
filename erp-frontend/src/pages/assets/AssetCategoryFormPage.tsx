/**
 * Asset Category Form Page — Create & Edit
 *
 * Handles GL account configuration for each fixed-asset category.
 * Three required accounts must be set before depreciation can be posted:
 *   1. Asset Account          (balance-sheet asset / PP&E)
 *   2. Depreciation Expense   (P&L charge per period)
 *   3. Accumulated Depr.      (contra-asset on balance sheet)
 *
 * A fourth optional account covers maintenance expenses.
 *
 * Routes:
 *   /assets/categories/create
 *   /assets/categories/:id/edit
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  useAssetCategory,
  useCreateAssetCategory,
  useUpdateAssetCategory,
} from '../../hooks/useAssets';
import { accountService } from '../../services/accountService';
import type { Account } from '../../types/accounts';
import type { CreateAssetCategoryRequest, DepreciationMethod } from '../../types/assets';
import Card, { CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ArrowLeft, Save, BookOpen, DollarSign, Settings } from 'lucide-react';

// ── constants ─────────────────────────────────────────────────────────────────

const DEPRECIATION_METHODS: { value: DepreciationMethod; label: string }[] = [
  { value: 'straight_line', label: 'Straight Line' },
  { value: 'declining_balance', label: 'Declining Balance' },
  { value: 'units_of_production', label: 'Units of Production' },
];

// ── AccountSelect ─────────────────────────────────────────────────────────────

interface AccountSelectProps {
  label: string;
  hint?: string;
  required?: boolean;
  value: number | null | undefined;
  onChange: (id: number | null) => void;
  accounts: Account[];
  filterType?: 'ASSET' | 'EXPENSE' | 'LIABILITY' | 'EQUITY' | 'INCOME';
  error?: string;
  loading?: boolean;
}

const AccountSelect: React.FC<AccountSelectProps> = ({
  label,
  hint,
  required,
  value,
  onChange,
  accounts,
  filterType,
  error,
  loading,
}) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const filtered = accounts
    .filter(a => !filterType || a.type === filterType)
    .filter(
      a =>
        !search ||
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        (a.code && a.code.toLowerCase().includes(search.toLowerCase()))
    );

  const selected = accounts.find(a => parseInt(a.id) === value);

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
      {hint && <p className="text-xs text-gray-500 mb-1">{hint}</p>}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`w-full px-3 py-2 text-left border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? 'border-red-400' : 'border-gray-300'
        } ${loading ? 'opacity-60 cursor-not-allowed' : 'bg-white hover:border-gray-400'}`}
        disabled={loading}
      >
        {loading ? (
          <span className="text-gray-400">Loading accounts…</span>
        ) : selected ? (
          <span className="text-gray-900">
            {selected.code ? `[${selected.code}] ` : ''}
            {selected.name}
          </span>
        ) : (
          <span className="text-gray-400">— Select account —</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts…"
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {value != null && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
              >
                — Clear selection —
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No accounts match</p>
            ) : (
              filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    onChange(parseInt(a.id));
                    setOpen(false);
                    setSearch('');
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                    parseInt(a.id) === value
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-700'
                  }`}
                >
                  {a.code && <span className="text-gray-400 mr-1">[{a.code}]</span>}
                  {a.name}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
};

// ── main form ─────────────────────────────────────────────────────────────────

interface FormState {
  name: string;
  code: string;
  description: string;
  default_depreciation_method: DepreciationMethod;
  default_useful_life_years: number;
  default_salvage_value_percentage: string;
  asset_account: number | null;
  depreciation_account: number | null;
  accumulated_depreciation_account: number | null;
  maintenance_expense_account: number | null;
}

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  description: '',
  default_depreciation_method: 'straight_line',
  default_useful_life_years: 5,
  default_salvage_value_percentage: '10.00',
  asset_account: null,
  depreciation_account: null,
  accumulated_depreciation_account: null,
  maintenance_expense_account: null,
};

const AssetCategoryFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEditing = Boolean(id);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Load existing category when editing
  const { data: existing, isLoading: loadingExisting } = useAssetCategory(
    isEditing ? parseInt(id!) : 0
  );

  // Load all GL accounts for pickers
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<Account[]>({
    queryKey: ['accounts', 'all'],
    queryFn: () => accountService.getAccounts(),
    staleTime: 5 * 60 * 1000,
  });

  const createMutation = useCreateAssetCategory();
  const updateMutation = useUpdateAssetCategory();

  // Populate form when editing
  useEffect(() => {
    if (isEditing && existing) {
      setForm({
        name: existing.name,
        code: existing.code,
        description: existing.description ?? '',
        default_depreciation_method: existing.default_depreciation_method,
        default_useful_life_years: existing.default_useful_life_years,
        default_salvage_value_percentage: existing.default_salvage_value_percentage,
        asset_account: existing.asset_account ?? null,
        depreciation_account: existing.depreciation_account ?? null,
        accumulated_depreciation_account: existing.accumulated_depreciation_account ?? null,
        maintenance_expense_account: existing.maintenance_expense_account ?? null,
      });
    }
  }, [isEditing, existing]);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 5000);
  };

  const set = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const n = { ...prev };
        delete n[field];
        return n;
      });
    }
  };

  const validate = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.code.trim()) e.code = 'Code is required';
    if (!form.default_depreciation_method) e.default_depreciation_method = 'Select a method';
    if (!form.default_useful_life_years || form.default_useful_life_years < 1)
      e.default_useful_life_years = 'Useful life must be at least 1 year';
    if (!form.default_salvage_value_percentage.trim())
      e.default_salvage_value_percentage = 'Salvage % is required';
    if (!form.asset_account) e.asset_account = 'Asset account is required';
    if (!form.depreciation_account)
      e.depreciation_account = 'Depreciation expense account is required';
    if (!form.accumulated_depreciation_account)
      e.accumulated_depreciation_account = 'Accumulated depreciation account is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateAssetCategoryRequest = {
      name: form.name.trim(),
      code: form.code.trim(),
      description: form.description.trim() || undefined,
      default_depreciation_method: form.default_depreciation_method,
      default_useful_life_years: form.default_useful_life_years,
      default_salvage_value_percentage: form.default_salvage_value_percentage,
      asset_account: form.asset_account!,
      depreciation_account: form.depreciation_account!,
      accumulated_depreciation_account: form.accumulated_depreciation_account!,
      maintenance_expense_account: form.maintenance_expense_account ?? undefined,
    };

    try {
      if (isEditing) {
        await updateMutation.mutateAsync({ id: parseInt(id!), data: payload });
        showToast('Category updated successfully.');
      } else {
        await createMutation.mutateAsync(payload);
        showToast('Category created successfully.');
      }
      navigate('/assets/categories');
    } catch (err: unknown) {
      const apiErr = err as { response?: { data?: Record<string, unknown> } };
      if (apiErr.response?.data) {
        const apiErrors: Partial<Record<keyof FormState, string>> = {};
        Object.entries(apiErr.response.data).forEach(([k, v]) => {
          apiErrors[k as keyof FormState] = Array.isArray(v) ? String(v[0]) : String(v);
        });
        setErrors(apiErrors);
      } else {
        showToast('Failed to save category. Please try again.');
      }
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  if (isEditing && loadingExisting) {
    return (
      <div className="container mx-auto p-6 text-center text-sm text-gray-500">
        Loading category…
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-3xl">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-4 right-4 z-50 bg-gray-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm max-w-sm">
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Back to categories"
          onClick={() => navigate('/assets/categories')}
          className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditing ? 'Edit Asset Category' : 'New Asset Category'}
          </h1>
          <p className="text-sm text-gray-500">
            {isEditing
              ? 'Update GL account mappings and depreciation defaults'
              : 'Configure GL accounts before assets can be depreciated'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ── Basic Details ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4 text-blue-500" />
              Basic Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => set('name', e.target.value)}
                  placeholder="e.g. Office Equipment"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.name ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
              </div>

              {/* Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => set('code', e.target.value.toUpperCase())}
                  placeholder="e.g. OFC-EQUIP"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono ${
                    errors.code ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {errors.code && <p className="mt-1 text-xs text-red-600">{errors.code}</p>}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={2}
                placeholder="Optional description…"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Depreciation Defaults ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4 text-purple-500" />
              Depreciation Defaults
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Method */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Depreciation Method <span className="text-red-500">*</span>
              </label>
              <select
                aria-label="Default Depreciation Method"
                value={form.default_depreciation_method}
                onChange={e =>
                  set('default_depreciation_method', e.target.value as DepreciationMethod)
                }
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.default_depreciation_method ? 'border-red-400' : 'border-gray-300'
                }`}
              >
                {DEPRECIATION_METHODS.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {errors.default_depreciation_method && (
                <p className="mt-1 text-xs text-red-600">{errors.default_depreciation_method}</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Useful Life */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Useful Life (years) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={form.default_useful_life_years}
                  onChange={e => set('default_useful_life_years', parseInt(e.target.value) || 1)}
                  placeholder="e.g. 5"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.default_useful_life_years ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {errors.default_useful_life_years && (
                  <p className="mt-1 text-xs text-red-600">{errors.default_useful_life_years}</p>
                )}
              </div>

              {/* Salvage % */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Salvage Value (%) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={100}
                  value={form.default_salvage_value_percentage}
                  onChange={e => set('default_salvage_value_percentage', e.target.value)}
                  placeholder="10.00"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.default_salvage_value_percentage ? 'border-red-400' : 'border-gray-300'
                  }`}
                />
                {errors.default_salvage_value_percentage && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.default_salvage_value_percentage}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── GL Account Mapping ────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <DollarSign className="h-4 w-4 text-green-500" />
              GL Account Mapping
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-xs text-gray-500 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              The first three accounts are required before depreciation entries can be posted.
              Assign accounts appropriate for your chart of accounts.
            </p>

            {/* Asset Account */}
            <AccountSelect
              label="Asset Account"
              hint="Balance-sheet account for the gross asset value (e.g. Property, Plant & Equipment)"
              required
              value={form.asset_account}
              onChange={id => set('asset_account', id)}
              accounts={accounts}
              filterType="ASSET"
              error={errors.asset_account}
              loading={loadingAccounts}
            />

            {/* Accumulated Depreciation Account */}
            <AccountSelect
              label="Accumulated Depreciation Account"
              hint="Contra-asset account that accumulates depreciation charges over time"
              required
              value={form.accumulated_depreciation_account}
              onChange={id => set('accumulated_depreciation_account', id)}
              accounts={accounts}
              filterType="ASSET"
              error={errors.accumulated_depreciation_account}
              loading={loadingAccounts}
            />

            {/* Depreciation Expense Account */}
            <AccountSelect
              label="Depreciation Expense Account"
              hint="P&L account charged with the periodic depreciation expense"
              required
              value={form.depreciation_account}
              onChange={id => set('depreciation_account', id)}
              accounts={accounts}
              filterType="EXPENSE"
              error={errors.depreciation_account}
              loading={loadingAccounts}
            />

            {/* Maintenance Expense Account (optional) */}
            <AccountSelect
              label="Maintenance Expense Account"
              hint="Optional — P&L account for maintenance / repair costs on assets in this category"
              value={form.maintenance_expense_account}
              onChange={id => set('maintenance_expense_account', id)}
              accounts={accounts}
              filterType="EXPENSE"
              error={errors.maintenance_expense_account}
              loading={loadingAccounts}
            />
          </CardContent>
        </Card>

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate('/assets/categories')}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <Button type="submit" disabled={isBusy}>
            <Save className="h-4 w-4 mr-2" />
            {isBusy ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Category'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AssetCategoryFormPage;
