"""
Management command: audit_loan_gl_transaction_history

Read-only diagnostic: for one or more loans, dumps every TransactionEntry
ever posted against that loan's account (Loan Receivable), in chronological
order, with a running GL balance — plus every FinancialAuditLog event
recorded against the loan. Built for hand-reconstructing exactly how a
loan's real GL balance diverged from its outstanding_* fields, the same
way LN-20260702-D3DC5C and LN-20260820-5E84B0 were traced by hand earlier.

Makes no changes — report only.

Usage:
    python manage.py audit_loan_gl_transaction_history --loan LN-20260701-6741E4
    python manage.py audit_loan_gl_transaction_history --loan LN-A,LN-B,LN-C
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only: dump chronological GL + audit-log history for one or more loans.'

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_numbers', required=True,
                             help='Comma-separated loan number(s) to dump.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import TransactionEntry
        from common.models import FinancialAuditLog

        loan_numbers = [ln.strip() for ln in options['loan_numbers'].split(',') if ln.strip()]

        for loan_number in loan_numbers:
            try:
                loan = LoanAccount.all_objects.select_related('account').get(loan_number=loan_number)
            except LoanAccount.DoesNotExist:
                raise CommandError(f'No loan found with loan_number={loan_number}')

            self.stdout.write(self.style.MIGRATE_HEADING(
                f'\n=== {loan.loan_number} (pk={loan.pk}) origin={loan.origin} status={loan.status} ==='
            ))
            self.stdout.write(
                f'  disbursed_amount={loan.disbursed_amount}  disbursement_date={loan.disbursement_date}  '
                f'total_paid={loan.total_paid}'
            )
            self.stdout.write(
                f'  outstanding_principal={loan.outstanding_principal}  '
                f'outstanding_interest={loan.outstanding_interest}  '
                f'outstanding_fees={loan.outstanding_fees}  '
                f'outstanding_penalties={loan.outstanding_penalties}  '
                f'total_outstanding={loan.total_outstanding}'
            )
            if loan.account:
                self.stdout.write(f'  account.balance (current GL truth) = {loan.account.balance}')
            else:
                self.stdout.write(self.style.ERROR('  no linked GL account'))
                continue

            self.stdout.write('')
            self.stdout.write('  --- TransactionEntry history (account = loan.account) ---')
            entries = TransactionEntry.objects.filter(
                account=loan.account
            ).select_related('transaction', 'transaction__series').order_by(
                'transaction__date', 'transaction__created_at', 'id'
            )

            running = Decimal('0.00')
            for e in entries:
                txn = e.transaction
                effect = e.get_balance_effect()
                running += effect
                rev = ' [REVERSED]' if e.is_reversed else ''
                txn_rev = ' [TXN-REVERSED]' if txn.is_reversed else ''
                self.stdout.write(
                    f'    {txn.date}  {txn.reference_number:<24}  {e.side}  {e.amount:>14,.2f}  '
                    f'effect={effect:>+14,.2f}  running={running:>14,.2f}{rev}{txn_rev}'
                )
                self.stdout.write(f'        {txn.description}')

            self.stdout.write('')
            self.stdout.write(f'  Final computed running balance: {running:,.2f}  '
                               f'(vs account.balance now: {loan.account.balance:,.2f})')

            self.stdout.write('')
            self.stdout.write('  --- FinancialAuditLog history (record_type=LoanAccount) ---')
            logs = FinancialAuditLog.objects.filter(
                record_type='LoanAccount', record_id=str(loan.pk)
            ).order_by('timestamp')
            for log in logs:
                self.stdout.write(
                    f'    {log.timestamp:%Y-%m-%d %H:%M}  {log.get_event_type_display():<28}  '
                    f'amount={log.amount if log.amount is not None else "-":>14}  {log.description}'
                )

            self.stdout.write('')
