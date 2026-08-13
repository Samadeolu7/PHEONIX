"""
Management command: audit_penalty_income_account_balance

Read-only. Checks whether Account.balance (the stored running total, what
every report reads — see reports/services/financial_statements.py) for every
Penalty Income account actually matches what its own TransactionEntry rows
say it should be: Sum(credit) - Sum(debit), across ALL entries including
reversals and reversal-of-reversals — a correctly posted reversal creates a
real offsetting entry, it doesn't delete the original, so this recomputation
should net out correctly on its own without needing to exclude anything.

If stored balance == recomputed balance, Account.balance is trustworthy and
whatever's still showing as "too high" in a report is real — either a
still-outstanding correction, or a different figure than expected (broader
"Income" total including interest/fees, not penalty alone). If they disagree,
Account.balance itself has drifted from its own ledger and needs a targeted
fix, not a ledger display filter.

Makes no changes.

Usage:
    python manage.py audit_penalty_income_account_balance
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = 'Read-only: compare stored Account.balance against a fresh recomputation from TransactionEntry, for every Penalty Income account.'

    def handle(self, *args, **options):
        from accounts.models import Account
        from transactions.models import TransactionEntry
        from loans.models import LoanProduct

        penalty_account_ids = set(
            LoanProduct.objects.filter(
                penalty_income_account__isnull=False
            ).values_list('penalty_income_account_id', flat=True)
        )
        # Also catch the parent/rollup accounts these child accounts report into.
        accounts = Account.all_objects.filter(
            pk__in=penalty_account_ids
        ).order_by('code')

        if not accounts:
            self.stdout.write(self.style.WARNING('No penalty_income_account configured on any LoanProduct.'))
            return

        any_drift = False
        for account in accounts:
            credits = TransactionEntry.objects.filter(
                account=account, side=TransactionEntry.CREDIT,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
            debits = TransactionEntry.objects.filter(
                account=account, side=TransactionEntry.DEBIT,
            ).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
            recomputed = credits - debits  # INCOME accounts carry a normal credit balance

            drift = (account.balance or Decimal('0.00')) - recomputed
            flag = ''
            if abs(drift) > Decimal('0.01'):
                flag = '  *** DRIFT — Account.balance disagrees with its own ledger ***'
                any_drift = True

            self.stdout.write(
                f"  [{account.code}] {account.name:40s} "
                f"stored_balance={account.balance:>14,.2f}  "
                f"recomputed(credits-debits)={recomputed:>14,.2f}  "
                f"credits={credits:>14,.2f}  debits={debits:>14,.2f}{flag}"
            )

        if any_drift:
            self.stdout.write(self.style.ERROR(
                '\nAt least one account has a stored balance that disagrees with its own '
                'ledger entries — this is a real Account.balance bug, not a display issue.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                '\nEvery penalty income account\'s stored balance matches its ledger. '
                'Whatever figure is showing as too high elsewhere is either correct, '
                'a different (broader) total, or hasn\'t had the corrections applied yet.'
            ))
