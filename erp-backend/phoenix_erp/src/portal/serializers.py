"""
Portal serializers.

Rules followed throughout:
* Explicit field lists only — never ``fields = '__all__'``.  Internal fields
  (staff notes, fingerprints, IPs, linked client, GL data) are never exposed
  to customers.
* NIN / BVN / account numbers go out masked to customers.
* Anything a customer submits is re-validated against server-side product
  rules; the client-side form is a convenience, not a control.
"""
import re
from datetime import date

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from branches.models import Branch

from .models import (
    OnlineApplicationDocument, OnlineLoanApplication, PortalCustomer, PortalLoanOffering, mask_identifier,
)

NG_PHONE_RE = re.compile(r'^(\+234|234|0)[789][01]\d{8}$')
ELEVEN_DIGITS_RE = re.compile(r'^\d{11}$')
NUBAN_RE = re.compile(r'^\d{10}$')
# Letters (incl. accented), spaces, apostrophes, hyphens, dots.
NAME_RE = re.compile(r"^[^\W\d_]+(?:[ '\-.][^\W\d_]+)*\.?$", re.UNICODE)


def _clean_phone(value):
    value = re.sub(r'[\s\-()]', '', value or '')
    if not NG_PHONE_RE.match(value):
        raise serializers.ValidationError('Enter a valid Nigerian phone number, e.g. 08031234567.')
    return value


def _clean_name(value):
    value = (value or '').strip()
    if not value:
        return value
    if not NAME_RE.match(value):
        raise serializers.ValidationError('Use letters only.')
    return value


def _password_errors(password, customer_like):
    try:
        validate_password(password, user=customer_like)
    except DjangoValidationError as exc:
        raise serializers.ValidationError(list(exc.messages))


class NameField(serializers.CharField):
    def to_internal_value(self, data):
        return _clean_name(super().to_internal_value(data))


class PhoneField(serializers.CharField):
    def to_internal_value(self, data):
        return _clean_phone(super().to_internal_value(data))


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────

class RegisterSerializer(serializers.Serializer):
    first_name = NameField(max_length=100)
    last_name = NameField(max_length=100)
    email = serializers.EmailField(max_length=254)
    phone = PhoneField(max_length=20)
    password = serializers.CharField(write_only=True, min_length=8, max_length=128, trim_whitespace=False)
    accept_terms = serializers.BooleanField()

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError('You must accept the terms to continue.')
        return value

    def validate(self, attrs):
        probe = PortalCustomer(
            email=attrs['email'], first_name=attrs['first_name'], last_name=attrs['last_name'],
        )
        try:
            validate_password(attrs['password'], user=probe)
        except DjangoValidationError as exc:
            raise serializers.ValidationError({'password': list(exc.messages)})
        return attrs


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    password = serializers.CharField(max_length=128, trim_whitespace=False)


class EmailOnlySerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)


class TokenSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=512)
    new_password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False)


class CustomerSerializer(serializers.ModelSerializer):
    email_verified = serializers.BooleanField(source='is_email_verified', read_only=True)

    class Meta:
        model = PortalCustomer
        fields = ['first_name', 'last_name', 'email', 'phone', 'email_verified', 'created_at']
        read_only_fields = ['email', 'email_verified', 'created_at']
        extra_kwargs = {
            'first_name': {'validators': []},
            'last_name': {'validators': []},
        }

    def validate_first_name(self, v):
        return _clean_name(v)

    def validate_last_name(self, v):
        return _clean_name(v)

    def validate_phone(self, v):
        return _clean_phone(v)


# ─────────────────────────────────────────────────────────────────────────────
# Public catalogue
# ─────────────────────────────────────────────────────────────────────────────

class PublicBranchSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    city = serializers.CharField()
    state = serializers.CharField()


