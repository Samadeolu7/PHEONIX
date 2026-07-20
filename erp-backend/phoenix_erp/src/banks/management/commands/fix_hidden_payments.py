"""
banks/management/commands/fix_hidden_payments.py
================================================
One-time (and safely re-runnable) data fix for the issues detected by
diagnose_hidden_payments:

  Cat 2 — Unmatched bank txs whose bank_only exception is STILL RESOLVED:
    Reopens bank_only exceptions that stayed resolved after a bank tx was
    unmatched (the old unmatch bug or a manual resolve before unmatch).

  Cat 4 — Bank txs with matched_erp_payment_id but NO erp_only exception:
    Creates the missing erp_only exception so the ERP payment shows up as
    a link candidate.  Looks up the Transaction to fill erp_amount/date/narration.

  Cat 5 — Exceptions blocked by pending_bank_payment:
    If the BankPayment is rejected/failed, clears pending_bank_payment so
    the exception can be manually resolved.  Draft/pending/approved/posted
    payments are left alone (they'll auto-resolve on the next rerun).

  Cat 6 — Unresolved exceptions whose netted_with partner is RESOLVED:
    Resolves the unresolved side to restore pair consistency.

All changes are followed by recompute_reconciliation_counts on affected
reconciliations.

Usage:
    python manage.py fix_hidden_payments --dry-run
    python manage.py fix_hidden_payments
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Fixes hidden payments: reopens stale bank_only exceptions, creates "
        "missing erp_only exceptions, frees rejected/failed pending payments, "
        "and resolves stranded netted_with pairs."
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Preview without making changes.')
        parser.add_argument('--cat', type=int, nargs='*', default=[2, 4, 5, 6],
                            help='Categories to fix (default: 2 4 5 6)')

    def handle(self, *args, **options):
        from banks.models import (
            BankPayment, DailyReconciliation, ReconciliationBankTransaction,
            ReconciliationException,
        )
        from banks.reconciliation_utils import recompute_reconciliation_counts

        dry_run = options['dry_run']
        cats = set(options['cat'])
        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        touched_recon_ids: set[int] = set()
        total_fixes = 0

        # ── Cat 2: Reopen bank_only exceptions for unmatched bank txs ──
        if 2 in cats:
            self.stdout.write(self.style.HTTP_INFO('--- Category 2: Reopening bank_only excs for unmatched bank txs ---'))
            count2 = 0
            for recon in DailyReconciliation.objects.select_related('bank_account').order_by('reconciliation_date'):
                unmatched_txs = ReconciliationBankTransaction.objects.filter(
                    bank_account=recon.bank_account,
                    value_date=recon.reconciliation_date,
                    matched=False,
                )
                for tx in unmatched_txs:
                    bank_exc = ReconciliationException.objects.filter(
                        reconciliation=recon,
                        exception_type='bank_only',
                        bank_transaction_id=tx.id,
                        resolved=True,
                    ).first()
                    if not bank_exc:
                        continue
                    count2 += 1
                    touched_recon_ids.add(recon.id)
                    self.stdout.write(
                        f'  {"[DRY RUN] " if dry_run else ""}'
                        f'unresolving bank_only exc id={bank_exc.pk} '
                        f'({bank_exc.bank_amount}) — bank tx {tx.id} is unmatched'
                    )
                    if not dry_run:
                        bank_exc.resolved = False
                        bank_exc.save(update_fields=['resolved'])
            self.stdout.write(f'  Total: {count2}\n')
            total_fixes += count2

        # ── Cat 4: Create missing erp_only exceptions ──
        if 4 in cats:
            self.stdout.write(self.style.HTTP_INFO('--- Category 4: Creating missing erp_only exceptions ---'))
            count4 = 0
            for recon in DailyReconciliation.objects.select_related('bank_account').order_by('reconciliation_date'):
                unmatched_with_payment = ReconciliationBankTransaction.objects.filter(
                    bank_account=recon.bank_account,
                    value_date=recon.reconciliation_date,
                    matched=False,
                    matched_erp_payment_id__isnull=False,
                )
                for tx in unmatched_with_payment:
                    exists = ReconciliationException.objects.filter(
                        reconciliation__bank_account=recon.bank_account,
                        exception_type='erp_only',
                        loan_payment_id=tx.matched_erp_payment_id,
                    ).exists()
                    if exists:
                        continue

                    from transactions.models import Transaction, TransactionEntry

                    txn = Transaction.objects.filter(
                        id=tx.matched_erp_payment_id,
                        is_deleted=False,
                    ).select_related('created_by', 'created_by__branch').first()
                    if txn is None:
                        self.stdout.write(
                            f'  {"[DRY RUN] " if dry_run else ""}'
                            f'SKIP bank tx {tx.id} matched_erp_payment={tx.matched_erp_payment_id} — '
                            f'Transaction not found or deleted'
                        )
                        continue

                    target_recon = DailyReconciliation.objects.filter(
                        bank_account=recon.bank_account,
                        reconciliation_date=txn.date,
                    ).order_by('-reconciliation_date').first()
                    if target_recon is None:
                        target_recon = recon

                    erp_amount = None
                    entry = TransactionEntry.objects.filter(transaction=txn).first()
                    if entry:
                        erp_amount = entry.amount

                    erp_branch = getattr(getattr(txn.created_by, 'branch', None), 'pk', None)

                    count4 += 1
                    touched_recon_ids.add(target_recon.id)
                    self.stdout.write(
                        f'  {"[DRY RUN] " if dry_run else ""}'
                        f'creating erp_only exc for loan_payment_id={tx.matched_erp_payment_id} '
                        f'(txn={txn.id}, amount={erp_amount}) '
                        f'— bank tx {tx.id} has no erp_only exception'
                    )
                    if not dry_run:
                        ReconciliationException.objects.get_or_create(
                            reconciliation=target_recon,
                            exception_type='erp_only',
                            loan_payment_id=tx.matched_erp_payment_id,
                            defaults={
                                'direction': tx.direction,
                                'bank_transaction_id': tx.id,
                                'bank_amount': tx.amount,
                                'bank_narration': tx.narration,
                                'bank_date': tx.value_date,
                                'loan_payment_id': tx.matched_erp_payment_id,
                                'erp_amount': erp_amount,
                                'erp_narration': (txn.description or '')[:500],
                                'erp_date': txn.date,
                                'officer': txn.created_by,
                                'erp_branch_id': erp_branch,
                                'is_high_priority': True,
                            },
                        )
            self.stdout.write(f'  Total: {count4}\n')
            total_fixes += count4

        # ── Cat 5: Free exceptions blocked by rejected/failed payments ──
        if 5 in cats:
            self.stdout.write(self.style.HTTP_INFO('--- Category 5: Clearing pending_bank_payment for rejected/failed payments ---'))
            count5 = 0
            blocked = ReconciliationException.objects.filter(
                resolved=False,
                pending_bank_payment__isnull=False,
            ).select_related('pending_bank_payment', 'reconciliation')
            for exc in blocked:
                payment = exc.pending_bank_payment
                if payment is None:
                    continue
                if payment.status not in ('rejected', 'failed'):
                    self.stdout.write(
                        f'  SKIP exc id={exc.pk} — payment {payment.payment_number} '
                        f'status={payment.status} (not rejected/failed)'
                    )
                    continue
                count5 += 1
                touched_recon_ids.add(exc.reconciliation_id)
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}'
                    f'clearing pending_bank_payment on exc id={exc.pk} '
                    f'({exc.exception_type}, {exc.resolve_amount}) — '
                    f'payment {payment.payment_number} is {payment.status}'
                )
                if not dry_run:
                    exc.pending_bank_payment = None
                    exc.save(update_fields=['pending_bank_payment'])
            self.stdout.write(f'  Total: {count5}\n')
            total_fixes += count5

        # ── Cat 6: Resolve unresolved exceptions with resolved netted_with ──
        if 6 in cats:
            self.stdout.write(self.style.HTTP_INFO('--- Category 6: Resolving stranded netted_with pairs ---'))
            count6 = 0
            now = timezone.now()
            stranded = ReconciliationException.objects.filter(
                resolved=False,
                netted_with__isnull=False,
            ).select_related('netted_with', 'reconciliation')
            for exc in stranded:
                partner = exc.netted_with
                if partner is None or not partner.resolved:
                    continue
                count6 += 1
                touched_recon_ids.add(exc.reconciliation_id)
                self.stdout.write(
                    f'  {"[DRY RUN] " if dry_run else ""}'
                    f'resolving exc id={exc.pk} ({exc.exception_type}, {exc.resolve_amount}) — '
                    f'netted_with exc id={partner.pk} is already resolved'
                )
                if not dry_run:
                    exc.resolved = True
                    exc.resolved_at = now
                    exc.resolution_notes = (
                        'Auto-resolved: netted_with partner '
                        f'exc id={partner.pk} was already resolved'
                    )
                    exc.save(update_fields=['resolved', 'resolved_at', 'resolution_notes'])
            self.stdout.write(f'  Total: {count6}\n')
            total_fixes += count6

        # ── SUMMARY ──
        self.stdout.write(self.style.HTTP_INFO('=== SUMMARY ==='))
        self.stdout.write(f'  Total fixes: {total_fixes}')

        if dry_run or not touched_recon_ids:
            return

        self.stdout.write(f'\nRecomputing counts for {len(touched_recon_ids)} affected reconciliation(s)...')
        for recon in DailyReconciliation.objects.filter(id__in=touched_recon_ids).select_related('bank_account'):
            recompute_reconciliation_counts(recon)
            self.stdout.write(
                f'  recon {recon.id} ({recon.bank_account} — {recon.reconciliation_date}): '
                f'total={recon.total_bank_transactions} matched={recon.matched_count} '
                f'unmatched_bank={recon.unmatched_bank_count} unmatched_erp={recon.unmatched_erp_count}'
            )
