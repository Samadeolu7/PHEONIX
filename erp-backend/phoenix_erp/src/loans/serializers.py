# loans/serializers.py
from rest_framework import serializers
from common.serializers import TenantModelSerializer
from .models import (
    LoanProduct, LoanAccount, LoanRepaymentSchedule,
    LoanCollateral, LoanGuarantor,
    LoanVerificationRequest, LoanDisbursement,
    LoanProductFee, LoanProductSavingsRequirement, LoanFeeApplication,
    LoanRepaymentRequest,
)


class LoanProductSerializer(TenantModelSerializer):
    # Expose name/code/description from the linked Product object (read-only here;
    # to change name/code use the Products endpoint directly).
    name = serializers.CharField(source='product.name', read_only=True)
    code = serializers.CharField(source='product.code', read_only=True)
    description = serializers.CharField(source='product.description', read_only=True, default='')
    is_active = serializers.BooleanField(source='product.is_active', read_only=True)

    class Meta:
        model = LoanProduct
        fields = [
            'id', 'product',
            'name', 'code', 'description',
            'min_loan_amount', 'max_loan_amount',
            'min_term_months', 'max_term_months',
            'default_interest_rate', 'interest_calculation_method',
            'allowed_repayment_frequencies',
            'processing_fee_type', 'processing_fee_amount', 'processing_fee_percentage',
            'insurance_rate', 'insurance_income_account',
            'late_payment_penalty_type', 'late_payment_penalty', 'grace_period_days',
            'requires_collateral', 'collateral_percentage',
            'requires_guarantor', 'min_guarantors',
            'requires_approval',
            'is_active',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'name', 'code', 'description', 'is_active',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


class LoanRepaymentScheduleSerializer(TenantModelSerializer):
    class Meta:
        model = LoanRepaymentSchedule
        fields = [
            'id', 'loan', 'installment_number', 'due_date',
            'principal_due', 'interest_due', 'fees_due', 'total_due',
            'principal_paid', 'interest_paid', 'fees_paid', 'total_paid',
            'status', 'payment_date', 'days_late',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'loan', 'created_at', 'updated_at']


class LoanCollateralSerializer(TenantModelSerializer):
    class Meta:
        model = LoanCollateral
        fields = [
            'id', 'loan', 'collateral_type', 'description',
            'estimated_value', 'verified', 'verified_at',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'loan', 'verified_at', 'created_at', 'updated_at']


class LoanGuarantorSerializer(TenantModelSerializer):
    class Meta:
        model = LoanGuarantor
        fields = [
            'id', 'loan', 'name', 'relationship', 'phone',
            'occupation', 'home_address', 'office_address',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'loan', 'created_at', 'updated_at']


class LoanAccountListSerializer(TenantModelSerializer):
    """Lightweight list serializer."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number', 'client', 'client_name',
            'product', 'product_name',
            'disbursed_amount', 'outstanding_principal',
            'processing_fee', 'insurance_amount',
            'repayment_frequency', 'status', 'risk_classification',
            'days_in_arrears', 'arrears_amount',
            'application_date', 'disbursement_date', 'maturity_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class LoanAccountDetailSerializer(TenantModelSerializer):
    """Full detail serializer including Java App 1 batch fields."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    total_outstanding = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    total_charges = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    charges_summary = serializers.SerializerMethodField()
    repayment_schedule = LoanRepaymentScheduleSerializer(many=True, read_only=True)
    collaterals = LoanCollateralSerializer(source='collateral', many=True, read_only=True)
    guarantors = LoanGuarantorSerializer(many=True, read_only=True)

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number',
            'client', 'client_name',
            'product', 'product_name',
            # Amounts
            'requested_amount', 'approved_amount', 'disbursed_amount',
            'interest_rate', 'processing_fee', 'insurance_amount',
            'total_charges', 'charges_summary',
            'term_months',
            'repayment_frequency', 'installment_amount', 'number_of_installments',
            # Status & dates
            'status', 'application_date', 'application_notes',
            'approval_date', 'approved_by',
            'disbursement_date', 'first_payment_date', 'maturity_date', 'closed_date',
            # Balances
            'outstanding_principal', 'outstanding_interest',
            'outstanding_fees', 'outstanding_penalties', 'total_outstanding',
            # Payments
            'total_paid', 'principal_paid', 'interest_paid', 'fees_paid', 'penalties_paid',
            'installments_paid',
            # Arrears & risk
            'days_in_arrears', 'arrears_amount', 'risk_classification',
            # Java App 1 hooks
            'last_batch_processed_at', 'batch_accrual_posted',
            # Related
            'repayment_schedule', 'collaterals', 'guarantors',
            'metadata',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name', 'product_name',
            'total_outstanding', 'total_charges', 'charges_summary',
            'repayment_schedule', 'collaterals', 'guarantors',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

    def get_charges_summary(self, obj):
        return {
            'processing_fee': str(obj.processing_fee),
            'insurance_amount': str(obj.insurance_amount),
            'total_charges': str(obj.total_charges),
        }


class LoanAccountCreateSerializer(TenantModelSerializer):
    """Serializer for creating a new loan application."""

    class Meta:
        model = LoanAccount
        fields = [
            'client', 'product',
            'requested_amount', 'term_months', 'repayment_frequency',
            'application_date', 'application_notes',
            'metadata',
        ]
        extra_kwargs = {
            'client': {'required': True},
            'product': {'required': True},
            'requested_amount': {'required': True},
            'term_months': {'required': True},
        }

    def validate(self, attrs):
        product = attrs.get('product')
        frequency = attrs.get('repayment_frequency')
        if product and frequency:
            allowed = product.allowed_repayment_frequencies or []
            if allowed and frequency not in allowed:
                raise serializers.ValidationError({
                    'repayment_frequency': (
                        f"'{frequency}' is not allowed for this loan product. "
                        f"Allowed frequencies: {', '.join(allowed)}."
                    )
                })
        return attrs


class LoanVerificationRequestSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)

    class Meta:
        model = LoanVerificationRequest
        fields = [
            'id', 'loan', 'loan_number', 'nin_used',
            'active_loans_elsewhere', 'total_active_exposure',
            'default_rate_pct', 'flags',
            'recommended_amount', 'verdict', 'notes',
            'reviewed_by', 'reviewed_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan', 'loan_number', 'nin_used',
            'active_loans_elsewhere', 'total_active_exposure',
            'default_rate_pct', 'flags',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


class LoanDisbursementSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    client_phone = serializers.CharField(source='loan.client.phone_primary', read_only=True)
    loan_amount = serializers.DecimalField(
        source='loan.approved_amount', max_digits=18, decimal_places=2, read_only=True
    )
    disbursement_account_name = serializers.SerializerMethodField()
    disbursement_account_number = serializers.SerializerMethodField()
    disbursement_bank_name = serializers.SerializerMethodField()
    requested_by_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        u = obj.requested_by
        if not u:
            return ''
        return u.get_full_name() or u.username

    def get_approved_by_name(self, obj):
        u = obj.approved_by
        if not u:
            return ''
        return u.get_full_name() or u.username

    def get_disbursement_account_name(self, obj):
        if not obj.disbursement_account_id:
            return None
        try:
            return obj.disbursement_account.bank_account.account_name
        except Exception:
            return obj.disbursement_account.name

    def get_disbursement_account_number(self, obj):
        if not obj.disbursement_account_id:
            return None
        try:
            return obj.disbursement_account.bank_account.account_number
        except Exception:
            return obj.disbursement_account.code

    def get_disbursement_bank_name(self, obj):
        if not obj.disbursement_account_id:
            return None
        try:
            return str(obj.disbursement_account.bank_account.bank)
        except Exception:
            return None

    class Meta:
        model = LoanDisbursement
        fields = [
            'id', 'loan', 'loan_number',
            'client_name', 'client_phone', 'loan_amount',
            'requested_by', 'requested_by_name',
            'status', 'requested_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason',
            'disbursement_account', 'disbursement_account_name',
            'disbursement_account_number', 'disbursement_bank_name',
            'disbursement_date', 'disbursed_by',
            'notes',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan', 'loan_number', 'requested_at',
            'approved_by', 'approved_by_name', 'approved_at',
            'disbursed_by',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


# ---------------------------------------------------------------------------
# Product fee configuration serializers
# ---------------------------------------------------------------------------

class LoanProductFeeSerializer(TenantModelSerializer):
    default_savings_product_name = serializers.CharField(
        source='default_savings_product.name', read_only=True, default=None
    )
    gl_income_account_name = serializers.CharField(
        source='gl_income_account.name', read_only=True, default=None
    )

    class Meta:
        model = LoanProductFee
        fields = [
            'id', 'loan_product', 'name', 'fee_type',
            'fixed_amount', 'percentage', 'gl_income_account', 'gl_income_account_name',
            'posting_trigger', 'debit_destination',
            'default_savings_product', 'default_savings_product_name',
            'is_active', 'order',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'owner', 'branch', 'created_at', 'updated_at']


class LoanProductSavingsRequirementSerializer(TenantModelSerializer):
    savings_product_name = serializers.CharField(
        source='savings_product.name', read_only=True
    )

    class Meta:
        model = LoanProductSavingsRequirement
        fields = [
            'id', 'loan_product', 'savings_product', 'savings_product_name',
            'requirement_type', 'value', 'is_active',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'savings_product_name', 'owner', 'branch', 'created_at', 'updated_at']


class LoanFeeApplicationSerializer(TenantModelSerializer):
    fee_name = serializers.CharField(source='fee_config.name', read_only=True)
    gl_account_name = serializers.CharField(
        source='fee_config.gl_income_account.name', read_only=True
    )

    class Meta:
        model = LoanFeeApplication
        fields = [
            'id', 'loan_account', 'fee_config', 'fee_name',
            'gl_account_name', 'calculated_amount',
            'posted', 'posting_date', 'journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'fee_name', 'gl_account_name', 'owner', 'branch', 'created_at', 'updated_at']


class FeePreviewer(serializers.Serializer):
    """Read-only: preview fees for a given loan product and amount."""
    id = serializers.IntegerField(read_only=True)
    name = serializers.CharField(read_only=True)
    fee_type = serializers.CharField(read_only=True)
    calculated_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    posting_trigger = serializers.CharField(read_only=True)
    debit_destination = serializers.CharField(read_only=True)
    default_savings_product_id = serializers.IntegerField(read_only=True, allow_null=True)
    default_savings_product_name = serializers.CharField(read_only=True, allow_null=True)



class LoanRepaymentRequestSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    savings_account_number = serializers.CharField(source='savings_account.account_number', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    class Meta:
        model = LoanRepaymentRequest
        fields = [
            'id', 'loan', 'loan_number', 'client_name',
            'savings_account', 'savings_account_number',
            'amount', 'payment_date', 'notes',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name', 'savings_account_number',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

