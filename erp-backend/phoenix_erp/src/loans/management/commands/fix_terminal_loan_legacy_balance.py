"""
One-off correction for loans that came out of the 2026-06-30 legacy import
(OBMIG-20260630-0023) marked paid_off but still carrying a nonzero
outstanding_principal — the legacy "Closed" status wasn't trustworthy on
its own; import_legacy_data.py used to trust it even when the balance said
otherwise (see that file's _TERMINAL_LOAN_STATUSES fix).

This does NOT touch the money. outstanding_principal (and the GL balance
already posted via OBMIG) reflects the real debt/credit and is left as-is.
The only thing corrected is status: a loan with a nonzero balance is not
paid_off, so it's put back to 'active' and re-enters arrears/collections
tracking. A negative balance (client overpaid) still isn't 'paid off'
either under that same rule — it's flagged separately for finance to
resolve as a refund/credit, not silently swept.

Usage:
    python manage.py fix_terminal_loan_legacy_balance --dry-run
    python manage.py fix_terminal_loan_legacy_balance --fix
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

TERMINAL_STATUSES = frozenset(['paid_off', 'written_off', 'rejected', 'cancelled'])


class Command(BaseCommand):
    help = "Revert incorrectly-terminal legacy-import loans back to active; balances are left untouched."

    def add_arguments(self, parser):
        parser.add_argument('--fix', action='store_true', help='Apply the correction (default is dry-run).')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        do_fix = options['fix']
        today = timezone.localdate()

        loans = list(
            LoanAccount.all_objects.filter(
                is_deleted=False,
                status__in=TERMINAL_STATUSES,
                origin=LoanAccount.ORIGIN_LEGACY_IMPORT,
            ).exclude(outstanding_principal=Decimal('0.00'))
        )

        if not loans:
            self.stdout.write(self.style.SUCCESS('No affected loans found.'))
            return

        self.stdout.write(f'Found {len(loans)} loan(s) marked terminal with a nonzero balance:\n')

        owed, credit = [], []
        for loan in loans:
            (owed if loan.outstanding_principal > 0 else credit).append(loan)

        for loan in owed:
            self.stdout.write(
                f'  {loan.loan_number}  status={loan.status} -> active  '
                f'still owed={loan.outstanding_principal}'
            )
        for loan in credit:
            self.stdout.write(
                self.style.WARNING(
                    f'  {loan.loan_number}  status={loan.status} -> active  '
                    f'CREDIT (client overpaid)={loan.outstanding_principal} — '
                    f'needs finance review for refund, not auto-resolved'
                )
            )

        if not do_fix:
            self.stdout.write(self.style.WARNING('\nDry-run only — re-run with --fix to apply.'))
            return

        for loan in loans:
            loan.status = 'active'
            loan.closed_date = None
            loan._calculate_arrears()
            loan.save(update_fields=['status', 'closed_date', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f'\nReverted {len(loans)} loan(s) to active status ({len(owed)} owing, '
            f'{len(credit)} in credit — flag those for finance review).'
        ))
