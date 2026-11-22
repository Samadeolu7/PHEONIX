from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ViewSet

from banks.models import BankAccount
from branches.models import Branch
from common.views import is_elevated_user
from loans.models import LoanAccount
from treasury.models import (
    BankBorrowing,
    BorrowingContribution,
    BorrowingInstalment,
    LiquidityDecision,
    TreasurySettings,
)
from treasury.serializers import (
    BorrowingDetailSerializer,
    BorrowingInputSerializer,
    BorrowingListSerializer,
    PaySerializer,
    QuoteSerializer,
    ReceiveSerializer,
    TreasurySettingsSerializer,
)
from treasury.services import borrowings as borrowing_service
from treasury.services import gate as liquidity_gate
from treasury.services.forecast import branch_forecast


def _tenant(user):
    return getattr(user, 'tenant', None)


def _require_director(user):
    if not is_elevated_user(user):
        raise PermissionDenied('Only directors (all-branches access) can do this.')


def _error(exc):
    if isinstance(exc, DjangoValidationError):
        return ValidationError(exc.message_dict if hasattr(exc, 'message_dict') else exc.messages)
    return exc


def _get_branch(user, pk):
    branch = Branch.all_objects.filter(pk=pk, tenant=_tenant(user), is_deleted=False).first()
    if branch is None:
        raise ValidationError({'branch': f'Branch {pk} not found.'})
    return branch


def _get_bank_account(user, pk):
    acct = BankAccount.all_objects.filter(
        pk=pk, tenant=_tenant(user), is_deleted=False).select_related('gl_account', 'bank').first()
    if acct is None:
        raise ValidationError({'bank_account': f'Bank account {pk} not found.'})
    return acct


def _jsonable_forecast(f):
    out = {k: v for k, v in f.items() if not k.startswith('_')}
    return out


class ForecastView(APIView):
    """GET /api/treasury/forecast/?branch=<id>&days=<n> - day-by-day cash forecast for a branch."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        branch_id = request.query_params.get('branch')
        if is_elevated_user(user):
            if not branch_id:
                raise ValidationError({'branch': 'branch is required.'})
            branch = _get_branch(user, branch_id)
        else:
            branch = getattr(user, 'branch', None)
            if branch is None or (branch_id and str(branch.pk) != str(branch_id)):
                raise PermissionDenied('You can only view your own branch.')
        days = request.query_params.get('days')
        try:
            days = int(days) if days else None
        except ValueError:
            raise ValidationError({'days': 'days must be a whole number.'})
        if days is not None and not 1 <= days <= 180:
            raise ValidationError({'days': 'days must be between 1 and 180.'})
        return Response(_jsonable_forecast(branch_forecast(branch, days=days)))


class LoanLiquidityCheckView(APIView):
    """
    GET /api/treasury/liquidity-check/loan/<loan_id>/?stage=approval|disbursement
    Read-only: can this loan be funded now, and what would paying it out do to upcoming payments?
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, loan_id):
        user = request.user
        loan = LoanAccount.all_objects.filter(
            pk=loan_id, tenant=_tenant(user), is_deleted=False).select_related('branch').first()
        if loan is None:
            raise NotFound('Loan not found.')
        if not is_elevated_user(user) and getattr(user, 'branch_id', None) != loan.branch_id:
            raise PermissionDenied('You can only check loans in your own branch.')
        stage = request.query_params.get('stage') or LiquidityDecision.STAGE_APPROVAL
        if stage not in (LiquidityDecision.STAGE_APPROVAL, LiquidityDecision.STAGE_DISBURSEMENT):
            raise ValidationError({'stage': 'stage must be approval or disbursement.'})

        assessment = liquidity_gate.assess_loan(loan, stage)
        override = LiquidityDecision.objects.filter(
            loan=loan, stage=LiquidityDecision.STAGE_APPROVAL, outcome=LiquidityDecision.OUTCOME_OVERRIDDEN,
        ).select_related('user').order_by('-created_at').first()
        if override is not None:
            # Same shape the disbursement gate puts in its 409 payload, so the UI renders one way.
            assessment['override'] = {
                'by': (override.user.get_full_name() or override.user.username) if override.user else None,
                'reason': override.reason, 'at': override.created_at,
                'available_then': override.available_today,
            }
        return Response({
            'stage': stage,
            'is_director': is_elevated_user(user),
            'assessment': assessment,
            'override': None if override is None else {
                'by': (override.user.get_full_name() or override.user.username) if override.user else None,
                'by_id': override.user_id,
                'reason': override.reason,
                'at': override.created_at,
            },
        })


