"""
Portal HTTP layer.

Customer views (``/api/portal/...``)
    authentication_classes = [PortalSessionAuthentication] ONLY — a staff
    JWT is never accepted here, and a portal cookie is never accepted by any
    staff view (staff views use the project default classes, which don't
    know about it).

Staff views (``/api/portal/staff/...``)
    Normal staff authentication + the 'loans' / 'online-loan-applications'
    page permission, tenant-filtered and branch-scoped like every other ERP
    list.
"""
import logging

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import Q
from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from branches.models import Branch
from common.views import ScopedModelViewSet

from . import services
from .authentication import (
    PortalAnonThrottle, PortalApplyThrottle, PortalLoginThrottle, PortalPasswordResetThrottle,
    PortalRegisterThrottle, PortalSessionAuthentication, PortalVerifyThrottle,
    clear_session_cookie, cookie_name, enforce_csrf_header, set_session_cookie,
)
from .models import OnlineLoanApplication, PortalLoanOffering, PortalSession, hash_token
from .serializers import (
    ApplicationCreateSerializer, ApplicationCustomerSerializer, ChangePasswordSerializer,
    CustomerSerializer, EmailOnlySerializer, LoginSerializer, MatchingClientSerializer,
    PublicBranchSerializer, PublicOfferingSerializer, RegisterSerializer, ResetPasswordSerializer,
    StaffApplicationDetailSerializer, StaffApplicationListSerializer, StaffConvertSerializer,
    StaffRejectSerializer, TokenSerializer,
)

logger = logging.getLogger('portal')

GENERIC_LOGIN_ERROR = 'Incorrect email or password, or the account is temporarily locked.'
GENERIC_EMAIL_SENT = 'If an account exists for that email, we have sent instructions to it.'


def _django_errors(exc: DjangoValidationError):
    if hasattr(exc, 'message_dict'):
        return exc.message_dict
    return {'detail': exc.messages}


def revoke_cookie_session(request):
    """Revoke whatever session the browser's cookie points at (valid or not)."""
    raw = request.COOKIES.get(cookie_name())
    if raw:
        PortalSession.objects.filter(token_hash=hash_token(raw), revoked_at__isnull=True).update(
            revoked_at=timezone.now(),
        )


def portal_exception_handler(exc, context):
    """
    The project-wide handler turns unexpected errors into 400s that echo the
    raw database message back to the caller.  That's tolerable for staff but
    not for the public internet: here, anything DRF doesn't already handle
    becomes a generic 500 and the details go only to the server log.
    """
    from rest_framework.views import exception_handler as drf_exception_handler
    response = drf_exception_handler(exc, context)
    if response is not None:
        return response
    logger.exception('Unhandled error in portal view %s', context.get('view').__class__.__name__)
    return Response(
        {'detail': 'Something went wrong on our side. Please try again later.'},
        status=status.HTTP_500_INTERNAL_SERVER_ERROR,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Base classes
# ─────────────────────────────────────────────────────────────────────────────

class PortalBaseView(APIView):
    """
    Resolves the tenant (from the domain / middleware) and its PortalConfig.
    The portal does not exist for a tenant that has not enabled it: 404.
    """
    authentication_classes = [PortalSessionAuthentication]
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PortalAnonThrottle]

    def initial(self, request, *args, **kwargs):
        tenant = getattr(request._request, 'tenant', None)
        self.portal_config = services.get_enabled_config(tenant)
        if self.portal_config is None:
            raise Http404()
        self.tenant = tenant
        # Login-CSRF protection for anonymous POSTs too (login, register, ...).
        enforce_csrf_header(request)
        super().initial(request, *args, **kwargs)

    def get_exception_handler(self):
        return portal_exception_handler

    def finalize_response(self, request, response, *args, **kwargs):
        response = super().finalize_response(request, response, *args, **kwargs)
        # Personal/financial data must never be cached by browsers or proxies.
        response['Cache-Control'] = 'no-store'
        response['Pragma'] = 'no-cache'
        return response


class PortalAuthenticatedView(PortalBaseView):
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [PortalAnonThrottle]

    @property
    def customer(self):
        return self.request.user


# ─────────────────────────────────────────────────────────────────────────────
# Public catalogue
# ─────────────────────────────────────────────────────────────────────────────

def _live_offerings(tenant):
    return (
        PortalLoanOffering.objects.filter(
            tenant=tenant, is_active=True,
            loan_product__tenant=tenant, loan_product__is_deleted=False,
            loan_product__product__is_active=True,
        )
        .select_related('loan_product', 'loan_product__product')
    )


def _live_branches(tenant):
    return Branch.objects.filter(tenant=tenant, is_active=True, is_deleted=False).order_by('name')


class PortalInfoView(PortalBaseView):
    def get(self, request):
        cfg = self.portal_config
        return Response({
            'organisation': self.tenant.name,
            'allow_registration': cfg.allow_registration,
            'support_phone': cfg.support_phone,
            'support_email': cfg.support_email,
            'terms_url': cfg.terms_url,
            'privacy_url': cfg.privacy_url,
        })


