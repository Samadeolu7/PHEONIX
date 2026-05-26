"""
Asset Depreciation Service
===========================

Handles all depreciation calculation logic:

- ``calculate_schedule(asset)``
    Returns the full, period-by-period depreciation schedule as a list of dicts.
    Nothing is written to the database.

- ``generate_current_period(asset, period_date, posted_by)``
    Creates and saves a single ``AssetDepreciation`` record for the period
    containing *period_date*.  Does NOT post the journal entry (that is left to
    the ``AssetDepreciationViewSet.post`` action so the operator can review
    first).  Skips silently if a record for that period already exists.

- ``generate_and_post_current_period(asset, period_date, posted_by)``
    As above, but also immediately posts the journal entry to the GL.
    Useful for the batch management command (``post_depreciation``).

Supported depreciation methods (mirror of AssetCategory.DEPRECIATION_METHODS):

    straight_line          (cost − salvage) / useful_life_years  ÷ 12  per month
    declining_balance      book_value × (1 / useful_life_years) × 2    per year,
                           converted to monthly by dividing by 12
    sum_of_years           SYD formula; converted to monthly
    units_of_production    Not auto-calculated (requires actual usage data).
                           The service raises NotImplementedError for this method.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import List, Optional, TYPE_CHECKING

from dateutil.relativedelta import relativedelta
from django.db import transaction as db_transaction
from django.utils import timezone
from django.core.exceptions import ValidationError

if TYPE_CHECKING:
    from assets.models import FixedAsset, AssetDepreciation
    from users.models import User


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _month_start(d):
    """Return the first day of the month containing *d*."""
    return d.replace(day=1)


def _month_end(d):
    """Return the last day of the month containing *d*."""
    return (d.replace(day=1) + relativedelta(months=1)) - relativedelta(days=1)


def _period_key(d):
    """Comparable key (year, month) for deduplication."""
    return (d.year, d.month)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class DepreciationService:
    """Stateless service — all methods are class-level."""

    # ------------------------------------------------------------------ #
    #  Schedule calculation                                                #
    # ------------------------------------------------------------------ #

    @classmethod
    def calculate_schedule(cls, asset: "FixedAsset") -> List[dict]:
        """
        Return the complete depreciation schedule for *asset* as a list of
        period dicts.  Nothing is written to the database.

        Each dict has:
            period_start        date — first day of the month
            period_end          date — last day of the month
            depreciation_amount Decimal
            accumulated         Decimal — running total after this period
            book_value          Decimal — cost − accumulated
            period_number       int     — 1-based sequence

        Returns an empty list for assets with status ``disposed`` or
        ``sold``, or if the asset has no ``depreciation_start_date``.

        Raises:
            NotImplementedError  — if method is ``units_of_production``
            ValidationError      — if method is unrecognised
        """
        if asset.status in ('disposed', 'sold', 'draft'):
            return []

        if not asset.depreciation_start_date:
            return []

        if not asset.purchase_price or asset.purchase_price <= 0:
            return []

        method = asset.depreciation_method
        if method == 'units_of_production':
            raise NotImplementedError(
                "units_of_production cannot be auto-calculated; "
                "actual production data is required per period."
            )

        useful_life_months = asset.useful_life_years * 12
        if useful_life_months <= 0:
            return []

        cost      = asset.purchase_price
        salvage   = asset.salvage_value
        depreciable = cost - salvage
        if depreciable <= 0:
            return []

        schedule = []
        accumulated = Decimal('0')
        start = _month_start(asset.depreciation_start_date)

        for n in range(1, useful_life_months + 1):
            period_start = start + relativedelta(months=n - 1)
            period_end   = _month_end(period_start)

            if method == 'straight_line':
                monthly = (depreciable / useful_life_months).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )

            elif method == 'declining_balance':
                # Double-declining: annual_rate = 2 / useful_life_years
                # monthly_rate  = annual_rate / 12
                remaining_book = cost - accumulated
                annual_rate    = Decimal('2') / asset.useful_life_years
                monthly        = (remaining_book * annual_rate / 12).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )

            elif method == 'sum_of_years':
                # SYD: annual charge for year y = (N - y + 1) / SYD × depreciable
                # where SYD = N*(N+1)/2, N = useful_life_years
                N        = asset.useful_life_years
                syd      = Decimal(N * (N + 1)) / 2
                year_num = Decimal((n - 1) // 12 + 1)         # current year (1-based)
                annual   = ((N - year_num + 1) / syd) * depreciable
                monthly  = (annual / 12).quantize(
                    Decimal('0.01'), rounding=ROUND_HALF_UP
                )

            else:
                raise ValidationError(
                    f"Unrecognised depreciation method: '{method}'. "
                    "Valid methods: straight_line, declining_balance, units_of_production."
                )

            # Floor: cannot depreciate below salvage value
            remaining_depreciable = depreciable - accumulated
            monthly = min(monthly, remaining_depreciable)
            monthly = max(monthly, Decimal('0'))

            if monthly == 0:
                break  # fully depreciated

            accumulated += monthly
            book_value   = cost - accumulated

            schedule.append({
                'period_number':       n,
                'period_start':        period_start,
                'period_end':          period_end,
                'depreciation_amount': monthly,
                'accumulated':         accumulated,
                'book_value':          max(book_value, salvage),
            })

        return schedule

    # ------------------------------------------------------------------ #
    #  Single-period record creation                                       #
    # ------------------------------------------------------------------ #

    @classmethod
    @db_transaction.atomic
    def generate_current_period(
        cls,
        asset: "FixedAsset",
        period_date=None,
        posted_by: Optional["User"] = None,
    ) -> Optional["AssetDepreciation"]:
        """
        Create (but do NOT post) an ``AssetDepreciation`` record for the
        month containing *period_date* (defaults to today).

        Returns:
            The new ``AssetDepreciation`` instance, or ``None`` if:
            - the asset is disposed / sold
            - depreciation has not started yet
            - a record for that period already exists
            - the calculated amount is zero (fully depreciated)

        Raises:
            NotImplementedError  — for units_of_production assets
        """
        from assets.models import AssetDepreciation

        period_date = period_date or timezone.now().date()
        period_start = _month_start(period_date)
        period_end   = _month_end(period_date)

        if asset.status in ('disposed', 'sold', 'draft'):
            return None

        if not asset.depreciation_start_date or asset.depreciation_start_date > period_end:
            return None

        # Idempotency guard
        existing = AssetDepreciation.objects.filter(
            asset=asset,
            period_start=period_start,
        ).first()
        if existing:
            return existing

        # Find the matching period in the full schedule
        try:
            schedule = cls.calculate_schedule(asset)
        except NotImplementedError:
            raise

        entry_data = next(
            (p for p in schedule if p['period_start'] == period_start),
            None,
        )

        if entry_data is None or entry_data['depreciation_amount'] == 0:
            return None

        entry = AssetDepreciation.objects.create(
            asset=asset,
            period_start=period_start,
            period_end=period_end,
            depreciation_amount=entry_data['depreciation_amount'],
            is_posted=False,
            owner=asset.owner,
            branch=asset.branch,
            tenant=getattr(asset, 'tenant', None),
        )
        return entry

    # ------------------------------------------------------------------ #
    #  Single-period create + post (for batch runner)                     #
    # ------------------------------------------------------------------ #

    @classmethod
    @db_transaction.atomic
    def generate_and_post_current_period(
        cls,
        asset: "FixedAsset",
        period_date=None,
        posted_by: Optional["User"] = None,
    ) -> Optional["AssetDepreciation"]:
        """
        Create an ``AssetDepreciation`` record for the current period AND
        immediately post it to the GL.

        Returns the posted ``AssetDepreciation`` instance, or ``None`` if
        the period was skipped (see ``generate_current_period``).

        Raises:
            ValidationError — if category GL accounts are not configured
        """
        entry = cls.generate_current_period(asset, period_date, posted_by)
        if entry is None or entry.is_posted:
            return entry

        # Validate GL accounts before touching the ledger
        if not asset.category.depreciation_account_id:
            raise ValidationError(
                f"Asset {asset.asset_number}: depreciation expense account not configured."
            )
        if not asset.category.accumulated_depreciation_account_id:
            raise ValidationError(
                f"Asset {asset.asset_number}: accumulated depreciation account not configured."
            )

        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )

        series, _ = TransactionSeries.objects.get_or_create(
            code='DEPR',
            defaults={'name': 'Depreciation', 'description': 'Depreciation Entries'},
        )

        journal_entry = JournalEntry.objects.create(
            series=series,
            date=entry.period_end,
            description=(
                f"Depreciation — {asset.name} ({asset.asset_number}) "
                f"{entry.period_start} to {entry.period_end}"
            ),
            owner=asset.owner,
            branch=asset.branch,
            created_by=posted_by,
        )

        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=asset.category.depreciation_account,
            side=JournalEntryLine.DEBIT,
            amount=entry.depreciation_amount,
        )
        JournalEntryLine.objects.create(
            transaction=journal_entry,
            account=asset.category.accumulated_depreciation_account,
            side=JournalEntryLine.CREDIT,
            amount=entry.depreciation_amount,
        )

        journal_entry.post()

        entry.is_posted       = True
        entry.posted_at       = timezone.now()
        entry.posted_by       = posted_by
        entry.journal_entry   = journal_entry
        entry.save()

        # Update asset accumulated depreciation
        asset.accumulated_depreciation += entry.depreciation_amount
        asset.save()

        return entry
