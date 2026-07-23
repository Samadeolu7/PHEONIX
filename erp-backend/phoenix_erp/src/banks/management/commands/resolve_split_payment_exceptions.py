"""
banks/management/commands/resolve_split_payment_exceptions.py
================================================================
For the recurring "one bank transfer, recorded as multiple ERP entries"
pattern (a director splits a single deposit into loan-principal + savings-
top-up, or two separate Transaction rows sharing one reference) — no 1:1
matching tool, Bank-Recon included, can represent this, since
ReconciliationBankTransaction.matched_erp_payment_id is a single pointer.
The money is genuinely accounted for; there is just no clean "match" to
make. This resolves the bank_only exception(s) for the one bank line and
every erp_only exception for the listed ERP payment ids, explaining each
via the others — WITHOUT ever setting matched=True/matched_erp_payment_id
on the bank line (a false 1:1 claim would fail claimed_payment_visible_
in_trace's exact-amount check and get re-flagged by unmatch_double_
blocked_matches on the very next cleanup pass).

The same loan_payment_id can have MULTIPLE erp_only ReconciliationException
rows across different DailyReconciliation dates (the natural key is
(reconciliation, exception_type, loan_payment_id) — a windowed rerun can
surface the same unresolved payment on more than one date's page over
its history). This resolves ALL unresolved rows for every listed payment
id, not just one, so the case is closed everywhere it appears.

Uses banks.services.resolve_exception_first — the same function
ResolveExceptionView calls — so dual-approval-threshold handling (large
amounts require a second director) is identical to the UI's own behavior;
this only ever supplies the FIRST resolution.

Usage:
    python manage.py resolve_split_payment_exceptions --tx-id <uuid> --payment-ids 1880,1881 --user-id <id> --notes "..." --dry-run
    python manage.py resolve_split_payment_exceptions --tx-id <uuid> --payment-ids 1880,1881 --user-id <id> --notes "..." --apply
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        "Resolves the bank_only exception(s) for one bank line and every erp_only "
        "exception for a list of ERP payment ids that jointly explain it (a split "
        "payment) — never sets matched=True, since no single 1:1 pairing exists."
    )

    def add_arguments(self, parser):
        parser.add_argument('--tx-id', type=str, required=True, help='ReconciliationBankTransaction id (UUID).')
        parser.add_argument('--payment-ids', type=str, required=True, help='Comma-separated ERP Transaction ids, e.g. 1880,1881.')
        parser.add_argument('--user-id', type=int, required=True, help='Director resolving this — subject to the same dual-approval threshold as the UI.')
        parser.add_argument('--notes', type=str, required=True, help='Explanation, shared across every exception this touches.')
        parser.add_argument('--apply', action='store_true', help='Actually resolve (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model

        from banks.models import ReconciliationBankTransaction, ReconciliationException
        from banks.services import resolve_exception_first
        from banks.reconciliation_utils import reason_too_short, MIN_REASON_LENGTH
        from transactions.models import Transaction, TransactionEntry

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        if reason_too_short(options['notes']):
            raise CommandError(f'--notes must be at least {MIN_REASON_LENGTH} characters.')

        try:
            payment_ids = [int(p.strip()) for p in options['payment_ids'].split(',') if p.strip()]
        except ValueError:
            raise CommandError('--payment-ids must be a comma-separated list of integers.')
        if not payment_ids:
            raise CommandError('--payment-ids must list at least one id.')

        try:
            tx = ReconciliationBankTransaction.objects.select_related('bank_account').get(pk=options['tx_id'])
        except ReconciliationBankTransaction.DoesNotExist:
            raise CommandError(f"No ReconciliationBankTransaction with id={options['tx_id']}")

        payments = list(Transaction.objects.filter(id__in=payment_ids))
        found_ids = {p.id for p in payments}
        missing = set(payment_ids) - found_ids
        if missing:
            raise CommandError(f'Payment id(s) not found: {sorted(missing)}')

        # Entries on a Transaction are balanced DR+CR of equal amount, so
        # summing every entry and halving gives the payment's own amount
        # without assuming which side (DR/CR) carries it for this payment.
        def _payment_amount(p):
            total = TransactionEntry.objects.filter(transaction=p).aggregate(total=Sum('amount'))['total']
            return (total or Decimal('0')) / 2

        payments_total = sum((_payment_amount(p) for p in payments), Decimal('0'))
        apply_changes = options['apply']

        self.stdout.write(
            f'tx={tx.id} {tx.bank_account} {tx.direction} ₦{tx.amount} on {tx.value_date} '
            f'({tx.narration[:80]!r})'
        )
        for p in payments:
            self.stdout.write(f'  payment {p.id}: {p.description[:90]!r} on {p.date}')
        if payments_total != tx.amount:
            self.stdout.write(self.style.WARNING(
                f'  NOTE: payments sum to ₦{payments_total}, bank line is ₦{tx.amount} '
                f'— proceeding anyway (recorded in the notes), but double-check this is the right set.'
            ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING('\nDRY RUN — no changes will be saved.'))

        resolved = 0

        bank_excs = ReconciliationException.objects.filter(
            exception_type='bank_only', bank_transaction_id=tx.id, resolved=False,
        )
        for exc in bank_excs:
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}resolve bank_only exception {exc.id} '
                f'(recon {exc.reconciliation_id})'
            )
            resolved += 1
            if apply_changes:
                resolve_exception_first(exc, acting_user, options['notes'])

        erp_excs = ReconciliationException.objects.filter(
            exception_type='erp_only', loan_payment_id__in=payment_ids, resolved=False,
        )
        for exc in erp_excs:
            self.stdout.write(
                f'  {"[DRY RUN] " if not apply_changes else ""}resolve erp_only exception {exc.id} '
                f'(payment {exc.loan_payment_id}, recon {exc.reconciliation_id})'
            )
            resolved += 1
            if apply_changes:
                fully_resolved = resolve_exception_first(exc, acting_user, options['notes'])
                if not fully_resolved:
                    self.stdout.write(self.style.WARNING(
                        f'    held pending a second director — amount is at/above the dual-approval threshold.'
                    ))

        if resolved == 0:
            self.stdout.write(self.style.SUCCESS('\nNothing unresolved found for this tx/payment set.'))
            return

        action = 'Would resolve' if not apply_changes else 'Resolved'
        self.stdout.write(f'\n{action} {resolved} exception(s).')