class PortalProductsView(PortalBaseView):
    def get(self, request):
        return Response(PublicOfferingSerializer(_live_offerings(self.tenant), many=True).data)


class PortalBranchesView(PortalBaseView):
    def get(self, request):
        data = [
            {'id': b.id, 'name': b.name, 'city': b.city or '', 'state': b.state or ''}
            for b in _live_branches(self.tenant)
        ]
        return Response(PublicBranchSerializer(data, many=True).data)


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────

class RegisterView(PortalBaseView):
    throttle_classes = [PortalRegisterThrottle]

    def post(self, request):
        if not self.portal_config.allow_registration:
            raise PermissionDenied('Online registration is currently closed.')
        ser = RegisterSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        try:
            services.register_customer(
                tenant=self.tenant, email=d['email'], phone=d['phone'],
                first_name=d['first_name'], last_name=d['last_name'],
                password=d['password'], request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError({'password': exc.messages})
        # Identical response whether the email was new or already registered.
        return Response(
            {'detail': 'Account created. Check your email for a link to verify your address.'},
            status=status.HTTP_201_CREATED,
        )


class VerifyEmailView(PortalBaseView):
    throttle_classes = [PortalVerifyThrottle]

    def post(self, request):
        ser = TokenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        customer = services.verify_email(tenant=self.tenant, token=ser.validated_data['token'], request=request)
        if customer is None:
            raise ValidationError({'token': 'This verification link is invalid or has expired.'})
        return Response({'detail': 'Email verified. You can now apply for a loan.'})


class ResendVerificationView(PortalBaseView):
    throttle_classes = [PortalPasswordResetThrottle]

    def post(self, request):
        ser = EmailOnlySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.resend_verification(tenant=self.tenant, email=ser.validated_data['email'])
        return Response({'detail': GENERIC_EMAIL_SENT})


class LoginView(PortalBaseView):
    throttle_classes = [PortalLoginThrottle]

    def post(self, request):
        ser = LoginSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        # Session fixation: drop any session already on this browser.
        revoke_cookie_session(request)
        try:
            customer, _session, raw = services.authenticate_customer(
                tenant=self.tenant, email=ser.validated_data['email'],
                password=ser.validated_data['password'], request=request,
            )
        except services.LoginFailed:
            return Response({'detail': GENERIC_LOGIN_ERROR}, status=status.HTTP_401_UNAUTHORIZED)
        response = Response({'customer': CustomerSerializer(customer).data})
        set_session_cookie(response, raw)
        return response



class LogoutView(PortalBaseView):
    def post(self, request):
        if getattr(request, 'portal_session', None) is not None:
            services.audit('logout', request=request, customer=request.portal_session.customer)
        revoke_cookie_session(request)
        response = Response({'detail': 'Signed out.'})
        clear_session_cookie(response)
        return response


class PasswordResetRequestView(PortalBaseView):
    throttle_classes = [PortalPasswordResetThrottle]

    def post(self, request):
        ser = EmailOnlySerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        services.request_password_reset(tenant=self.tenant, email=ser.validated_data['email'], request=request)
        return Response({'detail': GENERIC_EMAIL_SENT})


class PasswordResetConfirmView(PortalBaseView):
    throttle_classes = [PortalVerifyThrottle]

    def post(self, request):
        ser = ResetPasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            customer = services.reset_password(
                tenant=self.tenant, token=ser.validated_data['token'],
                new_password=ser.validated_data['new_password'], request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError({'new_password': exc.messages})
        if customer is None:
            raise ValidationError({'token': 'This reset link is invalid or has expired.'})
        response = Response({'detail': 'Password updated. Please log in with your new password.'})
        clear_session_cookie(response)
        return response


class MeView(PortalAuthenticatedView):
    def get(self, request):
        return Response(CustomerSerializer(self.customer).data)

    def patch(self, request):
        ser = CustomerSerializer(self.customer, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        return Response(ser.data)


class ChangePasswordView(PortalAuthenticatedView):
    throttle_classes = [PortalLoginThrottle]

    def post(self, request):
        ser = ChangePasswordSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            services.change_password(
                customer=self.customer, request=request, **ser.validated_data,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        response = Response({'detail': 'Password changed. Please log in again.'})
        clear_session_cookie(response)
        return response


# ─────────────────────────────────────────────────────────────────────────────
# Applications — customer
# ─────────────────────────────────────────────────────────────────────────────

class ApplicationListCreateView(PortalAuthenticatedView):
    def get_throttles(self):
        if self.request.method == 'POST':
            return [PortalApplyThrottle()]
        return super().get_throttles()

    def get(self, request):
        apps = (
            OnlineLoanApplication.objects.filter(customer=self.customer, tenant=self.tenant)
            .select_related('branch', 'offering', 'loan_product__product')
        )
        return Response(ApplicationCustomerSerializer(apps, many=True).data)

    def post(self, request):
        ser = ApplicationCreateSerializer(
            data=request.data,
            context={'offerings': _live_offerings(self.tenant), 'branches': _live_branches(self.tenant)},
        )
        ser.is_valid(raise_exception=True)
        try:
            app = services.submit_application(
                customer=self.customer, config=self.portal_config,
                validated=dict(ser.validated_data), request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(ApplicationCustomerSerializer(app).data, status=status.HTTP_201_CREATED)


class ApplicationDetailView(PortalAuthenticatedView):
    def get_object(self, reference):
        # Scoped to the logged-in customer: someone else's reference is a 404,
        # indistinguishable from one that doesn't exist.
        return get_object_or_404(
            OnlineLoanApplication.objects.select_related('branch', 'offering', 'loan_product__product'),
            reference=reference, customer=self.customer, tenant=self.tenant,
        )

    def get(self, request, reference):
        return Response(ApplicationCustomerSerializer(self.get_object(reference)).data)


class ApplicationWithdrawView(ApplicationDetailView):
    def get(self, request, reference):
        raise MethodNotAllowed('GET')

    def post(self, request, reference):
        app = self.get_object(reference)
        try:
            app = services.withdraw_application(application=app, request=request)
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(ApplicationCustomerSerializer(app).data)


# ─────────────────────────────────────────────────────────────────────────────
# Staff review
# ─────────────────────────────────────────────────────────────────────────────

PERMISSION_MODULE = 'loans'
PERMISSION_PAGE = 'online-loan-applications'


def _require(user, *, flag, module=PERMISSION_MODULE, page=PERMISSION_PAGE):
    """Explicit, fail-closed permission check for state-changing staff actions."""
    from permissions.services import PermissionResolver
    try:
        eff = PermissionResolver.resolve(user, module=module, page=page)
        allowed = bool(getattr(eff, flag, False))
    except Exception:
        logger.exception('Permission resolution failed; denying')
        allowed = False
    if not allowed:
        raise PermissionDenied('You do not have permission to perform this action.')


class StaffOnlineApplicationViewSet(ScopedModelViewSet):
    """
    list / retrieve / start-review / reject / convert.  No create, update or
    delete — applications only ever come from the portal, and decisions are
    recorded through the explicit actions below.
    """
    queryset = OnlineLoanApplication.objects.select_related(
        'branch', 'loan_product__product', 'assigned_to', 'reviewed_by',
        'converted_loan', 'converted_client', 'customer',
    )
    permission_module = PERMISSION_MODULE
    permission_page = PERMISSION_PAGE
    http_method_names = ['get', 'post', 'head', 'options']

    def get_serializer_class(self):
        if self.action == 'list':
            return StaffApplicationListSerializer
        return StaffApplicationDetailSerializer

    def get_narrow_scope_q(self, scope, user, staff):
        # "Mine" for this page = applications assigned to me.
        return Q(assigned_to=user)

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        # Never rely solely on the generic scoping for tenant isolation:
        # a staff user without a tenant sees nothing (unless system admin).
        if tenant is None and not getattr(user, 'is_system_admin', False):
            return OnlineLoanApplication.objects.none()
        qs = super().get_queryset()
        if tenant is not None:
            qs = qs.filter(tenant=tenant)
        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        search = (params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(reference__icontains=search) | Q(first_name__icontains=search)
                | Q(last_name__icontains=search) | Q(phone_primary__icontains=search)
                | Q(email__icontains=search)
            )
        return qs

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    @action(detail=True, methods=['get'], url_path='matching-clients')
    def matching_clients(self, request, pk=None):
        app = self.get_object()
        matches = services.find_matching_clients(app)
        return Response(MatchingClientSerializer(matches, many=True, context={'application': app}).data)

    @action(detail=True, methods=['post'], url_path='start-review')
    def start_review(self, request, pk=None):
        _require(request.user, flag='can_edit')
        app = self.get_object()
        try:
            app = services.start_review(application=app, staff_user=request.user, request=request)
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffApplicationDetailSerializer(app).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        _require(request.user, flag='can_approve')
        app = self.get_object()
        ser = StaffRejectSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            app = services.reject_application(
                application=app, staff_user=request.user, request=request, **ser.validated_data,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffApplicationDetailSerializer(app).data)

    @action(detail=True, methods=['post'])
    def convert(self, request, pk=None):
        _require(request.user, flag='can_approve')
        # Converting creates a loan application in the ERP, so the reviewer
        # must also be allowed to create loans.
        _require(request.user, flag='can_create', page='loan-accounts')
        app = self.get_object()
        ser = StaffConvertSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        fee_routing = {int(k): v for k, v in (d.get('fee_routing') or {}).items() if str(k).isdigit()}
        try:
            app = services.convert_application(
                application=app, staff_user=request.user,
                client_id=d.get('client_id'), create_new_client=d.get('create_new_client', False),
                cashier_account_id=d.get('cashier_account_id'), fee_routing=fee_routing,
                staff_notes=d.get('staff_notes', ''), request=request,
            )
        except services.ConversionConflict as exc:
            return Response(
                {
                    'detail': exc.message,
                    'code': 'client_match',
                    'matches': MatchingClientSerializer(exc.matches, many=True, context={'application': app}).data,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffApplicationDetailSerializer(app).data)
