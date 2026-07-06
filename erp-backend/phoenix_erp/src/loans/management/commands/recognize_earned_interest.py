"""
Management command: recognize_earned_interest

Recognizes deferred/unearned loan interest as it becomes genuinely earned, per the
repayment schedule's own due dates — the compromise between "book it immediately"
(client-visible, done at disbursement — see LoanAccount.disburse()) and "recognize
it only when due" (this command).

Only processes loans with `interest_deferral_active=True` (set once, at disbursement
time, based on whether the product had unearned_interest_income_account configured
then). Loans on the legacy flow are never touched by this command.

GL entry (LNACC series), one per schedule row recognized:
    Dr. Interest Receivable      (product.accrued_interest_account)     — ASSET
    Cr. Unearned Interest Income (product.unearned_interest_income_account) — LIABILITY,
        moves its balance back toward zero as interest is earned.

Only processes LoanRepaymentSchedule rows where due_date <= as_of_date and
interest_recognized=False, marking them interest_recognized=True afterward to
prevent double-posting.

Usage:
    python manage.py recognize_earned_interest
    python manage.py recognize_earned_interest --as-of 2026-06-30
    python manage.py recognize_earned_interest --dry-run
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone


class Command(BaseCommand):
    help = 'Recognize earned loan interest for schedule installments whose due date has passed.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')
        parser.add_argument('--as-of', help='Recognition date (YYYY-MM-DD). Defaults to today.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        dry_run = options['dry_run']

        if options.get('as_of'):
            from datetime import date
            as_of_date = date.fromisoformat(options['as_of'])
        else:
            as_of_date = timezone.localdate()

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no GL entries will be posted.'))

        loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed'],
            interest_deferral_active=True,
            is_deleted=False,
        ).select_related('product', 'branch', 'owner')

        total = loans.count()
        self.stdout.write(f'Recognizing earned interest for {total} loans as of {as_of_date}…')

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series = None
        if not dry_run:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNACC',
                defaults={'description': 'Loan Interest Recognition (earned)'},
            )

        posted = 0
        skipped = 0
        errors = 0

        for loan in loans:
            receivable_account = loan.product.accrued_interest_account
            unearned_account = loan.product.unearned_interest_income_account

            if not receivable_account or not unearned_account:
                skipped += 1
                continue

            due_rows = loan.repayment_schedule.filter(
                due_date__lte=as_of_date,
                interest_recognized=False,
                interest_written_off=False,
                interest_due__gt=0,
            )
            amount = due_rows.aggregate(total=Sum('interest_due'))['total'] or Decimal('0.00')
            if amount <= 0:
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(
                    f'  [{loan.loan_number}] would recognize ₦{amount} '
                    f'({due_rows.count()} installment(s) due by {as_of_date})'
                )
                posted += 1
                continue

            try:
                with db_transaction.atomic():
                    journal = JournalEntry.objects.create(
                        series=series,
                        date=as_of_date,
                        description=f'Interest recognition — {loan.loan_number}',
                        owner=loan.owner,
                        branch=loan.branch,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal,
                        account=receivable_account,
                        side=JournalEntryLine.DEBIT,
                        amount=amount,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal,
                        account=unearned_account,
                        side=JournalEntryLine.CREDIT,
                        amount=amount,
                    )
                    journal.post()

                    due_rows.update(
                        interest_recognized=True,
                        interest_recognized_at=timezone.now(),
                    )
                    posted += 1

            except Exception as exc:
                errors += 1
                self.stderr.write(
                    self.style.ERROR(f'  [{loan.loan_number}] FAILED: {exc}')
                )

        self.stdout.write(self.style.SUCCESS(
            f'Done. posted={posted} skipped={skipped} errors={errors}'
        ))
