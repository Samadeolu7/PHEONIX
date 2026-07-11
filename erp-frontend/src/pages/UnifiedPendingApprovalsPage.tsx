import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useApprovalGuard } from '../hooks/useApprovalGuard';
import {
  CheckCircle,
  XCircle,
  Clock,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  ShoppingCart,
  FileText,
  Wallet,
  Users,
  Building2,
  DollarSign,
  Banknote,
  ReceiptText,
  ClipboardList,
  Filter,
  CreditCard,
  Package,
  PackageOpen,
  Tag,
  Sliders,
  RotateCcw,
  Landmark,
  PiggyBank,
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { expenseService } from '../services/expenseService';
import { bankService } from '../services/bankService';
import { pettyCashService } from '../services/pettyCashService';
import { resourceConsumptionService } from '../services/resourceConsumptionService';
import { procurementService } from '../services/procurementService';
import hrService from '../services/hrService';
import { materialRequestService, officeUseRequestService } from '../services/ledgerService';
import { inventoryService } from '../services/inventoryService';
import { incomeFeeStructureService } from '../services/incomeFeeStructureService';
import { discountService } from '../services/discountService';
import { assetAcquisitionService } from '../services/assetsService';
import { invoiceService } from '../services/invoiceService';
import { loanService } from '../services/loanService';
import { getPendingMyApproval, approveWithdrawalStep } from '../services/savingsService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalItem {
  id: number;
  title: string;
  subtitle: string;
  amount?: string | null;
  date: string;
  urgency?: 'normal' | 'high' | 'flagged';
  viewPath: string;
  /** Called when the user confirms an inline approve */
  onApprove?: (notes: string) => Promise<void>;
  /** Called when the user confirms an inline reject */
  onReject?: (reason: string) => Promise<void>;
}

interface ApprovalSection {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string; // Tailwind bg color class for the icon badge
  items: ApprovalItem[];
  isLoading: boolean;
  isError: boolean;
  /** True when the failure is a 403 — the user simply lacks access to this module. */
  isForbidden: boolean;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

// A 403 means "you're not authorized for this module", not "something broke" —
// those sections should just not appear rather than show an error state.
const isForbidden = (q: { error: unknown }) => {
  const err = q.error as any;
  return err?.status === 403 || err?.response?.status === 403;
};

const fmt = (amount?: string | number | null) => {
  if (amount == null || amount === '') return null;
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2,
  }).format(n);
};

