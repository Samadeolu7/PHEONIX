# loans/serializers.py
from rest_framework import serializers
from common.serializers import TenantModelSerializer
from .models import (
    LoanProduct, LoanAccount, LoanRepaymentSchedule,
    LoanCollateral, LoanGuarantor,
    LoanVerificationRequest, LoanDisbursement,
    LoanProductFee, LoanProductSavingsRequirement, LoanFeeApplication,
    LoanRepaymentRequest, LoanRestructure, OfflinePaymentRecord,
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
            'term_unit', 'min_term_months', 'max_term_months',
            'first_repayment_buffer_days',
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
    # Read-only display fields pulled from the guarantor Client record
    guarantor_name = serializers.CharField(read_only=True)
    guarantor_client_id = serializers.CharField(read_only=True)
    guarantor_phone = serializers.CharField(read_only=True, default=None)
    guarantor_occupation = serializers.CharField(read_only=True, default=None)
    guarantor_address = serializers.CharField(read_only=True, default=None)

    # Read-only display fields pulled from the Guarantor profile
    guarantor_person_name = serializers.CharField(source='guarantor_person.full_name', read_only=True, default=None)
    guarantor_person_phone = serializers.CharField(source='guarantor_person.phone', read_only=True, default=None)
    guarantor_person_occupation = serializers.CharField(source='guarantor_person.occupation', read_only=True, default=None)
    guarantor_person_address = serializers.CharField(source='guarantor_person.address', read_only=True, default=None)

    class Meta:
        model = LoanGuarantor
        fields = [
            'id', 'loan',
            'guarantor', 'guarantor_person',
            'guarantor_name', 'guarantor_client_id', 'guarantor_phone',
            'guarantor_occupation', 'guarantor_address',
            'guarantor_person_name', 'guarantor_person_phone',
            'guarantor_person_occupation', 'guarantor_person_address',
            'guaranteed_amount', 'status', 'approval_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id',
            'guarantor_name', 'guarantor_client_id', 'guarantor_phone',
            'guarantor_occupation', 'guarantor_address',
            'guarantor_person_name', 'guarantor_person_phone',
            'guarantor_person_occupation', 'guarantor_person_address',
            'approval_date', 'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        loan = attrs.get('loan') or (self.instance.loan if self.instance else None)
        guarantor = attrs.get('guarantor') or (self.instance.guarantor if self.instance else None)
        guarantor_person = attrs.get('guarantor_person') or (self.instance.guarantor_person if self.instance else None)

        # Exactly one of guarantor / guarantor_person must be set
        if not guarantor and not guarantor_person:
            raise serializers.ValidationError(
                'Either a Client (guarantor) or a Guarantor profile (guarantor_person) must be set.'
            )
        if guarantor and guarantor_person:
            raise serializers.ValidationError(
                'Only one of guarantor or guarantor_person may be set, not both.'
            )

        if guarantor and loan:
            if guarantor.pk == loan.client_id:
                raise serializers.ValidationError(
                    {'guarantor': "A borrower cannot be their own guarantor."}
                )
            conflict_qs = LoanGuarantor.objects.filter(
                guarantor=guarantor,
                loan__status__in=LoanGuarantor.ACTIVE_LOAN_STATUSES,
            )
            if self.instance:
                conflict_qs = conflict_qs.exclude(pk=self.instance.pk)
            if conflict_qs.exists():
                name = guarantor.full_name
                raise serializers.ValidationError(
                    {'guarantor': (
                        f"{name} is already an active guarantor on another loan "
                        "and cannot be used until that loan is closed."
                    )}
                )

        if guarantor_person and loan:
            # Borrowers cannot be their own guarantor — via client record
            if hasattr(guarantor_person, 'converted_to_client') and guarantor_person.converted_to_client_id:
                if guarantor_person.converted_to_client_id == loan.client_id:
                    raise serializers.ValidationError(
                        {'guarantor_person': "A borrower cannot be their own guarantor."}
                    )
            # Check the guarantor person's active loan guarantees
            conflict_qs = LoanGuarantor.objects.filter(
                guarantor_person=guarantor_person,
                loan__status__in=LoanGuarantor.ACTIVE_LOAN_STATUSES,
            )
            if self.instance:
                conflict_qs = conflict_qs.exclude(pk=self.instance.pk)
            if conflict_qs.exists():
                name = guarantor_person.full_name
                raise serializers.ValidationError(
                    {'guarantor_person': (
                        f"{name} is already an active guarantor on another loan "
                        "and cannot be used until that loan is closed."
                    )}
                )

        # Compute the display name from whichever FK is set
        if guarantor:
            attrs['_display_name'] = guarantor.full_name
            attrs['_display_client_id'] = getattr(guarantor, 'client_id', None)
            attrs['_display_phone'] = getattr(guarantor, 'phone_primary', None) or ''
            attrs['_display_occupation'] = getattr(guarantor, 'occupation', None) or ''
            attrs['_display_address'] = getattr(guarantor, 'address_street', None) or ''
        elif guarantor_person:
            attrs['_display_name'] = guarantor_person.full_name
            attrs['_display_client_id'] = None
            attrs['_display_phone'] = getattr(guarantor_person, 'phone', None) or ''
            attrs['_display_occupation'] = getattr(guarantor_person, 'occupation', None) or ''
            attrs['_display_address'] = getattr(guarantor_person, 'address', None) or ''

        return attrs

    def to_representation(self, instance):
        data = super().to_representation(instance)
        # Populate display fields from whichever FK is set (safe even if FK is stale)
        if instance.guarantor_id:
            data['guarantor_name'] = getattr(instance.guarantor, 'full_name', None)
            data['guarantor_client_id'] = getattr(instance.guarantor, 'client_id', None)
            data['guarantor_phone'] = getattr(instance.guarantor, 'phone_primary', None)
            data['guarantor_occupation'] = getattr(instance.guarantor, 'occupation', None)
            data['guarantor_address'] = getattr(instance.guarantor, 'address_street', None)
        elif instance.guarantor_person_id:
            data['guarantor_name'] = getattr(instance.guarantor_person, 'full_name', None)
            data['guarantor_client_id'] = None
            data['guarantor_phone'] = getattr(instance.guarantor_person, 'phone', None)
            data['guarantor_occupation'] = getattr(instance.guarantor_person, 'occupation', None)
            data['guarantor_address'] = getattr(instance.guarantor_person, 'address', None)
        return data


class LoanAccountListSerializer(TenantModelSerializer):
    """Lightweight list serializer."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_phone = serializers.CharField(source='client.phone_primary', read_only=True, default='')
    group_name = serializers.CharField(source='client.group.name', read_only=True, default='')
    product_name = serializers.CharField(source='product.name', read_only=True)
    assigned_officer_name = serializers.SerializerMethodField()

    def get_assigned_officer_name(self, obj):
        officer = getattr(getattr(obj, 'client', None), 'assigned_officer', None)
        if not officer:
            return ''
        return officer.get_full_name() or officer.username or ''

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number', 'client', 'client_name',
            'client_phone', 'group_name',
            'product', 'product_name',
            'requested_amount', 'disbursed_amount', 'outstanding_principal',
            'processing_fee', 'insurance_amount',
            'term_months', 'term_unit',
            'repayment_frequency', 'status', 'risk_classification',
            'days_in_arrears', 'arrears_amount',
            'assigned_officer_name',
            'application_date', 'disbursement_date', 'maturity_date',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields


class LoanRestructureSerializer(serializers.ModelSerializer):
    restructured_by_name = serializers.SerializerMethodField()

    def get_restructured_by_name(self, obj):
        return obj.restructured_by.get_full_name() if obj.restructured_by else None

    class Meta:
        model = LoanRestructure
        fields = [
            'id', 'loan', 'effective_date',
            'restructured_by', 'restructured_by_name',
            'reason', 'notes',
            'old_term', 'old_term_unit', 'old_interest_rate',
            'old_repayment_frequency', 'old_outstanding_principal',
            'old_installment_amount', 'old_maturity_date',
            'new_term', 'new_term_unit', 'new_interest_rate',
            'new_repayment_frequency', 'new_installment_amount', 'new_maturity_date',
            'created_at',
        ]
        read_only_fields = fields


class LoanAccountDetailSerializer(TenantModelSerializer):
    """Full detail serializer including Java App 1 batch fields."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_bank_name = serializers.CharField(source='client.bank_name', read_only=True)
    client_bank_account_name = serializers.CharField(source='client.bank_account_name', read_only=True)
    client_bank_account_number = serializers.CharField(source='client.bank_account_number', read_only=True)
    client_bvn = serializers.CharField(source='client.bvn', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_requires_guarantor = serializers.BooleanField(source='product.requires_guarantor', read_only=True)
    product_min_guarantors = serializers.IntegerField(source='product.min_guarantors', read_only=True)
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

    # Computed / aliased convenience fields
    total_repaid = serializers.DecimalField(source='total_paid', max_digits=18, decimal_places=2, read_only=True)
    interest_method = serializers.CharField(source='product.interest_calculation_method', read_only=True)
    next_due_date = serializers.SerializerMethodField()
    last_payment_date = serializers.SerializerMethodField()
    restructures = LoanRestructureSerializer(many=True, read_only=True)
    contractual_interest_total = serializers.SerializerMethodField()

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number',
            'client', 'client_name',
            'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
            'product', 'product_name',
            'product_requires_guarantor', 'product_min_guarantors',
            # Amounts
            'requested_amount', 'approved_amount', 'disbursed_amount',
            'interest_rate', 'interest_method',
            'processing_fee', 'insurance_amount',
            'total_charges', 'charges_summary',
            'term_months', 'term_unit',
            'repayment_frequency', 'installment_amount', 'number_of_installments',
            # Status & dates
            'status', 'application_date', 'application_notes',
            'approval_date', 'approved_by',
            'disbursement_date', 'first_payment_date', 'maturity_date', 'closed_date',
            # Balances
            'outstanding_principal', 'outstanding_interest',
            'outstanding_fees', 'outstanding_penalties', 'total_outstanding',
            # Payments
            'total_paid', 'total_repaid',
            'principal_paid', 'interest_paid', 'fees_paid', 'penalties_paid',
            'installments_paid',
            # Computed schedule helpers
            'next_due_date', 'last_payment_date',
            # Arrears & risk
            'days_in_arrears', 'arrears_amount', 'risk_classification',
            # CBN compliance fields
            'interest_suspended', 'interest_suspended_at',
            'provision_pct', 'provision_amount',
            'contractual_interest_total',
            # Java App 1 hooks
            'last_batch_processed_at', 'batch_accrual_posted',
            # Related
            'repayment_schedule', 'collaterals', 'guarantors', 'restructures',
            'metadata',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name',
            'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
            'product_name',
            'product_requires_guarantor', 'product_min_guarantors',
            'total_outstanding', 'total_charges', 'charges_summary',
            'total_repaid', 'interest_method', 'next_due_date', 'last_payment_date',
            'interest_suspended', 'interest_suspended_at', 'provision_pct', 'provision_amount',
            'contractual_interest_total',
            'repayment_schedule', 'collaterals', 'guarantors', 'restructures',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

    def get_contractual_interest_total(self, obj):
        """Total future interest due from all schedule rows (paid + remaining)."""
        from django.db.models import Sum
        result = obj.repayment_schedule.aggregate(t=Sum('interest_due'))['t']
        return str(result) if result is not None else '0.00'

    def get_charges_summary(self, obj):
        return {
            'processing_fee': str(obj.processing_fee),
            'insurance_amount': str(obj.insurance_amount),
            'total_charges': str(obj.total_charges),
        }

    def get_next_due_date(self, obj):
        item = (
            obj.repayment_schedule
            .filter(status__in=('pending', 'partial', 'overdue'))
            .order_by('due_date', 'installment_number')
            .values_list('due_date', flat=True)
            .first()
        )
        return str(item) if item else None

    def get_last_payment_date(self, obj):
        item = (
            obj.repayment_schedule
            .filter(payment_date__isnull=False)
            .order_by('-payment_date')
            .values_list('payment_date', flat=True)
            .first()
        )
        return str(item) if item else None


class LoanAccountCreateSerializer(TenantModelSerializer):
    """Serializer for creating a new loan application."""

    class Meta:
        model = LoanAccount
        fields = [
            'client', 'product',
            'requested_amount', 'term_months', 'term_unit', 'repayment_frequency',
            'application_date', 'application_notes',
            'metadata',
        ]
        extra_kwargs = {
            'client': {'required': True},
            'product': {'required': True},
            'requested_amount': {'required': True},
            'term_months': {'required': True},
            'term_unit': {'required': False},
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
    # Recipient bank details — needed by the officer executing the transfer
    client_bank_name = serializers.CharField(source='loan.client.bank_name', read_only=True, default=None)
    client_bank_account_name = serializers.CharField(source='loan.client.bank_account_name', read_only=True, default=None)
    client_bank_account_number = serializers.CharField(source='loan.client.bank_account_number', read_only=True, default=None)
    client_bvn = serializers.CharField(source='loan.client.bvn', read_only=True, default=None)
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
            'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
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


class OfflinePaymentRecordSerializer(TenantModelSerializer):
    recorded_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()

    def get_recorded_by_name(self, obj):
        return obj.recorded_by.get_full_name() if obj.recorded_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    class Meta:
        model = OfflinePaymentRecord
        fields = [
            'id', 'loan', 'loan_number', 'client_name',
            'amount', 'payment_date', 'payment_mode', 'bank_reference', 'notes',
            'latitude', 'longitude', 'location_accuracy', 'location_address',
            'recorded_by', 'recorded_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name',
            'recorded_by', 'recorded_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

