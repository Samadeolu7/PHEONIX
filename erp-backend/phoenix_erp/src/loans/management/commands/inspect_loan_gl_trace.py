"""
Management command: inspect_loan_gl_trace

Read-only. Dumps everything needed to diagnose why a specific loan's
repayment(s) are crediting the full payment amount to Interest Income
instead of splitting between principal (Loan Receivable) and interest —
reported 2026-07-15 against LN-20260702-B91A43 (and worth checking
LN-20260710-19C9C9 for contrast, which is a plain disbursement).

Prints, for one loan:
  1. LoanAccount fields relevant to interest recognition and payment
     allocation (interest_deferral_active, interest_recognized_at_disbursement,
     outstanding_principal/interest, interest_suspended).
  2. Its LoanProduct's GL account configuration (interest_income_account,
     accrued_interest_account, unearned_interest_income_account) — determines
     which branch of record_payment()'s interest_account selection
     (loans/models.py:1161-1177) actually fires.
  3. Every journal entry (disbursement + repayments) tied to this loan
     number, in date order, with each entry's account/side/amount — so the
     principal/interest split of each individual payment is visible directly
     against what record_payment() decided to do with it.

Usage:
    python manage.py inspect_loan_gl_trace LN-20260702-B91A43
"""
from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = 'Read-only diagnostic dump of a loan\'s GL trace and interest-recognition config.'

    def add_arguments(self, parser):
        parser.add_argument('loan_number', type=str)

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import Transaction, TransactionEntry

        loan_number = options['loan_number']
        try:
            loan = LoanAccount.objects.select_related(
                'product', 'product__product',
                'product__interest_income_account',
                'product__accrued_interest_account',
                'product__unearned_interest_income_account',
                'disbursement_journal_entry',
            ).get(loan_number=loan_number)
        except LoanAccount.DoesNotExist:
            raise CommandError(f"No LoanAccount found with loan_number='{loan_number}'")

        self.stdout.write(self.style.MIGRATE_HEADING(f'LoanAccount: {loan.loan_number}'))
        self.stdout.write(f'  product                          = {loan.product.product.name}')
        self.stdout.write(f'  repayment_frequency              = {loan.repayment_frequency}')
        self.stdout.write(f'  origin                           = {getattr(loan, "origin", "?")}')
        self.stdout.write(f'  status                           = {loan.status}')
        self.stdout.write(f'  disbursement_date                = {loan.disbursement_date}')
        self.stdout.write(f'  disbursed_amount                 = {loan.disbursed_amount}')
        self.stdout.write(f'  interest_deferral_active         = {loan.interest_deferral_active}')
        self.stdout.write(f'  interest_recognized_at_disb      = {loan.interest_recognized_at_disbursement}')
        self.stdout.write(f'  interest_suspended               = {getattr(loan, "interest_suspended", "?")}')
        self.stdout.write(f'  outstanding_principal (current)  = {loan.outstanding_principal}')
        self.stdout.write(f'  outstanding_interest (current)   = {loan.outstanding_interest}')
        self.stdout.write(f'  principal_paid                   = {loan.principal_paid}')
        self.stdout.write(f'  interest_paid                    = {loan.interest_paid}')
        self.stdout.write(f'  total_paid                       = {loan.total_paid}')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('LoanProduct GL config'))
        p = loan.product
        self.stdout.write(f'  interest_income_account          = {p.interest_income_account}')
        self.stdout.write(f'  accrued_interest_account         = {p.accrued_interest_account}')
        self.stdout.write(f'  unearned_interest_income_account = {p.unearned_interest_income_account}')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Repayment schedule (per installment)'))
        for sched in loan.repayment_schedule.order_by('due_date'):
            self.stdout.write(
                f'  due={sched.due_date}  principal_due={sched.principal_due:>12}  '
                f'interest_due={sched.interest_due:>12}  '
                f'status={getattr(sched, "status", "?")}'
            )

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('Journal entries (chronological)'))
        txns = Transaction.objects.filter(
            description__icontains=loan.loan_number
        ).order_by('date', 'id').prefetch_related('entries', 'entries__account')

        for txn in txns:
            self.stdout.write(f'\n  [{txn.date}] {txn.series.code if txn.series_id else "?"} '
                               f'— {txn.description} (ref={txn.reference_number})')
            for e in txn.entries.all():
                side = 'DR' if e.side == TransactionEntry.DEBIT else 'CR'
                self.stdout.write(f'      {side}  {e.account.code:12} {e.account.name:35} {e.amount:>14,.2f}')