class PendingApprovalsHeadsUpView(APIView):
    """
    GET /api/treasury/liquidity-check/pending-approvals/?branch=<id>

    Heads-up for approvers: do all loans waiting for approval in the branch fit in what it can lend today?
    Non-directors get their own branch. Directors may pass ?branch=; without it they get every branch that
    has loans waiting. Response: {is_director, branches: [heads-up, ...]}.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        user = request.user
        branch_id = request.query_params.get('branch')
        if is_elevated_user(user):
            if branch_id:
                branches = [_get_branch(user, branch_id)]
            else:
                ids = (LoanAccount.all_objects.filter(tenant=_tenant(user), is_deleted=False, status='pending')
                       .exclude(branch__isnull=True).values_list('branch_id', flat=True).distinct())
                branches = list(Branch.all_objects.filter(pk__in=list(ids), is_deleted=False).order_by('name'))
        else:
            branch = getattr(user, 'branch', None)
            if branch is None or (branch_id and str(branch.pk) != str(branch_id)):
                raise PermissionDenied('You can only view your own branch.')
            branches = [branch]
        return Response({
            'is_director': is_elevated_user(user),
            'branches': [liquidity_gate.pending_approvals_heads_up(b) for b in branches],
        })


class BankAccountChoicesView(APIView):
    """
    GET /api/treasury/bank-accounts/ - every active bank account in the tenant with its branch (directors only).
    Used by the borrowing form, which needs accounts for all branches at once regardless of the
    branch switcher (the regular bank-account list honours X-Branch-ID and would show one branch only).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        _require_director(request.user)
        qs = BankAccount.all_objects.filter(
            tenant=_tenant(request.user), is_deleted=False, is_active=True, gl_account__isnull=False,
        ).select_related('bank', 'branch').order_by('branch__name', 'account_name')
        return Response([
            {'id': a.id, 'branch': a.branch_id, 'branch_name': a.branch.name if a.branch else '',
             'account_name': a.account_name, 'account_number': a.account_number,
             'bank_name': a.bank.bank_name if a.bank else ''}
            for a in qs
        ])


