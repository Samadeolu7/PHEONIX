# banks/tasks.py
"""
Celery tasks for the banks application.

run_reconciliation_match
    Async wrapper around the Bank-Recon (Java) matching call. Moved out of
    StatementUploadView so the upload request returns immediately instead of
    blocking the HTTP thread for up to ~90 seconds on a synchronous
    cross-service call — see banks/views.py's StatementUploadView for the
    (now fast) parse/store/enqueue half of this flow.
"""
import logging
from datetime import date, timedelta

import requests as http_requests
from celery import shared_task
from django.conf import settings as django_settings
from django.utils import timezone as tz

logger = logging.getLogger(__name__)

AUTO_RESOLVE_NOTE = 'Auto-resolved: matched in a later re-run.'


@shared_task(
    bind=True,
    name='banks.tasks.run_reconciliation_match',
    max_retries=3,
    default_retry_delay=30,
    acks_late=True,
)
def run_reconciliation_match(self, reconciliation_id, include_debits=False):
    from .models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
    from .reconciliation_utils import fetch_erp_payments

    try:
        recon = DailyReconciliation.objects.select_related('bank_account', 'owner__tenant', 'branch').get(pk=reconciliation_id)
    except DailyReconciliation.DoesNotExist:
        logger.error("run_reconciliation_match: DailyReconciliation %s not found", reconciliation_id)
        return

    if recon.status != 'processing':
        # Already completed/failed by a prior run of this task (e.g. a retry
        # that fired after an earlier attempt actually succeeded) — no-op.
        logger.info(
            "run_reconciliation_match: reconciliation %s already %s, skipping",
            reconciliation_id, recon.status,
        )
        return

    bank_account = recon.bank_account
    reconciliation_date = recon.reconciliation_date

    # Widen the candidate pool to a window around the reconciliation date —
    # postings lag in both directions: an officer may log a repayment a day
    # or two before it settles, and the bank may not post a transaction for
    # several days after it was actually collected.
    window_days = getattr(django_settings, 'RECONCILIATION_MATCH_WINDOW_DAYS', 7)
    window_start = reconciliation_date - timedelta(days=window_days)
    window_end = reconciliation_date + timedelta(days=window_days)

    # Re-query the candidate pool fresh (not whatever the view saw at upload
    # time) — it must reflect the current unmatched state at the moment this
    # task actually runs, since queueing and execution aren't instantaneous.
    candidates = list(ReconciliationBankTransaction.objects.filter(
        bank_account=bank_account,
        value_date__range=(window_start, window_end),
        matched=False,
    ))

    # ERP payments another date's run within this same window already
    # claimed must not be offered again.
    already_matched_erp_ids = list(ReconciliationBankTransaction.objects.filter(
        bank_account=bank_account,
        matched=True,
        matched_erp_payment_id__isnull=False,
        value_date__range=(window_start, window_end),
    ).values_list('matched_erp_payment_id', flat=True))

    erp_credit_payments = fetch_erp_payments(
        bank_account, window_start, window_end, direction='CREDIT',
        exclude_payment_ids=already_matched_erp_ids,
    )
    erp_debit_payments = (
        fetch_erp_payments(
            bank_account, window_start, window_end, direction='DEBIT',
            exclude_payment_ids=already_matched_erp_ids,
        )
        if include_debits else None
    )

    payload = {
        'reconciliationId': recon.id,
        'bankAccountId': bank_account.id,
        'reconciliationDate': reconciliation_date.isoformat(),
        'includeDebits': include_debits,
        'bankTransactions': [
            {
                'id':            str(tx.id),
                'bankRef':       tx.bank_ref,
                'valueDate':     tx.value_date.isoformat(),
                'narration':     tx.narration,
                'direction':     tx.direction,
                'amount':        str(tx.amount),
                'balanceAfter':  str(tx.balance_after) if tx.balance_after is not None else None,
            }
            for tx in candidates
        ],
        'erpCreditPayments': erp_credit_payments,
    }
    if include_debits:
        payload['erpDebitPayments'] = erp_debit_payments

    java_base_url = getattr(django_settings, 'BANK_RECON_SERVICE_URL', 'http://localhost:8081')
    java_url = f"{java_base_url}/api/internal/bank-feed/ingest-and-match"

    service_token = getattr(django_settings, 'INTERNAL_SERVICE_TOKEN', '')
    headers = {
        'Authorization': f'Token {service_token}',
        'Content-Type': 'application/json',
    }

    try:
        java_resp = http_requests.post(java_url, json=payload, headers=headers, timeout=90)
        java_resp.raise_for_status()
        outcome = java_resp.json()
    except http_requests.exceptions.Timeout:
        # Already waited the full 90s once — retrying immediately would just
        # repeat a slow failure, so fail this run outright.
        recon.status = 'failed'
        recon.error_detail = 'Java matching service timed out after 90 seconds.'
        recon.save(update_fields=['status', 'error_detail', 'updated_at'])
        logger.error("run_reconciliation_match: Java timeout for recon %s", recon.id)
        return
    except http_requests.exceptions.RequestException as exc:
        # Connection refused / DNS / transient network errors are more
        # likely to resolve on retry than a timeout is.
        try:
            raise self.retry(exc=exc, countdown=30)
        except self.MaxRetriesExceededError:
            recon.status = 'failed'
            recon.error_detail = str(exc)
            recon.save(update_fields=['status', 'error_detail', 'updated_at'])
            logger.error(
                "run_reconciliation_match: Java Bank-Recon service error for recon %s after retries: %s",
                recon.id, exc,
            )
            return

    try:
        _persist_outcome(recon, bank_account, reconciliation_date, candidates, outcome)
    except Exception as exc:
        # Anything unexpected here (most plausibly database contention from
        # several same-account tasks with heavily overlapping ±7-day
        # windows touching the same rows concurrently) must never leave the
        # row silently stuck at 'processing' forever with no trace — that's
        # strictly worse than a visible failure, since nothing would ever
        # retry it and a director has no way to know it needs attention.
        # The task re-queries current state fresh and dedups exceptions by
        # natural key, so it's safe to retry rather than fail outright.
        logger.exception(
            "run_reconciliation_match: unexpected error persisting outcome for recon %s", recon.id,
        )
        try:
            raise self.retry(exc=exc, countdown=30)
        except self.MaxRetriesExceededError:
            recon.status = 'failed'
            recon.error_detail = f'{type(exc).__name__}: {exc}'[:2000]
            recon.save(update_fields=['status', 'error_detail', 'updated_at'])
            return

    logger.info(
        "run_reconciliation_match: recon %s completed — %d matched, %d bank-only, %d erp-only",
        recon.id, recon.matched_count, recon.unmatched_bank_count, recon.unmatched_erp_count,
    )


