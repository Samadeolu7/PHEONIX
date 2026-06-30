import logging

from django.shortcuts import render
from django.db.models import Q
from django.core.exceptions import ValidationError
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

logger = logging.getLogger(__name__)

from common.serializers import IsTenantUser
from common.views import ScopedModelViewSet

from .models import (
    LoanProduct, LoanAccount, LoanRepaymentSchedule, LoanCollateral, LoanGuarantor,
    LoanVerificationRequest, LoanDisbursement, LoanRepaymentRequest, LoanRestructure,
)
from .serializers import (
    LoanProductSerializer,
    LoanAccountListSerializer, LoanAccountDetailSerializer, LoanAccountCreateSerializer,
    LoanRepaymentScheduleSerializer, LoanCollateralSerializer, LoanGuarantorSerializer,
    LoanVerificationRequestSerializer, LoanDisbursementSerializer,
    LoanRepaymentRequestSerializer, LoanRestructureSerializer,
)
from .utils import LoanVerifier
from cash_management.services.payment_routing import PaymentRoutingService


def _resolve_scope(user, fallback_obj=None):
    """
    Return (tenant, branch) for direct objects.create() calls inside action
    methods that bypass ScopedModelViewSet.perform_create().

    Priority: request.user → fallback_obj (e.g. a related LoanAccount).
    """
    tenant = getattr(user, 'tenant', None) or getattr(fallback_obj, 'tenant', None)
    branch = getattr(user, 'branch', None) or getattr(fallback_obj, 'branch', None)
    return tenant, branch


def _build_scoped_qs(qs, user):
    """
    Apply tenant + branch scoping to an already-constructed QuerySet.
    Global-scope Role users (directors, admins, owners) bypass the branch filter.
    """
    if not user or not getattr(user, 'is_authenticated', False):
        return qs.none()

    tenant = getattr(user, 'tenant', None)
    if tenant:
        qs = qs.filter(Q(tenant=tenant) | Q(tenant__isnull=True))

    is_owner = callable(getattr(user, 'is_owner', None)) and user.is_owner()
    has_global_role = False
    try:
        has_global_role = user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        pass

    if not (is_owner or has_global_role):
        branch = getattr(user, 'branch', None)
        if branch:
            qs = qs.filter(Q(branch=branch) | Q(branch__isnull=True))

    return qs


class LoanProductViewSet(ScopedModelViewSet):
    """CRUD for loan products (DC, Weekly, Monthly, etc.)."""
    queryset = LoanProduct.objects.select_related('product').all()
    serializer_class = LoanProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(product__is_active=is_active.lower() == 'true')
        freq = self.request.query_params.get('repayment_frequency')
        if freq:
            qs = qs.filter(allowed_repayment_frequencies__contains=[freq])
        return qs

    def partial_update(self, request, *args, **kwargs):
        """PATCH — update loan product settings (rates, terms, penalties, etc.)."""
        kwargs['partial'] = True
        return self.update(request, *args, **kwargs)


