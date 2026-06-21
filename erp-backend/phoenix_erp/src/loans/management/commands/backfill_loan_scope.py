"""
Management command: backfill_loan_scope

Back-fills missing tenant and branch values on LoanDisbursement and
LoanRepaymentRequest records that were created before those fields were
consistently set by the request_disbursement / request_savings_repayment
actions.

Derives tenant/branch from the associated loan:
  disbursement.tenant = disbursement.loan.tenant
  disbursement.branch = disbursement.loan.branch

Usage:
    python manage.py backfill_loan_scope
    python manage.py backfill_loan_scope --dry-run
"""

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = 'Back-fill missing tenant/branch on LoanDisbursement and LoanRepaymentRequest.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Print what would change without saving.')

    def handle(self, *args, **options):
        from loans.models import LoanDisbursement, LoanRepaymentRequest

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('Dry-run mode — no changes saved.'))

        self._backfill(LoanDisbursement, 'all_objects', dry_run)
        self._backfill(LoanRepaymentRequest, 'objects', dry_run)

    def _backfill(self, Model, manager_name, dry_run):
        manager = getattr(Model, manager_name)
        records = manager.filter(
            __import__('django.db.models', fromlist=['Q']).Q(tenant__isnull=True)
            | __import__('django.db.models', fromlist=['Q']).Q(branch__isnull=True)
        ).select_related('loan')

        total = records.count()
        name = Model.__name__
        self.stdout.write(f'{name}: {total} records need back-fill.')

        updated = 0
        for rec in records:
            loan = getattr(rec, 'loan', None)
            if not loan:
                continue
            changed = False
            if rec.tenant is None and loan.tenant:
                rec.tenant = loan.tenant
                changed = True
            if rec.branch is None and loan.branch:
                rec.branch = loan.branch
                changed = True
            if changed:
                updated += 1
                if not dry_run:
                    with db_transaction.atomic():
                        rec.save(update_fields=['tenant', 'branch', 'updated_at'])
                else:
                    self.stdout.write(
                        f'  Would update {name} id={rec.pk}: '
                        f'tenant→{loan.tenant_id}, branch→{loan.branch_id}'
                    )

        verb = 'Would update' if dry_run else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{name}: {verb} {updated}/{total} records.'))
