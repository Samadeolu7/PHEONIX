import React, { useCallback, useEffect, useState } from 'react';
import { BRAND } from '../../constants/brand';
import {
  MyAccounts,
  SavingsSummary,
  WithdrawalRequest,
  naira,
  portalApi,
  toApiError,
} from '../api';
import { Button, Card, Field, Notice, SelectField } from '../ui';

const fmtDate = (d: string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';

const W_STYLES: Record<string, string> = {
  submitted: 'bg-blue-100 text-blue-800',
  processing: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-700',
};

function WithdrawForm({
  acct,
  onDone,
  onCancel,
}: {
  acct: SavingsSummary;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [payout, setPayout] = useState<'bank' | 'cash'>('bank');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setMessage('');
    const n = Number(amount);
    if (!(n > 0)) return setErrors({ amount: 'Enter an amount.' });
    if (n > acct.withdrawable)
      return setErrors({ amount: `You can withdraw up to ${naira(acct.withdrawable)}.` });
    setBusy(true);
    try {
      await portalApi.requestWithdrawal({
        savings_account: acct.id,
        amount,
        payout_preference: payout,
        reason,
      });
      onDone();
    } catch (err) {
      const e2 = toApiError(err);
      setErrors(e2.fields);
      setMessage(e2.fields.amount ? '' : e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 border-t pt-4">
      {message && <Notice kind="error">{message}</Notice>}
      <Field
        label={`Amount (up to ${naira(acct.withdrawable)})`}
        name="amount"
        inputMode="numeric"
        value={amount}
        onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
        error={errors.amount}
      />
      <SelectField
        label="How would you like to receive it?"
        name="payout_preference"
        value={payout}
        onChange={e => setPayout(e.target.value as 'bank' | 'cash')}
        options={[
          { value: 'bank', label: 'Transfer to my bank account on file' },
          { value: 'cash', label: 'Collect cash at my branch' },
        ]}
      />
      <Field
        label="Reason (optional)"
        name="reason"
        maxLength={500}
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      <p className="text-xs text-gray-500 mb-4">
        Your request goes to your account officer for approval. Some accounts have a notice period
        before payout. We will never ask you to pay a fee to release your money.
      </p>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>
          Send request
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function AccountsPage() {
  const [data, setData] = useState<MyAccounts | null>(null);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openFor, setOpenFor] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, w] = await Promise.all([portalApi.accounts(), portalApi.withdrawals()]);
      setData(a);
      setRequests(w);
    } catch (e) {
      setError(toApiError(e).message);
    }
  }, []);

  // Fetch on mount; state is only set after the request resolves.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  if (!data.linked) {
    return (
      <Card>
        <h1 className="text-xl font-semibold mb-2" style={{ color: BRAND.colors.textPrimary }}>
          My accounts
        </h1>
        <p className="text-sm text-gray-600">
          Your online account isn&apos;t linked to your client record yet, so we can&apos;t show
          balances here. Ask your branch to send you an invitation from your client record, or this
          will happen automatically once a loan application of yours is accepted.
        </p>
      </Card>
    );
  }

  const waitingOn = new Set(
    requests.filter(r => r.status === 'submitted').map(r => r.account_number)
  );

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6" style={{ color: BRAND.colors.textPrimary }}>
        My accounts
      </h1>
      {notice && <Notice kind="success">{notice}</Notice>}

      <h2 className="text-lg font-semibold mb-3">Savings</h2>
      {data.savings.length === 0 && (
        <Card className="mb-6">
          <p className="text-sm text-gray-600">No savings accounts.</p>
        </Card>
      )}
      <div className="grid gap-4 sm:grid-cols-2 mb-8">
        {data.savings.map(s => (
          <Card key={s.id}>
            <div className="flex justify-between gap-2">
              <div>
                <div className="font-medium">{s.nickname || s.product}</div>
                <div className="text-xs text-gray-500">{s.account_number}</div>
              </div>
              {s.status !== 'active' && (
                <span className="text-xs text-amber-700 capitalize">{s.status}</span>
              )}
            </div>
            <div className="mt-3 text-2xl font-semibold">{naira(s.balance)}</div>
            <dl className="mt-2 text-xs text-gray-600 grid grid-cols-2 gap-y-1">
              <dt>Available to withdraw</dt>
              <dd className="text-right">{naira(s.withdrawable)}</dd>
              {s.minimum_balance > 0 && (
                <>
                  <dt>Minimum balance kept</dt>
                  <dd className="text-right">{naira(s.minimum_balance)}</dd>
                </>
              )}
              <dt>Last activity</dt>
              <dd className="text-right">{fmtDate(s.last_transaction_date)}</dd>
            </dl>
            {openFor === s.id ? (
              <WithdrawForm
                acct={s}
                onCancel={() => setOpenFor(null)}
                onDone={() => {
                  setOpenFor(null);
                  setNotice('Withdrawal request sent. You can follow it below.');
                  load();
                }}
              />
            ) : (
              <div className="mt-4">
                {waitingOn.has(s.account_number) ? (
                  <p className="text-xs text-gray-500">
                    A withdrawal request on this account is waiting for your officer.
                  </p>
                ) : s.can_withdraw ? (
                  <Button variant="secondary" onClick={() => setOpenFor(s.id)}>
                    Request a withdrawal
                  </Button>
                ) : null}
              </div>
            )}
          </Card>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-3">Loans</h2>
      {data.loans.length === 0 && (
        <Card className="mb-6">
          <p className="text-sm text-gray-600">No loans.</p>
        </Card>
      )}
      <div className="space-y-3 mb-8">
        {data.loans.map(l => (
          <Card key={l.loan_number}>
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-medium">{l.product}</div>
                <div className="text-xs text-gray-500">{l.loan_number}</div>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 h-fit">
                {l.status_display}
              </span>
            </div>
            <dl className="mt-3 text-sm grid grid-cols-2 sm:grid-cols-4 gap-y-2 gap-x-4">
              <div>
                <dt className="text-xs text-gray-500">Loan amount</dt>
                <dd>{naira(l.amount)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Outstanding</dt>
                <dd className="font-semibold">{naira(l.outstanding)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Paid so far</dt>
                <dd>{naira(l.total_paid)}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Next payment</dt>
                <dd>
                  {l.next_due_date
                    ? `${naira(l.next_due_amount)} on ${fmtDate(l.next_due_date)}`
                    : '—'}
                </dd>
              </div>
            </dl>
            {l.days_in_arrears > 0 && (
              <p className="mt-3 text-sm text-red-700">
                {naira(l.arrears_amount)} is overdue ({l.days_in_arrears} day
                {l.days_in_arrears === 1 ? '' : 's'}). Please contact your branch.
              </p>
            )}
          </Card>
        ))}
      </div>

      {requests.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-3">Withdrawal requests</h2>
          <div className="space-y-2">
            {requests.map(r => (
              <Card key={r.reference}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {naira(r.amount)} from {r.account_number}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.reference} · {r.payout_preference_display} · {fmtDate(r.submitted_at)}
                    </div>
                  </div>
                  <span
                    className={`text-xs px-2.5 py-0.5 rounded-full ${W_STYLES[r.status] || 'bg-gray-100'}`}
                  >
                    {r.status_display}
                  </span>
                </div>
                {r.customer_message && (
                  <p className="mt-2 text-sm text-gray-700">{r.customer_message}</p>
                )}
                {r.can_cancel && (
                  <button
                    type="button"
                    className="mt-2 text-xs text-red-700 underline"
                    onClick={async () => {
                      if (!window.confirm('Cancel this withdrawal request?')) return;
                      try {
                        await portalApi.cancelWithdrawal(r.reference);
                        load();
                      } catch (e) {
                        setError(toApiError(e).message);
                      }
                    }}
                  >
                    Cancel request
                  </button>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </>
  );
}
