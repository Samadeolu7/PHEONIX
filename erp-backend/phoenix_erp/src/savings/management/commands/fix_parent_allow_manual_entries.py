"""
savings/management/commands/fix_parent_allow_manual_entries.py
=================================================================
Data cleanup to match the codebase's own established convention
("Parents should always have allow_manual_entries=False" — see
accounts/management/commands/setup_sample_data.py,
incomes/services/fee_setup_service.py) and TransactionEntry.clean(), which
now blocks direct postings to parent accounts unconditionally regardless of
this flag.

2100 (Trade and Other Payables) and 4200 (Other Operating Income) were
found with allow_manual_entries=True despite being PARENT-level accounts
with children — this let loan-repayment code post directly to them. The
code-level block is now absolute, so this flag no longer has any effect on
parent accounts, but leaving it True is misleading (e.g. in any UI that
surfaces it) and inconsistent with every other parent account. This
command corrects it.

Usage
-----
    python manage.py fix_parent_allow_manual_entries --dry-run
    python manage.py fix_parent_allow_manual_entries
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Sets allow_manual_entries=False on every parent-level account that '
        'has children, matching the codebase convention. Purely a data/'
        'consistency fix — TransactionEntry.clean() already blocks direct '
        'parent postings unconditionally.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from accounts.models import Account

        misconfigured = Account.objects.filter(
            account_level=Account.LEVEL_PARENT,
            is_deleted=False,
            allow_manual_entries=True,
        )
        misconfigured = [a for a in misconfigured if a.children.exists()]

        if not misconfigured:
            self.stdout.write(self.style.SUCCESS(
                'No parent accounts with allow_manual_entries=True found.'
            ))
            return

        self.stdout.write(f'Found {len(misconfigured)} parent account(s) to correct:')
        for acct in misconfigured:
            self.stdout.write(f'  {acct.code} — {acct.name}')

        if dry_run:
            self.stdout.write(self.style.WARNING('\nDRY RUN — no changes saved.'))
            return

        for acct in misconfigured:
            acct.allow_manual_entries = False
            acct.save(update_fields=['allow_manual_entries', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(f'\nCorrected {len(misconfigured)} account(s).'))
