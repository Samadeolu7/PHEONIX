import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  RefreshCw,
  Lock,
} from 'lucide-react';
import {
  useReconciliation,
  useReconciliationTransactions,
  useRerunReconciliation,
  useResolveException,
  useSecondResolveException,
  useUnmatchTransaction,
  useUnresolveException,
} from '../../hooks/useReconciliation';
import { ReconciliationWaitState } from '../../components/banks/ReconciliationWaitState';
import { PostToExpenseModal } from '../../components/banks/PostToExpenseModal';
import { LinkResolveModal } from '../../components/banks/LinkResolveModal';
import { useToast } from '../../hooks/useToast';
import { usePermission } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import {
  MIN_REASON_LENGTH,
  type DailyReconciliation,
  type ReconciliationBankTransaction,
  type ReconciliationException,
} from '../../types/banks';

const STATUS_STYLES: Record<DailyReconciliation['status'], string> = {
  processing: 'bg-amber-100 text-amber-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
};

function formatAmount(value: string | null): string {
  if (value === null) return '—';
  return `₦${parseFloat(value).toLocaleString()}`;
}

const ReconciliationDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { user } = useAuth();
  const { hasPageAccess } = usePermission();
  const canApprove = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'approve');
  const canEditPerfectMatch = hasPageAccess('banks', 'bank-reconciliation-exceptions', 'edit');
  const canResolve = canApprove || canEditPerfectMatch;

  const {
    data: recon,
    isLoading: loading,
    error: queryError,
    refetch,
  } = useReconciliation(Number(id));
  const error = queryError
    ? queryError instanceof Error
      ? queryError.message
      : 'Failed to load reconciliation'
    : null;

  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<number, string>>({});
  const [secondResolvingId, setSecondResolvingId] = useState<number | null>(null);
  const [secondNotesDraft, setSecondNotesDraft] = useState<Record<number, string>>({});
  const [filter, setFilter] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

  const [showTransactions, setShowTransactions] = useState(false);
  const [transactionsFilter, setTransactionsFilter] = useState<'all' | 'matched' | 'unmatched'>(
    'all'
  );
  const matchedParam =
    transactionsFilter === 'matched'
      ? true
      : transactionsFilter === 'unmatched'
        ? false
        : undefined;
  const { data: txData, isLoading: transactionsLoading } = useReconciliationTransactions(
    recon?.id ?? 0,
    matchedParam,
    showTransactions && !!recon?.id
  );
  const transactions = txData?.results ?? null;

  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);
  const [unmatchReasonDraft, setUnmatchReasonDraft] = useState<Record<string, string>>({});
  const [postToExpenseException, setPostToExpenseException] =
    useState<ReconciliationException | null>(null);
  const [linkResolveException, setLinkResolveException] = useState<ReconciliationException | null>(
    null
  );
  const [unresolvingId, setUnresolvingId] = useState<number | null>(null);
  const [unresolveReasonDraft, setUnresolveReasonDraft] = useState<Record<number, string>>({});

  const [rerunIncludeDebits, setRerunIncludeDebits] = useState(false);
  useEffect(() => {
    if (recon) setRerunIncludeDebits(recon.include_debits);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recon?.id]);

  const rerunMutation = useRerunReconciliation();
  const resolveExceptionMutation = useResolveException();
  const secondResolveExceptionMutation = useSecondResolveException();
  const unmatchTransactionMutation = useUnmatchTransaction();
  const unresolveExceptionMutation = useUnresolveException();

  const handleManualRefresh = () => {
    refetch();
  };

  const handleResolve = async (exception: ReconciliationException) => {
    if (!recon) return;
    setResolvingId(exception.id);
    try {
      await resolveExceptionMutation.mutateAsync({
        reconciliationId: recon.id,
        exceptionId: exception.id,
        data: { resolution_notes: notesDraft[exception.id] || '' },
      });
      success('Exception resolved');
    } catch (err: any) {
      showError(err.message || 'Failed to resolve exception');
    } finally {
      setResolvingId(null);
    }
  };

  const handleSecondResolve = async (exception: ReconciliationException) => {
    if (!recon) return;
    setSecondResolvingId(exception.id);
    try {
      await secondResolveExceptionMutation.mutateAsync({
        reconciliationId: recon.id,
        exceptionId: exception.id,
        data: { resolution_notes: secondNotesDraft[exception.id] || '' },
      });
      success('Exception resolved');
    } catch (err: any) {
      showError(err.message || 'Failed to confirm the second approval');
    } finally {
      setSecondResolvingId(null);
    }
  };

  const handlePostToExpenseSuccess = () => {
    refetch();
    success('Draft payment created — awaiting approval');
  };

  const handleLinkResolveSuccess = () => {
    refetch();
    success('Exceptions netted and resolved');
  };

  const handleUnmatch = async (tx: ReconciliationBankTransaction) => {
    if (!recon) return;
    const reason = unmatchReasonDraft[tx.id] || '';
    if (reason.trim().length < MIN_REASON_LENGTH) return;
    setUnmatchingId(tx.id);
    try {
      await unmatchTransactionMutation.mutateAsync({
        reconciliationId: recon.id,
        transactionId: tx.id,
        data: { reason },
      });
      success('Transaction unmatched');
    } catch (err: any) {
      showError(err.message || 'Failed to unmatch transaction');
    } finally {
      setUnmatchingId(null);
    }
  };

  const handleUnresolve = async (exception: ReconciliationException) => {
    if (!recon) return;
    const reason = unresolveReasonDraft[exception.id] || '';
    if (reason.trim().length < MIN_REASON_LENGTH) return;
    setUnresolvingId(exception.id);
    try {
      await unresolveExceptionMutation.mutateAsync({
        exceptionId: exception.id,
        data: { reason },
      });
      success('Exception reopened');
    } catch (err: any) {
      showError(err.message || 'Failed to unresolve exception');
    } finally {
      setUnresolvingId(null);
    }
  };

  const handleRerun = async () => {
    if (!recon) return;
    try {
      await rerunMutation.mutateAsync({
        id: recon.id,
        data: { include_debits: rerunIncludeDebits },
      });
      success('Re-matching started');
    } catch (err: any) {
      showError(err.message || 'Failed to re-run reconciliation');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !recon) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error || 'Reconciliation not found'}
        </div>
      </div>
    );
  }

  const exceptions = recon.exceptions || [];
  const visibleExceptions = exceptions
    .filter(e => {
      if (filter === 'unresolved') return !e.resolved;
      if (filter === 'resolved') return e.resolved;
      return true;
    })
    .sort((a, b) => Number(b.is_high_priority) - Number(a.is_high_priority));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/banks/reconciliations')}
          className="text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900">
            {recon.bank_account_info?.account_name || 'Reconciliation'} —{' '}
            {recon.reconciliation_date}
          </h1>
          <p className="text-gray-600 mt-1">
            {recon.bank_account_info
              ? `${recon.bank_account_info.bank_name} · ${recon.bank_account_info.account_number}`
              : ''}
            {recon.branch_name ? ` · ${recon.branch_name}` : ''}
            {recon.rerun_count > 0 ? ` · Re-run ×${recon.rerun_count}` : ''}
          </p>
        </div>
        {recon.status !== 'processing' && (
          <div className="flex items-center gap-3">
            <label
              className="flex items-center gap-1.5 text-xs text-gray-600"
              title="Also reconcile debits (withdrawals, disbursements, bank charges)"
            >
              <input
                type="checkbox"
                checked={rerunIncludeDebits}
                onChange={e => setRerunIncludeDebits(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Include debits</span>
            </label>
            <button
              onClick={handleRerun}
              disabled={rerunMutation.isPending}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${rerunMutation.isPending ? 'animate-spin' : ''}`} />
              {rerunMutation.isPending ? 'Re-running…' : 'Re-run matching'}
            </button>
          </div>
        )}
        <span
          className={`px-3 py-1 text-sm font-semibold rounded-full ${STATUS_STYLES[recon.status]}`}
        >
          {recon.status === 'processing'
            ? 'Processing'
            : recon.status === 'completed'
              ? 'Completed'
              : 'Failed'}
        </span>
      </div>

      {recon.status === 'processing' ? (
        <div className="bg-white rounded-lg shadow p-10 text-center">
          <ReconciliationWaitState />
          <button
            onClick={handleManualRefresh}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      ) : (
        <>
          {recon.status === 'failed' && recon.error_detail && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{recon.error_detail}</span>
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <p className="text-sm text-gray-600">Bank Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{recon.total_bank_transactions}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <p className="text-sm text-gray-600">Matched</p>
              </div>
              <p className="text-2xl font-bold text-green-600">{recon.matched_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-600" />
                <p className="text-sm text-gray-600">Bank Only</p>
              </div>
              <p className="text-2xl font-bold text-red-600">{recon.unmatched_bank_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-600" />
                <p className="text-sm text-gray-600">ERP Only</p>
              </div>
              <p className="text-2xl font-bold text-amber-600">{recon.unmatched_erp_count}</p>
            </div>
          </div>

          {/* Exceptions */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Exceptions</h2>
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                {(['unresolved', 'resolved', 'all'] as const).map(key => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={`px-3 py-1 text-sm rounded-md capitalize ${
                      filter === key ? 'bg-white shadow text-gray-900' : 'text-gray-600'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </div>

            {visibleExceptions.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-3" />
                <p className="text-gray-600">
                  {filter === 'unresolved'
                    ? 'No unresolved exceptions — everything is matched or already reviewed.'
                    : 'Nothing to show for this filter.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-200">
                {visibleExceptions.map(exception => (
                  <li key={exception.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 min-w-0">
                        {exception.direction === 'CREDIT' ? (
                          <ArrowDownCircle className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                        ) : (
                          <ArrowUpCircle className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                exception.exception_type === 'bank_only'
                                  ? 'bg-red-100 text-red-800'
                                  : exception.exception_type === 'erp_only'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {exception.exception_type === 'bank_only'
                                ? 'In bank, not in ERP'
                                : exception.exception_type === 'erp_only'
                                  ? 'In ERP, not in bank'
                                  : 'Amount difference'}
                            </span>
                            <span className="text-xs text-gray-400">{exception.direction}</span>
                            {exception.is_high_priority && !exception.resolved && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-600 text-white">
                                <AlertTriangle className="w-3 h-3" />
                                Unexplained Cash
                              </span>
                            )}
                            {exception.resolved && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                                Resolved
                              </span>
                            )}
                            {exception.officer_name && (
                              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                {exception.officer_name}
                                {exception.erp_branch_name ? ` · ${exception.erp_branch_name}` : ''}
                              </span>
                            )}
                            {exception.exception_type !== 'bank_only' && (
                              <span
                                className={`text-xs ${exception.has_bank_reference ? 'text-gray-400' : 'text-red-500 font-medium'}`}
                                title={
                                  exception.has_bank_reference
                                    ? 'A bank reference was entered but no matching bank transaction was found'
                                    : 'No bank reference was entered for this payment'
                                }
                              >
                                {exception.has_bank_reference ? 'Ref entered' : 'No ref entered'}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-900 mt-1 truncate">
                            {/* For erp_only the payment's own description must win —
                                bank_narration on those rows is just the last claimant
                                line's text (unmatch bookkeeping), and showing it first
                                makes a no-reference payment masquerade as one whose
                                reference matches a bank line verbatim. */}
                            {exception.exception_type === 'erp_only'
                              ? exception.erp_narration || exception.bank_narration || '—'
                              : exception.bank_narration || exception.erp_narration || '—'}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {exception.exception_type !== 'erp_only' && (
                              <>
                                Bank: {formatAmount(exception.bank_amount)} on {exception.bank_date}
                              </>
                            )}
                            {exception.exception_type === 'amount_diff' && ' · '}
                            {exception.exception_type !== 'bank_only' && (
                              <>
                                ERP: {formatAmount(exception.erp_amount)} on {exception.erp_date}
                              </>
                            )}
                          </p>
                          {exception.resolved && exception.resolution_notes && (
                            <p className="text-xs text-gray-500 mt-1 italic">
                              "{exception.resolution_notes}"
                            </p>
                          )}
                          {!exception.resolved && exception.unresolved_by_name && (
                            <p className="text-xs text-amber-700 mt-1">
                              Reopened by {exception.unresolved_by_name}
                              {exception.unresolved_reason &&
                                `: "${exception.unresolved_reason}"`}{' '}
                              — previously resolved
                              {exception.resolved_by_name && ` by ${exception.resolved_by_name}`}
                              {exception.resolution_notes && ` ("${exception.resolution_notes}")`}
                            </p>
                          )}
                          {exception.netted_with_info && (
                            <p className="text-xs text-purple-700 mt-1">
                              Netted against {exception.netted_with_info.direction}{' '}
                              {formatAmount(exception.netted_with_info.bank_amount)} —{' '}
                              {exception.netted_with_info.bank_narration || '—'}
                            </p>
                          )}
                          {exception.pending_bank_payment_info && !exception.resolved && (
                            <p className="text-xs text-amber-700 mt-1">
                              Pending approval —{' '}
                              {exception.pending_bank_payment_info.payment_number} (
                              {exception.pending_bank_payment_info.status})
                            </p>
                          )}
                          {exception.awaiting_second_resolution && (
                            <p className="text-xs text-amber-700 mt-1">
                              Awaiting a second director's confirmation — first resolved by{' '}
                              {exception.resolved_by_name || 'a director'}
                              {exception.resolution_notes && `: "${exception.resolution_notes}"`}
                            </p>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const userCanResolveThis = exception.is_perfect_match
                          ? canResolve
                          : canApprove;
                        const notesRequired = !exception.is_perfect_match;
                        const notes = notesDraft[exception.id] || '';
                        const canPostToExpense =
                          canResolve &&
                          exception.exception_type === 'bank_only' &&
                          exception.direction === 'DEBIT' &&
                          !exception.pending_bank_payment_info;
                        const canLinkResolve =
                          canApprove &&
                          (exception.exception_type === 'bank_only' ||
                            exception.exception_type === 'erp_only');

                        if (exception.awaiting_second_resolution) {
                          const secondNotes = secondNotesDraft[exception.id] || '';
                          const isFirstResolver = exception.resolved_by === user?.id;

                          if (!canApprove || isFirstResolver) {
                            return (
                              <span
                                className="flex items-center gap-1 text-xs text-amber-600 shrink-0"
                                title={
                                  isFirstResolver
                                    ? 'You resolved this first — a different director must confirm'
                                    : 'Only directors may provide the second approval'
                                }
                              >
                                <Lock className="w-3.5 h-3.5" />
                                {isFirstResolver
                                  ? 'Awaiting another director'
                                  : 'Awaiting 2nd approval'}
                              </span>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="text"
                                placeholder={`Confirm notes (min ${MIN_REASON_LENGTH} chars)`}
                                value={secondNotes}
                                onChange={e =>
                                  setSecondNotesDraft({
                                    ...secondNotesDraft,
                                    [exception.id]: e.target.value,
                                  })
                                }
                                className="w-40 px-2 py-1 text-sm border border-amber-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                              />
                              <button
                                onClick={() => handleSecondResolve(exception)}
                                disabled={
                                  secondResolvingId === exception.id ||
                                  secondNotes.trim().length < MIN_REASON_LENGTH
                                }
                                title={
                                  secondNotes.trim().length < MIN_REASON_LENGTH
                                    ? `Confirmation notes (at least ${MIN_REASON_LENGTH} characters) are required`
                                    : undefined
                                }
                                className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-md hover:bg-amber-700 disabled:opacity-50 whitespace-nowrap"
                              >
                                {secondResolvingId === exception.id
                                  ? 'Confirming…'
                                  : 'Confirm (2nd director)'}
                              </button>
                            </div>
                          );
                        }

                        if (exception.resolved) {
                          if (!canApprove) return null;
                          const unresolveBlocked =
                            !!exception.netted_with_info || !!exception.pending_bank_payment_info;
                          if (unresolveBlocked) return null;

                          const unresolveReason = unresolveReasonDraft[exception.id] || '';
                          return (
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="text"
                                placeholder={`Reason to reopen (min ${MIN_REASON_LENGTH} chars)`}
                                value={unresolveReason}
                                onChange={e =>
                                  setUnresolveReasonDraft({
                                    ...unresolveReasonDraft,
                                    [exception.id]: e.target.value,
                                  })
                                }
                                className="w-48 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                              />
                              <button
                                onClick={() => handleUnresolve(exception)}
                                disabled={
                                  unresolvingId === exception.id ||
                                  unresolveReason.trim().length < MIN_REASON_LENGTH
                                }
                                title="Reopen this exception — e.g. it was resolved standalone before being properly linked to its real counterpart"
                                className="px-3 py-1.5 text-sm font-medium text-amber-700 border border-amber-300 rounded-md hover:bg-amber-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                {unresolvingId === exception.id ? 'Reopening…' : 'Unresolve'}
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-center gap-2 shrink-0">
                            {canPostToExpense && (
                              <button
                                onClick={() => setPostToExpenseException(exception)}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
                              >
                                Post to Expense
                              </button>
                            )}
                            {canLinkResolve && (
                              <button
                                onClick={() => setLinkResolveException(exception)}
                                className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
                              >
                                Link…
                              </button>
                            )}
                            {!userCanResolveThis ? (
                              <span
                                className="flex items-center gap-1 text-xs text-gray-400 shrink-0"
                                title={
                                  notesRequired && canEditPerfectMatch && !canApprove
                                    ? 'This exception has an amount mismatch — only a director can resolve it'
                                    : 'Only directors or branch managers can resolve reconciliation exceptions'
                                }
                              >
                                <Lock className="w-3.5 h-3.5" />
                                {notesRequired && canEditPerfectMatch && !canApprove
                                  ? 'Director required'
                                  : 'View only'}
                              </span>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  placeholder={
                                    notesRequired
                                      ? `Resolution notes (min ${MIN_REASON_LENGTH} chars)`
                                      : 'Resolution notes (optional)'
                                  }
                                  value={notes}
                                  onChange={e =>
                                    setNotesDraft({ ...notesDraft, [exception.id]: e.target.value })
                                  }
                                  className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                                <button
                                  onClick={() => handleResolve(exception)}
                                  disabled={
                                    resolvingId === exception.id ||
                                    (notesRequired && notes.trim().length < MIN_REASON_LENGTH)
                                  }
                                  title={
                                    notesRequired && notes.trim().length < MIN_REASON_LENGTH
                                      ? `Resolution notes (at least ${MIN_REASON_LENGTH} characters) are required for an amount mismatch`
                                      : undefined
                                  }
                                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                                >
                                  {resolvingId === exception.id ? 'Resolving…' : 'Resolve'}
                                </button>
                              </>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Matched / Unmatched Transactions */}
          <div className="bg-white rounded-lg shadow overflow-hidden mt-6">
            <button
              onClick={() => setShowTransactions(v => !v)}
              className="w-full flex items-center justify-between px-6 py-4 text-left"
            >
              <h2 className="text-lg font-semibold text-gray-900">
                Bank Transactions ({recon.total_bank_transactions})
              </h2>
              <span className="text-sm text-gray-500">{showTransactions ? 'Hide' : 'Show'}</span>
            </button>

            {showTransactions && (
              <>
                <div className="flex items-center justify-between px-6 py-3 border-t border-b border-gray-200 bg-gray-50">
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {(['all', 'matched', 'unmatched'] as const).map(key => (
                      <button
                        key={key}
                        onClick={() => setTransactionsFilter(key)}
                        className={`px-3 py-1 text-sm rounded-md capitalize ${
                          transactionsFilter === key
                            ? 'bg-white shadow text-gray-900'
                            : 'text-gray-600'
                        }`}
                      >
                        {key}
                      </button>
                    ))}
                  </div>
                </div>

                {transactionsLoading ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : !transactions || transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-gray-600">Nothing to show for this filter.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-200">
                    {transactions.map(tx => (
                      <li key={tx.id} className="px-6 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            {tx.matched ? (
                              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                                    tx.matched
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}
                                >
                                  {tx.matched
                                    ? `Matched${tx.match_confidence ? ` (${tx.match_confidence})` : ''}`
                                    : 'Unmatched'}
                                </span>
                                <span className="text-xs text-gray-400">{tx.direction}</span>
                                {tx.matched_erp_officer_name && (
                                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-700">
                                    {tx.matched_erp_officer_name}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-900 mt-1 truncate">
                                {tx.narration || '—'}
                              </p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                Bank: {formatAmount(tx.amount)} on {tx.value_date}
                                {tx.matched && tx.erp_narration && (
                                  <>
                                    {' '}
                                    · ERP: {tx.erp_narration}
                                    {tx.erp_date ? ` on ${tx.erp_date}` : ''}
                                  </>
                                )}
                              </p>
                              {!tx.matched && tx.unmatched_reason && (
                                <p className="text-xs text-gray-500 mt-1 italic">
                                  Unmatched by {tx.unmatched_by_name || 'unknown'}: "
                                  {tx.unmatched_reason}"
                                </p>
                              )}
                            </div>
                          </div>

                          {tx.matched && canApprove && (
                            <div className="flex items-center gap-2 shrink-0">
                              <input
                                type="text"
                                placeholder={`Reason (min ${MIN_REASON_LENGTH} chars)`}
                                value={unmatchReasonDraft[tx.id] || ''}
                                onChange={e =>
                                  setUnmatchReasonDraft({
                                    ...unmatchReasonDraft,
                                    [tx.id]: e.target.value,
                                  })
                                }
                                className="w-40 px-2 py-1 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                              />
                              <button
                                onClick={() => handleUnmatch(tx)}
                                disabled={
                                  unmatchingId === tx.id ||
                                  (unmatchReasonDraft[tx.id] || '').trim().length <
                                    MIN_REASON_LENGTH
                                }
                                title={
                                  (unmatchReasonDraft[tx.id] || '').trim().length <
                                  MIN_REASON_LENGTH
                                    ? `A reason of at least ${MIN_REASON_LENGTH} characters is required to unmatch a transaction`
                                    : undefined
                                }
                                className="px-3 py-1.5 text-sm font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                              >
                                {unmatchingId === tx.id ? 'Unmatching…' : 'Unmatch'}
                              </button>
                            </div>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </>
      )}

      {postToExpenseException && recon && (
        <PostToExpenseModal
          reconciliationId={recon.id}
          exception={postToExpenseException}
          onClose={() => setPostToExpenseException(null)}
          onSuccess={handlePostToExpenseSuccess}
          onError={showError}
        />
      )}

      {linkResolveException && recon && (
        <LinkResolveModal
          exception={linkResolveException}
          onClose={() => setLinkResolveException(null)}
          onSuccess={handleLinkResolveSuccess}
          onError={showError}
        />
      )}
    </div>
  );
};

export default ReconciliationDetailPage;
