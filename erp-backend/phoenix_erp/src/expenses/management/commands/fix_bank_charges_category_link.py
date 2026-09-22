"""
expenses/management/commands/fix_bank_charges_category_link.py
==================================================================
Relinks every "Bank Charges" ExpenseCategory whose expense_account doesn't
look like a bank-charges account (see audit_bank_charges_category_accounts)
to the branch's real "Bank Charges (2026)" account.

Confirmed production case (2026-09): both HO/Orimerunmu (category id=11)
and IBAFO/Ibafo (category id=21) had their "Bank Charges" category wired to
"Payroll Related Expenses (2026)" (5302) instead of the branch's actual
"Bank Charges (2026)" account (5301 in both branches — confirmed to exist
under that exact code/name in each branch's chart of accounts before this
command was written; it looks up by name, not a hardcoded code, so it
still works if a branch's code ever differs).

This ONLY changes the category's expense_account FK — a routing/metadata
change for FUTURE expense postings through this category. It does NOT
touch any already-posted Transaction/TransactionEntry rows; those need a
correcting journal entry instead (see
post_bank_charges_reclassification_correction), which this command
deliberately leaves alone since reclassifying historical GL postings is a
separate, higher-stakes decision.

Usage:
    python manage.py fix_bank_charges_category_link --dry-run
    python manage.py fix_bank_charges_category_link
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Relinks 'Bank Charges' ExpenseCategory rows pointing at the wrong "
        "GL account to the branch's real 'Bank Charges (2026)' account."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from accounts.models import Account
        from expenses.models import ExpenseCategory

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        suspects = (
            ExpenseCategory.objects
            .filter(name__iexact='Bank Charges')
            .select_related('expense_account', 'branch')
        )

        fixed = 0
        for cat in suspects:
            if 'bank charg' in (cat.expense_account.name or '').strip().lower():
                continue  # already correct

            correct_account = (
                Account.objects
                .filter(branch=cat.branch, name__iexact='Bank Charges (2026)', account_type='EXPENSE')
                .first()
            )
            if not correct_account:
                self.stdout.write(self.style.ERROR(
                    f'  branch={cat.branch}  category id={cat.id}: no "Bank Charges (2026)" '
                    f'account exists in this branch — SKIPPED, needs manual setup first.'
                ))
                continue

            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}branch={cat.branch}  category id={cat.id}  '
                f'"{cat.expense_account.name}" ({cat.expense_account.code}) -> '
                f'"{correct_account.name}" ({correct_account.code})'
            )
            if not dry_run:
                cat.expense_account = correct_account
                cat.save(update_fields=['expense_account'])
            fixed += 1

        if fixed == 0:
            self.stdout.write(self.style.SUCCESS('No mismatched Bank Charges category links found.'))
        else:
            action = 'Would relink' if dry_run else 'Relinked'
            self.stdout.write(f'\n{action} {fixed} categor(y/ies).')
