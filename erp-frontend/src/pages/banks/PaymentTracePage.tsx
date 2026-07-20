import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Loader2, X } from 'lucide-react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { reconciliationService } from '../../services/reconciliationService';
import { usePermission } from '../../hooks/usePermissions';
import { useDebounce } from '../../hooks/banking/useDebounce';
import { usePaymentTraceActions } from '../../hooks/banking/usePaymentTraceActions';
import { PaymentInvestigationCard } from './payment-trace/PaymentInvestigationCard';
import { SearchSummary, type SearchSummaryData } from './payment-trace/SearchSummary';
import { UnattachedLinesPanel } from './payment-trace/UnattachedLinesPanel';
import type { PaymentTraceResponse } from '../../types/banks';

const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 400;

function computeSummary(result: PaymentTraceResponse): SearchSummaryData {
  let currentMatches = 0;
  let historicalMatches = 0;
  let openExceptions = 0;
  let resolvedExceptions = 0;
  let reversals = 0;

  for (const p of result.payments) {
    if (p.is_reversal) reversals++;
    for (const line of p.claimed_by_lines) {
      if (line.matched) currentMatches++;
      else historicalMatches++;
    }
    for (const exc of p.exceptions) {
      if (exc.resolved) resolvedExceptions++;
      else openExceptions++;
    }
  }

  for (const line of result.lines) {
    if (line.matched) currentMatches++;
    else historicalMatches++;
    for (const exc of line.exceptions || []) {
      if (exc.resolved) resolvedExceptions++;
      else openExceptions++;
    }
  }

  return {
    payments: result.payments.length,
    statementLines: result.lines.length,
    currentMatches,
    historicalMatches,
    openExceptions,
    resolvedExceptions,
    reversals,
  };
}

const PaymentTracePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { hasPageAccess } = usePermission();
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const debouncedQuery = useDebounce(query, DEBOUNCE_MS);

  // Derive the active query from URL or debounce
  const urlQuery = searchParams.get('q') || '';
  const isTyping = query !== urlQuery;
  const activeQuery =
    !isTyping && urlQuery.length >= MIN_QUERY_LENGTH
      ? urlQuery
      : debouncedQuery.trim().length >= MIN_QUERY_LENGTH
        ? debouncedQuery.trim()
        : '';

  const {
    data: result,
    isLoading,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['payment-trace', activeQuery],
    queryFn: () => reconciliationService.tracePayment(activeQuery),
    enabled: activeQuery.length >= MIN_QUERY_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
  });

  const { unmatch, unresolve } = usePaymentTraceActions(activeQuery);

  // Sync URL when debounced query stabilizes
  useEffect(() => {
    if (activeQuery && activeQuery === debouncedQuery.trim()) {
      setSearchParams({ q: activeQuery }, { replace: true });
    }
  }, [activeQuery, debouncedQuery, setSearchParams]);

  const openRecon = useCallback(
    (reconciliationId: number) => {
      navigate(`/banks/reconciliations/${reconciliationId}`);
    },
    [navigate]
  );

  const handleQueryChange = (value: string) => {
    setQuery(value);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim().length >= MIN_QUERY_LENGTH) {
      e.preventDefault();
      // Force immediate URL sync + refetch
      const trimmed = query.trim();
      setSearchParams({ q: trimmed }, { replace: true });
      refetch();
    }
  };

  const clearSearch = () => {
    setQuery('');
    setSearchParams({}, { replace: true });
  };

  const summary = useMemo<SearchSummaryData | null>(() => {
    if (!result) return null;
    return computeSummary(result);
  }, [result]);

  const unattachedLines = useMemo(() => {
    if (!result) return [];
    const paymentIds = new Set(result.payments.map(p => p.id));
    return result.lines.filter(
      line => !line.matched_erp_payment_id || !paymentIds.has(line.matched_erp_payment_id)
    );
  }, [result]);

  const hasResults = result && (result.payments.length > 0 || result.lines.length > 0);
  const showResults = !isLoading && !queryError && hasResults;
  const showEmpty = !isLoading && !queryError && result && !hasResults;

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-gray-900">Payment Trace</h1>
      <p className="mt-1 max-w-2xl text-sm text-gray-500">
        Search a payment by reference, exact amount, or narration text to see its full linkage story
        — what it is currently matched to, what it was ever matched to before an unmatch, and every
        exception either side appears in. Use this when someone brings evidence a match is wrong.
      </p>

      {/* Search bar — no button, auto-searches on type */}
      <div className="relative mt-4">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          {isLoading || isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : (
            <Search className="h-4 w-4 text-gray-400" />
          )}
        </div>
        <input
          type="text"
          value={query}
          onChange={e => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Paste a reference number, enter an amount, or type narration text…"
          className="w-full max-w-lg rounded border border-gray-300 py-2 pl-9 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        {query.length > 0 && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH && (
        <p className="mt-2 text-xs text-gray-400">Enter at least 3 characters to search.</p>
      )}

      {/* Error */}
      {queryError && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {(queryError as Error).message || 'Search failed'}
        </div>
      )}

      {/* Results */}
      {showResults && result && (
        <div className="mt-6 space-y-6">
          {summary && <SearchSummary summary={summary} />}

          {result.payments.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                Payments ({result.payments.length})
              </h2>
              <div className="space-y-3">
                {result.payments.map(p => (
                  <PaymentInvestigationCard
                    key={p.id}
                    payment={p}
                    canApprove={canApprove}
                    onUnmatch={unmatch}
                    onUnresolve={unresolve}
                    onNavigate={openRecon}
                  />
                ))}
              </div>
            </section>
          )}

          {unattachedLines.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-gray-700">
                Unattached Statement Lines ({unattachedLines.length})
              </h2>
              <UnattachedLinesPanel
                lines={unattachedLines}
                canApprove={canApprove}
                onUnmatch={unmatch}
                onNavigate={openRecon}
              />
            </section>
          )}
        </div>
      )}

      {/* Empty state */}
      {showEmpty && (
        <div className="mt-8 text-center text-sm text-gray-400">
          No matching payments or statement lines found.
        </div>
      )}

      {/* Initial state — no search yet */}
      {!result && !isLoading && !queryError && (
        <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
          <Search className="h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">
            Start typing to search payments, statement lines, and exceptions.
          </p>
        </div>
      )}
    </div>
  );
};

export default PaymentTracePage;
