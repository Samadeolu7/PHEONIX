"""
Management command: migrate_category_to_per_asset_accounts
============================================================

Moves an AssetCategory from shared category-level cost/accumulated-
depreciation GL accounts to per-asset tracking (see assets.signals and the
FixedAsset.account / FixedAsset.accumulated_depreciation_account fields).

WHY THIS MUST RUN ATOMICALLY PER CATEGORY, NEVER PARTIALLY
------------------------------------------------------------
TransactionEntry.clean() permanently blocks direct postings to any account
once it becomes account_level=PARENT *and* has at least one child — no
override exists. Every FixedAsset in a category currently posts directly to
category.asset_account / category.accumulated_depreciation_account, so the
instant the first per-asset child account is created under one of them, that
shared account is sealed from direct postings forever. If even one asset in
the category were left un-migrated, its next depreciation run would start
failing immediately. So this command processes every asset in a category
together, inside one DB transaction, or not at all.

NOTE — account_level=PARENT requires parent=None (Account.clean()): this
system only supports a 2-level PARENT/CHILD hierarchy, never 3 deep. So if
category.asset_account was itself nested under a broader grandparent (e.g.
"1000 Fixed Assets"), migrating detaches it from that grandparent — it
becomes a top-level account in its own right and no longer rolls up into
it automatically. There's no way to both gain per-asset children and keep
a grandparent in a system that doesn't support 3-level nesting.

SEQUENCE (why the temporary staging parent exists)
----------------------------------------------------
A new account_level=CHILD account cannot be created without an existing
account_level=PARENT to be its parent (Account.clean()). But
category.asset_account is itself still CHILD-level (postable) at the start —
converting it to PARENT before creating any children would immediately seal
it from ever receiving the reallocation entry we still need to post. So:
  1. Create a throwaway staging PARENT account.
  2. Create each asset's own child accounts *under the staging parent*.
  3. Post the reallocation JV (Dr new asset account / Cr category.asset_account,
     and the mirror for accumulated depreciation) while the category accounts
     are still directly postable.
  4. Only now convert category.asset_account / .accumulated_depreciation_account
     to PARENT (safe — no more direct postings needed against them).
  5. Re-parent every new per-asset account from the staging parent to the
     now-PARENT category account (a plain field update, not a posting).
  6. Point each FixedAsset at its new accounts; delete the staging parents.
  7. Verify the category's rollup balance is unchanged before committing.

Usage
-----
    python manage.py migrate_category_to_per_asset_accounts --category-id 12 --dry-run
    python manage.py migrate_category_to_per_asset_accounts --category-id 12
    python manage.py migrate_category_to_per_asset_accounts --all --dry-run
    python manage.py migrate_category_to_per_asset_accounts --all
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import F


class _DryRunRollback(Exception):
    """Raised deliberately at the end of a dry-run to unwind the atomic block."""


class Command(BaseCommand):
    help = "Migrate an AssetCategory from shared to per-asset GL account tracking."

    def add_arguments(self, parser):
        parser.add_argument('--category-id', type=int, default=None)
        parser.add_argument('--all', action='store_true', help='Process every not-yet-migrated category.')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        from assets.models import AssetCategory
        from accounts.models import Account

        category_id = options['category_id']
        process_all = options['all']
        dry_run = options['dry_run']

        if not category_id and not process_all:
            raise CommandError('Pass --category-id ID or --all.')

        categories = (
            AssetCategory.objects.filter(pk=category_id)
            if category_id
            else AssetCategory.objects.filter(is_deleted=False)
        )

        for category in categories:
            # account_level=PARENT alone isn't a reliable "already migrated"
            # signal — a category's asset_account can legitimately be
            # PARENT-level with zero children (still directly postable;
            # TransactionEntry.clean() only blocks a parent that HAS
            # children). Having children is what migration actually produces.
            if category.asset_account.children.exists() or category.accumulated_depreciation_account.children.exists():
                self.stdout.write(f'[{category.code}] already migrated — skipping.')
                continue
            try:
                self._migrate_one_category(category, dry_run=dry_run)
            except _DryRunRollback:
                self.stdout.write(self.style.WARNING(f'[{category.code}] DRY RUN — no changes written.'))
            except Exception as exc:
                self.stderr.write(self.style.ERROR(f'[{category.code}] FAILED, category left untouched: {exc}'))
                if category_id:
                    raise

    def _migrate_one_category(self, category, dry_run):
        from accounts.models import Account
        from assets.models import FixedAsset
        from transactions.models import TransactionSeries

        assets = list(FixedAsset.objects.filter(category=category, is_deleted=False, account__isnull=True))
        if not assets:
            self.stdout.write(f'[{category.code}] no un-migrated assets — skipping.')
            return

        with transaction.atomic():
            cost_account_before = Account.objects.select_for_update().get(pk=category.asset_account_id)
            depr_account_before = Account.objects.select_for_update().get(pk=category.accumulated_depreciation_account_id)
            starting_cost_balance = cost_account_before.balance
            starting_depr_balance = depr_account_before.balance

            series, _ = TransactionSeries.objects.get_or_create(
                code='ASMIG', defaults={'description': 'Per-Asset Account Migration'},
            )

            cost_staging = Account.objects.create(
                name=f'[migration staging] {category.name} — cost', code=self._free_code(category.branch),
                account_type=Account.ASSET, account_level=Account.LEVEL_PARENT, parent=None,
                category=category.asset_account.category,
                owner=category.owner, created_by=category.owner, branch=category.branch, tenant=category.tenant,
                allow_manual_entries=False, is_system_account=True,
            )
            depr_staging = Account.objects.create(
                name=f'[migration staging] {category.name} — accum. depreciation', code=self._free_code(category.branch),
                account_type=Account.ASSET, account_level=Account.LEVEL_PARENT, parent=None,
                category=category.accumulated_depreciation_account.category,
                owner=category.owner, created_by=category.owner, branch=category.branch, tenant=category.tenant,
                allow_manual_entries=False, is_system_account=True,
            )

            new_cost_accounts = {}
            new_depr_accounts = {}

            for asset in assets:
                cost_account = Account.create_with_parent(
                    parent_code=cost_staging.code,
                    child_data={
                        'name': f'{asset.name} ({asset.asset_number})', 'allow_manual_entries': True,
                        'owner': category.owner, 'branch': category.branch, 'tenant': category.tenant,
                        'created_by': category.owner,
                    },
                )
                depr_account = Account.create_with_parent(
                    parent_code=depr_staging.code,
                    child_data={
                        'name': f'{asset.name} ({asset.asset_number}) – Accum. Depreciation', 'allow_manual_entries': True,
                        'owner': category.owner, 'branch': category.branch, 'tenant': category.tenant,
                        'created_by': category.owner,
                    },
                )
                new_cost_accounts[asset.pk] = cost_account
                new_depr_accounts[asset.pk] = depr_account

                if asset.purchase_price and asset.purchase_price > 0:
                    self._post_reallocation(
                        series, category.branch, category.owner,
                        debit_account=cost_account, credit_account=category.asset_account,
                        amount=asset.purchase_price,
                        description=f'Per-asset migration — cost — {asset.asset_number}',
                    )
                if asset.accumulated_depreciation and asset.accumulated_depreciation > 0:
                    self._post_reallocation(
                        series, category.branch, category.owner,
                        debit_account=category.accumulated_depreciation_account, credit_account=depr_account,
                        amount=asset.accumulated_depreciation,
                        description=f'Per-asset migration — accum. depreciation — {asset.asset_number}',
                    )

            # Category accounts are done receiving direct postings now — safe
            # to convert. account_level=PARENT requires parent=None (this
            # system only supports a 2-level PARENT/CHILD hierarchy, never
            # 3), so a category account that was itself nested under a
            # broader grandparent (e.g. "1000 Fixed Assets") becomes a
            # top-level account in its own right — it no longer rolls up
            # into that grandparent automatically. Documented trade-off:
            # there's no way to both gain per-asset children and keep a
            # grandparent in a system that doesn't support 3-level nesting.
            category.asset_account.account_level = Account.LEVEL_PARENT
            category.asset_account.parent = None
            category.asset_account.save(update_fields=['account_level', 'parent'])
            category.accumulated_depreciation_account.account_level = Account.LEVEL_PARENT
            category.accumulated_depreciation_account.parent = None
            category.accumulated_depreciation_account.save(update_fields=['account_level', 'parent'])

            for asset in assets:
                cost_account = new_cost_accounts[asset.pk]
                depr_account = new_depr_accounts[asset.pk]
                # _post_reallocation() updated these rows' balances via a
                # queryset-level .update() (through TransactionEntry.post()),
                # which never touches this in-memory instance — without this,
                # .balance below would read the stale value from creation
                # time (0), not what was actually posted.
                cost_account.refresh_from_db(fields=['balance'])
                depr_account.refresh_from_db(fields=['balance'])

                # Re-parent AND re-code to match — the accounts were created
                # under the temporary staging parent (e.g. "1900-00001"),
                # which has nothing to do with the category's real code
                # ("1150"). Loans/savings sub-ledger codes always reflect
                # their real parent (Account.create_with_parent's own
                # convention); leaving a stale staging-parent-prefixed code
                # here would silently break that. .save() here never touches
                # .balance, so it's exempt from the balance-write guard.
                cost_account.parent = category.asset_account
                cost_account.code = self._next_child_code(category.asset_account)
                cost_account.save(update_fields=['parent', 'code'])
                depr_account.parent = category.accumulated_depreciation_account
                depr_account.code = self._next_child_code(category.accumulated_depreciation_account)
                depr_account.save(update_fields=['parent', 'code'])

                # TransactionEntry.post()'s parent-rollup update only ever
                # touched the STAGING parent (whatever cost_account/
                # depr_account's .parent_id was *at posting time*) —
                # reparenting above is a pure field update and does not
                # retroactively move that already-applied rollup. Move it by
                # hand via QuerySet.update() (guard-exempt, same mechanism
                # TransactionEntry.post() itself uses), so the real category
                # account's stored balance ends up correct without ever
                # calling Account.save() with a changed .balance.
                Account.objects.filter(pk=cost_staging.pk).update(balance=F('balance') - cost_account.balance)
                Account.objects.filter(pk=category.asset_account_id).update(balance=F('balance') + cost_account.balance)
                Account.objects.filter(pk=depr_staging.pk).update(balance=F('balance') - depr_account.balance)
                Account.objects.filter(pk=category.accumulated_depreciation_account_id).update(
                    balance=F('balance') + depr_account.balance
                )

                asset.account = cost_account
                asset.accumulated_depreciation_account = depr_account
                asset.save(update_fields=['account', 'accumulated_depreciation_account'])

            cost_staging.delete()
            depr_staging.delete()

            category.asset_account.refresh_from_db()
            category.accumulated_depreciation_account.refresh_from_db()
            if category.asset_account.balance != starting_cost_balance:
                raise CommandError(
                    f'[{category.code}] cost account balance changed during migration '
                    f'({starting_cost_balance} -> {category.asset_account.balance}) — aborting.'
                )
            if category.accumulated_depreciation_account.balance != starting_depr_balance:
                raise CommandError(
                    f'[{category.code}] accumulated depreciation balance changed during migration '
                    f'({starting_depr_balance} -> {category.accumulated_depreciation_account.balance}) — aborting.'
                )

            self.stdout.write(self.style.SUCCESS(
                f'[{category.code}] migrated {len(assets)} asset(s); '
                f'cost balance {starting_cost_balance} unchanged, '
                f'accum. depreciation balance {starting_depr_balance} unchanged.'
            ))

            if dry_run:
                raise _DryRunRollback()

    def _post_reallocation(self, series, branch, owner, debit_account, credit_account, amount, description):
        from transactions.models import Transaction, TransactionEntry

        txn = Transaction.objects.create(
            series=series, description=description, branch=branch,
            owner=owner, created_by=owner, tenant=branch.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=debit_account, side=TransactionEntry.DEBIT, amount=amount)
        TransactionEntry.objects.create(transaction=txn, account=credit_account, side=TransactionEntry.CREDIT, amount=amount)
        txn.post()
        return txn

    def _next_child_code(self, parent):
        """
        Next free PPPP-NNNNN sub-ledger code under `parent` — same convention
        (and same scan logic) as Account.create_with_parent, so a per-asset
        account's code always reflects its real parent, exactly like
        loan/savings sub-ledger codes always do.
        """
        prefix = f'{parent.code}-'
        existing_seqs = []
        for code in parent.children.filter(is_deleted=False).values_list('code', flat=True):
            if code.startswith(prefix):
                try:
                    existing_seqs.append(int(code[len(prefix):]))
                except (ValueError, IndexError):
                    continue
        next_seq = (max(existing_seqs) + 1) if existing_seqs else 1
        return f'{parent.code}-{next_seq:05d}'

    def _free_code(self, branch):
        """Allocate a free 4-digit ASSET-range code for a temporary staging parent."""
        from accounts.models import Account

        existing = set(
            Account.objects.filter(branch=branch, code__gte='1000', code__lte='1999')
            .values_list('code', flat=True)
        )
        for num in range(1900, 1999):
            code = str(num)
            if code not in existing:
                return code
        raise CommandError(f'No free staging account code in 1900-1999 for branch {branch}.')
