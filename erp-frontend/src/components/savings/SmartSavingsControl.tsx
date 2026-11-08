import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PiggyBank } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useEnrolSmartSavings, useSmartSavingsLimits, useToggleSmartSavings } from '../../hooks/useSavings';
import { useTreasurySettings } from '../../hooks/useBankBorrowings';

const naira = (v: string | number | null | undefined) =>
  `₦${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  accountId: number;
  accountNumber: string;
  clientName: string;
  /** Current savings balance of this account. */
  balance: string | number;
  /** True when the account is currently in an active Smart Savings cycle. */
  active: boolean;
  /** True when the account has been in Smart Savings before but is switched off. */
  wasEnrolled?: boolean;
  /** Active cycle has passed maturity but interest has not been credited yet. */
  matured?: boolean;
  /** Early-withdrawal penalty % if known. */
  penaltyRate?: string | null;
  compact?: boolean;
  /** Open the dialog straight away (no button), e.g. after picking an account from a search. */
  autoOpen?: boolean;
  /** Called whenever the dialog closes (cancelled or done). */
  onClosed?: () => void;
}

/**
 * Enrol: moves a chosen amount from THIS account (the source) into the client's
 * own Smart Savings account and starts a cycle there. Switch off: stops the cycle.
 */
export const SmartSavingsControl: React.FC<Props> = ({
  accountId, accountNumber, clientName, active, wasEnrolled, matured, penaltyRate, compact, autoOpen, onClosed,
}) => {
  const [open, setOpen] = useState(!!autoOpen);
  const [amount, setAmount] = useState('');
  const close = () => { setOpen(false); setAmount(''); onClosed?.(); };
  const toggle = useToggleSmartSavings();
  const enrol = useEnrolSmartSavings();
  const limits = useSmartSavingsLimits(accountId, open && !active);
  const { data: settings } = useTreasurySettings();
  const notice = settings?.smart_savings_notice_days ?? 14;

  const lim = limits.data;
  const max = Number(lim?.max_movable ?? 0);
  const value = Number(amount.replace(/,/g, ''));
  const tooMuch = value > max;
  const canEnrol = !active && !!lim && !lim.blocked_reason && value > 0 && !tooMuch;
  const busy = toggle.isPending || enrol.isPending;

  const submit = async () => {
    try {
      if (active) {
        await toggle.mutateAsync({ accountId, action: 'deactivate' });
        toast.success('Smart Savings switched off.');
      } else {
        const res = await enrol.mutateAsync({ accountId, amount: value.toFixed(2) });
        toast.success(`${naira(value)} moved to Smart Savings account ${res.smart_account_number}.`);
      }
      close();
    } catch (e) {
      const err = e as { message?: string; details?: { detail?: string } };
      toast.error(err?.details?.detail || err?.message || 'That did not go through.');
    }
  };

  const button = active
    ? 'border border-red-300 text-red-700 hover:bg-red-50'
    : 'bg-emerald-600 hover:bg-emerald-700 text-white';

  return (
    <>
      {!autoOpen && <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 rounded-lg px-3 ${compact ? 'py-1 text-xs' : 'py-2 text-sm'} font-medium ${button}`}
      >
        {!compact && <PiggyBank size={14} />}
        {active ? 'Switch off' : wasEnrolled ? 'Re-enrol' : 'Enrol in Smart Savings'}
      </button>}

      <Modal open={open} onClose={close} title={active ? 'Switch off Smart Savings?' : 'Move money into Smart Savings'}>
        <div className="space-y-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{clientName} · {accountNumber}</p>
          {active ? (
            <ul className="list-disc list-inside space-y-1">
              <li>The cycle stops and no more Smart Savings interest is paid.</li>
              <li>The money stays in this account and can be withdrawn without the penalty or the {notice}-day notice.</li>
              {matured && (
                <li className="text-red-700 font-medium">
                  This cycle has matured but its interest has not been credited yet. Switching off now means the client loses it.
                </li>
              )}
            </ul>
          ) : limits.isLoading ? (
            <div className="flex items-center gap-2 text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Checking what can move…</div>
          ) : limits.error || !lim ? (
            <p className="text-red-700">Could not work out how much can move from this account.</p>
          ) : lim.blocked_reason ? (
            <p className="text-red-700">{lim.blocked_reason}</p>
          ) : (
            <>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1">
                <Row label="Balance in this account" value={naira(lim.balance)} />
                <Row label="Compulsory savings (stays)" value={naira(lim.minimum_balance)} />
                {Number(lim.loan_outstanding) > 0 && (
                  <Row label={`10% of loan debt ${naira(lim.loan_outstanding)} (stays)`} value={naira(lim.loan_cover_required)} />
                )}
                {Number(lim.holds) > 0 && <Row label="On hold" value={naira(lim.holds)} />}
                {Number(lim.open_withdrawals) > 0 && <Row label="Open withdrawal requests" value={naira(lim.open_withdrawals)} />}
                {lim.max_transaction_amount && <Row label="Product's largest single transaction" value={naira(lim.max_transaction_amount)} />}
                <div className="border-t pt-1 mt-1">
                  <Row label="Most that can move" value={naira(lim.max_movable)} strong />
                </div>
              </div>

              <label className="block">
                <span className="text-gray-600">Amount to move into Smart Savings</span>
                <div className="mt-1 flex gap-2">
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                    placeholder="0.00"
                    className={`flex-1 rounded-lg border px-3 py-2 ${tooMuch ? 'border-red-400' : 'border-gray-300'}`}
                  />
                  <button type="button" onClick={() => setAmount(max.toFixed(2))} disabled={max <= 0}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-xs disabled:opacity-40">Max</button>
                </div>
                {tooMuch && <span className="mt-1 block text-xs text-red-700">More than {naira(max)} cannot leave this account.</span>}
              </label>

              <ul className="list-disc list-inside space-y-1">
                <li>The amount moves today into the client&apos;s Smart Savings account (opened automatically if they don&apos;t have one).</li>
                <li>A 3-month cycle starts today. At maturity the client earns 6% {value > 0 && !tooMuch ? <>(about <strong>{naira(value * 0.06)}</strong>)</> : null}, then the next cycle starts.</li>
                <li>Withdrawing before maturity may cost a penalty{penaltyRate ? ` (${penaltyRate}% of the balance)` : ' set on the Smart Savings product'}, and payouts need {notice} days&apos; notice.</li>
              </ul>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded-lg border border-gray-300">Cancel</button>
            <button type="button" onClick={submit} disabled={busy || (!active && !canEnrol)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white disabled:opacity-50`}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {active ? 'Switch off' : 'Move & enrol'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

const Row: React.FC<{ label: string; value: string; strong?: boolean }> = ({ label, value, strong }) => (
  <div className={`flex justify-between gap-3 ${strong ? 'font-semibold text-gray-900' : ''}`}>
    <span>{label}</span>
    <span className="whitespace-nowrap">{value}</span>
  </div>
);

export default SmartSavingsControl;
