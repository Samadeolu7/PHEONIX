"""
Portal business logic.  Views stay thin; everything security-relevant
(enumeration-safe registration, lockout, single-use tokens, the
staging → ERP conversion) lives here so it can be tested directly.
"""
import logging
from decimal import Decimal

from django.conf import settings
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from .authentication import client_ip
from .models import (
    OnlineLoanApplication, PortalAuditEvent, PortalConfig, PortalCustomer,
    PortalSession, identifier_fingerprint,
)
from . import tokens

logger = logging.getLogger('portal')

# A real hash, so a login attempt for a non-existent email costs the same
# CPU time as one for a real account (no timing-based enumeration).
_DUMMY_PASSWORD_HASH = None


def _dummy_hash():
    global _DUMMY_PASSWORD_HASH
    if _DUMMY_PASSWORD_HASH is None:
        from django.contrib.auth.hashers import make_password
        _DUMMY_PASSWORD_HASH = make_password('portal-timing-equaliser')
    return _DUMMY_PASSWORD_HASH


def normalise_email(email: str) -> str:
    return (email or '').strip().lower()


def audit(event, *, request=None, tenant=None, customer=None, application=None, staff_user=None, **detail):
    try:
        PortalAuditEvent.objects.create(
            tenant=tenant or getattr(customer, 'tenant', None) or getattr(application, 'tenant', None),
            customer=customer,
            application=application,
            staff_user=staff_user,
            event=event,
            ip_address=client_ip(request) if request is not None else None,
            user_agent=(request.META.get('HTTP_USER_AGENT', '')[:300] if request is not None else ''),
            detail=detail,
        )
    except Exception:  # auditing must never break the user flow
        logger.exception('Failed to write portal audit event %s', event)


def get_enabled_config(tenant):
    """Return the tenant's PortalConfig if the portal is switched on, else None."""
    if tenant is None:
        return None
    return PortalConfig.objects.filter(tenant=tenant, is_enabled=True).first()


# ─────────────────────────────────────────────────────────────────────────────
# Email
# ─────────────────────────────────────────────────────────────────────────────

def _frontend_url(path: str, tenant=None) -> str:
    """Portal link for emails: the tenant's configured address, else the server setting."""
    base = ''
    if tenant is not None:
        base = (PortalConfig.objects.filter(tenant=tenant).values_list('public_url', flat=True).first() or '')
    if not base:
        base = getattr(settings, 'PORTAL', {}).get('FRONTEND_URL', '')
    return f"{base.rstrip('/')}{path}"


def _send(subject, body, to):
    """
    Returns True if the mail server accepted the message. Customer-facing
    callers ignore the result on purpose (no enumeration via error
    messages); staff-facing callers (invitations) must check it.
    """
    try:
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [to], fail_silently=False)
        return True
    except Exception:
        logger.exception('Portal email failed (subject=%s)', subject)
        return False


def send_verification_email(customer):
    from urllib.parse import quote
    token = tokens.make_token(customer, 'verify')
    link = _frontend_url(f"/portal/verify-email?token={quote(token)}", customer.tenant)
    _send(
        f"Verify your email — {customer.tenant.name}",
        f"Hello {customer.first_name},\n\n"
        f"Please confirm your email address to finish setting up your account:\n\n{link}\n\n"
        "This link expires in 48 hours. If you did not create an account, you can ignore this email.\n",
        customer.email,
    )


def send_existing_account_email(customer):
    _send(
        f"Sign-up attempt — {customer.tenant.name}",
        f"Hello {customer.first_name},\n\n"
        "Someone tried to create a new account with this email address, but you already have one.\n"
        f"If that was you, log in here: {_frontend_url('/portal/login', customer.tenant)}\n"
        f"Forgot your password? Reset it here: {_frontend_url('/portal/forgot-password', customer.tenant)}\n\n"
        "If it wasn't you, no action is needed — your account is unchanged.\n",
        customer.email,
    )


def send_password_reset_email(customer):
    from urllib.parse import quote
    token = tokens.make_token(customer, 'reset')
    link = _frontend_url(f"/portal/reset-password?token={quote(token)}", customer.tenant)
    _send(
        f"Reset your password — {customer.tenant.name}",
        f"Hello {customer.first_name},\n\n"
        f"Use this link to choose a new password:\n\n{link}\n\n"
        "This link expires in 1 hour and can only be used once. "
        "If you did not ask for this, ignore this email — your password will not change.\n",
        customer.email,
    )


