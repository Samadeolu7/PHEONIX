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

CORRECTED 2026-07-24: Account.code is NOT globally unique — it's scoped per
branch (confirmed: two separate Account rows both with code '4211', one per
branch, same tenant). LoanProduct is branch-scoped too (BranchScopedModel),
so there can likewise be a separate "Monthly Loan" row per branch. The
original version of this command assumed exactly one Account and one
LoanProduct per product name and would either crash (Account.objects.get())
or silently skip (LoanProduct.MultipleObjectsReturned) once a second branch
existed. Now resolves BOTH per branch: for each LoanProduct row (whichever
branch it belongs to), the target account is looked up by (code, that same
branch) — never a different branch's account.

Usage:
    python manage.py fix_loan_penalty_account_mapping              # dry-run
    python manage.py fix_loan_penalty_account_mapping --confirm    # apply
"""
from django.core.management.base import BaseCommand


TARGET_ACCOUNT_CODE = '4211'
PRODUCT_NAMES = ['Daily Collection Loan', 'Weekly Loan', 'Monthly Loan']


class Command(BaseCommand):
    help = (
        'Repoint Daily/Weekly/Monthly LoanProduct.penalty_income_account from NULL '
        'to each branch\'s own "Loan Penalty (2026)" account (4211).'
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

        planned = []
        for product_name in PRODUCT_NAMES:
            products = LoanProduct.objects.select_related(
                'product', 'penalty_income_account', 'branch',
            ).filter(product__name=product_name, is_deleted=False)

            if not products.exists():
                self.stdout.write(self.style.WARNING(
                    f"No LoanProduct found for product name '{product_name}' — skipping."
                ))
                continue

            for lp in products:
                branch_label = lp.branch.name if lp.branch_id else 'NO BRANCH'

                try:
                    target_account = Account.objects.get(code=account_code, branch_id=lp.branch_id)
                except Account.DoesNotExist:
                    self.stdout.write(self.style.ERROR(
                        f"[{product_name} / branch={branch_label}] no Account with code "
                        f"'{account_code}' in this branch — skipping, needs manual setup."
                    ))
                    continue
                except Account.MultipleObjectsReturned:
                    self.stdout.write(self.style.ERROR(
                        f"[{product_name} / branch={branch_label}] multiple Account rows with code "
                        f"'{account_code}' in this branch — skipping, needs manual disambiguation."
                    ))
                    continue

                if target_account.account_type != Account.INCOME:
                    self.stdout.write(self.style.ERROR(
                        f"[{product_name} / branch={branch_label}] account {target_account.code} - "
                        f"{target_account.name} is not INCOME type — skipping."
                    ))
                    continue

                current = lp.penalty_income_account
                current_str = f'{current.code} - {current.name}' if current else 'NONE'
                if current and current.id == target_account.id:
                    self.stdout.write(self.style.SUCCESS(
                        f"[{product_name} / branch={branch_label}] already correctly set to "
                        f"{target_account.code} - {target_account.name}."
                    ))
                    continue

                self.stdout.write(
                    f"[{product_name} / branch={branch_label}] {current_str} -> "
                    f"{target_account.code} - {target_account.name} (account id={target_account.pk})"
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
