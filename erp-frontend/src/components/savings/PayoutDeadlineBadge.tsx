import React from 'react';

interface Props {
  /** ISO date (YYYY-MM-DD) by which the money must be paid out. */
  dueDate?: string | null;
  status: string;
}

const CLOSED = ['completed', 'rejected', 'cancelled'];

/** Countdown to a savings withdrawal's payout deadline: red when due/overdue, amber when close. */
export const PayoutDeadlineBadge: React.FC<Props> = ({ dueDate, status }) => {
  if (!dueDate || CLOSED.includes(status)) return null;

  const due = new Date(`${dueDate}T00:00:00`).getTime();
  const today = new Date(new Date().toDateString()).getTime();
  const days = Math.round((due - today) / 86_400_000);

  let label: string;
  let style: string;
  if (days < 0) {
    label = `Overdue by ${-days} day${days === -1 ? '' : 's'}`;
    style = 'bg-red-100 text-red-800 border-red-200';
  } else if (days === 0) {
    label = 'Pay out today';
    style = 'bg-red-100 text-red-800 border-red-200';
  } else if (days <= 2) {
    label = `Due in ${days} day${days === 1 ? '' : 's'}`;
    style = 'bg-red-50 text-red-700 border-red-200';
  } else if (days <= 5) {
    label = `Due in ${days} days`;
    style = 'bg-amber-50 text-amber-800 border-amber-200';
  } else {
    label = `Due ${new Date(due).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`;
    style = 'bg-gray-50 text-gray-600 border-gray-200';
  }

  return (
    <span
      title={`Payout deadline ${dueDate}`}
      className={`inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full border font-medium ${style}`}
    >
      {label}
    </span>
  );
};

export default PayoutDeadlineBadge;
