"""
banks/management/commands/find_reference_mismatched_matches.py
=================================================================
Finds currently-matched (matched=True) bank lines whose ERP payment
carries its own explicit bank reference (the "| Ref: ..." segment
LoanAccount.record_payment() embeds in Transaction.description) that does
NOT appear anywhere in the bank line it's supposedly matched to. This is
the exact shape found live: LNPMT-20260721-1314 ("Loan repayment – LN-1139
| Ref: CPWInward:.../166001324500/ADEYINKA") was matched to a bank line
narrated "CPWInward:.../166034176614/NIMOTA OL" — a completely different
transaction id and a different person's name — purely on amount+date
coincidence, while the bank line that actually DOES carry that reference
was independently claimed by an unrelated payment.

Root cause (fixed — see Bank-Recon's TransactionMatcher.java): the Java
matcher processed ERP payments one at a time in input order, greedily
claiming whichever bank line scored highest for THAT payment; an exact
amount+exact date coincidence alone (100 points) clears the HIGH-confidence
threshold (90) with zero requirement that any reference correspond, so
whichever payment was iterated first could steal a bank line ahead of a
later payment with the genuine, verbatim reference match — and the
resulting MatchedPair was always labelled "HIGH" regardless of what was
actually scored. Fixed: matching is now a single global, corroboration-
first assignment (any real reference/narration signal is claimed before
any bare amount+date coincidence), and the reported confidence is the
real computed value.

This command finds EXISTING data corrupted by the old algorithm — a
Django-side audit reusing the same "does the embedded reference actually
appear in the bank narration" check Java's BankReferenceMatcher performs,
so it can verify already-committed matches after the fact. Read-only.

To fix a flagged row: use unmatch_transaction_by_id to free it, then let
the correct pairing be found via a rerun or the manual Link picker
(find_occupied_match_conflicts is useful here too — the true bank line
this payment belongs to may currently be occupied by whatever wrongly
claimed IT).

Usage:
    python manage.py find_reference_mismatched_matches
    python manage.py find_reference_mismatched_matches --bank-account=3
"""
from __future__ import annotations

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Reports matched=True bank lines whose ERP payment's own embedded "
        "bank reference does not appear in the bank line's narration/ref — "
        "a mismatch the old amount+date-only scoring could silently produce. "
        "Read-only."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--bank-account', type=int, default=None,
            help='Restrict to a single BankAccount id.',
        )

    def handle(self, *args, **options):
        from banks.models import ReconciliationBankTransaction
        from banks.reconciliation_utils import extract_embedded_reference, reference_mismatches_bank_line
        from transactions.models import Transaction

        bank_account_id = options['bank_account']

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
        ).select_related('bank_account').order_by('value_date')
        if bank_account_id:
            qs = qs.filter(bank_account_id=bank_account_id)

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS('No matched bank lines to check.'))
            return

        payment_ids = [tx.matched_erp_payment_id for tx in rows]
        payments_by_id = {
            t.id: t for t in Transaction.objects.filter(id__in=payment_ids)
        }

        mismatched = 0
        no_ref_to_check = 0
        for tx in rows:
            payment = payments_by_id.get(tx.matched_erp_payment_id)
            if payment is None:
                continue
            description = payment.description or ''
            embedded_ref = extract_embedded_reference(description)
            if not embedded_ref:
                no_ref_to_check += 1
                continue

            if reference_mismatches_bank_line(tx, payment):
                mismatched += 1
                self.stdout.write(
                    f'[MISMATCH] tx={tx.id} {tx.bank_account} {tx.direction} ₦{tx.amount} '
                    f'on {tx.value_date} (confidence={tx.match_confidence or "?"})'
                )
                self.stdout.write(f'    bank narration: {tx.narration[:150]!r}')
                self.stdout.write(
                    f'    matched to payment {payment.id} ({payment.reference_number}): '
                    f'{description[:150]!r}'
                )
                self.stdout.write(f'    embedded reference NOT found in bank narration: {embedded_ref!r}')
                self.stdout.write(
                    f'    to free: python manage.py unmatch_transaction_by_id '
                    f'--tx-id {tx.id} --user-id <id> --reason "..."'
                )
                self.stdout.write('')

        if mismatched == 0:
            self.stdout.write(self.style.SUCCESS('No reference mismatches found.'))
        else:
            self.stdout.write(f'Found {mismatched} reference-mismatched match(es).')
        self.stdout.write(
            f'{no_ref_to_check} matched line(s) had no explicit "| Ref:" segment to check '
            f'(not verified either way).'
        )