class PublicOfferingSerializer(serializers.ModelSerializer):
    """Only customer-relevant, disclosure-appropriate product terms."""
    name = serializers.SerializerMethodField()
    min_amount = serializers.DecimalField(source='loan_product.min_loan_amount', max_digits=18, decimal_places=2)
    max_amount = serializers.DecimalField(source='effective_max_amount', max_digits=18, decimal_places=2)
    interest_rate = serializers.DecimalField(source='loan_product.default_interest_rate', max_digits=5, decimal_places=2)
    interest_method = serializers.CharField(source='loan_product.get_interest_calculation_method_display')
    term_unit = serializers.CharField(source='loan_product.term_unit')
    min_term = serializers.IntegerField(source='loan_product.min_term_months')
    max_term = serializers.IntegerField(source='loan_product.max_term_months')
    repayment_frequencies = serializers.SerializerMethodField()
    processing_fee_type = serializers.CharField(source='loan_product.processing_fee_type')
    processing_fee_amount = serializers.DecimalField(source='loan_product.processing_fee_amount', max_digits=18, decimal_places=2)
    processing_fee_percentage = serializers.DecimalField(source='loan_product.processing_fee_percentage', max_digits=7, decimal_places=2)
    insurance_rate = serializers.DecimalField(source='loan_product.insurance_rate', max_digits=7, decimal_places=2)
    requires_guarantor = serializers.BooleanField(source='loan_product.requires_guarantor')
    requires_collateral = serializers.BooleanField(source='loan_product.requires_collateral')

    class Meta:
        model = PortalLoanOffering
        fields = [
            'id', 'name', 'public_description', 'min_amount', 'max_amount',
            'interest_rate', 'interest_method', 'term_unit', 'min_term', 'max_term',
            'repayment_frequencies', 'processing_fee_type', 'processing_fee_amount',
            'processing_fee_percentage', 'insurance_rate', 'requires_guarantor', 'requires_collateral',
        ]

    def get_name(self, obj):
        return obj.display_name or obj.loan_product.product.name

    def get_repayment_frequencies(self, obj):
        allowed = obj.loan_product.allowed_repayment_frequencies or []
        labels = dict(obj.loan_product.REPAYMENT_FREQUENCIES)
        if not allowed:
            allowed = [obj.loan_product.REPAYMENT_FREQUENCIES[3][0]]  # 'monthly'
        return [{'value': f, 'label': labels.get(f, f)} for f in allowed if f in labels]


# ─────────────────────────────────────────────────────────────────────────────
# Applications — customer side
# ─────────────────────────────────────────────────────────────────────────────

