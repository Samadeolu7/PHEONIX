"""
management/commands/audit_branch_savings_setup.py

Diagnostic for "clients in branch X have no savings account". The
_create_default_savings_account signal (savings/signals.py) auto-opens a
SAV-REG savings account for every new client, but wraps the whole thing in
a blanket try/except that only logs failures — it never blocks client
creation, and never surfaces the failure anywhere staff would see it. A
branch that never had `clone-config` run against it (new branch, or config
was cloned after clients were already registered) is missing the '2140' GL
parent account and/or the SAV-REG Product — either one makes every client
registered in that branch silently end up with zero savings accounts.

Run this whenever a branch is reported missing savings accounts, or after
adding any new branch, to see exactly which branch(es) are missing what:

    python manage.py audit_branch_savings_setup

This is read-only. To fix a reported gap:
    - missing GL parent / product / config → run branch clone-config
      (or fix_missing_savings_product_config for a config-only gap)
    - clients already registered before the gap was fixed → run
      `python manage.py backfill_missing_default_savings`
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

_SAVINGS_PARENT_CODE = '2140'
_DEFAULT_SAVINGS_PRODUCT_CODE = 'SAV-REG'


class Command(BaseCommand):
    help = (
        "Audit every branch for the GL account / product config needed to "
        "auto-open default savings accounts, and count affected clients."
    )

    def handle(self, *args, **options):
        from accounts.models import Account
        from branches.models import Branch
        from clients.models import Client
        from products.models import Product
        from savings.models import SavingsAccount, SavingsProduct

        flagged = 0
        for branch in Branch.objects.select_related('tenant').order_by('tenant_id', 'name'):
            has_gl_parent = Account.objects.filter(
                code=_SAVINGS_PARENT_CODE,
                account_level=Account.LEVEL_PARENT,
                branch=branch,
                tenant=branch.tenant,
            ).exists()

            product = Product.objects.filter(
                product_type='SAVINGS',
                code=_DEFAULT_SAVINGS_PRODUCT_CODE,
                is_active=True,
                branch=branch,
                tenant=branch.tenant,
            ).first()
            has_product_config = bool(
                product and SavingsProduct.objects.filter(product=product).exists()
            )

            client_count = Client.objects.filter(branch=branch).count()
            missing_count = Client.objects.filter(branch=branch).exclude(
                pk__in=SavingsAccount.objects.exclude(status='closed').values_list('client_id', flat=True),
            ).count()

            issues = []
            if not has_gl_parent:
                issues.append(f"missing GL parent account '{_SAVINGS_PARENT_CODE}' (Customer Savings Deposits)")
            if not product:
                issues.append(f"missing active '{_DEFAULT_SAVINGS_PRODUCT_CODE}' savings product")
            elif not has_product_config:
                issues.append(f"'{_DEFAULT_SAVINGS_PRODUCT_CODE}' product has no SavingsProduct config row")

            if not (issues or missing_count):
                continue

            flagged += 1
            self.stdout.write(self.style.WARNING(
                f"\n[{branch.tenant.name}] {branch.name} (id={branch.pk}): "
                f"{client_count} client(s), {missing_count} missing a savings account"
            ))
            for issue in issues:
                self.stdout.write(self.style.ERROR(f"    - {issue}"))
            if not issues and missing_count:
                self.stdout.write(
                    "    - config looks fine now; the gap is from before it was fixed — "
                    "run `python manage.py backfill_missing_default_savings`"
                )

        if flagged == 0:
            self.stdout.write(self.style.SUCCESS(
                'Every branch has its savings GL account, product, and config, and every client has a savings account. ✓'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f"\n{flagged} branch(es) need attention — see gaps above. "
                f"Fix any config gaps (e.g. via clone-config), then run "
                f"`python manage.py backfill_missing_default_savings` for missing accounts."
            ))
