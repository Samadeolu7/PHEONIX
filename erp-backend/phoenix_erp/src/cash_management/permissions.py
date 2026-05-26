"""
cash_management/permissions.py

Custom DRF permission classes for the Cash Management app.
"""
from __future__ import annotations

import datetime

from rest_framework.permissions import BasePermission

from .models import DailyCollectionSheet


class CanPostTodayPermission(BasePermission):
    """
    Feature #14 — End-of-Day Zero.

    A credit officer cannot create or collect items on today's sheet while
    they have any *submitted-but-not-reconciled* sheets from a prior business
    day.  Supervisors, branch managers, directors, and admins are exempt.

    Applied to:
        CollectionSheetItemViewSet.create   — adding a new item
        CollectionSheetItemViewSet.collect  — recording a payment
    """

    message = (
        "You have unreconciled collection sheet(s) from a prior day. "
        "Please ask your supervisor to reconcile those sheets before "
        "recording new collections today."
    )

    def has_permission(self, request, view):
        # Only enforce on write operations
        if request.method not in ("POST", "PUT", "PATCH"):
            return True

        user = request.user
        if not user or not user.is_authenticated:
            return False  # Let IsAuthenticated handle it

        # Superusers / system admins are exempt
        if user.is_superuser or getattr(user, "is_system_admin", False):
            return True

        try:
            staff = user.staff_profile
        except Exception:
            return True  # No staff profile — let other permissions decide

        role = getattr(staff, "role_level", None)

        # Only restrict credit officers
        if role != "credit_officer":
            return True

        today = datetime.date.today()

        # Check for prior-day submitted sheets belonging to this officer
        unreconciled = DailyCollectionSheet.objects.filter(
            credit_officer=staff,
            status="submitted",
            collection_date__lt=today,
            deleted_at__isnull=True,
        ).exists()

        return not unreconciled
