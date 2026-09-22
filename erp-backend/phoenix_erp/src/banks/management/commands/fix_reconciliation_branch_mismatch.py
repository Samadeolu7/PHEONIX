"""
banks/management/commands/fix_reconciliation_branch_mismatch.py
===================================================================
Fixes the root-cause bug in reconciliation_utils.py's statement-upload path
(fixed alongside this command): a new DailyReconciliation was created with
`branch=getattr(user, 'branch', None)` — the UPLOADER's own home branch —
instead of `bank_account.branch`. An elevated user whose home branch differs
from the bank account they're reconciling produced a reconciliation (and
every BankPayment/Expense/category resolution cascading from it) tagged to
the wrong branch, even though the bank account itself was never ambiguous.

Confirmed production case (2026-09): First Bank Plc - 2048332167 belongs to
IBAFO, but 26 DailyReconciliation rows for it (2026-07-01 through today)
were created with branch=HO-Orimerunmu. This is the OPPOSITE direction from
the earlier "Bank Charges category linked to the wrong account" bug fixed
by fix_bank_charges_category_link — there, the category was wrong and the
branch tag was right; here, the branch tag itself is wrong and everything
downstream (including a category that WAS already correctly branch-scoped)
inherited it.

This command:
  1. Corrects DailyReconciliation.branch to bank_account.branch wherever
     they disagree.
  2. Corrects BankPayment.branch (and, if linked, Expense.branch) to
     bank_account.branch for every BankPayment whose branch disagrees with
     its own bank_account.branch — this is a stronger, more direct
     invariant than going through the reconciliation, and catches any
     payment created this way regardless of which resolution pathway made
     it.
  3. For any UNPOSTED (expense.is_posted=False or no expense) mismatched
     BankPayment whose expense.category already points to the CORRECT
     branch's account (as in the confirmed case — Ibafo's "Bank Charges"
     category was right all along), leaves the category alone. If the
     category points to the WRONG branch's account instead, reassigns it
     to the correct-branch "Bank Charges" category the same way
     fix_bank_payment_expense_account_branch_mismatch does — but only for
     the auto-provisioned/named "Bank Charges" case; anything else is
     flagged for manual review, not guessed at.
  4. Refuses to touch (reports separately) any mismatch where the expense
     is already is_posted=True — those already have a real GL entry
     against whatever account they used; reclassifying that needs a
     correcting journal entry decision, not a silent field edit. None were
     found in the confirmed case (all 26 reconciliations' payments were
     still pending), but this guards against a different branch/account
     ever hitting that shape.

Usage:
    python manage.py fix_reconciliation_branch_mismatch --dry-run
    python manage.py fix_reconciliation_branch_mismatch
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.db.models import F


class Command(BaseCommand):
    help = (
        "Fixes DailyReconciliation/BankPayment rows whose branch disagrees "
        "with their own bank_account.branch (uploader's branch was used "
        "instead of the bank account's real branch)."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from accounts.models import Account
        from banks.models import BankPayment, DailyReconciliation
        from banks.reconciliation_utils import get_or_create_bank_charges_category

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        # --- 1. DailyReconciliation ---
        recons = (
            DailyReconciliation.objects
            .select_related('branch', 'bank_account', 'bank_account__branch')
            .exclude(branch=F('bank_account__branch'))
        )
        recon_count = 0
        for recon in recons:
            if not recon.bank_account or not recon.bank_account.branch_id:
                continue
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}recon id={recon.id} date={recon.reconciliation_date} '
                f'bank_account={recon.bank_account}  branch {recon.branch} -> {recon.bank_account.branch}'
            )
            if not dry_run:
                recon.branch = recon.bank_account.branch
                recon.save(update_fields=['branch'])
            recon_count += 1

        if recon_count:
            self.stdout.write(f'\n{"Would fix" if dry_run else "Fixed"} {recon_count} DailyReconciliation row(s).\n')
        else:
            self.stdout.write('No DailyReconciliation branch mismatches found.\n')

        # --- 2. BankPayment (+ linked Expense) ---
        payments = (
            BankPayment.objects
            .select_related('branch', 'bank_account', 'bank_account__branch', 'expense',
                             'expense__category', 'expense__category__expense_account')
            .exclude(branch=F('bank_account__branch'))
        )

        payment_count = 0
        category_fix_count = 0
        needs_review = []
        skipped_posted = []

        for payment in payments:
            if not payment.bank_account or not payment.bank_account.branch_id:
                continue
            correct_branch = payment.bank_account.branch
            expense = payment.expense

            if expense and expense.is_posted:
                skipped_posted.append((payment, correct_branch))
                continue

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}{payment.payment_number}  '
                f'bank_account={payment.bank_account}  branch {payment.branch} -> {correct_branch}'
            )
            if not dry_run:
                payment.branch = correct_branch
                payment.save(update_fields=['branch'])
            payment_count += 1

            if not expense:
                continue

            category = expense.category
            category_account_branch_id = category.expense_account.branch_id if category and category.expense_account_id else None

            if category_account_branch_id == correct_branch.id:
                # Category was already correctly branch-scoped — e.g. the
                # confirmed Ibafo case, where the category was fine all
                # along and only the payment/reconciliation branch was wrong.
                if expense.branch_id != correct_branch.id:
                    self.stdout.write(
                        f'      expense={expense.reference_number}  branch {expense.branch} -> {correct_branch}'
                    )
                    if not dry_run:
                        expense.branch = correct_branch
                        expense.save(update_fields=['branch'])
                continue

            if category and category.name.strip().lower() == 'bank charges':
                target_category = get_or_create_bank_charges_category(
                    branch=correct_branch, tenant=payment.tenant, owner=expense.owner,
                )
                if 'bank charg' in target_category.expense_account.name.strip().lower():
                    self.stdout.write(
                        f'      expense={expense.reference_number}  category account was branch-wrong too, '
                        f'reassigning to "{target_category.expense_account.name}" '
                        f'({target_category.expense_account.code}) and branch -> {correct_branch}'
                    )
                    if not dry_run:
                        expense.category = target_category
                        expense.branch = correct_branch
                        expense.save(update_fields=['category', 'branch'])
                    category_fix_count += 1
                    continue

            needs_review.append((payment, expense, category, correct_branch))

        if payment_count:
            self.stdout.write(
                f'\n{"Would fix" if dry_run else "Fixed"} {payment_count} BankPayment row(s) '
                f'({category_fix_count} with a category reassignment too).\n'
            )
        else:
            self.stdout.write('No BankPayment branch mismatches found.\n')

        if needs_review:
            self.stdout.write(self.style.WARNING(
                f'\n{len(needs_review)} mismatch(es) NOT auto-fixed on the category side — '
                f'needs a human to confirm the right category:'
            ))
            for payment, expense, category, correct_branch in needs_review:
                self.stdout.write(
                    f'  {payment.payment_number}  expense={expense.reference_number if expense else "(none)"}  '
                    f'category={category.name if category else "(none)"}  correct_branch={correct_branch}'
                )

        if skipped_posted:
            self.stdout.write(self.style.ERROR(
                f'\n{len(skipped_posted)} mismatch(es) SKIPPED because the expense is already '
                f'is_posted=True — needs a correcting journal entry decision, not a field edit:'
            ))
            for payment, correct_branch in skipped_posted:
                self.stdout.write(
                    f'  {payment.payment_number}  expense={payment.expense.reference_number}  '
                    f'current branch={payment.branch}  bank_account.branch={correct_branch}'
                )
