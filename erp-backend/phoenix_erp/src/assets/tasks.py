"""
assets/tasks.py

Celery tasks for the Assets module.

Tasks:
    post_monthly_depreciation  — 1st of each month @ 03:00 WAT.
                                  Posts straight-line or declining-balance depreciation
                                  for every active FixedAsset with a depreciation method set.
"""
import logging
from decimal import Decimal, ROUND_HALF_UP

from celery import shared_task
from dateutil.relativedelta import relativedelta
from django.db import transaction
from django.utils import timezone

_log = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, autoretry_for=(Exception,), retry_backoff=True)
def post_monthly_depreciation(self):  # noqa: ARG002
    """
    1st of each month @ 03:00 WAT — post one month of depreciation for all
    active FixedAsset records that have a depreciation method configured.

    Idempotency:
        An ``AssetDepreciation`` entry is created with the composite unique key
        ``(asset, period_start)``.  If a row already exists for the current
        period the asset is silently skipped.

    Supported methods:
        straight_line      — (cost − salvage) / (useful_life_years × 12)
        declining_balance  — book_value × (2 / (useful_life_years × 12))
                             i.e. double-declining balance by default

    GL entry posted per asset:
        Dr.  Depreciation Expense             (category.depreciation_account)
        Cr.  Accumulated Depreciation         (category.accumulated_depreciation_account)

    Returns:
        {'processed': int, 'skipped': int, 'errors': int, 'total': int}
    """
    from transactions.models import (
        Transaction as JournalEntry,
        TransactionEntry as JournalEntryLine,
        TransactionSeries,
    )
    from .models import FixedAsset, AssetDepreciation

    today = timezone.localdate()
    period_end   = today.replace(day=1) - relativedelta(days=1)
    period_start = period_end.replace(day=1)

    # Assets eligible for depreciation this period:
    #   - status in ('active', 'idle', 'maintenance')  — asset still on books
    #   - depreciation_method is not blank
    #   - depreciation_start_date is set and <= period_end
    #   - useful_life_years is set and > 0
    candidate_ids = list(
        FixedAsset.objects
        .filter(
            status__in=('active', 'idle', 'maintenance'),
            depreciation_method__in=('straight_line', 'declining_balance'),
            depreciation_start_date__lte=period_end,
            useful_life_years__gt=0,
        )
        .values_list('id', flat=True)
    )

    processed = 0
    skipped   = 0
    errors    = 0

    series, _ = _get_or_create_depreciation_series()

    for asset_id in candidate_ids:
        try:
            with transaction.atomic():
                asset = (
                    FixedAsset.objects
                    .select_for_update()
                    .select_related('category__depreciation_account',
                                    'category__accumulated_depreciation_account')
                    .get(pk=asset_id)
                )

                # Idempotency: already posted for this period?
                if AssetDepreciation.objects.filter(
                    asset=asset, period_start=period_start
                ).exists():
                    skipped += 1
                    continue

                dep_amount = _calculate_monthly_depreciation(asset)
                if dep_amount is None or dep_amount <= 0:
                    skipped += 1
                    continue

                # Cap at remaining depreciable amount to avoid over-depreciation
                remaining = asset.current_value - asset.salvage_value
                if remaining <= 0:
                    skipped += 1
                    continue
                dep_amount = min(dep_amount, remaining)

                # ── GL Journal Entry ─────────────────────────────────────
                journal = JournalEntry.objects.create(
                    series=series,
                    date=period_end,
                    description=(
                        f'Monthly depreciation {period_start:%b %Y} — '
                        f'{asset.asset_number}'
                    ),
                    owner=asset.owner,
                    branch=asset.branch,
                )

                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=asset.category.depreciation_account,
                    side=JournalEntryLine.DEBIT,
                    amount=dep_amount,
                    description=(
                        f'Depreciation expense — {asset.name} '
                        f'({asset.asset_number}) {period_start:%b %Y}'
                    ),
                )

                JournalEntryLine.objects.create(
                    transaction=journal,
                    account=asset.category.accumulated_depreciation_account,
                    side=JournalEntryLine.CREDIT,
                    amount=dep_amount,
                    description=(
                        f'Accumulated depreciation — {asset.name} '
                        f'({asset.asset_number}) {period_start:%b %Y}'
                    ),
                )

                journal.post()

                # ── Audit record ─────────────────────────────────────────
                AssetDepreciation.objects.create(
                    asset=asset,
                    period_start=period_start,
                    period_end=period_end,
                    depreciation_amount=dep_amount,
                    is_posted=True,
                    posted_at=timezone.now(),
                    journal_entry=journal,
                    owner=asset.owner,
                    branch=asset.branch,
                )

                # ── Update asset book value ───────────────────────────────
                asset.accumulated_depreciation = (
                    Decimal(str(asset.accumulated_depreciation)) + dep_amount
                )
                asset.current_value = max(
                    Decimal(str(asset.current_value)) - dep_amount,
                    Decimal(str(asset.salvage_value)),
                )
                asset.save(update_fields=['accumulated_depreciation', 'current_value', 'updated_at'])

                processed += 1

        except Exception as exc:  # noqa: BLE001
            _log.exception(
                'post_monthly_depreciation: failed for FixedAsset pk=%s: %s',
                asset_id, exc,
            )
            errors += 1

    return {
        'processed': processed,
        'skipped': skipped,
        'errors': errors,
        'total': len(candidate_ids),
    }


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _get_or_create_depreciation_series():
    from transactions.models import TransactionSeries
    return TransactionSeries.objects.get_or_create(
        code='DEPMN',
        defaults={'description': 'Monthly Asset Depreciation'},
    )


def _calculate_monthly_depreciation(asset) -> Decimal | None:
    """
    Return the depreciation charge for a single calendar month.

    Returns None if the asset cannot be depreciated (bad data).
    """
    cost        = Decimal(str(asset.purchase_price or 0))
    salvage     = Decimal(str(asset.salvage_value or 0))
    life_months = int(asset.useful_life_years or 0) * 12

    if life_months <= 0 or cost <= salvage:
        return None

    method = asset.depreciation_method

    if method == 'straight_line':
        monthly = (cost - salvage) / Decimal(str(life_months))

    elif method == 'declining_balance':
        # Double-declining balance on current book value
        book_value = Decimal(str(asset.current_value or cost))
        ddb_rate   = Decimal('2') / Decimal(str(life_months))
        monthly    = book_value * ddb_rate
        # DDB never goes below salvage
        monthly    = min(monthly, book_value - salvage)

    else:
        return None

    return monthly.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