class TreasurySettingsView(APIView):
    """GET/PATCH /api/treasury/settings/ (PATCH: directors only)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(TreasurySettingsSerializer(TreasurySettings.get_for(_tenant(request.user))).data)

    def patch(self, request):
        _require_director(request.user)
        row = TreasurySettings.get_for(_tenant(request.user))
        ser = TreasurySettingsSerializer(row, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class BorrowingViewSet(ViewSet):
    """
    Directors only.
      GET  /api/treasury/borrowings/                     list
      GET  /api/treasury/borrowings/{id}/                detail (allocations, schedule, branch shares)
      POST /api/treasury/borrowings/preview/             schedule + per-branch shares, nothing saved
      POST /api/treasury/borrowings/quote/               cost of each interest method on the given terms
      POST /api/treasury/borrowings/                     create (draft)
      PUT  /api/treasury/borrowings/{id}/                edit (draft: everything; active: repayment terms
                                                         only, until an instalment/share is recorded)
      POST /api/treasury/borrowings/{id}/receive/        funds arrived: post receipt + distribute to branches
      POST /api/treasury/borrowings/contributions/{id}/send/      branch share sent to the debit branch
      POST /api/treasury/borrowings/instalments/{id}/record/      bank debited the instalment
    """
    permission_classes = [permissions.IsAuthenticated]

    def _qs(self, request):
        _require_director(request.user)
        return BankBorrowing.all_objects.filter(tenant=_tenant(request.user), is_deleted=False).select_related(
            'debit_branch', 'debit_bank_account')

    def list(self, request):
        qs = self._qs(request)
        if request.query_params.get('status'):
            qs = qs.filter(status=request.query_params['status'])
        return Response(BorrowingListSerializer(qs, many=True).data)

    def retrieve(self, request, pk=None):
        obj = self._qs(request).filter(pk=pk).first()
        if obj is None:
            raise NotFound()
        return Response(BorrowingDetailSerializer(obj).data)

    def _parse_input(self, request):
        _require_director(request.user)
        ser = BorrowingInputSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        debit_branch = _get_branch(request.user, d['debit_branch'])
        debit_bank = _get_bank_account(request.user, d['debit_bank_account'])
        allocations = [
            {'branch': _get_branch(request.user, a['branch']), 'amount': a['amount'],
             'bank_account': _get_bank_account(request.user, a['bank_account'])}
            for a in d['allocations']
        ]
        return d, debit_branch, debit_bank, allocations

    @staticmethod
    def _service_kwargs(request, d, debit_branch, debit_bank, allocations):
        return dict(
            user=request.user, lender_name=d['lender_name'], reference=d.get('reference', ''),
            principal=d['principal'], monthly_rate=d['monthly_rate'], tenor_months=d['tenor_months'],
            first_due_date=d['first_due_date'], debit_branch=debit_branch, debit_bank_account=debit_bank,
            allocations=allocations, contribution_lead_days=d.get('contribution_lead_days'),
            notes=d.get('notes', ''), interest_method=d['interest_method'],
            repayment_interval_months=d['repayment_interval_months'],
        )

    def create(self, request):
        d, debit_branch, debit_bank, allocations = self._parse_input(request)
        try:
            borrowing = borrowing_service.create_borrowing(
                **self._service_kwargs(request, d, debit_branch, debit_bank, allocations))
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(BorrowingDetailSerializer(borrowing).data, status=status.HTTP_201_CREATED)

    def update(self, request, pk=None):
        obj = self._qs(request).filter(pk=pk).first()
        if obj is None:
            raise NotFound()
        d, debit_branch, debit_bank, allocations = self._parse_input(request)
        try:
            borrowing = borrowing_service.update_borrowing(
                obj, **self._service_kwargs(request, d, debit_branch, debit_bank, allocations))
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(BorrowingDetailSerializer(borrowing).data)

    def quote(self, request):
        """Cost of every interest method on the given terms - no branches needed, nothing saved."""
        _require_director(request.user)
        ser = QuoteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        return Response({'options': borrowing_service.quote(
            d['principal'], d['monthly_rate'], d['tenor_months'], d['repayment_interval_months'])})

    def preview(self, request):
        d, debit_branch, debit_bank, allocations = self._parse_input(request)
        settings_row = TreasurySettings.get_for(_tenant(request.user))
        lead = d.get('contribution_lead_days')
        if lead is None:
            lead = settings_row.default_contribution_lead_days
        total = sum(a['amount'] for a in allocations)
        try:
            rows = borrowing_service.preview_schedule(
                d['principal'], d['monthly_rate'], d['tenor_months'], d['first_due_date'],
                allocations=[{'branch_id': a['branch'].pk, 'amount': a['amount']} for a in allocations],
                debit_branch_id=debit_branch.pk, lead_days=lead, interest_method=d['interest_method'],
                repayment_interval_months=d['repayment_interval_months'],
            )
        except DjangoValidationError as exc:
            raise _error(exc)
        names = {a['branch'].pk: a['branch'].name for a in allocations}
        for row in rows:
            for c in row['contributions']:
                c['branch_name'] = names.get(c['branch_id'])
        return Response({
            'allocation_total': total,
            'allocation_matches_principal': total == d['principal'],
            'total_repayment': sum(r['total_due'] for r in rows),
            'total_interest': sum(r['interest_due'] for r in rows),
            'contribution_lead_days': lead,
            'instalments': rows,
        })

    def destroy(self, request, pk=None):
        obj = self._qs(request).filter(pk=pk).first()
        if obj is None:
            raise NotFound()
        try:
            borrowing_service.delete_draft_borrowing(obj, request.user)
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def receive(self, request, pk=None):
        obj = self._qs(request).filter(pk=pk).first()
        if obj is None:
            raise NotFound()
        ser = ReceiveSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            obj = borrowing_service.receive_borrowing(obj, request.user, ser.validated_data.get('received_on'))
        except DjangoValidationError as exc:
            raise _error(exc)
        return Response(BorrowingDetailSerializer(obj).data)

    def send_contribution(self, request, pk=None):
        _require_director(request.user)
        c = BorrowingContribution.all_objects.filter(pk=pk, tenant=_tenant(request.user)).first()
        if c is None:
            raise NotFound()
        ser = PaySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            borrowing_service.send_contribution(c, request.user, ser.validated_data.get('paid_on'))
        except DjangoValidationError as exc:
            raise _error(exc)
        borrowing = BankBorrowing.all_objects.get(pk=c.instalment.borrowing_id)
        return Response(BorrowingDetailSerializer(borrowing).data)

    def record_instalment(self, request, pk=None):
        _require_director(request.user)
        inst = BorrowingInstalment.all_objects.filter(pk=pk, tenant=_tenant(request.user)).first()
        if inst is None:
            raise NotFound()
        ser = PaySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            borrowing_service.record_instalment(inst, request.user, ser.validated_data.get('paid_on'))
        except DjangoValidationError as exc:
            raise _error(exc)
        borrowing = BankBorrowing.all_objects.get(pk=inst.borrowing_id)
        return Response(BorrowingDetailSerializer(borrowing).data)
