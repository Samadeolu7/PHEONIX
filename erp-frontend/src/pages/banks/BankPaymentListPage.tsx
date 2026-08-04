import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, CheckCircle, XCircle, ArrowRightCircle, Loader2 } from 'lucide-react';
import {
  useBankPayments,
  useApproveBankPayment,
  useRejectBankPayment,
  useApplyAdvance,
} from '../../hooks/useBanks';
import type { BankPayment } from '../../types/banks';
import type { AccountsPayableListItem } from '../../types/liabilities';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { listPayables } from '../../services/liabilitiesService';
import TransactionEntriesModal from '../../components/ledger/TransactionEntriesModal';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  posted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  failed: 'bg-red-100 text-red-700',
  draft: 'bg-gray-100 text-gray-600',
};

// ── Apply Advance Modal ────────────────────────────────────────────────────────

interface ApplyAdvanceModalProps {
  payment: BankPayment;
  onClose: () => void;
  onSuccess: () => void;
}

const ApplyAdvanceModal: React.FC<ApplyAdvanceModalProps> = ({ payment, onClose, onSuccess }) => {
  const applyAdvance = useApplyAdvance();
  const [selectedApId, setSelectedApId] = useState<number | ''>('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [bypassValidation, setBypassValidation] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch outstanding APs for this supplier
  const { data: payablesData, isLoading: loadingAPs } = useQuery({
    queryKey: ['payables-for-supplier', payment.supplier],
    queryFn: () => listPayables({ vendor_type: 'supplier', vendor_id: payment.supplier as number }),
    enabled: !!payment.supplier,
    staleTime: 30_000,
  });

  // Only show APs that still have a remaining balance
  const openPayables: AccountsPayableListItem[] = (payablesData?.results ?? []).filter(
    ap => parseFloat(ap.outstanding_amount) > 0 && ap.status !== 'paid' && ap.status !== 'cancelled'
  );

  const advanceRemaining = parseFloat(payment.advance_remaining ?? payment.amount ?? '0');

  const selectedAp = openPayables.find(ap => ap.id === selectedApId);
  const maxAmount = selectedAp
    ? Math.min(advanceRemaining, parseFloat(selectedAp.outstanding_amount)).toFixed(2)
    : advanceRemaining.toFixed(2);

  const handleApplyFull = () => {
    setAmount(maxAmount);
  };

  const handleSubmit = async () => {
    if (!selectedApId || !amount) return;
    setError(null);
    try {
      await applyAdvance.mutateAsync({
        id: payment.id,
        data: {
          accounts_payable: selectedApId as number,
          amount,
          notes,
          bypass_validation: bypassValidation,
        },
      });
      onSuccess();
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setError(
        e?.details?.error ?? (err instanceof Error ? err.message : 'Failed to apply advance.')
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Apply Advance to Invoice</h2>
        <p className="text-sm text-gray-500 mb-4">
          Supplier: <strong>{payment.supplier_name}</strong> &nbsp;|&nbsp; Advance:{' '}
          <strong>{payment.payment_number}</strong> &nbsp;|&nbsp; Remaining:{' '}
          <strong className="text-blue-700">{advanceRemaining.toFixed(2)}</strong>
        </p>

        {/* AP selector */}
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Select outstanding invoice
        </label>
        {loadingAPs ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading invoices…
          </div>
        ) : openPayables.length === 0 ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            No outstanding invoices found for this supplier. Create an Accounts Payable record
            first.
          </div>
        ) : (
          <select
            title="Select invoice to apply advance against"
            value={selectedApId}
            onChange={e => {
              setSelectedApId(e.target.value ? Number(e.target.value) : '');
              setAmount('');
            }}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select invoice —</option>
            {openPayables.map(ap => (
              <option key={ap.id} value={ap.id}>
                {ap.invoice_number} | Due: {parseFloat(ap.outstanding_amount).toFixed(2)} | Status:{' '}
                {ap.status}
              </option>
            ))}
          </select>
        )}

        {/* Amount */}
        {selectedApId !== '' && (
          <>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount to apply</label>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={maxAmount}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Max: ${maxAmount}`}
              />
              <button
                type="button"
                onClick={handleApplyFull}
                className="px-3 py-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
              >
                Full ({maxAmount})
              </button>
            </div>
          </>
        )}

        {/* Notes */}
        <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="e.g. Applied advance BPM-... to invoice INV-..."
        />

        {/* Bypass 3-way match */}
        <label className="flex items-center gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={bypassValidation}
            onChange={e => setBypassValidation(e.target.checked)}
            className="rounded"
          />
          Skip 3-way match validation (use with caution)
        </label>

        {error && (
          <div className="mb-3 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedApId || !amount || applyAdvance.isPending}
            className="inline-flex items-center gap-2 px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {applyAdvance.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Apply Advance
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Page ──────────────────────────────────────────────────────────────────

const BankPaymentListPage: React.FC = () => {
  const { canUserApprove } = useApprovalGuard();
  const { data: payments = [], isLoading, isFetching, refetch } = useBankPayments();
  const approvePayment = useApproveBankPayment();
  const rejectPayment = useRejectBankPayment();

  const [rejectModal, setRejectModal] = useState<{ open: boolean; paymentId: number | null }>({
    open: false,
    paymentId: null,
  });
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Apply advance modal state
  const [applyModal, setApplyModal] = useState<{ open: boolean; payment: BankPayment | null }>({
    open: false,
    payment: null,
  });

  const [entriesModalTxnId, setEntriesModalTxnId] = useState<number | null>(null);

  const pendingCount = payments.filter(p => p.status === 'pending').length;

  const handleApprove = async (payment: BankPayment) => {
    setActionError(null);
    try {
      await approvePayment.mutateAsync({ id: payment.id });
    } catch (err: unknown) {
      const e = err as {
        details?: { error?: string; non_field_errors?: string[] };
        message?: string;
      };
      setActionError(
        e?.details?.error ||
          e?.details?.non_field_errors?.join(' ') ||
          (err instanceof Error ? err.message : 'Approval failed')
      );
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectModal.paymentId || !rejectReason.trim()) return;
    setActionError(null);
    try {
      await rejectPayment.mutateAsync({ id: rejectModal.paymentId, reason: rejectReason });
      setRejectModal({ open: false, paymentId: null });
      setRejectReason('');
    } catch (err: unknown) {
      const e = err as { details?: { error?: string }; message?: string };
      setActionError(
        e?.details?.error || (err instanceof Error ? err.message : 'Rejection failed')
      );
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bank Payments</h1>
          <p className="text-gray-600">Track payments made to suppliers and expenses</p>
          {pendingCount > 0 && (
            <span className="inline-flex items-center mt-1 px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
              {pendingCount} pending approval
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isFetching && !isLoading && <span className="text-sm text-gray-500">Refreshing...</span>}
          <Link
            to="/banks/payments/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Bank Payment
          </Link>
        </div>
      </div>

      {actionError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {actionError}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        {isLoading ? (
          <div className="p-6 text-gray-600">Loading bank payments...</div>
        ) : payments.length === 0 && !isFetching ? (
          <div className="p-6 text-gray-600">No bank payments recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Payment #</th>
                  <th className="px-4 py-3 text-left font-medium">Date</th>
                  <th className="px-4 py-3 text-left font-medium">Type</th>
                  <th className="px-4 py-3 text-left font-medium">Reference</th>
                  <th className="px-4 py-3 text-left font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Advance Balance</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-left font-medium">GL Entry</th>
                  <th className="px-4 py-3 text-left font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {payments.map(payment => {
                  const isOnAccount = !!payment.supplier;
                  const remaining = parseFloat(payment.advance_remaining ?? '0');
                  const isFullyApplied = isOnAccount && remaining <= 0;

                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">
                        {payment.payment_number}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{payment.payment_date}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {payment.accounts_payable
                          ? 'Supplier / AP'
                          : payment.supplier
                            ? 'On Account'
                            : 'Expense'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {payment.accounts_payable_vendor ||
                          payment.supplier_name ||
                          payment.accounts_payable_reference ||
                          payment.expense_reference ||
                          payment.reference_number ||
                          '--'}
                      </td>
                      <td className="px-4 py-3 text-gray-900">{payment.amount}</td>
                      <td className="px-4 py-3">
                        {isOnAccount ? (
                          <span
                            className={`text-sm font-medium ${
                              isFullyApplied ? 'text-green-600' : 'text-amber-600'
                            }`}
                          >
                            {isFullyApplied
                              ? '✓ Fully applied'
                              : `${remaining.toFixed(2)} remaining`}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2 py-1 text-xs rounded-full ${STATUS_BADGE[payment.status] ?? 'bg-gray-100 text-gray-600'}`}
                        >
                          {payment.status_display ?? payment.status}
                        </span>
                        {payment.status === 'rejected' && payment.rejection_reason && (
                          <p
                            className="mt-1 text-xs text-red-500 max-w-xs truncate"
                            title={payment.rejection_reason}
                          >
                            {payment.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {payment.journal_entry && payment.journal_entry_reference ? (
                          <button
                            onClick={() => setEntriesModalTxnId(payment.journal_entry!)}
                            className="text-xs text-blue-600 hover:underline font-mono"
                            title="View debit/credit entries"
                          >
                            {payment.journal_entry_reference}
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Approve / Reject */}
                          {canUserApprove && payment.status === 'pending' && (
                            <>
                              <button
                                onClick={() => handleApprove(payment)}
                                disabled={approvePayment.isPending}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                              >
                                <CheckCircle className="w-3 h-3" />
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  setRejectModal({ open: true, paymentId: payment.id })
                                }
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                <XCircle className="w-3 h-3" />
                                Reject
                              </button>
                            </>
                          )}

                          {/* Apply to Invoice — visible for posted on-account payments with remaining balance */}
                          {isOnAccount && payment.status === 'posted' && !isFullyApplied && (
                            <button
                              onClick={() => setApplyModal({ open: true, payment })}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                              <ArrowRightCircle className="w-3 h-3" />
                              Apply to Invoice
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reject modal */}
      {rejectModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Reject Payment</h2>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for rejection *
            </label>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter reason..."
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectModal({ open: false, paymentId: null });
                  setRejectReason('');
                }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectSubmit}
                disabled={!rejectReason.trim() || rejectPayment.isPending}
                className="px-4 py-2 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Apply advance modal */}
      {applyModal.open && applyModal.payment && (
        <ApplyAdvanceModal
          payment={applyModal.payment}
          onClose={() => setApplyModal({ open: false, payment: null })}
          onSuccess={() => {
            setApplyModal({ open: false, payment: null });
            refetch();
          }}
        />
      )}

      {/* GL Entries Modal */}
      {entriesModalTxnId != null && (
        <TransactionEntriesModal
          transactionId={entriesModalTxnId}
          onClose={() => setEntriesModalTxnId(null)}
        />
      )}
    </div>
  );
};

export default BankPaymentListPage;
