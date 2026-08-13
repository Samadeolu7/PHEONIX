"""
Management command: reverse_penalty_entries_before_cutover

A more surgical alternative to reverse_legacy_loan_penalty_accruals for loans
with a messy enough history that a recompute-and-repost isn't trustworthy
(e.g. LN-659, which already had a separate "penalty income reclass" saga in
July 2026 layered underneath today's cutover-date problem — see
draft_penalty_income_reclass.py / reverse_penalty_income_reclass_batch.py).

Instead of reversing everything and reposting a recomputed lump sum, this
only reverses individual LNPEN transactions whose OWN description states a
specific installment due_date before PENALTY_CUTOVER_DATE (2026-06-30) —
both update_loan_status.py's daily accrual and accrue_outstanding_penalty_
backlog.py's catch-up entries embed "(installment due YYYY-MM-DD)" in their
description. Nothing is recomputed or reposted; entries for installments due
on/after the cutover, and any unrelated entries (corrections, reclasses,
anything without a parseable installment due date), are left completely
untouched.

Makes no changes without --apply. Uses Transaction.reverse() — the proper
audited path — not a hand-built entry.

Usage:
    python manage.py reverse_penalty_entries_before_cutover --loan LN-659           # dry-run
    python manage.py reverse_penalty_entries_before_cutover --loan LN-659 --apply
    python manage.py reverse_penalty_entries_before_cutover                         # whole book, dry-run
"""
import re
from datetime import date
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.core.exceptions import ValidationError
from django.db import transaction as db_transaction


DUE_DATE_RE = re.compile(r'installment due (\d{4}-\d{2}-\d{2})')


class Command(BaseCommand):
    help = (
        'Reverse individual LNPEN entries whose own description states an installment '
        'due_date before the 2026-06-30 cutover — no recomputation, no repost. '
        'Dry-run by default; --apply executes.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only process a single loan by loan_number.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually post the reversals. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanProduct
        from transactions.models import Transaction, TransactionEntry
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']
        apply_changes = options['apply']
        cutover = LoanProduct.PENALTY_CUTOVER_DATE

        txns = Transaction.all_objects.filter(
            series__code='LNPEN', is_reversed=False, is_reversal=False,
        ).order_by('date', 'id')
        if loan_number:
            # Exact match via the audit log's journal_entry_id, not
            # description__icontains — a loan_number can be a substring of a
            # different loan's number (e.g. "LN-659" inside "LN-6590"),
            # which icontains would wrongly match.
            journal_ids = FinancialAuditLog.objects.filter(
                event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
                extra__loan_number=loan_number,
            ).values_list('extra__journal_entry_id', flat=True)
            txns = txns.filter(pk__in=[j for j in journal_ids if j])

        to_reverse = []
        for txn in txns:
            m = DUE_DATE_RE.search(txn.description or '')
            if not m:
                continue
            due_date = date.fromisoformat(m.group(1))
            if due_date < cutover:
                to_reverse.append((txn, due_date))

        if not to_reverse:
            self.stdout.write(self.style.SUCCESS('Nothing matches — no pre-cutover-dated entries found to reverse.'))
            return

        total = Decimal('0.00')
        for txn, due_date in to_reverse:
            debit_total = sum(
                (e.amount for e in txn.entries.filter(side=TransactionEntry.DEBIT)), Decimal('0.00')
            )
            total += debit_total
            self.stdout.write(
                f"  {txn.reference_number:24s} {txn.date}  due={due_date}  "
                f"₦{debit_total:>12,.2f}  \"{txn.description}\""
            )

        self.stdout.write(self.style.WARNING(
            f'\n{len(to_reverse)} transaction(s), total ₦{total:,.2f}'
        ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to reverse every entry shown above.'
            ))
            return

        failures = []
        with db_transaction.atomic():
            for txn, due_date in to_reverse:
                try:
                    txn.reverse(
                        user=None,
                        reason=(
                            f'Installment due {due_date} predates the 2026-06-30 penalty '
                            f'cutover — reversed without recompute, per manual review.'
                        ),
                    )
                except ValidationError as exc:
                    failures.append((txn.reference_number, str(exc)))

        if failures:
            self.stdout.write(self.style.ERROR(f'\n{len(failures)} FAILED:'))
            for ref, err in failures:
                self.stdout.write(f'  {ref}: {err}')

        self.stdout.write(self.style.SUCCESS(
            f'\nApplied. Reversed {len(to_reverse) - len(failures)}/{len(to_reverse)} transaction(s).'
        ))
