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
      statement line, and a covering ERP record exists: a same-amount
      payment transaction within ±7 days whose client name (resolved via
      the loan number in its description, falling back to the description
      itself) appears in the statement line's narration. Only this bucket
      is ever auto-repaired.
  NO_COVERING_RECORD — matched to a line, but no covering record found.
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
     as a bank_only exception), then:
       - if the covering record itself has a matching leg on this bank's
         GL, the exception is left OPEN and the date's reconciliation is
         queued for a rerun — the matcher will pair them properly;
       - otherwise (the covering record's bank leg lives elsewhere — the
         misposted/RECL/MOVEB case) the exception is resolved immediately
         with the covering reference in the notes.

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
        from django.db.models import F
        from django.utils import timezone

        from banks.models import BankTransfer, DailyReconciliation, ReconciliationBankTransaction
        from banks.reconciliation_utils import (
            _LOAN_NUMBER_RE, get_or_create_bank_only_exception, recompute_reconciliation_counts,
        )
        from banks.tasks import run_reconciliation_match
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
            window = (je.date - timedelta(days=7), je.date + timedelta(days=7))
            candidates = (
                Transaction.objects.filter(
                    entries__amount=transfer.amount,
                    date__range=window,
                    approved=True, is_deleted=False,
                    is_reversal=False, is_reversed=False,
                )
                .exclude(pk=je.pk)
                .exclude(reference_number__startswith='BTRF')
                .exclude(reference_number__startswith='MOVEB')
                .exclude(reference_number__startswith='RECL')
                .distinct()
            )
            covering = None
            for cand in candidates:
                tokens = client_tokens(cand)
                if tokens and any(tok in narration_upper for tok in tokens):
                    covering = cand
                    break

            if covering is not None:
                confirmed.append((transfer, line, covering))
            else:
                no_cover.append((transfer, line))

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
        rerun_dates = set()
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

            bank_gl = line.bank_account.gl_account_id
            covering_has_local_leg = covering.entries.filter(
                account_id=bank_gl, side=TransactionEntry.DEBIT, amount=line.amount,
            ).exists()

            recon = DailyReconciliation.objects.filter(
                bank_account=line.bank_account, reconciliation_date=line.value_date,
            ).first()
            if recon is not None:
                exc_obj = get_or_create_bank_only_exception(recon, line)
                if covering_has_local_leg:
                    # The true record can genuinely match this line — leave the
                    # exception open and let a rerun pair them.
                    rerun_dates.add((line.bank_account_id, line.value_date))
                    outcome = 'exception left open, rerun queued (covering record can match directly)'
                else:
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

        for bank_account_id, recon_date in sorted(rerun_dates):
            recon = DailyReconciliation.objects.filter(
                bank_account_id=bank_account_id, reconciliation_date=recon_date,
            ).first()
            if recon is None or recon.status == 'processing':
                continue
            recon.status = 'processing'
            recon.rerun_count = F('rerun_count') + 1
            recon.save(update_fields=['status', 'rerun_count', 'updated_at'])
            run_reconciliation_match.delay(recon.id, recon.include_debits)
            self.stdout.write(f'  queued rerun for recon {recon.id} ({recon_date})')

        self.stdout.write(self.style.SUCCESS('\nDone.'))
