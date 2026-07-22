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
from django.db import OperationalError, transaction
from django.utils import timezone as tz

logger = logging.getLogger(__name__)

AUTO_RESOLVE_NOTE = 'Auto-resolved: matched in a later re-run.'

# Java reports a confidence label per match ('HIGH', 'MEDIUM', 'LOW', or
# blank/unrecognized). Only HIGH is trustworthy enough to auto-commit as a
# confirmed match — a MEDIUM/LOW guess (typically an amount-only match with
# no corroborating reference/narration) committed silently produces a
# reconciliation that *looks* complete but has the wrong two lines
# cancelling each other out; a director only discovers it later, if at all
# (see ReconciliationBankTransaction.unmatch()'s docstring — this is exactly
# the shape of match it's built to undo). Anything below this bar is instead
# surfaced as an ordinary bank_only/erp_only exception pair for a director
# to confirm manually via the existing Link picker, same as a missed
# auto-match.
AUTO_MATCH_MIN_CONFIDENCE = 'HIGH'


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

    # select_for_update(nowait=True) locks the row immediately and raises
    # OperationalError if another worker already holds it, rather than
    # blocking indefinitely. This closes the race where a retry arrives
    # while the original is still running — both would otherwise see
    # status='processing' and proceed to call Java and persist outcomes.
    # of=('self',) restricts the lock to DailyReconciliation's own row —
    # without it, Postgres rejects the query outright ("FOR UPDATE cannot
    # be applied to the nullable side of an outer join") because owner and
    # branch are nullable FKs and select_related turns those into LEFT
    # OUTER JOINs.
    #
    # select_for_update() requires an open transaction — outside one it
    # raises TransactionManagementError. The whole body runs inside this
    # one atomic() block (including the Java HTTP call) precisely so the
    # lock stays held for as long as the comment above promises; a plain
    # early return commits normally, and self.retry()/an uncaught
    # exception rolls back cleanly since nothing here is meant to be
    # partially visible to a concurrent attempt.
    with transaction.atomic():
        try:
            recon = (
                DailyReconciliation.objects
                .select_related('bank_account', 'owner__tenant', 'branch')
                .select_for_update(nowait=True, of=('self',))
                .get(pk=reconciliation_id)
            )
        except DailyReconciliation.DoesNotExist:
            logger.error("run_reconciliation_match: DailyReconciliation %s not found", reconciliation_id)
            return
        except OperationalError as exc:
            # Row is locked by another worker — back off and let Celery retry.
            logger.warning(
                "run_reconciliation_match: recon %s locked by another worker, retrying",
                reconciliation_id,
            )
            raise self.retry(exc=exc, countdown=10)

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

        # Keyed lookup so a confirmed match can be traced back to the ERP
        # payment's own claimed date and narration at persist time — Java's
        # match response only carries an erpPaymentId, not these details.
        erp_payments_by_id = {
            p['paymentId']: p for p in erp_credit_payments + (erp_debit_payments or [])
        }

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
            # A cold Java pod restart can cause one genuine 90s timeout before
            # the JVM warms up. Allow exactly one retry at a longer delay before
            # giving up — avoids permanent failure on an innocent cold-start.
            if self.request.retries < 1:
                logger.warning(
                    "run_reconciliation_match: Java timeout for recon %s — retrying once after 120s",
                    recon.id,
                )
                raise self.retry(countdown=120)
            recon.status = 'failed'
            recon.error_detail = 'Java matching service timed out after 90 seconds (retry also timed out).'
            recon.save(update_fields=['status', 'error_detail', 'updated_at'])
            logger.error("run_reconciliation_match: Java timeout for recon %s (retry exhausted)", recon.id)
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

        # Single timestamp for all audit fields written this run — matched_at,
        # resolved_at, etc. are consistent rather than drifting across calls.
        now = tz.now()

        try:
            _persist_outcome(recon, bank_account, reconciliation_date, candidates, outcome, now, erp_payments_by_id)
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


