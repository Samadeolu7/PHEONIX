"""
Management command: fix_loan_penalty_account_mapping

Forward-looking fix only — does NOT touch any already-posted journal
entries. See `audit_penalty_income_gl_mapping` for the read-only audit
that found this, and `draft_penalty_income_reclass` for correcting the
historical impact.

Confirmed via `audit_penalty_income_gl_mapping` (2026-07-24) that the three
core LoanProduct rows — "Daily Collection Loan", "Weekly Loan", "Monthly
Loan" — all have `penalty_income_account = NULL`. Unlike interest income
(which has dedicated per-product accounts 4206/4207/4212, see
`fix_loan_interest_account_mapping`), penalty income was designed as a
single shared account across all loan products (see `setup_microfinance.py`:
one child account "4201 Loan Penalty" under parent "4200 Penalty Income").
Account 4211 "Loan Penalty (2026)" is that shared account's annual-book
successor — not product-specific, so all three products repoint to the
same account here.

Because penalty_income_account is NULL today, LoanAccount.record_payment()
folds every penalty payment into the Loan Receivable credit instead of
Income (see loans/models.py ~line 1188) — real cash collected from
clients, just recognized on the wrong GL line.

Repoints each product from today onward. New repayments will post penalty
income to 4211; nothing already posted is corrected by this command.

Usage:
    python manage.py fix_loan_penalty_account_mapping              # dry-run
    python manage.py fix_loan_penalty_account_mapping --confirm    # apply
"""
from django.core.management.base import BaseCommand, CommandError


TARGET_ACCOUNT_CODE = '4211'
PRODUCT_NAMES = ['Daily Collection Loan', 'Weekly Loan', 'Monthly Loan']


class Command(BaseCommand):
    help = (
        'Repoint Daily/Weekly/Monthly LoanProduct.penalty_income_account from NULL '
        'to the shared "Loan Penalty (2026)" account (4211).'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-code', default=TARGET_ACCOUNT_CODE,
            help=f'GL account code to point penalty_income_account at (default: {TARGET_ACCOUNT_CODE}).',
        )
        parser.add_argument(
            '--confirm', action='store_true',
            help='Apply the change. Without this flag, only a dry-run report runs.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanProduct
        from accounts.models import Account

        confirm = options['confirm']
        account_code = options['account_code']

        try:
            target_account = Account.objects.get(code=account_code)
        except Account.DoesNotExist:
            raise CommandError(f"Account with code '{account_code}' not found — aborting, nothing changed.")

        if target_account.account_type != Account.INCOME:
            raise CommandError(
                f"Account {target_account.code} - {target_account.name} is not an INCOME account "
                f"(type={target_account.account_type}) — aborting, nothing changed."
            )

        planned = []
        for product_name in PRODUCT_NAMES:
            try:
                lp = LoanProduct.objects.select_related(
                    'product', 'penalty_income_account'
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

            current = lp.penalty_income_account
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
            lp.penalty_income_account = target_account
            lp.save(update_fields=['penalty_income_account', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(f'Done. Updated {len(planned)} product(s).'))
