"""
Management command: audit_tenant_drift

Read-only audit for historical drift caused by the class of bug fixed across
~80 `.objects.create()` call sites in this codebase: writes that didn't pass
`tenant=` explicitly and fell back to whatever thread-local tenant happened
to be active (or None) at creation time, instead of the tenant the record
logically belongs to (see loans/schedule_service.py and the accompanying
sweep across loans/cash_management/savings/expenses/incomes/inventory/
liabilities/receivables/clients/accounts/automations/reports/dashboards).

By default this command makes NO changes. For a curated list of parent/child
relationships, it reports how many existing rows have a `tenant` that
disagrees with (or is NULL while) their logical parent's tenant is set.
Those rows predate the fix and won't self-heal — a mismatched/NULL tenant on
a row makes it invisible to tenant-scoped queries (OwnerBranchManager),
which is exactly the mechanism that silently broke loan repayment schedules
before this fix.

Pass --fix to correct the parent/child checks (sets child.tenant =
parent.tenant on mismatched rows). This only rewrites the `tenant` FK — it
never touches money, balances, or any other field. The "Transaction vs its
GL account tenants" check is report-only even with --fix: a Transaction can
have multiple GL lines, so which account's tenant is "correct" isn't always
unambiguous the way a single parent FK is — inspect those manually.

Usage:
    python manage.py audit_tenant_drift
    python manage.py audit_tenant_drift --samples 20   # show N example rows per check
    python manage.py audit_tenant_drift --samples 0     # counts only, no row detail
    python manage.py audit_tenant_drift --fix           # correct parent/child mismatches
"""

from django.core.management.base import BaseCommand
from django.db.models import Q, F


class Command(BaseCommand):
    help = (
        "Find (and optionally fix) rows whose tenant disagrees with (or is NULL while) "
        "their logical parent's tenant is set."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--samples', type=int, default=10,
            help='Number of example rows to print per check (0 = counts only).',
        )
        parser.add_argument(
            '--fix', action='store_true',
            help='Set child.tenant = parent.tenant on mismatched rows for the parent/child '
                 'checks (does not apply to the Transaction-vs-GL-account check).',
        )

    def handle(self, *args, **options):
        samples = options['samples']
        do_fix = options['fix']
        self.stdout.write(
            "Tenant drift audit" + (" — applying fixes" if do_fix else " (read-only — no changes made)")
        )
        self.stdout.write("=" * 70)

        total = 0
        fixed = 0
        total += self._check_transaction_vs_gl_accounts(samples)
        for app_label, model_name, parent_field, kwargs in [
            ('loans', 'LoanRepaymentSchedule', 'loan', dict(
                note="Repair tool already exists: python manage.py fix_schedule_tenant_mismatch --fix",
            )),
            ('cash_management', 'CashierAccount', 'account', {}),
            ('accounts', 'Account', 'parent', dict(parent_optional=True)),
            ('reports', 'ReportParameter', 'template', {}),
            ('reports', 'ReportColumn', 'template', {}),
            ('reports', 'ReportChart', 'template', {}),
            ('dashboards', 'Widget', 'dashboard', {}),
            ('assets', 'AssetDepreciation', 'asset', {}),
            ('receivables', 'ReceivableActivityLog', 'receivable', {}),
        ]:
            count, num_fixed = self._check_child_vs_parent(
                app_label, model_name, parent_field, samples, do_fix=do_fix, **kwargs
            )
            total += count
            fixed += num_fixed

        self.stdout.write("\n" + "=" * 70)
        if do_fix:
            self.stdout.write(self.style.SUCCESS(f"Fixed {fixed}/{total} drifted rows (Transaction check is report-only)."))
        elif total:
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

    def _check_child_vs_parent(
        self, app_label, model_name, parent_field, samples,
        parent_optional=False, note=None, do_fix=False,
    ):
        """
        Generic check: rows of app_label.model_name whose `tenant` disagrees
        with (or is NULL while) `<parent_field>.tenant` is set.

        Returns (count_found, count_fixed).
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
        rows = list(mismatched.select_related(parent_field))
        count = len(rows)
        self.stdout.write(f"Rows with tenant mismatch: {count}")

        if count and samples:
            for row in rows[:samples]:
                parent_obj = getattr(row, parent_field)
                self.stdout.write(
                    f"  {model_name}#{row.pk} tenant={row.tenant_id} "
                    f"{parent_field}.tenant={parent_obj.tenant_id if parent_obj else None}"
                )

        num_fixed = 0
        if do_fix and count:
            for row in rows:
                parent_obj = getattr(row, parent_field)
                row.tenant = parent_obj.tenant
                row.save(update_fields=['tenant'])
                num_fixed += 1
            self.stdout.write(self.style.SUCCESS(f"  Fixed {num_fixed}/{count} rows."))

        return count, num_fixed
