/**
 * Savings Withdrawals Page
 * Three tabs:
 *   1. My Approvals  — steps waiting for the current user to approve/reject
 *   2. All Withdrawals — browse all requests (branch-scoped; directors see all)
 *   3. Approval Tiers  — configure global tiered approval rules
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
} from 'lucide-react';
import {
  SavingsWithdrawalRequest,
  WithdrawalApprovalTier,
  WithdrawalStatus,
  getPendingMyApproval,
  getWithdrawals,
  approveWithdrawalStep,
  cancelWithdrawal,
  disburseWithdrawal,
  getWithdrawalTiers,
  createWithdrawalTier,
  updateWithdrawalTier,
  deleteWithdrawalTier,
} from '../../services/savingsService';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (approved === null) { setError('Please select Approve or Reject.'); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await approveWithdrawalStep(withdrawal.id, { approved, comment });
      onDone(updated);
    } catch (e: any) {
      setError(e?.message ?? e?.detail ?? 'Action failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Review Withdrawal</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {withdrawal.client_name} — ₦{fmt(withdrawal.amount)}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Decision</p>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment (optional)</label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none"
              placeholder="Add a note for the audit trail..."
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Submit
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
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
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bankService.listBankAccounts({ is_active: true }).then(setBankAccounts);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (typeof selectedBankId !== 'number') { setError('Please select a destination bank account.'); return; }
    setSaving(true);
    setError(null);
    try {
      const updated = await disburseWithdrawal(withdrawal.id, {
        destination_bank_account: selectedBankId,
      });
      onDone(updated);
    } catch (e: any) {
      setError(e?.message ?? e?.detail ?? 'Disbursement failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Disburse Withdrawal</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {withdrawal.client_name} — ₦{fmt(withdrawal.amount)}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Destination Bank Account *
            </label>
            <select
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : '')}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              required
            >
              <option value="">Select bank account</option>
              {bankAccounts.map(b => (
                <option key={b.id} value={b.id}>
                  {b.bank_display_name || b.bank_name} — {b.account_number} ({b.account_name})
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white text-sm py-2 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              Disburse
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <X className="w-4 h-4" />
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
  const [cancelling, setCancelling] = useState(false);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const updated = await cancelWithdrawal(wr.id);
      onCancel?.(updated);
    } catch {
      // silent
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <div className="font-medium text-gray-900 text-sm">{wr.client_name ?? '—'}</div>
          <div className="text-xs text-gray-400">{wr.account_number}</div>
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
                disabled={cancelling}
                className="text-xs text-gray-500 border border-gray-200 px-2.5 py-1 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="w-3 h-3 animate-spin inline" /> : 'Cancel'}
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addRole = (role: string) => {
    const r = role.trim();
    if (r && !roles.includes(r)) setRoles(prev => [...prev, r]);
    setRoleInput('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tierName.trim()) { setError('Tier name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload: Partial<WithdrawalApprovalTier> = {
        tier_name: tierName.trim(),
        min_amount: minAmount,
        max_amount: maxAmount || null,
        required_approvers: requiredApprovers,
        approver_roles: roles,
        is_active: isActive,
        order,
      };
      const saved = isEdit
        ? await updateWithdrawalTier(initial!.id, payload)
        : await createWithdrawalTier(payload);
      onSaved(saved);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to save tier.');
    } finally {
      setSaving(false);
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

type Tab = 'my_approvals' | 'all' | 'tiers';

export default function SavingsWithdrawalsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('my_approvals');

  // My approvals
  const [pendingApprovals, setPendingApprovals] = useState<SavingsWithdrawalRequest[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<SavingsWithdrawalRequest | null>(null);
  const [disburseTarget, setDisburseTarget] = useState<SavingsWithdrawalRequest | null>(null);

  // All withdrawals
  const [allWithdrawals, setAllWithdrawals] = useState<SavingsWithdrawalRequest[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('');

  // Approval tiers
  const [tiers, setTiers] = useState<WithdrawalApprovalTier[]>([]);
  const [tiersLoading, setTiersLoading] = useState(false);
  const [tiersError, setTiersError] = useState<string | null>(null);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<WithdrawalApprovalTier | null>(null);
  const [deletingTierId, setDeletingTierId] = useState<number | null>(null);

  const loadPending = useCallback(async () => {
    setPendingLoading(true);
    setPendingError(null);
    try {
      const data = await getPendingMyApproval();
      setPendingApprovals(data);
    } catch (e: any) {
      setPendingError(e?.message ?? 'Failed to load pending approvals.');
    } finally {
      setPendingLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setAllLoading(true);
    setAllError(null);
    try {
      const data = await getWithdrawals(statusFilter ? { status: statusFilter } : undefined);
      setAllWithdrawals(data);
    } catch (e: any) {
      setAllError(e?.message ?? 'Failed to load withdrawals.');
    } finally {
      setAllLoading(false);
    }
  }, [statusFilter]);

  const loadTiers = useCallback(async () => {
    setTiersLoading(true);
    setTiersError(null);
    try {
      const data = await getWithdrawalTiers();
      setTiers(data.sort((a, b) => a.order - b.order));
    } catch (e: any) {
      setTiersError(e?.message ?? 'Failed to load tiers.');
    } finally {
      setTiersLoading(false);
    }
  }, []);

  useEffect(() => { loadPending(); }, [loadPending]);
  useEffect(() => { if (activeTab === 'all') loadAll(); }, [activeTab, loadAll]);
  useEffect(() => { if (activeTab === 'tiers') loadTiers(); }, [activeTab, loadTiers]);

  // Update a withdrawal in state after approval / disbursement action
  const patchWithdrawal = (updated: SavingsWithdrawalRequest) => {
    setPendingApprovals(prev => prev.filter(w => w.id !== updated.id || 
      (updated.status !== 'completed' && updated.status !== 'rejected')));
    setAllWithdrawals(prev => prev.map(w => w.id === updated.id ? updated : w));
    setApproveTarget(null);
    setDisburseTarget(null);
  };

  // Tiers handlers
  const handleTierSaved = (tier: WithdrawalApprovalTier) => {
    setTiers(prev => {
      const idx = prev.findIndex(t => t.id === tier.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = tier; return next.sort((a, b) => a.order - b.order); }
      return [...prev, tier].sort((a, b) => a.order - b.order);
    });
    setShowTierForm(false);
    setEditingTier(null);
  };

  const handleDeleteTier = async (tierId: number) => {
    setDeletingTierId(tierId);
    try {
      await deleteWithdrawalTier(tierId);
      setTiers(prev => prev.filter(t => t.id !== tierId));
    } catch {
      // silent
    } finally {
      setDeletingTierId(null);
    }
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
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 w-fit">
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
                        onCancel={patchWithdrawal}
                      />
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
                        onCancel={updated => setAllWithdrawals(prev => prev.map(w => w.id === updated.id ? updated : w))}
                        onDisburse={setDisburseTarget}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
          onDone={patchWithdrawal}
          onClose={() => setApproveTarget(null)}
        />
      )}

      {/* Disburse modal */}
      {disburseTarget && (
        <DisburseModal
          withdrawal={disburseTarget}
          onDone={patchWithdrawal}
          onClose={() => setDisburseTarget(null)}
        />
      )}
    </div>
  );
}