def _persist_outcome(recon, bank_account, reconciliation_date, candidates, outcome):
    """
    Everything after a successful Java response: persist matches, auto-
    resolve superseded exceptions, save new exceptions, and recompute
    summary counts for every reconciliation touched. Split out from the
    task body so the whole phase can be wrapped in one retry/failure
    boundary — see the try/except around this call.
    """
    from .models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException

    # --- persist confirmed matches onto ReconciliationBankTransaction ---
    matches_data = outcome.get('matches', [])
    matched_txs = []
    if matches_data:
        match_by_id = {m['bankTransactionId']: m for m in matches_data}
        matched_txs = [tx for tx in candidates if str(tx.id) in match_by_id]
        now = tz.now()
        for tx in matched_txs:
            m = match_by_id[str(tx.id)]
            tx.matched = True
            tx.match_confidence = m.get('confidence', '')
            tx.matched_erp_payment_id = m.get('erpPaymentId')
            tx.matched_at = now
        ReconciliationBankTransaction.objects.bulk_update(
            matched_txs, ['matched', 'match_confidence', 'matched_erp_payment_id', 'matched_at']
        )

    # --- auto-resolve exceptions superseded by a match found this run ---
    # A late-posted transaction found via the widened window may resolve an
    # exception recorded on an earlier (already-completed) date's run — but
    # a director's own resolution is permanent, so this only ever touches
    # rows still resolved=False.
    matched_bank_ids = [tx.id for tx in matched_txs]
    matched_erp_ids = [m.get('erpPaymentId') for m in matches_data if m.get('erpPaymentId') is not None]
    if matched_bank_ids:
        ReconciliationException.objects.filter(
            reconciliation__bank_account=bank_account,
            bank_transaction_id__in=matched_bank_ids,
            exception_type='bank_only',
            resolved=False,
        ).update(resolved=True, resolved_at=tz.now(), resolution_notes=AUTO_RESOLVE_NOTE)
    if matched_erp_ids:
        ReconciliationException.objects.filter(
            reconciliation__bank_account=bank_account,
            loan_payment_id__in=matched_erp_ids,
            exception_type='erp_only',
            resolved=False,
        ).update(resolved=True, resolved_at=tz.now(), resolution_notes=AUTO_RESOLVE_NOTE)

    # --- save new exceptions from Java response ---
    # A windowed run can surface an exception whose own date differs from
    # reconciliation_date. It's only persisted against the DailyReconciliation
    # for THAT date, and only if one already exists — otherwise it's skipped
    # for now and will surface naturally once that date gets its own run.
    recon_by_date = {reconciliation_date: recon}

    def get_target_recon(own_date):
        if own_date is None:
            return recon
        if own_date not in recon_by_date:
            recon_by_date[own_date] = DailyReconciliation.objects.filter(
                bank_account=bank_account, reconciliation_date=own_date,
            ).select_related('owner__tenant', 'branch').first()
        return recon_by_date[own_date]

    exceptions_data = outcome.get('exceptions', [])
    for exc_item in exceptions_data:
        exc_type = exc_item.get('exceptionType', 'bank_only')
        bank_date_str = exc_item.get('bankDate')
        erp_date_str = exc_item.get('erpDate')
        own_date = date.fromisoformat(bank_date_str) if bank_date_str else (
            date.fromisoformat(erp_date_str) if erp_date_str else None
        )

        target_recon = get_target_recon(own_date)
        if target_recon is None:
            continue

        bank_transaction_id = exc_item.get('bankTransactionId') or None
        loan_payment_id = exc_item.get('loanPaymentId') or None

        # Natural-key dedup: bank_transaction_id / loan_payment_id are stable
        # forever, so a re-run must not create a duplicate row for something
        # already reported and still unresolved.
        dedup_filter = {'reconciliation': target_recon, 'exception_type': exc_type, 'resolved': False}
        if exc_type == 'bank_only':
            dedup_filter['bank_transaction_id'] = bank_transaction_id
        elif exc_type == 'erp_only':
            dedup_filter['loan_payment_id'] = loan_payment_id
        else:  # amount_diff
            dedup_filter['bank_transaction_id'] = bank_transaction_id
            dedup_filter['loan_payment_id'] = loan_payment_id

        if ReconciliationException.objects.filter(**dedup_filter).exists():
            continue

        officer, erp_branch = _resolve_officer_and_branch(loan_payment_id)

        exc_obj = ReconciliationException.objects.create(
            reconciliation=target_recon,
            exception_type=exc_type,
            direction=exc_item.get('direction') or 'CREDIT',
            bank_transaction_id=bank_transaction_id,
            bank_amount=exc_item.get('bankAmount') or None,
            bank_narration=exc_item.get('bankNarration') or '',
            bank_date=exc_item.get('bankDate') or None,
            loan_payment_id=loan_payment_id,
            erp_amount=exc_item.get('erpAmount') or None,
            erp_narration=exc_item.get('erpNarration') or '',
            erp_date=exc_item.get('erpDate') or None,
            officer=officer,
            erp_branch=erp_branch,
            is_high_priority=(exc_type == 'bank_only'),
        )

        if exc_type == 'bank_only':
            _notify_directors_of_bank_only_exception(target_recon, exc_obj)

    # --- recompute per-date counts for every reconciliation touched this
    # run — Java's aggregate counts now span the whole window, so they can't
    # be trusted verbatim for any single date's summary. ---
    for touched_recon in {r for r in recon_by_date.values() if r is not None}:
        touched_recon.matched_count = ReconciliationBankTransaction.objects.filter(
            bank_account=bank_account, value_date=touched_recon.reconciliation_date, matched=True,
        ).count()
        # Counted from unresolved exceptions, not raw matched=False rows —
        # Java's matcher always resolves every candidate it's given into
        # either a match or a bank_only/erp_only exception in that same
        # run, so "outstanding issues" and "unresolved exceptions" are the
        # same thing. Counting from the transaction rows directly let this
        # drift out of sync with what the exceptions list actually shows:
        # resolving (or auto-resolving) an exception doesn't retroactively
        # flip ReconciliationBankTransaction.matched, so a transaction with
        # a resolved bank_only exception would still count as "unmatched"
        # even though nothing outstanding remains to review.
        touched_recon.unmatched_bank_count = touched_recon.exceptions.filter(
            exception_type='bank_only', resolved=False,
        ).count()
        touched_recon.unmatched_erp_count = touched_recon.exceptions.filter(
            exception_type='erp_only', resolved=False,
        ).count()
        # Also kept live, not left at its creation-time snapshot — a later
        # re-upload/rerun can add more same-date rows to the shared
        # transaction pool (dedup is by bank_ref across the whole account,
        # not scoped per upload), and this field would otherwise silently
        # stop reflecting reality once that happens.
        touched_recon.total_bank_transactions = ReconciliationBankTransaction.objects.filter(
            bank_account=bank_account, value_date=touched_recon.reconciliation_date,
        ).count()
        update_fields = [
            'matched_count', 'unmatched_bank_count', 'unmatched_erp_count',
            'total_bank_transactions', 'updated_at',
        ]
        if touched_recon.id == recon.id:
            touched_recon.status = 'completed'
            update_fields.append('status')
        touched_recon.save(update_fields=update_fields)


