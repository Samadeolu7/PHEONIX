/**
 * Savings Product Config Page
 * Configure behaviour rules for a specific savings product.
 * Route: /savings/products/:id/config
 *
 * Sections:
 *   1. Daily Contribution Settings  — first-deposit-as-income config
 *   2. Savings Cycle Settings       — cycle length, interest rate, break penalty
 *   3. Withdrawal Controls          — manager-only, approval required
 */

import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Loader2,
  Save,
  ChevronLeft,
  Calendar,
  RefreshCw,
  Lock,
  Settings2,
} from 'lucide-react';
import { api as apiClient } from '../../api';
import {
  getSavingsProductConfig,
  createSavingsProductConfig,
  updateSavingsProductConfig,
  SavingsProductConfig,
} from '../../services/savingsService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer select-none group">
      <div className="relative flex-shrink-0 mt-0.5">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
        />
        <div className={`w-10 h-5 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-200'}`} />
        <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-800">{label}</p>
        {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function AccountSelect({
  label,
  description,
  value,
  onChange,
  accounts,
  required,
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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {description && <p className="text-xs text-gray-500 mb-1.5">{description}</p>}
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
        aria-label={label}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option value="">— Select account —</option>
        {accounts.map(a => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );
}

function NumberInput({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  description?: string;
  value: string | number | null;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string | number;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {description && <p className="text-xs text-gray-500 mb-1.5">{description}</p>}
      <div className="relative">
        <input
          type="number"
          min={min}
          max={max}
          step={step ?? '0.01'}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          title={label}
          placeholder="0"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 pr-12"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>
        )}
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SavingsProductConfigPage() {
  const { id } = useParams<{ id: string }>();
  const productId = Number(id);
  const navigate = useNavigate();

  const [productName, setProductName] = useState<string>('');
  const [configId, setConfigId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // GL account lists
  const [incomeAccounts, setIncomeAccounts] = useState<Account[]>([]);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);

  // Form state — Daily Contribution
  const [isDailyContribution, setIsDailyContribution] = useState(false);
  const [firstDepositIsIncome, setFirstDepositIsIncome] = useState(false);
  const [firstDepositIncomeAccount, setFirstDepositIncomeAccount] = useState<number | null>(null);

  // Form state — Savings Cycle
  const [hasSavingsCycle, setHasSavingsCycle] = useState(false);
  const [cycleLengthMonths, setCycleLengthMonths] = useState<string>('3');
  const [cycleInterestRate, setCycleInterestRate] = useState<string>('0');
  const [cycleBreakPenaltyRate, setCycleBreakPenaltyRate] = useState<string>('0');
  const [cycleAutoRenew, setCycleAutoRenew] = useState(true);

  // Form state — GL Accounts
  const [interestExpenseAccount, setInterestExpenseAccount] = useState<number | null>(null);
  const [penaltyIncomeAccount, setPenaltyIncomeAccount] = useState<number | null>(null);

  // Form state — Withdrawal Controls
  const [withdrawalNeedsApproval, setWithdrawalNeedsApproval] = useState(true);
  const [onlyAccountManagerCanWithdraw, setOnlyAccountManagerCanWithdraw] = useState(true);

  // Load GL accounts
  useEffect(() => {
    accountService.getAccounts({ account_type: 'INCOME' }).then((data: any) => {
      setIncomeAccounts(Array.isArray(data) ? data : (data?.results ?? []));
    }).catch(() => {});
    accountService.getAccounts({ account_type: 'EXPENSE' }).then((data: any) => {
      setExpenseAccounts(Array.isArray(data) ? data : (data?.results ?? []));
    }).catch(() => {});
  }, []);

  // Load product name
  useEffect(() => {
    apiClient.get(`/products/${productId}/`).then((p: any) => {
      setProductName(p?.name ?? '');
    }).catch(() => {});
  }, [productId]);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const configs = await getSavingsProductConfig(productId);
      const cfg: SavingsProductConfig | undefined = Array.isArray(configs) ? configs[0] : undefined;
      if (cfg) {
        setConfigId(cfg.id);
        setIsDailyContribution(cfg.is_daily_contribution);
        setFirstDepositIsIncome(cfg.first_deposit_is_income);
        setFirstDepositIncomeAccount(cfg.first_deposit_income_account);
        setHasSavingsCycle(cfg.has_savings_cycle);
        setCycleLengthMonths(String(cfg.cycle_length_months ?? 3));
        setCycleInterestRate(String(cfg.cycle_interest_rate ?? 0));
        setCycleBreakPenaltyRate(String(cfg.cycle_break_penalty_rate ?? 0));
        setCycleAutoRenew(cfg.cycle_auto_renew);
        setInterestExpenseAccount(cfg.interest_expense_account);
        setPenaltyIncomeAccount(cfg.penalty_income_account);
        setWithdrawalNeedsApproval(cfg.withdrawal_needs_approval);
        setOnlyAccountManagerCanWithdraw(cfg.only_account_manager_can_withdraw);
      }
    } catch (e: any) {
      // 404 is fine — config doesn't exist yet
      if (e?.status !== 404) {
        setError(e?.message ?? 'Failed to load configuration.');
      }
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // Validation
    if (hasSavingsCycle && !interestExpenseAccount) {
      setError('An interest expense account is required when savings cycle is enabled.');
      return;
    }
    if (hasSavingsCycle && !penaltyIncomeAccount) {
      setError('A penalty income account is required when savings cycle is enabled.');
      return;
    }
    if (firstDepositIsIncome && !firstDepositIncomeAccount) {
      setError('A first-deposit income account is required when "first deposit is income" is enabled.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const payload: Partial<SavingsProductConfig> = {
        product: productId,
        interest_expense_account: interestExpenseAccount,
        penalty_income_account: penaltyIncomeAccount,
        is_daily_contribution: isDailyContribution,
        first_deposit_is_income: firstDepositIsIncome,
        first_deposit_income_account: firstDepositIsIncome ? firstDepositIncomeAccount : null,
        has_savings_cycle: hasSavingsCycle,
        cycle_length_months: hasSavingsCycle ? Number(cycleLengthMonths) : null,
        cycle_interest_rate: hasSavingsCycle ? cycleInterestRate : null,
        cycle_break_penalty_rate: hasSavingsCycle ? cycleBreakPenaltyRate : null,
        cycle_auto_renew: cycleAutoRenew,
        withdrawal_needs_approval: withdrawalNeedsApproval,
        only_account_manager_can_withdraw: onlyAccountManagerCanWithdraw,
      };
      if (configId) {
        await updateSavingsProductConfig(configId, payload);
      } else {
        const created = await createSavingsProductConfig(payload);
        setConfigId(created.id);
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: any) {
      const detail = e?.details ?? e?.message ?? 'Failed to save configuration.';
      setError(typeof detail === 'object' ? JSON.stringify(detail) : String(detail));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center gap-4">
          <button
            onClick={() => navigate('/savings/products')}
            aria-label="Back to savings products"
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">
              {productName ? `Configure: ${productName}` : 'Savings Product Configuration'}
            </h1>
            <p className="text-xs text-gray-500">Define behaviour rules for this savings product</p>
          </div>
          <button
            onClick={loadConfig}
            disabled={loading}
            className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Reload
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-3xl mx-auto px-6 py-6 space-y-6">

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-medium">
              Configuration saved successfully.
            </div>
          )}

          {/* ── Section 1: Daily Contribution ── */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                <Calendar className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Daily Contribution (Ajo / Thrift)</h2>
                <p className="text-xs text-gray-500">Configure daily deposit behaviour for this product</p>
              </div>
            </div>

            <div className="space-y-5">
              <Toggle
                checked={isDailyContribution}
                onChange={setIsDailyContribution}
                label="Daily contribution product"
                description="Members are expected to pay a fixed amount every day until month-end."
              />

              {isDailyContribution && (
                <div className="ml-13 border-l-2 border-blue-100 pl-5 space-y-4">
                  <Toggle
                    checked={firstDepositIsIncome}
                    onChange={setFirstDepositIsIncome}
                    label="First deposit of each month is income"
                    description="The very first payment made to this account each calendar month goes directly to income — it does not credit the savings balance."
                  />
                  {firstDepositIsIncome && (
                    <AccountSelect
                      label="First-deposit income account"
                      description="The GL income account to credit when the first deposit is posted."
                      value={firstDepositIncomeAccount}
                      onChange={setFirstDepositIncomeAccount}
                      accounts={incomeAccounts}
                      required
                    />
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ── Section 2: Savings Cycle ── */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
                <RefreshCw className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Savings Cycle (Smart Savings)</h2>
                <p className="text-xs text-gray-500">
                  Locked cycle with interest on completion and penalty on early withdrawal
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <Toggle
                checked={hasSavingsCycle}
                onChange={setHasSavingsCycle}
                label="Enable savings cycle"
                description="The account locks savings for a configurable number of months. Interest is paid on completion; a penalty is charged on early withdrawal."
              />

              {hasSavingsCycle && (
                <div className="border-l-2 border-purple-100 pl-5 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <NumberInput
                      label="Cycle length (months)"
                      description="How long one cycle lasts."
                      value={cycleLengthMonths}
                      onChange={setCycleLengthMonths}
                      min={1}
                      step={1}
                      suffix="months"
                    />
                    <NumberInput
                      label="Completion interest rate"
                      description="Interest credited to the account when cycle completes successfully."
                      value={cycleInterestRate}
                      onChange={setCycleInterestRate}
                      min={0}
                      max={100}
                      step="0.01"
                      suffix="%"
                    />
                    <NumberInput
                      label="Early break penalty rate"
                      description="Percentage deducted from the balance when a cycle is broken early."
                      value={cycleBreakPenaltyRate}
                      onChange={setCycleBreakPenaltyRate}
                      min={0}
                      max={100}
                      step="0.01"
                      suffix="%"
                    />
                  </div>

                  <Toggle
                    checked={cycleAutoRenew}
                    onChange={setCycleAutoRenew}
                    label="Auto-renew cycle on completion"
                    description="Automatically start a new cycle after the current one matures."
                  />

                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <AccountSelect
                      label="Interest expense account"
                      description="Debited when cycle interest is paid out."
                      value={interestExpenseAccount}
                      onChange={setInterestExpenseAccount}
                      accounts={expenseAccounts}
                      required
                    />
                    <AccountSelect
                      label="Penalty income account"
                      description="Credited when an early-break penalty is charged."
                      value={penaltyIncomeAccount}
                      onChange={setPenaltyIncomeAccount}
                      accounts={incomeAccounts}
                      required
                    />
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── Section 3: Withdrawal Controls ── */}
          <section className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Withdrawal Controls</h2>
                <p className="text-xs text-gray-500">Who can initiate and approve withdrawals on this product</p>
              </div>
            </div>

            <div className="space-y-5">
              <Toggle
                checked={onlyAccountManagerCanWithdraw}
                onChange={setOnlyAccountManagerCanWithdraw}
                label="Only the client's relationship manager can request withdrawals"
                description="Withdrawals must be initiated by the staff member assigned as the client's account manager."
              />
              <Toggle
                checked={withdrawalNeedsApproval}
                onChange={setWithdrawalNeedsApproval}
                label="Withdrawals require approval"
                description="All withdrawal requests go through tiered approval before funds are released. Configure approval tiers separately under Savings → Withdrawal Tiers."
              />
            </div>

            {withdrawalNeedsApproval && (
              <div className="mt-4 bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-start gap-2 text-xs text-blue-700">
                <Settings2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Approval thresholds are configured globally in{' '}
                  <strong>Savings → Withdrawal Approval Tiers</strong>.
                  Tiers match withdrawals by amount and require the configured number of approvers.
                </span>
              </div>
            )}
          </section>

          {/* Save button */}
          <div className="flex justify-end gap-3 pb-6">
            <button
              type="button"
              onClick={() => navigate('/savings/products')}
              className="px-5 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {configId ? 'Update Configuration' : 'Save Configuration'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
