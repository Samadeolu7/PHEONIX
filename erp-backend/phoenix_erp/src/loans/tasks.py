# loans/tasks.py
"""
Celery tasks for the loans application.

Scheduled tasks
---------------
update_loan_status_task
    Runs daily via CELERY_BEAT_SCHEDULE. Thin wrapper around the
    `update_loan_status` management command — the single source of truth for
    arrears, CBN risk classification, interest suspension/reinstatement, and
    per-installment late-payment penalties (using each product's own configured
    penalty type/rate and grace period) — penalties are recognized as income
    on an accrual basis here (GL entries posted as they're assessed), not
    when the client eventually pays. See
    loans/management/commands/update_loan_status.py.

update_all_loan_arrears, apply_daily_loan_penalties
    Older, separate implementations of overlapping functionality. Left defined
    but intentionally NOT scheduled — apply_daily_loan_penalties in particular
    uses a cruder flat-daily-charge model (with a fixed-type-penalty fallback
    bug) that would fight with update_loan_status over outstanding_penalties if
    both ran. Kept only in case they're wanted again; do not schedule alongside
    update_loan_status_task.
"""

import logging
from decimal import Decimal

from celery import shared_task
from django.core.management import call_command
from django.db import transaction as db_transaction
from django.utils import timezone

logger = logging.getLogger(__name__)


@shared_task(
    bind=True,
    name='loans.tasks.update_loan_status_task',
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
def update_loan_status_task(self):
    """Daily wrapper around `python manage.py update_loan_status`."""
    call_command('update_loan_status')

DAILY_PENALTY_RATE = Decimal('0.05')  # 5% of overdue balance


@shared_task(
    bind=True,
    name='loans.tasks.update_all_loan_arrears',
    max_retries=3,
    default_retry_delay=60,
    acks_late=True,
)
def update_all_loan_arrears(self):
    """
    Daily arrears refresh: mark overdue installments and recalculate arrears
    for every active or disbursed loan.

    This task replaced the Java App 1 LoanPortfolioBatchProcessor.  It is
    intentionally kept simple — one atomic update per loan — so that a failure
    on one loan does not abort the entire batch.
    """
    from loans.models import LoanAccount  # avoid circular imports

    today = timezone.localdate()

    active_loans = LoanAccount.all_objects.filter(
        status__in=['active', 'disbursed'],
        is_deleted=False,
    )

    processed = 0
    skipped = 0
    errors = 0

    for loan in active_loans:
        try:
            with db_transaction.atomic():
                loan._calculate_arrears()  # also calls mark_overdue_installments()
            processed += 1
        except Exception as exc:  # noqa: BLE001
            errors += 1
            logger.exception(
                'Arrears update failed for loan %s: %s',
                getattr(loan, 'loan_number', loan.pk), exc,
            )

    summary = {
        'date': str(today),
        'processed': processed,
        'skipped': skipped,
        'errors': errors,
    }
    logger.info('Daily arrears update complete: %s', summary)
    return summary


@shared_task(
    bind=True,
    name='loans.tasks.apply_daily_loan_penalties',
    max_retries=3,
    default_retry_delay=300,
    acks_late=True,
)
def apply_daily_loan_penalties(self):
    """
    Apply a daily penalty to all active loans that are in arrears.

    Runs AFTER update_all_loan_arrears so that days_in_arrears and
    arrears_amount are current.  The penalty is added to the loan's
    outstanding_penalties field (not directly to arrears_amount).
    """
    from loans.models import LoanAccount

    today = timezone.localdate()

    overdue_loans = LoanAccount.all_objects.filter(
        status__in=['active', 'disbursed'],
        days_in_arrears__gt=0,
        arrears_amount__gt=0,
        is_deleted=False,
    ).select_for_update(skip_locked=True)

    processed = 0
    skipped = 0
    errors = 0

    with db_transaction.atomic():
        for loan in overdue_loans:
            try:
                # Only apply penalty if the product has a configured rate
                penalty_rate = DAILY_PENALTY_RATE
                try:
                    if loan.product and loan.product.late_payment_penalty_type == 'percentage':
                        penalty_rate = loan.product.late_payment_penalty / Decimal('100')
                except Exception:
                    pass  # fall back to default rate

                penalty = (loan.arrears_amount * penalty_rate).quantize(Decimal('0.01'))
                if penalty <= 0:
                    skipped += 1
                    continue

                loan.outstanding_penalties += penalty
                loan.save(update_fields=['outstanding_penalties', 'updated_at'])

                logger.info(
                    'Penalty applied | loan=%s penalty=%s new_outstanding_penalties=%s date=%s',
                    loan.loan_number, penalty, loan.outstanding_penalties, today,
                )
                processed += 1

            except Exception as exc:  # noqa: BLE001
                errors += 1
                logger.exception(
                    'Failed to apply penalty for loan %s: %s',
                    getattr(loan, 'loan_number', loan.pk), exc,
                )

    summary = {
        'date': str(today),
        'processed': processed,
        'skipped': skipped,
        'errors': errors,
    }
    logger.info('Daily loan penalty task complete: %s', summary)
    return summary
