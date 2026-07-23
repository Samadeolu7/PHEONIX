"""
banks/management/commands/diagnose_unattached_for_amount.py
==============================================================
For a given amount, replicates PaymentTraceView's exact search (banks/
views.py) — the same MAX_RESULTS=25, same -date/-value_date ordering, same
payments/lines queries — and reproduces PaymentTracePage.tsx's own
unattachedLines filter (!line.matched_erp_payment_id ||
!paymentIds.has(line.matched_erp_payment_id)) to get the EXACT same
"Unattached Statement Lines" list a director would see searching this
amount in the UI.

For every line that shows up there, this additionally runs the two real
diagnostic checks already built this session:
  - reference_mismatches_bank_line  (find_reference_mismatched_matches)
  - claimed_payment_visible_in_trace  (unmatch_double_blocked_matches)

and reports which ones are flagged by an ACTUAL known-bad signal versus
which are NOT flagged by either — the latter are genuinely correct matches
that only show up in this panel because the search's own MAX_RESULTS=25
payments cutoff excludes their claimed payment (an older transaction, once
25+ more recent same-amount transactions exist). Don't assume every line
in that panel is broken just because one control case checked out fine —
this checks all of them, not just one.

Usage:
    python manage.py diagnose_unattached_for_amount --amount 2000
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Replicates Payment Trace's own amount search and reports, for every "
        "line in its 'Unattached Statement Lines' panel, whether it's flagged "
        "by a real diagnostic (reference mismatch / no-longer-valid payment) "
        "or is just a MAX_RESULTS pagination artifact. Read-only."
    )

    def add_arguments(self, parser):
        parser.add_argument('--amount', type=str, required=True, help='Exact amount to search, e.g. 2000')

    def handle(self, *args, **options):
        from banks.models import BankAccount, ReconciliationBankTransaction
        from banks.reconciliation_utils import claimed_payment_visible_in_trace, reference_mismatches_bank_line
        from transactions.models import Transaction

        try:
            amount = Decimal(options['amount'].replace(',', ''))
        except Exception:
            raise CommandError(f"Invalid amount: {options['amount']!r}")

        MAX_RESULTS = 25  # matches PaymentTraceView.MAX_RESULTS exactly

        bank_gl_ids = set(
            BankAccount.objects.filter(gl_account_id__isnull=False).values_list('gl_account_id', flat=True)
        )

        # ---- payments (ERP side) — identical query to PaymentTraceView ----
        txns = list(
            Transaction.objects.filter(
                entries__account_id__in=bank_gl_ids,
                entries__amount=amount,
                approved=True, is_deleted=False,
            ).distinct().order_by('-date')[:MAX_RESULTS]
        )
        payment_ids = {t.id for t in txns}

        # ---- lines (bank side) — identical query to PaymentTraceView ----
        lines = list(
            ReconciliationBankTransaction.objects.filter(amount=amount)
            .select_related('bank_account')
            .order_by('-value_date')[:MAX_RESULTS]
        )

        # ---- claim_lines — lines pointing at the found payments, current or historical ----
        claim_lines = list(
            ReconciliationBankTransaction.objects.filter(matched_erp_payment_id__in=payment_ids)
            .select_related('bank_account')
        ) if payment_ids else []

        all_lines = {ln.pk: ln for ln in lines}
        for ln in claim_lines:
            all_lines.setdefault(ln.pk, ln)

        # ---- exact replica of PaymentTracePage.tsx's unattachedLines filter ----
        unattached = [
            ln for ln in all_lines.values()
            if not ln.matched_erp_payment_id or ln.matched_erp_payment_id not in payment_ids
        ]

        self.stdout.write(
            f'Amount ₦{amount}: {len(txns)} payment(s) in the trace search, '
            f'{len(all_lines)} line(s), {len(unattached)} would show under '
            f'"Unattached Statement Lines".\n'
        )

        if not unattached:
            self.stdout.write(self.style.SUCCESS('None — nothing to check.'))
            return

        payments_by_id = {
            t.id: t for t in Transaction.objects.filter(
                id__in=[ln.matched_erp_payment_id for ln in unattached if ln.matched_erp_payment_id]
            )
        }

        real_issues = 0
        artifacts = 0
        for ln in unattached:
            self.stdout.write(
                f'tx={ln.id} {ln.bank_account} {ln.direction} ₦{ln.amount} on {ln.value_date} '
                f'(matched={ln.matched}, confidence={ln.match_confidence or "?"})'
            )
            self.stdout.write(f'    narration: {ln.narration[:120]!r}')

            if not ln.matched_erp_payment_id:
                self.stdout.write('    -> never matched at all (genuine bank_only, not a pagination artifact)')
                real_issues += 1
                self.stdout.write('')
                continue

            payment = payments_by_id.get(ln.matched_erp_payment_id)
            flags = []
            if payment is None or not claimed_payment_visible_in_trace(ln):
                flags.append('DOUBLE-BLOCKED (payment no longer valid — see unmatch_double_blocked_matches)')
            elif reference_mismatches_bank_line(ln, payment):
                flags.append('REFERENCE MISMATCH (see find_reference_mismatched_matches / unmatch_recent_reference_mismatches)')

            if flags:
                real_issues += 1
                for f in flags:
                    self.stdout.write(self.style.ERROR(f'    -> {f}'))
            else:
                artifacts += 1
                self.stdout.write(self.style.SUCCESS(
                    '    -> genuinely correct match; only shows here because its claimed payment '
                    'fell outside this search\'s 25-most-recent-payments cutoff (pagination artifact, safe)'
                ))
            self.stdout.write('')

        self.stdout.write(
            f'Summary: {len(unattached)} shown in the panel — {real_issues} real issue(s) '
            f'(flagged by an actual diagnostic), {artifacts} pagination artifact(s) (genuinely fine).'
        )
