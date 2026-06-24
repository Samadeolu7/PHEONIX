"""
Management command: backfill_loan_scope

Back-fills missing tenant and branch values on:
  - LoanAccount              (branch comes from loan.owner.branch or client.branch)
  - LoanRepaymentSchedule    (branch comes from parent loan)
  - LoanDisbursement         (branch comes from parent loan)
  - LoanRepaymentRequest     (branch comes from parent loan)

Also handles Client records with missing branch (branch from client.owner.branch).

Usage:
    python manage.py backfill_loan_scope
    python manage.py backfill_loan_scope --dry-run
    python manage.py backfill_loan_scope --model LoanAccount   # target one model
"""

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Q


class Command(BaseCommand):
    help = 'Back-fill missing tenant/branch on loan and client records.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true',
                            help='Print what would change without saving.')
        parser.add_argument('--model', default='all',
                            help='Target a single model (LoanAccount, LoanRepaymentSchedule, '
                                 'LoanDisbursement, LoanRepaymentRequest, Client). Default: all.')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        target = options['model'].lower()

        if dry_run:
            self.stdout.write(self.style.WARNING('Dry-run mode — no changes saved.'))

        all_targets = {
            'loanaccount': self._backfill_loan_accounts,
            'loanrepaymentschedule': self._backfill_child,
            'loandisbursement': self._backfill_child,
            'loanrepaymentrequest': self._backfill_child,
            'client': self._backfill_clients,
        }

        if target == 'all':
            for name, fn in all_targets.items():
                fn(name, dry_run)
        elif target in all_targets:
            all_targets[target](target, dry_run)
        else:
            self.stderr.write(f'Unknown model: {options["model"]}')
            self.stderr.write(f'Valid choices: {", ".join(all_targets)}')

    # ── LoanAccount ──────────────────────────────────────────────────────────

    def _backfill_loan_accounts(self, name, dry_run):
        from django.db import connection
        from loans.models import LoanAccount

        table = LoanAccount._meta.db_table
        table_cols = {col.name for col in connection.introspection.get_table_description(connection.cursor(), table)}
        missing = [c for c in ('tenant_id', 'branch_id') if c not in table_cols]
        if missing:
            self.stdout.write(self.style.WARNING(
                f'LoanAccount: skipping — columns not in DB: {missing}. Run pending migrations first.'
            ))
            return

        records = LoanAccount.objects.filter(
            Q(tenant__isnull=True) | Q(branch__isnull=True)
        ).select_related('owner', 'client', 'tenant')

        total = records.count()
        self.stdout.write(f'LoanAccount: {total} records need back-fill.')
        updated = 0

        for loan in records:
            changed = False

            # Infer tenant from owner
            if loan.tenant is None:
                tenant = getattr(loan.owner, 'tenant', None)
                if tenant:
                    loan.tenant = tenant
                    changed = True

            # Infer branch: owner's branch first, then client's branch
            if loan.branch is None:
                branch = getattr(loan.owner, 'branch', None)
                if branch is None and loan.client:
                    branch = getattr(loan.client, 'branch', None)
                if branch:
                    loan.branch = branch
                    changed = True

            if changed:
                updated += 1
                if not dry_run:
                    with db_transaction.atomic():
                        loan.save(update_fields=['tenant', 'branch', 'updated_at'])
                else:
                    self.stdout.write(
                        f'  Would update LoanAccount id={loan.pk} ({loan.loan_number}): '
                        f'tenant→{loan.tenant_id}, branch→{loan.branch_id}'
                    )

        verb = 'Would update' if dry_run else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'LoanAccount: {verb} {updated}/{total} records.'))

    # ── Child records (derive from parent loan) ───────────────────────────────

    def _backfill_child(self, model_key, dry_run):
        from django.db import connection
        from loans.models import (
            LoanRepaymentSchedule, LoanDisbursement, LoanRepaymentRequest
        )

        model_map = {
            'loanrepaymentschedule': (LoanRepaymentSchedule, 'objects', 'loan'),
            'loandisbursement': (LoanDisbursement, 'all_objects', 'loan'),
            'loanrepaymentrequest': (LoanRepaymentRequest, 'objects', 'loan'),
        }
        Model, manager_attr, loan_field = model_map[model_key]

        # Skip gracefully if the table hasn't been fully migrated yet
        table = Model._meta.db_table
        table_cols = {col.name for col in connection.introspection.get_table_description(connection.cursor(), table)}
        missing = [c for c in ('tenant_id', 'branch_id') if c not in table_cols]
        if missing:
            self.stdout.write(self.style.WARNING(
                f'{Model.__name__}: skipping — columns not yet in DB: {missing}. '
                f'Run pending migrations first.'
            ))
            return

        manager = getattr(Model, manager_attr)
        records = manager.filter(
            Q(tenant__isnull=True) | Q(branch__isnull=True)
        ).select_related(loan_field)

        total = records.count()
        self.stdout.write(f'{Model.__name__}: {total} records need back-fill.')
        updated = 0

        for rec in records:
            loan = getattr(rec, loan_field, None)
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
                        f'  Would update {Model.__name__} id={rec.pk}: '
                        f'tenant→{loan.tenant_id}, branch→{loan.branch_id}'
                    )

        verb = 'Would update' if dry_run else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'{Model.__name__}: {verb} {updated}/{total} records.'))

    # ── Client ────────────────────────────────────────────────────────────────

    def _backfill_clients(self, name, dry_run):
        from django.db import connection
        from clients.models import Client

        table = Client._meta.db_table
        table_cols = {col.name for col in connection.introspection.get_table_description(connection.cursor(), table)}
        missing = [c for c in ('tenant_id', 'branch_id') if c not in table_cols]
        if missing:
            self.stdout.write(self.style.WARNING(
                f'Client: skipping — columns not in DB: {missing}. Run pending migrations first.'
            ))
            return

        records = Client.objects.filter(
            Q(tenant__isnull=True) | Q(branch__isnull=True)
        ).select_related('owner')

        total = records.count()
        self.stdout.write(f'Client: {total} records need back-fill.')
        updated = 0

        for client in records:
            changed = False
            if client.tenant is None:
                tenant = getattr(client.owner, 'tenant', None)
                if tenant:
                    client.tenant = tenant
                    changed = True
            if client.branch is None:
                branch = getattr(client.owner, 'branch', None)
                if branch:
                    client.branch = branch
                    changed = True
            if changed:
                updated += 1
                if not dry_run:
                    with db_transaction.atomic():
                        client.save(update_fields=['tenant', 'branch', 'updated_at'])
                else:
                    self.stdout.write(
                        f'  Would update Client id={client.pk} ({client.full_name}): '
                        f'tenant→{client.tenant_id}, branch→{client.branch_id}'
                    )

        verb = 'Would update' if dry_run else 'Updated'
        self.stdout.write(self.style.SUCCESS(f'Client: {verb} {updated}/{total} records.'))
