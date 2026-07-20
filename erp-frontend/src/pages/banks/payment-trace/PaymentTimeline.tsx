import React from 'react';
import { CheckCircle2, Clock, AlertTriangle, XCircle, RotateCcw, Plus } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { TimelineEvent, TimelineEventColor } from './types';

const COLOR_MAP: Record<TimelineEventColor, { dot: string; line: string; text: string }> = {
  green: {
    dot: 'bg-green-500',
    line: 'border-green-300',
    text: 'text-green-700',
  },
  amber: {
    dot: 'bg-amber-500',
    line: 'border-amber-300',
    text: 'text-amber-700',
  },
  red: {
    dot: 'bg-red-500',
    line: 'border-red-300',
    text: 'text-red-700',
  },
  blue: {
    dot: 'bg-blue-500',
    line: 'border-blue-300',
    text: 'text-blue-700',
  },
  purple: {
    dot: 'bg-purple-500',
    line: 'border-purple-300',
    text: 'text-purple-700',
  },
  gray: {
    dot: 'bg-gray-400',
    line: 'border-gray-300',
    text: 'text-gray-600',
  },
};

function EventIcon({ type }: { type: TimelineEvent['type'] }) {
  const cls = 'h-3.5 w-3.5';
  switch (type) {
    case 'created':
      return <Plus className={cls} />;
    case 'matched':
      return <CheckCircle2 className={cls} />;
    case 'unmatched':
      return <XCircle className={cls} />;
    case 'exception_created':
      return <AlertTriangle className={cls} />;
    case 'exception_resolved':
      return <CheckCircle2 className={cls} />;
    case 'reversed':
      return <RotateCcw className={cls} />;
    case 'is_reversal':
      return <RotateCcw className={cls} />;
    default:
      return <Clock className={cls} />;
  }
}

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function PaymentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div className="space-y-0">
      {events.map((event, idx) => {
        const colors = COLOR_MAP[event.color] || COLOR_MAP.gray;
        const isLast = idx === events.length - 1;

        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-white',
                  colors.dot
                )}
              >
                <EventIcon type={event.type} />
              </div>
              {!isLast && <div className={cn('w-px flex-1 border-l-2', colors.line)} />}
            </div>

            <div className={cn('pb-6', isLast && 'pb-0')}>
              <div className={cn('text-xs font-semibold', colors.text)}>{event.label}</div>
              <div className="mt-0.5 text-[11px] text-gray-500">{formatEventDate(event.date)}</div>
              {event.detail && (
                <div className="mt-1 max-w-md text-xs text-gray-600">{event.detail}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
