"""
Management command: accrue_outstanding_penalty_backlog

One-time catch-up for the switch to accrual-basis penalty income (see
update_loan_status.py and LoanAccount.record_payment()). Going forward,
penalty income is recognized when a penalty is assessed (LNPEN entries);
this command books that same recognition, once, for penalty already sitting
on the books from before that switch — amounts clients already owe but that
have never touched any GL account, because they predate this feature and
haven't been paid yet.

Scope — deliberately narrow: only currently-UNPAID penalty (per schedule row,
penalty_due - penalty_paid). This does NOT touch penalty that was already
collected and misrouted into Loan Receivable instead of Penalty Income (see
the separate, already-flagged investigation in `audit_penalty_income_gl_mapping`
/ the reversed `draft_penalty_income_reclass` attempt) — that is a different,
more sensitive historical-reclass decision and is intentionally out of scope
here.

For each loan where product.penalty_income_account is configured and
penalty_accrual_active is False (never had a penalty accrual GL entry),
posts one journal entry PER unpaid installment (LNPEN series, same as the
ongoing daily accrual — one entry per month/period, not lumped per loan, so
each installment's charge is individually traceable):
    Dr. Loan Receivable (loan.account)
    Cr. Penalty Income  (product.penalty_income_account)
for that installment's (penalty_due - penalty_paid), then sets
penalty_accrual_active=True on the loan so future daily runs and payments
treat it as accrual-basis from here on.

Dry-run by default — review the list and total before applying.

Usage:
    python manage.py accrue_outstanding_penalty_backlog
    python manage.py accrue_outstanding_penalty_backlog --apply
    python manage.py accrue_outstanding_penalty_backlog --apply --loan LN-20260101-ABCD12
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import F
from django.utils import timezone


class Command(BaseCommand):
    help = (
        'One-time catch-up: recognize currently-outstanding (unpaid) penalty as '
        'income now, one entry per installment, for loans switching onto '
        'accrual-basis penalty recognition.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually post the catch-up entries. Without this, dry-run only.',
        )
        parser.add_argument(
            '--loan', help='Limit to a single loan_number (for spot-checking before a full run).',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from common.models import FinancialAuditLog, log_financial_event

        apply_changes = options['apply']
        loan_number = options.get('loan')

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY-RUN — pass --apply to post entries.'))

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
            penalty_accrual_active=False,
        ).select_related('product', 'branch', 'owner').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)

        series = None
        if apply_changes:
            series, _ = TransactionSeries.objects.get_or_create(
                code='LNPEN',
                defaults={'description': 'Loan Penalty Accrual'},
            )

        loans_posted = 0
        entries_posted = 0
        skipped_no_account = 0
        total_amount = Decimal('0.00')

        for loan in loans:
            penalty_account = loan.product.penalty_income_account
            if not penalty_account:
                skipped_no_account += 1
                continue

            unpaid_rows = loan.repayment_schedule.filter(
                penalty_due__gt=F('penalty_paid'),
            ).order_by('due_date')

            loan_had_entry = False
            for sched in unpaid_rows:
                amount = sched.penalty_due - sched.penalty_paid
                if amount <= 0:
                    continue
                total_amount += amount

                if not apply_changes:
                    self.stdout.write(
                        f'  [{loan.loan_number}] would accrue ₦{amount} for installment '
                        f'due {sched.due_date} (Dr {loan.account} / Cr {penalty_account})'
                    )
                    entries_posted += 1
                    loan_had_entry = True
                    continue

                with db_transaction.atomic():
                    journal = JournalEntry.objects.create(
                        series=series,
                        date=timezone.localdate(),
                        description=(
                            f'Penalty accrual backlog catch-up — {loan.loan_number} '
                            f'(installment due {sched.due_date})'
                        ),
                        owner=loan.owner,
                        branch=loan.branch,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal, account=loan.account,
                        side=JournalEntryLine.DEBIT, amount=amount,
                    )
                    JournalEntryLine.objects.create(
                        transaction=journal, account=penalty_account,
                        side=JournalEntryLine.CREDIT, amount=amount,
                    )
                    journal.post()

                    log_financial_event(
                        FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                        acted_by=None,
                        record_type='LoanAccount',
                        record_id=str(loan.pk),
                        amount=amount,
                        description=(
                            f'Penalty accrual backlog catch-up on {loan.loan_number} '
                            f'(installment due {sched.due_date})'
                        ),
                        extra={
                            'loan_number': loan.loan_number,
                            'client_id': str(loan.client_id),
                            'schedule_id': str(sched.pk),
                            'installment_due_date': str(sched.due_date),
                            'journal_entry_id': str(journal.pk),
                        },
                    )

                entries_posted += 1
                loan_had_entry = True

            if loan_had_entry:
                loans_posted += 1
                if apply_changes:
                    loan.penalty_accrual_active = True
                    loan.save(update_fields=['penalty_accrual_active', 'updated_at'])

        self.stdout.write(self.style.SUCCESS(
            f'Done. loans={loans_posted} entries={entries_posted} '
            f'total=₦{total_amount} skipped_no_penalty_income_account={skipped_no_account}'
        ))