class ApplicationCreateSerializer(serializers.ModelSerializer):
    offering = serializers.PrimaryKeyRelatedField(queryset=PortalLoanOffering.objects.none())
    branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.none())
    first_name = NameField(max_length=100)
    middle_name = NameField(max_length=100, required=False, allow_blank=True)
    last_name = NameField(max_length=100)
    phone_primary = PhoneField(max_length=20)
    phone_secondary = PhoneField(max_length=20, required=False, allow_blank=True)
    next_of_kin_phone = PhoneField(max_length=20)
    nin = serializers.CharField(max_length=11, write_only=True)
    bvn = serializers.CharField(max_length=11, write_only=True)
    bank_account_number = serializers.CharField(max_length=10, required=False, allow_blank=True, write_only=True)
    loan_purpose = serializers.CharField(max_length=1000)
    monthly_income = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=0)
    requested_amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=1)

    class Meta:
        model = OnlineLoanApplication
        fields = [
            'offering', 'branch', 'requested_amount', 'term', 'repayment_frequency', 'loan_purpose',
            'title', 'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth', 'marital_status',
            'phone_primary', 'phone_secondary', 'address_street', 'address_city', 'address_state',
            'nin', 'bvn',
            'employment_status', 'occupation', 'employer_name', 'employer_address', 'monthly_income',
            'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
            'bank_name', 'bank_account_name', 'bank_account_number',
            'consent_credit_check', 'consent_data_processing',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        # Querysets restricted to the request's tenant — an id from another
        # tenant (or a disabled offering / inactive branch) is simply "invalid".
        offerings = self.context.get('offerings')
        branches = self.context.get('branches')
        if offerings is not None:
            self.fields['offering'].queryset = offerings
        if branches is not None:
            self.fields['branch'].queryset = branches

    def validate_nin(self, v):
        v = (v or '').strip()
        if not ELEVEN_DIGITS_RE.match(v):
            raise serializers.ValidationError('NIN must be exactly 11 digits.')
        return v

    def validate_bvn(self, v):
        v = (v or '').strip()
        if not ELEVEN_DIGITS_RE.match(v):
            raise serializers.ValidationError('BVN must be exactly 11 digits.')
        return v

    def validate_bank_account_number(self, v):
        v = (v or '').strip()
        if v and not NUBAN_RE.match(v):
            raise serializers.ValidationError('Account number must be 10 digits.')
        return v

    def validate_date_of_birth(self, v):
        today = date.today()
        age = today.year - v.year - ((today.month, today.day) < (v.month, v.day))
        if age < 18:
            raise serializers.ValidationError('You must be at least 18 years old to apply.')
        if age > 100:
            raise serializers.ValidationError('Please check your date of birth.')
        return v

    def validate_consent_credit_check(self, v):
        if not v:
            raise serializers.ValidationError('Consent to a credit check is required.')
        return v

    def validate_consent_data_processing(self, v):
        if not v:
            raise serializers.ValidationError('Consent to process your data is required.')
        return v

    def validate(self, attrs):
        offering = attrs['offering']
        product = offering.loan_product
        errors = {}

        amount = attrs['requested_amount']
        if amount < product.min_loan_amount or amount > offering.effective_max_amount:
            errors['requested_amount'] = (
                f'Amount must be between ₦{product.min_loan_amount:,.2f} '
                f'and ₦{offering.effective_max_amount:,.2f}.'
            )

        term = attrs['term']
        if term < product.min_term_months or term > product.max_term_months:
            errors['term'] = (
                f'Term must be between {product.min_term_months} and {product.max_term_months} {product.term_unit}.'
            )

        allowed = product.allowed_repayment_frequencies or ['monthly']
        if attrs['repayment_frequency'] not in allowed:
            errors['repayment_frequency'] = 'That repayment frequency is not available for this loan.'

        if attrs.get('nin') and attrs.get('nin') == attrs.get('bvn'):
            errors['bvn'] = 'BVN and NIN cannot be the same number.'

        if errors:
            raise serializers.ValidationError(errors)

        attrs['term_unit'] = product.term_unit
        return attrs


class DocumentUploadSerializer(serializers.Serializer):
    document_type = serializers.ChoiceField(choices=OnlineApplicationDocument.TYPE_CHOICES)
    file = serializers.FileField(max_length=150, allow_empty_file=False)


class CustomerDocumentSerializer(serializers.ModelSerializer):
    """Metadata only — customers can't download files back (smaller attack surface)."""
    document_type_display = serializers.CharField(source='get_document_type_display')

    class Meta:
        model = OnlineApplicationDocument
        fields = ['id', 'document_type', 'document_type_display', 'original_name', 'size', 'uploaded_at']


class StaffDocumentSerializer(CustomerDocumentSerializer):
    download = serializers.SerializerMethodField()

    class Meta(CustomerDocumentSerializer.Meta):
        fields = CustomerDocumentSerializer.Meta.fields + ['content_type', 'sha256', 'download']

    def get_download(self, obj):
        return f'/portal/staff/applications/{obj.application_id}/documents/{obj.pk}/download/'


class ApplicationCustomerSerializer(serializers.ModelSerializer):
    """What a customer sees about their own application."""
    product_name = serializers.SerializerMethodField()
    branch_name = serializers.CharField(source='branch.name')
    status_display = serializers.CharField(source='get_status_display')
    nin_masked = serializers.SerializerMethodField()
    bvn_masked = serializers.SerializerMethodField()
    can_withdraw = serializers.SerializerMethodField()
    documents = CustomerDocumentSerializer(many=True, read_only=True)
    can_upload = serializers.SerializerMethodField()
    can_remove_documents = serializers.SerializerMethodField()

    class Meta:
        model = OnlineLoanApplication
        fields = [
            'documents', 'can_upload', 'can_remove_documents',
            'reference', 'status', 'status_display', 'product_name', 'branch_name',
            'requested_amount', 'term', 'term_unit', 'repayment_frequency', 'loan_purpose',
            'first_name', 'middle_name', 'last_name', 'phone_primary',
            'nin_masked', 'bvn_masked',
            'customer_message', 'submitted_at', 'updated_at', 'can_withdraw',
        ]

    def get_product_name(self, obj):
        return obj.offering.display_name or obj.loan_product.product.name

    def get_nin_masked(self, obj):
        return mask_identifier(obj.nin)

    def get_bvn_masked(self, obj):
        return mask_identifier(obj.bvn)

    def get_can_withdraw(self, obj):
        return obj.status == OnlineLoanApplication.STATUS_SUBMITTED

    def get_can_upload(self, obj):
        from .models import PORTAL_DOCS_PER_APPLICATION
        return obj.is_open and len(obj.documents.all()) < PORTAL_DOCS_PER_APPLICATION

    def get_can_remove_documents(self, obj):
        return obj.status == OnlineLoanApplication.STATUS_SUBMITTED


# ─────────────────────────────────────────────────────────────────────────────
# Applications — staff side
# ─────────────────────────────────────────────────────────────────────────────

class StaffApplicationListSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='loan_product.product.name')
    branch_name = serializers.CharField(source='branch.name')
    status_display = serializers.CharField(source='get_status_display')
    applicant_name = serializers.CharField(source='full_name')
    assigned_to_name = serializers.SerializerMethodField()

    class Meta:
        model = OnlineLoanApplication
        fields = [
            'id', 'reference', 'status', 'status_display', 'applicant_name', 'phone_primary', 'email',
            'product_name', 'branch', 'branch_name', 'requested_amount', 'term', 'term_unit',
            'repayment_frequency', 'submitted_at', 'assigned_to', 'assigned_to_name',
        ]

    def get_assigned_to_name(self, obj):
        u = obj.assigned_to
        return (u.get_full_name() or u.username) if u else None


