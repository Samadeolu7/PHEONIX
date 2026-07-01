"""
savings/management/commands/fix_misrouted_parent_entries.py
==============================================================
Corrects the trial balance gap caused by loans/views.py resolving
bank_account_id as a raw accounts.Account pk for bank_transfer / mobile_money
loan repayments, instead of a real banks.BankAccount (fixed in this same
change — see PaymentRoutingService.resolve_bank_gl_account). 14 repayments'
"cash received" debit leg landed directly on PARENT-level GL accounts
(2100 Trade and Other Payables, 4200 Other Operating Income) instead of a
real bank account. Parent balances are invisible to
generate_trial_balance()'s children-only rollup, so that money vanished from
every trial balance even though the underlying ledger was never actually
unbalanced (global posted debit == posted credit).

What this command does
-----------------------
1. Finds every PARENT-level account (with children) carrying a non-zero
   NET balance from entries posted directly against it — not hardcoded to
   2100/4200, so it also catches anything else of this shape.
2. Gets or creates a suspense/clearing CHILD account under 1100 Cash and
   Cash Equivalents: "Unidentified Cash Receipts - Pending Reconciliation".
   Your finance team should later match each amount to the real bank
   account it belongs in (see the printed original reference numbers) and
   move it there.
3. For each affected parent, posts ONE reclassification journal moving its
   net direct-entry balance into the suspense account. The ORIGINAL LNPMT
   transactions are never touched — this only adds an offsetting entry.
4. Uses TransactionEntry.objects.bulk_create() (not .create()/.save()) for
   the parent-account leg ONLY, because TransactionEntry.clean() now
   unconditionally blocks direct postings to parent accounts (the fix for
   the root cause of this whole incident). bulk_create() bypasses
   instance.save()/clean() entirely, which is exactly the narrow, one-time,
   administrator-only exception needed to zero out pre-existing
   contamination without reopening that hole for the app to use.
5. Idempotent: recomputes each parent's net direct-entry balance from the
   database immediately before acting, so re-running after a successful
   correction finds nothing left to do.

Usage
-----
    python manage.py fix_misrouted_parent_entries --dry-run
    python manage.py fix_misrouted_parent_entries
"""
from __future__ import annotations

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone


SUSPENSE_ACCOUNT_NAME = 'Unidentified Cash Receipts - Pending Reconciliation'
RECLASS_SERIES_CODE = 'RECL'  # TransactionSeries.code is varchar(5)


