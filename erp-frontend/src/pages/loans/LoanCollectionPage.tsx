/**
 * Loan Collection Page
 * Normal mode: search a loan, view schedule, post repayment (cash or bank transfer).
 * Group mode (Phase 7): bulk collection for a ClientGroup.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  CreditCard,
  DollarSign,
  Loader2,
  PiggyBank,
  Search,
  Users,
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
} from '../../services/loanService';
import { clientService, ClientGroup } from '../../services/clientService';
import { getSavingsAccounts, SavingsAccount } from '../../services/savingsService';

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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ message: string; overpayment?: string } | null>(null);

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
      const err = e as { detail?: string; message?: string };
      setSearchError(err?.detail ?? err?.message ?? 'Search failed.');
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
    if (paymentMode === 'bank_transfer' && !bankReference.trim()) {
      setSubmitError('Bank reference is required for bank transfer payments.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: RepayLoanPayload = {
        amount,
        payment_date: paymentDate,
        payment_mode: paymentMode,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
      };
      const result = await loanService.repayLoan(selectedLoan.id, payload);
      const overpay = parseFloat(result.overpayment_credited ?? '0');
      setSubmitSuccess({
        message: `₦${fmt(amount)} recorded for ${selectedLoan.client_name} (${selectedLoan.loan_number})`,
        overpayment: overpay > 0 ? `₦${fmt(result.overpayment_credited)} credited to savings` : undefined,
      });
      setSelectedLoan(null);
      setSchedule([]);
      setAmount('');
      setBankReference('');
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSubmitError(err?.detail ?? err?.message ?? 'Repayment failed.');
    } finally {
      setSubmitting(false);
    }
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
                  <div>Outstanding: ₦{fmt(loan.outstanding_principal)}</div>
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
              <div>
                <span className="font-semibold text-gray-900">{selectedLoan.loan_number}</span>
                <span className="ml-2 text-sm text-gray-500">{selectedLoan.client_name}</span>
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
                  disabled={submitting || !amount}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
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
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);

  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{ succeeded: number; failed: { loan_account_id: number; error: string }[] } | null>(null);

  useEffect(() => {
    setGroupsLoading(true);
    clientService.listClientGroups({ is_active: true })
      .then((res) => setGroups(Array.isArray(res) ? res : []))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  async function loadSheet() {
    if (!selectedGroup) return;
    setSheetLoading(true);
    setSheetError(null);
    setRows([]);
    setSubmitResult(null);
    try {
      const data = await loanService.getGroupCollection(Number(selectedGroup), collectionDate);
      setRows(data);
      const initial: Record<number, string> = {};
      data.forEach((r) => { initial[r.loan_account_id] = r.remaining; });
      setAmounts(initial);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSheetError(err?.detail ?? err?.message ?? 'Failed to load collection sheet.');
    } finally {
      setSheetLoading(false);
    }
  }

  async function handlePostAll(e: React.FormEvent) {
    e.preventDefault();
    if (paymentMode === 'bank_transfer' && !bankReference.trim()) {
      setSubmitError('Bank reference is required for bank transfer payments.');
      return;
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

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await loanService.bulkRepay({
        payments,
        payment_mode: paymentMode,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
      });
      setSubmitResult(result);
      setRows([]);
      setAmounts({});
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSubmitError(err?.detail ?? err?.message ?? 'Bulk repayment failed.');
    } finally {
      setSubmitting(false);
    }
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
              <option key={g.id} value={g.id}>{g.name} ({g.group_code})</option>
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
              )}

              <div className="flex gap-3">
                {submitError && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                    <AlertCircle size={14} /> {submitError}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={14} className="animate-spin" /> : <DollarSign size={14} />}
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

  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<LoanRepaymentRequest | null>(null);

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

  const handleSelectLoan = (loan: LoanAccountList) => {
    setSelectedLoan(loan);
    setResults([]);
    setSearch('');
    setAmount('');
    setSubmitted(null);
    setError(null);
  };

  const handleClearLoan = () => {
    setSelectedLoan(null);
    setSavingsAccounts([]);
    setSelectedSavings(null);
    setAmount('');
    setSubmitted(null);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLoan || !selectedSavings) return;
    const amtNum = parseFloat(amount);
    if (isNaN(amtNum) || amtNum <= 0) {
      setError('Enter a valid positive amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await loanService.requestSavingsRepayment(selectedLoan.id, {
        amount,
        savings_account_id: selectedSavings.id,
        payment_date: paymentDate || undefined,
        notes: notes || undefined,
      });
      setSubmitted(result);
    } catch (err: any) {
      setError(err?.detail ?? err?.message ?? 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle className="mx-auto mb-4 text-green-600" size={48} />
        <h2 className="mb-2 text-xl font-bold text-green-800">Request Submitted</h2>
        <p className="mb-1 text-sm text-green-700">
          Repayment request <strong>#{submitted.id}</strong> is pending director approval.
        </p>
        <p className="mb-4 text-sm text-gray-600">
          Amount: <strong>₦{fmt(submitted.amount)}</strong> from savings{' '}
          <strong>{submitted.savings_account_number}</strong>
        </p>
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
            <div>
              <p className="font-medium text-blue-900">{selectedLoan.client_name}</p>
              <p className="text-xs text-blue-700">{selectedLoan.loan_number}</p>
              <p className="mt-1 text-xs text-gray-600">
                Outstanding: ₦{fmt(selectedLoan.outstanding_principal)}
              </p>
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
                        Outstanding: ₦{fmt(loan.outstanding_principal)}
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
                  onClick={() => {
                    setSelectedSavings(acc);
                    setAmount(String(Math.min(
                      parseFloat(String(acc.available_balance)) || 0,
                      parseFloat(String(selectedLoan.outstanding_principal)) || 0
                    ).toFixed(2)));
                  }}
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

      {/* Step 3: Enter Amount & Submit */}
      {selectedLoan && selectedSavings && (
        <form onSubmit={handleSubmit} className="rounded-xl border border-gray-200 bg-white p-5">
          <h3 className="mb-4 text-sm font-semibold text-gray-700">Step 3 — Enter Amount</h3>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="sd-amount">
                Amount (₦)
              </label>
              <input
                id="sd-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={String(selectedSavings.available_balance)}
                value={amount}
                onChange={e => setAmount(e.target.value)}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-400 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                Max available: ₦{fmt(selectedSavings.available_balance)}
              </p>
            </div>

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
                disabled={submitting}
                className="flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <PiggyBank size={14} />}
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

// ── Page ───────────────────────────────────────────────────────────────────

type Tab = 'normal' | 'group' | 'savings';

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
      </div>
    </div>
  );
}
