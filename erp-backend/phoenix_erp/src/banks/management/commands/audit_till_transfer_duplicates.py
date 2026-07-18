"""
banks/management/commands/audit_till_transfer_duplicates.py
================================================================
Audit (and, with --apply, repair) the "fabricated till transfer" pattern
found in production: officers/treasury used the cashier→bank Transfer
screen to LOG client deposits they saw arriving in the bank — but a
cashier→bank BankTransfer posts DR bank / CR cashier till, which asserts
the TILL handed over the money. When the bank statement narration shows
the money actually arrived from the client's own account, the till never
touched it, so every such transfer (a) falsely drains the officer's till
and (b) double-counts the deposit on the bank GL whenever the real
posting (a loan repayment, a savings deposit, or the RECL/MOVEB misposting
cleanup chain) also carries it.

Classification is evidence-based, per transfer:
  CONFIRMED_DUPLICATE — the transfer's journal is matched to a bank
      statement line, and a covering ERP record PROVABLY exists. Proof is
      deliberately strict (a looser first pass over-matched against
      clients who repay the same round amount daily): the covering
      transaction must be dated within ±1 day of the LINE's value date,
      its total money-side (DEBIT) legs must equal the transfer amount
      exactly, it must post NOTHING to any bank GL (the misposted-payment
      signature — a payment with its own bank leg has its own statement
      line and can't be covering someone else's), its client's name
      (resolved via the loan number in its description, falling back to
      the description) must appear in the line's narration, and it must
      not be claimed as covering by any other transfer (a covering record
      explains at most one line — collisions demote the whole group to
      review). Only this bucket is ever auto-repaired.
  NO_COVERING_RECORD — matched to a line, but no covering record proven.
      Could be a genuine till banking OR a sole-record fabrication whose
      client payment was never properly posted. Reported for human review,
      never touched.
  UNMATCHED_JOURNAL — the transfer's journal isn't matched to any
      statement line; nothing to verify against. Reported only.

--apply repairs each CONFIRMED_DUPLICATE with proper accounting:
  1. Reverse the transfer's journal via the audited Transaction.reverse()
     (counter entries: DR till / CR bank) — restores the wrongly-drained
     till and removes the double-count from the bank GL. Guarded: the
     journal must have exactly the two cashier/bank legs and be approved,
     un-reversed — anything else is skipped and reported.
  2. Unmatch the claimed statement line (audited unmatch(), reopening it
     as a bank_only exception), then resolve that exception with the
     covering reference in the notes — the covering record has no bank
     leg (criterion above), so no direct match can ever exist.

Usage:
    python manage.py audit_till_transfer_duplicates --user-id <id>            (dry-run audit)
    python manage.py audit_till_transfer_duplicates --user-id <id> --apply
"""
import re

from django.core.management.base import BaseCommand, CommandError

# Kept short: Transaction.reverse() embeds the reason inside the reversal
# transaction's description (max_length=255), so a long reason overflows it.
REVERSE_REASON = (
    'Fabricated till transfer — deposit came from the client directly, '
    'covered by {covering} (audit_till_transfer_duplicates)'
)
UNMATCH_REASON = (
    'This line was claimed by a fabricated cashier→bank transfer ({transfer}), now '
    'reversed — the deposit is really covered by {covering}.'
)
RESOLVE_NOTE = (
    'Deposit verified in bank; its ERP record is {covering}, whose bank leg was '
    'posted elsewhere (misposting cleanup chain), so no direct match will ever '
    'exist. See audit_till_transfer_duplicates.'
)

_TOKEN_RE = re.compile(r'[A-Za-z]{5,}')
_STOPWORDS = {
    'TRANSFER', 'KRYSTAR', 'TRUST', 'INWARD', 'CPWINWARD', 'MOBILE', 'THRIFT',
    'DEPOSIT', 'PAYMENT', 'REPAYMENT', 'CUSTOM', 'CUSTOMER', 'INVESTMENT',
    'ACCOUNT', 'SAVINGS',
}


def _name_tokens(text):
    return {
        t.upper() for t in _TOKEN_RE.findall(text or '')
        if t.upper() not in _STOPWORDS
    }


