"""
Celery tasks for the Expenses module.

    post_due_prepaid_amortizations — daily @ 02:30 UTC (03:30 WAT).
        Releases prepaid expenses marked auto_amortize (e.g. rent paid in
        advance) to their expense account, one journal per month-end.
        Runs daily rather than monthly so a prepayment entered mid-month
        with a past start date is caught up the next morning; months
        already posted are skipped.
"""
import logging

from celery import shared_task
from django.utils import timezone

_log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True)
def post_due_prepaid_amortizations(self):  # noqa: ARG002
    from expenses.services.prepaid_amortization import (
        due_candidates, post_due_amortizations,
    )

    as_of = timezone.localdate()
    ids = list(due_candidates(as_of).values_list('id', flat=True))

    journals = 0
    errors = 0
    for prepaid_id in ids:
        try:
            journals += len(post_due_amortizations(prepaid_id, as_of))
        except Exception as exc:  # noqa: BLE001 - one bad record must not block the rest
            errors += 1
            _log.exception(
                'post_due_prepaid_amortizations: failed for PrepaidExpense pk=%s: %s',
                prepaid_id, exc,
            )

    result = {'candidates': len(ids), 'journals_posted': journals, 'errors': errors}
    _log.info('post_due_prepaid_amortizations: %s', result)
    return result
