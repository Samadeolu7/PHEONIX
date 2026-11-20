import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Loader2 } from 'lucide-react';
import { useBranchOptions } from '../../hooks/useBranches';
import { useDebounce } from '../../hooks/useDebounce';
import {
  useBankAccountChoices,
  useBorrowing,
  useBorrowingQuote,
  useCreateBorrowing,
  usePreviewBorrowing,
  useUpdateBorrowing,
} from '../../hooks/useBankBorrowings';
import type {
  Borrowing,
  BorrowingInput,
  BorrowingPreview,
  BorrowingQuoteInput,
  BorrowingQuoteOption,
  InterestMethod,
} from '../../types/bankBorrowing';
import { addMonthsIso, apiErrorMessage, daysBetween, formatDay, frequencyLabel, naira, todayIso } from './treasuryFormat';

const MONEY = /^\d{0,16}(?:\.\d{0,2})?$/;
type Alloc = { amount: string; bank: number | '' };
const field = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';

/** Repayment frequency choices; 'end' = one payment when the term ends. */
const FREQUENCIES: { value: string; label: string }[] = [
  { value: '1', label: 'Every month' },
  { value: '3', label: 'Every 3 months (quarterly)' },
  { value: '6', label: 'Every 6 months' },
  { value: '12', label: 'Every 12 months (yearly)' },
  { value: 'end', label: 'One payment at the end of the term' },
];

const METHOD_HELP: Record<InterestMethod, string> = {
  reducing: 'Interest on what is still owed; equal payments (like the First Bank table).',
  flat: 'Interest on the full amount for every month of the term, spread evenly.',
  interest_only: 'Each payment is interest only; the full amount is repaid with the last payment.',
};
const METHOD_TITLE: Record<InterestMethod, string> = {
  reducing: 'Reducing balance',
  flat: 'Flat',
  interest_only: 'Interest only',
};

/** "₦516,666.67 × 12" or "₦100,000.00 × 11, then ₦5,100,000.00". */
function paymentsText(o: BorrowingQuoteOption): string {
  const n = o.number_of_payments ?? 0;
  const first = Number(o.first_payment);
  const last = Number(o.last_payment);
  if (n <= 1) return `${naira(last)} once`;
  if (Math.abs(first - last) < 1) return `${naira(first)} × ${n}`;
  return `${naira(first)} × ${n - 1}, then ${naira(last)}`;
}

/** Months between payments for a frequency choice ('end' = the whole term). */
const intervalFor = (frequency: string, tenorMonths: number) => (frequency === 'end' ? tenorMonths : Number(frequency));

const BorrowingFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const editId = id ? Number(id) : null;
  const { data: existing, isLoading, error } = useBorrowing(editId ?? 0, editId !== null);

  if (editId === null) return <BorrowingForm />;
  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error || !existing) return <div className="p-6 text-red-600">Could not load this borrowing.</div>;
  if (!existing.editable) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button onClick={() => navigate(`/treasury/borrowings/${editId}`)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-5 h-5" /> Back to the borrowing
        </button>
        <div className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-lg">
          This borrowing can no longer be edited: an instalment or branch share has already been recorded (or it is paid off).
          Ask accounts to correct it by journal.
        </div>
      </div>
    );
  }
  return <BorrowingForm key={existing.id} initial={existing} />;
};