const fmtDate = (d: string) => {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// ─── Inline Action Modal ──────────────────────────────────────────────────────

interface ActionModalProps {
  type: 'approve' | 'reject';
  itemTitle: string;
  onConfirm: (note: string) => void;
  onClose: () => void;
  isBusy: boolean;
}

const ActionModal: React.FC<ActionModalProps> = ({
  type,
  itemTitle,
  onConfirm,
  onClose,
  isBusy,
}) => {
  const [note, setNote] = useState('');
  const isReject = type === 'reject';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className={`text-lg font-semibold ${isReject ? 'text-red-700' : 'text-green-700'}`}>
          {isReject ? 'Reject' : 'Approve'}: {itemTitle}
        </h3>
        <textarea
          className="w-full border border-gray-300 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
          rows={3}
          placeholder={isReject ? 'Reason for rejection (required)' : 'Notes (optional)'}
          value={note}
          onChange={e => setNote(e.target.value)}
        />
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isBusy}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={isBusy || (isReject && !note.trim())}
            className={`px-4 py-2 text-sm rounded-lg text-white disabled:opacity-50 ${
              isReject ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            {isBusy ? 'Processing…' : isReject ? 'Confirm Rejection' : 'Confirm Approval'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Single approval row ──────────────────────────────────────────────────────

interface ApprovalRowProps {
  item: ApprovalItem;
  onRefresh: () => void;
}

const ApprovalRow: React.FC<ApprovalRowProps> = ({ item, onRefresh }) => {
  const navigate = useNavigate();
  const toast = useToast();
  const [modal, setModal] = useState<{ type: 'approve' | 'reject' } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async (note: string) => {
    if (!modal) return;
    setBusy(true);
    try {
      if (modal.type === 'approve' && item.onApprove) {
        await item.onApprove(note);
        toast.success('Approved successfully');
      } else if (modal.type === 'reject' && item.onReject) {
        await item.onReject(note);
        toast.success('Rejected');
      }
      setModal(null);
      onRefresh();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.message || 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const urgencyBadge = () => {
    if (item.urgency === 'flagged')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 rounded-full px-2 py-0.5">
          <AlertTriangle className="w-3 h-3" /> Flagged
        </span>
      );
    if (item.urgency === 'high')
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-orange-700 bg-orange-100 rounded-full px-2 py-0.5">
          <Clock className="w-3 h-3" /> Urgent
        </span>
      );
    return null;
  };

  return (
    <>
      {modal && (
        <ActionModal
          type={modal.type}
          itemTitle={item.title}
          onConfirm={handleConfirm}
          onClose={() => setModal(null)}
          isBusy={busy}
        />
      )}
      <div className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors rounded-lg group">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-900 truncate">{item.title}</span>
            {urgencyBadge()}
          </div>
          <p className="text-xs text-gray-500 truncate mt-0.5">{item.subtitle}</p>
        </div>

        {/* Amount */}
        {item.amount && (
          <div className="hidden sm:block text-sm font-semibold text-gray-700 whitespace-nowrap">
            {item.amount}
          </div>
        )}

        {/* Date */}
        <div className="hidden md:block text-xs text-gray-400 whitespace-nowrap">{item.date}</div>

        {/* Actions */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {item.onApprove && (
            <button
              title="Approve"
              onClick={() => setModal({ type: 'approve' })}
              className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
            </button>
          )}
          {item.onReject && (
            <button
              title="Reject"
              onClick={() => setModal({ type: 'reject' })}
              className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          )}
          <button
            title="View details"
            onClick={() => navigate(item.viewPath)}
            className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};

// ─── Collapsible section ──────────────────────────────────────────────────────

interface SectionCardProps {
  section: ApprovalSection;
  onRefresh: () => void;
}

const SectionCard: React.FC<SectionCardProps> = ({ section, onRefresh }) => {
  const [open, setOpen] = useState(true);

  const count = section.items.length;
  if (section.isForbidden) return null;
  if (!section.isLoading && !section.isError && count === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <span
          className={`flex items-center justify-center w-8 h-8 rounded-lg ${section.color} text-white`}
        >
          {section.icon}
        </span>
        <span className="flex-1 text-sm font-semibold text-gray-800">{section.label}</span>
        {section.isLoading ? (
          <span className="text-xs text-gray-400 animate-pulse">Loading…</span>
        ) : section.isError ? (
          <span className="text-xs text-red-500">Error</span>
        ) : (
          <span className="flex items-center justify-center min-w-[22px] h-5 px-1.5 text-xs font-bold bg-blue-600 text-white rounded-full">
            {count}
          </span>
        )}
        <span className="text-gray-400 ml-1">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-gray-100 divide-y divide-gray-50">
          {section.isLoading ? (
            <div className="px-5 py-6 flex items-center gap-2 text-sm text-gray-400">
              <RefreshCw className="w-4 h-4 animate-spin" /> Loading…
            </div>
          ) : section.isError ? (
            <div className="px-5 py-4 text-sm text-red-500">Failed to load. Please refresh.</div>
          ) : count === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-400 italic">No pending items.</div>
          ) : (
            <div className="px-2 py-1">
              {section.items.map(item => (
                <ApprovalRow key={item.id} item={item} onRefresh={onRefresh} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────────────────

type ModuleFilter = 'all' | string;

const UnifiedPendingApprovalsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [filter, setFilter] = useState<ModuleFilter>(searchParams.get('module') || 'all');

  // ── Approval authority ────────────────────────────────────────────────────
  // Only rank 4+ (Principal / Director) get action callbacks.
  // Other roles can view but the approve/reject buttons won't render.
  const { canUserApprove } = useApprovalGuard();

  // Wraps a callback so it's only present for approvers; undefined otherwise
  function act<T>(fn: T): T | undefined {
    return canUserApprove ? fn : undefined;
  }

  // ── Fetch all pending data in parallel ────────────────────────────────────
  const results = useQueries({
    queries: [
      // 0 – Expenses
      {
        queryKey: ['pending-approvals-expenses'],
        queryFn: () => expenseService.getPendingApproval(),
        staleTime: 30_000,
      },
      // 1 – Resource Consumptions (submitted + flagged)
      {
        queryKey: ['pending-approvals-consumptions'],
        queryFn: () =>
          Promise.all([
            resourceConsumptionService.getConsumptions({ status: 'submitted' }),
            resourceConsumptionService.getConsumptions({ status: 'flagged' }),
          ]).then(([submitted, flagged]) => ({
            results: [...(submitted?.results ?? []), ...(flagged?.results ?? [])],
          })),
        staleTime: 30_000,
      },
      // 2 – Bank Transfers
      {
        queryKey: ['pending-approvals-bank-transfers'],
        queryFn: () => bankService.getPendingApprovals(),
        staleTime: 30_000,
      },
      // 3 – Petty Cash Vouchers
      {
        queryKey: ['pending-approvals-petty-cash-vouchers'],
        queryFn: () => pettyCashService.getVouchers({ pending_approval: true }),
        staleTime: 30_000,
      },
      // 4 – Petty Cash Replenishments (submitted = pending approval)
      {
        queryKey: ['pending-approvals-petty-cash-replenishments'],
        queryFn: () => pettyCashService.getReplenishments({ status: 'submitted' }),
        staleTime: 30_000,
      },
      // 5 – Purchase Requisitions
      {
        queryKey: ['pending-approvals-requisitions'],
        queryFn: () =>
          procurementService.getPurchaseRequisitions({ status: 'submitted' } as {
            search?: string;
            page?: number;
            ordering?: string;
          }),
        staleTime: 30_000,
      },
      // 6 – Purchase Orders
      {
        queryKey: ['pending-approvals-purchase-orders'],
        queryFn: () => procurementService.getPurchaseOrders({ status: 'submitted' }),
        staleTime: 30_000,
      },
      // 7 – Leave Requests
      {
        queryKey: ['pending-approvals-leave-requests'],
        queryFn: () =>
          hrService.getLeaveRequests({ status: 'submitted' } as Parameters<
            typeof hrService.getLeaveRequests
          >[0]),
        staleTime: 30_000,
      },
      // 8 – Bonus / Deduction Requests
      {
        queryKey: ['pending-approvals-bonus-deductions'],
        queryFn: () =>
          hrService.getBonusDeductionRequests({ status: 'pending' } as Parameters<
            typeof hrService.getBonusDeductionRequests
          >[0]),
        staleTime: 30_000,
      },
      // 9 – Payroll (calculated = awaiting approval)
      {
        queryKey: ['pending-approvals-payroll'],
        queryFn: () =>
          hrService.getPayrolls({ status: 'calculated' } as Parameters<
            typeof hrService.getPayrolls
          >[0]),
        staleTime: 30_000,
      },
      // 10 – Bank Payments pending approval
      {
        queryKey: ['pending-approvals-bank-payments'],
        queryFn: () => bankService.getPendingPaymentApprovals(),
        staleTime: 30_000,
      },
      // 11 – Material Requests pending approval
      {
        queryKey: ['pending-approvals-material-requests'],
        queryFn: () => materialRequestService.getPendingApprovals(),
        staleTime: 30_000,
      },
      // 12 – Office Use Requests pending approval (status=submitted)
      {
        queryKey: ['pending-approvals-office-use-requests'],
        queryFn: () => officeUseRequestService.getOfficeUseRequests({ status: 'submitted' }),
        staleTime: 30_000,
      },
      // 13 – Fee Structures pending approval
      {
        queryKey: ['pending-approvals-fee-structures'],
        queryFn: () => incomeFeeStructureService.getFeeStructures({ ordering: '-updated_at' }),
        staleTime: 30_000,
      },
      // 14 – Stock Adjustments pending approval
      {
        queryKey: ['pending-approvals-stock-adjustments'],
        queryFn: () => inventoryService.getStockAdjustments({ status: 'pending' }),
        staleTime: 30_000,
      },
      // 15 – Discount Applications pending approval (submitted + under_review)
      {
        queryKey: ['pending-approvals-discount-applications'],
        queryFn: () =>
          Promise.all([
            discountService.getDiscountApplications({ status: 'submitted' }),
            discountService.getDiscountApplications({ status: 'under_review' }),
          ]).then(([submitted, underReview]) => ({
            results: [...(submitted?.results ?? []), ...(underReview?.results ?? [])],
          })),
        staleTime: 30_000,
      },
      // 16 – Asset Acquisitions pending approval (status=submitted)
      {
        queryKey: ['pending-approvals-asset-acquisitions'],
        queryFn: () => assetAcquisitionService.getAll({ status: 'submitted' }),
        staleTime: 30_000,
      },
      // 17 – Payment Reversal Requests pending approval
      {
        queryKey: ['pending-approvals-payment-reversals'],
        queryFn: () => invoiceService.listPaymentReversalRequests({ status: 'pending' }),
        staleTime: 30_000,
      },
      // 18 – Staff IOUs pending approval
      {
        queryKey: ['pending-approvals-staff-ious'],
        queryFn: () => hrService.getStaffIOUs({ status: 'PENDING' }),
        staleTime: 30_000,
      },
      // 19 – Loan Disbursement Requests pending approval
      {
        queryKey: ['pending-approvals-loan-disbursements'],
        queryFn: () => loanService.listDisbursements({ status: 'pending_approval' }),
        staleTime: 30_000,
      },
      // 20 – Savings Withdrawal Requests pending my approval step
      {
        queryKey: ['pending-approvals-savings-withdrawals'],
        queryFn: () => getPendingMyApproval(),
        staleTime: 30_000,
      },
      // 21 – Loan Repayment Requests (savings debit) pending approval
      {
        queryKey: ['pending-approvals-loan-repayment-requests'],
        queryFn: () => loanService.listRepaymentRequests({ status: 'pending' }),
        staleTime: 30_000,
      },
    ],
  });

  const [
    expensesQ,
    consumptionsQ,
    bankTransfersQ,
    pettyCashVouchersQ,
    pettyCashReplenishmentsQ,
    requisitionsQ,
    purchaseOrdersQ,
    leaveRequestsQ,
    bonusDeductionsQ,
    payrollQ,
    bankPaymentsQ,
    materialRequestsQ,
    officeUseRequestsQ,
    feeStructuresQ,
    stockAdjustmentsQ,
    discountApplicationsQ,
    assetAcquisitionsQ,
    paymentReversalRequestsQ,
    staffIOUsQ,
    loanDisbursementsQ,
    savingsWithdrawalsQ,
    loanRepaymentRequestsQ,
  ] = results;

  // Invalidate helper – re-run all queries
  const refresh = () => results.forEach(q => q.refetch());

  // ── Map raw data → ApprovalItem arrays ────────────────────────────────────

  const expenseItems: ApprovalItem[] = (expensesQ.data?.results ?? []).map((e: any) => ({
    id: e.id,
    title: e.title || e.description || `Expense #${e.id}`,
    subtitle: `${e.expense_type || ''} — ${e.payment_method || ''}`.replace(/^— |— $/, ''),
    amount: fmt(e.amount),
    date: fmtDate(e.created_at || e.date),
    viewPath: `/expenses/${e.id}`,
    onApprove: act((notes: string) => expenseService.approveExpense(e.id, notes).then(() => {})),
    onReject: act((reason: string) => expenseService.rejectExpense(e.id, reason).then(() => {})),
  }));

  const consumptionItems: ApprovalItem[] = (consumptionsQ.data?.results ?? []).map((c: any) => ({
    id: c.id,
    title: c.consumption_number || `Consumption #${c.id}`,
    subtitle: `${c.resource_name || ''} — ${c.beneficiary_name || ''}`.replace(/^— |— $/, ''),
    amount: fmt(c.total_amount),
    date: fmtDate(c.consumption_date || c.created_at),
    urgency: c.is_irregular ? 'flagged' : 'normal',
    viewPath: `/expenses/resource-consumption/${c.id}/approve`,
    onApprove: act((notes: string) =>
      resourceConsumptionService.approveConsumption(c.id, notes).then(() => {})
    ),
    onReject: act((reason: string) =>
      resourceConsumptionService.rejectConsumption(c.id, reason).then(() => {})
    ),
  }));

  const bankTransferItems: ApprovalItem[] = (
    Array.isArray(bankTransfersQ.data) ? bankTransfersQ.data : []
  ).map((t: any) => ({
    id: t.id,
    title: t.reference || `Transfer #${t.id}`,
    subtitle: `${t.from_account_name || ''} → ${t.to_account_name || ''}`.replace(/^→ | → $/, ''),
    amount: fmt(t.amount),
    date: fmtDate(t.transfer_date || t.created_at),
    viewPath: `/banks/transfers/approvals`,
    onApprove: act((notes: string) => bankService.approveTransfer(t.id, notes).then(() => {})),
    onReject: act((reason: string) => bankService.rejectTransfer(t.id, reason).then(() => {})),
  }));

  const pettyCashVoucherItems: ApprovalItem[] = (
    Array.isArray(pettyCashVouchersQ.data) ? pettyCashVouchersQ.data : []
  ).map((v: any) => ({
    id: v.id,
    title: v.voucher_number || `Voucher #${v.id}`,
    subtitle: v.purpose || v.description || '',
    amount: fmt(v.amount),
    date: fmtDate(v.created_at),
    viewPath: `/treasury/petty-cash/vouchers/${v.id}`,
    onApprove: act((notes: string) =>
      pettyCashService.approveVoucher(v.id, { notes }).then(() => {})
    ),
    onReject: act((reason: string) =>
      pettyCashService.rejectVoucher(v.id, { notes: reason }).then(() => {})
    ),
  }));

  const pettyCashReplenishmentItems: ApprovalItem[] = (
    Array.isArray(pettyCashReplenishmentsQ.data) ? pettyCashReplenishmentsQ.data : []
  ).map((r: any) => ({
    id: r.id,
    title: r.replenishment_number || `Replenishment #${r.id}`,
    subtitle: r.notes || '',
    amount: fmt(r.amount),
    date: fmtDate(r.created_at),
    viewPath: `/treasury/petty-cash/replenishments/${r.id}`,
    onApprove: act((notes: string) =>
      pettyCashService.approveReplenishment(r.id, { notes }).then(() => {})
    ),
    onReject: act((reason: string) =>
      pettyCashService.rejectReplenishment(r.id, { notes: reason }).then(() => {})
    ),
  }));

  const requisitionItems: ApprovalItem[] = (requisitionsQ.data?.results ?? []).map((r: any) => ({
    id: r.id,
    title: r.requisition_number || `Requisition #${r.id}`,
    subtitle: `${r.department_name || ''} — ${r.purpose || ''}`.replace(/^— |— $/, ''),
    amount: fmt(r.total_amount || r.estimated_cost),
    date: fmtDate(r.request_date || r.created_at),
    urgency: r.urgency === 'urgent' || r.urgency === 'emergency' ? 'high' : 'normal',
    viewPath: `/procurement/requisitions/${r.id}`,
    onApprove: act((notes: string) =>
      procurementService
        .approveRequisition(r.id, { action: 'approve', comments: notes })
        .then(() => {})
    ),
    onReject: act((reason: string) =>
      procurementService
        .rejectRequisition(r.id, { action: 'reject', comments: reason })
        .then(() => {})
    ),
  }));

  const purchaseOrderItems: ApprovalItem[] = (purchaseOrdersQ.data?.results ?? []).map(
    (po: any) => ({
      id: po.id,
      title: po.po_number || `PO #${po.id}`,
      subtitle: po.supplier_name || '',
      amount: fmt(po.total_amount),
      date: fmtDate(po.order_date || po.created_at),
      viewPath: `/procurement/purchase-orders/${po.id}`,
      onApprove: act((_notes: string) =>
        procurementService.approvePurchaseOrder(po.id).then(() => {})
      ),
    })
  );

  const leaveRequestItems: ApprovalItem[] = (leaveRequestsQ.data?.results ?? []).map((lr: any) => ({
    id: lr.id,
    title: lr.staff_name || `Leave Request #${lr.id}`,
    subtitle:
      `${lr.leave_type_name || ''} — ${lr.start_date ? fmtDate(lr.start_date) : ''} to ${lr.end_date ? fmtDate(lr.end_date) : ''}`.replace(
        /^— |— $/,
        ''
      ),
    date: fmtDate(lr.created_at),
    viewPath: `/hr/leave-requests/${lr.id}`,
    onApprove: act((_notes: string) => hrService.approveLeaveRequest(lr.id).then(() => {})),
    onReject: act((reason: string) =>
      hrService.rejectLeaveRequest(lr.id, { rejection_reason: reason }).then(() => {})
    ),
  }));

  const bonusDeductionItems: ApprovalItem[] = (bonusDeductionsQ.data?.results ?? []).map(
    (b: any) => ({
      id: b.id,
      title: b.staff_name || `Request #${b.id}`,
      subtitle:
        `${b.request_type === 'bonus' ? 'Bonus' : 'Deduction'} — ${b.salary_component_name || ''}`.replace(
          /— $/,
          ''
        ),
      amount: fmt(b.amount),
      date: fmtDate(b.created_at),
      viewPath: `/hr/bonus-deductions/${b.id}`,
      onApprove: act((_notes: string) =>
        hrService.approveBonusDeductionRequest(b.id).then(() => {})
      ),
      onReject: act((reason: string) =>
        hrService.rejectBonusDeductionRequest(b.id, reason).then(() => {})
      ),
    })
  );

  const bankPaymentItems: ApprovalItem[] = (
    Array.isArray(bankPaymentsQ.data) ? bankPaymentsQ.data : []
  ).map((p: any) => ({
    id: p.id,
    title: p.payment_number || `Payment #${p.id}`,
    subtitle:
      `${p.description || ''}${p.bank_account_display ? ' — ' + p.bank_account_display : ''}`
        .replace(/^ — | — $/, '')
        .trim(),
    amount: fmt(p.amount),
    date: fmtDate(p.payment_date || p.created_at),
    viewPath: `/banks/payments`,
    onApprove: act((notes: string) => bankService.approveBankPayment(p.id, notes).then(() => {})),
    onReject: act((reason: string) => bankService.rejectBankPayment(p.id, reason).then(() => {})),
  }));

  const materialRequestItems: ApprovalItem[] = (
    Array.isArray(materialRequestsQ.data) ? materialRequestsQ.data : []
  ).map((r: any) => ({
    id: r.id,
    title: r.request_number || `Material Request #${r.id}`,
    subtitle: `${r.client_name || ''} — ${r.purpose || ''}`.replace(/^— |— $/, ''),
    date: fmtDate(r.submitted_at || r.created_at),
    viewPath: `/inventory/material-requests/${r.id}`,
    onApprove: act((notes: string) =>
      materialRequestService.approveMaterialRequest(r.id, { notes }).then(() => {})
    ),
    onReject: act((reason: string) =>
      materialRequestService.rejectMaterialRequest(r.id, { reason }).then(() => {})
    ),
  }));

  const officeUseRequestItems: ApprovalItem[] = (officeUseRequestsQ.data?.results ?? []).map(
    (r: any) => ({
      id: r.id,
      title: r.request_number || `Office Use Request #${r.id}`,
      subtitle: `${r.department || ''} — ${r.purpose || ''}`.replace(/^— |— $/, ''),
      date: fmtDate(r.submitted_at || r.created_at),
      viewPath: `/inventory/office-use-requests/${r.id}`,
      onApprove: act((notes: string) =>
        officeUseRequestService.approveOfficeUseRequest(r.id, { notes }).then(() => {})
      ),
      onReject: act((reason: string) =>
        officeUseRequestService.rejectOfficeUseRequest(r.id, { reason }).then(() => {})
      ),
    })
  );

  const feeStructureItems: ApprovalItem[] = (feeStructuresQ.data?.results ?? [])
    .filter((fs: any) => fs.approval_status === 'pending_approval')
    .map((fs: any) => ({
      id: fs.id,
      title: fs.name || `Fee Structure #${fs.id}`,
      subtitle: `${fs.code || ''} — ${fs.category_name || ''}`.replace(/^— |— $/, ''),
      date: fmtDate(fs.updated_at || fs.created_at),
      viewPath: `/incomes/fee-structures/approvals`,
      onApprove: act((notes: string) =>
        incomeFeeStructureService.approveFeeStructure(fs.id, notes).then(() => {})
      ),
      onReject: act((reason: string) =>
        incomeFeeStructureService.rejectFeeStructure(fs.id, reason).then(() => {})
      ),
    }));

  const stockAdjustmentItems: ApprovalItem[] = (stockAdjustmentsQ.data?.results ?? []).map(
    (a: any) => ({
      id: a.id,
      title: a.request_number || `Adjustment #${a.id}`,
      subtitle: `${a.item_name || ''} — ${a.location_name || ''}`.replace(/^— |— $/, ''),
      amount: fmt(a.estimated_cost),
      date: fmtDate(a.created_at),
      viewPath: `/inventory/adjustments/${a.id}`,
      onApprove: act((notes: string) =>
        inventoryService
          .approveStockAdjustment(a.id, { approval_notes: notes } as any)
          .then(() => {})
      ),
      onReject: act((reason: string) =>
        inventoryService
          .rejectStockAdjustment(a.id, { approval_notes: reason } as any)
          .then(() => {})
      ),
    })
  );

  const payrollItems: ApprovalItem[] = (payrollQ.data?.results ?? []).map((p: any) => ({
    id: p.id,
    title: p.payroll_number || `Payroll #${p.id}`,
    subtitle:
      `${p.period_start ? fmtDate(p.period_start) : ''} — ${p.period_end ? fmtDate(p.period_end) : ''}`.replace(
        /^— |— $/,
        ''
      ),
    amount: fmt(p.net_amount || p.total_amount),
    date: fmtDate(p.created_at),
    viewPath: `/hr/payroll/${p.id}`,
    onApprove: act((_notes: string) => hrService.approvePayroll(p.id).then(() => {})),
  }));

  const assetAcquisitionItems: ApprovalItem[] = (
    (assetAcquisitionsQ.data?.results ?? []) as any[]
  ).map((a: any) => ({
    id: a.id,
    title: a.acquisition_number || `Acquisition #${a.id}`,
    subtitle: `${a.supplier_name || ''} — ${a.description || ''}`.replace(/^— |— $/, ''),
    amount: fmt(a.total_amount),
    date: fmtDate(a.acquisition_date || a.created_at),
    viewPath: `/assets/acquisitions/${a.id}`,
    onApprove: act((_notes: string) => assetAcquisitionService.approve(a.id).then(() => {})),
    onReject: act((reason: string) => assetAcquisitionService.reject(a.id, reason).then(() => {})),
  }));

  const paymentReversalItems: ApprovalItem[] = (
    (paymentReversalRequestsQ.data?.results ?? []) as any[]
  ).map((rr: any) => ({
    id: rr.id,
    title: `Reversal Request — ${rr.invoice_number || `Invoice #${rr.invoice_id}`}`,
    subtitle: `${rr.client_name ? rr.client_name + ' — ' : ''}${rr.payment_reference} · ${rr.reason}`,
    amount: fmt(rr.amount),
    date: fmtDate(rr.created_at),
    viewPath: `/sales/invoices/${rr.invoice_id}`,
    onApprove: act((_notes: string) =>
      invoiceService
        .approvePaymentReversal(rr.invoice_id, { reversal_request_id: rr.id })
        .then(() => {})
    ),
    onReject: act((reason: string) =>
      invoiceService
        .rejectPaymentReversal(rr.invoice_id, {
          reversal_request_id: rr.id,
          rejection_reason: reason,
        })
        .then(() => {})
    ),
  }));

  const staffIOUItems: ApprovalItem[] = (staffIOUsQ.data?.results ?? []).map((iou: any) => ({
    id: iou.id,
    title: iou.staff_name || `IOU #${iou.id}`,
    subtitle: iou.reference_number || '',
    amount: fmt(iou.total_amount),
    date: fmtDate(iou.created_at),
    viewPath: `/hr/ious/${iou.id}/view`,
    onApprove: act((_notes: string) => hrService.approveStaffIOU(iou.id).then(() => {})),
    onReject: act((_reason: string) => hrService.cancelStaffIOU(iou.id).then(() => {})),
  }));

  const discountApplicationItems: ApprovalItem[] = (discountApplicationsQ.data?.results ?? []).map(
    (d: any) => ({
      id: d.id,
      title: d.application_number || `Discount App #${d.id}`,
      subtitle: `${d.client_detail?.name || ''} — ${d.program_detail?.name || ''}`.replace(
        /^— |— $/,
        ''
      ),
      amount: fmt(d.actual_discount_value || d.custom_discount_value),
      date: fmtDate(d.application_date || d.created_at),
      viewPath: `/discounts/applications/${d.id}`,
      onApprove: act((notes: string) =>
        discountService
          .approveDiscountApplication(d.id, {
            effective_from: new Date().toISOString().split('T')[0],
            review_notes: notes,
          })
          .then(() => {})
      ),
      onReject: act((reason: string) =>
        discountService.rejectDiscountApplication(d.id, { review_notes: reason }).then(() => {})
      ),
    })
  );

  const loanDisbursementItems: ApprovalItem[] = (
    Array.isArray(loanDisbursementsQ.data) ? loanDisbursementsQ.data : []
  ).map((d: any) => ({
    id: d.id,
    title: d.loan_number || `Disbursement #${d.id}`,
    subtitle: d.requested_by_name || '',
    amount: null,
    date: fmtDate(d.created_at),
    viewPath: `/loans/disbursements/${d.loan}`,
    onApprove: act((_: string) => loanService.approveDisbursement(d.id).then(() => {})),
    onReject: act((reason: string) => loanService.rejectDisbursement(d.id, reason).then(() => {})),
  }));

  const savingsWithdrawalItems: ApprovalItem[] = (
    Array.isArray(savingsWithdrawalsQ.data) ? savingsWithdrawalsQ.data : []
  ).map((w: any) => ({
    id: w.id,
    title: w.account_number || `Withdrawal #${w.id}`,
    subtitle: w.client_name || w.description || '',
    amount: fmt(w.amount),
    date: fmtDate(w.created_at),
    viewPath: `/savings/withdrawals`,
    onApprove: act((notes: string) =>
      approveWithdrawalStep(w.id, { approved: true, comment: notes }).then(() => {})
    ),
  }));

  const loanRepaymentRequestItems: ApprovalItem[] = (
    Array.isArray(loanRepaymentRequestsQ.data) ? loanRepaymentRequestsQ.data : []
  ).map((r: any) => ({
    id: r.id,
    title: r.loan_number || `Repayment Request #${r.id}`,
    subtitle: `${r.client_name || ''} — savings ${r.savings_account_number || ''}`.replace(/^— |— $/, ''),
    amount: fmt(r.amount),
    date: fmtDate(r.created_at),
    viewPath: `/loans/repayment-approvals`,
    onApprove: act((_: string) => loanService.approveRepaymentRequest(r.id).then(() => {})),
    onReject: act((reason: string) =>
      loanService.rejectRepaymentRequest(r.id, reason).then(() => {})
    ),
  }));

  // ── Build sections ─────────────────────────────────────────────────────────

  const sections: ApprovalSection[] = [
    {
      id: 'expenses',
      label: 'Expenses',
      icon: <ReceiptText className="w-4 h-4" />,
      color: 'bg-rose-500',
      items: expenseItems,
      isLoading: expensesQ.isLoading,
      isError: expensesQ.isError && !isForbidden(expensesQ),
      isForbidden: isForbidden(expensesQ),
    },
    {
      id: 'resource-consumptions',
      label: 'Resource Consumptions',
      icon: <FileText className="w-4 h-4" />,
      color: 'bg-orange-500',
      items: consumptionItems,
      isLoading: consumptionsQ.isLoading,
      isError: consumptionsQ.isError && !isForbidden(consumptionsQ),
      isForbidden: isForbidden(consumptionsQ),
    },
    {
      id: 'bank-transfers',
      label: 'Bank Transfers',
      icon: <Banknote className="w-4 h-4" />,
      color: 'bg-cyan-600',
      items: bankTransferItems,
      isLoading: bankTransfersQ.isLoading,
      isError: bankTransfersQ.isError && !isForbidden(bankTransfersQ),
      isForbidden: isForbidden(bankTransfersQ),
    },
    {
      id: 'petty-cash-vouchers',
      label: 'Petty Cash Vouchers',
      icon: <Wallet className="w-4 h-4" />,
      color: 'bg-yellow-500',
      items: pettyCashVoucherItems,
      isLoading: pettyCashVouchersQ.isLoading,
      isError: pettyCashVouchersQ.isError && !isForbidden(pettyCashVouchersQ),
      isForbidden: isForbidden(pettyCashVouchersQ),
    },
    {
      id: 'petty-cash-replenishments',
      label: 'Petty Cash Replenishments',
      icon: <DollarSign className="w-4 h-4" />,
      color: 'bg-amber-600',
      items: pettyCashReplenishmentItems,
      isLoading: pettyCashReplenishmentsQ.isLoading,
      isError: pettyCashReplenishmentsQ.isError && !isForbidden(pettyCashReplenishmentsQ),
      isForbidden: isForbidden(pettyCashReplenishmentsQ),
    },
    {
      id: 'requisitions',
      label: 'Purchase Requisitions',
      icon: <ClipboardList className="w-4 h-4" />,
      color: 'bg-violet-600',
      items: requisitionItems,
      isLoading: requisitionsQ.isLoading,
      isError: requisitionsQ.isError && !isForbidden(requisitionsQ),
      isForbidden: isForbidden(requisitionsQ),
    },
    {
      id: 'purchase-orders',
      label: 'Purchase Orders',
      icon: <ShoppingCart className="w-4 h-4" />,
      color: 'bg-indigo-600',
      items: purchaseOrderItems,
      isLoading: purchaseOrdersQ.isLoading,
      isError: purchaseOrdersQ.isError && !isForbidden(purchaseOrdersQ),
      isForbidden: isForbidden(purchaseOrdersQ),
    },
    {
      id: 'leave-requests',
      label: 'Leave Requests',
      icon: <Users className="w-4 h-4" />,
      color: 'bg-teal-600',
      items: leaveRequestItems,
      isLoading: leaveRequestsQ.isLoading,
      isError: leaveRequestsQ.isError && !isForbidden(leaveRequestsQ),
      isForbidden: isForbidden(leaveRequestsQ),
    },
    {
      id: 'bonus-deductions',
      label: 'Bonus & Deduction Requests',
      icon: <Building2 className="w-4 h-4" />,
      color: 'bg-pink-600',
      items: bonusDeductionItems,
      isLoading: bonusDeductionsQ.isLoading,
      isError: bonusDeductionsQ.isError && !isForbidden(bonusDeductionsQ),
      isForbidden: isForbidden(bonusDeductionsQ),
    },
    {
      id: 'payroll',
      label: 'Payroll Approvals',
      icon: <DollarSign className="w-4 h-4" />,
      color: 'bg-green-600',
      items: payrollItems,
      isLoading: payrollQ.isLoading,
      isError: payrollQ.isError && !isForbidden(payrollQ),
      isForbidden: isForbidden(payrollQ),
    },
    {
      id: 'bank-payments',
      label: 'Bank Payments',
      icon: <CreditCard className="w-4 h-4" />,
      color: 'bg-sky-600',
      items: bankPaymentItems,
      isLoading: bankPaymentsQ.isLoading,
      isError: bankPaymentsQ.isError && !isForbidden(bankPaymentsQ),
      isForbidden: isForbidden(bankPaymentsQ),
    },
    {
      id: 'material-requests',
      label: 'Material Requests',
      icon: <Package className="w-4 h-4" />,
      color: 'bg-lime-600',
      items: materialRequestItems,
      isLoading: materialRequestsQ.isLoading,
      isError: materialRequestsQ.isError && !isForbidden(materialRequestsQ),
      isForbidden: isForbidden(materialRequestsQ),
    },
    {
      id: 'office-use-requests',
      label: 'Office Use Requests',
      icon: <PackageOpen className="w-4 h-4" />,
      color: 'bg-fuchsia-600',
      items: officeUseRequestItems,
      isLoading: officeUseRequestsQ.isLoading,
      isError: officeUseRequestsQ.isError && !isForbidden(officeUseRequestsQ),
      isForbidden: isForbidden(officeUseRequestsQ),
    },
    {
      id: 'fee-structures',
      label: 'Fee Structure Approvals',
      icon: <Tag className="w-4 h-4" />,
      color: 'bg-emerald-600',
      items: feeStructureItems,
      isLoading: feeStructuresQ.isLoading,
      isError: feeStructuresQ.isError && !isForbidden(feeStructuresQ),
      isForbidden: isForbidden(feeStructuresQ),
    },
    {
      id: 'stock-adjustments',
      label: 'Stock Adjustments',
      icon: <Sliders className="w-4 h-4" />,
      color: 'bg-stone-600',
      items: stockAdjustmentItems,
      isLoading: stockAdjustmentsQ.isLoading,
      isError: stockAdjustmentsQ.isError && !isForbidden(stockAdjustmentsQ),
      isForbidden: isForbidden(stockAdjustmentsQ),
    },
    {
      id: 'discount-applications',
      label: 'Discount Applications',
      icon: <Tag className="w-4 h-4" />,
      color: 'bg-purple-600',
      items: discountApplicationItems,
      isLoading: discountApplicationsQ.isLoading,
      isError: discountApplicationsQ.isError && !isForbidden(discountApplicationsQ),
      isForbidden: isForbidden(discountApplicationsQ),
    },
    {
      id: 'asset-acquisitions',
      label: 'Asset Acquisitions (Bulk Purchase)',
      icon: <ShoppingCart className="w-4 h-4" />,
      color: 'bg-orange-700',
      items: assetAcquisitionItems,
      isLoading: assetAcquisitionsQ.isLoading,
      isError: assetAcquisitionsQ.isError && !isForbidden(assetAcquisitionsQ),
      isForbidden: isForbidden(assetAcquisitionsQ),
    },
    {
      id: 'payment-reversals',
      label: 'Payment Reversal Requests',
      icon: <RotateCcw className="w-4 h-4" />,
      color: 'bg-red-600',
      items: paymentReversalItems,
      isLoading: paymentReversalRequestsQ.isLoading,
      isError: paymentReversalRequestsQ.isError && !isForbidden(paymentReversalRequestsQ),
      isForbidden: isForbidden(paymentReversalRequestsQ),
    },
    {
      id: 'staff-ious',
      label: 'Staff IOU Approvals',
      icon: <CreditCard className="w-4 h-4" />,
      color: 'bg-indigo-500',
      items: staffIOUItems,
      isLoading: staffIOUsQ.isLoading,
      isError: staffIOUsQ.isError && !isForbidden(staffIOUsQ),
      isForbidden: isForbidden(staffIOUsQ),
    },
    {
      id: 'loan-disbursements',
      label: 'Loan Disbursements',
      icon: <Landmark className="w-4 h-4" />,
      color: 'bg-blue-700',
      items: loanDisbursementItems,
      isLoading: loanDisbursementsQ.isLoading,
      isError: loanDisbursementsQ.isError && !isForbidden(loanDisbursementsQ),
      isForbidden: isForbidden(loanDisbursementsQ),
    },
    {
      id: 'savings-withdrawals',
      label: 'Savings Withdrawals',
      icon: <Wallet className="w-4 h-4" />,
      color: 'bg-emerald-700',
      items: savingsWithdrawalItems,
      isLoading: savingsWithdrawalsQ.isLoading,
      isError: savingsWithdrawalsQ.isError && !isForbidden(savingsWithdrawalsQ),
      isForbidden: isForbidden(savingsWithdrawalsQ),
    },
    {
      id: 'loan-repayment-requests',
      label: 'Savings-Debit Repayments',
      icon: <PiggyBank className="w-4 h-4" />,
      color: 'bg-violet-700',
      items: loanRepaymentRequestItems,
      isLoading: loanRepaymentRequestsQ.isLoading,
      isError: loanRepaymentRequestsQ.isError && !isForbidden(loanRepaymentRequestsQ),
      isForbidden: isForbidden(loanRepaymentRequestsQ),
    },
  ];

  // ── Derived counts ─────────────────────────────────────────────────────────

  const totalPending = sections.reduce((acc, s) => acc + s.items.length, 0);
  const anyLoading = results.some(q => q.isLoading);

  const filteredSections = filter === 'all' ? sections : sections.filter(s => s.id === filter);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-6 h-6 text-blue-600" />
            Pending Approvals
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            All items waiting for your review across every module.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Total badge */}
          {!anyLoading && (
            <span className="flex items-center gap-1 text-sm font-semibold text-white bg-blue-600 rounded-full px-3 py-1">
              {totalPending} pending
            </span>
          )}
          {/* Refresh */}
          <button
            onClick={refresh}
            disabled={anyLoading}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-blue-300 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${anyLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Module filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <button
          onClick={() => setFilter('all')}
          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'text-gray-600 border-gray-200 hover:border-blue-300'
          }`}
        >
          All
        </button>
        {sections.map(s => {
          const count = s.items.length;
          if (s.isForbidden) return null;
          if (!s.isLoading && !s.isError && count === 0) return null;
          return (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                filter === s.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {s.label} {!s.isLoading && !s.isError && <span className="font-bold">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Empty state (all loaded, nothing pending) */}
      {!anyLoading && totalPending === 0 && filter === 'all' && (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-3">
          <CheckCircle className="w-14 h-14 text-green-400" />
          <p className="text-lg font-semibold text-gray-600">All caught up!</p>
          <p className="text-sm">There are no pending approvals across any module.</p>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-4">
        {filteredSections.map(section => (
          <SectionCard key={section.id} section={section} onRefresh={refresh} />
        ))}
      </div>
    </div>
  );
};

export default UnifiedPendingApprovalsPage;
