import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Loader2 } from 'lucide-react';
import {
  useBorrowing,
  useDeleteBorrowing,
  useReceiveBorrowing,
  useRecordInstalment,
  useSendContribution,
} from '../../hooks/useBankBorrowings';
import { STATUS_LABELS, STATUS_STYLES, apiErrorMessage, formatDay, isPast, naira, todayIso } from './treasuryFormat';

const Badge: React.FC<{ status: string }> = ({ status }) => (
  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
    {STATUS_LABELS[status] ?? status}
  </span>
);

const BorrowingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const borrowingId = Number(id);
  const { data: b, isLoading, error } = useBorrowing(borrowingId);
  const receive = useReceiveBorrowing();
  const sendShare = useSendContribution();
  const recordInstalment = useRecordInstalment();
  const deleteBorrowing = useDeleteBorrowing();
  const [receivedOn, setReceivedOn] = useState(todayIso());
  // Date the money actually moved, for shares/instalments recorded a day or two late.
  const [postingDate, setPostingDate] = useState(todayIso());

  const run = async (action: Promise<unknown>, success: string) => {
    try {
      await action;
      toast.success(success);
    } catch (e) {
      toast.error(apiErrorMessage(e, 'That did not go through.'));
    }
  };

  if (isLoading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (error || !b) return <div className="p-6 text-red-600">Could not load this borrowing.</div>;

  const nextPending = b.instalments.find((i) => i.status === 'pending');
  const totalInterest = b.instalments.reduce((s, i) => s + Number(i.interest_due), 0);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <button onClick={() => navigate('/treasury/borrowings')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-3">
          <ArrowLeft className="w-5 h-5" /> Back to Bank Borrowings
        </button>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold text-gray-900">{b.lender_name}{b.reference ? ` · ${b.reference}` : ''}</h1>
          <Badge status={b.status} />
        </div>
        <p className="text-gray-600 mt-1">
          {naira(b.principal)} at {Number(b.monthly_rate)}% a month over {b.tenor_months} months · total interest {naira(totalInterest)} ·
          debited from {b.debit_branch_name} ({b.debit_bank_account_name})
        </p>
      </div>

      {b.status === 'draft' && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-64">
            <p className="font-semibold text-amber-900">Waiting for the bank to pay out</p>
            <p className="text-sm text-amber-800">
              When the money lands in {b.debit_bank_account_name}, confirm it here. The system records the receipt and
              moves each branch&apos;s share to its bank account.
            </p>
          </div>
          <label className="text-sm">Date received
            <input type="date" max={todayIso()} className="block mt-1 px-3 py-2 border border-gray-300 rounded-lg" value={receivedOn} onChange={(e) => setReceivedOn(e.target.value)} />
          </label>
          <button type="button" disabled={receive.isPending}
            onClick={() => window.confirm(`Confirm ${naira(b.principal)} has been received and distribute it to the branches?`) &&
              run(receive.mutateAsync({ id: b.id, receivedOn }), 'Funds recorded and distributed to the branches.')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50">
            {receive.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Funds received
          </button>
          <button type="button" disabled={deleteBorrowing.isPending}
            onClick={async () => {
              if (!window.confirm('Delete this borrowing? Nothing has been posted yet, so this cannot affect the books.')) return;
              try {
                await deleteBorrowing.mutateAsync(b.id);
                toast.success('Borrowing deleted.');
                navigate('/treasury/borrowings');
              } catch (e) {
                toast.error(apiErrorMessage(e, 'Could not delete the borrowing.'));
              }
            }}
            className="px-4 py-2 rounded-lg border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50">
            Delete draft
          </button>
        </div>
      )}

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Branch shares of the money</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr><th className="px-3 py-2">Branch</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Share</th><th className="px-3 py-2">Bank account</th></tr>
          </thead>
          <tbody>
            {b.allocations.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="px-3 py-2 font-medium">{a.branch_name}{a.branch === b.debit_branch ? ' (pays the bank)' : ''}</td>
                <td className="px-3 py-2 text-right">{naira(a.amount)}</td>
                <td className="px-3 py-2 text-right">{(a.share * 100).toFixed(1)}%</td>
                <td className="px-3 py-2">{a.bank_account_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Repayment schedule</h2>
        <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
          <p className="text-sm text-gray-600">
            Each branch sends its share to {b.debit_branch_name} {b.contribution_lead_days} day(s) before the bank&apos;s date.
            Record the instalment once the bank has debited it.
          </p>
          {b.status === 'active' && (
            <label className="text-sm text-gray-700">
              Posting date for actions below
              <input type="date" max={todayIso()} min={b.received_on ?? undefined} value={postingDate}
                onChange={(e) => setPostingDate(e.target.value)}
                className="block mt-1 px-3 py-1.5 border border-gray-300 rounded-lg" />
            </label>
          )}
        </div>
        <div className="space-y-3">
          {b.instalments.map((i) => {
            const overdue = i.status === 'pending' && isPast(i.due_date);
            return (
              <div key={i.id} className={`rounded-lg border p-4 ${overdue ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      Instalment {i.number} of {b.tenor_months} · due {formatDay(i.due_date)} {overdue && <span className="text-red-700">(overdue)</span>}
                    </p>
                    <p className="text-sm text-gray-600">
                      {naira(i.total_due)} = principal {naira(i.principal_due)} + interest {naira(i.interest_due)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge status={i.status} />
                    {b.status === 'active' && i.status === 'pending' && (
                      <button type="button" disabled={recordInstalment.isPending || nextPending?.id !== i.id}
                        title={nextPending?.id !== i.id ? 'Record the earlier instalments first' : undefined}
                        onClick={() => {
                          const unsent = i.contributions.filter((c) => c.status === 'pending');
                          const warning = unsent.length
                            ? `

Note: ${unsent.map((c) => c.branch_name).join(', ')} ha${unsent.length === 1 ? 's' : 've'} not sent ${unsent.length === 1 ? 'its share' : 'their shares'} yet.`
                            : '';
                          if (window.confirm(`Record that the bank debited ${naira(i.total_due)} from ${b.debit_branch_name} on ${formatDay(postingDate)}?${warning}`)) {
                            run(recordInstalment.mutateAsync({ id: i.id, paidOn: postingDate }), `Instalment ${i.number} recorded.`);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-40">
                        Record instalment
                      </button>
                    )}
                  </div>
                </div>
                {i.contributions.length > 0 && (
                  <table className="mt-3 min-w-full text-sm">
                    <thead className="text-left text-gray-500">
                      <tr><th className="py-1 pr-3">Branch share</th><th className="py-1 pr-3 text-right">Amount</th><th className="py-1 pr-3">Send by</th><th className="py-1 pr-3">Status</th><th /></tr>
                    </thead>
                    <tbody>
                      {i.contributions.map((c) => {
                        const late = c.status === 'pending' && isPast(c.due_date);
                        return (
                          <tr key={c.id} className="border-t border-gray-100">
                            <td className="py-1.5 pr-3">{c.branch_name}</td>
                            <td className="py-1.5 pr-3 text-right">{naira(c.amount)}</td>
                            <td className={`py-1.5 pr-3 ${late ? 'text-red-700 font-medium' : ''}`}>{formatDay(c.due_date)}{late ? ' (late)' : ''}</td>
                            <td className="py-1.5 pr-3"><Badge status={c.status} /></td>
                            <td className="py-1.5 text-right">
                              {b.status === 'active' && c.status === 'pending' && (
                                <button type="button" disabled={sendShare.isPending}
                                  onClick={() => window.confirm(`Move ${naira(c.amount)} from ${c.branch_name} to ${b.debit_branch_name} on ${formatDay(postingDate)}?`) &&
                                    run(sendShare.mutateAsync({ id: c.id, sentOn: postingDate }), `${c.branch_name} share sent.`)}
                                  className="px-3 py-1 rounded-lg border border-blue-300 text-blue-700 text-sm hover:bg-blue-50 disabled:opacity-40">
                                  Send share
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default BorrowingDetailPage;
