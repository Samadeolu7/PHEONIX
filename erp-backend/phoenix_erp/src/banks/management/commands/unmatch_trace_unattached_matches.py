"""
banks/management/commands/unmatch_trace_unattached_matches.py
================================================================
Frees, in bulk, every matched bank line that Payment Trace would list
under "Unattached Statement Lines" for its own amount — i.e. lines whose
claimed ERP payment does NOT come back in the trace's own
25-most-recent-same-amount payments search.

Why a director wants exactly this population freed (their call, made
explicitly): for recurring daily payers (same customer, same amount,
near-identical reference text every day — sometimes literal duplicate
ERP entries carrying the SAME reference), matching drifts into
date-shifted chains: today's bank line ends up on yesterday's payment,
yesterday's line on the day before's, and so on. Every individual
pairing looks reference-plausible, so reference-verification tools can't
untangle it — but the displaced ends of the chain surface in exactly
this panel. Unmatching the whole visible population lets a rerun
re-derive the chain with exact-date preference (or lets the director
relink by hand), instead of requiring one-by-one UI unmatching.

Scope guards:
  - --days N (default 10): only lines with value_date within the last N
    days. Old, stable matches also fall out of the 25-payment window for
    common amounts without anything being wrong with them — freeing those
    would churn correct history for no benefit, so reach back further
    only deliberately.
  - match_confidence='MANUAL' rows are never touched.
  - --amount / --bank-account-id narrow further when wanted.

Usage:
    python manage.py unmatch_trace_unattached_matches --user-id <id> --dry-run
    python manage.py unmatch_trace_unattached_matches --user-id <id> --apply
    python manage.py unmatch_trace_unattached_matches --user-id <id> --apply --amount 2000 --days 5
"""
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

REPAIR_REASON = (
    'Automated repair: this matched line appeared under Payment Trace\'s '
    '"Unattached Statement Lines" for its own amount (its claimed payment '
    'is not among the 25 most recent same-amount payments) — the signature '
    'of a date-shifted chain among recurring same-amount payments. Freed '
    'so matching can be re-derived date-aligned, or relinked by hand.'
)

MAX_RESULTS = 25  # matches PaymentTraceView.MAX_RESULTS exactly


class Command(BaseCommand):
    help = (
        "Frees every matched (non-MANUAL) bank line that Payment Trace "
        "would show under 'Unattached Statement Lines' for its own amount "
        "— recent lines only by default (--days). Dry-run unless --apply."
    )

    def add_arguments(self, parser):
        parser.add_argument('--user-id', type=int, required=True, help='User to attribute the unmatch action to.')
        parser.add_argument('--apply', action='store_true', help='Actually unmatch (default is a dry-run report).')
        parser.add_argument('--dry-run', action='store_true', help='Preview only — the default behaviour; accepted for explicitness.')
        parser.add_argument('--days', type=int, default=10, help='Only lines with value_date within the last N days (default 10).')
        parser.add_argument('--amount', type=str, default=None, help='Restrict to one exact amount, e.g. 2000.')
        parser.add_argument('--bank-account-id', type=int, default=None, help='Restrict to a single bank account.')

    def handle(self, *args, **options):
        from django.contrib.auth import get_user_model
        from django.core.exceptions import ValidationError

        from banks.models import BankAccount, ReconciliationBankTransaction
        from transactions.models import Transaction

        User = get_user_model()
        try:
            acting_user = User.objects.get(pk=options['user_id'])
        except User.DoesNotExist:
            raise CommandError(f"No user with id={options['user_id']}")

        apply_changes = options['apply']
        cutoff = timezone.now().date() - timedelta(days=options['days'])

        amount_filter = None
        if options['amount']:
            try:
                amount_filter = Decimal(options['amount'].replace(',', ''))
            except Exception:
                raise CommandError(f"Invalid amount: {options['amount']!r}")

        bank_gl_ids = set(
            BankAccount.objects.filter(gl_account_id__isnull=False).values_list('gl_account_id', flat=True)
        )

        qs = ReconciliationBankTransaction.objects.filter(
            matched=True, matched_erp_payment_id__isnull=False,
            value_date__gte=cutoff,
        ).exclude(match_confidence='MANUAL').select_related('bank_account').order_by('value_date')
        if amount_filter is not None:
            qs = qs.filter(amount=amount_filter)
        if options['bank_account_id']:
            qs = qs.filter(bank_account_id=options['bank_account_id'])

        rows = list(qs)
        if not rows:
            self.stdout.write(self.style.SUCCESS('No matched lines in scope.'))
            return

        if not apply_changes:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))
        self.stdout.write(
            f'Scanning {len(rows)} matched line(s) from the last {options["days"]} day(s) '
            f'against Payment Trace\'s own {MAX_RESULTS}-payment search...\n'
        )

        by_amount = defaultdict(list)
        for tx in rows:
            by_amount[tx.amount].append(tx)

        freed = 0
        for amount, txs in sorted(by_amount.items()):
            # Identical query to PaymentTraceView's payments search.
            visible_payment_ids = set(
                Transaction.objects.filter(
                    entries__account_id__in=bank_gl_ids,
                    entries__amount=amount,
                    approved=True, is_deleted=False,
                ).distinct().order_by('-date').values_list('id', flat=True)[:MAX_RESULTS]
            )
            for tx in txs:
                if tx.matched_erp_payment_id in visible_payment_ids:
                    continue  # renders as a normal matched payment in the trace — leave alone
                self.stdout.write(
                    f'  {"[DRY RUN] " if not apply_changes else ""}freeing tx={tx.id} {tx.bank_account} '
                    f'{tx.direction} ₦{tx.amount} on {tx.value_date} — claimed payment '
                    f'{tx.matched_erp_payment_id} falls outside the trace search '
                    f'({tx.narration[:70]!r})'
                )
                if not apply_changes:
                    freed += 1
                    continue
                try:
                    tx.unmatch(acting_user, REPAIR_REASON)
                    freed += 1
                except ValidationError as exc:
                    self.stdout.write(self.style.WARNING(f'    skipped: {exc}'))

        action = 'Would free' if not apply_changes else 'Freed'
        self.stdout.write(f'\n{action} {freed} line(s).')
        if apply_changes and freed:
            self.stdout.write(
                'Re-run reconciliation for the affected account(s) so the chain '
                're-derives date-aligned; anything ambiguous lands in review for the Link picker.'
            )