def send_password_changed_email(customer):
    _send(
        f"Your password was changed — {customer.tenant.name}",
        f"Hello {customer.first_name},\n\n"
        "The password for your account was just changed and all devices were signed out.\n"
        "If this was not you, contact us immediately.\n",
        customer.email,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Account lifecycle
# ─────────────────────────────────────────────────────────────────────────────

def register_customer(*, tenant, email, phone, first_name, last_name, password, request=None):
    """
    Enumeration-safe: the caller gets the same outcome whether or not the
    email is already registered.  The real owner of an existing address is
    notified by email instead.
    """
    email = normalise_email(email)
    existing = PortalCustomer.objects.filter(tenant=tenant, email=email).first()
    if existing:
        audit('register_duplicate', request=request, tenant=tenant, customer=existing)
        send_existing_account_email(existing)
        return None

    customer = PortalCustomer(
        tenant=tenant, email=email, phone=phone.strip(),
        first_name=first_name.strip(), last_name=last_name.strip(),
        accepted_terms_at=timezone.now(),
    )
    # Validators include similarity to name/email, length, common & numeric.
    validate_password(password, user=customer)
    customer.set_password(password)
    try:
        with transaction.atomic():
            customer.save()
    except IntegrityError:
        # Lost a race with a concurrent registration for the same email.
        return None
    audit('register', request=request, customer=customer)
    send_verification_email(customer)
    return customer


def verify_email(*, tenant, token, request=None):
    customer = tokens.read_token(token, 'verify', tenant)
    if customer is None:
        return None
    if not customer.email_verified_at:
        customer.email_verified_at = timezone.now()
        customer.save(update_fields=['email_verified_at', 'updated_at'])
        audit('email_verified', request=request, customer=customer)
    return customer


def resend_verification(*, tenant, email):
    customer = PortalCustomer.objects.filter(
        tenant=tenant, email=normalise_email(email), is_active=True, email_verified_at__isnull=True,
    ).first()
    if customer:
        send_verification_email(customer)


class LoginFailed(Exception):
    """Single generic failure — callers must not reveal which check failed."""


def authenticate_customer(*, tenant, email, password, request=None):
    customer = PortalCustomer.objects.filter(tenant=tenant, email=normalise_email(email)).first()

    if customer is None:
        from django.contrib.auth.hashers import check_password
        check_password(password, _dummy_hash())  # equalise timing
        audit('login_failed', request=request, tenant=tenant, reason='unknown_email')
        raise LoginFailed()

    if customer.is_locked():
        audit('login_locked', request=request, customer=customer)
        raise LoginFailed()

    if not customer.check_password(password) or not customer.is_active:
        was_locked = customer.is_locked()
        customer.register_failed_login()
        audit('login_failed', request=request, customer=customer)
        if not was_locked and customer.is_locked():
            audit('account_locked', request=request, customer=customer)
        raise LoginFailed()

    customer.register_successful_login()
    session, raw = PortalSession.issue(
        customer,
        ip_address=client_ip(request) if request is not None else None,
        user_agent=request.META.get('HTTP_USER_AGENT', '') if request is not None else '',
    )
    audit('login_success', request=request, customer=customer)
    return customer, session, raw


def request_password_reset(*, tenant, email, request=None):
    customer = PortalCustomer.objects.filter(
        tenant=tenant, email=normalise_email(email), is_active=True,
    ).first()
    if customer:
        audit('password_reset_requested', request=request, customer=customer)
        send_password_reset_email(customer)


def reset_password(*, tenant, token, new_password, request=None):
    customer = tokens.read_token(token, 'reset', tenant)
    if customer is None:
        return None
    validate_password(new_password, user=customer)
    with transaction.atomic():
        customer.set_password(new_password)
        # Resetting via email proves control of the mailbox.
        if not customer.email_verified_at:
            customer.email_verified_at = timezone.now()
        customer.failed_login_count = 0
        customer.locked_until = None
        customer.save()
        PortalSession.revoke_all_for(customer)
    audit('password_reset_completed', request=request, customer=customer)
    send_password_changed_email(customer)
    return customer


def change_password(*, customer, current_password, new_password, request=None):
    if not customer.check_password(current_password):
        raise ValidationError({'current_password': 'Current password is incorrect.'})
    validate_password(new_password, user=customer)
    with transaction.atomic():
        customer.set_password(new_password)
        customer.save()
        PortalSession.revoke_all_for(customer)
    audit('password_changed', request=request, customer=customer)
    send_password_changed_email(customer)


# ─────────────────────────────────────────────────────────────────────────────
# Applications (customer side)
# ─────────────────────────────────────────────────────────────────────────────

def submit_application(*, customer, config, validated, request=None):
    if not customer.is_email_verified:
        raise ValidationError('Please verify your email address before applying.')

    with transaction.atomic():
        # Lock the customer row so two concurrent submissions can't both slip
        # under the open-application limit.
        PortalCustomer.objects.select_for_update().get(pk=customer.pk)
        open_count = OnlineLoanApplication.objects.filter(
            customer=customer, status__in=OnlineLoanApplication.OPEN_STATUSES,
        ).count()
        if open_count >= config.max_open_applications:
            raise ValidationError(
                'You already have an application being processed. '
                'Please wait for a decision or withdraw it before applying again.'
            )

        offering = validated.pop('offering')
        app = OnlineLoanApplication(
            tenant=customer.tenant,
            customer=customer,
            offering=offering,
            loan_product=offering.loan_product,
            email=customer.email,           # always the verified address
            submitted_ip=client_ip(request) if request is not None else None,
            nin_fingerprint=identifier_fingerprint(validated['nin']),
            bvn_fingerprint=identifier_fingerprint(validated['bvn']),
            **validated,
        )
        app.save()
    audit('application_submitted', request=request, customer=customer, application=app)
    return app


def withdraw_application(*, application, request=None):
    with transaction.atomic():
        app = OnlineLoanApplication.objects.select_for_update().get(pk=application.pk)
        if app.status != OnlineLoanApplication.STATUS_SUBMITTED:
            raise ValidationError('This application can no longer be withdrawn.')
        app.status = OnlineLoanApplication.STATUS_WITHDRAWN
        app.save(update_fields=['status', 'updated_at'])
    audit('application_withdrawn', request=request, customer=app.customer, application=app)
    return app


# ─────────────────────────────────────────────────────────────────────────────
# Staff side
# ─────────────────────────────────────────────────────────────────────────────

def _lock_open(application):
    app = OnlineLoanApplication.objects.select_for_update().get(pk=application.pk)
    if not app.is_open:
        raise ValidationError(f'This application is already {app.get_status_display().lower()}.')
    return app


def start_review(*, application, staff_user, request=None):
    with transaction.atomic():
        app = _lock_open(application)
        app.status = OnlineLoanApplication.STATUS_UNDER_REVIEW
        if app.assigned_to_id is None:
            app.assigned_to = staff_user
        app.save(update_fields=['status', 'assigned_to', 'updated_at'])
    audit('application_review_started', request=request, application=app, staff_user=staff_user)
    return app


def reject_application(*, application, staff_user, customer_message, staff_notes='', request=None):
    with transaction.atomic():
        app = _lock_open(application)
        app.status = OnlineLoanApplication.STATUS_REJECTED
        app.reviewed_by = staff_user
        app.reviewed_at = timezone.now()
        app.customer_message = customer_message
        if staff_notes:
            app.staff_notes = staff_notes
        app.save()
    audit('application_rejected', request=request, application=app, staff_user=staff_user)
    return app


def find_matching_clients(application):
    """Existing clients in the tenant that look like the same person."""
    from clients.models import Client
    q = Q(nin=application.nin) | Q(bvn=application.bvn) | Q(phone_primary=application.phone_primary)
    return list(
        Client.objects.filter(tenant=application.tenant).filter(q).select_related('branch')[:10]
    )


class ConversionConflict(Exception):
    def __init__(self, message, matches=None):
        super().__init__(message)
        self.message = message
        self.matches = matches or []


_FREQUENCY_TO_CLIENT_TYPE = {'daily': 'dc', 'weekly': 'wl', 'monthly': 'ml'}


def _client_from_application(app, staff_user):
    from clients.models import Client
    client = Client(
        title=app.title,
        first_name=app.first_name,
        middle_name=app.middle_name,
        last_name=app.last_name,
        gender=app.gender,
        date_of_birth=app.date_of_birth,
        marital_status=app.marital_status or None,
        email=app.email,
        phone_primary=app.phone_primary,
        phone_secondary=app.phone_secondary or None,
        address_street=app.address_street,
        address_city=app.address_city,
        address_state=app.address_state,
        nin=app.nin,
        bvn=app.bvn,
        occupation=app.occupation or None,
        employer_name=app.employer_name or None,
        employer_address=app.employer_address or None,
        employment_status=app.employment_status,
        annual_income=(app.monthly_income or Decimal('0')) * 12,
        next_of_kin_name=app.next_of_kin_name,
        next_of_kin_relationship=app.next_of_kin_relationship,
        next_of_kin_phone=app.next_of_kin_phone,
        bank_name=app.bank_name or None,
        bank_account_name=app.bank_account_name or None,
        bank_account_number=app.bank_account_number or None,
        referral_source='online_portal',
        kyc_status='pending',
        usage_context='financial',
        client_type=_FREQUENCY_TO_CLIENT_TYPE.get(app.repayment_frequency),
        metadata={'online_application': app.reference},
        tenant=app.tenant,
        branch=app.branch,
        owner=staff_user,
        created_by=staff_user,
    )
    client.clean()  # NIN cross-branch duplicate + date checks
    client.save()
    return client


def convert_application(
    *, application, staff_user, client_id=None, create_new_client=False,
    cashier_account_id=None, fee_routing=None, staff_notes='', request=None,
):
    """
    Turn a reviewed online application into a real Client (new or existing)
    and a *pending* LoanAccount.  The loan then goes through the normal
    staff approval → disbursement workflow; nothing is approved here.

    Identity safety: if the applicant's NIN/BVN/phone matches an existing
    client, staff must explicitly choose — we never auto-link, because that
    would let anyone who knows someone's NIN attach themselves to that
    person's records.
    """
    from clients.models import Client
    from loans.models import LoanAccount
    from loans.services import apply_loan_fees, check_savings_requirement, create_loan_account_shell

    with transaction.atomic():
        app = _lock_open(application)
        product = app.loan_product

        linked = app.customer.client if app.customer.client_id else None
        if linked is not None and not client_id:
            # Invited customer: staff already vouched for this identity when
            # they sent the invitation from the client's record.
            client_id = linked.pk
        if client_id:
            try:
                client = Client.objects.get(pk=client_id, tenant=app.tenant)
            except Client.DoesNotExist:
                raise ValidationError({'client_id': 'Client not found.'})
            if client.branch_id != app.branch_id:
                raise ValidationError({'client_id': 'That client belongs to a different branch.'})
        else:
            matches = find_matching_clients(app)
            id_matches = [c for c in matches if c.nin == app.nin or c.bvn == app.bvn]
            if id_matches:
                raise ConversionConflict(
                    'An existing client has the same NIN or BVN. Link the application to that client '
                    '(after confirming identity) instead of creating a new one.',
                    matches,
                )
            if matches and not create_new_client:
                raise ConversionConflict(
                    'Existing clients share this phone number. Choose one to link, or confirm '
                    'that a new client should be created.',
                    matches,
                )
            client = _client_from_application(app, staff_user)

        customer = app.customer
        if customer.client_id and customer.client_id != client.pk:
            raise ValidationError(
                {'client_id': 'This online customer is already linked to a different client.'}
            )

        requested = Decimal(app.requested_amount)
        check_savings_requirement(client, product, requested)

        loan_number, gl_account = create_loan_account_shell(
            client=client, product=product, user=staff_user, branch=app.branch, tenant=app.tenant,
        )
        loan = LoanAccount.objects.create(
            client=client,
            product=product,
            account=gl_account,
            loan_number=loan_number,
            application_date=timezone.localdate(),
            application_notes=(
                f"Online application {app.reference}. Purpose: {app.loan_purpose}"
            )[:2000],
            requested_amount=requested,
            interest_rate=product.default_interest_rate,
            term_months=app.term,
            term_unit=app.term_unit,
            repayment_frequency=app.repayment_frequency,
            status='pending',
            branch=app.branch,
            tenant=app.tenant,
            owner=staff_user,
            created_by=staff_user,
            metadata={'source': 'online_portal', 'online_application': app.reference},
        )

        needs_cashier = product.fee_lines.filter(
            posting_trigger='registration', is_active=True,
            debit_destination__in=('cashier', 'user_choice'),
        ).exists()
        cashier_account = None
        if needs_cashier:
            from cash_management.services.payment_routing import PaymentRoutingService
            cashier_account = PaymentRoutingService.resolve_cashier_gl_account(
                staff_user, owner=loan.owner, branch=loan.branch, cashier_account_id=cashier_account_id,
            )
        apply_loan_fees(
            loan, trigger='registration', posted_by=staff_user,
            cashier_account=cashier_account, fee_routing=fee_routing or {},
        )

        if not customer.client_id:
            customer.client = client
            customer.save(update_fields=['client', 'updated_at'])

        app.status = OnlineLoanApplication.STATUS_CONVERTED
        app.converted_client = client
        app.converted_loan = loan
        app.reviewed_by = staff_user
        app.reviewed_at = timezone.now()
        if staff_notes:
            app.staff_notes = staff_notes
        app.save()

    audit(
        'application_converted', request=request, application=app, staff_user=staff_user,
        client=client.client_id, loan=loan.loan_number,
    )
    return app


# ─────────────────────────────────────────────────────────────────────────────
# Supporting documents
# ─────────────────────────────────────────────────────────────────────────────

def _sha256_streaming(f):
    """Hash in chunks — never loads the whole upload into memory."""
    import hashlib
    h = hashlib.sha256()
    f.seek(0)
    for chunk in f.chunks(chunk_size=64 * 1024):
        h.update(chunk)
    f.seek(0)
    return h.hexdigest()


def add_application_document(*, application, document_type, uploaded_file, request=None):
    from common.image_processing import compress_image
    from common.private_files import check_file_signature
    from .models import (
        OnlineApplicationDocument, PORTAL_DOC_EXTENSIONS, PORTAL_DOC_MAX_MB, PORTAL_DOCS_PER_APPLICATION,
    )

    # Cheap checks first: size (metadata only), then the first few bytes.
    if uploaded_file.size > PORTAL_DOC_MAX_MB * 1024 * 1024:
        raise ValidationError({'file': f'File too large. Maximum is {PORTAL_DOC_MAX_MB}MB.'})
    if uploaded_file.size == 0:
        raise ValidationError({'file': 'The file is empty.'})
    try:
        check_file_signature(uploaded_file, PORTAL_DOC_EXTENSIONS)
    except ValidationError as exc:
        raise ValidationError({'file': exc.messages})

    original_name = (getattr(uploaded_file, 'name', '') or '')[-150:]
    if (uploaded_file.content_type or '').startswith('image/') or original_name.lower().endswith(('.jpg', '.jpeg', '.png')):
        # Re-encoding strips EXIF (e.g. phone GPS location) and anything hidden
        # inside the image; decoding is memory-bounded (see image_processing).
        uploaded_file = compress_image(uploaded_file, max_dimension=2000, quality=85)

    with transaction.atomic():
        app = OnlineLoanApplication.objects.select_for_update().get(pk=application.pk)
        if not app.is_open:
            raise ValidationError('Documents can only be added while the application is being processed.')
        if app.documents.count() >= PORTAL_DOCS_PER_APPLICATION:
            raise ValidationError(f'You can upload at most {PORTAL_DOCS_PER_APPLICATION} documents per application.')
        doc = OnlineApplicationDocument(
            application=app,
            document_type=document_type,
            original_name=original_name,
            content_type=(uploaded_file.content_type or 'application/octet-stream')[:60],
            size=uploaded_file.size,
            sha256=_sha256_streaming(uploaded_file),
        )
        doc.file.save(original_name or 'document', uploaded_file, save=False)
        doc.save()
    audit('document_uploaded', request=request, customer=app.customer, application=app,
          document=doc.pk, type=document_type, size=doc.size)
    return doc


def delete_application_document(*, document, request=None):
    app = document.application
    if app.status != OnlineLoanApplication.STATUS_SUBMITTED:
        raise ValidationError('Documents can no longer be removed once review has started.')
    storage_name = document.file.name
    storage = document.file.storage
    with transaction.atomic():
        document.delete()
        # Remove the bytes only after the row is gone for good.
        transaction.on_commit(lambda: storage.delete(storage_name))
    audit('document_deleted', request=request, customer=app.customer, application=app)


# ─────────────────────────────────────────────────────────────────────────────
# Staff invitations
# ─────────────────────────────────────────────────────────────────────────────

def send_invitation(*, client, email, staff_user, request=None):
    from .models import PortalInvitation
    email = normalise_email(email)
    if PortalCustomer.objects.filter(client=client).exists():
        raise ValidationError('This client already has an online account.')
    if PortalCustomer.objects.filter(tenant=client.tenant, email=email).exists():
        raise ValidationError({'email': 'An online account already uses this email address.'})
    inv, raw = PortalInvitation.issue(client=client, email=email, created_by=staff_user)
    from urllib.parse import quote
    link = _frontend_url(f'/portal/accept-invite?token={quote(raw)}', client.tenant)
    sent = _send(
        f'Your online account — {client.tenant.name}',
        f'Hello {client.first_name},\n\n'
        f'{client.tenant.name} has set up online access for you. Use this link to choose a password '
        f'and sign in, so you can apply for loans and track your applications online:\n\n{link}\n\n'
        f'The link works once and expires in {PortalInvitation.INVITE_TTL_HOURS} hours. '
        'If you were not expecting this, ignore this email. We will never ask for your password, '
        'PIN or OTP by phone, SMS or email.\n',
        email,
    )
    if not sent:
        # Don't leave a live link nobody received, and tell the staff member.
        inv.revoked_at = timezone.now()
        inv.save(update_fields=['revoked_at'])
        raise ValidationError(
            'The invitation email could not be sent. The mail server may be misconfigured or '
            'unreachable. Ask your administrator to check the email settings, then try again.'
        )
    audit('invite_sent', request=request, tenant=client.tenant, staff_user=staff_user,
          client=client.client_id, invitation=inv.pk)
    return inv


def revoke_invitation(*, invitation, staff_user, request=None):
    if invitation.status != 'pending':
        raise ValidationError(f'This invitation is already {invitation.status}.')
    invitation.revoked_at = timezone.now()
    invitation.save(update_fields=['revoked_at'])
    audit('invite_revoked', request=request, tenant=invitation.tenant, staff_user=staff_user,
          invitation=invitation.pk)


def find_invitation(*, tenant, token):
    """Usable invitation for this tenant, or None (never says why)."""
    from .models import PortalInvitation, hash_token
    if not token or len(token) > 200:
        return None
    inv = (PortalInvitation.objects.select_related('client', 'tenant')
           .filter(token_hash=hash_token(token), tenant=tenant).first())
    return inv if inv and inv.is_usable else None


class InvitationInvalid(Exception):
    pass


def accept_invitation(*, tenant, token, password, request=None):
    """
    Create a verified portal account linked to the invited client and sign it
    in. Works whether or not open registration is enabled.
    """
    from .models import PortalInvitation, hash_token
    with transaction.atomic():
        inv = (PortalInvitation.objects.select_for_update().select_related('client')
               .filter(token_hash=hash_token(token or ''), tenant=tenant).first())
        if inv is None or not inv.is_usable:
            audit('invite_failed', request=request, tenant=tenant)
            raise InvitationInvalid()
        client = inv.client
        if PortalCustomer.objects.filter(client=client).exists() or \
                PortalCustomer.objects.filter(tenant=tenant, email=inv.email).exists():
            raise ValidationError('An online account already exists for this client. Please sign in instead.')
        customer = PortalCustomer(
            tenant=tenant, email=inv.email, phone=client.phone_primary or '',
            first_name=client.first_name, last_name=client.last_name,
            accepted_terms_at=timezone.now(), email_verified_at=timezone.now(),  # the link proves the mailbox
            client=client,
        )
        try:
            validate_password(password, user=customer)
        except ValidationError as exc:
            raise ValidationError({'password': exc.messages})
        customer.set_password(password)
        customer.save()
        inv.accepted_at = timezone.now()
        inv.customer = customer
        inv.save(update_fields=['accepted_at', 'customer'])
        customer.register_successful_login()
        session, raw = PortalSession.issue(
            customer,
            ip_address=client_ip(request) if request is not None else None,
            user_agent=request.META.get('HTTP_USER_AGENT', '') if request is not None else '',
        )
    audit('invite_accepted', request=request, customer=customer, invitation=inv.pk)
    return customer, raw
