import React, { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, PiggyBank } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { useToggleSmartSavings } from '../../hooks/useSavings';
import { useTreasurySettings } from '../../hooks/useBankBorrowings';

const naira = (v: string | number | null | undefined) =>
  `₦${Number(v ?? 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Props {
  accountId: number;
  accountNumber: string;
  clientName: string;
  /** Current savings balance (becomes the opening balance when enrolling). */
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
  /** Open the confirmation straight away (no button), e.g. after picking an account from a search. */
  autoOpen?: boolean;
  /** Called whenever the confirmation closes (cancelled or done). */
  onClosed?: () => void;
}

/** Enrol an account in Smart Savings, or switch it off, with a short explanation before anything changes. */
export const SmartSavingsControl: React.FC<Props> = ({
  accountId, accountNumber, clientName, balance, active, wasEnrolled, matured, penaltyRate, compact, autoOpen, onClosed,
}) => {
  const [open, setOpen] = useState(!!autoOpen);
  const close = () => { setOpen(false); onClosed?.(); };
  const toggle = useToggleSmartSavings();
  const { data: settings } = useTreasurySettings();
  const notice = settings?.smart_savings_notice_days ?? 14;
  const interest = Number(balance) * 0.06;

  const submit = async () => {
    try {
      await toggle.mutateAsync({ accountId, action: active ? 'deactivate' : 'activate' });
      toast.success(active ? 'Smart Savings switched off.' : 'Enrolled in Smart Savings.');
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

      <Modal open={open} onClose={close} title={active ? 'Switch off Smart Savings?' : 'Enrol in Smart Savings?'}>
        <div className="space-y-3 text-sm text-gray-700">
          <p className="font-medium text-gray-900">{clientName} · {accountNumber}</p>
          {active ? (
            <ul className="list-disc list-inside space-y-1">
              <li>The cycle stops and no more Smart Savings interest is paid.</li>
              <li>Early withdrawals no longer carry the Smart Savings penalty or the {notice}-day notice.</li>
              {matured && (
                <li className="text-red-700 font-medium">
                  This cycle has matured but its interest has not been credited yet. Switching off now means the client loses it.
                </li>
              )}
            </ul>
          ) : (
            <ul className="list-disc list-inside space-y-1">
              <li>A 3-month cycle starts today with an opening balance of <strong>{naira(balance)}</strong>.</li>
              <li>At maturity the client earns 6% of the opening balance (about <strong>{naira(interest)}</strong>), then the next cycle starts.</li>
              <li>Withdrawing before maturity may cost a penalty{penaltyRate ? ` (${penaltyRate}% of the balance)` : ' set on the savings product'}.</li>
              <li>Withdrawals need {notice} days&apos; notice before payout.</li>
            </ul>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={close} className="px-4 py-2 rounded-lg border border-gray-300">Cancel</button>
            <button type="button" onClick={submit} disabled={toggle.isPending}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${active ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white disabled:opacity-50`}>
              {toggle.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {active ? 'Switch off' : 'Enrol'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SmartSavingsControl;
