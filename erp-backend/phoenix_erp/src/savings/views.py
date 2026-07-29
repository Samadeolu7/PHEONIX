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
    SavingsWithdrawalRequest,
    WithdrawalApprovalStep,
)
from .serializers import (
    SavingsAccountSerializer,
    ContributionScheduleSerializer,
    SmartSavingsAccountSerializer,
    SmartSavingsEventSerializer,
    CompulsorySavingsPolicySerializer,
    SavingsGoalSerializer,
    SavingsWithdrawalRequestSerializer,
    WithdrawalApprovalActionSerializer,
    WithdrawalApprovalStepSerializer,
)
from .services import (
    initiate_withdrawal,
    process_withdrawal_approval,
    disburse_withdrawal,
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
    amount = savings_account.effective_contribution_amount or Decimal('0.00')
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
    officer_group_members_lookup = 'client__group__member_officers'

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

    @action(detail=False, methods=['post'], url_path='bulk-set-contribution-amount')
    @transaction.atomic
    def bulk_set_contribution_amount(self, request):
        """
        Set/override each client's own committed contribution amount in bulk.

        Body: {"updates": [{"id": 1, "contribution_amount": "500.00" | null}, ...]}
        Only accounts within the caller's scoped queryset (tenant/branch/
        officer visibility, same as list/retrieve) may be updated.
        """
        updates = request.data.get('updates')
        if not isinstance(updates, list) or not updates:
            return Response(
                {'detail': "'updates' must be a non-empty list of {id, contribution_amount}."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        by_id = {}
        for row in updates:
            try:
                account_id = int(row['id'])
            except (KeyError, TypeError, ValueError):
                return Response({'detail': f'Invalid account id in updates: {row!r}'}, status=400)
            raw_amount = row.get('contribution_amount')
            if raw_amount in (None, ''):
                by_id[account_id] = None
                continue
            try:
                by_id[account_id] = Decimal(str(raw_amount))
            except Exception:
                return Response(
                    {'detail': f'Invalid contribution_amount for account {account_id}: {raw_amount!r}'},
                    status=400,
                )

        accounts = list(self.get_queryset().filter(id__in=by_id.keys()))
        found_ids = {a.id for a in accounts}
        missing_ids = set(by_id.keys()) - found_ids
        if missing_ids:
            return Response(
                {'detail': f'Account(s) not found or not accessible: {sorted(missing_ids)}'},
                status=status.HTTP_404_NOT_FOUND,
            )

        for account in accounts:
            account.contribution_amount = by_id[account.id]
        SavingsAccount.objects.bulk_update(accounts, ['contribution_amount'])

        return Response({'updated': len(accounts)}, status=status.HTTP_200_OK)

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
        Body: {amount, description, payment_date (optional), payment_method ('cash'|'bank',
        default 'cash'), cashier_account_id (optional, cash only),
        bank_account_id (required when payment_method='bank')}
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

        payment_method = request.data.get('payment_method', 'cash')
        bank_account_id = request.data.get('bank_account_id') or request.data.get('bank_account')
        cashier_account_id = request.data.get('cashier_account_id')
        from cash_management.services.payment_routing import PaymentRoutingService
        from django.core.exceptions import ValidationError
        try:
            if payment_method == 'bank':
                if not bank_account_id:
                    return Response(
                        {'detail': 'bank_account_id is required for bank deposits.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                cashier_account = PaymentRoutingService.resolve_bank_gl_account(bank_account_id)
            else:
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
        # Frontend callers (SavingsDepositPage, ThriftMultiDayPage, GroupCombinedReceiptPage,
        # CombinedReceiptPage) all send the deposit date as `date`, not `payment_date` —
        # accept both so backdated deposits actually land on the entered date.
        payment_date_raw = request.data.get('payment_date') or request.data.get('date')
        deposit_date = None
        if payment_date_raw:
            from datetime import date as dt_date
            try:
                deposit_date = dt_date.fromisoformat(str(payment_date_raw))
            except ValueError:
                pass

        # First-deposit-as-income check: if this is the first deposit of the
        # calendar month on a daily-contribution product configured to treat
        # the first payment as income, the full amount goes to the income GL
        # and the savings balance is NOT credited. Mirrors the check applied
        # in ContributionScheduleViewSet.mark_paid so this generic endpoint
        # can't be used to bypass it.
        from .services import handle_first_deposit_income
        try:
            _journal, was_income = handle_first_deposit_income(
                savings_account=account,
                amount=amount,
                deposit_date=deposit_date,
                cashier_account=cashier_account,
                transacted_by=request.user,
            )

            if not was_income:
                account.deposit(
                    amount=amount,
                    description=description,
                    cashier_account=cashier_account,
                    transacted_by=request.user,
                    date=deposit_date,
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
            .filter(account=gl_account, transaction__approved=True)
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
                'description': entry.transaction.description,
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
        # the first payment as income, the committed amount goes to the
        # income GL and the savings balance is NOT credited for that portion.
        # committed_amount is passed explicitly as this schedule row's own
        # expected_amount — deposit_date is "today" (when marked paid), which
        # may differ from schedule.expected_date for a backdated/late
        # contribution, so the service's own date-based auto-lookup could
        # otherwise resolve a different (wrong) schedule row.
        from .services import handle_first_deposit_income
        journal, was_income = handle_first_deposit_income(
            savings_account=schedule.savings_account,
            amount=schedule.expected_amount,
            deposit_date=timezone.localdate(),
            cashier_account=cashier_account,
            transacted_by=request.user,
            committed_amount=schedule.expected_amount,
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

from .models import SavingsProduct, WithdrawalApprovalTier
from .serializers import (
    SavingsProductSerializer,
    WithdrawalApprovalTierSerializer,
)


class SavingsProductConfigViewSet(ScopedModelViewSet):
    """
    CRUD for SavingsProduct config records.
    One config per savings Product (one-to-one).
    GET/POST /api/savings/product-configs/
    GET/PUT/PATCH /api/savings/product-configs/{id}/
    """
    permission_module = 'products'
    permission_page = 'products'
    queryset = SavingsProduct.objects.all()
    serializer_class = SavingsProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = super().get_queryset()
        product_id = self.request.query_params.get('product')
        if product_id:
            qs = qs.filter(product_id=product_id)
        return qs

    def create(self, request, *args, **kwargs):
        """
        Upsert on 'product': config is one-to-one with a Product, so a second
        POST for the same product (e.g. a client that didn't know a config
        row already existed — stale UI state, race between tabs, etc.) should
        update that row instead of failing on the unique constraint. Avoids a
        confusing raw "already exists" error for what the user experiences as
        just "save my configuration".
        """
        product_id = request.data.get('product')
        existing = self.get_queryset().filter(product_id=product_id).first() if product_id else None
        if existing:
            serializer = self.get_serializer(existing, data=request.data, partial=False)
            serializer.is_valid(raise_exception=True)
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return super().create(request, *args, **kwargs)


class WithdrawalApprovalTierViewSet(ScopedModelViewSet):
    """
    Global (per-tenant) approval tier configuration.
    Admin-only write access.
    GET/POST /api/savings/withdrawal-tiers/
    """
    permission_module = 'savings'
    permission_page = 'savings-withdrawals'
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

    POST  /api/savings/withdrawals/                    — initiate a new request
    GET   /api/savings/withdrawals/                    — list (branch-scoped; directors see all)
    GET   /api/savings/withdrawals/pending/            — steps pending MY approval
    GET   /api/savings/withdrawals/pending-disburse/   — fully approved, awaiting disburse
    POST  /api/savings/withdrawals/{id}/approve-step/  — approve/reject a step
    POST  /api/savings/withdrawals/{id}/disburse/      — release funds (3rd maker-checker role)
    POST  /api/savings/withdrawals/{id}/cancel/        — cancel (before approvals)
    """
    permission_module = 'savings'
    permission_page = 'savings-withdrawals'
    officer_client_lookup = 'savings_account__client__assigned_officer'
    queryset = SavingsWithdrawalRequest.objects.select_related(
        'savings_account__client',
        'savings_account__product',
        'savings_account__account',   # needed for current_balance property
        'requested_by',
        'disbursed_by',
        'applied_tier',
        'cashier_account',            # needed for cashier_account_name
        'destination_bank_account__bank',
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
        """
        Return full withdrawal REQUEST objects where the current user has a
        pending approval step and belongs to the required role for that tier.

        IMPORTANT: We intentionally bypass the officer-scope filter
        (officer_client_lookup = 'savings_account__client__assigned_officer')
        that get_queryset() applies.  Approvers must see all branch withdrawal
        requests that match their tier/role – not just requests for clients
        assigned to them as account officers.  Maker-checker requests created
        by the current user are also excluded because self-approval is blocked.
        """
        user = request.user
        user_groups = set(user.groups.values_list('name', flat=True))

        # --- Build a scope-correct queryset WITHOUT the officer scope filter ---
        # Start from the class-level queryset (has select_related/prefetch_related
        # and the soft-delete .alive() guard from OwnerBranchManager).
        qs = self.__class__.queryset.all()

        # Apply tenant scope
        if getattr(user, 'tenant', None):
            qs = qs.filter(tenant=user.tenant)

        # Apply branch scope (directors with view_all_branches bypass this)
        if not user.has_perm('savings.view_all_branches'):
            if getattr(user, 'branch', None):
                qs = qs.filter(branch=user.branch)

        # Exclude requests created by this user (maker-checker: creator ≠ approver)
        qs = qs.exclude(requested_by=user)

        # Keep only in-progress requests that still have at least one pending step.
        # .distinct() is required because the approval_steps JOIN can duplicate rows.
        qs = qs.filter(
            status__in=[
                SavingsWithdrawalRequest.STATUS_PENDING,
                SavingsWithdrawalRequest.STATUS_PARTIAL,
            ],
            approval_steps__status=WithdrawalApprovalStep.STATUS_PENDING,
        ).distinct()

        eligible = []
        for wr in qs:
            # wr.approval_steps.all() uses the prefetch cache – no extra DB queries.
            steps = list(wr.approval_steps.all())

            # Skip if this user has already responded to any step on this request
            if any(
                s.approver_id == user.pk and s.status != WithdrawalApprovalStep.STATUS_PENDING
                for s in steps
            ):
                continue

            # Check tier eligibility: if a tier specifies approver_roles, the user
            # must belong to at least one of those groups.
            tier = wr.applied_tier
            allowed = set(tier.approver_roles) if tier and tier.approver_roles else set()
            if not allowed or (allowed & user_groups):
                eligible.append(wr)

        return Response(
            SavingsWithdrawalRequestSerializer(eligible, many=True, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='approve-step')
    def approve_step(self, request, pk=None):
        """Approve or reject the next pending step on this withdrawal request.

        On the first step (payment_method not yet set), the body must also include:
          payment_method: 'cash' | 'bank'
          cashier_account: <account_id>  (required when payment_method='cash')
        """
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
                payment_method=serializer.validated_data.get('payment_method'),
                cashier_account_id=serializer.validated_data.get('cashier_account'),
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

    @action(detail=False, methods=['get'], url_path='pending-disburse')
    def pending_disburse(self, request):
        """
        List fully-approved withdrawal requests waiting for a disburser (3rd person).
        """
        qs = self.get_queryset().filter(
            status=SavingsWithdrawalRequest.STATUS_APPROVED,
        )
        return Response(
            SavingsWithdrawalRequestSerializer(qs, many=True, context={'request': request}).data
        )

    @action(detail=True, methods=['post'], url_path='disburse')
    def disburse(self, request, pk=None):
        """
        Disburse a fully-approved withdrawal request.

        Cash withdrawals (payment_method='cash'):
          Cashier account was set by the Branch Manager during approval.
          Director just confirms — no additional fields required.

        Bank withdrawals (payment_method='bank'):
          Request body must include:
            destination_bank_account (int): FK of the org BankAccount to debit.
        """
        wr = self.get_object()

        destination_bank = None
        if wr.payment_method == 'bank' or request.data.get('destination_bank_account'):
            if request.data.get('destination_bank_account'):
                from banks.models import BankAccount
                try:
                    destination_bank = BankAccount.objects.get(
                        pk=request.data['destination_bank_account']
                    )
                except Exception:
                    return Response(
                        {'detail': 'destination_bank_account not found.'}, status=400
                    )
            elif wr.payment_method == 'bank':
                return Response(
                    {'detail': 'A destination bank account is required for bank disbursements.'},
                    status=400,
                )

        try:
            disburse_withdrawal(wr, request.user, destination_bank_account=destination_bank)
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)
        return Response(
            SavingsWithdrawalRequestSerializer(wr, context={'request': request}).data
        )