class Command(BaseCommand):
    help = (
        'Reclassifies balances that were misposted directly onto parent-level '
        'GL accounts into a suspense/clearing account, restoring the trial '
        'balance. Does not alter any original transaction.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Preview what would be reclassified without making any changes.',
        )

    def handle(self, *args, **options):
        dry_run = options['dry_run']
        from accounts.models import Account
        from transactions.models import Transaction, TransactionEntry, TransactionSeries

        if dry_run:
            self.stdout.write(self.style.WARNING('DRY RUN — no changes will be saved.\n'))

        DEBIT_NORMAL_TYPES = {'ASSET', 'EXPENSE', 'LOAN'}

        affected = []
        for acct in Account.objects.filter(
            account_level=Account.LEVEL_PARENT, is_deleted=False
        ).order_by('code'):
            if not acct.children.exists():
                continue
            entries = TransactionEntry.objects.filter(
                account=acct, posted=True, transaction__is_deleted=False,
            )
            debit = entries.filter(side=TransactionEntry.DEBIT).aggregate(
                t=Sum('amount'))['t'] or Decimal('0.00')
            credit = entries.filter(side=TransactionEntry.CREDIT).aggregate(
                t=Sum('amount'))['t'] or Decimal('0.00')
            net_debit = debit - credit
            if net_debit != Decimal('0.00'):
                affected.append((acct, net_debit, entries))

        if not affected:
            self.stdout.write(self.style.SUCCESS(
                'No parent accounts carry a non-zero direct-entry balance. '
                'Nothing to reclassify.'
            ))
            return

        self.stdout.write(f'Found {len(affected)} parent account(s) needing reclassification:\n')
        for acct, net_debit, entries in affected:
            refs = list(
                entries.select_related('transaction')
                .values_list('transaction__reference_number', flat=True)
                .distinct()
            )
            direction = 'net DEBIT (move to suspense as a debit)' if net_debit > 0 \
                else 'net CREDIT (move to suspense as a credit)'
            self.stdout.write(
                f'  {acct.code} {acct.name}: {abs(net_debit)} {direction}\n'
                f'    Original transactions: {", ".join(refs)}\n'
            )

        if dry_run:
            return

        with db_transaction.atomic():
            suspense_account = self._get_or_create_suspense_account(Account)
            reclass_series, _ = TransactionSeries.objects.get_or_create(
                code=RECLASS_SERIES_CODE,
                defaults={'description': 'GL Reclassification / Correction Entries'},
            )

            for acct, net_debit, entries in affected:
                refs = list(
                    entries.select_related('transaction')
                    .values_list('transaction__reference_number', flat=True)
                    .distinct()
                )
                amount = abs(net_debit)

                # description is varchar(255); the full reference list is already
                # printed to stdout above, so truncate here rather than fail the
                # journal — the offsetting entries themselves are the audit trail.
                description = (
                    f'Reclassify {amount} misposted onto parent {acct.code} to '
                    f'suspense. Orig: {", ".join(refs)}'
                )[:255]

                journal = Transaction.objects.create(
                    series=reclass_series,
                    date=timezone.now().date(),
                    description=description,
                    owner=suspense_account.owner,
                    branch=suspense_account.branch,
                )

                if net_debit > 0:
                    # Parent had a net DEBIT it should never have carried directly.
                    # Credit the parent to cancel it, debit suspense to place the
                    # amount where the trial balance will actually count it.
                    suspense_side = TransactionEntry.DEBIT
                    parent_side = TransactionEntry.CREDIT
                else:
                    suspense_side = TransactionEntry.CREDIT
                    parent_side = TransactionEntry.DEBIT

                TransactionEntry.objects.create(
                    transaction=journal,
                    account=suspense_account,
                    side=suspense_side,
                    amount=amount,
                )

                # Deliberate bypass: TransactionEntry.save()/clean() unconditionally
                # blocks direct postings to parent accounts. bulk_create() never
                # calls instance.save(), so it skips that check for this one,
                # narrow, administrator-only correction of pre-existing
                # contamination — not a new pathway for app code to use.
                parent_entry = TransactionEntry(
                    transaction=journal,
                    account=acct,
                    side=parent_side,
                    amount=amount,
                )
                TransactionEntry.objects.bulk_create([parent_entry])

                journal.post()

                self.stdout.write(self.style.SUCCESS(
                    f'  Reclassified {amount} off {acct.code} via journal '
                    f'{journal.reference_number}'
                ))

        self.stdout.write(self.style.SUCCESS(
            f'\nDone. Suspense account: {suspense_account.code} '
            f'({suspense_account.name}). Reconcile it against real bank '
            f'statements to move each amount to its true bank account.'
        ))

    def _get_or_create_suspense_account(self, Account):
        existing = Account.objects.filter(
            name=SUSPENSE_ACCOUNT_NAME, is_deleted=False
        ).first()
        if existing:
            return existing

        parent = Account.objects.get(
            code='1100', account_level=Account.LEVEL_PARENT, is_deleted=False,
        )

        existing_children = Account.objects.filter(
            parent=parent, tenant=parent.tenant, branch=parent.branch,
        ).count()
        parent_int = int(parent.code)
        seq = existing_children + 1
        child_code = str(parent_int + seq)
        while Account.objects.filter(
            tenant=parent.tenant, branch=parent.branch, code=child_code
        ).exists():
            seq += 1
            child_code = str(parent_int + seq)

        return Account.objects.create(
            code=child_code,
            name=SUSPENSE_ACCOUNT_NAME,
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=parent,
            owner=parent.owner,
            tenant=parent.tenant,
            branch=parent.branch,
            allow_manual_entries=True,
        )
