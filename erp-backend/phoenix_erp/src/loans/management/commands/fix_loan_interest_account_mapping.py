"""
Management command: fix_loan_interest_account_mapping

Forward-looking fix only — does NOT touch any already-posted journal entries.
See `report_pooled_interest_misposting` for quantifying historical impact.

Confirmed via `audit_loan_interest_gl_mapping` (2026-07-07) that the three
core LoanProduct rows — "Daily Collection Loan", "Weekly Loan", "Monthly
Loan" — all have `interest_income_account` pointing at the shared generic
account 4200-LNINT ("Loan Interest Income"), instead of their own dedicated
accounts that already exist in the chart of accounts (4212 "Daily Loan
Interest (2026)", 4207 "Weekly Loan Interest (2026)", 4206 "Monthly Loan
Interest (2026)"). Traced the cause to commit ec25df5 (2026-07-06): these
three products previously had interest_income_account = NULL, and
`fix_legacy_loan_product_accounts.py` (added in the same commit) backfilled
every NULL FK to the generic 4200-LNINT fallback, without frequency
awareness. No code path in this repo has ever pointed these products at
4206/4207/4212 — this command is the first one that does.

Repoints each product from today onward. New disbursements/repayments will
post interest to the correct account; nothing already posted is corrected.

Usage:
    python manage.py fix_loan_interest_account_mapping              # dry-run
    python manage.py fix_loan_interest_account_mapping --confirm    # apply
"""
from django.core.management.base import BaseCommand, CommandError


PRODUCT_TO_ACCOUNT_CODE = {
    'Daily Collection Loan': '4212',
    'Weekly Loan': '4207',
    'Monthly Loan': '4206',
}


class Command(BaseCommand):
    help = (
        'Repoint Daily/Weekly/Monthly LoanProduct.interest_income_account from the '
        'shared 4200-LNINT fallback to their own dedicated GL accounts (4212/4207/4206).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--confirm', action='store_true',
            help='Apply the change. Without this flag, only a dry-run report runs.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanProduct
        from accounts.models import Account

        confirm = options['confirm']

        # Resolve target accounts up front — fail loudly if any is missing/misconfigured,
        # rather than partially applying the fix.
        target_accounts = {}
        for product_name, code in PRODUCT_TO_ACCOUNT_CODE.items():
            try:
                target_accounts[product_name] = Account.objects.get(code=code)
            except Account.DoesNotExist:
                raise CommandError(f"Account with code '{code}' not found — aborting, nothing changed.")

        planned = []
        for product_name, target_account in target_accounts.items():
            try:
                lp = LoanProduct.objects.select_related(
                    'product', 'interest_income_account'
                ).get(product__name=product_name, is_deleted=False)
            except LoanProduct.DoesNotExist:
                self.stdout.write(self.style.WARNING(
                    f"No LoanProduct found for product name '{product_name}' — skipping."
                ))
                continue
            except LoanProduct.MultipleObjectsReturned:
                self.stdout.write(self.style.ERROR(
                    f"Multiple LoanProduct rows found for product name '{product_name}' — "
                    f"skipping, needs manual disambiguation."
                ))
                continue

            current = lp.interest_income_account
            current_str = f'{current.code} - {current.name}' if current else 'NONE'
            if current and current.id == target_account.id:
                self.stdout.write(self.style.SUCCESS(
                    f"[{product_name}] already correctly set to {target_account.code} - {target_account.name}."
                ))
                continue

            self.stdout.write(
                f"[{product_name}] {current_str} -> {target_account.code} - {target_account.name}"
            )
            planned.append((lp, target_account))

        if not planned:
            self.stdout.write(self.style.SUCCESS('Nothing to change.'))
            return

        if not confirm:
            self.stdout.write(self.style.WARNING(
                f'DRY-RUN — would update {len(planned)} product(s). Re-run with --confirm to apply.'
            ))
            return

        for lp, target_account in planned:
            lp.interest_income_account = target_account
            lp.save(update_fields=['interest_income_account', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(f'Done. Updated {len(planned)} product(s).'))