class StaffApplicationDetailSerializer(StaffApplicationListSerializer):
    """
    Staff need the full identifiers to verify identity (BVN/NIN lookups).
    Access is gated by the online-loan-applications page permission.
    """
    reviewed_by_name = serializers.SerializerMethodField()
    converted_loan_number = serializers.CharField(source='converted_loan.loan_number', default=None)
    converted_client_code = serializers.CharField(source='converted_client.client_id', default=None)
    customer_email_verified = serializers.BooleanField(source='customer.is_email_verified')
    documents = StaffDocumentSerializer(many=True, read_only=True)

    class Meta(StaffApplicationListSerializer.Meta):
        fields = StaffApplicationListSerializer.Meta.fields + [
            'loan_purpose', 'title', 'first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth',
            'marital_status', 'phone_secondary', 'address_street', 'address_city', 'address_state',
            'nin', 'bvn', 'employment_status', 'occupation', 'employer_name', 'employer_address',
            'monthly_income', 'next_of_kin_name', 'next_of_kin_relationship', 'next_of_kin_phone',
            'bank_name', 'bank_account_name', 'bank_account_number',
            'consent_credit_check', 'consent_data_processing',
            'staff_notes', 'customer_message', 'reviewed_by', 'reviewed_by_name', 'reviewed_at',
            'converted_client', 'converted_client_code', 'converted_loan', 'converted_loan_number',
            'customer_email_verified', 'documents', 'updated_at',
        ]

    def get_reviewed_by_name(self, obj):
        u = obj.reviewed_by
        return (u.get_full_name() or u.username) if u else None


class StaffRejectSerializer(serializers.Serializer):
    customer_message = serializers.CharField(max_length=1000)
    staff_notes = serializers.CharField(max_length=4000, required=False, allow_blank=True)


class StaffConvertSerializer(serializers.Serializer):
    client_id = serializers.IntegerField(required=False, allow_null=True)
    create_new_client = serializers.BooleanField(default=False)
    cashier_account_id = serializers.IntegerField(required=False, allow_null=True)
    fee_routing = serializers.DictField(required=False)
    staff_notes = serializers.CharField(max_length=4000, required=False, allow_blank=True)


class MatchingClientSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    client_id = serializers.CharField()
    full_name = serializers.CharField()
    phone_primary = serializers.CharField()
    branch_name = serializers.CharField(source='branch.name', default=None)
    matched_on = serializers.SerializerMethodField()

    def get_matched_on(self, obj):
        app = self.context['application']
        hits = []
        if obj.nin and obj.nin == app.nin:
            hits.append('nin')
        if obj.bvn and obj.bvn == app.bvn:
            hits.append('bvn')
        if obj.phone_primary == app.phone_primary:
            hits.append('phone')
        return hits


# ─────────────────────────────────────────────────────────────────────────────
# Invitations
# ─────────────────────────────────────────────────────────────────────────────

class InvitationAcceptSerializer(serializers.Serializer):
    token = serializers.CharField(max_length=200)
    password = serializers.CharField(min_length=8, max_length=128, trim_whitespace=False)
    accept_terms = serializers.BooleanField()

    def validate_accept_terms(self, value):
        if not value:
            raise serializers.ValidationError('You must accept the terms to continue.')
        return value


class StaffInviteCreateSerializer(serializers.Serializer):
    client = serializers.IntegerField()
    email = serializers.EmailField(max_length=254)


class StaffInvitationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    email = serializers.EmailField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    expires_at = serializers.DateTimeField()
    accepted_at = serializers.DateTimeField(allow_null=True)
    created_by_name = serializers.SerializerMethodField()

    def get_created_by_name(self, obj):
        u = obj.created_by
        return (u.get_full_name() or u.username) if u else None


# ─────────────────────────────────────────────────────────────────────────────
# Director settings
# ─────────────────────────────────────────────────────────────────────────────

