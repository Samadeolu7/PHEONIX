/**
 * Savings Withdrawals Page
 * Four tabs:
 *   1. My Approvals      — requests awaiting the current user's approval step
 *   2. Pending Disburse  — fully-approved requests waiting for a disburser
 *   3. All Withdrawals   — browse all requests (branch-scoped; directors see all)
 *   4. Approval Tiers    — configure global tiered approval rules
 *
 * Route: /savings/withdrawals
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  Layers,
  BellRing,
  Settings2,
  Landmark,
  Building2,
  Send,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type {
  SavingsWithdrawalRequest,
  WithdrawalApprovalTier,
  WithdrawalStatus,
} from '../../services/savingsService';
import { cancelWithdrawal } from '../../services/savingsService';
import {
  usePendingMyApproval,
  usePendingDisburse,
  useWithdrawals,
  useApproveWithdrawalStep,
  useDisburseWithdrawal,
  useWithdrawalTiers,
  useCreateWithdrawalTier,
  useUpdateWithdrawalTier,
  useDeleteWithdrawalTier,
} from '../../hooks/useSavings';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(v: string | number | null | undefined): string {
  const n = parseFloat(String(v ?? '0'));
  return isNaN(n) ? '—' : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const STATUS_STYLES: Record<WithdrawalStatus, string> = {
  pending:            'bg-yellow-100 text-yellow-700',
  partially_approved: 'bg-blue-100 text-blue-700',
  fully_approved:     'bg-teal-100 text-teal-700',
  completed:          'bg-green-100 text-green-700',
  rejected:           'bg-red-100 text-red-700',
  cancelled:          'bg-gray-100 text-gray-500',
};

const STATUS_LABELS: Record<WithdrawalStatus, string> = {
  pending:            'Pending',
  partially_approved: 'Partially Approved',
  fully_approved:     'Fully Approved',
  completed:          'Completed',
  rejected:           'Rejected',
  cancelled:          'Cancelled',
};

// ── Sub-component: Approval action modal ────────────────────────────────────

interface ApproveModalProps {
  withdrawal: SavingsWithdrawalRequest;
  onDone: (updated: SavingsWithdrawalRequest) => void;
  onClose: () => void;
}

function ApproveModal({ withdrawal, onDone, onClose }: ApproveModalProps) {
  const [approved, setApproved] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Payment method selection (only needed on first step)
  const needsPaymentMethod = !withdrawal.payment_method;
  const CASH_LIMIT = 50000;
  const amountNum = parseFloat(withdrawal.amount);
  const forceBankTransfer = amountNum >= CASH_LIMIT;
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'bank'>(
    forceBankTransfer ? 'bank' : 'bank'  // default to bank; user can switch to cash if < 50k
  );
  const [cashierAccounts, setCashierAccounts] = useState<Account[]>([]);
  const [cashierAccountId, setCashierAccountId] = useState<number | ''>('');

  useEffect(() => {
    if (needsPaymentMethod) {
      accountService.getAccounts({ account_type: 'ASSET' }).then(setCashierAccounts).catch(() => {});
    }
  }, [needsPaymentMethod]);

  const approveMutation = useApproveWithdrawalStep({
    onSuccess: (updated) => { onDone(updated); },
    onError: (e) => { setError(e?.message ?? e?.detail ?? 'Action failed.'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (approved === null) { setError('Please select Approve or Reject.'); return; }
    if (approved && needsPaymentMethod) {
      if (paymentMethod === 'cash' && !cashierAccountId) {
        setError('Please select a cashier account for cash disbursement.');
        return;
      }
    }
    setError(null);
    const payload: any = { approved, comment };
    if (approved && needsPaymentMethod) {
      payload.payment_method = paymentMethod;
      if (paymentMethod === 'cash') payload.cashier_account = cashierAccountId as number;
    }
    approveMutation.mutate({ withdrawalId: withdrawal.id, data: payload });
  };

  const pendingStep = withdrawal.approval_steps?.find(s => s.status === 'pending');
  const withdrawable = withdrawal.account_current_balance != null && withdrawal.account_minimum_balance != null
    ? parseFloat(withdrawal.account_current_balance) - parseFloat(withdrawal.account_minimum_balance)
    : null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Review Withdrawal Request</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Step {pendingStep?.step_number ?? '?'} of {withdrawal.required_approvals} — {withdrawal.account_number}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount banner */}
        <div className="px-5 py-4 bg-yellow-50 border-b border-yellow-100">
          <p className="text-xs text-yellow-700 font-medium uppercase tracking-wide">Withdrawal Amount</p>
          <p className="text-2xl font-bold text-yellow-900">₦{fmt(withdrawal.amount)}</p>
          {withdrawal.description && (
            <p className="text-sm text-yellow-800 mt-1 italic">"{withdrawal.description}"</p>
          )}
        </div>

        {/* Withdrawal details */}
        <div className="px-5 pt-4 pb-2">
          <div className="grid grid-cols-2 gap-3 text-sm">
            {/* Client */}
            <div className="col-span-2 bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Client</p>
              <p className="font-semibold text-gray-900">{withdrawal.client_name}</p>
              {withdrawal.client_phone && <p className="text-xs text-gray-500">{withdrawal.client_phone}</p>}
            </div>
            {/* Product */}
            {withdrawal.product_name && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Product</p>
                <p className="font-medium text-gray-800">{withdrawal.product_name}</p>
              </div>
            )}
            {/* Tier */}
            <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
              <p className="text-xs text-gray-400 mb-0.5">Approval Tier</p>
              <p className="font-medium text-gray-800">{withdrawal.applied_tier_name ?? 'Default (1 approver)'}</p>
            </div>
            {/* Current balance */}
            {withdrawal.account_current_balance != null && (
              <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                <p className="text-xs text-gray-400 mb-0.5">Current Balance</p>
                <p className="font-semibold text-gray-900">₦{fmt(withdrawal.account_current_balance)}</p>
              </div>
            )}
            {/* Withdrawable */}
            {withdrawable != null && (
              <div className={`rounded-lg p-3 border ${
                parseFloat(withdrawal.amount) > withdrawable
                  ? 'bg-red-50 border-red-200'
                  : 'bg-green-50 border-green-200'
              }`}>
                <p className="text-xs text-gray-400 mb-0.5">Available to Withdraw</p>
                <p className={`font-semibold ${
                  parseFloat(withdrawal.amount) > withdrawable ? 'text-red-700' : 'text-green-700'
                }`}>₦{fmt(withdrawable)}</p>
                {parseFloat(withdrawal.amount) > withdrawable && (
                  <p className="text-xs text-red-600 mt-0.5">Requested exceeds available!</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Approval steps audit trail */}
        {withdrawal.approval_steps?.length > 0 && (
          <div className="mx-5 mb-2 rounded-lg border border-gray-200 overflow-hidden">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 bg-gray-50 border-b border-gray-200">Approval Chain</p>
            <div className="divide-y divide-gray-100">
              {withdrawal.approval_steps.map(s => (
                <div key={s.id} className="px-3 py-2 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">Step {s.step_number}</span>
                    <span className={`px-2 py-0.5 rounded-full font-medium ${
                      s.status === 'approved' ? 'bg-green-100 text-green-700'
                      : s.status === 'rejected' ? 'bg-red-100 text-red-700'
                      : 'bg-yellow-100 text-yellow-700'
                    }`}>{s.status.charAt(0).toUpperCase() + s.status.slice(1)}</span>
                  </div>
                  <span className="text-gray-500">{s.approver_name ?? (s.status === 'pending' ? 'Awaiting approver' : '—')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4 mt-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Decision */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Your Decision</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setApproved(true)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  approved === true
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 text-gray-600 hover:border-green-300'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> Approve
              </button>
              <button
                type="button"
                onClick={() => setApproved(false)}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  approved === false
                    ? 'border-red-500 bg-red-50 text-red-700'
                    : 'border-gray-200 text-gray-600 hover:border-red-300'
                }`}
              >
                <XCircle className="w-4 h-4" /> Reject
              </button>
            </div>
          </div>

          {/* Payment method — only on first approval step (when not yet set) */}
          {approved === true && needsPaymentMethod && (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 space-y-3">
              <p className="text-sm font-semibold text-blue-800 flex items-center gap-1.5">
                <Landmark className="w-4 h-4" /> Select Payment Method
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={forceBankTransfer}
                  onClick={() => setPaymentMethod('cash')}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    paymentMethod === 'cash'
                      ? 'border-blue-500 bg-white text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-blue-300'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  💵 Cash
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod('bank')}
                  className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                    paymentMethod === 'bank'
                      ? 'border-blue-500 bg-white text-blue-700'
                      : 'border-gray-200 bg-white text-gray-500 hover:border-blue-300'
                  }`}
                >
                  🏦 Bank Transfer
                </button>
              </div>
              {forceBankTransfer && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                  Amounts ≥ ₦50,000 must be disbursed via bank transfer.
                </p>
              )}

              {/* Cashier account selector — cash only */}
              {paymentMethod === 'cash' && (
                <div>
                  <label className="block text-xs font-medium text-blue-800 mb-1">
                    Cashier Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={cashierAccountId}
                    onChange={e => setCashierAccountId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full border border-blue-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                  >
                    <option value="">Select cashier / cash account</option>
                    {cashierAccounts.map(a => (
                      <option key={a.id} value={a.id}>
                        {a.name} {a.code ? `(${a.code})` : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-blue-600 mt-1">Funds will be paid out from this GL account.</p>
                </div>
              )}
              {paymentMethod === 'bank' && (
                <p className="text-xs text-blue-600">
                  The Director will select the organisation bank account at disbursal time.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment {approved === false ? '(required for rejection)' : '(optional)'}</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Add a note for the audit trail..."
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={approveMutation.isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {approveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Submit Decision
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-component: Disbursement modal ────────────────────────────────────────

interface DisburseModalProps {
  withdrawal: SavingsWithdrawalRequest;
  onDone: (updated: SavingsWithdrawalRequest) => void;
  onClose: () => void;
}

function DisburseModal({ withdrawal, onDone, onClose }: DisburseModalProps) {
  const isCash = withdrawal.payment_method === 'cash';
  const isBank = withdrawal.payment_method === 'bank';

  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Only need bank accounts list for bank disbursements
    if (isBank) {
      bankService.listBankAccounts({ is_active: true }).then(setBankAccounts).catch(() => {});
    }
  }, [isBank]);

  const disburseMutation = useDisburseWithdrawal({
    onSuccess: (updated) => { onDone(updated); },
    onError: (e) => { setError(e?.message ?? e?.detail ?? 'Disbursement failed.'); },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isBank && typeof selectedBankId !== 'number') {
      setError('Please select an organisation bank account to disburse from.');
      return;
    }
    setError(null);
    const payload: { destination_bank_account?: number } = {};
    if (isBank && typeof selectedBankId === 'number') {
      payload.destination_bank_account = selectedBankId;
    }
    disburseMutation.mutate({ id: withdrawal.id, data: payload });
  };

  const hasClientBankDetails = !!(withdrawal.client_bank_account_number);

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Disburse Withdrawal</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {withdrawal.account_number} — {withdrawal.client_name}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full text-gray-400 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount + payment method banner */}
        <div className={`px-5 py-4 border-b flex items-center justify-between ${
          isCash ? 'bg-orange-50 border-orange-100' : 'bg-teal-50 border-teal-100'
        }`}>
          <div>
            <p className={`text-xs font-medium uppercase tracking-wide ${isCash ? 'text-orange-600' : 'text-teal-600'}`}>
              {isCash ? '💵 Cash Withdrawal' : '🏦 Bank Transfer'}
            </p>
            <p className={`text-2xl font-bold ${isCash ? 'text-orange-900' : 'text-teal-800'}`}>
              ₦{fmt(withdrawal.amount)}
            </p>
            <p className={`text-xs mt-0.5 ${isCash ? 'text-orange-600' : 'text-teal-600'}`}>
              {withdrawal.client_name}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            isCash
              ? 'bg-orange-100 text-orange-700 border-orange-200'
              : 'bg-teal-100 text-teal-700 border-teal-200'
          }`}>
            {isCash ? 'CASH' : 'BANK'}
          </span>
        </div>

        {/* ── CASH PATH: show cashier account, confirm only ── */}
        {isCash && (
          <div className="px-5 py-4">
            <div className="rounded-xl bg-orange-50 border border-orange-200 p-4 space-y-3">
              <p className="text-xs font-semibold text-orange-800 uppercase tracking-wide">
                Cash Payout Details
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="bg-white rounded-lg border border-orange-100 p-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Client</p>
                  <p className="font-semibold text-gray-900">{withdrawal.client_name}</p>
                  {withdrawal.client_phone && (
                    <p className="text-xs text-gray-500">{withdrawal.client_phone}</p>
                  )}
                </div>
                <div className="bg-white rounded-lg border border-orange-100 p-2.5">
                  <p className="text-xs text-gray-400 mb-0.5">Cashier Account</p>
                  <p className="font-semibold text-gray-900">
                    {withdrawal.cashier_account_name ?? `Account #${withdrawal.cashier_account}`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Funds debited from this account</p>
                </div>
              </div>
              <div className="flex justify-between border-t border-orange-200 pt-3">
                <span className="text-sm text-gray-500">Amount to pay out:</span>
                <span className="text-base font-bold text-orange-800">₦{fmt(withdrawal.amount)}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── BANK PATH: client details + org bank selector ── */}
        {isBank && (
          <>
            {/* Client bank "Pay To" panel */}
            <div className={`mx-5 mt-4 rounded-xl border-2 p-4 ${
              hasClientBankDetails ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-blue-800 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5" />
                  Pay To — Member Bank Details
                </h4>
                {!hasClientBankDetails && (
                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                    No bank details on file
                  </span>
                )}
              </div>
              {hasClientBankDetails ? (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white rounded-lg border border-blue-100 p-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Bank</p>
                    <p className="text-sm font-semibold text-gray-900">{withdrawal.client_bank_name || '—'}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-blue-100 p-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Account Name</p>
                    <p className="text-sm font-semibold text-gray-900">{withdrawal.client_bank_account_name || '—'}</p>
                  </div>
                  <div className="bg-white rounded-lg border border-blue-100 p-2.5">
                    <p className="text-xs text-gray-400 mb-0.5">Account No.</p>
                    <p className="text-sm font-mono font-bold text-gray-900 tracking-wider">{withdrawal.client_bank_account_number}</p>
                  </div>
                  {withdrawal.client_bvn && (
                    <div className="col-span-3 flex items-center gap-2 pt-1 border-t border-blue-100 text-xs text-gray-500">
                      <span className="font-medium">BVN:</span>
                      <span className="font-mono tracking-wider text-gray-700">{withdrawal.client_bvn}</span>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-amber-600">Update the member's profile with bank details before disbursing.</p>
              )}
            </div>

            {/* Transfer summary */}
            <div className="mx-5 mt-3 rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm space-y-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Transfer Summary</p>
              <div className="flex justify-between">
                <span className="text-gray-500">To:</span>
                <span className="font-semibold text-gray-900">{withdrawal.client_name}</span>
              </div>
              {withdrawal.client_bank_account_number && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Account:</span>
                  <span className="font-mono font-bold text-gray-900 tracking-wider">{withdrawal.client_bank_account_number}</span>
                </div>
              )}
              {withdrawal.client_bank_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Bank:</span>
                  <span className="font-medium text-gray-900">{withdrawal.client_bank_name}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 mt-2">
                <span className="text-gray-500">Amount:</span>
                <span className="font-bold text-teal-700 text-base">₦{fmt(withdrawal.amount)}</span>
              </div>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}

          {/* Bank: org bank account selector */}
          {isBank && (
            <div>
              <label htmlFor="disburse-bank-select" className="block text-sm font-medium text-gray-700 mb-1">
                Disbursement Bank Account (Organisation) <span className="text-red-500">*</span>
              </label>
              <select
                id="disburse-bank-select"
                value={selectedBankId}
                onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : '')}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                required
              >
                <option value="">Select org bank account to debit</option>
                {bankAccounts.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bank_name} — {b.account_number} ({b.account_name})
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Funds will be deducted from this organisation account.</p>
            </div>
          )}

          {/* Cash: confirmation note */}
          {isCash && (
            <div className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              Confirming will deduct ₦{fmt(withdrawal.amount)} from the selected cashier account and mark this withdrawal as completed.
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={disburseMutation.isPending}
              className={`flex-1 flex items-center justify-center gap-2 text-white text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50 ${
                isCash
                  ? 'bg-orange-500 hover:bg-orange-600'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              {disburseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {isCash ? 'Confirm Cash Payout' : 'Confirm Bank Transfer'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Sub-component: Withdrawal row with expandable steps ─────────────────────

interface WithdrawalRowProps {
  wr: SavingsWithdrawalRequest;
  onApprove?: (wr: SavingsWithdrawalRequest) => void;
  onCancel?: (wr: SavingsWithdrawalRequest) => void;
  onDisburse?: (wr: SavingsWithdrawalRequest) => void;
  showApproveButton?: boolean;
}

function WithdrawalRow({ wr, onApprove, onCancel, onDisburse, showApproveButton }: WithdrawalRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMutation = useDeleteWithdrawalTier ? undefined : undefined; // We use the service directly for cancel
  const handleCancel = async () => {
    setCancelError(null);
    try {
      const updated = await cancelWithdrawal(wr.id);
      onCancel?.(updated);
    } catch (e: any) {
      setCancelError(e?.detail ?? e?.message ?? 'Cancel failed.');
    }
  };

  return (
    <>
      {cancelError && (
        <tr>
          <td colSpan={7} className="px-4 py-1">
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-1.5 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {cancelError}
            </div>
          </td>
        </tr>
      )}
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900 text-sm">{wr.client_name ?? '—'}</div>
          <div className="text-xs text-gray-400">{wr.account_number}</div>
          {wr.description && (
            <div className="text-xs text-gray-500 mt-0.5 italic truncate max-w-[180px]" title={wr.description}>
              "{wr.description}"
            </div>
          )}
        </td>
        <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">
          ₦{fmt(wr.amount)}
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${STATUS_STYLES[wr.status]}`}>
            {STATUS_LABELS[wr.status]}
          </span>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {wr.approvals_received}/{wr.required_approvals}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {wr.requested_by_name ?? `#${wr.requested_by}`}
        </td>
        <td className="px-4 py-3 text-xs text-gray-400">
          {new Date(wr.created_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            {showApproveButton && wr.status !== 'completed' && wr.status !== 'rejected' && wr.status !== 'cancelled' && (
              <button
                onClick={() => onApprove?.(wr)}
                className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-lg transition-colors"
              >
                Review
              </button>
            )}
            {(wr.status === 'pending' || wr.status === 'partially_approved') && (
              <button
                onClick={handleCancel}
                disabled={false}
                className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {wr.status === 'fully_approved' && (
              <button
                onClick={() => onDisburse?.(wr)}
                className="text-xs bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1 rounded-lg transition-colors"
              >
                <Landmark className="w-3 h-3 inline mr-1" />
                Disburse
              </button>
            )}
            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
              title="View steps"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </td>
      </tr>
      {expanded && wr.approval_steps?.length > 0 && (
        <tr>
          <td colSpan={7} className="px-6 pb-3 bg-gray-50">
            <div className="border border-gray-200 rounded-xl overflow-hidden mt-1">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Step</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Approver</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Status</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Comment</th>
                    <th className="text-left px-3 py-2 font-semibold text-gray-500">Responded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {wr.approval_steps.map(step => (
                    <tr key={step.id}>
                      <td className="px-3 py-2 text-gray-500">{step.step_number}</td>
                      <td className="px-3 py-2 text-gray-700">{step.approver_name ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full ${
                          step.status === 'approved'
                            ? 'bg-green-100 text-green-700'
                            : step.status === 'rejected'
                            ? 'bg-red-100 text-red-700'
                            : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {step.status.charAt(0).toUpperCase() + step.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{step.comment || '—'}</td>
                      <td className="px-3 py-2 text-gray-400">
                        {step.responded_at
                          ? new Date(step.responded_at).toLocaleString('en-NG', { dateStyle: 'short', timeStyle: 'short' })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Sub-component: Tier form ──────────────────────────────────────────────

interface TierFormProps {
  initial?: WithdrawalApprovalTier;
  onSaved: (tier: WithdrawalApprovalTier) => void;
  onCancel: () => void;
}

const COMMON_ROLES = ['Director', 'Branch Manager', 'Accountant', 'Senior Loan Officer', 'Operations Manager'];

function TierForm({ initial, onSaved, onCancel }: TierFormProps) {
  const isEdit = !!initial;
  const [tierName, setTierName] = useState(initial?.tier_name ?? '');
  const [minAmount, setMinAmount] = useState(initial?.min_amount ?? '0');
  const [maxAmount, setMaxAmount] = useState(initial?.max_amount ?? '');
  const [requiredApprovers, setRequiredApprovers] = useState(initial?.required_approvers ?? 1);
  const [roles, setRoles] = useState<string[]>(initial?.approver_roles ?? []);
  const [roleInput, setRoleInput] = useState('');
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [order, setOrder] = useState(initial?.order ?? 1);
  const [error, setError] = useState<string | null>(null);

  const createTierMutation = useCreateWithdrawalTier({
    onSuccess: (tier) => { onSaved(tier); },
    onError: (e) => { setError(e?.message ?? 'Failed to save tier.'); },
  });

  const updateTierMutation = useUpdateWithdrawalTier({
    onSuccess: (tier) => { onSaved(tier); },
    onError: (e) => { setError(e?.message ?? 'Failed to save tier.'); },
  });

  const saving = createTierMutation.isPending || updateTierMutation.isPending;

  const addRole = (role: string) => {
    const r = role.trim();
    if (r && !roles.includes(r)) setRoles(prev => [...prev, r]);
    setRoleInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierName.trim()) { setError('Tier name is required.'); return; }
    setError(null);
    const payload: Partial<WithdrawalApprovalTier> = {
      tier_name: tierName.trim(),
      min_amount: minAmount,
      max_amount: maxAmount || null,
      required_approvers: requiredApprovers,
      approver_roles: roles,
      is_active: isActive,
      order,
    };
    if (isEdit) {
      updateTierMutation.mutate({ id: initial!.id, data: payload });
    } else {
      createTierMutation.mutate(payload);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-3"
    >
      <p className="text-sm font-semibold text-purple-800 mb-3">{isEdit ? 'Edit Tier' : 'Add Approval Tier'}</p>
      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-xs font-medium text-gray-600 mb-1">Tier Name *</label>
          <input
            type="text"
            value={tierName}
            onChange={e => setTierName(e.target.value)}
            placeholder="e.g. Small Amounts"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Display Order</label>
          <input
            type="number"
            min={1}
            value={order}
            onChange={e => setOrder(Number(e.target.value))}
            title="Display order"
            placeholder="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Minimum Amount (₦)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={minAmount}
            onChange={e => setMinAmount(e.target.value)}
            title="Minimum amount"
            placeholder="0.00"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Maximum Amount (₦, blank = no limit)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={maxAmount}
            onChange={e => setMaxAmount(e.target.value)}
            placeholder="No limit"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Required Approvals</label>
          <input
            type="number"
            min={1}
            max={10}
            value={requiredApprovers}
            onChange={e => setRequiredApprovers(Number(e.target.value))}
            title="Required number of approvals"
            placeholder="1"
            className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
          />
        </div>
        {/* Role picker */}
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Eligible Approver Roles</label>
          <div className="flex gap-2 mb-2 flex-wrap">
            {COMMON_ROLES.map(r => (
              <button
                key={r}
                type="button"
                onClick={() => addRole(r)}
                disabled={roles.includes(r)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                  roles.includes(r)
                    ? 'border-purple-400 bg-purple-100 text-purple-700'
                    : 'border-gray-200 text-gray-600 hover:border-purple-300 hover:bg-purple-50'
                }`}
              >
                {roles.includes(r) ? '✓ ' : '+ '}{r}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={roleInput}
              onChange={e => setRoleInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRole(roleInput); } }}
              placeholder="Custom role name, press Enter"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400"
            />
          </div>
          {roles.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {roles.map(r => (
                <span
                  key={r}
                  className="flex items-center gap-1 text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full"
                >
                  {r}
                  <button type="button" onClick={() => setRoles(prev => prev.filter(x => x !== r))} className="hover:text-red-600">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            id="tier-active"
            checked={isActive}
            onChange={e => setIsActive(e.target.checked)}
            className="rounded border-gray-300"
          />
          <label htmlFor="tier-active" className="text-sm text-gray-700">Active</label>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {isEdit ? 'Update' : 'Add Tier'}
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

type Tab = 'my_approvals' | 'pending_disburse' | 'all' | 'tiers';

const PAGE_SIZE = 25;

export default function SavingsWithdrawalsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('my_approvals');

  const [approveTarget, setApproveTarget] = useState<SavingsWithdrawalRequest | null>(null);
  const [disburseTarget, setDisburseTarget] = useState<SavingsWithdrawalRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState('');
  const [allPage, setAllPage] = useState(1);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<WithdrawalApprovalTier | null>(null);
  const [deletingTierId, setDeletingTierId] = useState<number | null>(null);

  // Query hooks
  const { data: pendingApprovals = [], isLoading: pendingLoading, error: pendingError, refetch: loadPending } = usePendingMyApproval();
  const { data: pendingDisburse = [], isLoading: pendingDisburseLoading, error: pendingDisburseError, refetch: loadPendingDisburse } = usePendingDisburse();
  const { data: allData, isLoading: allLoading, error: allError, refetch: loadAll } = useWithdrawals({
    ...(statusFilter ? { status: statusFilter } : {}),
    page: allPage,
    page_size: PAGE_SIZE,
  });
  const allWithdrawals = allData?.results ?? [];
  const allTotal = allData?.count ?? 0;
  const { data: tiersData = [], isLoading: tiersLoading, error: tiersError, refetch: loadTiers } = useWithdrawalTiers();
  const tiers = [...tiersData].sort((a, b) => a.order - b.order);

  // Mutation hooks
  const approveMutation = useApproveWithdrawalStep({
    onSuccess: () => {
      loadPending();
      setApproveTarget(null);
    },
  });

  const disburseMutation = useDisburseWithdrawal({
    onSuccess: () => {
      loadPendingDisburse();
      setDisburseTarget(null);
    },
  });

  const createTierMutation = useCreateWithdrawalTier({
    onSuccess: () => {
      loadTiers();
      setShowTierForm(false);
    },
  });

  const updateTierMutation = useUpdateWithdrawalTier({
    onSuccess: () => {
      loadTiers();
      setEditingTier(null);
    },
  });

  const deleteTierMutation = useDeleteWithdrawalTier({
    onSuccess: () => { loadTiers(); },
  });

  useEffect(() => { if (activeTab === 'all') loadAll(); }, [activeTab, loadAll]);
  useEffect(() => { setAllPage(1); }, [statusFilter]);

  // Called after approve/disburse/cancel actions complete
  const handleActionDone = () => {
    loadPending();
    loadPendingDisburse();
    loadAll();
    setApproveTarget(null);
    setDisburseTarget(null);
  };

  const handleTierSaved = (_tier?: WithdrawalApprovalTier) => {
    loadTiers();
    setShowTierForm(false);
    setEditingTier(null);
  };

  const handleDeleteTier = (tierId: number) => {
    setDeletingTierId(tierId);
    deleteTierMutation.mutate(tierId, {
      onSettled: () => { setDeletingTierId(null); },
    });
  };

  const STATUSES = ['', 'pending', 'partially_approved', 'fully_approved', 'completed', 'rejected', 'cancelled'];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Savings Withdrawals</h1>
            <p className="text-xs text-gray-500">Manage withdrawal requests and approval tiers</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Tab bar */}
        <div className="flex flex-wrap gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          <button
            onClick={() => setActiveTab('my_approvals')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'my_approvals'
                ? 'bg-yellow-500 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <BellRing className="w-4 h-4" />
            My Approvals
            {pendingApprovals.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'my_approvals' ? 'bg-yellow-400 text-white' : 'bg-red-100 text-red-700'
              }`}>{pendingApprovals.length}</span>
            )}
          </button>
          <button
            onClick={() => { setActiveTab('pending_disburse'); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'pending_disburse'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Send className="w-4 h-4" />
            Pending Disburse
            {pendingDisburse.length > 0 && (
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === 'pending_disburse' ? 'bg-teal-400 text-white' : 'bg-teal-100 text-teal-700'
              }`}>{pendingDisburse.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('all')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'all'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Layers className="w-4 h-4" />
            All Withdrawals
          </button>
          <button
            onClick={() => setActiveTab('tiers')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'tiers'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            Approval Tiers
          </button>
        </div>

        {/* ── TAB: MY APPROVALS ── */}
        {activeTab === 'my_approvals' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">
                Showing withdrawal steps that are awaiting your review.
              </p>
              <button
                onClick={loadPending}
                disabled={pendingLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${pendingLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {pendingError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {pendingError}
              </div>
            )}

            {pendingLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-yellow-500" />
              </div>
            ) : pendingApprovals.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
                <Clock className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No pending approvals</p>
                <p className="text-xs text-gray-400 mt-1">You're all caught up.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingApprovals.map(wr => (
                      <WithdrawalRow
                        key={wr.id}
                        wr={wr}
                        showApproveButton
                        onApprove={setApproveTarget}
                        onCancel={handleActionDone}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: PENDING DISBURSE ── */}
        {activeTab === 'pending_disburse' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-gray-500">
                Fully-approved requests awaiting disbursement. You must be a different person from the requester and all approvers.
              </p>
              <button
                onClick={loadPendingDisburse}
                disabled={pendingDisburseLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${pendingDisburseLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {pendingDisburseError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {pendingDisburseError}
              </div>
            )}

            {pendingDisburseLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
              </div>
            ) : pendingDisburse.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
                <Send className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 font-medium">No requests awaiting disbursement</p>
                <p className="text-xs text-gray-400 mt-1">Fully-approved withdrawals will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Bank Details</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {pendingDisburse.map(wr => (
                      <tr key={wr.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 text-sm">{wr.client_name ?? '—'}</div>
                          <div className="text-xs text-gray-400">{wr.account_number}</div>
                          {wr.client_phone && <div className="text-xs text-gray-400">{wr.client_phone}</div>}
                        </td>
                        <td className="px-4 py-3">
                          {wr.client_bank_account_number ? (
                            <div>
                              <div className="text-xs font-mono font-semibold text-gray-800">{wr.client_bank_account_number}</div>
                              <div className="text-xs text-gray-500">{wr.client_bank_name}</div>
                            </div>
                          ) : (
                            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">No bank details</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-gray-800">₦{fmt(wr.amount)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className="text-xs text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-full">
                            {wr.approvals_received}/{wr.required_approvals} approved
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600">{wr.requested_by_name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs text-gray-400">{new Date(wr.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => setDisburseTarget(wr)}
                            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <Send className="w-3.5 h-3.5" /> Disburse
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: ALL WITHDRAWALS ── */}
        {activeTab === 'all' && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">All Statuses</option>
                {STATUSES.slice(1).map(s => (
                  <option key={s} value={s}>{STATUS_LABELS[s as WithdrawalStatus]}</option>
                ))}
              </select>
              <button
                onClick={loadAll}
                disabled={allLoading}
                className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors ml-auto"
              >
                <RefreshCw className={`w-4 h-4 ${allLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            {allError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {allError}
              </div>
            )}

            {allLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : allWithdrawals.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
                <Layers className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No withdrawal requests found.</p>
              </div>
            ) : (
              <>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Client</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Requested By</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allWithdrawals.map(wr => (
                      <WithdrawalRow
                        key={wr.id}
                        wr={wr}
                        showApproveButton={false}
                        onCancel={handleActionDone}
                        onDisburse={setDisburseTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {allTotal > PAGE_SIZE && (
                <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
                  <span>{((allPage - 1) * PAGE_SIZE) + 1}–{Math.min(allPage * PAGE_SIZE, allTotal)} of {allTotal}</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setAllPage(p => Math.max(1, p - 1))}
                      disabled={allPage === 1}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setAllPage(p => p + 1)}
                      disabled={allPage * PAGE_SIZE >= allTotal}
                      className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: APPROVAL TIERS ── */}
        {activeTab === 'tiers' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-800">Global Withdrawal Approval Tiers</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Tiers match withdrawals by amount range. The first matching active tier is applied.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadTiers}
                  disabled={tiersLoading}
                  aria-label="Refresh tiers"
                  className="flex items-center gap-1.5 text-sm text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
                >
                  <RefreshCw className={`w-4 h-4 ${tiersLoading ? 'animate-spin' : ''}`} />
                </button>
                {!showTierForm && !editingTier && (
                  <button
                    onClick={() => setShowTierForm(true)}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Add Tier
                  </button>
                )}
              </div>
            </div>

            {tiersError && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 mb-4 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /> {tiersError}
              </div>
            )}

            {showTierForm && !editingTier && (
              <TierForm
                onSaved={handleTierSaved}
                onCancel={() => setShowTierForm(false)}
              />
            )}

            {tiersLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-purple-500" />
              </div>
            ) : tiers.length === 0 ? (
              <div className="bg-white rounded-xl border border-dashed border-gray-300 p-14 text-center">
                <Settings2 className="w-9 h-9 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">No approval tiers configured.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Without tiers, withdrawals are processed based on the product's approval setting.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Tier Name</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Min Amount</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Max Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Approvals</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Eligible Roles</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Active</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tiers.map(tier => (
                      <React.Fragment key={tier.id}>
                        <tr className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{tier.order}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{tier.tier_name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(tier.min_amount)}</td>
                          <td className="px-4 py-3 text-right text-gray-500">
                            {tier.max_amount ? `₦${fmt(tier.max_amount)}` : '∞'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                              {tier.required_approvers}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {(tier.approver_roles ?? []).map(r => (
                                <span key={r} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r}</span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-block w-2 h-2 rounded-full ${tier.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button
                                onClick={() => { setEditingTier(tier); setShowTierForm(false); }}
                                className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTier(tier.id)}
                                disabled={deletingTierId === tier.id}
                                className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                                title="Delete"
                              >
                                {deletingTierId === tier.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {editingTier?.id === tier.id && (
                          <tr>
                            <td colSpan={8} className="px-4 py-2">
                              <TierForm
                                initial={editingTier}
                                onSaved={handleTierSaved}
                                onCancel={() => setEditingTier(null)}
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

      {/* Approve modal */}
      {approveTarget && (
        <ApproveModal
          withdrawal={approveTarget}
          onDone={handleActionDone}
          onClose={() => setApproveTarget(null)}
        />
      )}

      {/* Disburse modal */}
      {disburseTarget && (
        <DisburseModal
          withdrawal={disburseTarget}
          onDone={handleActionDone}
          onClose={() => setDisburseTarget(null)}
        />
      )}
    </div>
  );
}
