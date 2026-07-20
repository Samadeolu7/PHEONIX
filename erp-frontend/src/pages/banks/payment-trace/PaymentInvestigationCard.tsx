import React, { useState } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, FileText, Activity, Link2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type {
  PaymentTracePayment,
  PaymentTraceLine,
  PaymentTraceException,
} from '../../../types/banks';
import { classifyMatches, buildTimeline } from './types';
import { PaymentTimeline } from './PaymentTimeline';
import { JournalEntryView } from './JournalEntryView';
import { MatchSection } from './MatchSection';
import { ExceptionSection } from './ExceptionSection';

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

/* ── Collapsible Section ────────────────────────────────────────── */

function CollapsibleSection({
  title,
  count,
  icon,
  color,
  children,
  defaultOpen = false,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50',
          open ? 'rounded-t-lg border-b border-gray-100' : 'rounded-lg'
        )}
      >
        <span className="text-gray-400">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </span>
        <span className={color}>{icon}</span>
        <span>{title}</span>
        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
          {count}
        </span>
      </button>
      {open && <div className="px-3 pb-3 pt-2">{children}</div>}
    </div>
  );
}

/* ── Status Badges Row ──────────────────────────────────────────── */

function StatusBadges({
  currentMatchCount,
  hasNoClaims,
  isReversed,
  isReversal,
  openExceptions,
}: {
  currentMatchCount: number;
  hasNoClaims: boolean;
  isReversed: boolean;
  isReversal: boolean;
  openExceptions: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {currentMatchCount > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Matched
        </span>
      )}
      {currentMatchCount === 0 && hasNoClaims && (
        <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
          No Match
        </span>
      )}
      {isReversed && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
          <RotateCcw className="h-2.5 w-2.5" />
          Reversed
        </span>
      )}
      {isReversal && (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
          <RotateCcw className="h-2.5 w-2.5" />
          Is Reversal
        </span>
      )}
      {openExceptions > 0 && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
          {openExceptions} Open Exc.
        </span>
      )}
    </div>
  );
}

/* ── Investigation Card ─────────────────────────────────────────── */

export function PaymentInvestigationCard({
  payment,
  canApprove,
  onUnmatch,
  onUnresolve,
  onNavigate,
}: {
  payment: PaymentTracePayment;
  canApprove: boolean;
  onUnmatch: (line: PaymentTraceLine, reason: string) => void;
  onUnresolve: (exc: PaymentTraceException, reason: string) => void;
  onNavigate: (reconciliationId: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { currentMatches, historicalMatches } = classifyMatches(payment);
  const timeline = buildTimeline(payment);

  const totalClaimed = payment.claimed_by_lines.length;
  const totalExceptions = payment.exceptions.length;
  const resolvedExceptions = payment.exceptions.filter(e => e.resolved).length;
  const openExceptions = totalExceptions - resolvedExceptions;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* ── Header — always visible ─────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-gray-50/50"
      >
        <span className="mt-0.5 text-gray-400">
          {expanded ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">{payment.reference_number}</span>
            <span className="text-xs text-gray-500">{payment.date}</span>
            <StatusBadges
              currentMatchCount={currentMatches.length}
              hasNoClaims={payment.claimed_by_lines.length === 0}
              isReversed={payment.is_reversed}
              isReversal={payment.is_reversal}
              openExceptions={openExceptions}
            />
          </div>

          <div className="mt-1 text-xs text-gray-600 line-clamp-1">{payment.description}</div>

          <div className="mt-1.5 flex flex-wrap gap-3 text-[11px] text-gray-500">
            {payment.created_by && <span>by {payment.created_by}</span>}
            <span>{payment.legs.length} journal legs</span>
            {totalClaimed > 0 && (
              <span>
                {currentMatches.length} current · {historicalMatches.length} historical
              </span>
            )}
            {totalExceptions > 0 && (
              <span>
                {resolvedExceptions}/{totalExceptions} exceptions resolved
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold text-gray-900">
            {formatAmount(
              payment.legs.find(l => l.side === 'CR')?.amount || payment.legs[0]?.amount || null
            )}
          </div>
        </div>
      </button>

      {/* ── Expanded content ────────────────────────────────────── */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          {/* ── TIMELINE — full width, the centerpiece ───────────── */}
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-blue-800">
              <Activity className="h-4 w-4" />
              Payment Lifecycle
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                {timeline.length} events
              </span>
            </div>
            <PaymentTimeline events={timeline} />
          </div>

          {/* ── Two-column body ──────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* ── Left column ──────────────────────────────────── */}
            <div className="space-y-4">
              {/* Summary */}
              <CollapsibleSection
                title="Summary"
                count={payment.legs.length}
                icon={<FileText className="h-3.5 w-3.5" />}
                color="text-gray-600"
                defaultOpen={true}
              >
                <div className="space-y-1 text-xs">
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                    <span className="text-gray-500">Reference</span>
                    <span className="font-medium text-gray-800">{payment.reference_number}</span>
                    <span className="text-gray-500">Date</span>
                    <span className="text-gray-800">{payment.date}</span>
                    {payment.created_by && (
                      <>
                        <span className="text-gray-500">Created by</span>
                        <span className="text-gray-800">{payment.created_by}</span>
                      </>
                    )}
                    <span className="text-gray-500">Description</span>
                    <span className="text-gray-800">{payment.description}</span>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Journal Entry */}
              <CollapsibleSection
                title="Journal Entry"
                count={payment.legs.length}
                icon={<FileText className="h-3.5 w-3.5" />}
                color="text-indigo-600"
              >
                <JournalEntryView legs={payment.legs} />
              </CollapsibleSection>
            </div>

            {/* ── Right column ─────────────────────────────────── */}
            <div className="space-y-4">
              {/* Current & Historical Matches */}
              <CollapsibleSection
                title="Matches"
                count={totalClaimed}
                icon={<Link2 className="h-3.5 w-3.5" />}
                color="text-green-600"
                defaultOpen={true}
              >
                <MatchSection
                  currentMatches={currentMatches}
                  historicalMatches={historicalMatches}
                  canApprove={canApprove}
                  onUnmatch={onUnmatch}
                  onNavigate={onNavigate}
                />
              </CollapsibleSection>

              {/* Exceptions */}
              {totalExceptions > 0 && (
                <CollapsibleSection
                  title="Exceptions"
                  count={totalExceptions}
                  icon={<span className="inline-block h-2 w-2 rounded-full bg-amber-500" />}
                  color="text-amber-600"
                  defaultOpen={true}
                >
                  <ExceptionSection
                    exceptions={payment.exceptions}
                    canApprove={canApprove}
                    onUnresolve={onUnresolve}
                    onNavigate={onNavigate}
                  />
                </CollapsibleSection>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