def _persist_outcome(recon, bank_account, reconciliation_date, candidates, outcome, now, erp_payments_by_id):
    """
    Everything after a successful Java response: persist matches, auto-
    resolve superseded exceptions, save new exceptions, and recompute
    summary counts for every reconciliation touched. Split out from the
    task body so the whole phase can be wrapped in one retry/failure
    boundary — see the try/except around this call.

    `now` is the single timestamp captured by the task before this call so
    all audit fields (matched_at, resolved_at) are consistent across rows.

    `erp_payments_by_id` is the same ERP payment lookup built just before
    the Java call — a confirmed match only carries an erpPaymentId, not the
    claimed date/narration needed to derive posting lag and reference
    compliance, so those must be recovered from the request payload itself
    rather than re-queried.
    """
    from .models import DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
    from .reconciliation_utils import (
        _BANK_REFERENCE_RE,
        get_or_create_bank_only_exception,
        get_or_create_erp_only_exception,
    )

    # A windowed run can surface an exception whose own date differs from
    # reconciliation_date. It's only persisted against the DailyReconciliation
    # for THAT date, and only if one already exists — otherwise it's skipped
    # for now and will surface naturally once that date gets its own run.
    # Defined before the matches block below (not just the exceptions_data
    # loop it originally served) since the confidence gate needs it too.
    recon_by_date = {reconciliation_date: recon}

    def get_target_recon(own_date):
        if own_date is None:
            return recon
        if own_date not in recon_by_date:
            recon_by_date[own_date] = DailyReconciliation.objects.filter(
                bank_account=bank_account, reconciliation_date=own_date,
            ).select_related('owner__tenant', 'branch').first()
        return recon_by_date[own_date]

    # --- persist confirmed matches onto ReconciliationBankTransaction ---
    # Only HIGH confidence is auto-committed — see AUTO_MATCH_MIN_CONFIDENCE.
    # A match entry with no erpPaymentId at all is ALSO never auto-committed,
    # regardless of confidence — Java claiming HIGH confidence in a "match"
    # that names no actual ERP payment is a malformed response, and
    # committing it would set matched=True with matched_erp_payment_id=NULL:
    # a row that claims to be matched to literally nothing, invisible to
    # every tool that looks for unmatched (matched=False) rows. Found in
    # production and repaired by repair_matched_with_no_erp_payment.
    def is_auto_committable(m):
        return (
            (m.get('confidence') or '').upper() == AUTO_MATCH_MIN_CONFIDENCE
            and m.get('erpPaymentId') is not None
        )

    all_matches_data = outcome.get('matches', [])
    matches_data = [m for m in all_matches_data if is_auto_committable(m)]
    low_confidence_matches = [m for m in all_matches_data if not is_auto_committable(m)]

    for m in all_matches_data:
        if (m.get('confidence') or '').upper() == AUTO_MATCH_MIN_CONFIDENCE and m.get('erpPaymentId') is None:
            logger.warning(
                "run_reconciliation_match: recon %s — Java reported a %s-confidence "
                "match for bank tx %s with NO erpPaymentId — malformed response, "
                "treating as unmatched instead of committing.",
                recon.id, AUTO_MATCH_MIN_CONFIDENCE, m.get('bankTransactionId'),
            )
    matched_txs = []
    if matches_data:
        match_by_id = {m['bankTransactionId']: m for m in matches_data}
        matched_txs = [tx for tx in candidates if str(tx.id) in match_by_id]

        # Batched the same way exception officer/branch resolution is below
        # — one query for every matched ERP payment id in this run, not one
        # per transaction.
        matched_erp_payment_ids = [
            m.get('erpPaymentId') for m in matches_data if m.get('erpPaymentId') is not None
        ]
        matched_officer_map = _batch_resolve_officers(matched_erp_payment_ids)

        for tx in matched_txs:
            m = match_by_id[str(tx.id)]
            tx.matched = True
            tx.match_confidence = m.get('confidence', '')
            tx.matched_erp_payment_id = m.get('erpPaymentId')
            tx.matched_at = now

            # Accountability signals — see the fields' own comments in
            # models.py. Only derivable when Java's match actually names an
            # ERP payment id we recognize from this run's own request.
            erp_info = erp_payments_by_id.get(tx.matched_erp_payment_id)
            if erp_info is not None:
                erp_date = date.fromisoformat(erp_info['paymentDate'])
                tx.posting_lag_days = (tx.value_date - erp_date).days
                narration = erp_info.get('narration') or ''
                tx.matched_erp_had_reference = bool(_BANK_REFERENCE_RE.search(narration))
                officer, _erp_branch = matched_officer_map.get(tx.matched_erp_payment_id, (None, None))
                tx.matched_erp_officer = officer
        ReconciliationBankTransaction.objects.bulk_update(
            matched_txs, [
                'matched', 'match_confidence', 'matched_erp_payment_id', 'matched_at',
                'posting_lag_days', 'matched_erp_had_reference', 'matched_erp_officer',
            ]
        )

    # --- surface rejected (below-threshold) matches as review candidates ---
    # tx stays matched=False — Java's guess is NOT trusted — but both halves
    # (the bank line and the ERP payment it guessed at) are opened as an
    # ordinary bank_only/erp_only exception pair, exactly the shape
    # ReconciliationBankTransaction.unmatch() produces for an undone bad
    # match, and just as linkable via the existing manual Link picker. This
    # is what turns Java's rejected guess into a fast one-click confirmation
    # instead of a director having to notice the amount/date coincidence
    # themselves from a cold start.
    if low_confidence_matches:
        candidates_by_id = {str(tx.id): tx for tx in candidates}
        for m in low_confidence_matches:
            tx = candidates_by_id.get(m.get('bankTransactionId'))
            if tx is None or tx in matched_txs:
                continue
            target_recon = get_target_recon(tx.value_date)
            if target_recon is None:
                continue
            get_or_create_bank_only_exception(target_recon, tx)
            erp_payment_id = m.get('erpPaymentId')
            if erp_payment_id is not None:
                # In-memory only — tx is never saved with this value, so
                # ReconciliationBankTransaction.matched_erp_payment_id stays
                # NULL until a director (or a later HIGH-confidence rerun)
                # actually confirms the match.
                tx.matched_erp_payment_id = erp_payment_id
                get_or_create_erp_only_exception(target_recon, tx)

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
        ).update(resolved=True, resolved_at=now, resolution_notes=AUTO_RESOLVE_NOTE)
    if matched_erp_ids:
        ReconciliationException.objects.filter(
            reconciliation__bank_account=bank_account,
            loan_payment_id__in=matched_erp_ids,
            exception_type='erp_only',
            resolved=False,
        ).update(resolved=True, resolved_at=now, resolution_notes=AUTO_RESOLVE_NOTE)

    exceptions_data = outcome.get('exceptions', [])

    # Batch-load all ERP transactions referenced by this outcome in one query
    # so officer/branch resolution is O(1) per exception, not one DB hit each.
    all_loan_payment_ids = [
        e['loanPaymentId'] for e in exceptions_data if e.get('loanPaymentId') is not None
    ]
    officer_map = _batch_resolve_officers(all_loan_payment_ids)

    # Directors are stable within a single task run — load them once and
    # pass the list into the notification helper rather than re-querying
    # per bank_only/erp_only exception.
    directors = _load_directors(recon)

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
        # already reported — resolved or not. Deliberately NOT filtering on
        # resolved=False here: a bank line whose exception a director already
        # resolved (e.g. "this is a bank fee, no ERP entry needed") stays
        # matched=False on ReconciliationBankTransaction forever, so it keeps
        # coming back from Java as bank_only on every future rerun. Filtering
        # by resolved=False meant get_or_create could never find that
        # already-resolved row and created a fresh duplicate every time,
        # silently reopening work a director had already closed out and
        # inflating unmatched_bank_count/unmatched_erp_count (counted from
        # unresolved exceptions — see the aggregation below) past the real
        # number of outstanding bank lines.
        # get_or_create closes the TOCTOU race where two concurrent tasks
        # with overlapping windows both pass an .exists() check and each try
        # to insert the same row — the database unique constraint (or
        # IntegrityError on the second insert) is the correct enforcement
        # point, not a pre-check in Python.
        dedup_filter = {'reconciliation': target_recon, 'exception_type': exc_type}
        if exc_type == 'bank_only':
            dedup_filter['bank_transaction_id'] = bank_transaction_id
        elif exc_type == 'erp_only':
            dedup_filter['loan_payment_id'] = loan_payment_id
        else:  # amount_diff
            dedup_filter['bank_transaction_id'] = bank_transaction_id
            dedup_filter['loan_payment_id'] = loan_payment_id

        officer, erp_branch = officer_map.get(loan_payment_id, (None, None))

        exc_obj, created = ReconciliationException.objects.get_or_create(
            **dedup_filter,
            defaults={
                'direction':           exc_item.get('direction') or 'CREDIT',
                'bank_transaction_id': bank_transaction_id,
                'bank_amount':         exc_item.get('bankAmount') or None,
                'bank_narration':      exc_item.get('bankNarration') or '',
                'bank_date':           exc_item.get('bankDate') or None,
                'loan_payment_id':     loan_payment_id,
                'erp_amount':          exc_item.get('erpAmount') or None,
                'erp_narration':       exc_item.get('erpNarration') or '',
                'erp_date':            exc_item.get('erpDate') or None,
                'officer':             officer,
                'erp_branch':          erp_branch,
                # bank_only ("bank has cash the ERP doesn't know about") and
                # erp_only ("recorded as paid but never actually banked") are
                # both serious cash-accountability signatures — the latter is
                # arguably the more dangerous of the two for someone actively
                # trying to hide something, since it's a clean paper trail for
                # money that was never really moved. amount_diff is a milder,
                # more often-innocent discrepancy and stays normal priority.
                'is_high_priority':    (exc_type in ('bank_only', 'erp_only')),
            },
        )

        # Defense-in-depth against a cross-reconciliation race: two dates'
        # windows commonly overlap (±RECONCILIATION_MATCH_WINDOW_DAYS), so a
        # DIFFERENT date's run can match this exact bank line/ERP payment
        # between when this run's own exclude_payment_ids snapshot was taken
        # (top of run_reconciliation_match) and this point — or this row can
        # already be a stale exception from exactly that race on an earlier
        # run. The auto-resolve step above only catches exceptions that
        # existed BEFORE a match was found in the SAME run; it can't catch
        # one born after, on a different run, for something already matched.
        # Re-check live state right here instead of trusting the snapshot.
        already_matched = False
        if not exc_obj.resolved and exc_type == 'bank_only' and bank_transaction_id:
            already_matched = ReconciliationBankTransaction.objects.filter(
                pk=bank_transaction_id, matched=True,
            ).exists()
        elif not exc_obj.resolved and exc_type == 'erp_only' and loan_payment_id:
            already_matched = ReconciliationBankTransaction.objects.filter(
                matched_erp_payment_id=loan_payment_id, matched=True,
            ).exists()

        if already_matched:
            exc_obj.resolved = True
            exc_obj.resolved_at = now
            exc_obj.resolution_notes = AUTO_RESOLVE_NOTE
            exc_obj.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])
            continue

        if created and exc_type in ('bank_only', 'erp_only'):
            _notify_directors_of_high_priority_exception(target_recon, exc_obj, directors)

    # --- recompute per-date counts for every reconciliation touched this
    # run — Java's aggregate counts span the whole window, so they can't be
    # trusted verbatim for any single date's summary.
    from .reconciliation_utils import recompute_reconciliation_counts

    for touched_recon in {r for r in recon_by_date.values() if r is not None}:
        recompute_reconciliation_counts(touched_recon)
        if touched_recon.id == recon.id:
            touched_recon.status = 'completed'
            touched_recon.save(update_fields=['status', 'updated_at'])