/** The form itself. `initial` = editing a saved borrowing (its values seed the fields). */
const BorrowingForm: React.FC<{ initial?: Borrowing }> = ({ initial }) => {
  const navigate = useNavigate();
  const editId = initial ? initial.id : null;
  const { data: branches = [], isError: branchesFailed } = useBranchOptions();
  // All branches' accounts at once (the normal bank-account list follows the branch switcher).
  const { data: bankAccounts = [] } = useBankAccountChoices();
  const createBorrowing = useCreateBorrowing();
  const updateBorrowing = useUpdateBorrowing();
  const previewBorrowing = usePreviewBorrowing();

  const [lender, setLender] = useState(initial?.lender_name ?? '');
  const [reference, setReference] = useState(initial?.reference ?? '');
  const [principal, setPrincipal] = useState(initial ? String(Number(initial.principal)) : '');
  const [rate, setRate] = useState(initial ? String(Number(initial.monthly_rate)) : '');
  // No default: banks differ, and a wrong guess silently changes the interest owed.
  const [method, setMethod] = useState<InterestMethod | ''>(initial?.interest_method ?? '');
  const [tenor, setTenor] = useState(initial ? String(initial.tenor_months) : '12');
  const [frequency, setFrequency] = useState(() => {
    if (!initial) return '1';
    return initial.repayment_interval_months >= initial.tenor_months ? 'end' : String(initial.repayment_interval_months);
  });
  // The bank normally takes the first payment one repayment period after paying the loan out, so default to that
  // and keep it in step with the frequency until the user types their own date.
  const startIso = initial?.received_on ?? todayIso();
  const [firstDue, setFirstDue] = useState(initial?.first_due_date ?? addMonthsIso(todayIso(), 1));
  const [firstDueTouched, setFirstDueTouched] = useState(!!initial);
  const [debitBranch, setDebitBranch] = useState<number | ''>(initial?.debit_branch ?? '');
  const [debitBank, setDebitBank] = useState<number | ''>(initial?.debit_bank_account ?? '');
  const [leadDays, setLeadDays] = useState(initial ? String(initial.contribution_lead_days) : '3');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  // branch id -> { amount, bank account id }
  const [alloc, setAlloc] = useState<Record<number, Alloc>>(() =>
    initial
      ? Object.fromEntries(initial.allocations.map((a) => [a.branch, { amount: String(Number(a.amount)), bank: a.bank_account }]))
      : {}
  );
  const [preview, setPreview] = useState<BorrowingPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Once the money has been received only the repayment terms can change. */
  const termsOnly = initial?.edit_scope === 'terms';
  const tenorNum = parseInt(tenor, 10) || 0;
  const interval = intervalFor(frequency, tenorNum);
  const startLabel = initial?.received_on ? `the funds arrived (${formatDay(startIso)})` : 'today';
  const expectedFirstDue = interval > 0 ? addMonthsIso(startIso, interval) : null;
  const firstDueTooEarly = !!firstDue && firstDue <= startIso;
  const firstDueSoon = !firstDueTooEarly && !!expectedFirstDue && !!firstDue && daysBetween(firstDue, expectedFirstDue) > 7;
  const frequencyFits = tenorNum > 0 && interval > 0 && interval <= tenorNum && tenorNum % interval === 0;

  // Live comparison of every interest method on the current terms.
  // Debounced as a string: a fresh object every render would keep restarting the debounce timer.
  const quoteReady = parseFloat(principal) > 0 && rate !== '' && parseFloat(rate) >= 0 && frequencyFits;
  const quoteInput: BorrowingQuoteInput | null = quoteReady
    ? { principal, monthly_rate: rate, tenor_months: tenorNum, repayment_interval_months: interval }
    : null;
  const debouncedQuoteKey = useDebounce(quoteInput ? JSON.stringify(quoteInput) : '', 350);
  const { data: quote, isFetching: quoting, isError: quoteFailed } = useBorrowingQuote(
    debouncedQuoteKey ? (JSON.parse(debouncedQuoteKey) as BorrowingQuoteInput) : null
  );
  const chosen = quoteInput && quote?.find((o) => o.method === method && !o.error);

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
    if (!tenor || tenorNum < 1) return 'Enter how many months the loan runs.';
    if (!frequencyFits) return `A ${tenorNum}-month loan cannot be repaid every ${interval} months. Pick a frequency that divides the term evenly.`;
    if (!method) return 'Choose how the bank charges interest.';
    if (firstDueTooEarly) return `The first payment date must be after ${startLabel}.`;
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
      interest_method: method,
      tenor_months: tenorNum,
      repayment_interval_months: interval,
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
    if (termsOnly && !window.confirm(
      'The funds have already been received. Saving rebuilds the repayment schedule and every branch\'s share from the new terms. Continue?'
    )) return;
    try {
      const saved = editId !== null
        ? await updateBorrowing.mutateAsync({ id: editId, data: input })
        : await createBorrowing.mutateAsync(input);
      navigate(`/treasury/borrowings/${saved.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not save the borrowing.'));
    }
  };

  const clearPreview = () => setPreview(null);

  /** Re-default the first payment date to one period after the start, unless the user picked a date. */
  const syncFirstDue = (nextFrequency: string, nextTenor: number) => {
    const step = intervalFor(nextFrequency, nextTenor);
    if (!firstDueTouched && step > 0) setFirstDue(addMonthsIso(startIso, step));
  };
  const saving = createBorrowing.isPending || updateBorrowing.isPending;
  const backTo = editId !== null ? `/treasury/borrowings/${editId}` : '/treasury/borrowings';

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <button onClick={() => navigate(backTo)} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
        <ArrowLeft className="w-5 h-5" /> {editId !== null ? 'Back to the borrowing' : 'Back to Bank Borrowings'}
      </button>
      <h1 className="text-3xl font-bold text-gray-900">{editId !== null ? 'Edit Bank Borrowing' : 'New Bank Borrowing'}</h1>
      <p className="text-gray-600 mt-1 mb-6">
        Record the loan terms and how the money is shared between branches. Each branch repays its own share of every
        instalment (principal and interest) to the branch the bank debits.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        {termsOnly && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 px-4 py-3 rounded-lg text-sm">
            The funds have already been received and shared out, so the amount, branches and bank accounts are fixed.
            You can still correct the rate, interest method, term, repayment frequency and dates until the first
            instalment or branch share is recorded.
          </div>
        )}
        {branchesFailed && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">Could not load your branches. Refresh the page before saving.</div>}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">{error}</div>}

        <section className="bg-white rounded-lg shadow p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block"><span className="text-sm font-medium text-gray-700">Lender *</span>
            <input className={field} value={lender} onChange={(e) => setLender(e.target.value)} placeholder="e.g. First Bank" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Reference</span>
            <input className={field} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Facility / loan number" /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Amount borrowed (₦) *</span>
            <input className={field} inputMode="decimal" value={principal} disabled={termsOnly}
              onChange={(e) => MONEY.test(e.target.value) && (setPrincipal(e.target.value), clearPreview())} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Interest per month (%) *</span>
            <input className={field} inputMode="decimal" value={rate}
              onChange={(e) => (setRate(e.target.value), clearPreview())} placeholder="e.g. 3" />
            <span className="text-xs text-gray-500">If the bank quotes a yearly rate, divide it by 12.</span></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Loan term (months) *</span>
            <input className={field} type="number" min={1} value={tenor}
              onChange={(e) => (setTenor(e.target.value), syncFirstDue(frequency, parseInt(e.target.value, 10) || 0), clearPreview())} /></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">How often the bank is repaid *</span>
            <select className={field} value={frequency}
              onChange={(e) => (setFrequency(e.target.value), syncFirstDue(e.target.value, tenorNum), clearPreview())}>
              {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              {!FREQUENCIES.some((f) => f.value === frequency) && <option value={frequency}>Every {frequency} months</option>}
            </select>
            {!frequencyFits && tenorNum > 0 && (
              <span className="text-xs text-red-600">A {tenorNum}-month term doesn&apos;t divide into payments every {interval} months.</span>
            )}</label>
          <label className="block"><span className="text-sm font-medium text-gray-700">First payment date * <span className="text-gray-500 font-normal">(its day repeats each period)</span></span>
            <input className={field} type="date" value={firstDue}
              onChange={(e) => (setFirstDue(e.target.value), setFirstDueTouched(true), clearPreview())} />
            {firstDueTooEarly ? (
              <span className="text-xs text-red-600">
                The first payment can&apos;t be on or before {startLabel}: the bank charges a full period&apos;s interest on it.
                Use the date in the offer letter.
              </span>
            ) : firstDueSoon ? (
              <span className="text-xs text-amber-700">
                Only {daysBetween(startIso, firstDue)} days after {startLabel}, but each payment carries {interval} month(s) of
                interest. Banks normally take the first payment one period after paying out (about {formatDay(expectedFirstDue)}).
                Check the offer letter.
              </span>
            ) : (
              <span className="text-xs text-gray-500">Normally one repayment period after the bank pays out. Check the offer letter.</span>
            )}</label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Branch the bank debits *</span>
            <select className={field} value={debitBranch} disabled={termsOnly}
              onChange={(e) => {
                const bid = e.target.value ? Number(e.target.value) : '';
                setDebitBranch(bid);
                setDebitBank(bid ? accountsFor(bid)[0]?.id ?? '' : '');
                clearPreview();
              }}>
              <option value="">Select branch…</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Bank account debited *</span>
            <select className={field} value={debitBank} disabled={!debitBranch || termsOnly}
              onChange={(e) => (setDebitBank(e.target.value ? Number(e.target.value) : ''), clearPreview())}>
              <option value="">Select account…</option>
              {debitBranch !== '' && accountsFor(debitBranch).map((a) => (
                <option key={a.id} value={a.id}>{a.account_name} — {a.account_number}</option>
              ))}
            </select></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Branches send their share this many days before each payment</span>
            <input className={field} type="number" min={0} max={60} value={leadDays}
              onChange={(e) => (setLeadDays(e.target.value), clearPreview())} />
            <span className="text-xs text-gray-500">Suggested: 3. Use more days if transfers between your banks are slow.</span></label>
          <label className="block"><span className="text-sm font-medium text-gray-700">Notes</span>
            <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-lg font-semibold text-gray-900">How the bank charges interest *</h2>
            {quoting && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Pick the one that matches the bank&apos;s offer letter. The figures update as you change the terms above.
          </p>
          {!quoteInput ? (
            <p className="text-sm text-gray-500">Enter the amount, monthly rate, term and frequency to compare the options.</p>
          ) : quoteFailed && !quote ? (
            <p className="text-sm text-red-600">Could not work out the figures. Check the terms above.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(quote ?? []).map((o) => {
                const selected = method === o.method;
                return (
                  <button key={o.method} type="button" disabled={!!o.error}
                    onClick={() => (setMethod(o.method), clearPreview())}
                    className={`text-left rounded-lg border-2 p-4 transition ${selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-400'} disabled:opacity-50 disabled:hover:border-gray-200`}>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-gray-900">{METHOD_TITLE[o.method]}</span>
                      {selected && <Check className="w-5 h-5 text-blue-600" />}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 mb-3">{METHOD_HELP[o.method]}</p>
                    {o.error ? (
                      <p className="text-sm text-red-600">{o.error}</p>
                    ) : (
                      <dl className="text-sm space-y-1">
                        <div className="flex justify-between gap-2"><dt className="text-gray-600">Payments</dt><dd className="font-medium text-right">{paymentsText(o)}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-gray-600">Total interest</dt><dd className="font-medium">{naira(o.total_interest)}</dd></div>
                        <div className="flex justify-between gap-2"><dt className="text-gray-600">Total repaid</dt><dd className="font-medium">{naira(o.total_repayment)}</dd></div>
                      </dl>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {chosen && (
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-800">
              Paying {frequencyLabel(interval, tenorNum)} over {tenorNum} months: {paymentsText(chosen)}.
              The bank is repaid <strong>{naira(chosen.total_repayment)}</strong> in total, of which{' '}
              <strong>{naira(chosen.total_interest)}</strong> is interest.
            </div>
          )}
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
                        <input className="w-44 px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100" inputMode="decimal" value={a?.amount ?? ''}
                          disabled={termsOnly}
                          onChange={(e) => MONEY.test(e.target.value) && setAllocation(b.id, { amount: e.target.value })} />
                      </td>
                      <td className="px-3 py-2">{pct > 0 ? `${pct.toFixed(1)}%` : '—'}</td>
                      <td className="px-3 py-2">
                        <select className="px-2 py-1 border border-gray-300 rounded disabled:bg-gray-100" value={a?.bank ?? accountsFor(b.id)[0]?.id ?? ''}
                          disabled={termsOnly}
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
            {previewBorrowing.isPending ? 'Calculating…' : 'Preview full schedule'}
          </button>
          <button type="submit" disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {editId !== null ? 'Save changes' : 'Save borrowing'}
          </button>
        </div>

        {preview && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Repayment schedule</h2>
            <p className="text-sm text-gray-600 mb-3">
              Total repayment {naira(preview.total_repayment)}, of which interest {naira(preview.total_interest)}.
              Branch shares are due {preview.contribution_lead_days} day(s) before each payment.
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