class LoanAccountViewSet(ScopedModelViewSet):
    """
    Loan account CRUD.

    Query params:
      - status: pending / approved / disbursed / active / paid_off / defaulted
      - client: client PK
      - repayment_frequency: daily / weekly / biweekly / monthly / quarterly
      - risk_classification: performing / watch / substandard / doubtful / loss
      - in_arrears: true/false
      - search: loan_number
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = LoanAccount.objects.all()
    officer_client_lookup = 'client__assigned_officer'
    officer_group_lookup = 'client__group__assigned_officer'
    permission_module = 'loans'
    permission_page = 'loan-accounts'

    def get_serializer_class(self):
        if self.action == 'list':
            return LoanAccountListSerializer
        if self.action == 'create':
            return LoanAccountCreateSerializer
        return LoanAccountDetailSerializer

    def _get_client_product_compat_warning(self, loan):
        """
        Soft warning only: informs staff when client type does not match
        the typical repayment frequency for the selected loan setup.
        """
        client_type = (getattr(loan.client, 'client_type', '') or '').lower()
        selected_frequency = (loan.repayment_frequency or '').lower()

        expected_frequency_by_client_type = {
            'dc': 'daily',
            'wl': 'weekly',
            'ml': 'monthly',
        }
        expected = expected_frequency_by_client_type.get(client_type)
        if not expected or not selected_frequency:
            return None
        if selected_frequency == expected:
            return None

        return (
            f"Compatibility warning: client type '{client_type}' is typically "
            f"paired with '{expected}' repayment frequency, but this loan uses "
            f"'{selected_frequency}'."
        )

    def _resolve_cashier_account(self, loan, cashier_account_id=None):
        try:
            return PaymentRoutingService.resolve_cashier_gl_account(
                self.request.user,
                owner=loan.owner,
                branch=loan.branch,
                cashier_account_id=cashier_account_id,
            )
        except ValidationError as exc:
            raise DRFValidationError({'cashier_account_id': str(exc)})

    def get_queryset(self):
        qs = super().get_queryset()
        params = self.request.query_params

        client_id = params.get('client')
        if client_id:
            qs = qs.filter(client_id=client_id)

        loan_status = params.get('status')
        if loan_status:
            qs = qs.filter(status=loan_status)

        freq = params.get('repayment_frequency')
        if freq:
            qs = qs.filter(repayment_frequency=freq)

        risk = params.get('risk_classification')
        if risk:
            qs = qs.filter(risk_classification=risk)

        in_arrears = params.get('in_arrears')
        if in_arrears is not None:
            if in_arrears.lower() == 'true':
                qs = qs.filter(days_in_arrears__gt=0)
            else:
                qs = qs.filter(days_in_arrears=0)

        search = params.get('search', '').strip()
        if search:
            from django.db.models import Q
            qs = qs.filter(
                Q(loan_number__icontains=search)
                | Q(client__first_name__icontains=search)
                | Q(client__last_name__icontains=search)
                | Q(client__client_id__icontains=search)
            )

        return qs

    @action(detail=True, methods=['get'])
    def schedule(self, request, pk=None):
        """Return the repayment schedule for a loan."""
        loan = self.get_object()
        items = loan.repayment_schedule.all().order_by('installment_number')
        serializer = LoanRepaymentScheduleSerializer(items, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a pending loan application (maker-checker enforced)."""
        loan = self.get_object()

        # Check action-level approval permission and amount limit
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-accounts', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to approve loans.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
            if effective.approval_limit is not None:
                from decimal import Decimal
                limit = Decimal(str(effective.approval_limit))
                amount = getattr(loan, 'principal_amount', None) or getattr(loan, 'amount', None) or 0
                if Decimal(str(amount)) > limit:
                    return Response(
                        {
                            'detail': (
                                f'Loan amount {amount} exceeds your approval limit of {limit}. '
                                'Please escalate to a supervisor.'
                            )
                        },
                        status=status.HTTP_403_FORBIDDEN,
                    )
        except Exception:
            pass  # Fail-open during rollout; HasActionPermission also covers this

        try:
            loan.approve(request.user)
        except ValidationError as exc:
            return Response({'detail': str(exc.message)}, status=status.HTTP_400_BAD_REQUEST)

        # Post any fees configured to trigger at approval
        from .services import apply_loan_fees
        _needs_cashier = loan.product.fee_lines.filter(
            posting_trigger='approval', is_active=True,
            debit_destination__in=('cashier', 'user_choice'),
        ).exists()
        _cashier_acct = None
        if _needs_cashier:
            try:
                _cashier_acct = self._resolve_cashier_account(
                    loan,
                    cashier_account_id=request.data.get('cashier_account_id'),
                )
            except DRFValidationError:
                pass  # apply_loan_fees will raise its own error if cashier is missing
        try:
            apply_loan_fees(
                loan, 'approval',
                posted_by=request.user,
                cashier_account=_cashier_acct,
            )
        except (ValidationError, Exception) as exc:
            # Loan is already approved — don't reverse it, return a warning instead
            response_data = LoanAccountDetailSerializer(loan, context={'request': request}).data
            response_data['warnings'] = [f"Approval fees could not be posted: {exc}. Use the fee-apply endpoint to retry."]
            return Response(response_data)

        return Response(LoanAccountDetailSerializer(loan, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a pending loan application."""
        # Require can_approve permission to reject (same gating as approve)
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-accounts', action='reject',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to reject loans.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        loan = self.get_object()
        if loan.status not in ('pending', 'approved'):
            return Response(
                {'detail': 'Only pending or approved loans can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        loan.status = 'rejected'
        loan.save(update_fields=['status', 'updated_at'])
        return Response({'detail': 'Loan rejected.'})

    @action(detail=True, methods=['post'])
    def write_off(self, request, pk=None):
        """
        Write off a defaulted / loss-classified loan and post the GL entry.

        Required body param:
          provision_account_id — PK of the GL account to debit
          (typically a Loan Loss Provision or Bad Debt Expense account).

        Optional:
          notes — text appended to the journal entry description.
        """
        loan = self.get_object()
        provision_account_id = request.data.get('provision_account_id')
        if not provision_account_id:
            return Response(
                {'detail': 'provision_account_id is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from accounts.models import Account
        try:
            provision_account = Account.objects.get(pk=provision_account_id)
        except Account.DoesNotExist:
            return Response(
                {'detail': 'Provision account not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        try:
            loan.write_off(
                written_off_by=request.user,
                provision_account=provision_account,
                notes=request.data.get('notes', ''),
            )
        except ValidationError as exc:
            return Response(
                {'detail': exc.message if hasattr(exc, 'message') else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(LoanAccountDetailSerializer(loan, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def repay(self, request, pk=None):
        """
        Record a loan repayment.

        Body:
          amount           (Decimal, required)
          payment_date     (date string YYYY-MM-DD, optional — defaults to today)
          payment_mode     ('cash' | 'bank_transfer', default 'cash')
          bank_reference   (str, required when payment_mode='bank_transfer')
          cashier_account_id (int, optional — for cash mode auto-resolves if omitted)
          bank_account_id  (int, optional — for bank_transfer mode, company bank GL account)

        On success returns: {loan: <detail>, schedule: [...], spillover_to_savings: <amount>}
        Spillover = amount paid beyond (overdue installments + next pending installment);
        it is deposited into the client's primary savings account.
        """
        from decimal import Decimal
        from django.utils import timezone
        from accounts.models import Account as GlAccount

        loan = self.get_object()

        if loan.status not in ('active', 'disbursed', 'defaulted'):
            return Response(
                {'detail': f"Cannot record repayment on a '{loan.status}' loan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Parse / validate input ────────────────────────────────────────
        amount_raw = request.data.get('amount')
        if not amount_raw:
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        payment_date_raw = request.data.get('payment_date')
        if payment_date_raw:
            from datetime import date
            try:
                payment_date = date.fromisoformat(payment_date_raw)
            except ValueError:
                return Response({'detail': 'Invalid payment_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            payment_date = timezone.localdate()

        payment_mode = request.data.get('payment_mode', 'cash')
        if payment_mode not in ('cash', 'bank_transfer'):
            return Response({'detail': "payment_mode must be 'cash' or 'bank_transfer'."}, status=status.HTTP_400_BAD_REQUEST)

        bank_reference = request.data.get('bank_reference', '').strip()
        if payment_mode == 'bank_transfer' and not bank_reference:
            return Response(
                {'detail': 'bank_reference is required for bank_transfer payments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Resolve payment GL account ────────────────────────────────────
        if payment_mode == 'cash':
            cashier_account_id = request.data.get('cashier_account_id')
            try:
                payment_account = PaymentRoutingService.resolve_cashier_gl_account(
                    request.user,
                    owner=loan.owner,
                    branch=loan.branch,
                    cashier_account_id=cashier_account_id,
                )
            except ValidationError as exc:
                return Response(
                    {'detail': str(exc.message if hasattr(exc, 'message') else exc)},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        else:
            bank_account_id = request.data.get('bank_account_id')
            if not bank_account_id:
                return Response(
                    {'detail': 'bank_account_id is required for bank_transfer payments.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                payment_account = GlAccount.objects.get(pk=bank_account_id)
            except GlAccount.DoesNotExist:
                return Response({'detail': 'Bank account not found.'}, status=status.HTTP_404_NOT_FOUND)

        # ── Detect spillover / overpayment ───────────────────────────────
        from decimal import ROUND_HALF_UP
        total_outstanding = loan.total_outstanding
        try:
            total_outstanding = Decimal(str(total_outstanding))
        except Exception:
            total_outstanding = Decimal('0.00')

        # Determine how much is payable right now:
        #   all overdue/partial installments  +  the single next pending installment.
        # Anything the client pays beyond this is spillover and goes to savings,
        # not pre-applied to a future installment they haven't reached yet.
        overdue_due = Decimal('0.00')
        for s in loan.repayment_schedule.filter(status__in=['overdue', 'partial']):
            overdue_due += Decimal(str(s.total_due)) - Decimal(str(s.total_paid))

        next_pending = (
            loan.repayment_schedule
            .filter(status='pending')
            .order_by('due_date')
            .first()
        )
        next_pending_due = (
            Decimal(str(next_pending.total_due)) - Decimal(str(next_pending.total_paid))
            if next_pending else Decimal('0.00')
        )

        # payable_now is capped at total_outstanding to handle rounding drift.
        # If there is no schedule at all, fall back to total_outstanding so
        # balloon / bullet loans are not affected.
        has_schedule = loan.repayment_schedule.exists()
        if has_schedule and (overdue_due + next_pending_due) > Decimal('0.00'):
            payable_now = min(
                (overdue_due + next_pending_due).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
                total_outstanding,
            )
        else:
            payable_now = total_outstanding

        overpayment_credited = Decimal('0.00')
        excess = Decimal('0.00')

        if total_outstanding > Decimal('0.00') and amount > total_outstanding:
            # Full overpayment — more than the entire loan balance.
            excess = (amount - total_outstanding).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            payment_amount = total_outstanding
        elif payable_now > Decimal('0.00') and amount > payable_now:
            # Spillover — payment exceeds current-period dues; route excess to savings.
            excess = (amount - payable_now).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
            payment_amount = payable_now
        else:
            payment_amount = amount

        # ── Post the repayment ────────────────────────────────────────────
        description = f"Loan repayment — {loan.loan_number}"
        if bank_reference:
            description += f" | Ref: {bank_reference}"

        try:
            from django.db import transaction as db_transaction
            with db_transaction.atomic():
                spillover_savings = None
                if excess > Decimal('0.00'):
                    from savings.models import SavingsAccount as SavAcct
                    spillover_savings = (
                        SavAcct.objects
                        .filter(client=loan.client, status='active')
                        .order_by('opened_on')
                        .first()
                    )

                loan.record_payment(
                    amount=payment_amount,
                    payment_date=payment_date,
                    payment_account=payment_account,
                    received_by=request.user,
                    spillover_savings_account=spillover_savings,
                    spillover_amount=excess if spillover_savings else Decimal('0.00'),
                )

                if spillover_savings and excess > Decimal('0.00'):
                    overpayment_credited = excess

        except ValidationError as exc:
            return Response(
                {'detail': exc.message if hasattr(exc, 'message') else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            logger.exception('loan.repay failed for loan pk=%s: %s', pk, exc)
            return Response(
                {'detail': f'Repayment failed: {exc}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        loan.refresh_from_db()
        schedule_qs = loan.repayment_schedule.all().order_by('installment_number')

        return Response({
            'loan': LoanAccountDetailSerializer(loan, context={'request': request}).data,
            'schedule': LoanRepaymentScheduleSerializer(schedule_qs, many=True).data,
            'spillover_to_savings': str(overpayment_credited),
        })

    @action(detail=False, methods=['get'], url_path='group-collection')
    def group_collection(self, request):
        """
        Return next outstanding installment per active loan for each member of a group.

        Query params:
          group_id (int, required)
          date     (YYYY-MM-DD, optional — defaults to today)

        Returns a list of:
          {client_id, client_name, loan_account_id, loan_number,
           next_due_date, total_due, total_paid, remaining,
           principal_due, interest_due, fees_due, status}
        """
        from django.utils import timezone
        from clients.models import ClientGroup
        from datetime import date as dt_date

        group_id = request.query_params.get('group_id')
        if not group_id:
            return Response({'detail': 'group_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            group = ClientGroup.objects.get(pk=group_id)
        except ClientGroup.DoesNotExist:
            return Response({'detail': 'Group not found.'}, status=status.HTTP_404_NOT_FOUND)

        date_str = request.query_params.get('date')
        if date_str:
            try:
                collection_date = dt_date.fromisoformat(date_str)
            except ValueError:
                return Response({'detail': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            collection_date = timezone.localdate()

        # Get all active/disbursed loans for group members
        member_client_ids = list(
            group.members.filter(status='active').values_list('id', flat=True)
        )
        loans_qs = (
            self.get_queryset()
            .filter(client_id__in=member_client_ids, status__in=('active', 'disbursed', 'defaulted'))
            .select_related('client')
        )

        rows = []
        for loan in loans_qs:
            schedule_item = (
                loan.repayment_schedule
                .filter(
                    status__in=('pending', 'partial', 'overdue'),
                    due_date__lte=collection_date,
                )
                .order_by('due_date', 'installment_number')
                .first()
            )
            if not schedule_item:
                # Take earliest future pending installment if no overdue/due today
                schedule_item = (
                    loan.repayment_schedule
                    .filter(status__in=('pending', 'partial'))
                    .order_by('installment_number')
                    .first()
                )
            if not schedule_item:
                continue

            from decimal import Decimal
            remaining = Decimal(str(schedule_item.total_due)) - Decimal(str(schedule_item.total_paid))
            rows.append({
                'client_id': loan.client_id,
                'client_name': loan.client.full_name,
                'loan_account_id': loan.id,
                'loan_number': loan.loan_number,
                'next_due_date': str(schedule_item.due_date),
                'total_due': str(schedule_item.total_due),
                'total_paid': str(schedule_item.total_paid),
                'remaining': str(remaining),
                'principal_due': str(schedule_item.principal_due),
                'interest_due': str(schedule_item.interest_due),
                'fees_due': str(schedule_item.fees_due),
                'status': schedule_item.status,
            })

        rows.sort(key=lambda r: r['client_name'])
        return Response(rows)

    @action(detail=False, methods=['post'], url_path='bulk-repay')
    def bulk_repay(self, request):
        """
        Bulk post repayments for multiple loans in a single atomic transaction.

        Body: {
          payments: [
            {loan_account_id, amount, payment_date (optional)},
            ...
          ],
          payment_mode: 'cash' | 'bank_transfer',
          bank_reference: str (required if payment_mode='bank_transfer')
        }

        Returns: {succeeded: int, failed: [{loan_account_id, error}]}
        """
        from decimal import Decimal, ROUND_HALF_UP
        from django.utils import timezone
        from datetime import date as dt_date
        from django.db import transaction as db_transaction

        payments = request.data.get('payments', [])
        if not payments:
            return Response({'detail': 'payments list is required.'}, status=status.HTTP_400_BAD_REQUEST)

        payment_mode = request.data.get('payment_mode', 'cash')
        bank_reference = request.data.get('bank_reference', '').strip()

        if payment_mode == 'bank_transfer' and not bank_reference:
            return Response(
                {'detail': 'bank_reference is required for bank_transfer payments.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        succeeded = 0
        failed = []

        for item in payments:
            loan_id = item.get('loan_account_id')
            amount_raw = item.get('amount')
            if not loan_id or not amount_raw:
                failed.append({'loan_account_id': loan_id, 'error': 'loan_account_id and amount are required.'})
                continue

            try:
                amount = Decimal(str(amount_raw))
            except Exception:
                failed.append({'loan_account_id': loan_id, 'error': 'Invalid amount.'})
                continue

            if amount <= 0:
                failed.append({'loan_account_id': loan_id, 'error': 'Amount must be positive.'})
                continue

            date_raw = item.get('payment_date')
            if date_raw:
                try:
                    payment_date = dt_date.fromisoformat(date_raw)
                except ValueError:
                    payment_date = timezone.localdate()
            else:
                payment_date = timezone.localdate()

            try:
                loan = self.get_queryset().get(pk=loan_id)
            except Exception:
                failed.append({'loan_account_id': loan_id, 'error': 'Loan not found.'})
                continue

            # Resolve cashier account
            if payment_mode == 'cash':
                try:
                    payment_account = PaymentRoutingService.resolve_cashier_gl_account(
                        request.user,
                        owner=loan.owner,
                        branch=loan.branch,
                    )
                except ValidationError as exc:
                    failed.append({'loan_account_id': loan_id, 'error': str(exc)})
                    continue
            else:
                from accounts.models import Account as GlAccount
                bank_account_id = request.data.get('bank_account_id')
                if not bank_account_id:
                    failed.append({'loan_account_id': loan_id, 'error': 'bank_account_id required.'})
                    continue
                try:
                    payment_account = GlAccount.objects.get(pk=bank_account_id)
                except GlAccount.DoesNotExist:
                    failed.append({'loan_account_id': loan_id, 'error': 'Bank account not found.'})
                    continue

            try:
                with db_transaction.atomic():
                    total_outstanding = Decimal(str(loan.total_outstanding))

                    # Mirror the payable_now logic from the individual repay action:
                    # cap payment at overdue + next-pending dues so that any surplus
                    # is routed to savings, not silently applied to future installments.
                    overdue_due = Decimal('0.00')
                    for s in loan.repayment_schedule.filter(status__in=['overdue', 'partial']):
                        overdue_due += Decimal(str(s.total_due)) - Decimal(str(s.total_paid))

                    next_pending = (
                        loan.repayment_schedule
                        .filter(status='pending')
                        .order_by('due_date')
                        .first()
                    )
                    next_pending_due = (
                        Decimal(str(next_pending.total_due)) - Decimal(str(next_pending.total_paid))
                        if next_pending else Decimal('0.00')
                    )

                    has_schedule = loan.repayment_schedule.exists()
                    if has_schedule and (overdue_due + next_pending_due) > Decimal('0.00'):
                        payable_now = min(
                            (overdue_due + next_pending_due).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
                            total_outstanding,
                        )
                    else:
                        payable_now = total_outstanding

                    if total_outstanding > Decimal('0.00') and amount > total_outstanding:
                        excess = (amount - total_outstanding).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        payment_amount = total_outstanding
                    elif payable_now > Decimal('0.00') and amount > payable_now:
                        excess = (amount - payable_now).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        payment_amount = payable_now
                    else:
                        excess = Decimal('0.00')
                        payment_amount = amount

                    spillover_savings = None
                    if excess > Decimal('0.00'):
                        from savings.models import SavingsAccount as SavAcct
                        spillover_savings = (
                            SavAcct.objects
                            .filter(client=loan.client, status='active')
                            .order_by('opened_on')
                            .first()
                        )

                    loan.record_payment(
                        amount=payment_amount,
                        payment_date=payment_date,
                        payment_account=payment_account,
                        received_by=request.user,
                        spillover_savings_account=spillover_savings,
                        spillover_amount=excess if spillover_savings else Decimal('0.00'),
                    )

                    succeeded += 1
            except Exception as exc:
                failed.append({'loan_account_id': loan_id, 'error': str(exc)})

        return Response({'succeeded': succeeded, 'failed': failed})

    @action(detail=True, methods=['post'], url_path='request-disbursement')
    def request_disbursement(self, request, pk=None):
        """
        Create a disbursement request for an approved loan.

        If an active request already exists (pending_approval or approved) it is
        returned as-is so the UI can navigate to it without creating duplicates.
        """
        from .models import LoanDisbursement

        loan = self.get_object()
        if loan.status != 'approved':
            return Response(
                {'detail': f"Only approved loans can request disbursement (loan is '{loan.status}')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Handle existing record — OneToOneField means only one row can exist per loan.
        try:
            existing = loan.disbursement_request
        except LoanDisbursement.DoesNotExist:
            existing = None

        if existing is not None:
            if existing.status in ('pending_approval', 'approved'):
                # Already has an active request — return it as-is.
                return Response(
                    LoanDisbursementSerializer(existing, context={'request': request}).data,
                    status=status.HTTP_200_OK,
                )

            if existing.status == 'disbursed':
                return Response(
                    {'detail': 'This loan has already been disbursed.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            # Rejected or cancelled — re-open for BM re-approval.
            # Keep requested_by as the original loan creator; reset approval fields.
            tenant, branch = _resolve_scope(request.user, loan)
            existing.status = 'pending_approval'
            existing.rejection_reason = ''
            existing.approved_by = None
            existing.approved_at = None
            existing.notes = request.data.get('notes', existing.notes)
            # Back-fill tenant/branch if they were missing
            if existing.tenant is None and tenant:
                existing.tenant = tenant
            if existing.branch is None and branch:
                existing.branch = branch
            update_fields = [
                'status', 'rejection_reason',
                'approved_by', 'approved_at', 'notes', 'tenant', 'branch', 'updated_at',
            ]
            existing.save(update_fields=update_fields)
            return Response(
                LoanDisbursementSerializer(existing, context={'request': request}).data,
                status=status.HTTP_200_OK,
            )

        # Fallback: signal should have created this at loan approval, but create
        # manually if missing. requested_by is always the loan creator.
        tenant, branch = _resolve_scope(request.user, loan)
        disbursement = LoanDisbursement.objects.create(
            loan=loan,
            requested_by=loan.created_by or request.user,
            notes=request.data.get('notes', ''),
            owner=request.user,
            branch=branch,
            tenant=tenant,
        )
        return Response(
            LoanDisbursementSerializer(disbursement, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='request-savings-repayment')
    def request_savings_repayment(self, request, pk=None):
        """
        Submit a savings-debit repayment request for director approval.

        Body: {amount, savings_account_id, payment_date (optional), notes (optional)}
        """
        from decimal import Decimal
        from django.utils import timezone
        from savings.models import SavingsAccount as SavAcct
        from .models import LoanRepaymentRequest

        loan = self.get_object()
        if loan.status not in ('active', 'disbursed', 'defaulted'):
            return Response(
                {'detail': f"Cannot request repayment on a '{loan.status}' loan."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount_raw = request.data.get('amount')
        if not amount_raw:
            return Response({'detail': 'amount is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(amount_raw))
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'detail': 'Amount must be positive.'}, status=status.HTTP_400_BAD_REQUEST)

        savings_account_id = request.data.get('savings_account_id')
        if not savings_account_id:
            return Response({'detail': 'savings_account_id is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            savings_account = SavAcct.objects.get(pk=savings_account_id)
        except SavAcct.DoesNotExist:
            return Response({'detail': 'Savings account not found.'}, status=status.HTTP_404_NOT_FOUND)

        if savings_account.client != loan.client:
            return Response(
                {'detail': 'Savings account does not belong to the loan client.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if amount > savings_account.available_balance:
            return Response(
                {'detail': f'Insufficient savings balance: available ₦{savings_account.available_balance}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        date_raw = request.data.get('payment_date')
        if date_raw:
            from datetime import date as dt_date
            try:
                payment_date = dt_date.fromisoformat(date_raw)
            except ValueError:
                payment_date = timezone.localdate()
        else:
            payment_date = timezone.localdate()

        tenant, branch = _resolve_scope(request.user, loan)
        repay_request = LoanRepaymentRequest.objects.create(
            loan=loan,
            savings_account=savings_account,
            amount=amount,
            payment_date=payment_date,
            requested_by=request.user,
            notes=request.data.get('notes', ''),
            owner=request.user,
            branch=branch,
            tenant=tenant,
        )

        return Response(
            LoanRepaymentRequestSerializer(repay_request, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )

    # ── CBN Compliance endpoints ──────────────────────────────────────────

    @action(detail=True, methods=['post'])
    def restructure(self, request, pk=None):
        """
        Restructure a loan — change terms, regenerate schedule from outstanding principal.

        Body:
          new_term              (int, required)
          new_term_unit         ('days'|'weeks'|'months', required)
          new_interest_rate     (Decimal, required)
          new_repayment_frequency ('daily'|'weekly'|'biweekly'|'monthly'|'quarterly', required)
          effective_date        (YYYY-MM-DD, optional — defaults to today)
          reason                (str, optional)
          notes                 (str, optional)
        """
        from decimal import Decimal
        from django.utils import timezone

        loan = self.get_object()

        required_fields = ['new_term', 'new_term_unit', 'new_interest_rate', 'new_repayment_frequency']
        for field in required_fields:
            if not request.data.get(field):
                return Response({'detail': f'{field} is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            new_term = int(request.data['new_term'])
            new_interest_rate = Decimal(str(request.data['new_interest_rate']))
        except (ValueError, TypeError):
            return Response({'detail': 'new_term must be an integer and new_interest_rate must be a number.'}, status=status.HTTP_400_BAD_REQUEST)

        effective_date_raw = request.data.get('effective_date')
        if effective_date_raw:
            from datetime import date
            try:
                effective_date = date.fromisoformat(effective_date_raw)
            except ValueError:
                return Response({'detail': 'Invalid effective_date. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            effective_date = timezone.localdate()

        try:
            restructure_record = loan.restructure(
                new_term=new_term,
                new_term_unit=request.data['new_term_unit'],
                new_interest_rate=new_interest_rate,
                new_repayment_frequency=request.data['new_repayment_frequency'],
                effective_date=effective_date,
                restructured_by=request.user,
                reason=request.data.get('reason', ''),
                notes=request.data.get('notes', ''),
            )
        except ValidationError as exc:
            return Response(
                {'detail': exc.message if hasattr(exc, 'message') else str(exc)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'restructure': LoanRestructureSerializer(restructure_record).data,
            'loan': LoanAccountDetailSerializer(loan, context={'request': request}).data,
        })

    @action(detail=True, methods=['get'])
    def statement(self, request, pk=None):
        """
        Return full loan statement data (for PDF rendering on frontend).
        Includes loan details, client, all schedule rows, all payments made.
        """
        loan = self.get_object()
        schedule = loan.repayment_schedule.all().order_by('installment_number')

        from django.db.models import Sum
        schedule_data = LoanRepaymentScheduleSerializer(schedule, many=True).data

        return Response({
            'loan': LoanAccountDetailSerializer(loan, context={'request': request}).data,
            'schedule': schedule_data,
            'summary': {
                'total_contractual_interest': str(
                    schedule.aggregate(t=Sum('interest_due'))['t'] or 0
                ),
                'interest_paid': str(loan.interest_paid),
                'interest_outstanding': str(loan.outstanding_interest),
                'principal_paid': str(loan.principal_paid),
                'principal_outstanding': str(loan.outstanding_principal),
                'total_paid': str(loan.total_paid),
                'restructure_count': loan.restructures.count(),
            },
        })

    @action(detail=False, methods=['get'], url_path='par-summary')
    def par_summary(self, request):
        """
        Backend-aggregated Portfolio at Risk (PAR) summary.
        Returns PAR buckets calculated on outstanding_principal (not just overdue amount)
        per CBN standard — the whole loan balance is at risk, not just the late portion.

        Query params:
          as_of (YYYY-MM-DD, optional)
        """
        from decimal import Decimal
        from django.db.models import Sum, Count

        qs = self.get_queryset().filter(
            status__in=['active', 'disbursed', 'defaulted'],
        )

        # Gross Loan Portfolio (excludes written-off)
        glp = qs.aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0')

        buckets = [
            ('current',      0,   0,   'Performing (0 DPD)'),
            ('par_1_29',     1,   29,  'Watch (1–29 DPD)'),
            ('par_30_89',    30,  89,  'Substandard (30–89 DPD)'),
            ('par_90_179',   90,  179, 'Doubtful (90–179 DPD)'),
            ('par_180_plus', 180, None,'Loss (180+ DPD)'),
        ]

        result = {'glp': str(glp), 'buckets': [], 'par_ratios': {}}
        npl_balance = Decimal('0')
        par30_balance = Decimal('0')

        for key, low, high, label in buckets:
            if high is None:
                bucket_qs = qs.filter(days_in_arrears__gte=low)
            elif low == 0:
                bucket_qs = qs.filter(days_in_arrears=0)
            else:
                bucket_qs = qs.filter(days_in_arrears__gte=low, days_in_arrears__lte=high)

            agg = bucket_qs.aggregate(balance=Sum('outstanding_principal'), count=Count('id'))
            balance = agg['balance'] or Decimal('0')
            count = agg['count'] or 0
            pct = (balance / glp * 100).quantize(Decimal('0.01')) if glp > 0 else Decimal('0')

            result['buckets'].append({
                'key': key,
                'label': label,
                'loan_count': count,
                'outstanding_balance': str(balance),
                'par_pct': str(pct),
            })

            if low >= 90:
                npl_balance += balance
            if low >= 30:
                par30_balance += balance

        result['par_ratios'] = {
            'par30': str((par30_balance / glp * 100).quantize(Decimal('0.01')) if glp > 0 else 0),
            'par90': str((npl_balance / glp * 100).quantize(Decimal('0.01')) if glp > 0 else 0),
            'npl_ratio': str((npl_balance / glp * 100).quantize(Decimal('0.01')) if glp > 0 else 0),
        }

        return Response(result)

    @action(detail=True, methods=['get'], url_path='transactions')
    def transactions(self, request, pk=None):
        """
        Return posted GL journal entry lines for this loan account.
        Debit entries represent disbursements/charges (increase loan balance).
        Credit entries represent repayments (decrease loan balance).
        Supports ?page=N&page_size=M for pagination.
        """
        from transactions.models import TransactionEntry, Transaction
        from decimal import Decimal as _D

        loan = self.get_object()
        gl_account = loan.account

        qs = (
            TransactionEntry.objects
            .filter(account=gl_account, transaction__approved=True)
            .select_related('transaction')
            .order_by('transaction__date', 'id')
        )

        try:
            page_size = min(int(request.query_params.get('page_size', 50)), 200)
            page = max(1, int(request.query_params.get('page', 1)))
        except (TypeError, ValueError):
            page_size, page = 50, 1

        total = qs.count()
        offset = (page - 1) * page_size
        entries = list(qs[offset: offset + page_size])

        # Compute opening balance = sum of all entries before this page
        opening = _D('0.00')
        if offset > 0:
            prior = qs[:offset]
            for e in prior:
                if e.side == TransactionEntry.DEBIT:
                    opening += e.amount
                else:
                    opening -= e.amount

        running_balance = opening
        rows = []
        for entry in entries:
            if entry.side == TransactionEntry.DEBIT:
                running_balance += entry.amount
            else:
                running_balance -= entry.amount
            rows.append({
                'id': entry.id,
                'date': entry.transaction.date,
                'reference': entry.transaction.reference_number,
                'description': entry.description or entry.transaction.description,
                'debit': str(entry.amount) if entry.side == TransactionEntry.DEBIT else None,
                'credit': str(entry.amount) if entry.side == TransactionEntry.CREDIT else None,
                'balance': str(running_balance),
            })

        return Response({
            'count': total,
            'page': page,
            'page_size': page_size,
            'results': rows,
        })

    @action(detail=False, methods=['get'], url_path='cbn-returns')
    def cbn_returns(self, request):
        """
        CBN Prudential Returns — monthly summary data.
        Returns loan classification breakdown, provisioning, key ratios.
        Intended to be copy-pasted / exported into the CBN MFB001/MFB002 forms.

        Query params:
          as_of (YYYY-MM-DD, optional)
        """
        from decimal import Decimal
        from django.db.models import Sum, Count
        from django.utils import timezone

        as_of_raw = request.query_params.get('as_of')
        if as_of_raw:
            from datetime import date
            try:
                as_of = date.fromisoformat(as_of_raw)
            except ValueError:
                as_of = timezone.localdate()
        else:
            as_of = timezone.localdate()

        all_loans = self.get_queryset()
        active_qs = all_loans.filter(status__in=['active', 'disbursed', 'defaulted'])
        written_off_qs = all_loans.filter(status='written_off')

        # Gross Loan Portfolio
        glp = active_qs.aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0')
        total_loans = active_qs.count()

        # Classification breakdown (CBN buckets)
        classifications = [
            ('performing',  Decimal('1.00'),  0,   0),
            ('watch',       Decimal('5.00'),  1,   29),
            ('substandard', Decimal('25.00'), 30,  89),
            ('doubtful',    Decimal('50.00'), 90,  179),
            ('loss',        Decimal('100.00'),180, None),
        ]

        classification_data = []
        total_required_provision = Decimal('0')
        total_interest_income_at_risk = Decimal('0')

        for label, pct, low, high in classifications:
            if label == 'performing':
                qs_f = active_qs.filter(days_in_arrears=0)
            elif high is None:
                qs_f = active_qs.filter(days_in_arrears__gte=low)
            else:
                qs_f = active_qs.filter(days_in_arrears__gte=low, days_in_arrears__lte=high)

            agg = qs_f.aggregate(
                balance=Sum('outstanding_principal'),
                interest=Sum('outstanding_interest'),
                count=Count('id'),
            )
            balance = agg['balance'] or Decimal('0')
            interest = agg['interest'] or Decimal('0')
            count = agg['count'] or 0
            required = (balance * pct / 100).quantize(Decimal('0.01'))
            total_required_provision += required
            if label in ('substandard', 'doubtful', 'loss'):
                total_interest_income_at_risk += interest

            classification_data.append({
                'classification': label,
                'provision_rate_pct': str(pct),
                'loan_count': count,
                'outstanding_principal': str(balance),
                'outstanding_interest': str(interest),
                'required_provision': str(required),
            })

        # Contractual interest receivable (total future interest from schedules)
        from .models import LoanRepaymentSchedule
        from django.db.models import F
        contractual_interest = LoanRepaymentSchedule.objects.filter(
            loan__in=active_qs,
            status__in=['pending', 'partial', 'overdue'],
        ).aggregate(t=Sum('interest_due'))['t'] or Decimal('0')

        # Written off this period (approximate — all written off loans)
        wo_agg = written_off_qs.aggregate(
            count=Count('id'),
        )

        return Response({
            'as_of': str(as_of),
            'gross_loan_portfolio': str(glp),
            'total_active_loans': total_loans,
            'classification_breakdown': classification_data,
            'total_required_provision': str(total_required_provision),
            'total_interest_income_at_risk': str(total_interest_income_at_risk),
            'contractual_interest_receivable': str(contractual_interest),
            'written_off_loan_count': wo_agg['count'],
            'par_30': str(
                sum(
                    Decimal(r['outstanding_principal'])
                    for r in classification_data
                    if r['classification'] in ('substandard', 'doubtful', 'loss')
                )
            ),
            'npl_ratio_pct': str(
                (sum(
                    Decimal(r['outstanding_principal'])
                    for r in classification_data
                    if r['classification'] in ('substandard', 'doubtful', 'loss')
                ) / glp * 100).quantize(Decimal('0.01')) if glp > 0 else Decimal('0')
            ),
        })

    @action(detail=False, methods=['get'], url_path='contractual-interest-summary')
    def contractual_interest_summary(self, request):
        """
        Dashboard widget: total contractual interest from all active loans.
        This is what the client sees as 'total income' — the full schedule interest,
        split into earned (paid) and receivable (future).
        """
        from decimal import Decimal
        from django.db.models import Sum
        from .models import LoanRepaymentSchedule

        active_qs = self.get_queryset().filter(
            status__in=['active', 'disbursed', 'defaulted']
        )

        schedule_qs = LoanRepaymentSchedule.objects.filter(loan__in=active_qs)

        total_interest_due = schedule_qs.aggregate(t=Sum('interest_due'))['t'] or Decimal('0')
        interest_collected = schedule_qs.aggregate(t=Sum('interest_paid'))['t'] or Decimal('0')
        interest_receivable = total_interest_due - interest_collected

        # Already posted to P&L via record_payment()
        earned_confirmed = active_qs.aggregate(t=Sum('interest_paid'))['t'] or Decimal('0')

        return Response({
            'total_contractual_interest': str(total_interest_due),
            'interest_collected': str(interest_collected),
            'interest_receivable': str(interest_receivable),
            'interest_suspended_loans': active_qs.filter(interest_suspended=True).count(),
            'interest_at_risk': str(
                schedule_qs.filter(
                    loan__interest_suspended=True,
                    status__in=['pending', 'partial', 'overdue'],
                ).aggregate(t=Sum('interest_due'))['t'] or Decimal('0')
            ),
        })

    def perform_create(self, serializer):
        """
        Before persisting a new loan:
        1. Enforce active savings requirements (hard-block).
        2. Auto-create the child GL (LOAN) account under the product's parent_account.
        3. Auto-generate a unique loan_number.
        4. Post all fee lines configured for posting_trigger='registration'.

        fee_routing (optional, from request.data):
            {
              "<fee_id>": {
                "destination": "cashier" | "savings",
                "savings_account_id": <int> | null
              }
            }
            Only consulted for fees with debit_destination='user_choice'.
        """
        import json
        import uuid
        from decimal import Decimal
        from django.db import transaction as db_transaction
        from django.utils import timezone as tz
        from accounts.models import Account as GlAccount
        from .services import check_savings_requirement, apply_loan_fees

        validated = serializer.validated_data
        client = validated.get('client')
        product = validated.get('product')  # LoanProduct instance
        requested_amount = Decimal(str(validated.get('requested_amount', '0') or '0'))

        if client and product:
            try:
                check_savings_requirement(client, product, requested_amount)
            except ValidationError as exc:
                raise DRFValidationError({'savings_requirement': exc.messages})

        # Parse fee_routing — may come in as a JSON string or already parsed dict
        raw_routing = self.request.data.get('fee_routing') or {}
        if isinstance(raw_routing, str):
            try:
                raw_routing = json.loads(raw_routing)
            except Exception:
                raw_routing = {}
        # Normalise keys to integers (JSON keys are always strings)
        fee_routing = {int(k): v for k, v in raw_routing.items() if str(k).isdigit()}

        user, branch, tenant = self._resolve_create_scope()

        with db_transaction.atomic():
            # Generate a unique loan number
            date_str = tz.localdate().strftime('%Y%m%d')
            loan_number = f"LN-{date_str}-{uuid.uuid4().hex[:6].upper()}"

            # Auto-create a child GL (LOAN) account under the product's parent account
            parent = product.parent_account
            if not parent:
                raise DRFValidationError({'detail': 'Loan product has no parent GL account configured.'})

            scope_filter = {}
            if branch:
                scope_filter['branch'] = branch
            if tenant:
                scope_filter['tenant'] = tenant

            parent_int = int(parent.code)
            candidate_code = None
            for seq in range(1, 10000):
                candidate = str(parent_int + seq)
                if not GlAccount.objects.filter(**scope_filter, code=candidate).exists():
                    candidate_code = candidate
                    break
            if not candidate_code:
                raise DRFValidationError({'detail': 'No available GL account codes for this loan product.'})

            gl_account = GlAccount.objects.create(
                code=candidate_code,
                name=f"{client.full_name} – {product.product.name}",
                account_type=GlAccount.LOAN,
                account_level=GlAccount.LEVEL_CHILD,
                parent=parent,
                allow_manual_entries=True,
                is_system_account=True,
                balance=Decimal('0.00'),
                owner=user,
                branch=branch,
                tenant=tenant,
            )

            loan = serializer.save(
                account=gl_account,
                loan_number=loan_number,
                interest_rate=product.default_interest_rate,
                branch=branch,
                tenant=tenant,
                owner=user,
            )

            # Only resolve cashier if at least one active registration fee
            # actually routes to the cashier.  Loans whose fees all go to
            # savings should not fail because no cashier account is configured.
            _needs_cashier = loan.product.fee_lines.filter(
                posting_trigger='registration',
                is_active=True,
                debit_destination__in=('cashier', 'user_choice'),
            ).exists()
            cashier_account = None
            if _needs_cashier:
                cashier_account = self._resolve_cashier_account(
                    loan,
                    cashier_account_id=self.request.data.get('cashier_account_id'),
                )

            # Post only fees configured for registration trigger
            try:
                apply_loan_fees(
                    loan,
                    trigger='registration',
                    posted_by=user,
                    cashier_account=cashier_account,
                    fee_routing=fee_routing,
                )
            except ValidationError as exc:
                raise DRFValidationError({'detail': exc.messages if hasattr(exc, 'messages') else str(exc)})

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)

        loan = serializer.instance
        response_data = LoanAccountDetailSerializer(loan, context={'request': request}).data

        warning = self._get_client_product_compat_warning(loan)
        if warning:
            response_data['warnings'] = [warning]

        headers = self.get_success_headers(serializer.data)
        return Response(response_data, status=status.HTTP_201_CREATED, headers=headers)


class LoanCollateralViewSet(ScopedModelViewSet):
    queryset = LoanCollateral.objects.all()
    serializer_class = LoanCollateralSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    officer_client_lookup = 'loan__client__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        loan_id = self.request.query_params.get('loan')
        if loan_id:
            qs = qs.filter(loan_id=loan_id)
        return qs


class LoanGuarantorViewSet(ScopedModelViewSet):
    queryset = LoanGuarantor.objects.all()
    serializer_class = LoanGuarantorSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    officer_client_lookup = 'loan__client__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        loan_id = self.request.query_params.get('loan')
        if loan_id:
            qs = qs.filter(loan_id=loan_id)
        return qs


class LoanVerificationRequestViewSet(ScopedModelViewSet):
    """
    Manage NIN-based loan verification checks.

    Actions:
      run_check  — (re)run the LoanVerifier against the client NIN and save results
      verdict    — BM/supervisor updates the verdict (pass/refer/decline)
    """
    queryset = LoanVerificationRequest.objects.select_related('loan', 'reviewed_by').all()
    serializer_class = LoanVerificationRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'head', 'options', 'post', 'patch']
    officer_client_lookup = 'loan__client__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        loan_id = self.request.query_params.get('loan')
        if loan_id:
            qs = qs.filter(loan_id=loan_id)
        verdict = self.request.query_params.get('verdict')
        if verdict:
            qs = qs.filter(verdict=verdict)
        return qs

    @action(detail=True, methods=['post'], url_path='run-check')
    def run_check(self, request, pk=None):
        """
        (Re-)run the NIN verification for this loan and persist results.
        Any staff member with branch access can trigger this.
        """
        vr = self.get_object()
        if not vr.loan.client:
            return Response({'detail': 'No client attached to this loan.'}, status=status.HTTP_400_BAD_REQUEST)

        verifier = LoanVerifier(vr.loan.client)
        result = verifier.run_full_check(current_branch=vr.branch)

        vr.nin_used = result['nin']
        vr.active_loans_elsewhere = result['active_loans_elsewhere']
        vr.total_active_exposure = result['total_active_exposure']
        vr.default_rate_pct = result['default_rate_pct']
        vr.flags = result['flags']
        vr.recommended_amount = result['recommended_amount']
        vr.verdict = 'pending'      # reset to pending after a re-run
        vr.reviewed_by = None
        vr.reviewed_at = None
        vr.save()

        serializer = self.get_serializer(vr)
        return Response(serializer.data)

    @action(detail=True, methods=['patch'], url_path='verdict')
    def update_verdict(self, request, pk=None):
        """
        BM/Supervisor records the final verdict: pass / refer / decline.
        """
        vr = self.get_object()
        new_verdict = request.data.get('verdict')
        allowed = [c[0] for c in LoanVerificationRequest.VERDICT_CHOICES]
        if new_verdict not in allowed:
            return Response(
                {'detail': f'verdict must be one of {allowed}.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        from django.utils import timezone
        vr.verdict = new_verdict
        vr.reviewed_by = request.user
        vr.reviewed_at = timezone.now()
        vr.save(update_fields=['verdict', 'reviewed_by', 'reviewed_at', 'updated_at'])
        return Response(self.get_serializer(vr).data)


class LoanDisbursementViewSet(ScopedModelViewSet):
    """
    Manage loan disbursement approval workflow.

    Actions:
      approve  — BM/supervisor approves the disbursement request (maker-checker enforced)
      execute  — Finance/teller executes the actual cash/bank disbursement
      reject   — Reject the disbursement request
    """
    queryset = LoanDisbursement.objects.select_related(
        'loan', 'loan__client', 'requested_by', 'approved_by',
        'disbursement_account', 'disbursement_account__bank_account',
        'disbursement_account__bank_account__bank',
    ).all()
    serializer_class = LoanDisbursementSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'head', 'options', 'post', 'patch']
    permission_module = 'loans'
    permission_page = 'loan-disbursements'
    officer_client_lookup = 'loan__client__assigned_officer'

    def get_queryset(self):
        qs = LoanDisbursement.all_objects.select_related(
            'loan', 'loan__client', 'requested_by', 'approved_by',
            'disbursement_account', 'disbursement_account__bank_account',
            'disbursement_account__bank_account__bank',
        ).filter(is_deleted=False)
        qs = _build_scoped_qs(qs, getattr(self.request, 'user', None))
        qs = self._apply_officer_scope(qs)
        loan_id = self.request.query_params.get('loan')
        if loan_id:
            qs = qs.filter(loan_id=loan_id)
        disburse_status = self.request.query_params.get('status')
        if disburse_status:
            qs = qs.filter(status=disburse_status)
        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve the disbursement (four-eyes principle enforced)."""
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-disbursements', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to approve disbursements.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        from .services import DisbursementService
        disbursement = self.get_object()
        try:
            DisbursementService.approve(disbursement, request.user)
        except ValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(disbursement).data)

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """Execute the disbursement — resolves GL account, posts entries, disburses the loan."""
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-disbursements', action='approve',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to execute disbursements.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        disbursement = self.get_object()

        disbursement_account_id = request.data.get('disbursement_account')
        notes = request.data.get('notes', '')

        if not disbursement_account_id:
            return Response(
                {'detail': 'disbursement_account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import DisbursementService, apply_loan_fees
        try:
            DisbursementService.execute(
                disbursement=disbursement,
                bank_account_id=disbursement_account_id,
                disbursed_by_user=request.user,
                notes=notes,
            )
        except ValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        # Post any disbursement-trigger fees (non-fatal — warn on failure)
        loan = disbursement.loan
        _fee_warnings = []
        if loan.product.fee_lines.filter(posting_trigger='disbursement', is_active=True).exists():
            _needs_cashier = loan.product.fee_lines.filter(
                posting_trigger='disbursement', is_active=True,
                debit_destination__in=('cashier', 'user_choice'),
            ).exists()
            _cashier_acct = None
            if _needs_cashier:
                try:
                    _cashier_acct = PaymentRoutingService.resolve_cashier_gl_account(
                        request.user, owner=loan.owner, branch=loan.branch,
                    )
                except ValidationError as exc:
                    _fee_warnings.append(
                        f"Could not resolve cashier for disbursement fees: {exc}. "
                        "Use the fee-apply endpoint to post them manually."
                    )
            if not _fee_warnings:
                try:
                    apply_loan_fees(
                        loan, 'disbursement',
                        posted_by=request.user,
                        cashier_account=_cashier_acct,
                    )
                except (ValidationError, Exception) as exc:
                    _fee_warnings.append(
                        f"Disbursement fees could not be posted: {exc}. "
                        "Use the fee-apply endpoint to retry."
                    )

        response_data = self.get_serializer(disbursement).data
        if _fee_warnings:
            response_data['warnings'] = _fee_warnings
        return Response(response_data)

    @action(detail=True, methods=['post'])
    def disburse(self, request, pk=None):
        """
        Approve and execute a disbursement in one step (maker-checker enforced).

        The person who requested the disbursement cannot be the one to disburse.
        Body: { disbursement_account: <bank_account_pk>, notes: '' }
        """
        disbursement = self.get_object()

        if disbursement.status != 'approved':
            return Response(
                {'detail': f"Only approved disbursements can be executed (current status: '{disbursement.status}')."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        disbursement_account_id = request.data.get('disbursement_account')
        if not disbursement_account_id:
            return Response(
                {'detail': 'disbursement_account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from .services import DisbursementService, apply_loan_fees
        from django.db import transaction as _dbtx

        try:
            with _dbtx.atomic():
                # Loan approval IS the disbursement approval (3-person flow).
                # Just execute — maker-checker (creator ≠ disburser, approver ≠ disburser)
                # is enforced inside execute_disbursement().
                DisbursementService.execute(
                    disbursement=disbursement,
                    bank_account_id=int(disbursement_account_id),
                    disbursed_by_user=request.user,
                    notes=request.data.get('notes', ''),
                )
        except ValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)

        # Post disbursement-trigger fees (non-fatal)
        loan = disbursement.loan
        _fee_warnings = []
        if loan.product.fee_lines.filter(posting_trigger='disbursement', is_active=True).exists():
            _needs_cashier = loan.product.fee_lines.filter(
                posting_trigger='disbursement', is_active=True,
                debit_destination__in=('cashier', 'user_choice'),
            ).exists()
            _cashier_acct = None
            if _needs_cashier:
                try:
                    _cashier_acct = PaymentRoutingService.resolve_cashier_gl_account(
                        request.user, owner=loan.owner, branch=loan.branch,
                    )
                except ValidationError as exc:
                    _fee_warnings.append(f"Could not resolve cashier for fees: {exc}.")
            if not _fee_warnings:
                try:
                    apply_loan_fees(loan, 'disbursement', posted_by=request.user, cashier_account=_cashier_acct)
                except Exception as exc:
                    _fee_warnings.append(f"Disbursement fees could not be posted: {exc}.")

        response_data = self.get_serializer(disbursement).data
        if _fee_warnings:
            response_data['warnings'] = _fee_warnings
        return Response(response_data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject the disbursement request."""
        try:
            from permissions.services import PermissionResolver
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-disbursements', action='reject',
            )
            if not effective.can_approve:
                return Response(
                    {'detail': 'You do not have permission to reject disbursements.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass  # Fail-open during rollout

        from .services import DisbursementService
        disbursement = self.get_object()
        reason = request.data.get('reason', '')
        try:
            DisbursementService.reject(disbursement, request.user, reason)
        except ValidationError as exc:
            msg = exc.message if hasattr(exc, 'message') else str(exc)
            return Response({'detail': msg}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(disbursement).data)



# ---------------------------------------------------------------------------
# Product fee configuration views
# ---------------------------------------------------------------------------

from .models import LoanProductFee, LoanProductSavingsRequirement, LoanFeeApplication
from .serializers import (
    LoanProductFeeSerializer,
    LoanProductSavingsRequirementSerializer,
    LoanFeeApplicationSerializer,
    FeePreviewer,
)
from .services import get_fee_preview, check_savings_requirement, apply_loan_fees


class LoanProductFeeViewSet(ScopedModelViewSet):
    """
    CRUD for dynamic fee lines on a loan product.
    Nested: GET/POST /api/loans/products/{product_pk}/fees/
    """
    serializer_class = LoanProductFeeSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = LoanProductFee.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        product_pk = self.kwargs.get('product_pk') or self.request.query_params.get('loan_product')
        if product_pk:
            qs = qs.filter(loan_product_id=product_pk)
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        return qs.order_by('order', 'name')

    def perform_create(self, serializer):
        product_pk = self.kwargs.get('product_pk') or self.request.data.get('loan_product')
        if product_pk and 'loan_product' not in serializer.validated_data:
            loan_product = LoanProduct.objects.get(pk=product_pk)
            serializer.save(loan_product=loan_product)
        else:
            serializer.save()


class LoanProductSavingsRequirementViewSet(ScopedModelViewSet):
    """
    CRUD for savings requirements on a loan product.
    Nested: GET/POST /api/loans/products/{product_pk}/savings-requirements/
    """
    serializer_class = LoanProductSavingsRequirementSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = LoanProductSavingsRequirement.objects.all()

    def get_queryset(self):
        qs = super().get_queryset()
        product_pk = self.kwargs.get('product_pk') or self.request.query_params.get('loan_product')
        if product_pk:
            qs = qs.filter(loan_product_id=product_pk)
        return qs

    def perform_create(self, serializer):
        serializer.save()


class LoanFeeApplicationViewSet(ScopedModelViewSet):
    """
    Read-only view of fee applications per loan account.
    GET /api/loans/accounts/{loan_pk}/fee-applications/
    POST /api/loans/accounts/{loan_pk}/fee-applications/apply/?trigger=disbursement
    """
    serializer_class = LoanFeeApplicationSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = LoanFeeApplication.objects.all()
    http_method_names = ['get', 'head', 'options', 'post']
    officer_client_lookup = 'loan_account__client__assigned_officer'

    def get_queryset(self):
        qs = super().get_queryset()
        loan_pk = self.kwargs.get('loan_pk') or self.request.query_params.get('loan_account')
        if loan_pk:
            qs = qs.filter(loan_account_id=loan_pk)
        return qs

    @action(detail=False, methods=['post'], url_path='apply')
    def apply(self, request, loan_pk=None):
        """Manually trigger fee posting for a given trigger (registration/approval/disbursement)."""
        from .models import LoanAccount
        loan_pk = loan_pk or request.data.get('loan_account') or request.query_params.get('loan_account')
        loan = LoanAccount.objects.get(pk=loan_pk)
        trigger = request.query_params.get('trigger', 'registration')
        if trigger not in ('registration', 'approval', 'disbursement'):
            return Response({'detail': 'trigger must be registration, approval or disbursement'}, status=400)

        cashier_account_id = request.data.get('cashier_account_id') or request.query_params.get('cashier_account_id')
        try:
            cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                request.user,
                owner=loan.owner,
                branch=loan.branch,
                cashier_account_id=cashier_account_id,
            )
        except ValidationError as exc:
            return Response({'detail': str(exc)}, status=400)

        fee_routing = request.data.get('fee_routing') or {}
        if isinstance(fee_routing, str):
            import json
            try:
                fee_routing = json.loads(fee_routing)
            except Exception:
                fee_routing = {}
        fee_routing = {int(k): v for k, v in fee_routing.items() if str(k).isdigit()}

        try:
            applications = apply_loan_fees(
                loan,
                trigger,
                posted_by=request.user,
                cashier_account=cashier_account,
                fee_routing=fee_routing,
            )
        except Exception as exc:
            return Response({'detail': str(exc)}, status=400)

        return Response(
            LoanFeeApplicationSerializer(applications, many=True).data,
            status=status.HTTP_200_OK,
        )


class FeesPreviewView(ScopedModelViewSet):
    """
    GET /api/loans/products/{product_pk}/fees/preview/?amount=500000
    Returns a list of calculated fee amounts for the given loan amount (no DB writes).
    """
    http_method_names = ['get', 'head', 'options']
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    queryset = LoanProductFee.objects.none()  # needed for router, not used

    def list(self, request, product_pk=None):
        from decimal import Decimal as D
        product_pk = product_pk or request.query_params.get('loan_product')
        amount_str = request.query_params.get('amount', '0')
        try:
            amount = D(amount_str)
        except Exception:
            return Response({'detail': 'Invalid amount.'}, status=400)

        loan_product = LoanProduct.objects.get(pk=product_pk)
        preview = get_fee_preview(loan_product, amount)
        return Response(FeePreviewer(preview, many=True).data)


class LoanRepaymentRequestViewSet(ScopedModelViewSet):
    """
    Director's inbox for pending savings-debit repayment requests.

    GET  /api/loans/repayment-requests/              — list (pending by default)
    POST /api/loans/repayment-requests/:id/approve/  — director posts GL
    POST /api/loans/repayment-requests/:id/reject/   — director rejects
    """
    queryset = LoanRepaymentRequest.objects.select_related(
        'loan', 'loan__client', 'savings_account', 'requested_by', 'reviewed_by',
    ).all()
    serializer_class = LoanRepaymentRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    officer_client_lookup = 'loan__client__assigned_officer'

    def get_queryset(self):
        qs = LoanRepaymentRequest.objects.select_related(
            'loan', 'loan__client', 'savings_account', 'requested_by', 'reviewed_by',
        ).all()
        qs = _build_scoped_qs(qs, getattr(self.request, 'user', None))
        qs = self._apply_officer_scope(qs)
        status_filter = self.request.query_params.get('status')
        if status_filter:
            qs = qs.filter(status=status_filter)
        return qs

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Director approves the request: posts the savings debit + loan repayment
        as a single atomic operation. Uses the savings account's GL account as
        the payment_account so no cash changes hands.
        """
        from decimal import Decimal, ROUND_HALF_UP
        from django.db import transaction as db_transaction
        from django.utils import timezone
        from .models import LoanRepaymentRequest

        req = self.get_object()

        if req.status != LoanRepaymentRequest.STATUS_PENDING:
            return Response(
                {'detail': f"Request is already '{req.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        loan = req.loan
        savings_account = req.savings_account
        amount = req.amount

        if loan.status not in ('active', 'disbursed', 'defaulted'):
            return Response(
                {'detail': f"Loan is '{loan.status}' — cannot record repayment."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if amount > savings_account.available_balance:
            return Response(
                {
                    'detail': (
                        f'Insufficient savings balance: '
                        f'available ₦{savings_account.available_balance}, '
                        f'requested ₦{amount}.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Cap at payable_now (overdue + next pending) so that no excess silently
        # pre-pays future installments. Since the source is savings, any uncapped
        # excess simply stays in the savings account — no additional GL movement needed.
        total_outstanding = Decimal(str(loan.total_outstanding))

        overdue_due = Decimal('0.00')
        for s in loan.repayment_schedule.filter(status__in=['overdue', 'partial']):
            overdue_due += Decimal(str(s.total_due)) - Decimal(str(s.total_paid))

        next_pending = (
            loan.repayment_schedule
            .filter(status='pending')
            .order_by('due_date')
            .first()
        )
        next_pending_due = (
            Decimal(str(next_pending.total_due)) - Decimal(str(next_pending.total_paid))
            if next_pending else Decimal('0.00')
        )

        has_schedule = loan.repayment_schedule.exists()
        if has_schedule and (overdue_due + next_pending_due) > Decimal('0.00'):
            payable_now = min(
                (overdue_due + next_pending_due).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP),
                total_outstanding,
            )
        else:
            payable_now = total_outstanding

        if total_outstanding > Decimal('0.00') and amount > total_outstanding:
            payment_amount = total_outstanding
        elif payable_now > Decimal('0.00') and amount > payable_now:
            payment_amount = payable_now
        else:
            payment_amount = amount

        try:
            with db_transaction.atomic():
                # Use savings GL account as payment source — DR: Savings (liability ↓), CR: Loan accounts
                journal = loan.record_payment(
                    amount=payment_amount,
                    payment_date=req.payment_date,
                    payment_account=savings_account.account,
                    received_by=request.user,
                )

                req.status = LoanRepaymentRequest.STATUS_POSTED
                req.reviewed_by = request.user
                req.reviewed_at = timezone.now()
                req.journal_entry = journal
                req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'journal_entry'])
        except Exception as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            LoanRepaymentRequestSerializer(req, context={'request': request}).data,
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        from django.utils import timezone
        from .models import LoanRepaymentRequest

        req = self.get_object()

        if req.status != LoanRepaymentRequest.STATUS_PENDING:
            return Response(
                {'detail': f"Request is already '{req.status}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        rejection_reason = request.data.get('rejection_reason', '').strip()
        if not rejection_reason:
            return Response(
                {'detail': 'rejection_reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req.status = LoanRepaymentRequest.STATUS_REJECTED
        req.reviewed_by = request.user
        req.reviewed_at = timezone.now()
        req.rejection_reason = rejection_reason
        req.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'rejection_reason'])

        return Response(
            LoanRepaymentRequestSerializer(req, context={'request': request}).data,
        )
