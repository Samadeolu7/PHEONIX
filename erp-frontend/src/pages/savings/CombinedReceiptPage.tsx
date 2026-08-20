/**
 * Combined Receipt Page
 * Most common daily operation: client pays BOTH savings deposit AND loan repayment in one visit.
 *
 * Business logic:
 *   - Cash >= loan_due  →  loan gets loan_due, savings gets (cash - loan_due)
 *   - Cash < loan_due AND savings_balance >= gap  →  loan gets loan_due (gap drawn from savings), savings net = 0 - gap
 *   - Cash < loan_due AND savings_balance < gap  →  BLOCKED (insufficient funds)
 *
 * Route: /savings/combined-receipt
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  CreditCard,
  DollarSign,
  Loader2,
  PiggyBank,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { loanService, LoanAccountList, LoanRepaymentSchedule } from '../../services/loanService';
import type { SavingsAccount } from '../../services/savingsService';
import { getSavingsAccounts, depositToSavings } from '../../services/savingsService';
import { useDepositToSavings } from '../../hooks/useSavings';
import { BRAND } from '../../constants/brand';
import { BankAccount } from '../../types/banks';
import { bankService } from '../../services/bankService';

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Breakdown calculation ──────────────────────────────────────────────────

interface PaymentBreakdown {
  cashReceived: number;
  loanDue: number;
  savingsBalance: number;
  // Computed
  loanPayment: number;       // amount going to loan repayment
  savingsCredit: number;     // net change to savings (can be negative if gap drawn from savings)
  gapFromSavings: number;    // amount drawn from savings to cover loan shortfall
  surplus: number;           // cash surplus going to savings
  savingsBalanceAfter: number;
  status: 'ok' | 'warn' | 'error';
  message: string;
}

function computeBreakdown(
  cashReceived: number,
  loanDue: number,
  savingsBalance: number
): PaymentBreakdown {
  const deficit = loanDue - cashReceived; // >0 = under-paid, <0 = surplus

  if (deficit <= 0) {
    // Cash covers loan (and possibly more)
    const surplus = -deficit;
    return {
      cashReceived, loanDue, savingsBalance,
      loanPayment: loanDue,
      savingsCredit: surplus,
      gapFromSavings: 0,
      surplus,
      savingsBalanceAfter: savingsBalance + surplus,
      status: 'ok',
      message: surplus > 0
        ? `₦${fmt(surplus)} surplus will be credited to savings.`
        : 'Payment covers the full loan instalment.',
    };
  } else {
    // Under-paid — try to cover from savings
    if (savingsBalance >= deficit) {
      const remaining = savingsBalance - deficit;
      return {
        cashReceived, loanDue, savingsBalance,
        loanPayment: loanDue,
        savingsCredit: -deficit,
        gapFromSavings: deficit,
        surplus: 0,
        savingsBalanceAfter: remaining,
        status: 'warn',
        message: `₦${fmt(deficit)} short — will be drawn from savings (remaining: ₦${fmt(remaining)}).`,
      };
    } else {
      const shortfall = deficit - savingsBalance;
      return {
        cashReceived, loanDue, savingsBalance,
        loanPayment: cashReceived,
        savingsCredit: 0,
        gapFromSavings: 0,
        surplus: 0,
        savingsBalanceAfter: savingsBalance,
        status: 'error',
        message: `Cannot process: savings balance (₦${fmt(savingsBalance)}) is insufficient to cover the ₦${fmt(deficit)} shortfall. Short by ₦${fmt(shortfall)}.`,
      };
    }
  }
}

// ── Receipt Component ──────────────────────────────────────────────────────

interface ReceiptProps {
  clientName: string;
  loanNumber: string;
  savingsAccountNumber: string;
  paymentDate: string;
  paymentMode: string;
  cashReceived: number;
  loanPayment: number;
  savingsCredit: number;
  gapFromSavings: number;
  surplus: number;
  onDone: () => void;
}

function Receipt({
  clientName, loanNumber, savingsAccountNumber,
  paymentDate, paymentMode,
  cashReceived, loanPayment, savingsCredit, gapFromSavings, surplus,
  onDone,
}: ReceiptProps) {
  return (
    <div className="mx-auto max-w-md">
      <div
        className="rounded-2xl border-2 p-6 text-center shadow-lg print:shadow-none"
        style={{ borderColor: BRAND.colors.gold }}
        id="receipt-block"
      >
        {/* Header */}
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ backgroundColor: BRAND.colors.navyPrimary }}
        >
          <CheckCircle className="text-white" size={28} />
        </div>
        <h2 className="text-lg font-bold" style={{ color: BRAND.colors.navyPrimary }}>
          Payment Posted
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">{BRAND.companyName}</p>

        <div className="my-4 border-t border-dashed" style={{ borderColor: BRAND.colors.gold }} />

        {/* Details */}
        <div className="space-y-2 text-left text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Client</span>
            <span className="font-semibold text-gray-900">{clientName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Loan Account</span>
            <span className="font-mono text-xs text-gray-700">{loanNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Savings Account</span>
            <span className="font-mono text-xs text-gray-700">{savingsAccountNumber}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Payment Date</span>
            <span className="text-gray-700">{paymentDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Payment Mode</span>
            <span className="text-gray-700 capitalize">{paymentMode.replace(/_/g, ' ')}</span>
          </div>
        </div>

        <div className="my-4 border-t border-dashed" style={{ borderColor: BRAND.colors.gold }} />

        {/* Amounts */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Cash Received</span>
            <span className="font-bold text-gray-900">₦{fmt(cashReceived)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">→ Loan Repayment</span>
            <span className="font-semibold text-blue-700">₦{fmt(loanPayment)}</span>
          </div>
          {gapFromSavings > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">→ Drawn from Savings</span>
              <span className="font-semibold text-amber-700">₦{fmt(gapFromSavings)}</span>
            </div>
          )}
          {surplus > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">→ To Savings</span>
              <span className="font-semibold text-green-700">₦{fmt(surplus)}</span>
            </div>
          )}
          {savingsCredit !== 0 && (
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-gray-500">Net Savings Change</span>
              <span className={`font-bold ${savingsCredit >= 0 ? 'text-green-700' : 'text-amber-700'}`}>
                {savingsCredit >= 0 ? '+' : ''}₦{fmt(Math.abs(savingsCredit))}
              </span>
            </div>
          )}
        </div>

        <div className="my-4 border-t border-dashed" style={{ borderColor: BRAND.colors.gold }} />

        <p className="text-xs text-gray-400">
          Thank you, {clientName.split(' ')[0]}!
        </p>
        <p className="text-xs text-gray-300 mt-0.5">{BRAND.motto}</p>
      </div>

      {/* Actions */}
      <div className="mt-4 flex gap-3 justify-center print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Printer size={14} /> Print Receipt
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: BRAND.colors.navyPrimary }}
        >
          New Transaction <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function CombinedReceiptPage() {
  // Step 1: Search & select client/loan
  const [search, setSearch] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<LoanAccountList[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [selectedLoan, setSelectedLoan] = useState<LoanAccountList | null>(null);
  const [savingsAccount, setSavingsAccount] = useState<SavingsAccount | null>(null);
  const [schedule, setSchedule] = useState<LoanRepaymentSchedule[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // Step 2: Payment form
  const [cashAmount, setCashAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountId, setBankAccountId] = useState<number | ''>('');

  useEffect(() => {
    bankService.listBankAccounts({ is_active: true }).then(setBankAccounts);
  }, []);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Receipt
  const [receipt, setReceipt] = useState<{
    clientName: string;
    loanNumber: string;
    savingsAccountNumber: string;
    cashReceived: number;
    loanPayment: number;
    savingsCredit: number;
    gapFromSavings: number;
    surplus: number;
  } | null>(null);

  // ── Search ─────────────────────────────────────────────────────────────

  const doSearch = useCallback(async () => {
    if (!search.trim()) return;
    setSearching(true);
    setSearchError(null);
    setSearchResults([]);
    setSelectedLoan(null);
    setSavingsAccount(null);
    setSchedule([]);
    try {
      const [r1, r2, r3] = await Promise.all([
        loanService.listLoans({ search: search.trim(), status: 'active' }),
        loanService.listLoans({ search: search.trim(), status: 'disbursed' }),
        loanService.listLoans({ search: search.trim(), status: 'defaulted' }),
      ]);
      const items1 = Array.isArray(r1) ? r1 : ((r1 as any)?.results ?? []);
      const items2 = Array.isArray(r2) ? r2 : ((r2 as any)?.results ?? []);
      const items3 = Array.isArray(r3) ? r3 : ((r3 as any)?.results ?? []);
      setSearchResults([...items1, ...items2, ...items3]);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSearchError(err?.detail ?? err?.message ?? 'Search failed.');
    } finally {
      setSearching(false);
    }
  }, [search]);

  // ── Select a loan → load schedule + savings ─────────────────────────────

  async function selectLoan(loan: LoanAccountList) {
    setSelectedLoan(loan);
    setSearchResults([]);
    setSearch('');
    setSubmitError(null);
    setReceipt(null);
    setLoadingDetails(true);

    try {
      const [schedRes, savRes] = await Promise.allSettled([
        loanService.getLoanSchedule(loan.id),
        getSavingsAccounts({ client: loan.client }),
      ]);

      // Schedule
      if (schedRes.status === 'fulfilled') {
        const s = schedRes.value;
        setSchedule(s);
        // Pre-fill cash amount with next installment due
        const nextDue = s.find(r => r.status === 'overdue' || r.status === 'pending' || r.status === 'partial');
        if (nextDue) {
          const remaining = parseFloat(nextDue.total_due) - parseFloat(nextDue.total_paid);
          if (remaining > 0) setCashAmount(remaining.toFixed(2));
        }
      }

      // Savings
      if (savRes.status === 'fulfilled') {
        const accs = Array.isArray(savRes.value)
          ? savRes.value
          : ((savRes.value as any)?.results ?? []);
        const active = accs.filter((a: SavingsAccount) => a.status === 'active');
        if (active.length > 0) setSavingsAccount(active[0]);
      }
    } finally {
      setLoadingDetails(false);
    }
  }

  function clearSelection() {
    setSelectedLoan(null);
    setSavingsAccount(null);
    setSchedule([]);
    setCashAmount('');
    setSubmitError(null);
    setReceipt(null);
    setSearch('');
  }

  // ── Derived breakdown ──────────────────────────────────────────────────

  const nextInstallment = schedule.find(
    r => r.status === 'overdue' || r.status === 'pending' || r.status === 'partial'
  );
  const loanDue = nextInstallment
    ? Math.max(0, parseFloat(nextInstallment.total_due) - parseFloat(nextInstallment.total_paid))
    : 0;
  const savingsBalance = parseFloat(String(savingsAccount?.available_balance ?? '0'));
  const cashNum = parseFloat(cashAmount) || 0;

  const breakdown: PaymentBreakdown | null =
    cashNum > 0 && loanDue > 0 && selectedLoan
      ? computeBreakdown(cashNum, loanDue, savingsBalance)
      : null;

  // ── Submit ─────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLoan || !breakdown) return;
    if (breakdown.status === 'error') {
      setSubmitError(breakdown.message);
      return;
    }
    if (paymentMode === 'bank_transfer' && !bankReference.trim()) {
      setSubmitError('Bank reference is required for bank transfers.');
      return;
    }
    if (paymentMode === 'bank_transfer' && !bankAccountId) {
      setSubmitError('Please select a destination bank account.');
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      // 1) Post loan repayment
      await loanService.repayLoan(selectedLoan.id, {
        amount: String(breakdown.loanPayment),
        payment_date: paymentDate,
        payment_mode: paymentMode,
        bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
        bank_account_id: paymentMode === 'bank_transfer' ? Number(bankAccountId) : undefined,
      });

      // 2) Post savings deposit (only if there's a net positive to savings)
      //    If gap drawn from savings, deposit the cash surplus (which may be 0)
      //    and the backend handles the gap via the loan repayment overpayment logic.
      //    We explicitly deposit surplus to savings if > 0.
      //    NOTE: the savings deposit endpoint reads `payment_method` ('cash'|'bank') and
      //    `bank_account_id`, not the `payment_mode`/`bank_reference` convention used by
      //    loan repayments — sending the wrong keys silently falls back to a cash posting.
      if (breakdown.surplus > 0 && savingsAccount) {
        await depositToSavings(savingsAccount.id, {
          amount: String(breakdown.surplus),
          date: paymentDate,
          description: `Combined receipt — surplus from loan repayment`,
          payment_method: paymentMode === 'bank_transfer' ? 'bank' : 'cash',
          bank_account_id: paymentMode === 'bank_transfer' ? Number(bankAccountId) : undefined,
        });
      }

      // Show receipt
      setReceipt({
        clientName: selectedLoan.client_name,
        loanNumber: selectedLoan.loan_number,
        savingsAccountNumber: savingsAccount?.account_number ?? '—',
        cashReceived: breakdown.cashReceived,
        loanPayment: breakdown.loanPayment,
        savingsCredit: breakdown.savingsCredit,
        gapFromSavings: breakdown.gapFromSavings,
        surplus: breakdown.surplus,
      });
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSubmitError(err?.detail ?? err?.message ?? 'Transaction failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Receipt screen ─────────────────────────────────────────────────────

  if (receipt) {
    return (
      <div className="min-h-screen bg-gray-50 print:bg-white">
        <div className="border-b bg-white px-6 py-4 print:hidden">
          <div className="flex items-center gap-3">
            <Link to="/savings" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
              <ArrowLeft size={18} />
            </Link>
            <div className="flex items-center gap-2">
              <CreditCard size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Combined Receipt</h1>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-2xl p-6">
          <Receipt
            clientName={receipt.clientName}
            loanNumber={receipt.loanNumber}
            savingsAccountNumber={receipt.savingsAccountNumber}
            paymentDate={paymentDate}
            paymentMode={paymentMode}
            cashReceived={receipt.cashReceived}
            loanPayment={receipt.loanPayment}
            savingsCredit={receipt.savingsCredit}
            gapFromSavings={receipt.gapFromSavings}
            surplus={receipt.surplus}
            onDone={clearSelection}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Link to="/savings" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <CreditCard size={20} style={{ color: BRAND.colors.navyPrimary }} />
              <h1 className="text-xl font-bold text-gray-900">Combined Receipt</h1>
            </div>
            <p className="text-sm text-gray-500">
              Record loan repayment + savings deposit in one transaction
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-2xl p-6 space-y-5">

        {/* ── Step 1: Find client ── */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">
            Step 1 — Search Client / Loan
          </h3>

          {!selectedLoan ? (
            <>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && doSearch()}
                    placeholder="Search by client name or loan number…"
                    className="w-full rounded-lg border border-gray-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={doSearch}
                  disabled={searching || !search.trim()}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND.colors.navyPrimary }}
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

              {searchResults.length > 0 && (
                <div className="mt-3 divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
                  {searchResults.map(loan => (
                    <button
                      key={loan.id}
                      type="button"
                      onClick={() => selectLoan(loan)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left text-sm hover:bg-blue-50"
                    >
                      <div>
                        <span className="font-medium text-gray-900">{loan.client_name}</span>
                        <span className="ml-2 font-mono text-xs text-gray-500">{loan.loan_number}</span>
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

              {searchResults.length === 0 && !searching && search && !searchError && (
                <p className="mt-3 text-sm text-gray-400">No active loans found.</p>
              )}
            </>
          ) : (
            /* Selected client info card */
            <div className="rounded-lg border p-4" style={{ borderColor: BRAND.colors.gold + '80' }}>
              {loadingDetails ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 size={14} className="animate-spin" /> Loading client details…
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-gray-400">Client</p>
                      <p className="font-semibold text-gray-900">{selectedLoan.client_name}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Loan Account</p>
                        <p className="font-mono text-xs text-gray-700">{selectedLoan.loan_number}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Outstanding: ₦{fmt(selectedLoan.total_outstanding ?? selectedLoan.outstanding_principal)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-400">Savings Account</p>
                        {savingsAccount ? (
                          <>
                            <p className="font-mono text-xs text-gray-700">{savingsAccount.account_number}</p>
                            <p className="text-xs text-green-700 font-medium mt-0.5">
                              Balance: ₦{fmt(savingsAccount.available_balance)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">No active savings account</p>
                        )}
                      </div>
                    </div>
                    {nextInstallment && (
                      <div className="rounded bg-amber-50 px-3 py-2 text-xs">
                        <span className="text-amber-700 font-medium">Next instalment due: </span>
                        <span className="text-amber-900">
                          ₦{fmt(loanDue)} on {nextInstallment.due_date}
                        </span>
                        {nextInstallment.status === 'overdue' && (
                          <span className="ml-2 rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">
                            OVERDUE
                          </span>
                        )}
                      </div>
                    )}
                    {schedule.length > 0 && !nextInstallment && (
                      <div className="rounded bg-green-50 px-3 py-2 text-xs text-green-700">
                        All instalments paid — no outstanding loan due.
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={clearSelection}
                    aria-label="Clear selection"
                    className="rounded-lg p-1 text-gray-400 hover:text-gray-600"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Step 2: Payment details ── */}
        {selectedLoan && !loadingDetails && (
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-gray-700">
              Step 2 — Enter Payment
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Amount received */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount Received (Cash) ₦
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)}
                  placeholder={loanDue > 0 ? `Loan due: ₦${fmt(loanDue)}` : 'Enter amount'}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                  required
                />
                {loanDue > 0 && (
                  <div className="mt-1 flex gap-3 text-xs text-gray-400">
                    <span>Loan due: ₦{fmt(loanDue)}</span>
                    <span>|</span>
                    <span>Savings: ₦{fmt(savingsBalance)}</span>
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => setCashAmount(loanDue.toFixed(2))}
                    >
                      Use exact due amount
                    </button>
                  </div>
                )}
              </div>

              {/* Payment date */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Date</label>
                <input
                  type="date"
                  title="Payment date"
                  value={paymentDate}
                  onChange={e => setPaymentDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>

              {/* Payment mode */}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Payment Mode</label>
                <div className="flex gap-4">
                  {(['cash', 'bank_transfer'] as const).map(mode => (
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
                      aria-label="Destination Bank Account"
                      value={bankAccountId}
                      onChange={e => setBankAccountId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      required
                    >
                      <option value="">Select bank account</option>
                      {bankAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.bank_name} — {acc.account_number} ({acc.account_name})
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
                      onChange={e => setBankReference(e.target.value)}
                      placeholder="e.g. TRF/20240617/1234567"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      required
                    />
                  </div>
                </>
              )}

              {/* ── Breakdown card ── */}
              {breakdown && (
                <div className={`rounded-xl border p-4 ${
                  breakdown.status === 'ok'
                    ? 'bg-green-50 border-green-200'
                    : breakdown.status === 'warn'
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-red-50 border-red-200'
                }`}>
                  <div className="flex items-center gap-2 mb-3">
                    {breakdown.status === 'ok' && <CheckCircle size={16} className="text-green-600" />}
                    {breakdown.status === 'warn' && <AlertCircle size={16} className="text-amber-600" />}
                    {breakdown.status === 'error' && <AlertCircle size={16} className="text-red-600" />}
                    <h4 className={`text-sm font-semibold ${
                      breakdown.status === 'ok' ? 'text-green-800'
                      : breakdown.status === 'warn' ? 'text-amber-800'
                      : 'text-red-800'
                    }`}>
                      Payment Breakdown
                    </h4>
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cash Received</span>
                      <span className="font-semibold text-gray-900">₦{fmt(breakdown.cashReceived)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Loan Instalment Due</span>
                      <span className="font-semibold text-gray-900">₦{fmt(breakdown.loanDue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Savings Balance</span>
                      <span className="font-semibold text-gray-900">₦{fmt(breakdown.savingsBalance)}</span>
                    </div>
                    <div className="border-t border-gray-200 pt-2 mt-2" />
                    <div className="flex justify-between">
                      <span className="text-gray-600">→ Loan Payment</span>
                      <span className="font-bold text-blue-700">₦{fmt(breakdown.loanPayment)}</span>
                    </div>
                    {breakdown.gapFromSavings > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">→ Drawn from Savings</span>
                        <span className="font-bold text-amber-700">₦{fmt(breakdown.gapFromSavings)}</span>
                      </div>
                    )}
                    {breakdown.surplus > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">→ Surplus to Savings</span>
                        <span className="font-bold text-green-700">₦{fmt(breakdown.surplus)}</span>
                      </div>
                    )}
                    {breakdown.status !== 'error' && (
                      <div className="flex justify-between border-t pt-2 mt-2">
                        <span className="text-gray-600">Savings Balance After</span>
                        <span className={`font-bold ${breakdown.savingsBalanceAfter >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          ₦{fmt(breakdown.savingsBalanceAfter)}
                        </span>
                      </div>
                    )}
                  </div>
                  <p className={`mt-3 text-xs font-medium ${
                    breakdown.status === 'ok' ? 'text-green-700'
                    : breakdown.status === 'warn' ? 'text-amber-700'
                    : 'text-red-700'
                  }`}>
                    {breakdown.message}
                  </p>
                </div>
              )}

              {/* Error */}
              {submitError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  <AlertCircle size={14} /> {submitError}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={clearSelection}
                  className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    submitting ||
                    !cashAmount ||
                    breakdown?.status === 'error' ||
                    (paymentMode === 'bank_transfer' && (!bankReference.trim() || !bankAccountId))
                  }
                  className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND.colors.navyPrimary }}
                >
                  {submitting ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <>
                      <DollarSign size={14} />
                      <PiggyBank size={14} />
                    </>
                  )}
                  Post Combined Payment
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
