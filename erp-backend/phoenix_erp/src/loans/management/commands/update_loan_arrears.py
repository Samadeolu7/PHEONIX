"""
Management command: update_loan_arrears

Marks overdue schedule installments and recalculates arrears for every
active/disbursed loan.  Run this once after deploying to backfill
existing loans that the Java batch never processed.

Usage:
    python manage.py update_loan_arrears
    python manage.py update_loan_arrears --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = 'Mark overdue installments and recalculate arrears for all active loans.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Print what would be updated without making any changes.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        dry_run = options['dry_run']
        loans = LoanAccount.all_objects.filter(
            status__in=['active', 'disbursed'],
            is_deleted=False,
        ).order_by('id')

        total = loans.count()
        self.stdout.write(f'Found {total} active/disbursed loans.')

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry-run mode — no changes will be saved.'))

        processed = 0
        errors = 0

        for loan in loans:
            try:
                if dry_run:
                    from django.utils import timezone
                    today = timezone.localdate()
                    overdue_count = loan.repayment_schedule.filter(
                        due_date__lt=today,
                        status__in=['pending', 'partial'],
                    ).count()
                    self.stdout.write(
                        f'  [{loan.loan_number}] would mark {overdue_count} installment(s) overdue'
                    )
                else:
                    with db_transaction.atomic():
                        loan._calculate_arrears()
                processed += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(
                    self.style.ERROR(f'  [{getattr(loan, "loan_number", loan.pk)}] FAILED: {exc}')
                )

        verb = 'Would update' if dry_run else 'Updated'
        self.stdout.write(
            self.style.SUCCESS(
                f'{verb} {processed}/{total} loans. Errors: {errors}.'
            )
        )
