"""
Management command: accrue_daily_interest

Implements accrual-basis interest recognition (Option A, daily granularity).
Run once per day for each active loan that has NOT been suspended:

GL entry (LNACC series):
    Dr. Accrued Interest Receivable (product.accrued_interest_account)   — ASSET
    Cr. Interest Income              (product.interest_income_account)    — INCOME

Only runs for loans where `batch_accrual_posted = False` to prevent double-posting.
Sets `batch_accrual_posted = True` and `last_batch_processed_at = now` after posting.

A companion reset command (or a period-close job) should set `batch_accrual_posted = False`
at the start of each day before this command runs.

Usage:
    python manage.py accrue_daily_interest
    python manage.py accrue_daily_interest --as-of 2026-06-30
    python manage.py accrue_daily_interest --dry-run
    python manage.py accrue_daily_interest --reset   # reset flags only (no GL posting)
"""
from decimal import Decimal, ROUND_HALF_UP

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


DAYS_PER_YEAR = Decimal('365')


def _daily_interest(principal: Decimal, annual_rate_pct: Decimal) -> Decimal:
    """Daily interest = principal × (annual_rate / 365)."""
    return (principal * annual_rate_pct / Decimal('100') / DAYS_PER_YEAR).quantize(
        Decimal('0.01'), rounding=ROUND_HALF_UP
    )


class Command(BaseCommand):
    help = 'Post daily interest accrual journal entries for all non-suspended active loans.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--as-of', help='Accrual date (YYYY-MM-DD). Defaults to today.')
        parser.add_argument(
            '--reset',
            action='store_true',
            help='Reset batch_accrual_posted=False on all active loans (no GL posting).',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        dry_run = options['dry_run']
        reset_only = options['reset']

        if options.get('as_of'):
            from datetime import date
            accrual_date = date.fromisoformat(options['as_of'])
        else:
            accrual_date = timezone.localdate()

        if reset_only:
            count = LoanAccount.all_objects.filter(
                status__in=['active', 'disbursed'],
                batch_accrual_posted=True,
                is_deleted=False,
            ).update(batch_accrual_posted=False)
            self.stdout.write(self.style.SUCCESS(f'Reset batch_accrual_posted on {count} loans.'))
            return

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no GL entries will be posted.'))

        loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed'],
            batch_accrual_posted=False,
            interest_suspended=False,
            outstanding_principal__gt=0,
            is_deleted=False,
        ).select_related('product', 'branch', 'owner')

        total = loans.count()
        self.stdout.write(f'Accruing daily interest for {total} loans on {accrual_date}…')

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series = None
        if not dry_run:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNACC',
                defaults={'description': 'Daily Interest Accruals'},
            )

        posted = 0
        skipped = 0
        errors = 0

        for loan in loans:
            accrued_account = loan.product.accrued_interest_account
            income_account = loan.product.interest_income_account

            if not accrued_account or not income_account:
                skipped += 1
                continue

            daily_amount = _daily_interest(loan.outstanding_principal, loan.interest_rate)
            if daily_amount <= 0:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f'  [{loan.loan_number}] would accrue ₦{daily_amount} '
                    f'(principal={loan.outstanding_principal}, rate={loan.interest_rate}%)'
                )
                posted += 1
                continue

            try:
                with db_transaction.atomic():
                    journal = JournalEntry.objects.create(
                        series=series,
                        date=accrual_date,
                        description=f'Daily interest accrual — {loan.loan_number}',
                        owner=loan.owner,
                        branch=loan.branch,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal,
                        account=accrued_account,
                        side=JournalEntryLine.DEBIT,
                        amount=daily_amount,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal,
                        account=income_account,
                        side=JournalEntryLine.CREDIT,
                        amount=daily_amount,
                    )
                    journal.post()

                    loan.batch_accrual_posted = True
                    loan.last_batch_processed_at = timezone.now()
                    loan.save(update_fields=['batch_accrual_posted', 'last_batch_processed_at', 'updated_at'])
                    posted += 1

            except Exception as exc:
                errors += 1
                self.stderr.write(
                    self.style.ERROR(f'  [{loan.loan_number}] FAILED: {exc}')
                )

        self.stdout.write(self.style.SUCCESS(
            f'Done. posted={posted} skipped={skipped} errors={errors}'
        ))