def _batch_resolve_officers(loan_payment_ids):
    """
    Bulk-load ERP transactions for all exception loan_payment_ids in one
    query and return a dict mapping id → (user, branch).  Callers get O(1)
    lookup per exception instead of one DB round-trip each.
    """
    if not loan_payment_ids:
        return {}
    from transactions.models import Transaction

    result = {}
    for txn in (
        Transaction.objects
        .filter(pk__in=loan_payment_ids)
        .select_related('created_by', 'created_by__branch')
    ):
        officer = txn.created_by if txn.created_by_id else None
        branch = getattr(txn.created_by, 'branch', None) if officer else None
        result[txn.pk] = (officer, branch)
    return result


def _load_directors(recon):
    """
    Return the list of active directors for the reconciliation's tenant.
    Called once per task run so the notification helper doesn't re-query
    for every high-priority exception in the same outcome.
    Returns an empty list on any configuration gap.
    """
    if recon.owner_id is None or recon.owner.tenant_id is None:
        logger.warning(
            "run_reconciliation_match: cannot load directors for recon %s — no owner/tenant",
            recon.id,
        )
        return []

    from common.approval_permissions import APPROVER_ROLES
    from django.contrib.auth import get_user_model

    User = get_user_model()
    return list(
        User.objects.filter(
            tenant=recon.owner.tenant, is_active=True,
            roles__name__in=APPROVER_ROLES, roles__is_active=True,
        ).distinct()
    )