def _resolve_officer_and_branch(loan_payment_id):
    """
    Derive who actually recorded the ERP-side transaction (not who uploaded
    the statement) — fully derivable from data already on hand, no Java
    change needed.
    """
    if loan_payment_id is None:
        return None, None
    from transactions.models import Transaction

    txn = (
        Transaction.objects
        .filter(pk=loan_payment_id)
        .select_related('created_by', 'created_by__branch')
        .first()
    )
    if txn is None or txn.created_by is None:
        return None, None
    return txn.created_by, getattr(txn.created_by, 'branch', None)


def _notify_directors_of_bank_only_exception(recon, exc_obj):
    """
    A bank credit with no matching ERP record at all is the single most
    likely "cash collected but not recorded" signature — notify every
    director in the tenant, not just leave it sitting in a queue.
    """
    if recon.owner_id is None or recon.owner.tenant_id is None:
        logger.warning(
            "run_reconciliation_match: cannot notify directors for exception %s — reconciliation %s has no owner/tenant",
            exc_obj.id, recon.id,
        )
        return

    from common.approval_permissions import APPROVER_ROLES
    from django.contrib.auth import get_user_model
    from notifications.services import NotificationService

    User = get_user_model()
    directors = User.objects.filter(
        tenant=recon.owner.tenant, is_active=True,
        roles__name__in=APPROVER_ROLES, roles__is_active=True,
    ).distinct()

    # NotificationTemplate.validate_variables()/_prepare_context() resolve
    # every declared template_variables entry via its 'source' dotted path
    # against this dict (see notifications/models.py) — 'exception.bank_amount'
    # needs context['exception'] to be the actual model instance (not a
    # pre-stringified value), both so the path resolves at all and so the
    # currency/date auto-formatting in _prepare_context has a real
    # Decimal/date to work with.
    context = {
        'bank_account': str(recon.bank_account),
        'exception': exc_obj,
        'branch': recon.branch,
    }

    for director in directors:
        try:
            NotificationService().send_from_template(
                template_code='bank_recon_bank_only_exception',
                recipient=director,
                context=context,
                owner=recon.owner,
                branch=recon.branch,
                related_object=exc_obj,
                priority='urgent',
                channels=['in_app', 'email'],
            )
        except Exception:
            # Never let a notification failure break the reconciliation run.
            logger.exception(
                "run_reconciliation_match: failed to notify director %s of exception %s",
                director.id, exc_obj.id,
            )


