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

from django.conf import settings as dj_settings
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
    PortalRegisterThrottle, PortalSessionAuthentication, PortalUploadThrottle, PortalVerifyThrottle,
    clear_session_cookie, cookie_name, enforce_csrf_header, set_session_cookie,
)
from .models import (
    OnlineApplicationDocument, OnlineLoanApplication, PortalLoanOffering, PortalSession, hash_token,
    PORTAL_DOC_MAX_MB,
)
from .serializers import (
    OfferingWriteSerializer, PortalSettingsSerializer,
    InvitationAcceptSerializer, StaffInvitationSerializer, StaffInviteCreateSerializer,
    CustomerDocumentSerializer, DocumentUploadSerializer,
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


class InvitationLookupView(PortalBaseView):
    """POST {token}: who is this invitation for? (lets the page greet them by name)."""
    throttle_classes = [PortalVerifyThrottle]

    def post(self, request):
        ser = TokenSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        inv = services.find_invitation(tenant=self.tenant, token=ser.validated_data['token'])
        if inv is None:
            raise ValidationError({'token': 'This invitation link is invalid, has expired or was already used.'})
        return Response({'first_name': inv.client.first_name, 'email': inv.email,
                         'expires_at': inv.expires_at})


class AcceptInvitationView(PortalBaseView):
    """POST {token, password, accept_terms}: create the linked account and sign in."""
    throttle_classes = [PortalVerifyThrottle]

    def post(self, request):
        ser = InvitationAcceptSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        revoke_cookie_session(request)
        try:
            customer, raw = services.accept_invitation(
                tenant=self.tenant, token=ser.validated_data['token'],
                password=ser.validated_data['password'], request=request,
            )
        except services.InvitationInvalid:
            raise ValidationError({'token': 'This invitation link is invalid, has expired or was already used.'})
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        response = Response({'customer': CustomerSerializer(customer).data}, status=status.HTTP_201_CREATED)
        set_session_cookie(response, raw)
        return response


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
            .prefetch_related('documents')
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
            OnlineLoanApplication.objects.select_related('branch', 'offering', 'loan_product__product')
            .prefetch_related('documents'),
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


class ApplicationDocumentsView(ApplicationDetailView):
    """
    POST multipart {document_type, file} to attach a document to your own
    open application. Size is rejected from Content-Length before the body
    is parsed, so an oversized upload never reaches memory or temp disk.
    """
    throttle_classes = [PortalAnonThrottle]

    def get_throttles(self):
        if self.request.method == 'POST':
            return [PortalUploadThrottle()]
        return super().get_throttles()

    def get(self, request, reference):
        app = self.get_object(reference)
        return Response(CustomerDocumentSerializer(app.documents.all(), many=True).data)

    def post(self, request, reference):
        # Multipart overhead allowance on top of the file limit.
        limit = PORTAL_DOC_MAX_MB * 1024 * 1024 + 64 * 1024
        try:
            declared = int(request.META.get('CONTENT_LENGTH') or 0)
        except ValueError:
            declared = 0
        if declared > limit:
            return Response({'detail': f'File too large. Maximum is {PORTAL_DOC_MAX_MB}MB.'},
                            status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        app = self.get_object(reference)
        ser = DocumentUploadSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            doc = services.add_application_document(
                application=app, document_type=ser.validated_data['document_type'],
                uploaded_file=ser.validated_data['file'], request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(CustomerDocumentSerializer(doc).data, status=status.HTTP_201_CREATED)


class ApplicationDocumentDeleteView(ApplicationDetailView):
    def get(self, request, reference, doc_id):
        raise MethodNotAllowed('GET')

    def delete(self, request, reference, doc_id):
        app = self.get_object(reference)
        doc = get_object_or_404(OnlineApplicationDocument, pk=doc_id, application=app)
        try:
            services.delete_application_document(document=doc, request=request)
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(status=status.HTTP_204_NO_CONTENT)


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
    ).prefetch_related('documents')
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

    @action(detail=True, methods=['get'], url_path=r'documents/(?P<doc_id>\d+)/download')
    def download_document(self, request, pk=None, doc_id=None):
        """Stream an applicant document. Same tenant/branch scoping as retrieve; audited."""
        from common.private_files import private_file_response, safe_download_name
        app = self.get_object()
        doc = get_object_or_404(OnlineApplicationDocument, pk=doc_id, application=app)
        services.audit('document_viewed', request=request, application=app,
                       staff_user=request.user, document=doc.pk)
        return private_file_response(
            doc.file,
            download_name=safe_download_name(f'{app.reference}-{doc.document_type}', doc.file.name),
            inline=request.query_params.get('inline') == '1',
        )

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



# ─────────────────────────────────────────────────────────────────────────────
# Staff — portal invitations (from a client's record)
# ─────────────────────────────────────────────────────────────────────────────

INVITE_MODULE = 'clients'
INVITE_PAGE = 'portal-invitations'


def _visible_client(user, client_id):
    """The client if this staff user may act on it (same tenant; own branch unless elevated)."""
    from clients.models import Client
    from common.views import _get_temp_branch_ids, is_elevated_user
    tenant = getattr(user, 'tenant', None)
    if tenant is None:
        return None
    client = Client.objects.filter(pk=client_id, tenant=tenant).first()
    if client is None:
        return None
    if not is_elevated_user(user):
        allowed = set(_get_temp_branch_ids(user) or set())
        if getattr(user, 'branch_id', None):
            allowed.add(user.branch_id)
        if client.branch_id not in allowed:
            return None
    return client


class StaffPortalInvitationViewSet(ScopedModelViewSet):
    """
    for-client (GET ?client=), create (POST {client, email}), revoke.
    Tenant-filtered; clients outside the staff user's branch are invisible.
    """
    from .models import PortalInvitation as _Model
    queryset = _Model.objects.select_related('client', 'created_by')
    permission_module = INVITE_MODULE
    permission_page = INVITE_PAGE
    http_method_names = ['get', 'post', 'head', 'options']
    serializer_class = StaffInvitationSerializer

    def get_queryset(self):
        tenant = getattr(self.request.user, 'tenant', None)
        if tenant is None:
            return self._Model.objects.none()
        return super().get_queryset().filter(tenant=tenant)

    def list(self, request, *args, **kwargs):
        raise MethodNotAllowed('GET')

    def retrieve(self, request, *args, **kwargs):
        raise MethodNotAllowed('GET')

    @action(detail=False, methods=['get'], url_path='for-client')
    def for_client(self, request):
        _require(request.user, flag='can_view', module=INVITE_MODULE, page=INVITE_PAGE)
        client = _visible_client(request.user, request.query_params.get('client'))
        if client is None:
            raise Http404()
        from .models import PortalCustomer as _Customer
        account = _Customer.objects.filter(client=client).first()
        invites = self.get_queryset().filter(client=client)[:10]
        return Response({
            'account': account and {
                'email': account.email, 'is_active': account.is_active,
                'created_at': account.created_at, 'last_login': account.last_login,
            },
            'invitations': StaffInvitationSerializer(invites, many=True).data,
        })

    def create(self, request, *args, **kwargs):
        _require(request.user, flag='can_create', module=INVITE_MODULE, page=INVITE_PAGE)
        ser = StaffInviteCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        client = _visible_client(request.user, ser.validated_data['client'])
        if client is None:
            raise ValidationError({'client': 'Client not found.'})
        if services.get_enabled_config(client.tenant) is None:
            raise ValidationError('The online portal is not switched on for your organisation yet.')
        try:
            inv = services.send_invitation(
                client=client, email=ser.validated_data['email'], staff_user=request.user, request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffInvitationSerializer(inv).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        _require(request.user, flag='can_create', module=INVITE_MODULE, page=INVITE_PAGE)
        inv = self.get_object()
        if _visible_client(request.user, inv.client_id) is None:
            raise Http404()
        try:
            services.revoke_invitation(invitation=inv, staff_user=request.user, request=request)
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        inv.refresh_from_db()
        return Response(StaffInvitationSerializer(inv).data)


# ─────────────────────────────────────────────────────────────────────────────
# Director settings — manage the portal from the ERP, not the server
# ─────────────────────────────────────────────────────────────────────────────

from rest_framework import viewsets as _viewsets  # noqa: E402


class IsDirector(permissions.BasePermission):
    """Directors = users with global (all-branch) scope: owner, system admin, global-scope roles."""
    message = 'Only directors can change the online portal settings.'

    def has_permission(self, request, view):
        from common.views import is_elevated_user
        user = request.user
        return bool(user and user.is_authenticated and getattr(user, 'tenant', None) and is_elevated_user(user))


_SETTINGS_FIELDS = ['is_enabled', 'allow_registration', 'max_open_applications', 'public_url',
                    'support_phone', 'support_email', 'terms_url', 'privacy_url']


class StaffPortalSettingsViewSet(_viewsets.ViewSet):
    """
    GET  settings/                    current settings + loan products with their online state
    PUT  settings/                    save settings
    POST settings/offerings/          add or update the online offering for a loan product
    POST settings/offerings/<id>/remove/   stop offering a product online
    """
    permission_classes = [permissions.IsAuthenticated, IsDirector]

    def _config(self, request):
        from .models import PortalConfig
        cfg, _ = PortalConfig.objects.get_or_create(tenant=request.user.tenant)
        return cfg

    def _payload(self, request, cfg):
        from loans.models import LoanProduct
        offerings = {o.loan_product_id: o for o in PortalLoanOffering.objects.filter(tenant=cfg.tenant)}
        products = []
        for p in LoanProduct.objects.filter(tenant=cfg.tenant, is_deleted=False).select_related('product').order_by('product__name'):
            o = offerings.get(p.pk)
            products.append({
                'loan_product': p.pk, 'name': p.product.name, 'product_active': p.product.is_active,
                'min_amount': p.min_loan_amount, 'max_amount': p.max_loan_amount,
                'interest_rate': p.default_interest_rate, 'term_unit': p.term_unit,
                'min_term': p.min_term_months, 'max_term': p.max_term_months,
                'offering': o and {
                    'id': o.pk, 'is_active': o.is_active, 'display_name': o.display_name,
                    'public_description': o.public_description, 'max_online_amount': o.max_online_amount,
                    'sort_order': o.sort_order,
                },
            })
        return {
            'settings': {f: getattr(cfg, f) for f in _SETTINGS_FIELDS},
            'server_default_url': getattr(dj_settings, 'PORTAL', {}).get('FRONTEND_URL', ''),
            'products': products,
        }

    def list(self, request):
        return Response(self._payload(request, self._config(request)))

    def put(self, request):
        cfg = self._config(request)
        ser = PortalSettingsSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        before = {f: getattr(cfg, f) for f in _SETTINGS_FIELDS}
        for f, v in ser.validated_data.items():
            setattr(cfg, f, v)
        cfg.save()
        changed = {f: [before[f], getattr(cfg, f)] for f in _SETTINGS_FIELDS if before[f] != getattr(cfg, f)}
        if changed:
            services.audit('settings_changed', request=request, tenant=cfg.tenant, staff_user=request.user,
                           changed={k: [str(a), str(b)] for k, (a, b) in changed.items()})
        return Response(self._payload(request, cfg))

    @action(detail=False, methods=['post'], url_path='offerings')
    def save_offering(self, request):
        from loans.models import LoanProduct
        cfg = self._config(request)
        ser = OfferingWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        product = LoanProduct.objects.filter(pk=d['loan_product'], tenant=cfg.tenant, is_deleted=False).first()
        if product is None:
            raise ValidationError({'loan_product': 'Loan product not found.'})
        if d.get('max_online_amount') is not None and d['max_online_amount'] < product.min_loan_amount:
            raise ValidationError({'max_online_amount': 'The online limit cannot be below the product minimum.'})
        offering, _ = PortalLoanOffering.objects.update_or_create(
            tenant=cfg.tenant, loan_product=product,
            defaults={k: d.get(k) for k in ('is_active', 'display_name', 'public_description',
                                            'max_online_amount', 'sort_order')},
        )
        services.audit('settings_changed', request=request, tenant=cfg.tenant, staff_user=request.user,
                       offering=offering.pk, product=product.product.name, active=offering.is_active)
        return Response(self._payload(request, cfg))

    @action(detail=False, methods=['post'], url_path=r'offerings/(?P<offering_id>\d+)/remove')
    def remove_offering(self, request, offering_id=None):
        cfg = self._config(request)
        offering = get_object_or_404(PortalLoanOffering, pk=offering_id, tenant=cfg.tenant)
        if offering.applications.exists():
            # Keep history intact: hide it instead of deleting.
            offering.is_active = False
            offering.save(update_fields=['is_active', 'updated_at'])
        else:
            offering.delete()
        services.audit('settings_changed', request=request, tenant=cfg.tenant, staff_user=request.user,
                       offering=int(offering_id), removed=True)
        return Response(self._payload(request, cfg))


# ─────────────────────────────────────────────────────────────────────────────
# Customer: balances and withdrawal requests
# ─────────────────────────────────────────────────────────────────────────────

from .serializers import (  # noqa: E402
    CustomerWithdrawalSerializer, StaffWithdrawalDecisionSerializer, StaffWithdrawalSerializer,
    WithdrawalCreateSerializer,
)
from .models import OnlineWithdrawalRequest  # noqa: E402


class MyAccountsView(PortalAuthenticatedView):
    """GET: the customer's own loans and savings (linked client only)."""

    def get(self, request):
        data = services.customer_accounts(self.customer)
        if data is None:
            return Response({'linked': False, 'loans': [], 'savings': []})
        return Response({'linked': True, **data})


class WithdrawalListCreateView(PortalAuthenticatedView):
    def get_throttles(self):
        if self.request.method == 'POST':
            return [PortalApplyThrottle()]
        return super().get_throttles()

    def get(self, request):
        qs = (OnlineWithdrawalRequest.objects
              .filter(customer=self.customer, tenant=self.tenant)
              .select_related('savings_account', 'forwarded_request')[:50])
        return Response(CustomerWithdrawalSerializer(qs, many=True).data)

    def post(self, request):
        ser = WithdrawalCreateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            wr = services.submit_withdrawal_request(
                customer=self.customer, savings_account_id=ser.validated_data['savings_account'],
                amount=ser.validated_data['amount'], payout_preference=ser.validated_data['payout_preference'],
                reason=ser.validated_data.get('reason', ''), request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(CustomerWithdrawalSerializer(wr).data, status=status.HTTP_201_CREATED)


class WithdrawalCancelView(PortalAuthenticatedView):
    def post(self, request, reference):
        wr = get_object_or_404(OnlineWithdrawalRequest, reference=reference, customer=self.customer, tenant=self.tenant)
        try:
            wr = services.cancel_withdrawal_request(withdrawal=wr, request=request)
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(CustomerWithdrawalSerializer(wr).data)


# ─────────────────────────────────────────────────────────────────────────────
# Staff: online withdrawal inbox → forward into the normal withdrawal workflow
# ─────────────────────────────────────────────────────────────────────────────

WITHDRAWAL_MODULE = 'savings'
WITHDRAWAL_PAGE = 'savings-withdrawals'


class StaffOnlineWithdrawalViewSet(ScopedModelViewSet):
    queryset = OnlineWithdrawalRequest.objects.select_related(
        'savings_account__client', 'savings_account__account', 'branch', 'customer',
        'reviewed_by', 'forwarded_request',
    )
    serializer_class = StaffWithdrawalSerializer
    permission_module = WITHDRAWAL_MODULE
    permission_page = WITHDRAWAL_PAGE
    officer_client_lookup = 'savings_account__client__assigned_officer'
    http_method_names = ['get', 'post', 'head', 'options']

    def get_queryset(self):
        user = self.request.user
        tenant = getattr(user, 'tenant', None)
        if tenant is None and not getattr(user, 'is_system_admin', False):
            return OnlineWithdrawalRequest.objects.none()
        qs = super().get_queryset()
        if tenant is not None:
            qs = qs.filter(tenant=tenant)
        st = self.request.query_params.get('status')
        if st:
            qs = qs.filter(status=st)
        return qs

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed('POST')

    @action(detail=True, methods=['post'])
    def forward(self, request, pk=None):
        _require(request.user, flag='can_create', module=WITHDRAWAL_MODULE, page=WITHDRAWAL_PAGE)
        wr = self.get_object()
        ser = StaffWithdrawalDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        try:
            wr = services.forward_withdrawal_request(
                withdrawal=wr, staff_user=request.user, staff_notes=ser.validated_data['staff_notes'], request=request,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffWithdrawalSerializer(wr).data)

    @action(detail=True, methods=['post'])
    def decline(self, request, pk=None):
        _require(request.user, flag='can_create', module=WITHDRAWAL_MODULE, page=WITHDRAWAL_PAGE)
        wr = self.get_object()
        ser = StaffWithdrawalDecisionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        if not ser.validated_data['customer_message'].strip():
            raise ValidationError({'customer_message': 'Tell the client why (they will see this).'})
        try:
            wr = services.decline_withdrawal_request(
                withdrawal=wr, staff_user=request.user, request=request, **ser.validated_data,
            )
        except DjangoValidationError as exc:
            raise ValidationError(_django_errors(exc))
        return Response(StaffWithdrawalSerializer(wr).data)
