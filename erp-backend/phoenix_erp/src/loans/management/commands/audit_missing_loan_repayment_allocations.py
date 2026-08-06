"""
Management command: audit_missing_loan_repayment_allocations

Read-only audit. Finds LNPMT-series journal entries with zero
LoanRepaymentAllocation rows — payments that record_payment() applied to a
loan's aggregate balances (and posted to the GL) but that
_update_schedule_with_payment() recorded no per-installment (or leftover)
breakdown for.

Two different causes produce this, and they need different handling:

1. Predates the feature. LoanRepaymentAllocation (migration 0026, this repo)
   only started being written once that code shipped. Any LNPMT transaction
   older than the deploy has no allocation rows by construction — this is
   expected, not a bug, and there is no reliable way to reconstruct exactly
   which schedule rows it touched after the fact.

2. Hit the "leftover" gap that migration 0027 closed. Before 0027,
   _update_schedule_with_payment() could silently drop part of a payment's
   penalty/interest/fees/principal split if the schedule was already
   exhausted or drifted out of sync with the loan's aggregate balances (e.g.
   legacy-imported loans) — the aggregate moved, the GL posted, but nothing
   on record kept the split. After 0027, this same situation instead creates
   a schedule=None allocation row, so it will no longer reproduce for NEW
   payments; this command is for finding ones already affected before that
   fix landed.

LoanRepaymentReversal now has a fallback for exactly this case: if a payment
has no allocation rows but is still the loan's most recent active (not
itself a reversal, not already reversed) payment, it can be reversed by
peeling the GL-derived amount off the schedule's tail instead of reading a
recorded per-installment split — exact on the total, best-effort on the
principal/interest/fees/penalty breakdown. It refuses anything older than
that, since a later payment may have built on top of it. This command
doesn't submit that reversal (a human should decide whether it's actually
warranted from the FinancialAuditLog split below) — it reports, per missing
entry, whether the fallback would currently accept it.

Usage:
    python manage.py audit_missing_loan_repayment_allocations
    python manage.py audit_missing_loan_repayment_allocations --loan LN-553
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only audit: LNPMT journal entries with no LoanRepaymentAllocation rows — '
        'payments that can\'t currently be reversed through LoanRepaymentReversal.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Only check journal entries whose description references this loan number.',
        )

    def handle(self, *args, **options):
        from transactions.models import Transaction, TransactionEntry
        from common.models import FinancialAuditLog
        from loans.models import LoanRepaymentAllocation, LoanAccount

        loan_number = options['loan_number']

        txns = Transaction.all_objects.filter(
            series__code='LNPMT', is_deleted=False,
        ).select_related('series', 'branch').order_by('date', 'id')

        if loan_number:
            txns = txns.filter(description__icontains=loan_number)

        total = txns.count()
        self.stdout.write(f'Checking {total} LNPMT journal entries…')

        allocated_journal_ids = set(
            LoanRepaymentAllocation.objects.values_list('journal_entry_id', flat=True)
        )

        missing = [t for t in txns if t.pk not in allocated_journal_ids]

        if not missing:
            self.stdout.write(self.style.SUCCESS(
                'No LNPMT journal entries are missing allocation rows — every one can be '
                'reversed precisely through LoanRepaymentReversal if it ever needs to be.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'\n{len(missing)} LNPMT journal entr{"y" if len(missing) == 1 else "ies"} '
            f'with no allocation rows (cannot be reversed through the app yet):\n'
        ))

        audit_by_journal_id = {
            log.extra.get('journal_entry_id'): log
            for log in FinancialAuditLog.objects.filter(
                event_type=FinancialAuditLog.LOAN_REPAY,
                extra__journal_entry_id__in=[str(t.pk) for t in missing],
            )
        }

        grand_total = Decimal('0.00')
        for txn in missing:
            log = audit_by_journal_id.get(str(txn.pk))
            debit_total = TransactionEntry.objects.filter(
                transaction=txn, side=TransactionEntry.DEBIT,
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            grand_total += debit_total

            self.stdout.write(f'\n  [{txn.reference_number}] {txn.date}  amount={debit_total:,.2f}  "{txn.description}"')

            if not log:
                self.stdout.write(self.style.WARNING(
                    '      No FinancialAuditLog(LOAN_REPAY) entry either — cannot recover the '
                    'original principal/interest/fees/penalty split at all. Manual adjustment only.'
                ))
                continue

            extra = log.extra or {}
            loan_num = extra.get('loan_number', '?')
            self.stdout.write(
                f'      loan={loan_num}  principal={extra.get("principal", "?")}  '
                f'interest={extra.get("interest", "?")}  fees={extra.get("fees", "?")}  '
                f'penalty={extra.get("penalty", "?")}'
            )

            # Supporting evidence only, not a verdict: if this loan currently has
            # no installments left in pending/partial/overdue, the schedule was
            # (at least by now) fully exhausted, consistent with — but not proof
            # of — this payment having hit the pre-0027 leftover gap rather than
            # simply predating the whole allocation feature.
            loan = LoanAccount.all_objects.filter(loan_number=loan_num).first()
            if loan:
                open_installments = loan.repayment_schedule.filter(
                    status__in=['pending', 'partial', 'overdue']
                ).count()
                if open_installments == 0:
                    self.stdout.write(
                        '      Schedule currently fully paid/closed — consistent with this '
                        'payment (or a later one) having nowhere left to allocate against.'
                    )

                from loans.models import LoanRepaymentReversal
                latest = LoanRepaymentReversal._latest_active_payment(loan, txn)
                if latest and latest.pk == txn.pk:
                    self.stdout.write(self.style.SUCCESS(
                        '      Reversible now — this is the loan\'s most recent active payment, '
                        'so LoanRepaymentReversal\'s fallback path will accept it.'
                    ))
                else:
                    self.stdout.write(
                        '      NOT reversible through the app — a later payment exists on this '
                        'loan (or this one is already superseded). Manual adjustment only.'
                    )

        self.stdout.write(self.style.WARNING(
            f'\nTotal unallocated amount: {grand_total:,.2f} across {len(missing)} entries.\n'
            'No changes made here. For entries marked "Reversible now": use the normal '
            'LoanRepaymentReversal request/approve flow (Loans > Repayment Reversals or the '
            'loan\'s own Payment History) if a reversal is actually warranted. For entries marked '
            '"NOT reversible": accounting needs to apply a manual correction — reversing via '
            'journal_entry.reverse() plus hand-adjusting the loan\'s aggregates and schedule.'
        ))