STUCK_RECONCILIATION_THRESHOLD_MINUTES = 20


@shared_task(name='banks.tasks.requeue_stuck_reconciliations')
def requeue_stuck_reconciliations():
    """
    Periodic backstop (see CELERY_BEAT_SCHEDULE) — finds DailyReconciliation
    rows left at status='processing' well past any realistic run time and
    re-queues them.

    run_reconciliation_match now marks a row 'failed' with a real
    error_detail on any exception it catches, but a task can still vanish
    with zero trace if the worker process itself gets replaced mid-flight —
    most commonly, a deploy recreating the celery_worker container while a
    just-uploaded statement's tasks are still being dispatched or run. That
    isn't something any exception handler inside the task can catch, since
    the process disappears out from under it. This is the only mechanism
    that recovers from that specific failure mode, which is why the
    threshold is deliberately generous — every real run so far has
    completed in well under a minute, even for statements with 60+ rows and
    heavily overlapping ±7-day windows (see banks/test_tasks.py for the
    window-widening design this pool size follows from).

    The original include_debits flag isn't persisted on the model (see
    StatementUploadView/RerunReconciliationView), so a watchdog-triggered
    re-run always uses the credit-only default rather than remembering
    per-reconciliation intent — same behavior as the manual re-queue this
    replaces.
    """
    from .models import DailyReconciliation

    cutoff = tz.now() - timedelta(minutes=STUCK_RECONCILIATION_THRESHOLD_MINUTES)
    stuck = DailyReconciliation.objects.filter(status='processing', updated_at__lt=cutoff)

    count = 0
    for recon in stuck:
        logger.warning(
            "requeue_stuck_reconciliations: recon %s stuck at 'processing' since %s — re-queuing",
            recon.id, recon.updated_at,
        )
        run_reconciliation_match.delay(recon.id, False)
        count += 1

    if count:
        logger.info("requeue_stuck_reconciliations: re-queued %d stuck reconciliation(s)", count)
    return count
