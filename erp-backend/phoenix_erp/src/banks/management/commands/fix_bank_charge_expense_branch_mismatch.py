"""
banks/management/commands/fix_bank_charge_expense_branch_mismatch.py
======================================================================
One-time (and safely re-runnable) fix for Expense rows created via the
bank-charge exception-resolution pathway (LinkResolveBankChargeView /
BulkLinkResolveBankChargeView / the single-exception-as-expense pathway in
banks/views.py) whose `branch` disagrees with their own linked
BankPayment.branch.

Root cause (fixed alongside this command)
------------------------------------------
Both call sites correctly create the BankPayment with
`branch=recon.branch` — the branch of the bank account/reconciliation being
worked on, which may differ from an elevated (cross-branch) director's own
branch. But the Expense each BankPayment wraps was created via
`ExpenseSerializer.save(tenant=recon.tenant)` with no `branch=` kwarg, so
`ExpenseSerializer.create()` silently defaulted it to `request.user.branch`
— the ACTOR's home branch, not the reconciliation's. A director whose home
branch differs from the branch they were reconciling therefore produced an
Expense tagged to the wrong branch while its own BankPayment (and the
"Bank Charges" GL account resolved via `recon.branch`) were correctly
tagged to the reconciliation's branch. The mismatch is only caught later,
when approving the payment attempts to post a journal entry: an Account can
only receive postings from transactions in its own branch, so approval
fails with "Account ... belongs to branch X, but this transaction ... is
for branch Y."

Because that posting-time guard exists, every affected row must still be
`is_posted=False` (pending approval) — a corrupted row could never have
been posted successfully, so this command doesn't need to touch any
Transaction/TransactionEntry GL rows, only the Expense.branch field itself.

This command:
  1. Finds every BankPayment with a linked Expense whose branch doesn't
     match the BankPayment's own branch.
  2. Treats BankPayment.branch as authoritative (it's always set
     explicitly to recon.branch at creation, never defaulted) and corrects
     the linked Expense.branch to match.
  3. Skips (and reports separately, without touching) any match where the
     Expense is already is_posted=True — that shouldn't be reachable per
     the guard above, but if found needs a human to look at the actual GL
     impact rather than a script silently reassigning branch after the
     fact.

Safe to re-run — a second pass finds nothing once rows are consistent.

Usage:
    python manage.py fix_bank_charge_expense_branch_mismatch --dry-run
    python manage.py fix_bank_charge_expense_branch_mismatch
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import F


class Command(BaseCommand):
    help = (
        "Fixes Expense.branch on bank-charge BankPayments where the linked "
        "Expense's branch disagrees with the BankPayment's own branch."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from banks.models import BankPayment

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        mismatched = (
            BankPayment.objects
            .filter(expense__isnull=False)
            .exclude(branch=F('expense__branch'))
            .select_related('expense', 'branch', 'expense__branch')
        )

        fix_count = 0
        skipped_posted = []

        for payment in mismatched:
            expense = payment.expense
            if expense.is_posted:
                skipped_posted.append(payment)
                continue

            fix_count += 1
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}'
                f'{payment.payment_number}  expense={expense.reference_number}  '
                f'branch {expense.branch} -> {payment.branch}'
            )
            if not dry_run:
                expense.branch = payment.branch
                expense.save(update_fields=['branch'])

        if fix_count == 0 and not skipped_posted:
            self.stdout.write(self.style.SUCCESS(
                'No bank-charge expense/payment branch mismatches found.'
            ))
        elif fix_count:
            action = 'Would fix' if dry_run else 'Fixed'
            self.stdout.write(f'\n{action} {fix_count} mismatched expense(s).')

        if skipped_posted:
            self.stdout.write(self.style.ERROR(
                f'\n{len(skipped_posted)} mismatched row(s) SKIPPED because the expense is '
                f'already is_posted=True — this should not be reachable (the branch-mismatch '
                f'GL guard should have blocked posting), so these need manual review of the '
                f'actual journal entry, not an automatic branch reassignment:'
            ))
            for payment in skipped_posted:
                self.stdout.write(
                    f'  {payment.payment_number}  expense={payment.expense.reference_number}  '
                    f'expense.branch={payment.expense.branch}  payment.branch={payment.branch}'
                )
