"""
Management command: fix_legacy_loan_product_accounts

One-time data fix for LoanProduct rows created by import_legacy_data.py before it
wired up interest_income_account. Without it:
  - LoanAccount.disburse() has no account to credit, so new loans never recognize
    interest at disbursement (the default behavior — see interest_recognized_at_disbursement).
  - LoanAccount.record_payment() falls back to crediting the Loan Receivable instead
    of Income for any payment collected in the meantime.
Either way, interest income silently never shows up as income at all for loans
under these products — old imported loans AND any new loan disbursed under them.

Points every LoanProduct with a null interest_income_account at the same
"Loan Interest Income" account (code 4200-LNINT) that import_legacy_data.py's
migration-year lump-sum entries already use, so ongoing and historical interest
income land in the same place. Idempotent — safe to re-run; only touches products
that still have interest_income_account unset.

Usage:
    python manage.py fix_legacy_loan_product_accounts
    python manage.py fix_legacy_loan_product_accounts --dry-run
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'One-time fix: point loan products missing interest_income_account at 4200-LNINT.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from accounts.models import Account
        from loans.models import LoanProduct

        dry_run = options['dry_run']

        products = LoanProduct.objects.filter(
            interest_income_account__isnull=True,
            is_deleted=False,
        ).select_related('product', 'branch', 'owner')

        total = products.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS('No loan products need fixing — nothing to do.'))
            return

        self.stdout.write(f'Found {total} loan product(s) missing interest_income_account…')
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY-RUN — no changes will be saved.'))

        fixed = 0
        errors = 0

        for product in products:
            try:
                income_parent = Account.objects.filter(
                    account_type=Account.INCOME,
                    account_level=Account.LEVEL_PARENT,
                    branch=product.branch,
                    is_deleted=False,
                ).first()

                account, created = Account.objects.get_or_create(
                    code="4200-LNINT",
                    tenant=getattr(product, 'tenant', None),
                    branch=product.branch,
                    defaults={
                        "name": "Loan Interest Income",
                        "account_type": Account.INCOME,
                        "account_level": Account.LEVEL_CHILD,
                        "parent": income_parent,
                        "owner": product.owner,
                        "created_by": product.owner,
                        "is_system_account": True,
                        "balance": Decimal("0.00"),
                        "balance_bf": Decimal("0.00"),
                    },
                )

                self.stdout.write(
                    f'  [{product.product.name}] → interest_income_account = '
                    f'{account.code} ({"created" if created else "existing"})'
                )
                if not dry_run:
                    product.interest_income_account = account
                    product.save(update_fields=['interest_income_account', 'updated_at'])
                fixed += 1

            except Exception as exc:
                errors += 1
                self.stderr.write(
                    self.style.ERROR(f'  [{product.product.name}] FAILED: {exc}')
                )

        self.stdout.write(self.style.SUCCESS(
            f'Done. fixed={fixed} errors={errors}'
        ))
