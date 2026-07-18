"""
banks/management/commands/resolve_fee_link_erp_only_exceptions.py
================================================================
One-time (and safely re-runnable) cleanup for false erp_only exceptions
created for bank-charge-link fee payments.

The bank-charge Link pathway (_resolve_bank_charge_pair, banks/views.py)
books the bank-deducted transfer fee as a real Expense + BankPayment. Once
approved, that payment posts a CR to the bank's GL — but the fee amount was
embedded INSIDE the bigger bank statement line the link already consumed,
so no separate statement line for the fee exists or ever will. Every
reconciliation rerun therefore reported the fee payment as a false erp_only
exception. fetch_erp_payments now excludes these payments from the
candidate pool going forward (see the fee_link_txn_ids exclusion there);
this command resolves the false exceptions already created before that fix.

DUPLICATE GUARD: a fee exception is only auto-resolved when its fee payment
is the ONLY one tracing back to its underlying bank statement line. If two
or more fee payments trace to the same bank line (possible via the earlier
duplicate-exception issue: the same real transfer produced two bank_only
exceptions, each of which got its own fee link), the bank only charged the
fee once — the extra booking is a genuine ERP overstatement, and its
erp_only exception is the ONLY surviving signal of that. Those are reported
for manual review (reverse the duplicate expense), never auto-resolved.

Usage:
    python manage.py resolve_fee_link_erp_only_exceptions --dry-run
    python manage.py resolve_fee_link_erp_only_exceptions
"""
from django.core.management.base import BaseCommand

FEE_LINK_RESOLVE_NOTE = (
    'Auto-resolved: this is the bank-charge fee payment from a linked '
    'bank_only/erp_only pair — the fee was embedded in the linked bank '
    'statement line, so no separate bank line for it exists or ever will.'
)


class Command(BaseCommand):
    help = (
        "Resolves false erp_only exceptions created for bank-charge-link fee "
        "payments (fee embedded in the already-linked bank line), with a "
        "duplicate-fee guard that leaves suspected double-bookings open."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')

    def handle(self, *args, **options):
        from collections import defaultdict

        from django.utils import timezone

        from banks.models import DailyReconciliation, ReconciliationException
        from banks.reconciliation_utils import recompute_reconciliation_counts

        dry_run = options['dry_run']
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        # Every bank-charge link: a bank_only exception with both
        # pending_bank_payment and netted_with set. Group by the underlying
        # bank statement line so duplicate fee bookings for the same real
        # line are caught even when they came from distinct exception rows.
        link_excs = list(ReconciliationException.objects.filter(
            exception_type='bank_only',
            pending_bank_payment__isnull=False,
            netted_with__isnull=False,
        ).select_related('pending_bank_payment'))

        by_bank_line = defaultdict(list)
        for exc in link_excs:
            by_bank_line[exc.bank_transaction_id].append(exc)

        clean_txn_ids = {}      # journal_entry_id -> source link exc
        duplicate_groups = []   # [(bank_transaction_id, [link excs])]
        for bank_tx_id, excs in by_bank_line.items():
            if bank_tx_id is not None and len(excs) > 1:
                duplicate_groups.append((bank_tx_id, excs))
                continue
            for exc in excs:
                je_id = exc.pending_bank_payment.journal_entry_id
                if je_id is not None:
                    clean_txn_ids[je_id] = exc

        false_excs = list(ReconciliationException.objects.filter(
            exception_type='erp_only', resolved=False,
            loan_payment_id__in=clean_txn_ids.keys(),
        ).select_related('reconciliation'))

        self.stdout.write(f'Bank-charge links found: {len(link_excs)}')
        self.stdout.write(f'  Fee payments with a unique bank line: {len(clean_txn_ids)}')
        self.stdout.write(f'  Open false erp_only exceptions to resolve: {len(false_excs)}')
        self.stdout.write(f'  Suspected duplicate fee groups (left open): {len(duplicate_groups)}\n')

        if duplicate_groups:
            self.stdout.write(self.style.WARNING(
                'SUSPECTED DUPLICATE FEES — multiple fee payments trace to the same bank line; '
                'the bank charged once, so the extra booking overstates expenses. Review and '
                'reverse the duplicate expense; its erp_only exception is left open on purpose:'
            ))
            for bank_tx_id, excs in duplicate_groups:
                self.stdout.write(f'  bank line {bank_tx_id}:')
                for exc in excs:
                    payment = exc.pending_bank_payment
                    self.stdout.write(
                        f'    link exc={exc.id} payment={payment.id} amount={payment.amount} '
                        f'journal_entry_id={payment.journal_entry_id} desc={payment.description[:80]}'
                    )
            self.stdout.write('')

        now = timezone.now()
        touched_recon_ids = set()
        for exc in false_excs:
            src = clean_txn_ids[exc.loan_payment_id]
            self.stdout.write(
                f'  {"[DRY RUN] " if dry_run else ""}erp_only exception id={exc.id} '
                f'(payment txn={exc.loan_payment_id}, ₦{exc.erp_amount}) -> resolving, '
                f'fee embedded in linked bank line (link exc={src.id})'
            )
            if not dry_run:
                exc.resolved = True
                exc.resolved_at = now
                exc.resolution_notes = FEE_LINK_RESOLVE_NOTE
                exc.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])
            touched_recon_ids.add(exc.reconciliation_id)

        action = 'Would resolve' if dry_run else 'Resolved'
        self.stdout.write(f'\n{action} {len(false_excs)} exception(s).')

        if dry_run or not touched_recon_ids:
            return

        self.stdout.write('\nRecomputing counts for affected reconciliations...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'unmatched_bank={recon.unmatched_bank_count} unmatched_erp={recon.unmatched_erp_count}'
            )
