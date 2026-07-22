/**
 * Loan Account Detail Page
 * Shows loan summary, client info, repayment schedule, and stage-appropriate action buttons.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  Loader2,
  RefreshCw,
  X,
  XCircle,
  CreditCard,
  CheckCircle,
  DollarSign,
  RotateCcw,
  Printer,
  ShieldAlert,
  UserCheck,
  UserPlus,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Pencil,
  Save,
  Building2,
} from 'lucide-react';
import {
  loanService,
  LoanAccount,
  LoanGuarantor,
  LoanRepaymentSchedule,
  LoanTransactionRow,
  RepayLoanPayload,
  ProposeRestructurePayload,
} from '../../services/loanService';
import { clientService, ClientOption, Client } from '../../services/clientService';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import { guarantorService, GuarantorProfile } from '../../services/guarantorService';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';
import {
  useLoanAccount,
  useLoanSchedule,
  useLoanGuarantors,
  useLoanTransactions,
  useApproveLoan,
  useRejectLoan,
  useRequestDisbursement,
  useDeleteGuarantor,
  useLoanRestructureApprovals,
  useLoanDisbursementCorrections,
} from '../../hooks/useLoans';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

interface RestructurePreviewEstimate {
  newRate: number;
  totalNewInterest: number;
  normalInterestAmount: number;
  restructureInterestAmount: number;
}

/**
 * Client-side estimate only — the authoritative figure is computed server-side
 * by LoanAccount.restructure() at approval time (same formula, Decimal-precise).
 * This just lets the officer see roughly what they're proposing before they submit.
 */
function estimateRestructurePreview(loan: LoanAccount, newTermRaw: string): RestructurePreviewEstimate | null {
  const oldRate = parseFloat(loan.interest_rate);
  const oldTerm = loan.term_months;
  const newTerm = parseInt(newTermRaw, 10);
  const balance = parseFloat(loan.outstanding_principal);
  if (!oldTerm || oldTerm <= 0 || !Number.isFinite(oldRate) || !Number.isFinite(balance)) return null;
  if (!newTermRaw || isNaN(newTerm) || newTerm <= 0) return null;

  const ratePerUnit = oldRate / oldTerm;
  const newRate = round2(ratePerUnit * newTerm);
  const totalNewInterest = round2((balance * newRate) / 100);
  const normalInterestAmount = round2((balance * oldRate) / 100);
  const restructureInterestAmount = round2(totalNewInterest - normalInterestAmount);

  return { newRate, totalNewInterest, normalInterestAmount, restructureInterestAmount };
}

const STATUS_BADGE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  approved:   'bg-blue-100 text-blue-700',
  disbursed:  'bg-indigo-100 text-indigo-700',
  active:     'bg-green-100 text-green-700',
  defaulted:  'bg-orange-100 text-orange-700',
  paid_off:   'bg-gray-100 text-gray-600',
  written_off:'bg-red-100 text-red-700',
  rejected:   'bg-red-100 text-red-700',
  cancelled:  'bg-gray-100 text-gray-500',
};

const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  partial:  'bg-orange-100 text-orange-700',
  paid:     'bg-green-100 text-green-700',
  overdue:  'bg-red-100 text-red-700',
};

// ── Repayment Modal ────────────────────────────────────────────────────────

interface RepayModalProps {
  loan: LoanAccount;
  nextInstallment: LoanRepaymentSchedule | null;
  onClose: () => void;
  onSuccess: () => void;
}

