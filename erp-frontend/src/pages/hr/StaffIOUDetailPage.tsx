import React, { useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Banknote,
  XCircle,
  Calendar,
  User,
  FileText,
  AlertTriangle,
  CheckCircle2,
  CheckCircle,
  Search,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useStaffIOU, useCancelStaffIOU, useDisburseStaffIOU, useApproveStaffIOU, useAdjustStaffIOUBalance } from '../../hooks/useStaffIOU';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { StaffIOU, getIOUStatusColor } from '../../types/hr';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────

const fmt = (val: string | number) =>
  `₦${Number(val).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (val: string) => {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return val; }
};

const fmtMonth = (val: string) => {
  if (!val) return '—';
  try {
    return new Date(val + 'T00:00:00').toLocaleDateString('en-NG', { year: 'numeric', month: 'long' });
  } catch { return val; }
};

const StatusBadge: React.FC<{ iou: StaffIOU }> = ({ iou }) => {
  const color = getIOUStatusColor(iou.status);
  const classes: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-800 border border-blue-200',
    green:  'bg-green-100 text-green-800 border border-green-200',
    red:    'bg-red-100 text-red-800 border border-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    indigo: 'bg-indigo-100 text-indigo-800 border border-indigo-200',
    gray:   'bg-gray-100 text-gray-700 border border-gray-200',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${classes[color] ?? classes.gray}`}>
      {iou.status_display}
    </span>
  );
};

// ── Approve & Disburse Modal ──────────────────────────────────────────────────────────────────

interface ApproveDisburseModalProps {
  iou: StaffIOU;
  mode: 'approve_and_disburse' | 'disburse_only';
  onClose: () => void;
  isSubmitting: boolean;
  onConfirm: (
    disbType: 'payroll_only' | 'cash',
    creditAccountId?: number,
    description?: string
  ) => void;
}

