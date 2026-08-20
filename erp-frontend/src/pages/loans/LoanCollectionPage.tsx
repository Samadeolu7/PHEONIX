/**
 * Loan Collection Page
 * Normal mode: search a loan, view schedule, post repayment (cash or bank transfer).
 * Group mode (Phase 7): bulk collection for a ClientGroup.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  DollarSign,
  Loader2,
  MapPin,
  PiggyBank,
  Search,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  loanService,
  LoanAccountList,
  LoanRepaymentSchedule,
  RepayLoanPayload,
  GroupCollectionRow,
  BulkRepayPayment,
  LoanRepaymentRequest,
  OfflinePaymentRecord,
  OfflinePaymentPayload,
} from '../../services/loanService';
import { clientService, ClientGroup } from '../../services/clientService';
import { ClientAvatar } from '../../components/ui/ClientAvatar';
import { getSavingsAccounts, SavingsAccount } from '../../services/savingsService';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';
import {
  useLoanSchedule,
  useRepayLoan,
  useBulkRepay,
  useRequestSavingsRepayment,
  useGroupCollection,
  useOfflinePayments,
  useCreateOfflinePayment,
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

const SCHEDULE_STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  partial:  'bg-orange-100 text-orange-700',
  paid:     'bg-green-100 text-green-700',
  overdue:  'bg-red-100 text-red-700',
};

// ── Normal Collection Panel ─────────────────────────────────────────────────

function NormalCollectionPanel() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LoanAccountList[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedLoan, setSelectedLoan] = useState<LoanAccountList | null>(null);
  const [schedule, setSchedule] = useState<LoanRepaymentSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  const [amount, setAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ message: string; overpayment?: string } | null>(null);

  const repayLoanMutation = useRepayLoan();

  useEffect(() => {
    bankService.listBankAccounts({ is_active: true }).then(setBankAccounts);
  }, []);

  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    setSelectedLoan(null);
    setSchedule([]);
    setSubmitSuccess(null);
    try {
      const [res, res2, res3] = await Promise.all([
        loanService.listLoans({ search: search.trim(), status: 'active' }),
        loanService.listLoans({ search: search.trim(), status: 'disbursed' }),
        loanService.listLoans({ search: search.trim(), status: 'defaulted' }),
      ]);
      const items  = Array.isArray(res)  ? res  : (res?.results  ?? []);
      const items2 = Array.isArray(res2) ? res2 : (res2?.results ?? []);
      const items3 = Array.isArray(res3) ? res3 : (res3?.results ?? []);
      setResults([...items, ...items2, ...items3]);
    } catch (e: unknown) {
      const data = (e as any)?.response?.data;
      setSearchError(data?.detail || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Search failed.');
    } finally {
      setSearching(false);
    }
  }, [search]);

  async function selectLoan(loan: LoanAccountList) {
    setSelectedLoan(loan);
    setResults([]);
    setScheduleLoading(true);
    setSubmitSuccess(null);
    setSubmitError(null);
    try {
      const s = await loanService.getLoanSchedule(loan.id);
      setSchedule(s);
      const nextDue = s.find((r) => r.status === 'overdue' || r.status === 'pending' || r.status === 'partial');
      if (nextDue) {
        const remaining = parseFloat(nextDue.total_due) - parseFloat(nextDue.total_paid);
        if (remaining > 0) setAmount(remaining.toFixed(2));
      }
    } catch {
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLoan) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setSubmitError('Please enter a valid amount.');
      return;
    }
    if (paymentMode === 'bank_transfer') {
      if (typeof selectedBankId !== 'number') {
        setSubmitError('Please select a destination bank account.');
        return;
      }
      if (!bankReference.trim()) {
        setSubmitError('Bank reference is required for bank transfer payments.');
        return;
      }
    }
    setSubmitError(null);
    const payload: RepayLoanPayload = {
      amount,
      payment_date: paymentDate,
      payment_mode: paymentMode,
      bank_account_id: paymentMode === 'bank_transfer' ? selectedBankId : undefined,
      bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
    };
    repayLoanMutation.mutate(
      { id: selectedLoan.id, data: payload },
      {
        onSuccess: (result) => {
          const overpay = parseFloat(result.overpayment_credited ?? '0');
          setSubmitSuccess({
            message: `₦${fmt(amount)} recorded for ${selectedLoan.client_name} (${selectedLoan.loan_number})`,
            overpayment: overpay > 0 ? `₦${fmt(result.overpayment_credited)} credited to savings` : undefined,
          });
          setSelectedLoan(null);
          setSchedule([]);
          setAmount('');
          setBankReference('');
        },
        onError: (e: unknown) => {
          const data = (e as any)?.response?.data;
          const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Repayment failed.';
          setSubmitError(msg);
          toast.error(msg);
        },
      }
    );
  }

  const unpaidInstallments = schedule.filter(
    (s) => s.status === 'overdue' || s.status === 'pending' || s.status === 'partial'
  );
  const totalDue = unpaidInstallments.reduce(
    (sum, s) => sum + parseFloat(s.total_due) - parseFloat(s.total_paid),
    0
  );
  const enteredAmount = parseFloat(amount) || 0;
  const excess = Math.max(0, enteredAmount - totalDue);

  return (
    <div className="space-y-5">
      {/* Success banner */}
      {submitSuccess && (
        <div className="flex items-start gap-3 rounded-xl bg-green-50 p-4 text-sm text-green-800">
          <CheckCircle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">{submitSuccess.message}</p>
            {submitSuccess.overpayment && (
              <p className="mt-0.5 text-green-700">{submitSuccess.overpayment}</p>
            )}
          </div>
          <button type="button" aria-label="Dismiss" onClick={() => setSubmitSuccess(null)} className="ml-auto text-green-600 hover:text-green-800">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Search */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Find Loan</h3>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="Search by loan number or client name…"
              className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button
            type="button"
            onClick={doSearch}
            disabled={searching || !search.trim()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
            Search
          </button>
        </div>

        {searchError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={14} /> {searchError}
          </div>
        )}

        {/* Search results */}
        {results.length > 0 && (
          <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
            {results.map((loan) => (
              <button
                key={loan.id}
                type="button"
                onClick={() => selectLoan(loan)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-blue-50"
              >
                <div>
                  <span className="font-medium text-gray-900">{loan.loan_number}</span>
                  <span className="ml-2 text-gray-500">{loan.client_name}</span>
                </div>
                <div className="text-right text-xs text-gray-500">
                  <div>Outstanding: ₦{fmt(loan.total_outstanding ?? loan.outstanding_principal)}</div>
                  {loan.days_in_arrears > 0 && (
                    <div className="text-red-600">{loan.days_in_arrears}d overdue</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {results.length === 0 && !searching && search.trim() && !searchError && (
          <p className="mt-3 text-sm text-gray-400">No active loans found.</p>
        )}
      </div>

      {/* Selected loan + schedule */}
      {selectedLoan && (
        <>
          <div className="rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between border-b px-5 py-3">
              <div className="flex items-center gap-2">
                <ClientAvatar image={selectedLoan.client_image} name={selectedLoan.client_name} size="sm" />
                <div>
                  <span className="font-semibold text-gray-900">{selectedLoan.loan_number}</span>
                  <span className="ml-2 text-sm text-gray-500">{selectedLoan.client_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Link to={`/loans/accounts/${selectedLoan.id}`} className="text-xs text-blue-600 hover:underline">
                  View account →
                </Link>
                <button type="button" aria-label="Clear selection" onClick={() => { setSelectedLoan(null); setSchedule([]); }} className="text-gray-400 hover:text-gray-600">
                  <X size={16} />
                </button>
              </div>
            </div>

            {scheduleLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={20} className="animate-spin text-blue-600" />
              </div>
            ) : unpaidInstallments.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No outstanding installments.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Total Due</th>
                      <th className="px-4 py-3 text-right">Paid</th>
                      <th className="px-4 py-3 text-right">Remaining</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {unpaidInstallments
                      .sort((a, b) => a.installment_number - b.installment_number)
                      .map((row) => {
                        const remaining = parseFloat(row.total_due) - parseFloat(row.total_paid);
                        return (
                          <tr key={row.id} className={row.status === 'overdue' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                            <td className="px-4 py-2.5 text-gray-700">{row.installment_number}</td>
                            <td className={`px-4 py-2.5 ${row.status === 'overdue' ? 'font-medium text-red-700' : 'text-gray-700'}`}>{fmtDate(row.due_date)}</td>
                            <td className="px-4 py-2.5 text-right text-gray-900">₦{fmt(row.total_due)}</td>
                            <td className="px-4 py-2.5 text-right text-green-700">
                              {parseFloat(row.total_paid) > 0 ? `₦${fmt(row.total_paid)}` : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-right font-semibold text-gray-900">₦{fmt(remaining)}</td>
                            <td className="px-4 py-2.5">
                              <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Total Outstanding</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-900">₦{fmt(totalDue)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Repayment form */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">Record Repayment</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Amount (₦)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    placeholder="Enter amount collected"
                    required
                  />
                  {excess > 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      ₦{fmt(excess)} excess will be credited to borrower's savings account
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
                  <input
                    type="date"
                    title="Payment date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Mode</label>
                <div className="flex gap-4">
                  {(['cash', 'bank_transfer'] as const).map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="paymentMode"
                        value={mode}
                        checked={paymentMode === mode}
                        onChange={() => setPaymentMode(mode)}
                        className="accent-green-600"
                      />
                      <span className="text-sm text-gray-700">
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
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="e.g. TRF/20240617/1234567"
                      required={paymentMode === 'bank_transfer'}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Transaction reference from the bank notification — used for reconciliation
                    </p>
                  </div>
                </>
              )}

              {submitError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={14} /> {submitError}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setSelectedLoan(null); setSchedule([]); }}
                  className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={repayLoanMutation.isPending || !amount}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {repayLoanMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                  Post Repayment
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

// ── Group Collection Panel ─────────────────────────────────────────────────

function GroupCollectionPanel() {
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | ''>('');

  const [collectionDate, setCollectionDate] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<GroupCollectionRow[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [selectedBankId, setSelectedBankId] = useState<number | ''>('');
  const [bankReference, setBankReference] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ succeeded: number; failed: { loan_account_id: number; error: string }[] } | null>(null);

  // React Query hooks
  const { data: collectionRows = [], isLoading: sheetLoading, refetch: refetchSheet } = useGroupCollection(
    Number(selectedGroup) || 0,
    collectionDate,
    { enabled: false }
  );
  const bulkRepayMutation = useBulkRepay();

  useEffect(() => {
    setGroupsLoading(true);
    clientService.listClientGroups({ is_active: true })
      .then((res) => setGroups(Array.isArray(res) ? res : []))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  async function loadSheet() {
    if (!selectedGroup) return;
    setSheetError(null);
    setRows([]);
    setSubmitResult(null);
    const { data, error } = await refetchSheet();
    if (error) {
      const e = error as any;
      setSheetError(e?.response?.data?.detail || (typeof e?.response?.data === 'string' ? e.response.data : '') || e?.message || 'Failed to load collection sheet.');
    } else if (data) {
      setRows(data);
      const initial: Record<number, string> = {};
      data.forEach((r) => { initial[r.loan_account_id] = r.remaining; });
      setAmounts(initial);
    }
  }

  async function handlePostAll(e: React.FormEvent) {
    e.preventDefault();
    if (paymentMode === 'bank_transfer') {
      if (typeof selectedBankId !== 'number') {
        setSubmitError('Please select a destination bank account.');
        return;
      }
      if (!bankReference.trim()) {
        setSubmitError('Bank reference is required for bank transfer payments.');
        return;
      }
    }
    const payments: BulkRepayPayment[] = rows
      .filter((r) => parseFloat(amounts[r.loan_account_id] ?? '0') > 0)
      .map((r) => ({
        loan_account_id: r.loan_account_id,
        amount: amounts[r.loan_account_id] ?? '0',
        payment_date: collectionDate,
      }));

    if (!payments.length) {
      setSubmitError('No amounts entered.');
      return;
    }

    setSubmitError(null);
    bulkRepayMutation.mutate(
      {
        payments,
        payment_mode: paymentMode,
        bank_account_id: paymentMode === 'bank_transfer' ? selectedBankId : undefined,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
      },
      {
        onSuccess: (result) => {
          setSubmitResult(result);
          setRows([]);
          setAmounts({});
        },
        onError: (e: unknown) => {
          const data = (e as any)?.response?.data;
          const msg = data?.detail || (Array.isArray(data?.non_field_errors) ? data.non_field_errors.join(', ') : '') || (typeof data === 'string' ? data : '') || (e as Error)?.message || 'Bulk repayment failed.';
          setSubmitError(msg);
          toast.error(msg);
        },
      }
    );
  }

  return (
    <div className="space-y-5">
      {/* Success result */}
      {submitResult && (
        <div className="rounded-xl bg-green-50 p-4 text-sm text-green-800">
          <div className="flex items-center gap-2 font-medium">
            <CheckCircle size={16} />
            {submitResult.succeeded} repayment{submitResult.succeeded !== 1 ? 's' : ''} posted successfully
          </div>
          {submitResult.failed.length > 0 && (
            <div className="mt-2 text-red-700">
              {submitResult.failed.length} failed:
              {submitResult.failed.map((f) => (
                <div key={f.loan_account_id} className="ml-4 text-xs">
                  Loan #{f.loan_account_id}: {f.error}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Group + Date selector */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Select Group</h3>
        <div className="flex flex-wrap gap-3">
          <select
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value === '' ? '' : Number(e.target.value))}
            aria-label="Select group"
            className="min-w-[200px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— Select a group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name} ({g.code})</option>
            ))}
          </select>
          <input
            type="date"
            title="Collection date"
            value={collectionDate}
            onChange={(e) => setCollectionDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={loadSheet}
            disabled={!selectedGroup || sheetLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {sheetLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
            Load Collection Sheet
          </button>
        </div>
        {groupsLoading && <p className="mt-2 text-xs text-gray-400">Loading groups…</p>}
        {sheetError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            <AlertCircle size={14} /> {sheetError}
          </div>
        )}
      </div>

      {/* Collection sheet */}
      {rows.length > 0 && (
        <form onSubmit={handlePostAll} className="space-y-4">
          <div className="rounded-xl bg-white shadow-sm">
            <div className="border-b px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-700">
                Collection Sheet — {rows.length} member{rows.length !== 1 ? 's' : ''}
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Loan #</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3 text-right">Amount Due</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount Collected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((row) => (
                    <tr key={row.loan_account_id} className={row.status === 'overdue' ? 'bg-red-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{row.client_name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{row.loan_number}</td>
                      <td className={`px-4 py-2.5 ${row.status === 'overdue' ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
                        {fmtDate(row.next_due_date)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-900">₦{fmt(row.remaining)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          title={`Amount collected from ${row.client_name}`}
                          value={amounts[row.loan_account_id] ?? ''}
                          onChange={(e) => setAmounts((prev) => ({ ...prev, [row.loan_account_id]: e.target.value }))}
                          className="w-28 rounded-lg border border-gray-300 px-2 py-1 text-right text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Payment mode */}
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-700">Payment Mode</p>
                <div className="flex gap-4">
                  {(['cash', 'bank_transfer'] as const).map((mode) => (
                    <label key={mode} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="radio"
                        name="groupPaymentMode"
                        value={mode}
                        checked={paymentMode === mode}
                        onChange={() => setPaymentMode(mode)}
                        className="accent-green-600"
                      />
                      <span className="text-sm text-gray-700">{mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}</span>
                    </label>
                  ))}
                </div>
              </div>

              {paymentMode === 'bank_transfer' && (
                <>
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Destination Bank Account <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedBankId}
                      onChange={e => setSelectedBankId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
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
                  <div className="flex-1">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Bank Reference <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={bankReference}
                      onChange={(e) => setBankReference(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      placeholder="e.g. TRF/20240617/1234567"
                      required={paymentMode === 'bank_transfer'}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-3">
                {submitError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle size={14} /> {submitError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={bulkRepayMutation.isPending}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {bulkRepayMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
                  Post All
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {rows.length === 0 && !sheetLoading && selectedGroup && !sheetError && !submitResult && (
        <div className="rounded-xl bg-white py-12 text-center text-sm text-gray-400 shadow-sm">
          No outstanding installments for this group.
        </div>
      )}
    </div>
  );
}

// ── Savings Debit Panel ─────────────────────────────────────────────────────

function SavingsDebitPanel() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LoanAccountList[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanAccountList | null>(null);

  const [savingsAccounts, setSavingsAccounts] = useState<SavingsAccount[]>([]);
  const [loadingSavings, setLoadingSavings] = useState(false);
  const [selectedSavings, setSelectedSavings] = useState<SavingsAccount | null>(null);

  const [schedule, setSchedule] = useState<LoanRepaymentSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  // Installments are selected as a contiguous, oldest-first run — selectedCount
  // is how many of the sorted unpaid rows (starting from the oldest) are checked.
  const [selectedCount, setSelectedCount] = useState(0);

  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<LoanRepaymentRequest | null>(null);

  const requestSavingsRepaymentMutation = useRequestSavingsRepayment();

  const unpaidInstallments = schedule
    .filter(s => s.status === 'overdue' || s.status === 'pending' || s.status === 'partial')
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const selectedInstallments = unpaidInstallments.slice(0, selectedCount);
  const selectedTotal = selectedInstallments.reduce(
    (sum, s) => sum + parseFloat(s.total_due) - parseFloat(s.total_paid),
    0
  );
  const exceedsBalance = !!selectedSavings && selectedTotal > (parseFloat(String(selectedSavings.available_balance)) || 0);

  const toggleInstallment = (index: number) => {
    setSelectedCount(index < selectedCount ? index : index + 1);
  };

  // Search loans (active + disbursed)
  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setError(null);
    try {
      const [r1, r2, r3] = await Promise.all([
        loanService.listLoans({ search: search.trim(), status: 'active' }),
        loanService.listLoans({ search: search.trim(), status: 'disbursed' }),
        loanService.listLoans({ search: search.trim(), status: 'defaulted' }),
      ]);
      const items1 = Array.isArray(r1) ? r1 : (r1?.results ?? []);
      const items2 = Array.isArray(r2) ? r2 : (r2?.results ?? []);
      const items3 = Array.isArray(r3) ? r3 : (r3?.results ?? []);
      setResults([...items1, ...items2, ...items3]);
    } catch {
      setError('Could not load loans.');
    } finally {
      setSearching(false);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(doSearch, 400);
    return () => clearTimeout(t);
  }, [doSearch]);

  // Load savings accounts when loan selected
  useEffect(() => {
    if (!selectedLoan) return;
    setLoadingSavings(true);
    setSelectedSavings(null);
    getSavingsAccounts({ client: selectedLoan.client })
      .then(res => {
        const all = Array.isArray(res) ? res : (res as any).results ?? [];
        setSavingsAccounts(all.filter((a: SavingsAccount) => a.status === 'active'));
      })
      .catch(() => setError('Could not load savings accounts.'))
      .finally(() => setLoadingSavings(false));
  }, [selectedLoan]);

  // Load the repayment schedule when loan selected
  useEffect(() => {
    if (!selectedLoan) return;
    setScheduleLoading(true);
    setSelectedCount(0);
    loanService.getLoanSchedule(selectedLoan.id)
      .then(setSchedule)
      .catch(() => setError('Could not load repayment schedule.'))
      .finally(() => setScheduleLoading(false));
  }, [selectedLoan]);

  const handleSelectLoan = (loan: LoanAccountList) => {
    setSelectedLoan(loan);
    setResults([]);
    setSearch('');
    setSelectedCount(0);
    setSubmitted(null);
    setError(null);
  };

  const handleClearLoan = () => {
    setSelectedLoan(null);
    setSavingsAccounts([]);
    setSelectedSavings(null);
    setSchedule([]);
    setSelectedCount(0);
    setSubmitted(null);
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !selectedSavings) return;
    if (selectedInstallments.length === 0) {
      setError('Select at least one installment to repay.');
      return;
    }
    if (exceedsBalance) {
      setError('Selected total exceeds the available savings balance.');
      return;
    }
    setError(null);
    requestSavingsRepaymentMutation.mutate(
      {
        loanId: selectedLoan.id,
        data: {
          installment_ids: selectedInstallments.map(s => s.id),
          savings_account_id: selectedSavings.id,
          payment_date: paymentDate || undefined,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: (result) => setSubmitted(result),
        onError: (err: any) => setError(err?.detail ?? err?.message ?? 'Submission failed. Please try again.'),
      }
    );
  };

  if (submitted) {
    const covered = submitted.covered_installments_detail ?? [];
    const first = covered[0];
    const last = covered[covered.length - 1];
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h2 className="mb-2 text-xl font-bold text-green-800">Request Submitted</h2>
        <p className="mb-1 text-sm text-green-700">
          Repayment request <strong>#{submitted.id}</strong> is pending director approval.
        </p>
        <p className="mb-1 text-sm text-gray-600">
          Amount: <strong>₦{fmt(submitted.amount)}</strong> from savings{' '}
          <strong>{submitted.savings_account_number}</strong>
        </p>
        {covered.length > 0 && (
          <p className="mb-4 text-sm text-gray-600">
            Covers installment{covered.length > 1 ? 's' : ''}{' '}
            <strong>
              #{first.installment_number}
              {covered.length > 1 ? `–#${last.installment_number}` : ''}
            </strong>
            , due {fmtDate(first.due_date)}
            {covered.length > 1 ? ` – ${fmtDate(last.due_date)}` : ''}
          </p>
        )}
        <div className="flex justify-center gap-3">
          <Link
            to="/loans/repayment-approvals"
            className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            View Approvals Inbox
          </Link>
          <button
            type="button"
            onClick={() => {
              setSubmitted(null);
              handleClearLoan();
            }}
            className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            New Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step 1: Select Loan */}
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Step 1 — Select Loan</h3>

        {selectedLoan ? (
          <div className="flex items-start justify-between rounded-lg bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <ClientAvatar image={selectedLoan.client_image} name={selectedLoan.client_name} size="sm" />
              <div>
                <p className="font-medium text-blue-900">{selectedLoan.client_name}</p>
                <p className="text-xs text-blue-700">{selectedLoan.loan_number}</p>
                <p className="mt-1 text-xs text-gray-600">
                  Outstanding: ₦{fmt(selectedLoan.total_outstanding ?? selectedLoan.outstanding_principal)}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Clear selected loan"
              onClick={handleClearLoan}
              className="rounded p-1 text-blue-400 hover:text-blue-600"
            >
              <X size={16} />
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              title="Search loans by client name or loan number"
              placeholder="Search by client name or loan number…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-green-400 focus:outline-none"
            />
            {searching && (
              <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" size={16} />
            )}
            {results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {results.map(loan => (
                  <li key={loan.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectLoan(loan)}
                      className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-900">{loan.client_name}</span>
                      <span className="ml-2 text-gray-500">{loan.loan_number}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        Outstanding: ₦{fmt(loan.total_outstanding ?? loan.outstanding_principal)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Select Savings Account */}
      {selectedLoan && (
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Step 2 — Select Savings Account</h3>
          {loadingSavings ? (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="animate-spin" size={16} /> Loading savings accounts…
            </div>
          ) : savingsAccounts.length === 0 ? (
            <p className="text-sm text-gray-500">No active savings accounts for this client.</p>
          ) : (
            <div className="space-y-2">
              {savingsAccounts.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => setSelectedSavings(acc)}
                  className={`w-full rounded-lg border p-4 text-left transition-colors ${
                    selectedSavings?.id === acc.id
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{acc.account_number}</p>
                      <p className="text-xs text-gray-500">{acc.product_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-900">
                        ₦{fmt(acc.available_balance)}
                      </p>
                      <p className="text-xs text-gray-500">available</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Select installments to repay */}
      {selectedLoan && selectedSavings && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-1 text-sm font-semibold text-gray-700">Step 3 — Select Installments</h3>
          <p className="mb-4 text-xs text-gray-500">
            Check installments starting from the oldest unpaid one. The total is calculated
            automatically.
          </p>

          {scheduleLoading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-gray-500">
              <Loader2 className="animate-spin" size={16} /> Loading repayment schedule…
            </div>
          ) : unpaidInstallments.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-400">No outstanding installments.</p>
          ) : (
            <div className="mb-4 overflow-x-auto rounded-lg border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-2.5"></th>
                    <th className="px-4 py-2.5">#</th>
                    <th className="px-4 py-2.5">Due Date</th>
                    <th className="px-4 py-2.5 text-right">Remaining</th>
                    <th className="px-4 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {unpaidInstallments.map((row, index) => {
                    const remaining = parseFloat(row.total_due) - parseFloat(row.total_paid);
                    const checked = index < selectedCount;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => toggleInstallment(index)}
                        className={`cursor-pointer ${row.status === 'overdue' ? 'bg-red-50' : ''} ${checked ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            readOnly
                            checked={checked}
                            aria-label={`Select installment ${row.installment_number}`}
                            className="h-4 w-4 accent-green-600"
                          />
                        </td>
                        <td className="px-4 py-2.5 text-gray-700">{row.installment_number}</td>
                        <td className={`px-4 py-2.5 ${row.status === 'overdue' ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                          {fmtDate(row.due_date)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-gray-900">₦{fmt(remaining)}</td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t bg-gray-50">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                      Selected Total
                    </td>
                    <td className={`px-4 py-3 text-right font-bold ${exceedsBalance ? 'text-red-600' : 'text-gray-900'}`}>
                      ₦{fmt(selectedTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <p className="mb-4 text-xs text-gray-500">
            Max available in savings: ₦{fmt(selectedSavings.available_balance)}
          </p>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="sd-date">
                Payment Date
              </label>
              <input
                id="sd-date"
                type="date"
                title="Payment date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="sd-notes">
                Notes (optional)
              </label>
              <textarea
                id="sd-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. member requested savings debit for monthly installment"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
              />
            </div>

            {exceedsBalance && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />
                Selected total (₦{fmt(selectedTotal)}) exceeds the available savings balance.
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
              <strong>Requires director approval.</strong> The GL will only post after a director
              reviews and approves this request in the approvals inbox.
            </div>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={requestSavingsRepaymentMutation.isPending || selectedInstallments.length === 0 || exceedsBalance}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {requestSavingsRepaymentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <PiggyBank size={14} />}
                Submit for Approval
              </button>
              <button
                type="button"
                onClick={handleClearLoan}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

// ── Offline Collection Panel ────────────────────────────────────────────────

interface GeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
}

const PAYMENT_MODE_LABELS: Record<string, string> = {
  cash: 'Cash',
  mobile_money: 'Mobile Money',
  bank_transfer: 'Bank Transfer',
};

const STATUS_BADGE: Record<string, string> = {
  pending:  'bg-yellow-100 text-yellow-700',
  posted:   'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  approved: 'bg-blue-100 text-blue-700',
};

function OfflineCollectionPanel() {
  // ── loan search ──
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<LoanAccountList[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<LoanAccountList | null>(null);
  const [schedule, setSchedule] = useState<LoanRepaymentSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);

  // ── payment form ──
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMode, setPaymentMode] = useState<'cash' | 'mobile_money' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [notes, setNotes] = useState('');

  // ── location ──
  const [location, setLocation] = useState<GeoLocation | null>(null);
  const [locationAddress, setLocationAddress] = useState('');
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // ── submission ──
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<OfflinePaymentRecord | null>(null);

  // ── React Query hooks ──
  const { data: history = [], isLoading: historyLoading, refetch: refetchHistory } = useOfflinePayments();
  const createOfflinePaymentMutation = useCreateOfflinePayment();

  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const [r1, r2, r3] = await Promise.all([
        loanService.listLoans({ search: search.trim(), status: 'active' }),
        loanService.listLoans({ search: search.trim(), status: 'disbursed' }),
        loanService.listLoans({ search: search.trim(), status: 'defaulted' }),
      ]);
      const i1 = Array.isArray(r1) ? r1 : (r1?.results ?? []);
      const i2 = Array.isArray(r2) ? r2 : (r2?.results ?? []);
      const i3 = Array.isArray(r3) ? r3 : (r3?.results ?? []);
      setResults([...i1, ...i2, ...i3]);
    } catch {
      setSubmitError('Search failed.');
    } finally {
      setSearching(false);
    }
  }, [search]);

  async function selectLoan(loan: LoanAccountList) {
    setSelectedLoan(loan);
    setResults([]);
    setScheduleLoading(true);
    try {
      const s = await loanService.getLoanSchedule(loan.id);
      setSchedule(s);
      const next = s.find(r => r.status === 'overdue' || r.status === 'partial' || r.status === 'pending');
      if (next) {
        const rem = parseFloat(next.total_due) - parseFloat(next.total_paid);
        if (rem > 0) setAmount(rem.toFixed(2));
      }
    } catch {
      setSchedule([]);
    } finally {
      setScheduleLoading(false);
    }
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by this browser.');
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setLocationLoading(false);
      },
      (err) => {
        setLocationError(`Location unavailable: ${err.message}`);
        setLocationLoading(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLoan) return;
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setSubmitError('Enter a valid positive amount.');
      return;
    }
    if ((paymentMode === 'mobile_money' || paymentMode === 'bank_transfer') && !bankReference.trim()) {
      setSubmitError('Reference / transaction ID is required for this payment mode.');
      return;
    }
    setSubmitError(null);
    const payload: OfflinePaymentPayload = {
      loan: selectedLoan.id,
      amount,
      payment_date: paymentDate,
      payment_mode: paymentMode,
      bank_reference: bankReference || undefined,
      notes: notes || undefined,
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      location_accuracy: location?.accuracy ?? null,
      location_address: locationAddress || undefined,
    };
    createOfflinePaymentMutation.mutate(payload, {
      onSuccess: (rec) => {
        setSubmitted(rec);
        refetchHistory();
      },
      onError: (err: any) => setSubmitError(err?.detail ?? err?.message ?? 'Submission failed.'),
    });
  }

  function resetForm() {
    setSubmitted(null);
    setSelectedLoan(null);
    setSchedule([]);
    setAmount('');
    setSearch('');
    setBankReference('');
    setNotes('');
    setLocation(null);
    setLocationAddress('');
    setLocationError(null);
    setSubmitError(null);
  }

  const unpaid = schedule.filter(s => s.status === 'overdue' || s.status === 'pending' || s.status === 'partial');
  const totalDue = unpaid.reduce((sum, s) => sum + parseFloat(s.total_due) - parseFloat(s.total_paid), 0);

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h2 className="mb-2 text-xl font-bold text-green-800">Payment Recorded</h2>
        <p className="mb-1 text-sm text-green-700">
          Record <strong>#{submitted.id}</strong> is pending supervisor approval.
        </p>
        <div className="my-4 rounded-lg bg-white p-4 text-left text-sm shadow-sm">
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Client</span>
            <span className="font-medium text-gray-900">{submitted.client_name}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Loan</span>
            <span className="font-medium text-gray-900">{submitted.loan_number}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Amount</span>
            <span className="font-medium text-gray-900">₦{fmt(submitted.amount)}</span>
          </div>
          <div className="flex justify-between py-1">
            <span className="text-gray-500">Mode</span>
            <span className="font-medium text-gray-900">{PAYMENT_MODE_LABELS[submitted.payment_mode] ?? submitted.payment_mode}</span>
          </div>
          {submitted.latitude && (
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Location</span>
              <span className="font-medium text-gray-900 flex items-center gap-1">
                <MapPin size={12} className="text-green-600" />
                {submitted.latitude}, {submitted.longitude}
              </span>
            </div>
          )}
        </div>
        <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700 text-left mb-4">
          <strong>Awaiting approval.</strong> The GL will only post after a supervisor reviews this record.
        </div>
        <button
          type="button"
          onClick={resetForm}
          className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Record Another
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Info banner */}
      <div className="flex items-start gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
        <WifiOff size={16} className="mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-medium">Field Payment Recording</p>
          <p className="text-blue-700 text-xs mt-0.5">
            Record cash or mobile money collected from a borrower at their location.
            The transaction is queued for supervisor approval before posting to the GL.
          </p>
        </div>
      </div>

      {/* Step 1: Find Loan */}
      <div className="rounded-xl bg-white p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-gray-700">Step 1 — Find Loan</h3>

        {selectedLoan ? (
          <div className="flex items-start justify-between rounded-lg bg-blue-50 p-4">
            <div className="flex items-start gap-3">
              <ClientAvatar image={selectedLoan.client_image} name={selectedLoan.client_name} size="sm" />
              <div>
                <p className="font-medium text-blue-900">{selectedLoan.client_name}</p>
                <p className="text-xs text-blue-700">{selectedLoan.loan_number}</p>
                <p className="mt-1 text-xs text-gray-600">Outstanding: ₦{fmt(selectedLoan.total_outstanding ?? selectedLoan.outstanding_principal)}</p>
              </div>
            </div>
            <button type="button" aria-label="Clear" onClick={resetForm} className="text-blue-400 hover:text-blue-600">
              <X size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  placeholder="Search by loan number or client name…"
                  className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={doSearch}
                disabled={searching || !search.trim()}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                Search
              </button>
            </div>
            {results.length > 0 && (
              <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                {results.map(loan => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => selectLoan(loan)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-blue-50"
                  >
                    <div>
                      <span className="font-medium text-gray-900">{loan.loan_number}</span>
                      <span className="ml-2 text-gray-500">{loan.client_name}</span>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      Outstanding: ₦{fmt(loan.total_outstanding ?? loan.outstanding_principal)}
                      {loan.days_in_arrears > 0 && <div className="text-red-600">{loan.days_in_arrears}d overdue</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Step 2: Outstanding summary */}
      {selectedLoan && !scheduleLoading && unpaid.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="border-b px-5 py-3 text-sm font-semibold text-gray-700">Outstanding Installments</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Due Date</th>
                  <th className="px-4 py-2 text-right">Remaining</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {unpaid.slice(0, 3).map(row => (
                  <tr key={row.id} className={row.status === 'overdue' ? 'bg-red-50' : ''}>
                    <td className="px-4 py-2 text-gray-700">{row.installment_number}</td>
                    <td className={`px-4 py-2 ${row.status === 'overdue' ? 'text-red-700 font-medium' : 'text-gray-700'}`}>{fmtDate(row.due_date)}</td>
                    <td className="px-4 py-2 text-right font-semibold text-gray-900">₦{fmt(parseFloat(row.total_due) - parseFloat(row.total_paid))}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SCHEDULE_STATUS_BADGE[row.status] ?? 'bg-gray-100 text-gray-600'}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-gray-50">
                  <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-gray-700 text-right">Total Due</td>
                  <td className="px-4 py-2 text-right font-bold text-gray-900">₦{fmt(totalDue)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Step 3: Payment form */}
      {selectedLoan && (
        <form onSubmit={handleSubmit} className="rounded-xl bg-white p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Step 2 — Record Payment</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Amount Collected (₦) <span className="text-red-500">*</span></label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Collection Date <span className="text-red-500">*</span></label>
              <input
                type="date"
                title="Collection date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          </div>

          {/* Payment mode */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Payment Mode</label>
            <div className="flex flex-wrap gap-4">
              {(['cash', 'mobile_money', 'bank_transfer'] as const).map(mode => (
                <label key={mode} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="offlineMode"
                    value={mode}
                    checked={paymentMode === mode}
                    onChange={() => setPaymentMode(mode)}
                    className="accent-green-600"
                  />
                  <span className="text-sm text-gray-700">{PAYMENT_MODE_LABELS[mode]}</span>
                </label>
              ))}
            </div>
          </div>

          {(paymentMode === 'mobile_money' || paymentMode === 'bank_transfer') && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Transaction Reference <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankReference}
                onChange={e => setBankReference(e.target.value)}
                required={paymentMode !== 'cash'}
                placeholder="e.g. USSD confirmation code or bank reference"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
              />
            </div>
          )}

          {/* Location capture */}
          <div className="rounded-lg border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-gray-500" />
                <span className="text-sm font-medium text-gray-700">GPS Location</span>
                <span className="text-xs text-gray-400">(recommended)</span>
              </div>
              {!location && (
                <button
                  type="button"
                  onClick={captureLocation}
                  disabled={locationLoading}
                  className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  {locationLoading ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                  Capture Location
                </button>
              )}
              {location && (
                <button
                  type="button"
                  onClick={() => { setLocation(null); setLocationAddress(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear
                </button>
              )}
            </div>

            {locationError && (
              <p className="text-xs text-amber-600 flex items-center gap-1">
                <AlertCircle size={12} /> {locationError}
              </p>
            )}

            {location && (
              <div className="rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle size={12} /> Location captured
                </div>
                <p className="mt-1 font-mono text-green-700">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                  {' '}<span className="text-green-500">(±{Math.round(location.accuracy)}m)</span>
                </p>
                <div className="mt-2">
                  <input
                    type="text"
                    value={locationAddress}
                    onChange={e => setLocationAddress(e.target.value)}
                    placeholder="Optional: type a description or landmark…"
                    className="w-full rounded border border-green-200 bg-white px-2 py-1 text-xs focus:outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. client paid at their shop, cash counted in front of witness"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>

          <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-700">
            <strong>Pending approval.</strong> This record will be reviewed by a supervisor before the GL is updated.
          </div>

          {submitError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={14} /> {submitError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={createOfflinePaymentMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {createOfflinePaymentMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
              Submit for Approval
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Recent offline records */}
      <div className="rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-700">My Offline Records</h3>
          <button type="button" onClick={() => refetchHistory()} className="text-xs text-blue-600 hover:underline">Refresh</button>
        </div>
        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-blue-600" />
          </div>
        ) : history.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">No offline payment records yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {history.slice(0, 10).map(rec => (
              <div key={rec.id} className="px-5 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{rec.client_name}</span>
                    <span className="ml-2 text-xs text-gray-500">{rec.loan_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">₦{fmt(rec.amount)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${STATUS_BADGE[rec.status] ?? 'bg-gray-100 text-gray-600'}`}>{rec.status}</span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-400">
                  <span>{rec.payment_date}</span>
                  <span>{PAYMENT_MODE_LABELS[rec.payment_mode] ?? rec.payment_mode}</span>
                  {rec.latitude && (
                    <span className="flex items-center gap-0.5 text-green-600">
                      <MapPin size={10} /> GPS
                    </span>
                  )}
                  {rec.status === 'rejected' && rec.rejection_reason && (
                    <span className="text-red-500">Rejected: {rec.rejection_reason}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

type Tab = 'normal' | 'group' | 'savings' | 'offline';

export default function LoanCollectionPage() {
  const [activeTab, setActiveTab] = useState<Tab>('normal');

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/loans" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <CreditCard size={20} className="text-green-600" />
              <h1 className="text-xl font-bold text-gray-900">Loan Collection</h1>
            </div>
            <p className="text-sm text-gray-500">Record loan repayments — cash or bank transfer</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-4 flex gap-1">
          {([
            { key: 'normal',  label: 'Individual',       icon: CreditCard  },
            { key: 'group',   label: 'Group Collection', icon: Users       },
            { key: 'savings', label: 'Savings Debit',    icon: PiggyBank   },
            { key: 'offline', label: 'Field Collection', icon: WifiOff     },
          ] as { key: Tab; label: string; icon: React.ElementType }[]).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === key
                  ? 'bg-green-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-6">
        {activeTab === 'normal' && <NormalCollectionPanel />}
        {activeTab === 'group' && <GroupCollectionPanel />}
        {activeTab === 'savings' && <SavingsDebitPanel />}
        {activeTab === 'offline' && <OfflineCollectionPanel />}
      </div>
    </div>
  );
}
