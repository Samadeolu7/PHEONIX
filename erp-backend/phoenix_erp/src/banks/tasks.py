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

import requests as http_requests
from celery import shared_task
from django.conf import settings as django_settings
from django.utils import timezone as tz

logger = logging.getLogger(__name__)


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
        recon = DailyReconciliation.objects.select_related('bank_account').get(pk=reconciliation_id)
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

    # Re-query the candidate pool fresh (not whatever the view saw at upload
    # time) — it must reflect the current unmatched state at the moment this
    # task actually runs, since queueing and execution aren't instantaneous.
    candidates = list(ReconciliationBankTransaction.objects.filter(
        bank_account=bank_account,
        value_date=reconciliation_date,
        matched=False,
    ))

    erp_credit_payments = fetch_erp_payments(bank_account, reconciliation_date, direction='CREDIT')
    erp_debit_payments = (
        fetch_erp_payments(bank_account, reconciliation_date, direction='DEBIT')
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

    # --- persist confirmed matches onto ReconciliationBankTransaction ---
    matches_data = outcome.get('matches', [])
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

    # --- save exceptions from Java response ---
    exceptions_data = outcome.get('exceptions', [])
    for exc_item in exceptions_data:
        ReconciliationException.objects.create(
            reconciliation=recon,
            exception_type=exc_item.get('exceptionType', 'bank_only'),
            direction=exc_item.get('direction') or 'CREDIT',
            bank_transaction_id=exc_item.get('bankTransactionId') or None,
            bank_amount=exc_item.get('bankAmount') or None,
            bank_narration=exc_item.get('bankNarration') or '',
            bank_date=exc_item.get('bankDate') or None,
            loan_payment_id=exc_item.get('loanPaymentId') or None,
            erp_amount=exc_item.get('erpAmount') or None,
            erp_narration=exc_item.get('erpNarration') or '',
            erp_date=exc_item.get('erpDate') or None,
        )

    # --- update reconciliation with final counts ---
    recon.matched_count        = outcome.get('matchedCount', 0)
    recon.unmatched_bank_count = outcome.get('unmatchedBankCount', 0)
    recon.unmatched_erp_count  = outcome.get('unmatchedErpCount', 0)
    recon.status               = 'completed'
    recon.save(update_fields=[
        'matched_count', 'unmatched_bank_count', 'unmatched_erp_count',
        'status', 'updated_at',
    ])
    logger.info(
        "run_reconciliation_match: recon %s completed — %d matched, %d bank-only, %d erp-only",
        recon.id, recon.matched_count, recon.unmatched_bank_count, recon.unmatched_erp_count,
    )
