"""
Management command: diagnose_loan_repayment_gap

Read-only diagnostic for a single loan number. audit_orphaned_loan_repayment_journals
confirmed LN-714's LNPMT transactions DO have matching FinancialAuditLog(LOAN_REPAY)
entries — so record_payment() genuinely ran for them. That rules out "the payment
bypassed record_payment() entirely." It does NOT rule out record_payment() having
run against the WRONG LoanAccount row: FinancialAuditLog.record_id is whatever
self.pk was at the moment of that specific call, and loan_number is not guaranteed
unique across tenants/branches or across soft-deleted duplicates left behind by a
legacy import. If a payment's audit-log record_id doesn't match the pk of the
LoanAccount you're actually viewing for that loan_number, the GL posted correctly
but updated a different loan's balance/schedule than the one on screen.

This command, for a given --loan number:
  1. Lists every LoanAccount row (including soft-deleted, across tenants/branches)
     that has this loan_number — flags if there's more than one.
  2. Lists every LNPMT Transaction whose description references this loan_number,
     and for each, the linked FinancialAuditLog(LOAN_REPAY) entry's record_id,
     amount, and component split (principal/interest/fees/penalty).
  3. Flags any payment whose record_id does not match one of the LoanAccount pks
     found in step 1 — the smoking gun for "posted against the wrong loan row."
  4. Cross-checks the SUM of logged payment amounts against the loan's current
     total_paid, to quantify how much (if anything) is actually missing.

Makes no changes — report only.

Usage:
    python manage.py diagnose_loan_repayment_gap --loan LN-714
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum


class Command(BaseCommand):
    help = 'Read-only diagnostic: does every logged payment for this loan number actually belong to the loan row currently on screen?'

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', required=True,
                             help='Exact loan_number to diagnose, e.g. LN-714.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import Transaction, TransactionEntry
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']

        loans = list(LoanAccount.all_objects.filter(loan_number=loan_number))
        if not loans:
            raise CommandError(f'No LoanAccount found with loan_number={loan_number!r}.')

        self.stdout.write(self.style.MIGRATE_HEADING(f'1. LoanAccount row(s) with loan_number={loan_number}'))
        if len(loans) > 1:
            self.stdout.write(self.style.ERROR(
                f'  ** {len(loans)} LoanAccount rows share this loan_number — that alone is a problem.'
            ))
        loan_pks = set()
        for ln in loans:
            loan_pks.add(str(ln.pk))
            self.stdout.write(
                f'  pk={ln.pk}  tenant_id={ln.tenant_id}  branch_id={ln.branch_id}  '
                f'status={ln.status}  is_deleted={ln.is_deleted}  '
                f'total_paid={ln.total_paid:,.2f}  outstanding={ln.total_outstanding:,.2f}  '
                f'client_id={ln.client_id}'
            )

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('2. LNPMT transactions referencing this loan number'))
        txns = Transaction.all_objects.filter(
            series__code='LNPMT', is_deleted=False, description__icontains=loan_number,
        ).order_by('date', 'id')

        logs_by_journal_id = {}
        for log in FinancialAuditLog.objects.filter(event_type=FinancialAuditLog.LOAN_REPAY):
            jid = (log.extra or {}).get('journal_entry_id')
            if jid:
                logs_by_journal_id[jid] = log

        logged_total = Decimal('0.00')
        mismatches = []
        for txn in txns:
            gl_debit_total = TransactionEntry.objects.filter(
                transaction=txn, side=TransactionEntry.DEBIT,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')

            log = logs_by_journal_id.get(str(txn.pk))
            if log is None:
                self.stdout.write(self.style.ERROR(
                    f'  [{txn.reference_number}] {txn.date}  gl_debit={gl_debit_total:,.2f}  '
                    f'** NO FinancialAuditLog(LOAN_REPAY) found for this journal at all **'
                ))
                continue

            extra = log.extra or {}
            # log.amount is the amount record_payment() actually applied to THIS loan
            # (excludes any spillover-to-savings, which is why it can be smaller than
            # the GL debit total on a payment that overpaid the loan).
            loan_amount = log.amount or Decimal('0.00')
            matches_a_visible_loan = log.record_id in loan_pks
            if not matches_a_visible_loan:
                mismatches.append((txn, log))

            flag = '' if matches_a_visible_loan else '  ** record_id does NOT match any LoanAccount row above **'
            self.stdout.write(
                f'  [{txn.reference_number}] {txn.date}  gl_debit={gl_debit_total:,.2f}  '
                f'loan_amount={loan_amount:,.2f}  record_id={log.record_id}  '
                f'logged_loan_number={extra.get("loan_number")}  '
                f'principal={extra.get("principal")}  interest={extra.get("interest")}  '
                f'fees={extra.get("fees")}  penalty={extra.get("penalty")}{flag}'
            )
            logged_total += loan_amount

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('3. Reconciliation'))
        current_total_paid = sum((ln.total_paid for ln in loans), Decimal('0.00'))
        self.stdout.write(f'  Sum of loan_amount across logged LNPMT payments: {logged_total:,.2f}')
        self.stdout.write(f'  Sum of total_paid across matching LoanAccount row(s): {current_total_paid:,.2f}')
        if logged_total != current_total_paid:
            self.stdout.write(self.style.ERROR(
                f'  ** Mismatch of {logged_total - current_total_paid:,.2f} — payments were posted to the '
                f'GL that are not reflected in this loan_number\'s current total_paid.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('  Reconciles — every posted LNPMT amount is accounted for.'))

        if mismatches:
            self.stdout.write('')
            self.stdout.write(self.style.ERROR(
                f'** {len(mismatches)} payment(s) were logged against a LoanAccount pk that is not any of '
                f'the rows found in step 1 — i.e. record_payment() ran, but against a different (possibly '
                f'soft-deleted, possibly duplicate) loan row than the one currently associated with '
                f'{loan_number}. That row needs to be found directly by pk to see where the money actually went.'
            ))
