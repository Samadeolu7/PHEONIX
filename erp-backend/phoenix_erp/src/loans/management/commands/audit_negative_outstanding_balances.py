"""
Management command: audit_negative_outstanding_balances

Read-only audit. LN-714 (loan pk 527) turned out NOT to have a missing or
misapplied payment — diagnose_loan_repayment_gap confirmed all 3 of its
LNPMT payments are logged against the correct loan row and its total_paid
(34,000.00) reconciles exactly against them. The real problem is that
`outstanding_interest` on that loan is -4,412.12 — negative, which should
never happen: outstanding_* fields are decremented as payments are applied
(see LoanAccount.record_payment()) and are never meant to go below zero.

A negative outstanding_* balance means the aggregate started too low for
what was actually collected against it — almost certainly a legacy-import
seeding problem (this loan's schedule rows were created by
clients/management/commands/import_legacy_data.py with due amounts that
were never fully mirrored into the loan-level outstanding_principal/
outstanding_interest/outstanding_fees/outstanding_penalties aggregates
before repayments were replayed on top of them), NOT a bug in how
record_payment() applies a payment once those aggregates are correct.

This command finds every other loan with the same symptom — any of
outstanding_principal / outstanding_interest / outstanding_fees /
outstanding_penalties currently negative — regardless of status, so the
same import-seeding problem can be found and fixed everywhere it occurs,
not just on LN-714.

Makes no changes — report only.

Usage:
    python manage.py audit_negative_outstanding_balances
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Q


class Command(BaseCommand):
    help = 'Read-only audit: loans with a negative outstanding_principal/interest/fees/penalties balance.'

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
        ).filter(
            Q(outstanding_principal__lt=0)
            | Q(outstanding_interest__lt=0)
            | Q(outstanding_fees__lt=0)
            | Q(outstanding_penalties__lt=0)
        ).order_by('loan_number')

        count = loans.count()
        if not count:
            self.stdout.write(self.style.SUCCESS(
                'No loans found with a negative outstanding_principal/interest/fees/penalties balance.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'{count} loan(s) have at least one negative outstanding balance:\n'
        ))

        for loan in loans:
            flags = []
            for field in ('outstanding_principal', 'outstanding_interest', 'outstanding_fees', 'outstanding_penalties'):
                value = getattr(loan, field)
                if value < 0:
                    flags.append(f'{field}={value:,.2f}')
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  status={loan.status}  '
                f'total_paid={loan.total_paid:,.2f}  total_outstanding={loan.total_outstanding:,.2f}  '
                f'{", ".join(flags)}'
            )

        self.stdout.write(self.style.WARNING(
            '\nA negative outstanding_* balance means the aggregate started too low for what was '
            'actually collected — check whether each loan above was created via import_legacy_data '
            'and whether its schedule rows\' due amounts were fully mirrored into the loan-level '
            'outstanding_* fields at import time. No automated correction applied here.'
        ))
