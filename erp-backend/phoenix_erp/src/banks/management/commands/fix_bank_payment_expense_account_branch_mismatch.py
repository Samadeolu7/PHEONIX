"""
banks/management/commands/fix_bank_payment_expense_account_branch_mismatch.py
================================================================================
Finds (and, for the safe subset, fixes) BankPayment rows whose linked Expense
would fail GL posting with:

    Account "X" (code) belongs to branch "A", but this transaction (...) is
    for branch "B". An account can only receive postings from transactions
    in its own branch.

Root cause (fixed alongside this command)
------------------------------------------
transactions.TransactionEntry.clean() enforces `account.branch_id ==
transaction.branch_id`. BankPayment.post_payment() always creates its
JournalEntry with `branch=self.branch` (BankPayment.branch — always pinned
correctly to the reconciliation's own branch, never guessed). The debited
account is resolved by ExpenseAccountingService._get_expense_account():
`expense.category.expense_account` if the category has one, else a
`general_expense` system account scoped to `expense.branch`.

ResolveExceptionToExpenseView (banks/views.py) let the caller pick *any*
ExpenseCategory by id with no check that its expense_account's branch
matched the reconciliation's branch — a director with cross-branch access
could submit a category belonging to a different branch than the
reconciliation, producing exactly this mismatch. That view now validates
this up front (400, not a confusing GL error at approval time) — this
command is for the rows created before that validation existed.

This is a DIFFERENT bug from the one fixed by
fix_bank_charge_expense_branch_mismatch (which compares BankPayment.branch
against Expense.branch itself — relevant for the auto-provisioned
"BANKCHG" category pathway). This command compares BankPayment.branch
against the *resolved GL account's* branch, which is what actually blocks
posting and is unaffected by Expense.branch. Run both commands; they can
each find rows the other misses.

What this command fixes automatically
--------------------------------------
Only the case where the mismatched category is the auto-provisioned
"BANKCHG" (Bank Charges) category: reassigning the Expense to the
correct-branch BANKCHG category (get_or_create_bank_charges_category) is
mechanically safe and semantically identical — same purpose account, just
scoped to the right branch. This is likely also what a manually-picked
"BANKCHG" category from the wrong branch actually was, given that pathway
was primarily built for bank charges.

What it reports but does NOT touch
------------------------------------
Any other category mismatch — reassigning an arbitrary category is a
judgment call (does an equivalent category even exist in the correct
branch? was the category choice actually intentional and BankPayment.branch
the wrong one instead?) that needs a human, not a script guessing intent.
Also skipped: any match where the expense is already is_posted=True — that
shouldn't be reachable (the branch guard should have blocked posting), so
if found it needs manual review of the actual journal entry, not an
automatic reassignment after the fact.

Usage:
    python manage.py fix_bank_payment_expense_account_branch_mismatch --dry-run
    python manage.py fix_bank_payment_expense_account_branch_mismatch
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Finds BankPayment rows whose linked Expense would fail GL posting "
        "due to an account/transaction branch mismatch, and auto-fixes the "
        "safe subset (auto-provisioned 'BANKCHG' category picked from the "
        "wrong branch)."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from accounts.utils.account_creation import get_system_account
        from banks.models import BankPayment
        from banks.reconciliation_utils import get_or_create_bank_charges_category

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        candidates = (
            BankPayment.objects
            .filter(expense__isnull=False, status='pending')
            .select_related('expense', 'expense__category', 'expense__category__expense_account',
                             'branch', 'expense__branch', 'expense__owner')
        )

        fixed = []
        needs_review = []
        skipped_posted = []

        for payment in candidates:
            expense = payment.expense
            category = expense.category

            if category and category.expense_account_id:
                account = category.expense_account
            else:
                account = get_system_account('general_expense', expense.owner, expense.branch)

            if account.branch_id == payment.branch_id:
                continue  # would post fine — not a mismatch

            if expense.is_posted:
                skipped_posted.append((payment, account))
                continue

            if category and category.code == 'BANKCHG':
                fixed.append((payment, category, account))
            else:
                needs_review.append((payment, category, account))

        if not fixed and not needs_review and not skipped_posted:
            self.stdout.write(self.style.SUCCESS(
                'No BankPayment/Expense account-branch mismatches found.'
            ))
            return

        if fixed:
            self.stdout.write(f'{len(fixed)} auto-fixable BANKCHG mismatch(es):\n')
            for payment, old_category, old_account in fixed:
                expense = payment.expense
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}'
                    f'{payment.payment_number}  expense={expense.reference_number}  '
                    f'category account branch {old_account.branch} -> {payment.branch} '
                    f'(reassigning to branch-correct BANKCHG category)'
                )
                if not dry_run:
                    new_category = get_or_create_bank_charges_category(
                        branch=payment.branch, tenant=payment.tenant, owner=expense.owner,
                    )
                    expense.category = new_category
                    expense.save(update_fields=['category'])

        if needs_review:
            self.stdout.write(self.style.WARNING(
                f'\n{len(needs_review)} mismatch(es) NOT auto-fixed — category is not the '
                f'auto-provisioned BANKCHG one, so reassigning it is a judgment call:'
            ))
            for payment, category, account in needs_review:
                expense = payment.expense
                self.stdout.write(
                    f'  {payment.payment_number}  expense={expense.reference_number}  '
                    f'category={category.name if category else "(none)"}  '
                    f'account={account.name} ({account.code})  '
                    f'account.branch={account.branch}  payment.branch={payment.branch}'
                )

        if skipped_posted:
            self.stdout.write(self.style.ERROR(
                f'\n{len(skipped_posted)} mismatch(es) SKIPPED because the expense is already '
                f'is_posted=True — should not be reachable, needs manual review of the actual '
                f'journal entry:'
            ))
            for payment, account in skipped_posted:
                self.stdout.write(
                    f'  {payment.payment_number}  expense={payment.expense.reference_number}  '
                    f'account.branch={account.branch}  payment.branch={payment.branch}'
                )

        if fixed:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {len(fixed)} BANKCHG mismatch(es).')
