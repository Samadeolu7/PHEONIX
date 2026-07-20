import type {
  PaymentTracePayment,
  PaymentTraceLine,
  PaymentTraceException,
} from '../../../types/banks';

export type TimelineEventColor = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'gray';

export interface TimelineEvent {
  id: string;
  type:
    | 'created'
    | 'matched'
    | 'unmatched'
    | 'exception_created'
    | 'exception_resolved'
    | 'reversed'
    | 'is_reversal';
  date: string;
  label: string;
  detail?: string;
  color: TimelineEventColor;
}

export interface PaymentInvestigationData {
  payment: PaymentTracePayment;
  currentMatches: PaymentTraceLine[];
  historicalMatches: PaymentTraceLine[];
}

export function classifyMatches(payment: PaymentTracePayment): {
  currentMatches: PaymentTraceLine[];
  historicalMatches: PaymentTraceLine[];
} {
  const currentMatches: PaymentTraceLine[] = [];
  const historicalMatches: PaymentTraceLine[] = [];

  for (const line of payment.claimed_by_lines) {
    if (line.matched) {
      currentMatches.push(line);
    } else {
      historicalMatches.push(line);
    }
  }

  return { currentMatches, historicalMatches };
}

export function buildTimeline(payment: PaymentTracePayment): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    id: `created-${payment.id}`,
    type: 'created',
    date: payment.date,
    label: 'Payment Created',
    detail: payment.description,
    color: 'blue',
  });

  if (payment.is_reversal) {
    events.push({
      id: `reversal-${payment.id}`,
      type: 'is_reversal',
      date: payment.date,
      label: 'Is a Reversal',
      detail: 'This transaction reverses another',
      color: 'red',
    });
  }

  if (payment.is_reversed) {
    events.push({
      id: `reversed-${payment.id}`,
      type: 'reversed',
      date: payment.date,
      label: 'Reversed',
      detail: 'This transaction has been reversed',
      color: 'red',
    });
  }

  for (const line of payment.claimed_by_lines) {
    if (line.matched && line.matched_at) {
      events.push({
        id: `matched-${line.id}`,
        type: 'matched',
        date: line.matched_at,
        label: `Matched${line.match_confidence ? ` (${line.match_confidence})` : ''}`,
        detail: line.claiming_transaction
          ? `${line.claiming_transaction.reference_number} — ${line.bank_account}`
          : line.bank_account,
        color: 'green',
      });
    }

    if (!line.matched && line.unmatched_at) {
      events.push({
        id: `unmatched-${line.id}`,
        type: 'unmatched',
        date: line.unmatched_at,
        label: `Unmatched${line.unmatched_by ? ` by ${line.unmatched_by}` : ''}`,
        detail: line.unmatched_reason || undefined,
        color: 'amber',
      });
    }
  }

  for (const exc of payment.exceptions) {
    events.push({
      id: `exc-created-${exc.id}`,
      type: 'exception_created',
      date: exc.date,
      label: `Exception Created — ${formatExceptionType(exc)}`,
      detail: exc.narration || undefined,
      color: 'purple',
    });

    if (exc.resolved && exc.resolved_at) {
      events.push({
        id: `exc-resolved-${exc.id}`,
        type: 'exception_resolved',
        date: exc.resolved_at,
        label: `Exception Resolved${exc.resolved_by ? ` by ${exc.resolved_by}` : ''}`,
        detail: exc.resolution_notes || undefined,
        color: 'green',
      });
    }
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return events;
}

function formatExceptionType(exc: PaymentTraceException): string {
  switch (exc.exception_type) {
    case 'erp_only':
      return 'ERP Only';
    case 'bank_only':
      return 'Bank Only';
    case 'amount_diff':
      return 'Amount Diff';
    default:
      return exc.exception_type;
  }
}