def _notify_directors_of_high_priority_exception(recon, exc_obj, directors):
    """
    bank_only ("bank has cash the ERP doesn't know about") and erp_only
    ("recorded as paid but never actually banked") are both serious cash-
    accountability signatures — notify every director in the tenant for
    either, not just leave it sitting in a queue.

    `directors` is pre-loaded by the caller (once per task run) so this
    function never issues a User query of its own.
    """
    if not directors:
        return

    from notifications.services import NotificationService

    if exc_obj.exception_type == 'bank_only':
        amount, exc_date, narration = exc_obj.bank_amount, exc_obj.bank_date, exc_obj.bank_narration
        type_label = 'Unexplained bank credit'
    else:  # erp_only
        amount, exc_date, narration = exc_obj.erp_amount, exc_obj.erp_date, exc_obj.erp_narration
        type_label = 'Recorded payment not found in bank statement'

    # NotificationTemplate.validate_variables()/_prepare_context() resolve
    # every declared template_variables entry via its 'source' dotted path
    # against this dict (see notifications/models.py) — 'exception.amount'
    # needs context['exception'] to be an object/dict with an amount key,
    # not a flat top-level key. But this same dict is ALSO stored verbatim
    # as Notification.context_data, a plain JSONField with no custom
    # encoder — so it must stay JSON-serializable throughout, which rules
    # out nesting the actual ReconciliationException/Branch model instances
    # (only their needed fields, as plain dicts/strings).
    #
    # The raw context key holding branch info is deliberately named
    # 'recon_branch', NOT 'branch' — _prepare_context() does
    # prepared.update(context) AFTER resolving declared template_variables,
    # so a raw context key with the SAME name as a declared variable
    # silently overwrites the resolved value. A 'branch' variable resolving
    # via source='branch.name' next to a raw context['branch'] dict meant
    # {{branch}} rendered as a literal Python dict repr instead of the
    # branch name — exactly that collision, found while adding this.
    #
    # exc_obj is the in-memory instance .create() just returned, not a
    # fresh row re-fetched from the DB — Django doesn't coerce a DateField
    # assignment to an actual date object until that round-trip happens, so
    # exc_date is still whatever raw type was passed in (a plain ISO string
    # here, since that's what Java's JSON sends). str() normalizes either a
    # real date or an already-ISO string to the same result, unlike
    # .isoformat() which only the former has.
    context = {
        'bank_account': str(recon.bank_account),
        'exception': {
            'type_label': type_label,
            'amount': str(amount) if amount is not None else None,
            'narration': narration,
            'date': str(exc_date) if exc_date else None,
            'officer': exc_obj.officer.get_full_name() if exc_obj.officer else None,
        },
        'recon_branch': {'name': recon.branch.name} if recon.branch else None,
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

    include_debits is read from the persisted model field so a watchdog
    re-run honours the original upload intent rather than silently
    downgrading to credit-only. Tasks are staggered 15 seconds apart to
    avoid a thundering herd hitting Java simultaneously when several
    statements were in-flight during a worker restart.
    """
    from .models import DailyReconciliation

    cutoff = tz.now() - timedelta(minutes=STUCK_RECONCILIATION_THRESHOLD_MINUTES)
    stuck = list(DailyReconciliation.objects.filter(status='processing', updated_at__lt=cutoff))

    for i, recon in enumerate(stuck):
        logger.warning(
            "requeue_stuck_reconciliations: recon %s stuck at 'processing' since %s — re-queuing",
            recon.id, recon.updated_at,
        )
        run_reconciliation_match.apply_async(
            args=[recon.id, recon.include_debits],
            countdown=i * 15,
        )

    if stuck:
        logger.info("requeue_stuck_reconciliations: re-queued %d stuck reconciliation(s)", len(stuck))
    return len(stuck)


@shared_task(name='banks.tasks.escalate_aging_reconciliation_exceptions')
def escalate_aging_reconciliation_exceptions():
    """
    Periodic backstop (see CELERY_BEAT_SCHEDULE) — flags any
    ReconciliationException still unresolved past
    RECONCILIATION_EXCEPTION_AGING_DAYS as high-priority, regardless of
    exception_type. Only bank_only/erp_only start high-priority at creation
    time (see _persist_outcome's is_high_priority assignment above) —
    amount_diff never does, and anything simply neglected past the
    threshold otherwise has no mechanism to surface on its own.

    A plain bulk .update() — idempotent, safe to re-run; only touches rows
    still is_high_priority=False, so it never re-flags or overwrites a
    director's prior review.
    """
    from .models import ReconciliationException

    days = getattr(django_settings, 'RECONCILIATION_EXCEPTION_AGING_DAYS', 3)
    cutoff = tz.now() - timedelta(days=days)

    updated = ReconciliationException.objects.filter(
        resolved=False, is_high_priority=False, created_at__lte=cutoff,
    ).update(is_high_priority=True)

    if updated:
        logger.info(
            "escalate_aging_reconciliation_exceptions: flagged %d exception(s) unresolved past %d day(s)",
            updated, days,
        )
    return updated