function RepayModal({ loan, nextInstallment, onClose, onSuccess }: RepayModalProps) {
  // Compute total currently due = all overdue/partial installments + next pending installment.
  // This matches the backend's payable_now calculation so the spillover preview is accurate.
  const overdueItems = loan.repayment_schedule.filter(
    (s) => s.status === 'overdue' || s.status === 'partial'
  );
  const overdueDue = overdueItems.reduce(
    (sum, s) => sum + parseFloat(s.total_due) - parseFloat(s.total_paid), 0
  );
  const nextPending = loan.repayment_schedule
    .filter((s) => s.status === 'pending')
    .sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())[0] ?? null;
  const nextPendingDue = nextPending
    ? parseFloat(nextPending.total_due) - parseFloat(nextPending.total_paid)
    : 0;
  const totalOutstanding = parseFloat(String(loan.total_outstanding ?? '0'));
  const totalCurrentlyDue = Math.min(overdueDue + nextPendingDue, totalOutstanding);

  const [amount, setAmount] = useState(totalCurrentlyDue > 0 ? totalCurrentlyDue.toFixed(2) : '');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [spilloverCredited, setSpilloverCredited] = useState('0.00');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');

  useEffect(() => {
    bankService.listBankAccounts({ is_active: true }).then(setBankAccounts);
  }, []);

  const enteredAmount = parseFloat(amount) || 0;
  const previewSpillover = Math.max(0, enteredAmount - totalCurrentlyDue);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!enteredAmount || enteredAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }
    if (paymentMode === 'bank_transfer') {
      if (typeof selectedBankId !== 'number') {
        setError('Please select a destination bank account.');
        return;
      }
      if (!bankReference.trim()) {
        setError('Bank reference is required for bank transfer payments.');
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: RepayLoanPayload = {
        amount: amount,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        bank_account_id: paymentMode === 'bank_transfer' ? selectedBankId : undefined,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
      };
      const result = await loanService.repayLoan(loan.id, payload);
      const credited = result?.spillover_to_savings ?? result?.overpayment_credited ?? '0';
      setSpilloverCredited(credited);
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (e: unknown) {
      const data = (e as any)?.response?.data;
      const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Failed to record repayment.';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={18} />
        </button>

        <h2 className="mb-1 text-lg font-semibold text-gray-900">Record Repayment</h2>
        <p className="mb-4 text-sm text-gray-500">
          {loan.loan_number} — {loan.client_name}
        </p>

        {totalCurrentlyDue > 0 && (
          <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm space-y-1">
            {overdueItems.length > 0 && (
              <div className="text-red-700 font-medium">
                {overdueItems.length} overdue installment{overdueItems.length > 1 ? 's' : ''} — ₦{fmt(overdueDue)} outstanding
              </div>
            )}
            {nextPending && (
              <div className="text-blue-800">
                {overdueItems.length > 0 ? 'Next pending: ' : 'Installment due '}
                {fmtDate(nextPending.due_date)} — ₦{fmt(nextPendingDue)}
              </div>
            )}
            <div className="font-semibold text-blue-900 border-t border-blue-200 pt-1 mt-1">
              Total currently due: <strong>₦{fmt(totalCurrentlyDue)}</strong>
            </div>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Repayment recorded successfully</p>
            {parseFloat(spilloverCredited) > 0 && (
              <p className="mt-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-1.5">
                ₦{fmt(spilloverCredited)} spillover credited to client savings
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Amount (₦)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Enter amount collected"
                required
              />
              {previewSpillover > 0 && (
                <p className="mt-1 text-xs text-blue-600">
                  ₦{fmt(previewSpillover)} above current dues — will be credited to savings
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Date
              </label>
              <input
                type="date"
                title="Payment date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Payment Mode
              </label>
              <div className="flex gap-3">
                {(['cash', 'bank_transfer'] as const).map((mode) => (
                  <label key={mode} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="paymentMode"
                      value={mode}
                      checked={paymentMode === mode}
                      onChange={() => setPaymentMode(mode)}
                      className="accent-blue-600"
                    />
                    <span className="text-sm capitalize text-gray-700">
                      {mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {paymentMode === 'bank_transfer' && (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Destination Bank Account <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={selectedBankId}
                    onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : '')}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    aria-label="Destination Bank Account"
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Bank Reference <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={bankReference}
                    onChange={(e) => setBankReference(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="e.g. TRF/20240617/1234567"
                    required={paymentMode === 'bank_transfer'}
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Transaction reference from bank notification / statement
                  </p>
                </div>
              </>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                Post Repayment
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Restructure Modal ──────────────────────────────────────────────────────

interface RestructureModalProps {
  loan: LoanAccount;
  onClose: () => void;
  onSuccess: () => void;
}

function RestructureModal({ loan, onClose, onSuccess }: RestructureModalProps) {
  const [newTerm, setNewTerm] = useState(String(loan.term_months));
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const preview = useMemo(() => estimateRestructurePreview(loan, newTerm), [loan, newTerm]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newTerm) {
      setError('New term is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: ProposeRestructurePayload = {
        new_term: parseInt(newTerm, 10),
        effective_date: effectiveDate,
        reason,
        notes,
      };
      await loanService.proposeRestructure(loan.id, payload);
      setSuccess(true);
      setTimeout(() => { onSuccess(); }, 1200);
    } catch (e: unknown) {
      const data = (e as any)?.response?.data;
      const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Could not submit restructure proposal.';
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Propose Restructure</h2>
        <p className="mb-4 text-sm text-gray-500">
          {loan.loan_number} — Outstanding principal: ₦{fmt(loan.outstanding_principal)}
        </p>
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          This submits a proposal for director approval — nothing changes on the loan yet.
          The new interest rate isn't typed in: it's derived from the loan's current rate/term
          scaled to the new term you propose (e.g. 12% over 6 months implies 20% over 10 months).
          Any interest/penalties already owed are folded into the new schedule's installments,
          not collected separately.
        </div>
        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Restructure proposal submitted</p>
            <p className="mt-1 text-sm text-gray-500">Awaiting director approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="rs-term" className="mb-1 block text-sm font-medium text-gray-700">
                New Term ({loan.term_unit ?? 'months'})
              </label>
              <input id="rs-term" type="number" min="1" title="Proposed new loan term" value={newTerm} onChange={e => setNewTerm(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" required />
              <p className="mt-1 text-xs text-gray-400">
                Currently {loan.term_months} {loan.term_unit ?? 'months'} at {loan.interest_rate}%.
              </p>
            </div>

            {preview && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm">
                <p className="mb-1.5 font-medium text-blue-900">Estimated outcome (final figures set at approval)</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-blue-800">
                  <span>New rate</span>
                  <span className="text-right font-medium">{preview.newRate.toFixed(2)}%</span>
                  <span>Total new interest</span>
                  <span className="text-right font-medium">₦{fmt(preview.totalNewInterest)}</span>
                  <span>— at current rate ({loan.interest_rate}%)</span>
                  <span className="text-right">₦{fmt(preview.normalInterestAmount)}</span>
                  <span>— restructure income (term extension)</span>
                  <span className="text-right">₦{fmt(preview.restructureInterestAmount)}</span>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="rs-date" className="mb-1 block text-sm font-medium text-gray-700">Effective Date</label>
              <input id="rs-date" type="date" title="Restructure effective date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" required />
            </div>
            <div>
              <label htmlFor="rs-reason" className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
              <input id="rs-reason" type="text" title="Restructure reason" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Financial hardship, Business downturn"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            <div>
              <label htmlFor="rs-notes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
              <textarea id="rs-notes" title="Additional notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </div>
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />{error}
              </div>
            )}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                Submit for Approval
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Disbursement Correction Modal ───────────────────────────────────────────
// Requests a wrong-customer correction — reverses this loan's disbursement and
// re-disburses a new loan to the correct client. Always requires two director
// approvals (see LoanDisbursementCorrection, loans/models.py) before anything
// actually happens; submitting here only creates the request.

interface CorrectionModalProps {
  loan: LoanAccount;
  onClose: () => void;
  onSuccess: () => void;
}

function CorrectionModal({ loan, onClose, onSuccess }: CorrectionModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const searchTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasRepayments = parseFloat(loan.total_paid || '0') > 0;

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const res = await clientService.getClients({ search: query.trim(), status: 'active', page_size: 20 } as any);
        const list: Client[] = (res as any)?.results ?? (res as any)?.data ?? (res as any) ?? [];
        setResults(list.filter(c => c.id !== loan.client));
        setDropdownOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query, loan.client]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedClient) {
      setError('Select the customer this loan should have gone to.');
      return;
    }
    if (reason.trim().length < 10) {
      setError('Explain what happened (at least 10 characters) — this becomes part of the audit trail.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const created = await loanService.requestDisbursementCorrection({
        original_loan: loan.id,
        correct_client: selectedClient.id,
        reason: reason.trim(),
      });
      setSuccess(created.reference_number);
      setTimeout(() => { onSuccess(); }, 1500);
    } catch (e: unknown) {
      setError(extractApiError(e, 'Could not submit the correction request.'));
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90vh]">
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Correct Disbursed-to-Wrong-Customer</h2>
        <p className="mb-4 text-sm text-gray-500">{loan.loan_number} — ₦{fmt(loan.disbursed_amount)} disbursed</p>

        <div className="mb-4 flex items-center gap-3 rounded-lg bg-red-50 border border-red-200 p-3">
          <ClientAvatar image={loan.client_image} name={loan.client_name} size="md" />
          <div className="text-sm">
            <p className="text-red-700">Currently disbursed to</p>
            <p className="font-semibold text-red-900">{loan.client_name}</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
          This only creates a request. Two different directors must approve it before anything
          happens — neither you nor the first approver can also be the second. Once fully
          approved, the disbursement to {loan.client_name} is reversed and a brand-new loan is
          disbursed to the correct customer with the same terms.
        </div>

        {hasRepayments && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-3 text-xs text-red-800">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              ₦{fmt(loan.total_paid)} has already been repaid on this loan. The automated
              correction only handles loans with no repayment history — contact accounting for a
              manual adjustment instead.
            </span>
          </div>
        )}

        {success ? (
          <div className="flex flex-col items-center py-6 text-center">
            <CheckCircle size={40} className="mb-2 text-green-500" />
            <p className="font-medium text-gray-900">Correction {success} submitted</p>
            <p className="mt-1 text-sm text-gray-500">Awaiting first director approval.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Correct Customer</label>
              {selectedClient ? (
                <div className="flex items-center justify-between rounded-lg border border-blue-400 bg-blue-50 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 font-medium text-gray-900">
                    <ClientAvatar image={selectedClient.image} name={selectedClient.full_name} size="xs" />
                    {selectedClient.full_name}
                    {selectedClient.phone_primary && (
                      <span className="font-normal text-gray-500"> · {selectedClient.phone_primary}</span>
                    )}
                  </span>
                  <button type="button" aria-label="Clear selected customer" onClick={() => setSelectedClient(null)}
                    className="text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onFocus={() => { if (results.length > 0) setDropdownOpen(true); }}
                    placeholder="Search by name or phone…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  {searching && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
                  {dropdownOpen && results.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg text-sm">
                      {results.map(c => (
                        <li key={c.id}>
                          <button type="button" onMouseDown={e => e.preventDefault()}
                            onClick={() => { setSelectedClient(c); setQuery(''); setDropdownOpen(false); }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-blue-50">
                            <span className="flex items-center gap-2 font-medium text-gray-900">
                              <ClientAvatar image={c.image} name={c.full_name} size="xs" />
                              {c.full_name}
                            </span>
                            {c.phone_primary && <span className="ml-2 text-xs text-gray-400">{c.phone_primary}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>

            <div>
              <label htmlFor="cor-reason" className="mb-1 block text-sm font-medium text-gray-700">
                What happened?
              </label>
              <textarea id="cor-reason" title="Reason for the correction" value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="e.g. Picked the wrong customer from the search results while creating the loan on 2026-07-16."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" required />
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />{error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button type="submit" disabled={submitting || !selectedClient}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <AlertCircle size={14} />}
                Submit for Approval
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Add Guarantor Modal ────────────────────────────────────────────────────

/** Pulls the most user-readable message from a thrown api.ts error. */
function extractApiError(e: unknown, fallback: string): string {
  const err = e as any;
  const data = err?.response?.data ?? err?.details;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.non_field_errors) && typeof data.non_field_errors[0] === 'string')
      return data.non_field_errors[0];
    if (typeof data.detail === 'string') return data.detail;
    // Scan every field error and return the first non-empty one
    for (const val of Object.values(data)) {
      if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
      if (typeof val === 'string' && val) return val;
    }
  }
  return (typeof err?.message === 'string' && err.message) ? err.message : fallback;
}

type GuarantorMode = 'search' | 'new';

interface AddGuarantorModalProps {
  loanId: number;
  onClose: () => void;
  onSuccess: () => void;
}

type SearchResultType = 'client' | 'guarantor';

interface SearchResult {
  type: SearchResultType;
  id: number;
  name: string;
  phone: string;
  label: string;
}

function AddGuarantorModal({ loanId, onClose, onSuccess }: AddGuarantorModalProps) {
  const [mode, setMode] = useState<GuarantorMode>('search');

  // Search-existing state
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);

  // New-person state — maps to GuarantorCreateSerializer
  const [newPerson, setNewPerson] = useState({
    first_name: '', last_name: '',
    middle_name: '',
    phone: '',
    gender: '' as 'male' | 'female' | 'other' | '',
    occupation: '', address: '',
  });

  // Shared state
  const [guaranteedAmount, setGuaranteedAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successName, setSuccessName] = useState('');

  useEffect(() => {
    if (mode !== 'search') return;
    const timer = setTimeout(async () => {
      if (!search.trim()) { setSearchResults([]); return; }
      setSearchLoading(true);
      try {
        const [clients, guarantors] = await Promise.all([
          clientService.getClientOptions({ search: search.trim(), status: 'active' } as any),
          guarantorService.getGuarantors({ search: search.trim() }),
        ]);
        const results: SearchResult[] = [
          ...(Array.isArray(clients) ? clients : clients?.results ?? []).map((c: any) => ({
            type: 'client' as const,
            id: c.id,
            name: c.name || c.full_name || '',
            phone: c.phone_primary || '',
            label: 'Client',
          })),
          ...guarantors.map(g => ({
            type: 'guarantor' as const,
            id: g.id,
            name: g.full_name,
            phone: g.phone || '',
            label: 'Guarantor',
          })),
        ];
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [search, mode]);

  function setPerson(field: keyof typeof newPerson, value: string) {
    setNewPerson(p => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!guaranteedAmount || parseFloat(guaranteedAmount) <= 0) {
      setError('Enter a valid guaranteed amount.');
      return;
    }
    setSubmitting(true);
    setError(null);

    let personName: string;
    let payload: { loan: number; guarantor?: number; guarantor_person?: number; guaranteed_amount: string };

    if (mode === 'search') {
      if (!selectedResult) { setError('Select a person first.'); setSubmitting(false); return; }
      personName = selectedResult.name;
      if (selectedResult.type === 'client') {
        payload = { loan: loanId, guarantor: selectedResult.id, guaranteed_amount: guaranteedAmount };
      } else {
        payload = { loan: loanId, guarantor_person: selectedResult.id, guaranteed_amount: guaranteedAmount };
      }
    } else {
      const { first_name, last_name, phone, gender } = newPerson;
      if (!first_name || !last_name) {
        setError('First name and last name are required.');
        setSubmitting(false);
        return;
      }

      let created;
      try {
        created = await guarantorService.createGuarantor({
          first_name,
          last_name,
          middle_name: newPerson.middle_name || undefined,
          phone: phone || undefined,
          gender: gender || undefined,
          occupation: newPerson.occupation || undefined,
          address: newPerson.address || undefined,
        });
      } catch (createErr) {
        const msg = extractApiError(
          createErr,
          'Could not register the guarantor. Please check the details and try again.',
        );
        setError(msg);
        toast.error(msg);
        setSubmitting(false);
        return;
      }

      personName = created.full_name || `${first_name} ${last_name}`.trim();
      payload = { loan: loanId, guarantor_person: created.id, guaranteed_amount: guaranteedAmount };
    }

    try {
      await loanService.addGuarantor(payload);
    } catch (linkErr) {
      const msg = extractApiError(
        linkErr,
        'Could not link this guarantor to the loan. Please try again.',
      );
      setError(msg);
      toast.error(msg);
      setSubmitting(false);
      return;
    }

    setSuccessName(personName!);
  }

  if (successName) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-xl">
          <CheckCircle size={44} className="mx-auto mb-3 text-green-500" />
          <p className="text-base font-semibold text-gray-900">{successName}</p>
          <p className="mt-1 text-sm text-gray-500">Added as guarantor successfully.</p>
          <button type="button" onClick={onSuccess}
            className="mt-5 w-full rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <button type="button" aria-label="Close" onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100">
          <X size={18} />
        </button>
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Add Guarantor</h2>
        <p className="mb-4 text-xs text-gray-400">
          Search for an existing person or register a new one as guarantor.
        </p>

        {/* Mode tabs */}
        <div className="mb-5 flex rounded-lg border border-gray-200 p-1">
          {(['search', 'new'] as GuarantorMode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => { setMode(m); setError(null); }}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-colors ${
                mode === m ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {m === 'search' ? 'Search Existing' : 'Register New Person'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'search' ? (
            /* ── Search existing — searches both Clients and Guarantor profiles ── */
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Search by name or phone <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setSelectedResult(null); }}
                placeholder="Type a name or phone number…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              />
              {searchLoading && (
                <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                  <Loader2 size={11} className="animate-spin" /> Searching…
                </p>
              )}
              {!searchLoading && searchResults.length > 0 && !selectedResult && (
                <ul className="mt-1 max-h-44 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
                  {searchResults.map(r => (
                    <li key={`${r.type}-${r.id}`}>
                      <button type="button"
                        onClick={() => { setSelectedResult(r); setSearch(r.name); setSearchResults([]); }}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-purple-50">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{r.name}</span>
                          <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                            r.type === 'client'
                              ? 'bg-blue-50 text-blue-600'
                              : 'bg-purple-50 text-purple-600'
                          }`}>
                            {r.label}
                          </span>
                        </div>
                        {r.phone && <span className="text-xs text-gray-400">{r.phone}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!searchLoading && search.trim() && searchResults.length === 0 && !selectedResult && (
                <p className="mt-1 text-xs text-gray-400">
                  No match found.{' '}
                  <button type="button" onClick={() => setMode('new')}
                    className="text-purple-600 underline hover:text-purple-700">
                    Register as new person instead
                  </button>
                </p>
              )}
              {selectedResult && (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-purple-50 px-3 py-2 text-sm">
                  <UserCheck size={14} className="text-purple-600" />
                  <span className="font-medium text-purple-900">{selectedResult.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                    selectedResult.type === 'client'
                      ? 'bg-blue-50 text-blue-600'
                      : 'bg-purple-50 text-purple-600'
                  }`}>
                    {selectedResult.label}
                  </span>
                  <button type="button" onClick={() => { setSelectedResult(null); setSearch(''); }}
                    aria-label="Clear selection"
                    className="ml-auto text-gray-400 hover:text-gray-600">
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* ── Register new person — creates a Guarantor profile (not a Client) ── */
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={newPerson.first_name}
                    onChange={e => setPerson('first_name', e.target.value)}
                    placeholder="First name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input type="text" value={newPerson.last_name}
                    onChange={e => setPerson('last_name', e.target.value)}
                    placeholder="Last name"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Phone <span className="text-red-500">*</span>
                  </label>
                  <input type="tel" value={newPerson.phone}
                    onChange={e => setPerson('phone', e.target.value)}
                    placeholder="08012345678"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    Gender <span className="text-red-500">*</span>
                  </label>
                  <select value={newPerson.gender}
                    onChange={e => setPerson('gender', e.target.value)}
                    aria-label="Gender"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500">
                    <option value="">Select…</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Occupation</label>
                <input type="text" value={newPerson.occupation}
                  onChange={e => setPerson('occupation', e.target.value)}
                  placeholder="e.g. Trader, Teacher, Civil Servant"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">Home Address</label>
                <input type="text" value={newPerson.address}
                  onChange={e => setPerson('address', e.target.value)}
                  placeholder="Street address"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500" />
              </div>
            </div>
          )}

          {/* Guaranteed amount — always shown */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Guaranteed Amount (₦) <span className="text-red-500">*</span>
            </label>
            <input
              type="number" min="1" step="0.01"
              value={guaranteedAmount}
              onChange={e => setGuaranteedAmount(e.target.value)}
              placeholder="e.g. 500000"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
              required
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={submitting}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50">
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
              {mode === 'new' ? 'Register & Add' : 'Add Guarantor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function LoanAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loanId = parseInt(id ?? '0', 10);

  const LEDGER_PAGE_SIZE = 25;
  const [ledgerPage, setLedgerPage] = useState(1);
  const [showRepayModal, setShowRepayModal] = useState(false);
  const [showRestructureModal, setShowRestructureModal] = useState(false);
  const [showCorrectionModal, setShowCorrectionModal] = useState(false);
  const [showAddGuarantorModal, setShowAddGuarantorModal] = useState(false);

  // Client bank details inline edit
  const [bankEditMode, setBankEditMode] = useState(false);
  const [bankDraft, setBankDraft] = useState({ bank_name: '', bank_account_name: '', bank_account_number: '', bvn: '' });
  const [bankSaving, setBankSaving] = useState(false);
  const [bankError, setBankError] = useState<string | null>(null);

  // React Query hooks
  const { data: loan, isLoading: loading, error: loanError, refetch: refetchLoan } = useLoanAccount(loanId);
  const { data: schedule = [] } = useLoanSchedule(loanId);
  const { data: guarantors = [], refetch: refetchGuarantors } = useLoanGuarantors(loanId);
  const { data: ledgerData, isLoading: ledgerLoading } = useLoanTransactions(loanId, ledgerPage, LEDGER_PAGE_SIZE);
  const ledger = ledgerData?.results ?? [];
  const ledgerTotal = ledgerData?.count ?? 0;
  const { data: pendingRestructures = [] } = useLoanRestructureApprovals({ status: 'pending' });
  const { data: corrections = [] } = useLoanDisbursementCorrections();
  const approveLoanMutation = useApproveLoan();
  const rejectLoanMutation = useRejectLoan();
  const requestDisbursementMutation = useRequestDisbursement();
  const deleteGuarantorMutation = useDeleteGuarantor();

  const pendingRestructureRequestId = useMemo(() => {
    const match = pendingRestructures.find(r => r.loan === loanId);
    return match ? match.id : null;
  }, [pendingRestructures, loanId]);

  const pendingCorrectionRef = useMemo(() => {
    const match = corrections.find(
      c => c.original_loan === loanId && (c.status === 'pending' || c.status === 'awaiting_second_approval')
    );
    return match ? match.reference_number : null;
  }, [corrections, loanId]);

  const error = loanError ? ((loanError as any)?.response?.data?.detail || loanError.message || 'Failed to load loan details.') : null;

  async function handleApprove() {
    if (!loan) return;
    if (!window.confirm('Approve this loan application?')) return;
    approveLoanMutation.mutate(loan.id, {
      onError: (e: unknown) => {
        const data = (e as any)?.response?.data;
        const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Approval failed.';
        toast.error(msg);
      },
    });
  }

  async function handleReject() {
    if (!loan) return;
    const reason = window.prompt('Reason for rejecting this loan application:');
    if (reason === null) return;
    if (!reason.trim()) {
      toast.error('A rejection reason is required.');
      return;
    }
    if (!window.confirm('Reject this loan application? This cannot be undone.')) return;
    rejectLoanMutation.mutate({ id: loan.id, reason: reason.trim() }, {
      onError: (e: unknown) => {
        const data = (e as any)?.response?.data;
        const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Rejection failed.';
        toast.error(msg);
      },
    });
  }

  async function handleRemoveGuarantor(guarantorId: number) {
    if (!window.confirm('Remove this guarantor from the loan?')) return;
    deleteGuarantorMutation.mutate({ id: guarantorId, loanId }, {
      onError: (e: unknown) => {
        const data = (e as any)?.response?.data;
        const msg = data?.detail || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Failed to remove guarantor.';
        toast.error(msg);
      },
    });
  }


  const nextInstallment = schedule
    .filter((s) => s.status === 'pending' || s.status === 'partial' || s.status === 'overdue')
    .sort((a, b) => a.installment_number - b.installment_number)[0] ?? null;

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !loan) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle size={16} />
          {error ?? 'Loan not found.'}
        </div>
      </div>
    );
  }

  const isActive = loan.status === 'active' || loan.status === 'disbursed';
  const isOverdue = loan.days_in_arrears > 0 && isActive;

  const canRestructure = ['active', 'disbursed', 'defaulted'].includes(loan.status);
  // Matches the backend's record_payment() gate (models.py) — defaulted loans can
  // still take repayments, they just can't be newly disbursed/approved etc.
  const canRepay = ['active', 'disbursed', 'defaulted'].includes(loan.status);
  // Matches LoanDisbursementCorrection._execute()'s status guard (loans/models.py) —
  // only a disbursed/active loan's disbursement can be corrected this way.
  const canCorrectDisbursement = ['active', 'disbursed'].includes(loan.status);
  // Matches is_within_correction_window there — a correction can only be
  // REQUESTED within LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS of disbursement;
  // the backend re-checks this at execute time regardless, this is just so the
  // button doesn't invite a request that'll be rejected later.
  const correctionWindowExpired =
    !!loan.correction_window_expires_at &&
    loan.correction_window_expires_at < new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50">
      {showRepayModal && (
        <RepayModal
          loan={loan}
          nextInstallment={nextInstallment}
          onClose={() => setShowRepayModal(false)}
          onSuccess={() => {
            setShowRepayModal(false);
            refetchLoan();
          }}
        />
      )}

      {showRestructureModal && (
        <RestructureModal
          loan={loan}
          onClose={() => setShowRestructureModal(false)}
          onSuccess={() => {
            setShowRestructureModal(false);
            refetchLoan();
          }}
        />
      )}

      {showAddGuarantorModal && (
        <AddGuarantorModal
          loanId={loan.id}
          onClose={() => setShowAddGuarantorModal(false)}
          onSuccess={() => {
            setShowAddGuarantorModal(false);
            refetchGuarantors();
          }}
        />
      )}

      {showCorrectionModal && (
        <CorrectionModal
          loan={loan}
          onClose={() => setShowCorrectionModal(false)}
          onSuccess={() => {
            setShowCorrectionModal(false);
            refetchLoan();
          }}
        />
      )}

      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Go back"
              onClick={() => navigate(-1)}
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ArrowLeft size={18} />
            </button>
            <ClientAvatar image={loan.client_image} name={loan.client_name} size="md" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-gray-900">{loan.loan_number}</h1>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[loan.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {loan.status.replace('_', ' ')}
                </span>
                {isOverdue && (
                  <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
                    {loan.days_in_arrears}d overdue
                  </span>
                )}
                {loan.interest_suspended && (
                  <span className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-medium text-orange-700">
                    <ShieldAlert size={11} />
                    Interest Suspended (NPL)
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">{loan.client_name} — {loan.product_name}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetchLoan()}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>

            <button
              onClick={() => window.open(`/loans/accounts/${loan.id}/statement`, '_blank')}
              className="rounded-lg border border-gray-300 p-2 text-gray-500 hover:bg-gray-50"
              title="Print Loan Statement"
            >
              <Printer size={16} />
            </button>

            {loan.status === 'pending' && (
              <Link
                to={`/loans/verification/${loan.id}`}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Start Verification
              </Link>
            )}


            {loan.status === 'approved' && (
              <button
                type="button"
                onClick={async () => {
                  if (!loan) return;
                  requestDisbursementMutation.mutate({ loanId: loan.id }, {
                    onSuccess: () => {
                      navigate(`/loans/disbursements/${loan.id}`);
                    },
                    onError: (e: unknown) => {
                      const data = (e as any)?.response?.data;
                      const msg = data?.detail || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Could not create disbursement request.';
                      toast.error(msg);
                    },
                  });
                }}
                disabled={requestDisbursementMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {requestDisbursementMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Request Disbursement
              </button>
            )}

            {loan.status === 'approved' && (
              <button
                type="button"
                onClick={handleReject}
                disabled={rejectLoanMutation.isPending}
                className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                <XCircle size={14} />
                Reject
              </button>
            )}

            {/* For loans that have a verification but need approval */}
            {loan.status === 'pending' && (() => {
              const minRequired = loan.product_requires_guarantor ? (loan.product_min_guarantors || 1) : 0;
              const guarantorsMissing = minRequired > 0 && guarantors.length < minRequired;
              return (
                <div className="flex items-center gap-2">
                  {guarantorsMissing && (
                    <span className="flex items-center gap-1 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 border border-amber-200">
                      <AlertCircle size={13} />
                      {guarantors.length}/{minRequired} guarantor{minRequired !== 1 ? 's' : ''} required
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleApprove}
                    disabled={approveLoanMutation.isPending || rejectLoanMutation.isPending || guarantorsMissing}
                    title={guarantorsMissing ? `Add at least ${minRequired} guarantor(s) before approving` : undefined}
                    className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {approveLoanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={handleReject}
                    disabled={approveLoanMutation.isPending || rejectLoanMutation.isPending}
                    className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    <XCircle size={14} />
                    Reject
                  </button>
                </div>
              );
            })()}

            {canRestructure && (
              pendingRestructureRequestId ? (
                <span
                  className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700"
                  title="A restructure proposal is already pending director approval for this loan"
                >
                  <Loader2 size={14} />
                  Restructure Pending
                </span>
              ) : (
                <button
                  onClick={() => setShowRestructureModal(true)}
                  className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-100"
                >
                  <RotateCcw size={14} />
                  Restructure
                </button>
              )
            )}

            {canRepay && (
              <button
                onClick={() => setShowRepayModal(true)}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
              >
                <CreditCard size={14} />
                Collect Repayment
              </button>
            )}

            {canCorrectDisbursement && (
              pendingCorrectionRef ? (
                <span
                  className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
                  title={`Correction ${pendingCorrectionRef} is already pending director approval for this loan`}
                >
                  <Loader2 size={14} />
                  Correction Pending
                </span>
              ) : !correctionWindowExpired ? (
                <button
                  onClick={() => setShowCorrectionModal(true)}
                  title="Reverse this disbursement and re-disburse to the correct customer"
                  className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
                >
                  <AlertCircle size={14} />
                  Correct Disbursement
                </button>
              ) : null
            )}
          </div>
        </div>

        {loan.status === 'rejected' && loan.rejection_reason && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
            <XCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span><span className="font-medium">Rejection reason:</span> {loan.rejection_reason}</span>
          </div>
        )}
      </div>

      <div className="mx-auto max-w-7xl space-y-6 p-6">
        {/* Summary Grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Loan Summary */}
          <div className="col-span-2 rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Loan Summary
            </h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
              <div>
                <p className="text-gray-500">Product</p>
                <p className="font-medium text-gray-900">{loan.product_name}</p>
              </div>
              <div>
                <p className="text-gray-500">Application Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.application_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Disbursement Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.disbursement_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Maturity Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.maturity_date)}</p>
              </div>
              <div>
                <p className="text-gray-500">Term</p>
                <p className="font-medium text-gray-900">{loan.term_months} {loan.term_unit ?? 'months'}</p>
              </div>
              <div>
                <p className="text-gray-500">Frequency</p>
                <p className="font-medium capitalize text-gray-900">{loan.repayment_frequency}</p>
              </div>
              <div>
                <p className="text-gray-500">Interest Rate</p>
                <p className="font-medium text-gray-900">{loan.interest_rate}% ({loan.interest_method})</p>
              </div>
              <div>
                <p className="text-gray-500">Disbursed Amount</p>
                <p className="font-medium text-gray-900">₦{fmt(loan.disbursed_amount)}</p>
              </div>
              <div>
                <p className="text-gray-500">Outstanding Principal</p>
                <p className="font-semibold text-gray-900">₦{fmt(loan.outstanding_principal)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Repaid</p>
                <p className="font-medium text-green-700">₦{fmt(loan.total_repaid)}</p>
              </div>
              <div>
                <p className="text-gray-500">Total Outstanding</p>
                <p className="font-semibold text-red-700">₦{fmt(loan.total_outstanding)}</p>
              </div>
              <div>
                <p className="text-gray-500">Next Due Date</p>
                <p className="font-medium text-gray-900">{fmtDate(loan.next_due_date)}</p>
              </div>
              {loan.days_in_arrears > 0 && (
                <div>
                  <p className="text-gray-500">Days in Arrears</p>
                  <p className="font-semibold text-red-600">{loan.days_in_arrears} days (₦{fmt(loan.arrears_amount)})</p>
                </div>
              )}
              {loan.contractual_interest_total && parseFloat(loan.contractual_interest_total) > 0 && (
                <div>
                  <p className="text-gray-500">Contractual Interest (Total)</p>
                  <p className="font-semibold text-indigo-700">₦{fmt(loan.contractual_interest_total)}</p>
                </div>
              )}
              {loan.interest_deferral_active && (
                <div>
                  <p className="text-gray-500">Unearned Interest (Not Yet Due)</p>
                  <p className="font-semibold text-amber-700">₦{fmt(loan.unearned_interest_remaining)}</p>
                </div>
              )}
            </div>

            {/* CBN Risk & Provision Row */}
            <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-gray-50 px-4 py-3 text-sm">
              <div>
                <span className="text-gray-500">CBN Classification: </span>
                <span className={`font-medium capitalize ${
                  loan.risk_classification === 'performing' ? 'text-green-700' :
                  loan.risk_classification === 'watch' ? 'text-yellow-700' :
                  loan.risk_classification === 'substandard' ? 'text-orange-700' :
                  'text-red-700'
                }`}>{loan.risk_classification ?? '—'}</span>
              </div>
              <div>
                <span className="text-gray-500">Provision Rate: </span>
                <span className="font-medium text-gray-800">{loan.provision_pct ?? '—'}%</span>
              </div>
              <div>
                <span className="text-gray-500">Provision Amount: </span>
                <span className="font-medium text-red-700">₦{fmt(loan.provision_amount ?? '0')}</span>
              </div>
              {loan.interest_suspended && (
                <div className="flex items-center gap-1 text-orange-700">
                  <ShieldAlert size={13} />
                  <span className="font-medium">Interest suspended since {fmtDate(loan.interest_suspended_at)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Client Info */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
              Client
            </h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <ClientAvatar image={loan.client_image} name={loan.client_name} size="lg" />
                <div>
                  <p className="text-gray-500">Name</p>
                  <p className="font-semibold text-gray-900">{loan.client_name}</p>
                </div>
              </div>
              <div>
                <p className="text-gray-500">Risk Classification</p>
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  loan.risk_classification === 'performing' ? 'bg-green-100 text-green-700' :
                  loan.risk_classification === 'watch' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {loan.risk_classification}
                </span>
              </div>
              {loan.processing_fee && parseFloat(loan.processing_fee) > 0 && (
                <div>
                  <p className="text-gray-500">Processing Fee</p>
                  <p className="font-medium text-gray-900">₦{fmt(loan.processing_fee)}</p>
                </div>
              )}
              {loan.insurance_amount && parseFloat(loan.insurance_amount) > 0 && (
                <div>
                  <p className="text-gray-500">Insurance</p>
                  <p className="font-medium text-gray-900">₦{fmt(loan.insurance_amount)}</p>
                </div>
              )}

              {/* Bank Details — inline editable */}
              <div className="border-t pt-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 flex items-center gap-1">
                    <Building2 size={12} className="text-gray-400" />
                    Bank Details
                  </p>
                  {!bankEditMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setBankDraft({
                          bank_name: loan.client_bank_name ?? '',
                          bank_account_name: loan.client_bank_account_name ?? '',
                          bank_account_number: loan.client_bank_account_number ?? '',
                          bvn: loan.client_bvn ?? '',
                        });
                        setBankError(null);
                        setBankEditMode(true);
                      }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                    >
                      <Pencil size={11} />
                      {loan.client_bank_account_number ? 'Edit' : 'Add'}
                    </button>
                  )}
                </div>

                {bankEditMode ? (
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Bank Name</label>
                      <input
                        type="text"
                        value={bankDraft.bank_name}
                        onChange={e => setBankDraft(d => ({ ...d, bank_name: e.target.value }))}
                        placeholder="e.g. Zenith Bank"
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Account Number</label>
                      <input
                        type="text"
                        value={bankDraft.bank_account_number}
                        onChange={e => setBankDraft(d => ({ ...d, bank_account_number: e.target.value }))}
                        placeholder="10-digit NUBAN"
                        maxLength={10}
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">Account Name</label>
                      <input
                        type="text"
                        value={bankDraft.bank_account_name}
                        onChange={e => setBankDraft(d => ({ ...d, bank_account_name: e.target.value }))}
                        placeholder="As registered at the bank"
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-0.5">BVN</label>
                      <input
                        type="text"
                        value={bankDraft.bvn}
                        onChange={e => setBankDraft(d => ({ ...d, bvn: e.target.value }))}
                        placeholder="11-digit BVN"
                        maxLength={11}
                        className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {bankError && (
                      <p className="flex items-center gap-1 text-xs text-red-600">
                        <AlertCircle size={12} />
                        {bankError}
                      </p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        disabled={bankSaving}
                        onClick={async () => {
                          setBankSaving(true);
                          setBankError(null);
                          try {
                            await clientService.updateClient(loan.client, {
                              bank_name: bankDraft.bank_name || undefined,
                              bank_account_name: bankDraft.bank_account_name || undefined,
                              bank_account_number: bankDraft.bank_account_number || undefined,
                              bank_verification_number: bankDraft.bvn || undefined,
                            });
                            refetchLoan();
                            setBankEditMode(false);
                          } catch (e: any) {
                            setBankError(e?.detail ?? e?.message ?? 'Failed to save bank details.');
                          } finally {
                            setBankSaving(false);
                          }
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {bankSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBankEditMode(false); setBankError(null); }}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : loan.client_bank_account_number ? (
                  <div className="space-y-1">
                    <div>
                      <p className="text-gray-500">Bank</p>
                      <p className="font-medium text-gray-900">{loan.client_bank_name || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Account Number</p>
                      <p className="font-mono font-medium text-gray-900">{loan.client_bank_account_number}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Account Name</p>
                      <p className="font-medium text-gray-900">{loan.client_bank_account_name || '—'}</p>
                    </div>
                    {loan.client_bvn && (
                      <div>
                        <p className="text-gray-500">BVN</p>
                        <p className="font-mono font-medium text-gray-900">{loan.client_bvn}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle size={12} />
                    No bank details on file — add them before disbursement.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <Link
                  to={`/clients/${loan.client}`}
                  className="text-sm text-blue-600 hover:underline"
                >
                  View Client Profile →
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Guarantors */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-purple-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Guarantors
              </h2>
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
                {guarantors.length} linked
              </span>
            </div>
            {['pending', 'approved'].includes(loan.status) && (
              <button
                type="button"
                onClick={() => setShowAddGuarantorModal(true)}
                className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-purple-700"
              >
                <UserPlus size={13} />
                Add Guarantor
              </button>
            )}
          </div>

          {guarantors.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-gray-400">
              <UserCheck size={28} className="text-gray-300" />
              <p>No guarantors linked to this loan yet.</p>
              {loan.status === 'pending' && loan.product_requires_guarantor && (
                <p className="flex items-center gap-1 text-xs font-medium text-red-600">
                  <AlertCircle size={12} />
                  {loan.product_min_guarantors || 1} guarantor(s) required before this loan can be approved.
                </p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {guarantors.map(g => (
                <div key={g.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-700">
                    <UserCheck size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">{g.guarantor_name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                      {g.guarantor_phone && <span>{g.guarantor_phone}</span>}
                      {g.guarantor_occupation && <span>{g.guarantor_occupation}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-gray-800">₦{fmt(g.guaranteed_amount)}</p>
                    <span className={`text-xs font-medium capitalize ${
                      g.status === 'approved' ? 'text-green-600' :
                      g.status === 'rejected' ? 'text-red-600' : 'text-yellow-600'
                    }`}>
                      {g.status}
                    </span>
                  </div>
                  {['pending', 'approved'].includes(loan.status) && (
                    <button
                      type="button"
                      aria-label="Remove guarantor"
                      onClick={() => handleRemoveGuarantor(g.id)}
                      disabled={deleteGuarantorMutation.isPending}
                      className="ml-2 shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                    >
                      {deleteGuarantorMutation.isPending
                        ? <Loader2 size={14} className="animate-spin" />
                        : <Trash2 size={14} />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Loan Ledger */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <BookOpen size={16} className="text-indigo-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                Loan Ledger
              </h2>
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                GL Entries
              </span>
            </div>
            {ledgerLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
          </div>

          {ledger.length === 0 && !ledgerLoading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No GL entries posted yet.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Reference</th>
                      <th className="px-4 py-3">Description</th>
                      <th className="px-4 py-3 text-right">Debit (Dr)</th>
                      <th className="px-4 py-3 text-right">Credit (Cr)</th>
                      <th className="px-4 py-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {ledger.map((tx) => (
                      <tr key={tx.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600">{fmtDate(tx.date)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-500">{tx.reference}</td>
                        <td className="px-4 py-2.5 text-gray-700">{tx.description}</td>
                        <td className="px-4 py-2.5 text-right text-blue-700 font-mono">
                          {tx.debit ? `₦${fmt(tx.debit)}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right text-green-700 font-mono">
                          {tx.credit ? `₦${fmt(tx.credit)}` : ''}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900 font-mono">
                          ₦{fmt(tx.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE) > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-xs text-gray-500">
                    Page {ledgerPage} of {Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)} ({ledgerTotal} entries)
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                      disabled={ledgerPage === 1}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <ChevronLeft size={12} /> Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setLedgerPage((p) => Math.min(Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE), p + 1))}
                      disabled={ledgerPage === Math.ceil(ledgerTotal / LEDGER_PAGE_SIZE)}
                      className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                    >
                      Next <ChevronRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Repayment Schedule */}
        <div className="rounded-xl bg-white shadow-sm">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Repayment Schedule
            </h2>
          </div>

          {schedule.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              No schedule generated yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Principal</th>
                    <th className="px-4 py-3 text-right">Interest</th>
                    <th className="px-4 py-3 text-right">Fees</th>
                    <th className="px-4 py-3 text-right">Total Due</th>
                    <th className="px-4 py-3 text-right">Total Paid</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Payment Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {[...schedule]
                    .sort((a, b) => a.installment_number - b.installment_number)
                    .map((row) => {
                      const isRowOverdue = row.status === 'overdue';
                      return (
                        <tr
                          key={row.id}
                          className={isRowOverdue ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'}
                        >
                          <td className="px-4 py-3 font-medium text-gray-700">{row.installment_number}</td>
                          <td className={`px-4 py-3 ${isRowOverdue ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                            {fmtDate(row.due_date)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.principal_due)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.interest_due)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">₦{fmt(row.fees_due)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900">₦{fmt(row.total_due)}</td>
                          <td className={`px-4 py-3 text-right font-medium ${parseFloat(row.total_paid) > 0 ? 'text-green-700' : 'text-gray-400'}`}>
                            {parseFloat(row.total_paid) > 0 ? `₦${fmt(row.total_paid)}` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                              {row.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {fmtDate(row.paid_date)}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
