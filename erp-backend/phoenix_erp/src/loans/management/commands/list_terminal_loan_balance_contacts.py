"""
Management command: list_terminal_loan_balance_contacts

Read-only. Prints client contact details for loans that are paid_off (or
otherwise terminal) but still carry a nonzero balance on their GL Loan
Receivable account — the "out-of-scope loans still carrying a GL balance"
bucket surfaced by audit_loan_book_gl_gap (section 3). Built to hand a
branch/collections team the info needed to follow up: a positive balance
means the client still owes money (loan was closed prematurely), a
negative balance means the client overpaid (needs a refund/credit
decision) — same classification used by fix_terminal_loan_legacy_balance.py.

Makes no changes — report only.

Usage:
    python manage.py list_terminal_loan_balance_contacts
    python manage.py list_terminal_loan_balance_contacts --loan LN-76 --loan LN-89
"""
from decimal import Decimal

from django.core.management.base import BaseCommand

IN_SCOPE_STATUSES = ('active', 'disbursed', 'defaulted')


class Command(BaseCommand):
    help = (
        'Read-only: list client contact details for terminal-status loans still carrying '
        'a nonzero GL balance, for collections/refund follow-up.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan', dest='loan_numbers', action='append', default=None,
            help='Scope to specific loan_number(s). Repeat the flag for more than one. '
                 'Without this, scans every out-of-scope loan with a nonzero GL balance.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loan_numbers = options['loan_numbers']

        loans = LoanAccount.all_objects.filter(is_deleted=False).select_related(
            'account', 'client', 'branch'
        )
        if loan_numbers:
            loans = loans.filter(loan_number__in=loan_numbers)
        else:
            loans = loans.exclude(status__in=IN_SCOPE_STATUSES).exclude(account__isnull=True)

        rows = [l for l in loans if l.account and l.account.balance != Decimal('0.00')]

        if not rows:
            self.stdout.write(self.style.SUCCESS('No matching loans with a nonzero GL balance.'))
            return

        owed, credit = [], []
        for l in rows:
            (owed if l.account.balance > 0 else credit).append(l)

        for label, bucket in (('CLIENT STILL OWES', owed), ('CLIENT OVERPAID (needs refund/credit review)', credit)):
            if not bucket:
                continue
            self.stdout.write(self.style.MIGRATE_HEADING(f'\n{label}'))
            for l in bucket:
                c = l.client
                branch_name = l.branch.name if l.branch_id else '(no branch)'
                self.stdout.write(
                    f'  {l.loan_number}\n'
                    f'    client       = {c.first_name} {c.last_name} ({c.client_id})\n'
                    f'    phone        = {c.phone_primary or "-"}'
                    + (f' / {c.phone_secondary}' if c.phone_secondary else '') + '\n'
                    f'    email        = {c.email or "-"}\n'
                    f'    branch       = {branch_name}\n'
                    f'    status       = {l.status}\n'
                    f'    disbursed    = {l.disbursed_amount:,.2f} on {l.disbursement_date}\n'
                    f'    closed_date  = {l.closed_date}\n'
                    f'    gl_balance   = {l.account.balance:,.2f}\n'
                    f'    outstanding_principal = {l.outstanding_principal:,.2f}\n'
                )

        total = sum((l.account.balance for l in rows), Decimal('0.00'))
        self.stdout.write(
            f'\n{len(rows)} loan(s): {len(owed)} owed to the business ({sum((l.account.balance for l in owed), Decimal("0.00")):,.2f}), '
            f'{len(credit)} overpaid by clients ({sum((l.account.balance for l in credit), Decimal("0.00")):,.2f}). '
            f'Net: {total:,.2f}.'
        )
