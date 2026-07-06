"""
Management command: update_loan_status

Run daily (cron/Celery beat). For every active loan:
  1. Recalculates arrears (days_in_arrears, arrears_amount, overdue installments)
  2. Updates CBN risk classification + provision amount
  3. Suspends interest on loans crossing 90 DPD (CBN NPL rule)
  4. Reinstates interest when a loan cures below 90 DPD
  5. Applies late-payment penalties per product configuration
  6. Flags status='defaulted' for loans 90+ DPD (configurable via --default-threshold)

Usage:
    python manage.py update_loan_status
    python manage.py update_loan_status --dry-run
    python manage.py update_loan_status --default-threshold 90
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = 'Daily loan status update: arrears, classification, interest suspension, penalties.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument(
            '--default-threshold',
            type=int,
            default=90,
            help='DPD at which a loan is moved to defaulted status (default: 90).',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        dry_run = options['dry_run']
        default_threshold = options['default_threshold']
        today = timezone.localdate()

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no changes will be saved.'))

        loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed', 'defaulted'],
            is_deleted=False,
        ).select_related('product', 'branch', 'owner').order_by('id')

        total = loans.count()
        self.stdout.write(f'Processing {total} loans as of {today}…')

        stats = dict(updated=0, suspended=0, reinstated=0, penalised=0, defaulted=0, errors=0)

        for loan in loans:
            try:
                with db_transaction.atomic():
                    if dry_run:
                        db_transaction.set_rollback(True)

                    # 1. Recalculate arrears
                    loan._calculate_arrears()
                    loan.refresh_from_db()

                    # 2. Update risk classification
                    loan.update_risk_classification()

                    # 3. Interest suspension / reinstatement
                    if loan.days_in_arrears >= 90 and not loan.interest_suspended:
                        loan.suspend_interest(today=today)
                        stats['suspended'] += 1
                        self.stdout.write(
                            f'  [{loan.loan_number}] SUSPENDED interest ({loan.days_in_arrears} DPD)'
                        )
                    elif loan.days_in_arrears < 90 and loan.interest_suspended:
                        loan.reinstate_interest()
                        stats['reinstated'] += 1
                        self.stdout.write(
                            f'  [{loan.loan_number}] REINSTATED interest ({loan.days_in_arrears} DPD)'
                        )

                    # 4. Auto-penalty: apply to overdue installments. Recomputes from
                    # the current days_late every run (not gated on penalty_due=0) so
                    # a percentage-per-day penalty keeps growing as a loan stays
                    # overdue longer, instead of freezing at its first-assessed value.
                    # Only the delta is applied to outstanding_penalties since
                    # penalty_due is an absolute (not incremental) figure.
                    overdue_schedules = loan.repayment_schedule.filter(status='overdue')
                    penalty_total = Decimal('0.00')
                    for sched in overdue_schedules:
                        days_late = (today - sched.due_date).days
                        new_penalty = loan.product.calculate_late_penalty(
                            sched.total_due - sched.total_paid, days_late
                        )
                        delta = new_penalty - sched.penalty_due
                        if delta > 0:
                            sched.penalty_due = new_penalty
                            sched.save(update_fields=['penalty_due', 'updated_at'])
                            penalty_total += delta

                    if penalty_total > 0:
                        loan.outstanding_penalties += penalty_total
                        stats['penalised'] += 1

                    # 5. Mark defaulted at threshold
                    if (
                        loan.days_in_arrears >= default_threshold
                        and loan.status != 'defaulted'
                    ):
                        loan.status = 'defaulted'
                        stats['defaulted'] += 1
                        self.stdout.write(
                            f'  [{loan.loan_number}] → defaulted ({loan.days_in_arrears} DPD)'
                        )

                    loan.save(update_fields=[
                        'risk_classification', 'provision_pct', 'provision_amount',
                        'outstanding_penalties', 'status', 'updated_at',
                    ])
                    stats['updated'] += 1

            except Exception as exc:
                stats['errors'] += 1
                self.stderr.write(
                    self.style.ERROR(
                        f'  [{getattr(loan, "loan_number", loan.pk)}] FAILED: {exc}'
                    )
                )

        self.stdout.write(self.style.SUCCESS(
            f'Done. updated={stats["updated"]} suspended={stats["suspended"]} '
            f'reinstated={stats["reinstated"]} penalised={stats["penalised"]} '
            f'defaulted={stats["defaulted"]} errors={stats["errors"]}'
        ))
