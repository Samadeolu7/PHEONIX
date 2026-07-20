"""
banks/management/commands/diagnose_hidden_payments.py
=====================================================
Diagnostic: finds ERP payments that should be visible as link candidates
but aren't — because their exception is resolved, or they have no
exception at all despite being a pending payment.

Usage:
    python manage.py diagnose_hidden_payments --bank-account-id <id> --date 2026-07-01
    python manage.py diagnose_hidden_payments  (scans all)
"""
from __future__ import annotations

from django.core.management.base import BaseCommand
from django.utils import timezone


class Command(BaseCommand):
    help = "Diagnose why ERP payments are not showing as link candidates."

    def add_arguments(self, parser):
        parser.add_argument('--bank-account-id', type=int, default=None)
        parser.add_argument('--date', type=str, default=None, help='YYYY-MM-DD')

    def handle(self, *args, **options):
        from banks.models import (
            BankAccount, DailyReconciliation, ReconciliationBankTransaction,
            ReconciliationException,
        )
        from django.db.models import Q

        recon_qs = DailyReconciliation.objects.select_related('bank_account').order_by('reconciliation_date')
        if options['bank_account_id']:
            recon_qs = recon_qs.filter(bank_account_id=options['bank_account_id'])
        if options['date']:
            recon_qs = recon_qs.filter(reconciliation_date=options['date'])

        self.stdout.write(self.style.HTTP_INFO('=== DIAGNOSIS: Why are payments hidden? ===\n'))

        # ── 1. Unmatched bank txs with no exception at all ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 1: Unmatched bank txs with NO exception ---'))
        count1 = 0
        for recon in recon_qs:
            unmatched = ReconciliationBankTransaction.objects.filter(
                bank_account=recon.bank_account,
                value_date=recon.reconciliation_date,
                matched=False,
            )
            for tx in unmatched:
                exc = ReconciliationException.objects.filter(
                    reconciliation=recon,
                    bank_transaction_id=tx.id,
                    exception_type='bank_only',
                ).first()
                if not exc:
                    count1 += 1
                    self.stdout.write(
                        f'  bank tx {tx.id} amount={tx.amount} {tx.direction} '
                        f'({tx.bank_ref[:50]}) — NO bank_only exception!'
                    )
        if count1 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count1}\n')

        # ── 2. Bank txs that are unmatched but bank_only exc is still resolved ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 2: Unmatched bank txs but bank_only exc STILL RESOLVED ---'))
        count2 = 0
        for recon in recon_qs:
            unmatched = ReconciliationBankTransaction.objects.filter(
                bank_account=recon.bank_account,
                value_date=recon.reconciliation_date,
                matched=False,
            )
            for tx in unmatched:
                exc = ReconciliationException.objects.filter(
                    reconciliation=recon,
                    bank_transaction_id=tx.id,
                    exception_type='bank_only',
                    resolved=True,
                ).first()
                if exc:
                    count2 += 1
                    self.stdout.write(
                        f'  bank tx {tx.id} amount={tx.amount} — exc id={exc.pk} '
                        f'is STILL RESOLVED (resolved={exc.resolved})'
                    )
        if count2 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count2}\n')

        # ── 3. Unmatched bank txs whose erp_only counterpart is still resolved ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 3: Unmatched bank txs but erp_only counterpart STILL RESOLVED ---'))
        count3 = 0
        for recon in recon_qs:
            unmatched = ReconciliationBankTransaction.objects.filter(
                bank_account=recon.bank_account,
                value_date=recon.reconciliation_date,
                matched=False,
                matched_erp_payment_id__isnull=False,
            )
            for tx in unmatched:
                erp_exc = ReconciliationException.objects.filter(
                    reconciliation__bank_account=recon.bank_account,
                    exception_type='erp_only',
                    loan_payment_id=tx.matched_erp_payment_id,
                    resolved=True,
                ).first()
                if erp_exc:
                    count3 += 1
                    self.stdout.write(
                        f'  bank tx {tx.id} amount={tx.amount} matched_erp_payment={tx.matched_erp_payment_id} — '
                        f'erp_only exc id={erp_exc.pk} on recon {erp_exc.reconciliation_id} is STILL RESOLVED'
                    )
        if count3 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count3}\n')

        # ── 4. ERP payments (pending, unmatched) with NO erp_only exception ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 4: Bank txs matched to erp but NO erp_only exception exists ---'))
        count4 = 0
        for recon in recon_qs:
            unmatched = ReconciliationBankTransaction.objects.filter(
                bank_account=recon.bank_account,
                value_date=recon.reconciliation_date,
                matched=False,
                matched_erp_payment_id__isnull=False,
            )
            for tx in unmatched:
                erp_exc = ReconciliationException.objects.filter(
                    reconciliation__bank_account=recon.bank_account,
                    exception_type='erp_only',
                    loan_payment_id=tx.matched_erp_payment_id,
                ).first()
                if not erp_exc:
                    count4 += 1
                    self.stdout.write(
                        f'  bank tx {tx.id} amount={tx.amount} matched_erp_payment={tx.matched_erp_payment_id} — '
                        f'NO erp_only exception exists at all!'
                    )
        if count4 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count4}\n')

        # ── 5. Exceptions blocked by pending_bank_payment ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 5: Unresolved exceptions blocked by pending_bank_payment ---'))
        count5 = 0
        for recon in recon_qs:
            blocked = recon.exceptions.filter(resolved=False, pending_bank_payment__isnull=False)
            for exc in blocked:
                count5 += 1
                self.stdout.write(
                    f'  exc id={exc.pk} ({exc.exception_type}, {exc.resolve_amount}) — '
                    f'blocked by pending_bank_payment id={exc.pending_bank_payment_id}'
                )
        if count5 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count5}\n')

        # ── 6. Unresolved exceptions whose netted_with partner is RESOLVED ──
        self.stdout.write(self.style.HTTP_INFO('--- Category 6: Unresolved exceptions whose netted_with is RESOLVED ---'))
        count6 = 0
        for recon in recon_qs:
            linked = recon.exceptions.filter(resolved=False, netted_with__isnull=False)
            for exc in linked:
                if exc.netted_with and exc.netted_with.resolved:
                    count6 += 1
                    self.stdout.write(
                        f'  exc id={exc.pk} ({exc.exception_type}, {exc.resolve_amount}) — '
                        f'netted_with exc id={exc.netted_with_id} which is RESOLVED'
                    )
        if count6 == 0:
            self.stdout.write('  (none found)')
        self.stdout.write(f'  Total: {count6}\n')

        # ── SUMMARY ──
        self.stdout.write(self.style.HTTP_INFO('=== SUMMARY ==='))
        self.stdout.write(f'  Cat 1 - No exception at all:              {count1}')
        self.stdout.write(f'  Cat 2 - Bank_only still resolved:          {count2}')
        self.stdout.write(f'  Cat 3 - ERP_only still resolved:           {count3}')
        self.stdout.write(f'  Cat 4 - No erp_only exception exists:      {count4}')
        self.stdout.write(f'  Cat 5 - Blocked by pending_bank_payment:   {count5}')
        self.stdout.write(f'  Cat 6 - Linked_to is resolved:             {count6}')
