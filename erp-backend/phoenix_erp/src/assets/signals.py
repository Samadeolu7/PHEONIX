"""
assets/signals.py

Handlers:
    _provision_per_asset_accounts
        When a new FixedAsset is created, provision its own GL cost /
        accumulated-depreciation child accounts IF its category has already
        been migrated to per-asset tracking — signalled by category.
        asset_account / .accumulated_depreciation_account already having at
        least one child account (see
        assets/management/commands/migrate_category_to_per_asset_accounts.py;
        account_level=PARENT alone isn't a reliable signal, since a category
        account can be PARENT-level with zero children and still be directly
        postable). Categories that haven't been migrated are left untouched:
        the asset keeps posting to the shared category-level accounts
        exactly as before. Never blocks asset creation on failure.
"""
import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

logger = logging.getLogger(__name__)


@receiver(post_save, sender='assets.FixedAsset')
def _provision_per_asset_accounts(sender, instance, created, **kwargs):
    if not created or instance.account_id or instance.accumulated_depreciation_account_id:
        return

    category = instance.category
    # account_level=PARENT alone isn't a reliable "migrated" signal — a
    # category's asset_account can legitimately be PARENT-level with zero
    # children (still directly postable; TransactionEntry.clean() only blocks
    # a parent that HAS children). Migration is what actually gives it
    # per-asset children, so that's the real signal.
    if (
        not category.asset_account.children.exists()
        or not category.accumulated_depreciation_account.children.exists()
    ):
        # Category not migrated to per-asset tracking yet — this asset posts
        # to the shared category accounts exactly as it always has.
        return

    from accounts.models import Account

    try:
        with transaction.atomic():
            cost_account = Account.create_with_parent(
                parent_code=category.asset_account.code,
                child_data={
                    'name': f'{instance.name} ({instance.asset_number})',
                    'allow_manual_entries': True,
                    'owner': instance.owner,
                    'branch': instance.branch,
                    'tenant': instance.tenant,
                    'created_by': instance.created_by,
                },
            )
            accumulated_depreciation_account = Account.create_with_parent(
                parent_code=category.accumulated_depreciation_account.code,
                child_data={
                    'name': f'{instance.name} ({instance.asset_number}) – Accum. Depreciation',
                    'allow_manual_entries': True,
                    'owner': instance.owner,
                    'branch': instance.branch,
                    'tenant': instance.tenant,
                    'created_by': instance.created_by,
                },
            )
            instance.account = cost_account
            instance.accumulated_depreciation_account = accumulated_depreciation_account
            instance.save(update_fields=['account', 'accumulated_depreciation_account'])

            logger.info(
                'Auto asset accounts: provisioned %s / %s for asset %s.',
                cost_account.code, accumulated_depreciation_account.code, instance.pk,
            )
    except Exception:
        # Never let account provisioning failure block asset registration —
        # the asset falls back to the shared category accounts.
        logger.exception(
            'Auto asset accounts: failed to provision per-asset accounts for asset %s.',
            instance.pk,
        )
