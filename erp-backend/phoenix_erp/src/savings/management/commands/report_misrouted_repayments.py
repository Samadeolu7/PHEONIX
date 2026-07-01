"""
savings/management/commands/report_misrouted_repayments.py
==============================================================
READ-ONLY. Makes NO database writes.

Reconciliation detail for the 17 loan repayments whose "cash received" leg
was misrouted onto parent accounts 2100/4200 (already corrected into the
suspense account 1119 by fix_misrouted_parent_entries). For each one, prints
everything available to match it against a real bank statement: date, time,
amount, loan, client, and who recorded it.

Reference numbers are the exact list fix_misrouted_parent_entries identified
(confirmed twice: --dry-run and the real run). Hardcoded here rather than
re-derived from the RECL journal's own description, because that description
is truncated to fit varchar(255) and may have dropped some reference numbers
for the 2100 batch (10 refs).

Known gap: loans/views.py builds a `description` string that appends
"| Ref: {bank_reference}" (the cashier-entered bank reference/receipt number)
but never actually passes it into loan.record_payment() or persists it
anywhere — it's dead code. So the bank_reference the cashier typed in for
these payments is NOT recoverable from the database; reconciliation has to
go on date + amount + loan + who recorded it.

Usage
-----
    python manage.py report_misrouted_repayments
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


REFERENCES_2100 = [
    'LNPMT-20260630-0024', 'LNPMT-20260630-0025', 'LNPMT-20260701-0023',
    'LNPMT-20260701-0029', 'LNPMT-20260701-0030', 'LNPMT-20260701-0033',
    'LNPMT-20260701-0056', 'LNPMT-20260701-0060', 'LNPMT-20260701-0062',
    'LNPMT-20260701-0063',
]
REFERENCES_4200 = [
    'LNPMT-20260630-0031', 'LNPMT-20260630-0032', 'LNPMT-20260701-0034',
    'LNPMT-20260701-0069', 'LNPMT-20260701-0070', 'LNPMT-20260701-0073',
    'LNPMT-20260701-0076',
]


class Command(BaseCommand):
    help = (
        'READ-ONLY. Prints reconciliation detail (date, amount, loan, '
        'client, who recorded it) for the 17 loan repayments that were '
        'misrouted onto parent accounts 2100/4200, to help match them '
        'against real bank statements.'
    )

    def handle(self, *args, **options):
        from transactions.models import Transaction
        from common.models import FinancialAuditLog

        self.stdout.write('=== Misrouted Repayment Reconciliation Detail (read-only) ===\n')
        self.stdout.write(self.style.WARNING(
            'Note: the bank_reference cashiers typed in for these payments was '
            'never persisted (a separate dead-code bug in loans/views.py) — '
            "it isn't recoverable. Match on date + amount + loan + recorder.\n"
        ))

        grand_total = 0
        for label, refs in (
            ('2100 Trade and Other Payables', REFERENCES_2100),
            ('4200 Other Operating Income', REFERENCES_4200),
        ):
            self.stdout.write(f'--- Originally misrouted onto {label} ---\n')
            batch_total = 0

            for ref in refs:
                try:
                    txn = Transaction.objects.get(reference_number=ref)
                except Transaction.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f'  {ref}: transaction not found!\n'))
                    continue

                log = FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_REPAY,
                    extra__journal_entry_id=str(txn.pk),
                ).first()

                recorded_by = getattr(txn.created_by, 'email', None) \
                    or getattr(txn.created_by, 'username', None) or txn.created_by_id
                amount = txn.get_total_amount()
                batch_total += amount

                self.stdout.write(
                    f'  {ref}\n'
                    f'    Date            : {txn.date}\n'
                    f'    Posted at       : {txn.approved_at}\n'
                    f'    Amount          : {amount}\n'
                    f'    Description     : {txn.description}\n'
                    f'    Recorded by     : {recorded_by}\n'
                )
                if log:
                    extra = log.extra or {}
                    self.stdout.write(
                        f'    Acted by (audit): {getattr(log.acted_by, "email", log.acted_by_id)}\n'
                        f'    Audit timestamp : {log.timestamp}\n'
                        f'    Loan number     : {extra.get("loan_number")}\n'
                        f'    Client ID       : {extra.get("client_id")}\n'
                        f'    Principal/Interest/Fees/Penalty: '
                        f'{extra.get("principal")}/{extra.get("interest")}/'
                        f'{extra.get("fees")}/{extra.get("penalty")}\n'
                    )
                else:
                    self.stdout.write(self.style.WARNING(
                        '    No matching FinancialAuditLog entry found.\n'
                    ))
                self.stdout.write('')

            self.stdout.write(f'  Batch total: {batch_total}\n')
            grand_total += batch_total

        self.stdout.write(self.style.SUCCESS(f'\nGrand total (should be 113200.00): {grand_total}'))
