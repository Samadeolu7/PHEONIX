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
    LoanVerificationRequest, LoanDisbursement,
)
from .serializers import (
    LoanProductSerializer,
    LoanAccountListSerializer, LoanAccountDetailSerializer, LoanAccountCreateSerializer,
    LoanRepaymentScheduleSerializer, LoanCollateralSerializer, LoanGuarantorSerializer,
    LoanVerificationRequestSerializer, LoanDisbursementSerializer,
)
from .utils import LoanVerifier


class LoanProductViewSet(ScopedModelViewSet):
    """CRUD for loan products (DC, Weekly, Monthly, etc.)."""
    queryset = LoanProduct.objects.all()
    serializer_class = LoanProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get_queryset(self):
        qs = super().get_queryset()
        is_active = self.request.query_params.get('is_active')
        if is_active is not None:
            qs = qs.filter(is_active=is_active.lower() == 'true')
        freq = self.request.query_params.get('repayment_frequency')
        if freq:
            qs = qs.filter(repayment_frequency=freq)
        return qs


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
    permission_module = 'loans'
    permission_page = 'loan-accounts'

    def get_serializer_class(self):
        if self.action == 'list':
            return LoanAccountListSerializer
        if self.action == 'create':
            return LoanAccountCreateSerializer
        return LoanAccountDetailSerializer

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
            qs = qs.filter(loan_number__icontains=search)

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

        # Post approval-trigger fees to GL
        from .services import apply_loan_fees
        try:
            apply_loan_fees(loan, trigger='approval', posted_by=request.user)
        except Exception as exc:
            logger.error('Approval fee posting failed for loan %s: %s', loan.pk, exc)

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

    def perform_create(self, serializer):
        """
        Before persisting a new loan, enforce any active savings requirements
        configured on the loan product (hard-block check).
        """
        from decimal import Decimal
        from .services import check_savings_requirement

        validated = serializer.validated_data
        client = validated.get('client')
        product = validated.get('product')
        requested_amount = Decimal(str(validated.get('requested_amount', '0') or '0'))

        if client and product:
            try:
                check_savings_requirement(client, product, requested_amount)
            except ValidationError as exc:
                raise DRFValidationError({'savings_requirement': exc.messages})

        serializer.save()


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
    queryset = LoanDisbursement.objects.select_related('loan', 'requested_by', 'approved_by').all()
    serializer_class = LoanDisbursementSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'head', 'options', 'post', 'patch']
    permission_module = 'loans'
    permission_page = 'loan-disbursements'

    def get_queryset(self):
        qs = super().get_queryset()
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

        disbursement = self.get_object()
        try:
            disbursement.approve_disbursement(request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(self.get_serializer(disbursement).data)

    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """Execute the disbursement — posts the GL entries and disburses the loan."""
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal
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

        # Approval limit check against disbursement amount
        try:
            from permissions.services import PermissionResolver
            from decimal import Decimal
            effective = PermissionResolver.resolve(
                request.user, module='loans', page='loan-disbursements', action='approve',
            )
            if effective.approval_limit is not None:
                amount = getattr(disbursement, 'amount', None) or getattr(disbursement, 'disbursement_amount', None) or 0
                if Decimal(str(amount)) > Decimal(str(effective.approval_limit)):
                    return Response(
                        {'detail': f'Disbursement amount {amount} exceeds your approval limit of {effective.approval_limit}.'},
                        status=status.HTTP_403_FORBIDDEN,
                    )
        except Exception:
            pass

        disbursement_account_id = request.data.get('disbursement_account')
        notes = request.data.get('notes', '')

        if not disbursement_account_id:
            return Response(
                {'detail': 'disbursement_account is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from banks.models import BankAccount
        try:
            bank_account = BankAccount.objects.get(pk=disbursement_account_id)
        except BankAccount.DoesNotExist:
            return Response({'detail': 'Bank account not found.'}, status=status.HTTP_404_NOT_FOUND)

        try:
            disbursement.execute_disbursement(
                disbursed_by_user=request.user,
                disbursement_bank_account=bank_account,
                notes=notes,
            )
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)

        # Post disbursement-trigger fees to GL
        from .services import apply_loan_fees
        try:
            apply_loan_fees(disbursement.loan, trigger='disbursement', posted_by=request.user)
        except Exception as exc:
            logger.error('Disbursement fee posting failed for loan %s: %s', disbursement.loan_id, exc)

        return Response(self.get_serializer(disbursement).data)

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

        disbursement = self.get_object()
        if disbursement.status not in ('pending_approval',):
            return Response(
                {'detail': 'Only pending disbursements can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        reason = request.data.get('reason', '')
        disbursement.status = 'rejected'
        disbursement.rejection_reason = reason
        disbursement.save(update_fields=['status', 'rejection_reason', 'updated_at'])
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

    def get_queryset(self):
        qs = super().get_queryset()
        loan_pk = self.kwargs.get('loan_pk') or self.request.query_params.get('loan_account')
        if loan_pk:
            qs = qs.filter(loan_account_id=loan_pk)
        return qs

    @action(detail=False, methods=['post'], url_path='apply')
    def apply(self, request, loan_pk=None):
        """Manually trigger fee posting for a given trigger (approval/disbursement)."""
        from .models import LoanAccount
        loan_pk = loan_pk or request.data.get('loan_account') or request.query_params.get('loan_account')
        loan = LoanAccount.objects.get(pk=loan_pk)
        trigger = request.query_params.get('trigger', 'disbursement')
        if trigger not in ('approval', 'disbursement'):
            return Response({'detail': 'trigger must be approval or disbursement'}, status=400)

        try:
            applications = apply_loan_fees(loan, trigger, posted_by=request.user)
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
