import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reconciliationService } from '../../services/reconciliationService';
import { useToast } from '../useToast';
import type { PaymentTraceLine, PaymentTraceException } from '../../types/banks';

export function usePaymentTraceActions(activeQuery: string) {
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  const queryKey = ['payment-trace', activeQuery];

  const unmatchMutation = useMutation({
    mutationFn: ({ line, reason }: { line: PaymentTraceLine; reason: string }) =>
      reconciliationService.unmatchTransaction(line.reconciliation_id!, line.id, { reason }),
    onSuccess: () => {
      success('Line unmatched — the freed payment can now be re-linked to its true counterpart.');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => showError(err.message || 'Failed to unmatch'),
  });

  const unresolveMutation = useMutation({
    mutationFn: ({ exc, reason }: { exc: PaymentTraceException; reason: string }) =>
      reconciliationService.unresolveException(exc.id, { reason }),
    onSuccess: () => {
      success('Exception reopened.');
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: Error) => showError(err.message || 'Failed to unresolve'),
  });

  const unmatch = useCallback(
    (line: PaymentTraceLine, reason: string) => unmatchMutation.mutate({ line, reason }),
    [unmatchMutation]
  );

  const unresolve = useCallback(
    (exc: PaymentTraceException, reason: string) => unresolveMutation.mutate({ exc, reason }),
    [unresolveMutation]
  );

  return {
    unmatch,
    unmatchPending: unmatchMutation.isPending,
    unresolve,
    unresolvePending: unresolveMutation.isPending,
    isPending: unmatchMutation.isPending || unresolveMutation.isPending,
  };
}