class Command(BaseCommand):
    help = (
        "Audits cashier→bank transfers that claimed client-deposit statement lines "
        "and (with --apply) reverses confirmed duplicates with full accounting."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute reversals/unmatches to.')
        parser.add_argument('--apply', action='store_true', help='Repair CONFIRMED_DUPLICATE transfers (default: dry-run audit).')
        parser.add_argument('--dry-run', action='store_true', help='Audit only — the default; accepted for explicitness.')

    def handle(self, *args, **options):
        from datetime import timedelta

        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError
        from django.db.models import Q
        from django.utils import timezone

        from banks.models import BankTransfer, DailyReconciliation, ReconciliationBankTransaction
        from banks.reconciliation_utils import (
            _LOAN_NUMBER_RE, get_or_create_bank_only_exception, recompute_reconciliation_counts,
        )
        from transactions.models import Transaction, TransactionEntry

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")
        apply_changes = options['apply']

        def client_tokens(txn):
            """Name tokens for a covering candidate — via its loan's client
            when the description carries a loan number, else the description."""
            m = _LOAN_NUMBER_RE.search(txn.description or '')
            if m:
                try:
                    from loans.models import LoanAccount
                    la = LoanAccount.objects.filter(loan_number=m.group(1).strip()).select_related('client').first()
                    if la is not None and la.client_id:
                        tokens = _name_tokens(str(la.client))
                        if tokens:
                            return tokens
                except Exception:
                    pass
            return _name_tokens(txn.description)

        from banks.models import BankAccount

        bank_gl_ids = set(
            BankAccount.objects.filter(gl_account_id__isnull=False).values_list('gl_account_id', flat=True)
        )

        transfers = (
            BankTransfer.objects.filter(
                source_type='cashier', destination_type='bank',
                status='completed', journal_entry__isnull=False,
                journal_entry__is_reversed=False,
            )
            .select_related('journal_entry', 'source_cashier_account', 'destination_bank_account')
            .order_by('journal_entry__date', 'id')
        )

        confirmed, no_cover, unmatched_journal = [], [], []

        for transfer in transfers:
            je = transfer.journal_entry
            line = ReconciliationBankTransaction.objects.filter(
                matched=True, matched_erp_payment_id=je.id,
            ).select_related('bank_account').first()
            if line is None:
                unmatched_journal.append(transfer)
                continue

            narration_upper = (line.narration or '').upper()
            # STRICT covering criteria — a first pass with a ±7-day window
            # and any-entry amount equality over-matched badly in production
            # (clients repaying the same round amount daily produce a
            # same-amount transaction on every nearby date, so almost any
            # claimed line "confirmed" against some legitimate neighboring
            # payment that has its own statement line). Proof now requires:
            #   1. date: the covering transaction's own date within ±1 day
            #      of the LINE's value date — same real-world event, not a
            #      neighboring installment;
            #   2. amount: the covering transaction's total money-side
            #      (DEBIT) legs equal the transfer amount exactly — not
            #      just any single entry of a larger payment;
            #   3. no bank leg: the covering transaction posts NOTHING to
            #      any bank GL — the misposted-payment signature. A payment
            #      with its own bank-GL leg has (or will get) its own
            #      statement line and cannot be covering someone else's.
            window = (line.value_date - timedelta(days=1), line.value_date + timedelta(days=1))
            # Whitelist of PAYMENT-type series only. A charge/fee posting
            # (e.g. LFAPR risk premium: DR receivable / CR income) can pass
            # every structural check — right amount, no bank leg, client
            # name matches — while recording money being LEVIED, not money
            # ARRIVING. If the client's transfer was the payment OF that
            # fee, the till transfer's bank debit may be the only record of
            # the cash actually landing, and reversing it would remove a
            # real deposit from the bank GL. Only records that assert a
            # payment was received may cover a statement line.
            candidates = (
                Transaction.objects.filter(
                    entries__amount__lte=transfer.amount,
                    date__range=window,
                    approved=True, is_deleted=False,
                    is_reversal=False, is_reversed=False,
                )
                .filter(
                    Q(reference_number__startswith='LNPMT')
                    | Q(reference_number__startswith='SVDEP')
                )
                .exclude(pk=je.pk)
                .distinct()
                .prefetch_related('entries')
            )
            covering = None
            for cand in candidates:
                entries = list(cand.entries.all())
                if any(e.account_id in bank_gl_ids for e in entries):
                    continue
                debit_total = sum(e.amount for e in entries if e.side == TransactionEntry.DEBIT)
                if debit_total != transfer.amount:
                    continue
                tokens = client_tokens(cand)
                if tokens and any(tok in narration_upper for tok in tokens):
                    covering = cand
                    break

            if covering is not None:
                confirmed.append((transfer, line, covering))
            else:
                no_cover.append((transfer, line))

        # Uniqueness guard: one covering record can explain at most ONE
        # claimed line. If several transfers matched the same covering
        # record, none of them is proven — demote the whole group to
        # review rather than picking a winner.
        from collections import Counter

        cover_counts = Counter(covering.pk for _t, _l, covering in confirmed)
        unique_confirmed = []
        for transfer, line, covering in confirmed:
            if cover_counts[covering.pk] == 1:
                unique_confirmed.append((transfer, line, covering))
            else:
                no_cover.append((transfer, line))
        confirmed = unique_confirmed

        self.stdout.write(self.style.WARNING('DRY RUN — audit only, no changes.\n') if not apply_changes else '')
        self.stdout.write(f'Cashier→bank transfers examined: {transfers.count()}')
        self.stdout.write(f'  CONFIRMED_DUPLICATE : {len(confirmed)} (auto-repairable)')
        self.stdout.write(f'  NO_COVERING_RECORD  : {len(no_cover)} (manual review — genuine till banking OR sole-record fabrication)')
        self.stdout.write(f'  UNMATCHED_JOURNAL   : {len(unmatched_journal)} (not claiming any statement line)\n')

        for transfer, line, covering in confirmed:
            self.stdout.write(
                f'  CONFIRMED {transfer.transfer_number} ({transfer.journal_entry.reference_number}) '
                f'₦{transfer.amount} till={transfer.source_cashier_account} -> '
                f'line {line.value_date} [{(line.narration or "")[:45]}] covered by {covering.reference_number} '
                f'[{(covering.description or "")[:40]}]'
            )
        if no_cover:
            self.stdout.write('')
            for transfer, line in no_cover:
                self.stdout.write(
                    f'  REVIEW    {transfer.transfer_number} ({transfer.journal_entry.reference_number}) '
                    f'₦{transfer.amount} till={transfer.source_cashier_account} desc="{transfer.description[:30]}" -> '
                    f'line {line.value_date} [{(line.narration or "")[:45]}]'
                )

        if not apply_changes:
            if confirmed:
                self.stdout.write(f'\nWould reverse {len(confirmed)} transfer(s). Re-run with --apply.')
            return
        if not confirmed:
            self.stdout.write(self.style.SUCCESS('Nothing to repair.'))
            return

        now = timezone.now()
        self.stdout.write('\nRepairing confirmed duplicates...')
        for transfer, line, covering in confirmed:
            je = transfer.journal_entry
            legs = list(je.entries.all())
            leg_shape = {(e.account_id, e.side, e.amount) for e in legs}
            expected = {
                (transfer.destination_bank_account.gl_account_id, TransactionEntry.DEBIT, transfer.amount),
                (transfer.source_cashier_account.account_id, TransactionEntry.CREDIT, transfer.amount),
            }
            if leg_shape != expected:
                self.stdout.write(self.style.WARNING(
                    f'  skipped {transfer.transfer_number}: journal legs do not have the pure '
                    f'till→bank shape — manual review required.'
                ))
                continue

            try:
                je.reverse(acting_user, reason=REVERSE_REASON.format(covering=covering.reference_number))
                line.unmatch(acting_user, UNMATCH_REASON.format(
                    transfer=transfer.transfer_number, covering=covering.reference_number,
                ))
            except ValidationError as exc:
                self.stdout.write(self.style.WARNING(f'  skipped {transfer.transfer_number}: {exc}'))
                continue

            # A confirmed covering record never has its own bank-GL leg
            # (criterion 3), so no direct match can ever exist for this
            # line — resolve its reopened exception against the covering
            # reference immediately.
            recon = DailyReconciliation.objects.filter(
                bank_account=line.bank_account, reconciliation_date=line.value_date,
            ).first()
            if recon is not None:
                exc_obj = get_or_create_bank_only_exception(recon, line)
                exc_obj.resolved = True
                exc_obj.resolved_by = acting_user
                exc_obj.resolved_at = now
                exc_obj.resolution_notes = RESOLVE_NOTE.format(covering=covering.reference_number)
                exc_obj.save(update_fields=['resolved', 'resolved_by', 'resolved_at', 'resolution_notes'])
                outcome = f'exception resolved against {covering.reference_number}'
                recompute_reconciliation_counts(recon)
            else:
                outcome = 'no reconciliation exists for the line date — nothing to annotate'

            self.stdout.write(
                f'  reversed {transfer.transfer_number} -> {je.reversal_transaction.reference_number}; '
                f'line unmatched; {outcome}'
            )

        self.stdout.write(self.style.SUCCESS('\nDone.'))
