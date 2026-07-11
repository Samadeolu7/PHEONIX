"""
Management command: audit_tenant_drift

Read-only audit for historical drift caused by the class of bug fixed across
~80 `.objects.create()` call sites in this codebase: writes that didn't pass
`tenant=` explicitly and fell back to whatever thread-local tenant happened
to be active (or None) at creation time, instead of the tenant the record
logically belongs to (see loans/schedule_service.py and the accompanying
sweep across loans/cash_management/savings/expenses/incomes/inventory/
liabilities/receivables/clients/accounts/automations/reports/dashboards).

This command makes NO changes. For a curated list of parent/child
relationships, it reports how many existing rows have a `tenant` that
disagrees with (or is NULL while) their logical parent's tenant is set.
Those rows predate the fix and won't self-heal — a mismatched/NULL tenant on
a row makes it invisible to tenant-scoped queries (OwnerBranchManager),
which is exactly the mechanism that silently broke loan repayment schedules
before this fix.

Usage:
    python manage.py audit_tenant_drift
    python manage.py audit_tenant_drift --samples 20   # show N example rows per check
    python manage.py audit_tenant_drift --samples 0     # counts only, no row detail
"""

from django.core.management.base import BaseCommand
from django.db.models import Q, F


class Command(BaseCommand):
    help = (
        "Read-only audit: find rows whose tenant disagrees with (or is NULL while) "
        "their logical parent's tenant is set. Reports only — makes no changes."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--samples', type=int, default=10,
            help='Number of example rows to print per check (0 = counts only).',
        )

    def handle(self, *args, **options):
        samples = options['samples']
        self.stdout.write("Tenant drift audit (read-only — no changes made)")
        self.stdout.write("=" * 70)

        total = 0
        total += self._check_transaction_vs_gl_accounts(samples)
        total += self._check_child_vs_parent(
            'loans', 'LoanRepaymentSchedule', 'loan', samples,
            note="Repair tool already exists: python manage.py fix_schedule_tenant_mismatch --fix",
        )
        total += self._check_child_vs_parent('cash_management', 'CashierAccount', 'account', samples)
        total += self._check_child_vs_parent('accounts', 'Account', 'parent', samples, parent_optional=True)
        total += self._check_child_vs_parent('reports', 'ReportParameter', 'template', samples)
        total += self._check_child_vs_parent('reports', 'ReportColumn', 'template', samples)
        total += self._check_child_vs_parent('reports', 'ReportChart', 'template', samples)
        total += self._check_child_vs_parent('dashboards', 'Widget', 'dashboard', samples)
        total += self._check_child_vs_parent('assets', 'AssetDepreciation', 'asset', samples)
        total += self._check_child_vs_parent('receivables', 'ReceivableActivityLog', 'receivable', samples)

        self.stdout.write("\n" + "=" * 70)
        if total:
            self.stdout.write(self.style.WARNING(f"Total drifted rows found across all checks: {total}"))
        else:
            self.stdout.write(self.style.SUCCESS("No drift found in any check."))

    def _unscoped(self, Model):
        """Return a queryset bypassing both soft-delete and tenant auto-filtering."""
        manager = getattr(Model, 'all_objects', Model.objects)
        if hasattr(manager, 'all_tenants'):
            return manager.all_tenants()
        return manager.all()

    def _check_transaction_vs_gl_accounts(self, samples):
        """
        Flags a Transaction whose tenant differs from (or is unset while) the
        tenant of an Account it posts to — the broadest net, since it catches
        drift from any of the GL-posting call sites across every app that were
        part of this fix, regardless of which module created the entry.
        """
        from transactions.models import TransactionEntry

        self.stdout.write("\n--- transactions.Transaction vs its GL account tenants ---")

        bad_entries = self._unscoped(TransactionEntry).filter(
            transaction__tenant__isnull=False,
        ).filter(
            Q(account__tenant__isnull=True) | ~Q(account__tenant_id=F('transaction__tenant_id'))
        ).select_related('transaction', 'account')

        txn_ids = list(bad_entries.values_list('transaction_id', flat=True).distinct())
        count = len(txn_ids)
        self.stdout.write(f"Transactions with at least one mismatched GL account tenant: {count}")

        if count and samples:
            seen = set()
            shown = 0
            for entry in bad_entries.order_by('transaction_id'):
                if entry.transaction_id in seen:
                    continue
                seen.add(entry.transaction_id)
                self.stdout.write(
                    f"  txn={entry.transaction_id} txn.tenant={entry.transaction.tenant_id} "
                    f"account={entry.account_id} account.tenant={entry.account.tenant_id} "
                    f"desc={entry.transaction.description[:60]!r}"
                )
                shown += 1
                if shown >= samples:
                    break
        return count

    def _check_child_vs_parent(self, app_label, model_name, parent_field, samples, parent_optional=False, note=None):
        """
        Generic check: rows of app_label.model_name whose `tenant` disagrees
        with (or is NULL while) `<parent_field>.tenant` is set.
        """
        from django.apps import apps

        Model = apps.get_model(app_label, model_name)

        self.stdout.write(f"\n--- {app_label}.{model_name} vs {parent_field}.tenant ---")
        if note:
            self.stdout.write(f"({note})")

        qs = self._unscoped(Model)
        if parent_optional:
            qs = qs.filter(**{f'{parent_field}__isnull': False})

        mismatched = qs.filter(**{f'{parent_field}__tenant__isnull': False}).filter(
            Q(tenant__isnull=True) | ~Q(tenant_id=F(f'{parent_field}__tenant_id'))
        )
        count = mismatched.count()
        self.stdout.write(f"Rows with tenant mismatch: {count}")

        if count and samples:
            for row in mismatched.select_related(parent_field)[:samples]:
                parent_obj = getattr(row, parent_field)
                self.stdout.write(
                    f"  {model_name}#{row.pk} tenant={row.tenant_id} "
                    f"{parent_field}.tenant={parent_obj.tenant_id if parent_obj else None}"
                )
        return count
