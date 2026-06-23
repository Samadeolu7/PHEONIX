/**
 * Group Combined Receipt Page
 * Record savings deposits + loan repayments for ALL members of a group in one batch.
 *
 * Business logic per member (same as CombinedReceiptPage):
 *   - Cash >= loan_due  →  green  (surplus to savings)
 *   - Cash < loan_due AND savings >= gap  →  yellow  (gap drawn from savings)
 *   - Cash < loan_due AND savings < gap  →  red  (BLOCKED — insufficient funds)
 *
 * "Post All" is disabled while any row is red.
 *
 * Route: /savings/group-combined-receipt
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  DollarSign,
  Loader2,
  PiggyBank,
  Users,
  X,
} from 'lucide-react';
import { clientService, ClientGroup, Client } from '../../services/clientService';
import { loanService, LoanAccountList, LoanRepaymentSchedule } from '../../services/loanService';
import {
  getSavingsAccounts,
  SavingsAccount,
  depositToSavings,
} from '../../services/savingsService';
import api from '../../services/api';

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

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

// ── Types ──────────────────────────────────────────────────────────────────

type RowStatus = 'ok' | 'warn' | 'error' | 'skipped' | 'loading';

interface MemberRow {
  client: Client;
  loan: LoanAccountList | null;
  savingsAccount: SavingsAccount | null;
  nextInstallment: LoanRepaymentSchedule | null;
  loanDue: number;
  savingsBalance: number;
  amountCollected: string;
  status: RowStatus;
  statusMessage: string;
  // Computed
  loanPayment: number;
  gapFromSavings: number;
  surplus: number;
  savingsBalanceAfter: number;
}

type PostingStatus = 'idle' | 'posting' | 'done' | 'partial';

interface PostResult {
  succeeded: number;
  failed: { clientName: string; error: string }[];
}

// ── Compute per-row status ─────────────────────────────────────────────────

function computeRowStatus(
  amountStr: string,
  loanDue: number,
  savingsBalance: number
): Pick<MemberRow, 'status' | 'statusMessage' | 'loanPayment' | 'gapFromSavings' | 'surplus' | 'savingsBalanceAfter'> {
  const amount = parseFloat(amountStr) || 0;

  if (amount === 0) {
    return {
      status: 'skipped',
      statusMessage: 'Skipped',
      loanPayment: 0,
      gapFromSavings: 0,
      surplus: 0,
      savingsBalanceAfter: savingsBalance,
    };
  }

  const deficit = loanDue - amount;

  if (deficit <= 0) {
    const surplus = -deficit;
    return {
      status: 'ok',
      statusMessage: surplus > 0 ? `+₦${fmt(surplus)} → savings` : 'Fully covered',
      loanPayment: loanDue,
      gapFromSavings: 0,
      surplus,
      savingsBalanceAfter: savingsBalance + surplus,
    };
  } else if (savingsBalance >= deficit) {
    const remaining = savingsBalance - deficit;
    return {
      status: 'warn',
      statusMessage: `₦${fmt(deficit)} drawn from savings (remaining: ₦${fmt(remaining)})`,
      loanPayment: loanDue,
      gapFromSavings: deficit,
      surplus: 0,
      savingsBalanceAfter: remaining,
    };
  } else {
    const shortfall = deficit - savingsBalance;
    return {
      status: 'error',
      statusMessage: `Insufficient — short by ₦${fmt(shortfall)}`,
      loanPayment: amount,
      gapFromSavings: 0,
      surplus: 0,
      savingsBalanceAfter: savingsBalance,
    };
  }
}

// ── Status badge ───────────────────────────────────────────────────────────

function StatusBadge({ status, message }: { status: RowStatus; message: string }) {
  const map: Record<RowStatus, string> = {
    ok:      'bg-green-100 text-green-700',
    warn:    'bg-amber-100 text-amber-700',
    error:   'bg-red-100 text-red-700',
    skipped: 'bg-gray-100 text-gray-500',
    loading: 'bg-blue-100 text-blue-600',
  };
  return (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium leading-snug max-w-[180px] ${map[status]}`}>
      {status === 'loading' ? <Loader2 size={10} className="inline animate-spin mr-1" /> : null}
      {message}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function GroupCombinedReceiptPage() {
  // Group selection
  const [groups, setGroups] = useState<ClientGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<number | ''>('');

  // Sheet
  const [collectionDate, setCollectionDate] = useState(today());
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [rows, setRows] = useState<MemberRow[]>([]);

  // Payment mode
  const [paymentMode, setPaymentMode] = useState<'cash' | 'bank_transfer'>('cash');
  const [bankReference, setBankReference] = useState('');

  // Posting
  const [postingStatus, setPostingStatus] = useState<PostingStatus>('idle');
  const [currentlyPosting, setCurrentlyPosting] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<PostResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load groups on mount
  useEffect(() => {
    setGroupsLoading(true);
    clientService.listClientGroups({ is_active: true })
      .then(res => setGroups(Array.isArray(res) ? res : []))
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));
  }, []);

  // ── Load sheet when group + date selected ─────────────────────────────

  async function loadSheet() {
    if (!selectedGroup) return;
    setSheetLoading(true);
    setSheetError(null);
    setRows([]);
    setPostResult(null);
    setSubmitError(null);
    setPostingStatus('idle');

    try {
      // 1. Fetch group members
      const membersRes: any = await api.get(`/clients/groups/${selectedGroup}/members/`);
      const members: Client[] = Array.isArray(membersRes)
        ? membersRes
        : (membersRes?.results ?? membersRes?.members ?? []);

      if (members.length === 0) {
        setSheetError('No members found for this group.');
        return;
      }

      // 2. For each member, fetch their active loan + savings (in parallel)
      const memberRows: MemberRow[] = await Promise.all(
        members.map(async (client: Client): Promise<MemberRow> => {
          const [loanRes, savingsRes] = await Promise.allSettled([
            loanService.listLoans({ client: client.id, status: 'active' }),
            getSavingsAccounts({ client: client.id }),
          ]);

          let loan: LoanAccountList | null = null;
          let nextInstallment: LoanRepaymentSchedule | null = null;
          let loanDue = 0;

          if (loanRes.status === 'fulfilled') {
            const lr = loanRes.value as any;
            const loans: LoanAccountList[] = Array.isArray(lr) ? lr : (lr?.results ?? []);
            if (loans.length > 0) {
              loan = loans[0];
              // Fetch schedule for next due
              try {
                const sched = await loanService.getLoanSchedule(loan.id);
                nextInstallment = sched.find(
                  s => s.status === 'overdue' || s.status === 'pending' || s.status === 'partial'
                ) ?? null;
                if (nextInstallment) {
                  loanDue = Math.max(
                    0,
                    parseFloat(nextInstallment.total_due) - parseFloat(nextInstallment.total_paid)
                  );
                }
              } catch {
                // schedule fetch failed — use outstanding principal as fallback
                loanDue = parseFloat(loan.outstanding_principal ?? '0');
              }
            }
          }

          let savingsAccount: SavingsAccount | null = null;
          let savingsBalance = 0;

          if (savingsRes.status === 'fulfilled') {
            const sr = savingsRes.value as any;
            const accs: SavingsAccount[] = Array.isArray(sr) ? sr : (sr?.results ?? []);
            const active = accs.filter((a: SavingsAccount) => a.status === 'active');
            if (active.length > 0) {
              savingsAccount = active[0];
              savingsBalance = parseFloat(String(savingsAccount.available_balance ?? '0'));
            }
          }

          // Default: pre-fill amount collected with loan due
          const amountCollected = loanDue > 0 ? loanDue.toFixed(2) : '';
          const computed = computeRowStatus(amountCollected, loanDue, savingsBalance);

          return {
            client,
            loan,
            savingsAccount,
            nextInstallment,
            loanDue,
            savingsBalance,
            amountCollected,
            ...computed,
          };
        })
      );

      setRows(memberRows);
    } catch (e: unknown) {
      const err = e as { detail?: string; message?: string };
      setSheetError(err?.detail ?? err?.message ?? 'Failed to load group members.');
    } finally {
      setSheetLoading(false);
    }
  }

  // ── Update a row's amount (re-computes status) ─────────────────────────

  function updateAmount(idx: number, amount: string) {
    setRows(prev => {
      const next = [...prev];
      const row = { ...next[idx] };
      row.amountCollected = amount;
      const computed = computeRowStatus(amount, row.loanDue, row.savingsBalance);
      next[idx] = { ...row, ...computed };
      return next;
    });
  }

  // ── Post all ──────────────────────────────────────────────────────────

  async function handlePostAll(e: React.FormEvent) {
    e.preventDefault();
    if (paymentMode === 'bank_transfer' && !bankReference.trim()) {
      setSubmitError('Bank reference is required for bank transfers.');
      return;
    }
    if (anyRed) {
      setSubmitError('Cannot post: some members have insufficient funds. Resolve red rows first.');
      return;
    }

    const rowsToPost = rows.filter(r => r.status !== 'skipped' && parseFloat(r.amountCollected) > 0);
    if (rowsToPost.length === 0) {
      setSubmitError('No amounts entered.');
      return;
    }

    setPostingStatus('posting');
    setSubmitError(null);
    setPostResult(null);

    let succeeded = 0;
    const failed: { clientName: string; error: string }[] = [];

    for (const row of rowsToPost) {
      if (!row.loan) continue;
      setCurrentlyPosting(row.client.full_name);

      try {
        // Post loan repayment
        await loanService.repayLoan(row.loan.id, {
          amount: String(row.loanPayment),
          payment_date: collectionDate,
          payment_mode: paymentMode,
          bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
        });

        // Post savings deposit if surplus > 0
        if (row.surplus > 0 && row.savingsAccount) {
          await depositToSavings(row.savingsAccount.id, {
            amount: String(row.surplus),
            date: collectionDate,
            description: `Group combined receipt — surplus`,
            payment_mode: paymentMode,
            bank_reference: paymentMode === 'bank_transfer' ? bankReference : undefined,
          });
        }

        succeeded++;
      } catch (e: unknown) {
        const err = e as { detail?: string; message?: string };
        failed.push({
          clientName: row.client.full_name,
          error: err?.detail ?? err?.message ?? 'Unknown error',
        });
      }
    }

    setCurrentlyPosting(null);
    setPostResult({ succeeded, failed });
    setPostingStatus(failed.length === 0 ? 'done' : 'partial');
    if (succeeded > 0) setRows([]);
  }

  // ── Derived state ──────────────────────────────────────────────────────

  const anyRed = rows.some(r => r.status === 'error');
  const redRows = rows.filter(r => r.status === 'error');
  const totalExpected = rows.reduce((s, r) => s + r.loanDue, 0);
  const totalCollected = rows.reduce((s, r) => s + (parseFloat(r.amountCollected) || 0), 0);

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
              <Users size={20} className="text-[#0a1857]" />
              <h1 className="text-xl font-bold text-gray-900">Group Combined Payment</h1>
            </div>
            <p className="text-sm text-gray-500">
              Batch savings + loan payments for all group members
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6 space-y-5">

        {/* ── Post result ── */}
        {postResult && (
          <div className={`rounded-xl p-4 text-sm ${
            postResult.failed.length === 0
              ? 'bg-green-50 text-green-800'
              : 'bg-amber-50 text-amber-800'
          }`}>
            <div className="flex items-center gap-2 font-semibold">
              {postResult.failed.length === 0
                ? <CheckCircle size={18} className="text-green-600" />
                : <AlertCircle size={18} className="text-amber-600" />
              }
              {postResult.succeeded} payment{postResult.succeeded !== 1 ? 's' : ''} posted successfully.
              {postResult.failed.length > 0 && ` ${postResult.failed.length} failed.`}
            </div>
            {postResult.failed.length > 0 && (
              <ul className="mt-2 ml-6 list-disc text-xs text-red-700">
                {postResult.failed.map((f, i) => (
                  <li key={i}><strong>{f.clientName}:</strong> {f.error}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => { setPostResult(null); setPostingStatus('idle'); }}
              className="mt-3 text-xs underline opacity-70 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── Group & date selector ── */}
        <div className="rounded-xl bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-sm font-semibold text-gray-700">Select Group & Date</h3>
          <div className="flex flex-wrap gap-3">
            <select
              value={selectedGroup}
              onChange={e => {
                setSelectedGroup(e.target.value === '' ? '' : Number(e.target.value));
                setRows([]);
                setPostResult(null);
                setSheetError(null);
              }}
              aria-label="Select group"
              className="min-w-[220px] rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">— Select a group —</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.group_code}) — {g.members_count} members
                </option>
              ))}
            </select>

            <input
              type="date"
              title="Collection date"
              value={collectionDate}
              onChange={e => setCollectionDate(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />

            <button
              type="button"
              onClick={loadSheet}
              disabled={!selectedGroup || sheetLoading}
              className="flex items-center gap-2 rounded-lg bg-[#0a1857] px-4 py-2 text-sm font-medium text-white hover:bg-[#060e30] disabled:opacity-50"
            >
              {sheetLoading ? <Loader2 size={14} className="animate-spin" /> : <Users size={14} />}
              Load Members
            </button>
          </div>

          {groupsLoading && (
            <p className="mt-2 text-xs text-gray-400">Loading groups…</p>
          )}
          {sheetError && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={14} /> {sheetError}
            </div>
          )}
        </div>

        {/* ── Red rows warning banner ── */}
        {anyRed && (
          <div className="rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-2 text-sm text-red-700">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Cannot submit: the following clients have insufficient funds:</p>
                <ul className="mt-1 ml-4 list-disc text-xs">
                  {redRows.map(r => (
                    <li key={r.client.id}>
                      <strong>{r.client.full_name}</strong>: {r.statusMessage}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {sheetLoading && (
          <div className="rounded-xl bg-white py-16 text-center shadow-sm">
            <Loader2 size={28} className="animate-spin text-blue-600 mx-auto" />
            <p className="mt-3 text-sm text-gray-500">Loading members and account data…</p>
          </div>
        )}

        {/* ── Collection sheet ── */}
        {rows.length > 0 && (
          <form onSubmit={handlePostAll} className="space-y-4">
            <div className="rounded-xl bg-white shadow-sm overflow-hidden">
              <div className="border-b px-5 py-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700">
                    Collection Sheet — {rows.length} member{rows.length !== 1 ? 's' : ''}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Pre-filled with each member's next loan instalment due.
                    Edit amounts as needed.
                  </p>
                </div>
                {postingStatus === 'posting' && currentlyPosting && (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <Loader2 size={14} className="animate-spin" />
                    Posting: {currentlyPosting}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                      <th className="px-4 py-3">Client Name</th>
                      <th className="px-4 py-3 text-right">Loan Due</th>
                      <th className="px-4 py-3">Due Date</th>
                      <th className="px-4 py-3 text-right">Savings Balance</th>
                      <th className="px-4 py-3 text-right">Amount Collected</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, idx) => (
                      <tr
                        key={row.client.id}
                        className={
                          row.status === 'error'  ? 'bg-red-50'
                          : row.status === 'warn' ? 'bg-amber-50'
                          : row.status === 'ok'   ? 'bg-green-50/50'
                          : 'hover:bg-gray-50'
                        }
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-gray-900">{row.client.full_name}</span>
                          {row.loan ? (
                            <span className="block font-mono text-xs text-gray-400">{row.loan.loan_number}</span>
                          ) : (
                            <span className="block text-xs text-gray-400">No active loan</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.loanDue > 0 ? (
                            <span className="font-semibold text-gray-900">₦{fmt(row.loanDue)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-gray-600 text-xs">
                          {row.nextInstallment ? (
                            <span className={row.nextInstallment.status === 'overdue' ? 'text-red-700 font-medium' : ''}>
                              {fmtDate(row.nextInstallment.due_date)}
                              {row.nextInstallment.status === 'overdue' && (
                                <span className="ml-1 rounded-full bg-red-100 px-1 py-0.5 text-red-700">OD</span>
                              )}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {row.savingsAccount ? (
                            <span className="text-green-700 font-medium">₦{fmt(row.savingsBalance)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            title={`Amount collected from ${row.client.full_name}`}
                            value={row.amountCollected}
                            onChange={e => updateAmount(idx, e.target.value)}
                            disabled={postingStatus === 'posting'}
                            className={`w-32 rounded-lg border px-2 py-1 text-right text-sm focus:outline-none focus:ring-1 disabled:opacity-50 ${
                              row.status === 'error'
                                ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-red-500'
                                : row.status === 'warn'
                                ? 'border-amber-300 bg-amber-50 focus:border-amber-500 focus:ring-amber-500'
                                : 'border-gray-300 focus:border-green-500 focus:ring-green-500'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge status={row.status} message={row.statusMessage} />
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* Summary totals */}
                  <tfoot>
                    <tr className="border-t-2 bg-gray-50 font-semibold">
                      <td className="px-4 py-3 text-gray-700">
                        Totals ({rows.filter(r => r.status !== 'skipped').length} active)
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900">₦{fmt(totalExpected)}</td>
                      <td />
                      <td className="px-4 py-3 text-right text-green-700">
                        ₦{fmt(rows.reduce((s, r) => s + r.savingsBalance, 0))}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={totalCollected >= totalExpected ? 'text-green-700' : 'text-amber-700'}>
                          ₦{fmt(totalCollected)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1 text-xs">
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                            {rows.filter(r => r.status === 'ok').length} OK
                          </span>
                          {rows.filter(r => r.status === 'warn').length > 0 && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
                              {rows.filter(r => r.status === 'warn').length} savings
                            </span>
                          )}
                          {rows.filter(r => r.status === 'error').length > 0 && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                              {rows.filter(r => r.status === 'error').length} insufficient
                            </span>
                          )}
                          {rows.filter(r => r.status === 'skipped').length > 0 && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500">
                              {rows.filter(r => r.status === 'skipped').length} skipped
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* ── Payment mode + submit ── */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end gap-6">
                {/* Payment mode */}
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-700">Payment Mode</p>
                  <div className="flex gap-4">
                    {(['cash', 'bank_transfer'] as const).map(mode => (
                      <label key={mode} className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="groupPaymentMode"
                          value={mode}
                          checked={paymentMode === mode}
                          onChange={() => setPaymentMode(mode)}
                          className="accent-green-600"
                          disabled={postingStatus === 'posting'}
                        />
                        <span className="text-sm text-gray-700">
                          {mode === 'bank_transfer' ? 'Bank Transfer' : 'Cash'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Bank reference */}
                {paymentMode === 'bank_transfer' && (
                  <div className="flex-1 min-w-[220px]">
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Bank Reference <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={bankReference}
                      onChange={e => setBankReference(e.target.value)}
                      placeholder="e.g. TRF/20240617/1234567"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
                      required={paymentMode === 'bank_transfer'}
                      disabled={postingStatus === 'posting'}
                    />
                  </div>
                )}

                {/* Shortfall info */}
                {totalCollected < totalExpected && (
                  <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                    <strong>Shortfall:</strong> ₦{fmt(totalExpected - totalCollected)} below expected
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 ml-auto">
                  {submitError && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                      <AlertCircle size={14} />
                      <span>{submitError}</span>
                      <button type="button" aria-label="Dismiss error" onClick={() => setSubmitError(null)}>
                        <X size={12} />
                      </button>
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={
                      postingStatus === 'posting' ||
                      anyRed ||
                      rows.every(r => r.status === 'skipped') ||
                      (paymentMode === 'bank_transfer' && !bankReference.trim())
                    }
                    className="flex items-center gap-2 rounded-lg bg-[#0a1857] px-5 py-2 text-sm font-medium text-white hover:bg-[#060e30] disabled:opacity-50"
                  >
                    {postingStatus === 'posting' ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <>
                        <DollarSign size={14} />
                        <PiggyBank size={14} />
                      </>
                    )}
                    {postingStatus === 'posting' ? 'Posting…' : 'Post All'}
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* Empty state */}
        {rows.length === 0 && !sheetLoading && selectedGroup && !sheetError && !postResult && (
          <div className="rounded-xl bg-white py-14 text-center text-sm text-gray-400 shadow-sm">
            No members loaded yet. Click "Load Members" to start.
          </div>
        )}
      </div>
    </div>
  );
}
