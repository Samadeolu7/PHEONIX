import React, { useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  Eye,
  Banknote,
  Calendar,
  User,
  XCircle,
  RefreshCw,
  CheckCircle,
  X,
  ArrowRightLeft,
} from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import { useStaffIOUs, useCancelStaffIOU, useDisburseStaffIOU, useApproveStaffIOU } from '../../hooks/useStaffIOU';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { StaffIOU, StaffIOUStatus, getIOUStatusColor } from '../../types/hr';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

// ── Helpers ───────────────────────────────────────────────────────────────────────────────

const statusBadge = (status: StaffIOUStatus, display: string) => {
  const color = getIOUStatusColor(status);
  const classes: Record<string, string> = {
    blue:   'bg-blue-100 text-blue-800',
    green:  'bg-green-100 text-green-800',
    red:    'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    indigo: 'bg-indigo-100 text-indigo-800',
    gray:   'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${classes[color] ?? classes.gray}`}>
      {display}
    </span>
  );
};

const fmt = (val: string | number) =>
  `₦${Number(val).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── ApproveDisburse Modal ─────────────────────────────────────────────────────────────────

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
                    No GL entry now. Payroll will recover: Dr Payroll Clearance / Cr Salary Advance (staff sub-account)
                  </div>
                </div>
              </div>
            </div>

            {/* Option B: Cash given to staff */}
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
                    Posts now: Dr Salary Advance (staff sub-account) / Cr [selected account]
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Cash account picker — shown when cash selected */}
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

// ── List page ─────────────────────────────────────────────────────────────────────────────────

const StaffIOUListPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(
    searchParams.get('status') || ''
  );
  const [page, setPage] = useState(1);
  const [modalTarget, setModalTarget] = useState<{
    iou: StaffIOU;
    mode: 'approve_and_disburse' | 'disburse_only';
  } | null>(null);

  const { data, isLoading, refetch } = useStaffIOUs({
    status: statusFilter || undefined,
    ordering: '-created_at',
    page,
    page_size: 20,
  });

  const cancelMutation = useCancelStaffIOU();
  const approveMutation = useApproveStaffIOU();
  const disburseMutation = useDisburseStaffIOU();

  const isProcessing = approveMutation.isPending || disburseMutation.isPending;

  const handleCancel = async (iou: StaffIOU) => {
    if (!confirm(`Cancel IOU ${iou.reference_number} for ${iou.staff_name}?`)) return;
    try {
      await cancelMutation.mutateAsync(iou.id);
      success('IOU cancelled.');
    } catch {
      showError('Failed to cancel IOU.');
    }
  };

  const handleConfirm = async (
    disbType: 'payroll_only' | 'cash',
    creditAccountId?: number,
    descriptionOverride?: string
  ) => {
    if (!modalTarget) return;
    const { iou, mode } = modalTarget;
    try {
      if (mode === 'approve_and_disburse') {
        await approveMutation.mutateAsync(iou.id);
      }
      await disburseMutation.mutateAsync({
        id: iou.id,
        type: disbType,
        credit_account_id: creditAccountId,
        description_override: descriptionOverride,
      });
      success(
        disbType === 'cash'
          ? 'Cash GL entry posted. IOU is now active.'
          : 'IOU activated — repayment will be recovered via payroll deduction.'
      );
      setModalTarget(null);
    } catch {
      showError('Operation failed. Please try again.');
    }
  };

  const filtered = (data?.results ?? []).filter(
    iou =>
      !search ||
      iou.staff_name.toLowerCase().includes(search.toLowerCase()) ||
      iou.reference_number.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 space-y-6">
      {modalTarget && (
        <ApproveDisburseModal
          iou={modalTarget.iou}
          mode={modalTarget.mode}
          onClose={() => setModalTarget(null)}
          isSubmitting={isProcessing}
          onConfirm={handleConfirm}
        />
      )}

      <Breadcrumb
        items={[
          { label: 'HR & Payroll', href: '/hr' },
          { label: 'Staff IOU', href: '/hr/ious' },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Staff IOU</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage cash advances recovered via monthly payroll deductions
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/hr/ious/bulk-debit')}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium"
          >
            <ArrowRightLeft className="w-4 h-4" />
            Bulk Debit
          </button>
          <button
            onClick={() => navigate('/hr/ious/create')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New IOU
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by staff name or ref..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filter by status"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={statusFilter}
          onChange={e => {
            setStatusFilter(e.target.value);
            setPage(1);
            if (e.target.value) setSearchParams({ status: e.target.value });
            else setSearchParams({});
          }}
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <button
          onClick={() => refetch()}
          className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No IOU records found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reference</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Staff</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Amount</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Balance</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Start Month</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(iou => (
                <tr key={iou.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{iou.reference_number}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <div className="font-medium text-gray-900">{iou.staff_name}</div>
                        <div className="text-xs text-gray-400">{iou.staff_id_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{fmt(iou.total_amount)}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{fmt(iou.monthly_installment)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={Number(iou.balance_remaining) > 0 ? 'text-orange-600 font-medium' : 'text-green-600 font-medium'}>
                      {fmt(iou.balance_remaining)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      {new Date(iou.start_month).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {statusBadge(iou.status, iou.status_display)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        to={`/hr/ious/${iou.id}/view`}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="View details"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>

                      {/* PENDING: approve + choose disbursement */}
                      {iou.status === 'PENDING' && (
                        <button
                          onClick={() => setModalTarget({ iou, mode: 'approve_and_disburse' })}
                          disabled={isProcessing}
                          className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"
                          title="Approve IOU"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                      )}

                      {/* APPROVED: choose disbursement method */}
                      {iou.status === 'APPROVED' && (
                        <button
                          onClick={() => setModalTarget({ iou, mode: 'disburse_only' })}
                          disabled={isProcessing}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"
                          title="Settle disbursement"
                        >
                          <Banknote className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cancel: PENDING, APPROVED, or ACTIVE */}
                      {(iou.status === 'PENDING' || iou.status === 'APPROVED' || iou.status === 'ACTIVE') && (
                        <button
                          onClick={() => handleCancel(iou)}
                          disabled={cancelMutation.isPending}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                          title="Cancel IOU"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.count > 0 && (
        <div className="flex items-center justify-between text-sm text-gray-500 px-1">
          <span>
            Showing {((page - 1) * 20) + 1}–{Math.min(page * 20, data.count)} of {data.count} records
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={!data.previous}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Prev
            </button>
            <span className="px-2">Page {page} of {Math.ceil(data.count / 20)}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={!data.next}
              className="px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffIOUListPage;
