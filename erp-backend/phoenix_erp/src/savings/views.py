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
    officer_group_lookup = 'client__group__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params
        client_id = params.get('client')
        cycle = params.get('cycle')
        product_id = params.get('product')
        status = params.get('status')
        search = params.get('search', '').strip()
        if client_id:
            qs = qs.filter(client_id=client_id)
        if cycle:
            qs = qs.filter(product__contribution_cycle=cycle)
        if product_id:
            qs = qs.filter(product_id=product_id)
        if status:
            qs = qs.filter(status=status)
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(account_number__icontains=search)
                | Q(client__first_name__icontains=search)
                | Q(client__last_name__icontains=search)
                | Q(client__client_id__icontains=search)
            )
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

    @action(detail=True, methods=['post'], url_path='deposit')
    @transaction.atomic
    def deposit(self, request, pk=None):
        """
        Record a direct deposit to a savings account.
        Body: {amount, description, payment_date (optional), cashier_account_id (optional)}
        """
        from decimal import Decimal
        account = self.get_object()
        if account.status != 'active':
            return Response({'detail': 'Account is not active.'}, status=status.HTTP_400_BAD_REQUEST)

        amount_raw = request.data.get('amount')
        if not amount_raw:
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        cashier_account_id = request.data.get('cashier_account_id')
        from cash_management.services.payment_routing import PaymentRoutingService
        from django.core.exceptions import ValidationError
        try:
            cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                request.user,
                owner=account.owner,
                branch=account.branch,
                cashier_account_id=cashier_account_id,
            )
        except ValidationError as exc:
            return Response(
                {'detail': str(exc.message if hasattr(exc, 'message') else exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        description = request.data.get('description', 'Deposit')
        try:
            account.deposit(
                amount=amount,
                description=description,
                cashier_account=cashier_account,
                transacted_by=request.user,
            )
        except ValidationError as exc:
            return Response(
                {'detail': exc.message if hasattr(exc, 'message') else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        account.refresh_from_db()
        return Response(SavingsAccountSerializer(account).data)

    @action(detail=True, methods=['get'], url_path='transactions')
    def transactions(self, request, pk=None):
        """
        Return posted GL journal entry lines for this savings account.
        Supports ?page=N&page_size=M for pagination.
        """
        from transactions.models import TransactionEntry, Transaction
        account = self.get_object()
        gl_account = account.account

        qs = (
            TransactionEntry.objects
            .filter(account=gl_account, transaction__status=Transaction.POSTED)
            .select_related('transaction')
            .order_by('-transaction__date', '-id')
        )

        try:
            page_size = min(int(request.query_params.get('page_size', 50)), 200)
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            page_size, page = 50, 1

        total = qs.count()
        offset = (page - 1) * page_size
        entries = qs[offset: offset + page_size]

        running_balance = Decimal('0.00')
        rows = []
        for entry in reversed(list(entries)):
            if entry.side == TransactionEntry.DEBIT:
                running_balance -= entry.amount
            else:
                running_balance += entry.amount
            rows.append({
                'id': entry.id,
                'date': entry.transaction.date,
                'reference': entry.transaction.reference_number,
                'description': entry.description or entry.transaction.description,
                'debit': str(entry.amount) if entry.side == TransactionEntry.DEBIT else None,
                'credit': str(entry.amount) if entry.side == TransactionEntry.CREDIT else None,
                'balance': str(running_balance),
            })
        rows.reverse()

        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': rows,
        })


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
    officer_client_lookup = 'savings_account__client__assigned_officer'
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
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(savings_account__product_id=product_id)

        return qs.order_by('expected_date', 'savings_account__client__last_name')

    @action(detail=True, methods=['post'], url_path='mark-paid')
    @transaction.atomic
    def mark_paid(self, request, pk=None):
        """
        Mark contribution as paid by calling SavingsAccount.deposit().
        Body: {"cashier_account_id": <int>}
        """
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='savings', page='contribution-schedules', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to mark contributions as paid.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        schedule = self.get_object()
        if schedule.status == ContributionSchedule.PAID:
            return Response(
                {'detail': 'Already paid.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cashier_account_id = request.data.get('cashier_account_id')
        from cash_management.services.payment_routing import PaymentRoutingService
        from django.core.exceptions import ValidationError as DjangoValidationError
        try:
            cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                request.user,
                owner=schedule.savings_account.owner,
                branch=schedule.savings_account.branch,
                cashier_account_id=cashier_account_id,
            )
        except DjangoValidationError as exc:
            return Response(
                {'detail': str(exc.message if hasattr(exc, 'message') else exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cycle_label = (
            schedule.savings_account.product.get_contribution_cycle_display()
            if schedule.savings_account.product.contribution_cycle
            else 'Savings'
        )
        description = (
            f"{cycle_label} contribution – "
            f"{schedule.savings_account.account_number} – {schedule.expected_date}"
        )

        # First-deposit-as-income check: if this is the first deposit of the
        # calendar month on a daily-contribution product configured to treat
        # the first payment as income, the full amount goes to the income GL
        # and the savings balance is NOT credited.
        from .services import handle_first_deposit_income
        journal, was_income = handle_first_deposit_income(
            savings_account=schedule.savings_account,
            amount=schedule.expected_amount,
            deposit_date=timezone.localdate(),
            cashier_account=cashier_account,
            transacted_by=request.user,
        )

        if not was_income:
            # Normal deposit path
            journal = schedule.savings_account.deposit(
                amount=schedule.expected_amount,
                description=description,
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



# ---------------------------------------------------------------------------
# Savings product configuration view
# ---------------------------------------------------------------------------

from .models import SavingsProduct, WithdrawalApprovalTier, SavingsWithdrawalRequest, WithdrawalApprovalStep
from .serializers import (
    SavingsProductSerializer,
    WithdrawalApprovalTierSerializer,
    SavingsWithdrawalRequestSerializer,
    WithdrawalApprovalActionSerializer,
    WithdrawalApprovalStepSerializer,
)
from .services import initiate_withdrawal, process_withdrawal_approval


class SavingsProductConfigViewSet(ScopedModelViewSet):
    """
    CRUD for SavingsProduct config records.
    One config per savings Product (one-to-one).
    GET/POST /api/savings/product-configs/
    GET/PUT/PATCH /api/savings/product-configs/{id}/
    """
    queryset = SavingsProduct.objects.all()
    serializer_class = SavingsProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs


class WithdrawalApprovalTierViewSet(ScopedModelViewSet):
    """
    Global (per-tenant) approval tier configuration.
    Admin-only write access.
    GET/POST /api/savings/withdrawal-tiers/
    """
    queryset = WithdrawalApprovalTier.objects.all()
    serializer_class = WithdrawalApprovalTierSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = WithdrawalApprovalTier.objects.filter(
            owner=self.request.user
        ).order_by('order')
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)


class SavingsWithdrawalRequestViewSet(ScopedModelViewSet):
    """
    Withdrawal request management.

    POST  /api/savings/withdrawals/           — initiate a new request
    GET   /api/savings/withdrawals/           — list (branch-scoped; directors see all)
    GET   /api/savings/withdrawals/pending/   — steps pending MY approval
    POST  /api/savings/withdrawals/{id}/approve_step/ — approve/reject a step
    POST  /api/savings/withdrawals/{id}/cancel/       — cancel (before approvals)
    """
    officer_client_lookup = 'savings_account__client__assigned_officer'
    queryset = SavingsWithdrawalRequest.objects.select_related(
        'savings_account__client',
        'savings_account__product',
        'requested_by',
        'applied_tier',
    ).prefetch_related('approval_steps')
    serializer_class = SavingsWithdrawalRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        qs = super().get_queryset()
        user = self.request.user

        # Directors (cross-branch permission) see all; others see their branch only
        if not user.has_perm('savings.view_all_branches'):
            qs = qs.filter(branch=user.branch)

        # Optional filters
        params = self.request.query_params
        savings_account_id = params.get('savings_account')
        if savings_account_id:
            qs = qs.filter(savings_account_id=savings_account_id)

        req_status = params.get('status')
        if req_status:
            qs = qs.filter(status=req_status)

        return qs.order_by('-created_at')

    def create(self, request, *args, **kwargs):
        """Initiate a new withdrawal request."""
        from savings.models import SavingsAccount
        from accounts.models import Account

        data = request.data
        try:
            savings_account = SavingsAccount.objects.get(pk=data['savings_account'])
        except (SavingsAccount.DoesNotExist, KeyError):
            return Response({'detail': 'savings_account not found.'}, status=400)

        try:
            from decimal import Decimal
            amount = Decimal(str(data.get('amount', 0)))
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=400)

        cashier_account = None
        if data.get('cashier_account'):
            try:
                cashier_account = Account.objects.get(pk=data['cashier_account'])
            except Account.DoesNotExist:
                return Response({'detail': 'cashier_account not found.'}, status=400)

        destination_bank = None
        if data.get('destination_bank_account'):
            from banks.models import BankAccount
            try:
                destination_bank = BankAccount.objects.get(pk=data['destination_bank_account'])
            except Exception:
                return Response({'detail': 'destination_bank_account not found.'}, status=400)

        try:
            wr = initiate_withdrawal(
                savings_account=savings_account,
                amount=amount,
                requested_by=request.user,
                description=data.get('description', ''),
                cashier_account=cashier_account,
                destination_bank_account=destination_bank,
            )
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(
            SavingsWithdrawalRequestSerializer(wr, context={'request': request}).data,
            status=201,
        )

    @action(detail=False, methods=['get'], url_path='pending')
    def pending_my_approval(self, request):
        """Return withdrawal steps pending the current user's approval."""
        user = request.user
        user_groups = set(user.groups.values_list('name', flat=True))

        # Get steps this user is eligible to approve
        steps = WithdrawalApprovalStep.objects.filter(
            status=WithdrawalApprovalStep.STATUS_PENDING,
            withdrawal_request__status__in=[
                SavingsWithdrawalRequest.STATUS_PENDING,
                SavingsWithdrawalRequest.STATUS_PARTIAL,
            ],
        ).select_related('withdrawal_request__savings_account__client')

        # Filter by branch unless director
        if not user.has_perm('savings.view_all_branches'):
            steps = steps.filter(withdrawal_request__branch=user.branch)

        # Filter by approver role eligibility
        eligible_steps = []
        for step in steps:
            tier = step.withdrawal_request.applied_tier
            allowed = set(tier.approver_roles) if tier and tier.approver_roles else set()
            if not allowed or (allowed & user_groups):
                eligible_steps.append(step)

        return Response(
            WithdrawalApprovalStepSerializer(eligible_steps, many=True).data
        )

    @action(detail=True, methods=['post'], url_path='approve-step')
    def approve_step(self, request, pk=None):
        """Approve or reject the next pending step on this withdrawal request."""
        wr = self.get_object()
        serializer = WithdrawalApprovalActionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        # Find the next pending step
        step = wr.approval_steps.filter(
            status=WithdrawalApprovalStep.STATUS_PENDING
        ).order_by('step_number').first()

        if not step:
            return Response({'detail': 'No pending steps for this request.'}, status=400)

        try:
            updated_wr = process_withdrawal_approval(
                step=step,
                approver=request.user,
                approved=serializer.validated_data['approved'],
                comment=serializer.validated_data.get('comment', ''),
            )
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(
            SavingsWithdrawalRequestSerializer(updated_wr, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        """Cancel a withdrawal request (only before any approvals are given)."""
        wr = self.get_object()
        try:
            wr.cancel(request.user)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(
            SavingsWithdrawalRequestSerializer(wr, context={'request': request}).data
        )