class PortalSettingsSerializer(serializers.Serializer):
    is_enabled = serializers.BooleanField()
    allow_registration = serializers.BooleanField()
    max_open_applications = serializers.IntegerField(min_value=1, max_value=5)
    public_url = serializers.URLField(allow_blank=True, max_length=200)
    support_phone = serializers.CharField(allow_blank=True, max_length=30)
    support_email = serializers.EmailField(allow_blank=True)
    terms_url = serializers.URLField(allow_blank=True, max_length=200)
    privacy_url = serializers.URLField(allow_blank=True, max_length=200)

    def validate_public_url(self, v):
        from urllib.parse import urlsplit
        if not v:
            return v
        u = urlsplit(v)
        local = u.hostname in ('localhost', '127.0.0.1')
        if u.scheme != 'https' and not local:
            raise serializers.ValidationError('Use an https:// address.')
        if u.path not in ('', '/') or u.query or u.fragment:
            raise serializers.ValidationError('Enter just the site address, e.g. https://erp.krystartrust.ng')
        return v.rstrip('/')

    def validate(self, attrs):
        if attrs.get('is_enabled') and not attrs.get('public_url'):
            from django.conf import settings as dj
            if not getattr(dj, 'PORTAL', {}).get('FRONTEND_URL', '').startswith('https://'):
                raise serializers.ValidationError(
                    {'public_url': 'Set the portal web address before switching the portal on, '
                                   'so links in emails work.'})
        return attrs


class OfferingWriteSerializer(serializers.Serializer):
    loan_product = serializers.IntegerField()
    is_active = serializers.BooleanField(default=True)
    display_name = serializers.CharField(allow_blank=True, max_length=150, required=False, default='')
    public_description = serializers.CharField(allow_blank=True, max_length=2000, required=False, default='')
    max_online_amount = serializers.DecimalField(max_digits=18, decimal_places=2, required=False, allow_null=True, min_value=1)
    sort_order = serializers.IntegerField(min_value=0, required=False, default=0)


# ─────────────────────────────────────────────────────────────────────────────
# Online withdrawals
# ─────────────────────────────────────────────────────────────────────────────

class WithdrawalCreateSerializer(serializers.Serializer):
    savings_account = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=1)
    payout_preference = serializers.ChoiceField(choices=['bank', 'cash'])
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default='')


class CustomerWithdrawalSerializer(serializers.Serializer):
    reference = serializers.CharField()
    account_number = serializers.CharField(source='savings_account.account_number')
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    payout_preference = serializers.CharField()
    payout_preference_display = serializers.CharField(source='get_payout_preference_display')
    reason = serializers.CharField()
    status = serializers.SerializerMethodField()
    status_display = serializers.SerializerMethodField()
    customer_message = serializers.CharField()
    submitted_at = serializers.DateTimeField()
    can_cancel = serializers.SerializerMethodField()

    def get_status(self, obj):
        return obj.customer_status[0]

    def get_status_display(self, obj):
        return obj.customer_status[1]

    def get_can_cancel(self, obj):
        return obj.status == 'submitted'


class StaffWithdrawalSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    reference = serializers.CharField()
    client_name = serializers.CharField(source='savings_account.client.full_name')
    client_code = serializers.CharField(source='savings_account.client.client_id')
    client_id = serializers.IntegerField(source='savings_account.client_id')
    account_number = serializers.CharField(source='savings_account.account_number')
    branch_name = serializers.CharField(source='branch.name', default=None)
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    payout_preference_display = serializers.CharField(source='get_payout_preference_display')
    reason = serializers.CharField()
    status = serializers.CharField()
    status_display = serializers.CharField(source='get_status_display')
    submitted_at = serializers.DateTimeField()
    customer_email = serializers.CharField(source='customer.email')
    reviewed_by_name = serializers.SerializerMethodField()
    reviewed_at = serializers.DateTimeField(allow_null=True)
    customer_message = serializers.CharField()
    staff_notes = serializers.CharField()
    forwarded_request = serializers.IntegerField(source='forwarded_request_id', allow_null=True)
    forwarded_status = serializers.CharField(source='forwarded_request.get_status_display', default=None)
    balance_now = serializers.SerializerMethodField()

    def get_reviewed_by_name(self, obj):
        u = obj.reviewed_by
        return (u.get_full_name() or u.username) if u else None

    def get_balance_now(self, obj):
        a = obj.savings_account
        try:
            return {'balance': a.account.balance, 'available': a.calculate_available_balance(),
                    'minimum_balance': a.minimum_balance}
        except Exception:
            return None


class StaffWithdrawalDecisionSerializer(serializers.Serializer):
    customer_message = serializers.CharField(max_length=1000, required=False, allow_blank=True, default='')
    staff_notes = serializers.CharField(max_length=2000, required=False, allow_blank=True, default='')
