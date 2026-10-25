import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useBranchOptions } from '../../hooks/useBranches';
import { useBankAccountChoices, useCreateBorrowing, usePreviewBorrowing } from '../../hooks/useBankBorrowings';
import type { BorrowingInput, BorrowingPreview } from '../../types/bankBorrowing';
import { apiErrorMessage, formatDay, naira, todayIso } from './treasuryFormat';

const MONEY = /^\d{0,16}(?:\.\d{0,2})?$/;
type Alloc = { amount: string; bank: number | '' };
const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500';

const BorrowingFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: branches = [] } = useBranchOptions();
  // All branches' accounts at once (the normal bank-account list follows the branch switcher).
  const { data: bankAccounts = [] } = useBankAccountChoices();
  const createBorrowing = useCreateBorrowing();
  const previewBorrowing = usePreviewBorrowing();

  const [lender, setLender] = useState('');
  const [reference, setReference] = useState('');
  const [principal, setPrincipal] = useState('');
  const [rate, setRate] = useState('');
  const [tenor, setTenor] = useState('12');
  const [firstDue, setFirstDue] = useState(todayIso());
  const [debitBranch, setDebitBranch] = useState<number | ''>('');
  const [debitBank, setDebitBank] = useState<number | ''>('');
  const [leadDays, setLeadDays] = useState('3');
  const [notes, setNotes] = useState('');
  // branch id -> { amount, bank account id }
  const [alloc, setAlloc] = useState<Record<number, Alloc>>({});
  const [preview, setPreview] = useState<BorrowingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountsFor = (branchId: number) => bankAccounts.filter((a) => a.branch === branchId);

  const allocated = useMemo(
    () => (Object.values(alloc) as Alloc[]).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0),
    [alloc]
  );
  const remaining = (parseFloat(principal) || 0) - allocated;

  const setAllocation = (branchId: number, patch: Partial<Alloc>) => {
    setPreview(null);
    setAlloc((prev) => {
      const current = prev[branchId] ?? { amount: '', bank: accountsFor(branchId)[0]?.id ?? '' };
      return { ...prev, [branchId]: { ...current, ...patch } };
    });
  };

  /** forPreview: the schedule can be previewed before the money is fully shared out. */
  const buildInput = (forPreview = false): BorrowingInput | string => {
    if (!lender.trim()) return 'Enter the lender (bank) name.';
    if (!principal || parseFloat(principal) <= 0) return 'Enter the amount borrowed.';
    if (rate === '' || parseFloat(rate) < 0) return 'Enter the monthly interest rate.';
    if (!tenor || parseInt(tenor, 10) < 1) return 'Enter the number of months.';
    if (!debitBranch || !debitBank) return 'Choose the branch and bank account the bank will debit.';
    let allocations = (Object.entries(alloc) as [string, Alloc][])
      .filter(([, a]) => parseFloat(a.amount) > 0)
      .map(([branchId, a]) => ({ branch: Number(branchId), amount: a.amount, bank_account: Number(a.bank) }));
    if (!allocations.length && forPreview) {
      allocations = [{ branch: Number(debitBranch), amount: principal, bank_account: Number(debitBank) }];
    }
    if (!allocations.length) return 'Share the money between at least one branch.';
    if (allocations.some((a) => !a.bank_account)) return 'Pick a bank account for every branch that receives money.';
    if (!forPreview && Math.abs(remaining) > 0.004) return `The branch amounts must add up to ${naira(principal)} (${naira(remaining)} left to place).`;
    return {
      lender_name: lender.trim(),
      reference: reference.trim(),
      principal,
      monthly_rate: rate,
      tenor_months: parseInt(tenor, 10),
      first_due_date: firstDue,
      debit_branch: Number(debitBranch),
      debit_bank_account: Number(debitBank),
      contribution_lead_days: leadDays === '' ? undefined : parseInt(leadDays, 10),
      notes,
      allocations,
    };
  };

  const handlePreview = async () => {
    setError(null);
    const input = buildInput(true);
    if (typeof input === 'string') return setError(input);
    try {
      setPreview(await previewBorrowing.mutateAsync(input));
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not build the schedule.'));
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const input = buildInput();
    if (typeof input === 'string') return setError(input);
    try {
      const created = await createBorrowing.mutateAsync(input);
      navigate(`/treasury/borrowings/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the borrowing.'));
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate('/treasury/borrowings')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-5 h-5" /> Back to Bank Borrowings
      </button>
      <h1 className="text-3xl font-bold text-gray-900">New Bank Borrowing</h1>
      <p className="text-gray-600 mt-1 mb-6">
        Record the loan terms and how the money is shared between branches. Each branch repays its own share of every
        instalment (principal and interest) to the branch the bank debits.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

        <section className="bg-white rounded-lg shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm font-medium text-gray-700">Lender *</span>
            <input className={field} value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. First Bank" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Reference</span>
            <input className={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Facility / loan number" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Amount borrowed (₦) *</span>
            <input className={field} inputMode="decimal" value={principal}
              onChange={(e) => MONEY.test(e.target.value) && (setPrincipal(e.target.value), setPreview(null))} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Interest per month (%) *</span>
            <input className={field} inputMode="decimal" value={rate}
              onChange={(e) => (setRate(e.target.value), setPreview(null))} placeholder="e.g. 3" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Number of monthly instalments *</span>
            <input className={field} type="number" min={1} value={tenor} onChange={(e) => (setTenor(e.target.value), setPreview(null))} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">First instalment date * <span className="text-gray-500 font-normal">(its day repeats monthly)</span></span>
            <input className={field} type="date" value={firstDue} onChange={(e) => (setFirstDue(e.target.value), setPreview(null))} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Branch the bank debits *</span>
            <select className={field} value={debitBranch}
              onChange={(e) => {
                const id = e.target.value ? Number(e.target.value) : '';
                setDebitBranch(id);
                setDebitBank(id ? accountsFor(id)[0]?.id ?? '' : '');
                setPreview(null);
              }}>
              <option value="">Select branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Bank account debited *</span>
            <select className={field} value={debitBank} disabled={!debitBranch}
              onChange={(e) => (setDebitBank(e.target.value ? Number(e.target.value) : ''), setPreview(null))}>
              <option value="">Select account…</option>
              {debitBranch !== '' && accountsFor(debitBranch).map((a) => (
                <option key={a.id} value={a.id}>{a.account_name} — {a.account_number}</option>
              ))}
            </select></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Branches send their share this many days before each instalment</span>
            <input className={field} type="number" min={0} max={60} value={leadDays}
              onChange={(e) => (setLeadDays(e.target.value), setPreview(null))} />
            <span className="text-xs text-gray-500">Suggested: 3. Use more days if transfers between your banks are slow.</span></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Notes</span>
            <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">How the money is shared</h2>
            <p className={`text-sm font-medium ${Math.abs(remaining) < 0.005 && allocated > 0 ? 'text-green-700' : 'text-amber-700'}`}>
              Placed {naira(allocated)} of {naira(principal || 0)} · {naira(remaining)} left
            </p>
          </div>
          <p className="text-sm text-gray-600 mb-3">
            Leave a branch blank if it gets nothing. The branch the bank debits can also keep part of the money.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-gray-600 bg-gray-50">
                <tr><th className="px-3 py-2">Branch</th><th className="px-3 py-2">Amount (₦)</th><th className="px-3 py-2">Share</th><th className="px-3 py-2">Bank account</th></tr>
              </thead>
              <tbody>
                {branches.map((b) => {
                  const a = alloc[b.id];
                  const pct = a && parseFloat(principal) > 0 ? ((parseFloat(a.amount) || 0) / parseFloat(principal)) * 100 : 0;
                  return (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{b.name}{b.id === debitBranch ? ' (pays the bank)' : ''}</td>
                      <td className="px-3 py-2">
                        <input className="w-44 px-2 py-1 border border-gray-300 rounded" inputMode="decimal" value={a?.amount ?? ''}
                          onChange={(e) => MONEY.test(e.target.value) && setAllocation(b.id, { amount: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">
                        <select className="px-2 py-1 border border-gray-300 rounded" value={a?.bank ?? accountsFor(b.id)[0]?.id ?? ''}
                          onChange={(e) => setAllocation(b.id, { bank: e.target.value ? Number(e.target.value) : '' })}>
                          {accountsFor(b.id).length === 0 && <option value="">No bank account</option>}
                          {accountsFor(b.id).map((x) => <option key={x.id} value={x.id}>{x.account_name} — {x.account_number}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex gap-3">
          <button type="button" onClick={handlePreview} disabled={previewBorrowing.isPending}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-800 hover:bg-gray-50 disabled:opacity-50">
            {previewBorrowing.isPending ? 'Calculating…' : 'Preview schedule'}
          </button>
          <button type="submit" disabled={createBorrowing.isPending}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {createBorrowing.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Save borrowing
          </button>
        </div>

        {preview && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Repayment schedule</h2>
            <p className="text-sm text-gray-600 mb-3">
              Total repayment {naira(preview.total_repayment)}, of which interest {naira(preview.total_interest)}.
              Branch shares are due {preview.contribution_lead_days} day(s) before each instalment.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-3 py-2">#</th><th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Payment</th><th className="px-3 py-2 text-right">Principal</th>
                    <th className="px-3 py-2 text-right">Interest</th><th className="px-3 py-2">Branch shares (send by)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.instalments.map((i) => (
                    <tr key={i.number} className="border-t align-top">
                      <td className="px-3 py-2">{i.number}</td>
                      <td className="px-3 py-2">{formatDay(i.due_date)}</td>
                      <td className="px-3 py-2 text-right">{naira(i.total_due)}</td>
                      <td className="px-3 py-2 text-right">{naira(i.principal_due)}</td>
                      <td className="px-3 py-2 text-right">{naira(i.interest_due)}</td>
                      <td className="px-3 py-2">
                        {i.contributions.length === 0 ? '—' : i.contributions.map((c) => (
                          <div key={c.branch_id}>{c.branch_name}: {naira(c.amount)} <span className="text-gray-500">by {formatDay(c.due_date)}</span></div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </form>
    </div>
  );
};

export default BorrowingFormPage;
