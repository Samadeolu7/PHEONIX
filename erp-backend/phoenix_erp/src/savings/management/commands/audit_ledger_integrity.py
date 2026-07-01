"""
savings/management/commands/audit_ledger_integrity.py
========================================================
READ-ONLY diagnostic. Makes NO database writes.

Two prior audits (audit_loan_merge_damage, audit_deleted_account_balances)
ruled out soft-deleted GL accounts as the source of the -84,000.00 trial
balance gap. This command checks the ledger itself, from the ground up:

  1. Global posted-entry totals: sum(DEBIT) vs sum(CREDIT) across every
     posted, non-deleted TransactionEntry. If these already differ, some
     transaction was posted (or entries were added/removed) without going
     through Transaction.post()'s debit==credit validation.

  2. Per-transaction balance check: any approved, non-deleted Transaction
     whose own entries don't sum to debit==credit. post() is supposed to
     make this impossible, but this checks for it directly rather than
     assuming.

  3. Per-account drift: for every non-deleted Account, compare the stored
     `balance` field (what the trial balance actually reads) against what
     summing that account's own posted TransactionEntry rows would produce.
     A mismatch here means `balance` and the ledger have diverged — from a
     direct write, a partial/failed update (e.g. the parent-account F()
     update in TransactionEntry.post() has no 0-rows-updated check), or an
     entry that was deleted/altered after posting.

  4. Same drift check scoped to just MERGE-series transactions, to confirm
     or rule out whether merge_duplicate_accounts specifically is involved.

Usage
-----
    python manage.py audit_ledger_integrity
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'READ-ONLY. Traces the trial balance gap at the ledger level: '
        'global debit/credit totals, per-transaction balance checks, and '
        'per-account stored-balance vs ledger-sum drift. Makes no changes.'
    )

    def handle(self, *args, **options):
        from accounts.models import Account
        from transactions.models import Transaction, TransactionEntry

        self.stdout.write('=== Ledger Integrity Audit (read-only) ===\n')

        # ------------------------------------------------------------
        # 1. Global posted-entry totals
        # ------------------------------------------------------------
        base_entries = TransactionEntry.objects.filter(
            posted=True, transaction__is_deleted=False, transaction__approved=True,
        )
        total_debit = base_entries.filter(side=TransactionEntry.DEBIT).aggregate(
            t=Sum('amount'))['t'] or Decimal('0.00')
        total_credit = base_entries.filter(side=TransactionEntry.CREDIT).aggregate(
            t=Sum('amount'))['t'] or Decimal('0.00')

        self.stdout.write('--- 1. Global posted TransactionEntry totals ---')
        self.stdout.write(f'  Total DEBIT  entries : {total_debit}')
        self.stdout.write(f'  Total CREDIT entries : {total_credit}')
        self.stdout.write(f'  Difference (D - C)   : {total_debit - total_credit}\n')

        # ------------------------------------------------------------
        # 2. Per-transaction imbalance check
        # ------------------------------------------------------------
        self.stdout.write('--- 2. Approved transactions where entries do not balance ---')
        bad_txns = []
        for txn in Transaction.objects.filter(approved=True, is_deleted=False).iterator():
            d = txn.entries.filter(side=TransactionEntry.DEBIT).aggregate(
                t=Sum('amount'))['t'] or Decimal('0.00')
            c = txn.entries.filter(side=TransactionEntry.CREDIT).aggregate(
                t=Sum('amount'))['t'] or Decimal('0.00')
            if d != c:
                bad_txns.append((txn, d, c))

        if not bad_txns:
            self.stdout.write('  None found — every approved transaction balances internally.\n')
        else:
            for txn, d, c in bad_txns:
                self.stdout.write(self.style.ERROR(
                    f'  Transaction {txn.reference_number} (id={txn.pk}, series={txn.series_id}): '
                    f'debit={d} credit={c} diff={d - c}'
                ))
            self.stdout.write('')

        # ------------------------------------------------------------
        # 3. Per-account stored-balance vs ledger-sum drift
        # ------------------------------------------------------------
        self.stdout.write('--- 3. Account.balance vs sum-of-entries drift (all non-deleted accounts) ---')
        DEBIT_NORMAL_TYPES = {'ASSET', 'EXPENSE', 'LOAN'}
        drift_total = Decimal('0.00')
        drift_rows = []

        for acct in Account.objects.filter(is_deleted=False).iterator():
            entries = TransactionEntry.objects.filter(
                account=acct, posted=True, transaction__is_deleted=False,
            )
            d = entries.filter(side=TransactionEntry.DEBIT).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')
            c = entries.filter(side=TransactionEntry.CREDIT).aggregate(t=Sum('amount'))['t'] or Decimal('0.00')

            is_debit_normal = acct.account_type in DEBIT_NORMAL_TYPES
            computed = (d - c) if is_debit_normal else (c - d)

            if computed != acct.balance:
                diff = acct.balance - computed
                drift_rows.append((acct, computed, diff))
                drift_total += diff

        if not drift_rows:
            self.stdout.write('  None found — every account.balance matches its own ledger entries.\n')
        else:
            for acct, computed, diff in drift_rows:
                self.stdout.write(self.style.ERROR(
                    f'  {acct.code} | {acct.name} | type={acct.account_type} | level={acct.account_level}\n'
                    f'    stored balance   : {acct.balance}\n'
                    f'    computed from ledger: {computed}\n'
                    f'    drift (stored - computed): {diff}'
                ))
            self.stdout.write(self.style.WARNING(f'\n  TOTAL DRIFT across all accounts: {drift_total}\n'))

        # ------------------------------------------------------------
        # 4. Same drift check scoped to MERGE-series only
        # ------------------------------------------------------------
        self.stdout.write('--- 4. MERGE-series transactions (from merge_duplicate_accounts) ---')
        merge_txns = Transaction.objects.filter(series__code='MERGE')
        self.stdout.write(f'  Total MERGE-series transactions: {merge_txns.count()}')
        self.stdout.write(f'  Approved: {merge_txns.filter(approved=True).count()}, '
                           f'Unapproved/unposted: {merge_txns.filter(approved=False).count()}, '
                           f'Deleted: {merge_txns.filter(is_deleted=True).count()}')

        unposted = merge_txns.filter(approved=False, is_deleted=False)
        if unposted.exists():
            self.stdout.write(self.style.ERROR(
                f'  WARNING: {unposted.count()} MERGE transaction(s) exist but were never posted '
                f'(approved=False) — their entries do NOT affect account balances yet, meaning the '
                f'merge only partially completed for these.'
            ))
            for txn in unposted:
                self.stdout.write(f'    - {txn.reference_number} (id={txn.pk}): {txn.description}')
        self.stdout.write('')
