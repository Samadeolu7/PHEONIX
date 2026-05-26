import calendar
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone

from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response

from common.views import ScopedModelViewSet
from common.serializers import IsTenantUser

from .models import (
    SavingsAccount,
    SavingsGoal,
    ContributionSchedule,
    SmartSavingsAccount,
    SmartSavingsEvent,
    CompulsorySavingsPolicy,
)
from .serializers import (
    SavingsAccountSerializer,
    ContributionScheduleSerializer,
    SmartSavingsAccountSerializer,
    SmartSavingsEventSerializer,
    CompulsorySavingsPolicySerializer,
    SavingsGoalSerializer,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_month_schedule(savings_account, year, month):
    """
    Generate ContributionSchedule rows for *year/month* based on the account's
    product contribution_cycle and contribution_day_of_week.

    Returns a list of created ContributionSchedule objects.
    Existing rows for the same account/date are skipped (idempotent).
    """
    cycle = savings_account.product.contribution_cycle
    amount = savings_account.product.contribution_amount or Decimal('0.00')
    if not cycle or amount <= 0:
        return []

    first = date(year, month, 1)
    last = date(year, month, calendar.monthrange(year, month)[1])

    if cycle == 'daily':
        dates = [
            first + timedelta(days=i)
            for i in range((last - first).days + 1)
            if (first + timedelta(days=i)).weekday() < 5  # Mon–Fri only
        ]
    elif cycle == 'weekly':
        target_dow = savings_account.contribution_day_of_week
        if target_dow is None:
            target_dow = 0  # default to Monday
        current = first
        dates = []
        while current <= last:
            if current.weekday() == target_dow:
                dates.append(current)
            current += timedelta(days=1)
    elif cycle == 'monthly':
        # One contribution per month on the account's opening day (clamped to month end)
        open_day = min(savings_account.opened_on.day, last.day)
        dates = [date(year, month, open_day)]
    else:
        dates = []

    branch = savings_account.branch
    owner = savings_account.owner

    existing = set(
        ContributionSchedule.objects.filter(
            savings_account=savings_account,
            expected_date__year=year,
            expected_date__month=month,
        ).values_list('expected_date', flat=True)
    )

    to_create = [
        ContributionSchedule(
            savings_account=savings_account,
            expected_date=d,
            expected_amount=amount,
            status=ContributionSchedule.PENDING,
            branch=branch,
            owner=owner,
        )
        for d in dates
        if d not in existing
    ]

    ContributionSchedule.objects.bulk_create(to_create, ignore_conflicts=True)
    return to_create


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class SavingsAccountViewSet(ScopedModelViewSet):
    permission_module = 'savings'
    permission_page = 'savings-accounts'
    queryset = SavingsAccount.objects.select_related(
        'client', 'product', 'account'
    ).prefetch_related('smart_account')
    serializer_class = SavingsAccountSerializer
    officer_client_lookup = 'client__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        client_id = self.request.query_params.get('client')
        cycle = self.request.query_params.get('cycle')
        if client_id:
            qs = qs.filter(client_id=client_id)
        if cycle:
            qs = qs.filter(product__contribution_cycle=cycle)
        return qs

    @action(detail=True, methods=['post'], url_path='generate-schedule')
    def generate_schedule(self, request, pk=None):
        """
        Generate ContributionSchedule rows for the current month
        (or ?year=YYYY&month=MM).
        """
        account = self.get_object()
        today = timezone.localdate()
        try:
            year = int(request.query_params.get('year', today.year))
            month = int(request.query_params.get('month', today.month))
        except ValueError:
            return Response({'detail': 'Invalid year/month.'}, status=400)

        created = _generate_month_schedule(account, year, month)
        return Response(
            {'created': len(created), 'year': year, 'month': month},
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )

    @action(detail=True, methods=['get'], url_path='schedule')
    def schedule(self, request, pk=None):
        """Return the contribution schedule for this account."""
        account = self.get_object()
        today = timezone.localdate()
        try:
            year = int(request.query_params.get('year', today.year))
            month = int(request.query_params.get('month', today.month))
        except ValueError:
            return Response({'detail': 'Invalid year/month.'}, status=400)

        qs = ContributionSchedule.objects.filter(
            savings_account=account,
            expected_date__year=year,
            expected_date__month=month,
        ).order_by('expected_date')
        serializer = ContributionScheduleSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='toggle-smart-savings')
    @transaction.atomic
    def toggle_smart_savings(self, request, pk=None):
        """
        Activate or deactivate Smart Savings.
        Body: {"action": "activate"} or {"action": "deactivate"}
        """
        account = self.get_object()
        action_type = request.data.get('action', 'activate')

        if action_type == 'activate':
            today = timezone.localdate()
            opening_balance = account.current_balance

            smart, created = SmartSavingsAccount.objects.get_or_create(
                savings=account,
                defaults={
                    'is_active': True,
                    'start_date': today,
                    'opening_balance': opening_balance,
                },
            )
            if not created:
                smart.is_active = True
                smart.start_date = today
                smart.opening_balance = opening_balance
                smart.save(update_fields=['is_active', 'start_date', 'opening_balance'])

            return Response(
                SmartSavingsAccountSerializer(smart).data,
                status=status.HTTP_200_OK,
            )

        elif action_type == 'deactivate':
            try:
                smart = account.smart_account
                smart.is_active = False
                smart.save(update_fields=['is_active'])
                return Response({'detail': 'Smart Savings deactivated.'})
            except SavingsAccount.smart_account.RelatedObjectDoesNotExist:
                return Response(
                    {'detail': 'No Smart Savings account found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )
        else:
            return Response(
                {'detail': 'action must be "activate" or "deactivate".'},
                status=status.HTTP_400_BAD_REQUEST,
            )

    @action(detail=True, methods=['get'], url_path='smart-savings')
    def smart_savings_detail(self, request, pk=None):
        """Return Smart Savings details for this account."""
        account = self.get_object()
        try:
            smart = account.smart_account
        except SavingsAccount.smart_account.RelatedObjectDoesNotExist:
            return Response(
                {'detail': 'No Smart Savings account found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(SmartSavingsAccountSerializer(smart).data)


class ContributionScheduleViewSet(ScopedModelViewSet):
    """
    Daily savings collection sheet.
    GET  /api/savings/collection/?date=YYYY-MM-DD  → schedules for that date
    GET  /api/savings/collection/?status=pending   → filter by status
    POST /api/savings/collection/{id}/mark-paid/   → record deposit
    POST /api/savings/collection/generate-for-month/ → bulk generate for a month
    """
    permission_module = 'savings'
    permission_page = 'contribution-schedules'
    queryset = ContributionSchedule.objects.select_related(
        'savings_account',
        'savings_account__client',
        'savings_account__product',
        'paid_by',
    )
    serializer_class = ContributionScheduleSerializer
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        date_str = self.request.query_params.get('date')
        status_filter = self.request.query_params.get('status')
        account_id = self.request.query_params.get('savings_account')
        cycle = self.request.query_params.get('cycle')

        if date_str:
            qs = qs.filter(expected_date=date_str)
        if status_filter:
            qs = qs.filter(status=status_filter)
        if account_id:
            qs = qs.filter(savings_account_id=account_id)
        if cycle:
            qs = qs.filter(savings_account__product__contribution_cycle=cycle)

        return qs.order_by('expected_date', 'savings_account__client__last_name')

    @action(detail=True, methods=['post'], url_path='mark-paid')
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        """
        Mark contribution as paid by calling SavingsAccount.deposit().
        Body: {"cashier_account_id": <int>}
        """
        schedule = self.get_object()
        if schedule.status == ContributionSchedule.PAID:
            return Response(
                {'detail': 'Already paid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cashier_account_id = request.data.get('cashier_account_id')
        if not cashier_account_id:
            return Response(
                {'detail': 'cashier_account_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from accounts.models import Account
        try:
            cashier_account = Account.objects.get(
                pk=cashier_account_id,
                owner=schedule.savings_account.owner,
            )
        except Account.DoesNotExist:
            return Response(
                {'detail': 'Cashier account not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        cycle_label = (
            schedule.savings_account.product.get_contribution_cycle_display()
            if schedule.savings_account.product.contribution_cycle
            else 'Savings'
        )
        journal = schedule.savings_account.deposit(
            amount=schedule.expected_amount,
            description=(
                f"{cycle_label} contribution – "
                f"{schedule.savings_account.account_number} – {schedule.expected_date}"
            ),
            cashier_account=cashier_account,
            transacted_by=request.user,
        )

        schedule.status = ContributionSchedule.PAID
        schedule.paid_on = timezone.localdate()
        schedule.paid_by = request.user
        schedule.savings_transaction = journal
        schedule.save(
            update_fields=['status', 'paid_on', 'paid_by', 'savings_transaction']
        )

        return Response(
            ContributionScheduleSerializer(schedule).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=False, methods=['post'], url_path='generate-for-month')
    @transaction.atomic
    def generate_for_month(self, request):
        """
        Bulk-generate schedules for all active accounts.
        Body: {"year": 2026, "month": 6}  (defaults to current month)
        """
        today = timezone.localdate()
        try:
            year = int(request.data.get('year', today.year))
            month = int(request.data.get('month', today.month))
        except ValueError:
            return Response({'detail': 'Invalid year/month.'}, status=400)

        accounts = SavingsAccount.objects.filter(
            status='active',
            owner=request.user.owner,
        ).select_related('product')

        total = sum(
            len(_generate_month_schedule(acct, year, month))
            for acct in accounts
        )

        return Response(
            {'created': total, 'year': year, 'month': month},
            status=status.HTTP_201_CREATED if total else status.HTTP_200_OK,
        )


class CompulsorySavingsPolicyViewSet(ScopedModelViewSet):
    permission_module = 'savings'
    permission_page = 'compulsory-savings-policies'
    queryset = CompulsorySavingsPolicy.objects.all()
    serializer_class = CompulsorySavingsPolicySerializer