const ApproveDisburseModal: React.FC<ApproveDisburseModalProps> = ({
  iou, mode, onClose, isSubmitting, onConfirm,
}) => {
  const [disbType, setDisbType] = useState<'payroll_only' | 'cash'>('payroll_only');
  const [creditSearch, setCreditSearch] = useState('');
  const [creditResults, setCreditResults] = useState<Account[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [description, setDescription] = useState('');
  const [searching, setSearching] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (value: string) => {
    setCreditSearch(value);
    setSelectedAccount(null);
    if (timeout.current) clearTimeout(timeout.current);
    if (value.length < 2) { setCreditResults([]); setShowDropdown(false); return; }
    setSearching(true);
    timeout.current = setTimeout(async () => {
      try {
        const r = await accountService.getAccounts({ search: value, is_active: true });
        setCreditResults(Array.isArray(r) ? r : (r as any).results ?? []);
        setShowDropdown(true);
      } catch { setCreditResults([]); }
      finally { setSearching(false); }
    }, 300);
  };

  const selectAccount = (acc: Account) => {
    setSelectedAccount(acc);
    setCreditSearch(`${acc.code} – ${acc.name}`);
    setShowDropdown(false);
  };

  const handleConfirm = () => {
    if (disbType === 'cash' && !selectedAccount) return;
    onConfirm(
      disbType,
      disbType === 'cash' && selectedAccount ? Number(selectedAccount.id) : undefined,
      description.trim() || undefined,
    );
  };

  const title = mode === 'approve_and_disburse'
    ? 'Approve IOU'
    : 'Record IOU Origin';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* IOU Summary */}
        <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
          <div><span className="text-gray-500">Staff:</span> <span className="font-medium">{iou.staff_name}</span></div>
          <div><span className="text-gray-500">Amount:</span> <span className="font-medium">{fmt(iou.total_amount)}</span></div>
          <div><span className="text-gray-500">Ref:</span> <span className="font-mono text-xs">{iou.reference_number}</span></div>
          {mode === 'approve_and_disburse' && (
            <div className="pt-1 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
              Approving this IOU will record your name as approver.
            </div>
          )}
        </div>

        {/* Origin decision */}
        <div>
          <p className="text-sm font-medium text-gray-700 mb-3">
            Why does this staff member owe the organisation?
          </p>
          <div className="space-y-3">
            {/* Option A: Payroll only */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDisbType('payroll_only')}
              onKeyDown={e => e.key === 'Enter' && setDisbType('payroll_only')}
              className={`w-full text-left border-2 rounded-xl p-4 transition-colors cursor-pointer ${
                disbType === 'payroll_only' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  disbType === 'payroll_only' ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                }`}>
                  {disbType === 'payroll_only' && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">No Cash Involved</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    The obligation arose from a non-cash transaction — e.g. asset disposal, goods
                    damage, or overpayment recovery. A separate journal entry covers the accounting.
                    Repayment will be deducted from salary.
                  </div>
                  <div className="mt-2 bg-gray-100 rounded px-2 py-1 font-mono text-xs text-gray-600">
                    No GL entry now. Payroll will recover: Dr Payroll Clearance / Cr Staff Loan Account
                  </div>
                </div>
              </div>
            </div>

            {/* Option B: Cash was given to staff */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setDisbType('cash')}
              onKeyDown={e => e.key === 'Enter' && setDisbType('cash')}
              className={`w-full text-left border-2 rounded-xl p-4 transition-colors cursor-pointer ${
                disbType === 'cash' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  disbType === 'cash' ? 'border-emerald-500 bg-emerald-500' : 'border-gray-300'
                }`}>
                  {disbType === 'cash' && <div className="w-2 h-2 bg-white rounded-full" />}
                </div>
                <div>
                  <div className="font-medium text-gray-900 text-sm">Cash Was Given to Staff</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    The staff physically received cash from a bank account or petty cash and will
                    repay it through monthly salary deductions.
                  </div>
                  <div className="mt-2 bg-gray-100 rounded px-2 py-1 font-mono text-xs text-gray-600">
                    Posts now: Dr Staff Loan Account / Cr [selected account]
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cash account picker — shown below option cards when cash is selected */}
        {disbType === 'cash' && (
          <div className="space-y-3 border border-emerald-200 bg-emerald-50 rounded-xl p-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Bank / Petty Cash Account <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={creditSearch}
                  onChange={e => handleSearch(e.target.value)}
                  onFocus={() => creditResults.length > 0 && setShowDropdown(true)}
                  placeholder="Search bank or petty cash account…"
                  className={`w-full border rounded-lg pl-8 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                    !selectedAccount ? 'border-amber-400' : 'border-gray-300'
                  }`}
                />
                {selectedAccount && (
                  <button
                    type="button"
                    title="Clear selected account"
                    onClick={() => { setSelectedAccount(null); setCreditSearch(''); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {showDropdown && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {searching && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
                    {!searching && creditResults.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">No accounts found</div>
                    )}
                    {creditResults.map(acc => (
                      <button
                        key={acc.id}
                        type="button"
                        onClick={() => selectAccount(acc)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 flex items-center gap-2"
                      >
                        <span className="font-mono text-gray-500 w-16 shrink-0">{acc.code}</span>
                        <span className="truncate">{acc.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedAccount && (
                <p className="text-xs text-emerald-700 font-medium mt-1">
                  ✓ {selectedAccount.code} – {selectedAccount.name}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                JE Description <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Auto-generated if left blank"
                className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
        )}

        <div className="flex gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || (disbType === 'cash' && !selectedAccount)}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4" />
            {isSubmitting
              ? 'Processing…'
              : mode === 'approve_and_disburse' ? 'Approve & Activate' : 'Activate IOU'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Adjust Balance Modal ─────────────────────────────────────────────────────────────────────

interface AdjustBalanceModalProps {
  iou: StaffIOU;
  onClose: () => void;
  isSubmitting: boolean;
  onConfirm: (newTotal: number, reason: string) => void;
}

const AdjustBalanceModal: React.FC<AdjustBalanceModalProps> = ({ iou, onClose, isSubmitting, onConfirm }) => {
  const [newTotal, setNewTotal] = useState(String(iou.total_amount));
  const [reason, setReason] = useState('');

  const totalAmount = Number(iou.total_amount);
  const balanceRemaining = Number(iou.balance_remaining);
  const alreadyRepaid = totalAmount - balanceRemaining;
  const parsedNew = parseFloat(newTotal) || 0;
  const newBalance = Math.max(0, parsedNew - alreadyRepaid);
  const isValid = parsedNew > 0 && reason.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Adjust IOU Amount</h2>
          <button onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 text-sm space-y-1">
          <div><span className="text-gray-500">Staff:</span> <span className="font-medium">{iou.staff_name}</span></div>
          <div><span className="text-gray-500">Ref:</span> <span className="font-mono text-xs">{iou.reference_number}</span></div>
          <div><span className="text-gray-500">Current Total:</span> <span className="font-medium">{fmt(iou.total_amount)}</span></div>
          <div><span className="text-gray-500">Already Repaid:</span> <span className="font-medium text-green-700">{fmt(alreadyRepaid)}</span></div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmed Total Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={newTotal}
              onChange={e => setNewTotal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter confirmed amount"
            />
          </div>

          {parsedNew > 0 && (
            <div className={`rounded-xl px-4 py-3 text-sm space-y-1 ${
              newBalance === 0 ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex justify-between">
                <span className="text-gray-600">New Balance Remaining:</span>
                <span className={`font-semibold ${newBalance === 0 ? 'text-green-700' : 'text-blue-700'}`}>{fmt(newBalance)}</span>
              </div>
              {newBalance === 0 && (
                <p className="text-xs text-green-700">⚡ This adjustment will mark the IOU as <strong>Completed</strong> since the confirmed amount equals what has already been repaid.</p>
              )}
              {parsedNew < alreadyRepaid && (
                <p className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                  ⚠ New total is less than the amount already repaid (₦{alreadyRepaid.toLocaleString()}). The balance will be set to ₦0 and the IOU completed.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Adjustment <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="e.g. Original amount was an estimate; confirmed replacement cost of damaged equipment is ₦…"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-1 border-t border-gray-100">
          <button
            onClick={() => isValid && onConfirm(parsedNew, reason.trim())}
            disabled={isSubmitting || !isValid}
            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition flex items-center justify-center gap-2"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {isSubmitting ? 'Adjusting…' : 'Confirm Adjustment'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────────────────────────

const StaffIOUDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { canUserApprove } = useApprovalGuard();

  const iouId = Number(id);
  const { data: iou, isLoading, error, refetch } = useStaffIOU(iouId);
  const cancelMutation = useCancelStaffIOU();
  const approveMutation = useApproveStaffIOU();
  const disburseMutation = useDisburseStaffIOU();
  const adjustMutation = useAdjustStaffIOUBalance();

  const [modalMode, setModalMode] = useState<'approve_and_disburse' | 'disburse_only' | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  const isProcessing = approveMutation.isPending || disburseMutation.isPending;

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync(iouId);
      success('IOU cancelled.');
      setShowCancelConfirm(false);
      refetch();
    } catch {
      showError('Failed to cancel IOU.');
    }
  };

  const handleDisburseConfirm = async (
    disbType: 'payroll_only' | 'cash',
    creditAccountId?: number,
    descriptionOverride?: string
  ) => {
    if (!iou) return;
    try {
      if (modalMode === 'approve_and_disburse') {
        await approveMutation.mutateAsync(iouId);
      }
      await disburseMutation.mutateAsync({
        id: iouId,
        type: disbType,
        credit_account_id: creditAccountId,
        description_override: descriptionOverride,
      });
      success(
        disbType === 'cash'
          ? 'IOU approved. Cash GL entry posted — IOU is now active.'
          : 'IOU approved. No cash involved — repayment will be deducted from payroll.'
      );
      setModalMode(null);
      refetch();
    } catch {
      showError('Operation failed. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Loading IOU…</div>
      </div>
    );
  }

  if (error || !iou) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <AlertTriangle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-gray-600">IOU not found or you don't have access to it.</p>
          <Link to="/hr/ious" className="text-blue-600 hover:underline text-sm">
            ← Back to IOU list
          </Link>
        </div>
      </div>
    );
  }

  const totalAmount = Number(iou.total_amount);
  const balanceRemaining = Number(iou.balance_remaining);
  const recovered = totalAmount - balanceRemaining;
  const progressPct = totalAmount > 0 ? Math.min(100, (recovered / totalAmount) * 100) : 0;
  const totalInstallments =
    totalAmount > 0 && Number(iou.monthly_installment) > 0
      ? Math.ceil(totalAmount / Number(iou.monthly_installment))
      : 0;

  const canApprove = iou.status === 'PENDING' && canUserApprove;
  const canSettle = iou.status === 'APPROVED' && canUserApprove;
  const canCancel = iou.status === 'PENDING' || iou.status === 'APPROVED' || iou.status === 'ACTIVE';
  const canAdjust = (iou.status === 'PENDING' || iou.status === 'APPROVED' || iou.status === 'ACTIVE') && canUserApprove;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <Breadcrumb
          items={[
            { label: 'HR', href: '/hr' },
            { label: 'Staff IOUs', href: '/hr/ious' },
            { label: iou.reference_number },
          ]}
        />
        <div className="mt-3 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/hr/ious')}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition"
              title="Back to IOU list"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">{iou.reference_number}</h1>
              <p className="text-sm text-gray-500">{iou.staff_name}</p>
            </div>
            <StatusBadge iou={iou} />
          </div>
          <div className="flex gap-2">
            {canApprove && (
              <button
                onClick={() => setModalMode('approve_and_disburse')}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition"
              >
                <CheckCircle className="w-4 h-4" />
                Approve IOU
              </button>
            )}
            {canSettle && (
              <button
                onClick={() => setModalMode('disburse_only')}
                disabled={isProcessing}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition"
              >
                <Banknote className="w-4 h-4" />
                Record Origin
              </button>
            )}
            {canAdjust && (
              <button
                onClick={() => setShowAdjustModal(true)}
                disabled={adjustMutation.isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 text-sm font-medium rounded-lg transition"
              >
                <SlidersHorizontal className="w-4 h-4" />
                Adjust Amount
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-sm font-medium rounded-lg transition"
              >
                <XCircle className="w-4 h-4" />
                Cancel IOU
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Status banners */}
        {iou.status === 'PENDING' && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3 text-sm text-yellow-800">
            <strong>Pending Approval:</strong> This IOU is awaiting manager approval. Once approved,
            you will record whether cash was given to the staff or whether this is a non-cash
            obligation (e.g. asset disposal) being recovered via payroll.
          </div>
        )}
        {iou.status === 'APPROVED' && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm text-indigo-800">
            <strong>Approved — Awaiting Origin Record:</strong> The IOU has been approved.
            Click <strong>Record Origin</strong> above to confirm whether the staff received cash
            (which will post a GL entry) or whether this is a non-cash obligation recovered via payroll.
          </div>
        )}

        {/* Repayment Progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Repayment Progress</h2>
          <div className="flex justify-between text-sm text-gray-600">
            <span>Recovered: <strong className="text-gray-900">{fmt(recovered)}</strong></span>
            <span>Remaining: <strong className={balanceRemaining > 0 ? 'text-orange-600' : 'text-green-600'}>{fmt(balanceRemaining)}</strong></span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all ${iou.status === 'COMPLETED' ? 'bg-green-500 w-full' : 'bg-blue-500'}`}
              title={`${progressPct.toFixed(1)}% recovered`}
              {...(iou.status !== 'COMPLETED' && { style: { width: `${progressPct}%` } })}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>{iou.installments_paid} of {totalInstallments} installments paid</span>
            <span>{progressPct.toFixed(1)}% recovered</span>
          </div>
          {iou.status === 'COMPLETED' && (
            <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg px-3 py-2 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Fully repaid
            </div>
          )}
        </div>

        {/* Core details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Financial */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <Banknote className="w-4 h-4 text-gray-400" /> Financial
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Total Amount</dt>
                <dd className="font-semibold text-gray-900">{fmt(iou.total_amount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Monthly Installment</dt>
                <dd className="font-semibold text-gray-900">{fmt(iou.monthly_installment)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Balance Remaining</dt>
                <dd className={`font-semibold ${Number(iou.balance_remaining) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                  {fmt(iou.balance_remaining)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Total Installments</dt>
                <dd className="text-gray-900">{totalInstallments}</dd>
              </div>
              {iou.cash_disbursed !== null && iou.cash_disbursed !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Cash Involved</dt>
                  <dd className={iou.cash_disbursed ? 'text-emerald-700 font-medium' : 'text-gray-700'}>
                    {iou.cash_disbursed ? 'Yes — cash given to staff (GL posted)' : 'No — non-cash obligation'}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Schedule */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" /> Schedule
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Start Month</dt>
                <dd className="text-gray-900">{fmtMonth(iou.start_month)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created</dt>
                <dd className="text-gray-900">{fmtDate(iou.created_at)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Installments Paid</dt>
                <dd className="text-gray-900">{iou.installments_paid}</dd>
              </div>
              {iou.approved_at && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Approved On</dt>
                  <dd className="text-gray-900">{fmtDate(iou.approved_at)}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* People */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4 text-gray-400" /> People
            </h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Staff</dt>
                <dd className="text-gray-900">{iou.staff_name}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Staff ID</dt>
                <dd className="font-mono text-gray-700">{iou.staff_id_code}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Created By</dt>
                <dd className="text-gray-900">{iou.created_by_name}</dd>
              </div>
              {iou.approved_by_name && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">Approved By</dt>
                  <dd className="text-gray-900">{iou.approved_by_name}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Journal Entry */}
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-400" /> Journal Entry
            </h2>
            {iou.disbursement_journal ? (
              <p className="text-sm text-gray-700">
                JE #{iou.disbursement_journal} —{' '}
                <span className="text-green-600 font-medium">posted</span>
              </p>
            ) : (
              <div className="text-sm text-gray-500">
                {iou.status === 'ACTIVE' && iou.cash_disbursed === false
                  ? 'No GL entry (non-cash obligation — payroll will recover via salary deductions).'
                  : 'No journal entry posted yet.'}
              </div>
            )}
          </div>
        </div>

        {/* Reason & Notes */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Reason</h2>
          <p className="text-sm text-gray-800 whitespace-pre-line">{iou.reason}</p>
          {iou.notes && (
            <>
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide pt-2">Notes</h2>
              <p className="text-sm text-gray-600 whitespace-pre-line">{iou.notes}</p>
            </>
          )}
        </div>
      </div>

      {/* Adjust Balance modal */}
      {showAdjustModal && iou && (
        <AdjustBalanceModal
          iou={iou}
          onClose={() => setShowAdjustModal(false)}
          isSubmitting={adjustMutation.isPending}
          onConfirm={async (newTotal, reason) => {
            try {
              await adjustMutation.mutateAsync({ id: iouId, new_total_amount: newTotal, reason });
              success('IOU amount adjusted successfully.');
              setShowAdjustModal(false);
              refetch();
            } catch {
              showError('Failed to adjust IOU amount.');
            }
          }}
        />
      )}

      {/* Approve / Disburse modal */}
      {modalMode && (
        <ApproveDisburseModal
          iou={iou}
          mode={modalMode}
          onClose={() => setModalMode(null)}
          isSubmitting={isProcessing}
          onConfirm={handleDisburseConfirm}
        />
      )}

      {/* Cancel confirmation modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <AlertTriangle className="w-6 h-6" />
              <h2 className="text-lg font-semibold">Cancel IOU?</h2>
            </div>
            <p className="text-sm text-gray-600">
              This will permanently cancel <strong>{iou.reference_number}</strong>. Any future
              payroll deductions for this IOU will stop. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition"
              >
                {cancelMutation.isPending ? 'Cancelling…' : 'Yes, Cancel IOU'}
              </button>
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg py-2 transition"
              >
                Keep IOU
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffIOUDetailPage;
