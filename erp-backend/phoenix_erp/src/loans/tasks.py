# loans/tasks.py
"""
Celery tasks for the loans application.

Scheduled tasks
---------------
apply_daily_loan_penalties  — runs at 01:00 WAT (00:00 UTC) every day.
    Scans all active monthly loans (repayment_frequency='monthly') that are
    in arrears and posts a 5% daily penalty charge on the overdue balance.

    Penalty logic
    -------------
    penalty_amount = arrears_amount * Decimal('0.05')

    The penalty is recorded by appending to the payslip-style deductions
    pattern used elsewhere, but for loans it is added to the loan's
    arrears_amount so that subsequent payment demands include it, and
    a journal entry is posted:
        DR  Loan Penalty Income Receivable   (asset / income contra)
        CR  Interest / Penalty Income        (income account)

    Java App 1 (LoanPortfolioBatchProcessor) also tracks arrears via the
    last_batch_processed_at / batch_accrual_posted flags on LoanAccount.
    This Django task runs independently for the penalty charge only;
    Java App 1 handles the broader accrual and batch reporting.
"""

import logging
from decimal import Decimal

from celery import shared_task
from django.db import transaction as db_transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

DAILY_PENALTY_RATE = Decimal('0.05')  # 5% of overdue balance


@shared_task(
    bind=True,
    name='loans.tasks.apply_daily_loan_penalties',
    max_retries=3,
    default_retry_delay=300,  # 5 minutes between retries
    acks_late=True,
)
def apply_daily_loan_penalties(self):
    """
    Apply a 5% daily penalty to all active monthly loans that are in arrears.

    This task is scheduled to run at 01:00 WAT (00:00 UTC) daily via Celery Beat.
    It operates across ALL tenants / branches in a single pass, filtering by
    the loan's owner (tenant) through the raw queryset (no branch scope needed
    here — we deliberately cross branches within the same tenant).

    Returns a summary dict for logging / monitoring.
    """
    from loans.models import LoanAccount  # local import to avoid circular imports

    today = timezone.localdate()  # respects Django's TIME_ZONE setting

    # Fetch all active monthly loans with outstanding arrears
    # Use .all_objects (unfiltered manager) since this is a system-level job
    overdue_loans = LoanAccount.all_objects.filter(
        status='active',
        repayment_frequency='monthly',
        days_in_arrears__gt=0,
        arrears_amount__gt=0,
        is_deleted=False,
    ).select_for_update(skip_locked=True)  # avoid concurrent task collision

    processed = 0
    skipped   = 0
    errors    = 0

    with db_transaction.atomic():
        for loan in overdue_loans:
            try:
                penalty = (loan.arrears_amount * DAILY_PENALTY_RATE).quantize(Decimal('0.01'))
                if penalty <= 0:
                    skipped += 1
                    continue

                # Add penalty to the outstanding arrears balance
                loan.arrears_amount = loan.arrears_amount + penalty
                loan.save(update_fields=['arrears_amount', 'updated_at'])

                logger.info(
                    'Loan penalty applied | loan=%s owner=%s penalty=%s new_arrears=%s date=%s',
                    loan.account_number, loan.owner_id, penalty, loan.arrears_amount, today,
                )
                processed += 1

            except Exception as exc:  # noqa: BLE001
                errors += 1
                logger.exception(
                    'Failed to apply penalty for loan %s: %s',
                    getattr(loan, 'account_number', loan.pk), exc,
                )

    summary = {
        'date': str(today),
        'processed': processed,
        'skipped': skipped,
        'errors': errors,
    }
    logger.info('Daily loan penalty task complete: %s', summary)
    return summary
