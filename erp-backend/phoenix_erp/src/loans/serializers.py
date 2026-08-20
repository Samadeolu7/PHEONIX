# loans/serializers.py
from rest_framework import serializers
from common.serializers import TenantModelSerializer
from .models import (
    LoanProduct, LoanAccount, LoanRepaymentSchedule,
    LoanCollateral, LoanGuarantor,
    LoanVerificationRequest, LoanDisbursement,
    LoanProductFee, LoanProductSavingsRequirement, LoanFeeApplication,
    LoanRepaymentRequest, LoanRestructure, LoanRestructureRequest, OfflinePaymentRecord,
    LoanDisbursementCorrection, LoanRepaymentReversal, LoanRepaymentAllocation,
)


class LoanProductSerializer(TenantModelSerializer):
    # Expose name/code/description from the linked Product object (read-only here;
    # to change name/code use the Products endpoint directly).
    name = serializers.CharField(source='product.name', read_only=True)
    code = serializers.CharField(source='product.code', read_only=True)
    description = serializers.CharField(source='product.description', read_only=True, default='')
    is_active = serializers.BooleanField(source='product.is_active', read_only=True)

    parent_account_name = serializers.CharField(
        source='parent_account.name', read_only=True, default=None
    )
    disbursement_account_name = serializers.CharField(
        source='disbursement_account.name', read_only=True, default=None
    )
    interest_income_account_name = serializers.CharField(
        source='interest_income_account.name', read_only=True, default=None
    )
    fee_income_account_name = serializers.CharField(
        source='fee_income_account.name', read_only=True, default=None
    )
    penalty_income_account_name = serializers.CharField(
        source='penalty_income_account.name', read_only=True, default=None
    )
    insurance_income_account_name = serializers.CharField(
        source='insurance_income_account.name', read_only=True, default=None
    )
    accrued_interest_account_name = serializers.CharField(
        source='accrued_interest_account.name', read_only=True, default=None
    )
    unearned_interest_income_account_name = serializers.CharField(
        source='unearned_interest_income_account.name', read_only=True, default=None
    )
    interest_writeoff_expense_account_name = serializers.CharField(
        source='interest_writeoff_expense_account.name', read_only=True, default=None
    )

    class Meta:
        model = LoanProduct
        fields = [
            'id', 'product',
            'name', 'code', 'description',
            'parent_account', 'parent_account_name',
            'min_loan_amount', 'max_loan_amount',
            'term_unit', 'min_term_months', 'max_term_months',
            'first_repayment_buffer_days',
            'default_interest_rate', 'interest_calculation_method',
            'allowed_repayment_frequencies',
            'processing_fee_type', 'processing_fee_amount', 'processing_fee_percentage',
            'insurance_rate', 'insurance_income_account', 'insurance_income_account_name',
            'late_payment_penalty_type', 'late_payment_penalty', 'grace_period_days',
            'requires_collateral', 'collateral_percentage',
            'requires_guarantor', 'min_guarantors',
            'requires_approval',
            'is_active',
            # GL accounts
            'disbursement_account', 'disbursement_account_name',
            'interest_income_account', 'interest_income_account_name',
            'fee_income_account', 'fee_income_account_name',
            'penalty_income_account', 'penalty_income_account_name',
            'accrued_interest_account', 'accrued_interest_account_name',
            'unearned_interest_income_account', 'unearned_interest_income_account_name',
            'interest_writeoff_expense_account', 'interest_writeoff_expense_account_name',
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
            'principal_due', 'interest_due', 'fees_due', 'penalty_due', 'total_due',
            'principal_paid', 'interest_paid', 'fees_paid', 'penalty_paid', 'total_paid',
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
    client_image = serializers.ImageField(source='client.image', read_only=True, use_url=True)
    client_phone = serializers.CharField(source='client.phone_primary', read_only=True, default='')
    group_name = serializers.CharField(source='client.group.name', read_only=True, default='')
    product_name = serializers.CharField(source='product.name', read_only=True)
    assigned_officer_name = serializers.SerializerMethodField()
    total_outstanding = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    def get_assigned_officer_name(self, obj):
        # client.assigned_officer is an hr.Staff record, not a Django User —
        # it has first_name/last_name but no get_full_name()/username.
        officer = getattr(getattr(obj, 'client', None), 'assigned_officer', None)
        if not officer:
            return ''
        return f"{officer.first_name} {officer.last_name}".strip()

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number', 'client', 'client_name', 'client_image',
            'client_phone', 'group_name',
            'product', 'product_name',
            'requested_amount', 'disbursed_amount', 'outstanding_principal',
            'outstanding_interest', 'outstanding_fees', 'outstanding_penalties',
            'total_outstanding',
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
            'carried_interest', 'carried_penalties',
            'normal_interest_amount', 'restructure_interest_amount',
            'journal_entry',
            'created_at',
        ]
        read_only_fields = fields


class LoanAccountDetailSerializer(TenantModelSerializer):
    """Full detail serializer including Java App 1 batch fields."""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    client_image = serializers.ImageField(source='client.image', read_only=True, use_url=True)
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
    unearned_interest_remaining = serializers.SerializerMethodField()
    correction_window_expires_at = serializers.SerializerMethodField()

    def get_correction_window_expires_at(self, obj):
        """Last date a LoanDisbursementCorrection may be REQUESTED for this loan
        (see LoanDisbursementCorrection.is_within_correction_window, loans/models.py).
        None if the loan was never disbursed."""
        if not obj.original_disbursement_date:
            return None
        from datetime import timedelta
        from django.conf import settings
        return obj.original_disbursement_date + timedelta(
            days=settings.LOAN_DISBURSEMENT_CORRECTION_WINDOW_DAYS
        )

    class Meta:
        model = LoanAccount
        fields = [
            'id', 'loan_number',
            'client', 'client_name', 'client_image',
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
            'status', 'rejection_reason', 'application_date', 'application_notes',
            'approval_date', 'approved_by',
            'disbursement_date', 'first_payment_date', 'maturity_date', 'closed_date',
            'correction_window_expires_at',
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
            # Deferred/unearned interest income
            'interest_deferral_active', 'unearned_interest_remaining',
            # Java App 1 hooks
            'last_batch_processed_at', 'batch_accrual_posted',
            # Related
            'repayment_schedule', 'collaterals', 'guarantors', 'restructures',
            'metadata',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name', 'client_image',
            'client_bank_name', 'client_bank_account_name',
            'client_bank_account_number', 'client_bvn',
            'product_name',
            'product_requires_guarantor', 'product_min_guarantors',
            'total_outstanding', 'total_charges', 'charges_summary',
            'total_repaid', 'interest_method', 'next_due_date', 'last_payment_date',
            'correction_window_expires_at',
            'interest_suspended', 'interest_suspended_at', 'provision_pct', 'provision_amount',
            'contractual_interest_total',
            'interest_deferral_active', 'unearned_interest_remaining',
            'repayment_schedule', 'collaterals', 'guarantors', 'restructures',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

    def get_contractual_interest_total(self, obj):
        """Total future interest due from all schedule rows (paid + remaining)."""
        from django.db.models import Sum
        result = obj.repayment_schedule.aggregate(t=Sum('interest_due'))['t']
        return str(result) if result is not None else '0.00'

    def get_unearned_interest_remaining(self, obj):
        """Sum of interest_due from schedule rows not yet recognized as earned."""
        if not obj.interest_deferral_active:
            return '0.00'
        from django.db.models import Sum
        result = obj.repayment_schedule.filter(
            interest_recognized=False, interest_written_off=False,
        ).aggregate(t=Sum('interest_due'))['t']
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
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    client_image = serializers.ImageField(source='loan.client.image', read_only=True, use_url=True)

    class Meta:
        model = LoanVerificationRequest
        fields = [
            'id', 'loan', 'loan_number', 'client_name', 'client_image', 'nin_used',
            'active_loans_elsewhere', 'total_active_exposure',
            'default_rate_pct', 'flags',
            'recommended_amount', 'verdict', 'notes',
            'reviewed_by', 'reviewed_at',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan', 'loan_number', 'client_name', 'client_image', 'nin_used',
            'active_loans_elsewhere', 'total_active_exposure',
            'default_rate_pct', 'flags',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


class LoanDisbursementSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    client_image = serializers.ImageField(source='loan.client.image', read_only=True, use_url=True)
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
            'client_name', 'client_image', 'client_phone', 'loan_amount',
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
    client_image = serializers.ImageField(source='loan.client.image', read_only=True, use_url=True)
    savings_account_number = serializers.CharField(source='savings_account.account_number', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    covered_installments_detail = LoanRepaymentScheduleSerializer(
        source='covered_installments', many=True, read_only=True,
    )

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    class Meta:
        model = LoanRepaymentRequest
        fields = [
            'id', 'loan', 'loan_number', 'client_name', 'client_image',
            'savings_account', 'savings_account_number',
            'amount', 'payment_date', 'notes',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'covered_installments_detail',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name', 'client_image', 'savings_account_number',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'journal_entry',
            'covered_installments_detail',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


class LoanRestructureRequestSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    client_image = serializers.ImageField(source='loan.client.image', read_only=True, use_url=True)
    current_term = serializers.IntegerField(source='loan.term_months', read_only=True)
    current_term_unit = serializers.CharField(source='loan.term_unit', read_only=True)
    current_interest_rate = serializers.DecimalField(
        source='loan.interest_rate', max_digits=5, decimal_places=2, read_only=True,
    )
    outstanding_principal = serializers.DecimalField(
        source='loan.outstanding_principal', max_digits=18, decimal_places=2, read_only=True,
    )
    requested_by_name = serializers.SerializerMethodField()
    reviewed_by_name = serializers.SerializerMethodField()
    preview = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_reviewed_by_name(self, obj):
        return obj.reviewed_by.get_full_name() if obj.reviewed_by else None

    def get_preview(self, obj):
        """
        Preview the rate/interest split an approval would produce right now,
        without applying anything — lets the approver see exactly what
        they're signing off on. Recomputed live since outstanding_principal
        may have moved since the request was submitted.
        """
        if obj.status != obj.STATUS_PENDING:
            return None
        loan = obj.loan
        try:
            old_rate = loan.interest_rate
            old_term = loan.term_months
            if not old_term:
                return None
            from decimal import Decimal
            rate_per_unit = old_rate / Decimal(str(old_term))
            new_rate = (rate_per_unit * Decimal(str(obj.new_term))).quantize(Decimal('0.01'))
            balance = loan.outstanding_principal
            total_new_interest = (balance * new_rate / Decimal('100')).quantize(Decimal('0.01'))
            normal_interest_amount = (balance * old_rate / Decimal('100')).quantize(Decimal('0.01'))
            restructure_interest_amount = total_new_interest - normal_interest_amount
            return {
                'new_interest_rate': str(new_rate),
                'total_new_interest': str(total_new_interest),
                'normal_interest_amount': str(normal_interest_amount),
                'restructure_interest_amount': str(restructure_interest_amount),
            }
        except Exception:
            return None

    class Meta:
        model = LoanRestructureRequest
        fields = [
            'id', 'loan', 'loan_number', 'client_name', 'client_image',
            'current_term', 'current_term_unit', 'current_interest_rate', 'outstanding_principal',
            'new_term', 'effective_date', 'reason', 'notes', 'preview',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'restructure',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'loan_number', 'client_name', 'client_image',
            'current_term', 'current_term_unit', 'current_interest_rate', 'outstanding_principal', 'preview',
            'requested_by', 'requested_by_name',
            'status', 'reviewed_by', 'reviewed_by_name',
            'reviewed_at', 'rejection_reason', 'restructure',
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


class LoanDisbursementCorrectionSerializer(TenantModelSerializer):
    original_loan_number = serializers.CharField(source='original_loan.loan_number', read_only=True)
    wrong_client_name = serializers.CharField(source='original_loan.client.full_name', read_only=True)
    wrong_client_image = serializers.ImageField(source='original_loan.client.image', read_only=True, use_url=True)
    disbursed_amount = serializers.DecimalField(
        source='original_loan.disbursed_amount', max_digits=18, decimal_places=2, read_only=True,
    )
    correct_client_name = serializers.CharField(source='correct_client.full_name', read_only=True)
    correct_client_image = serializers.ImageField(source='correct_client.image', read_only=True, use_url=True)
    new_loan_number = serializers.CharField(source='new_loan.loan_number', read_only=True, default=None)
    requested_by_name = serializers.SerializerMethodField()
    first_approved_by_name = serializers.SerializerMethodField()
    second_approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_first_approved_by_name(self, obj):
        return obj.first_approved_by.get_full_name() if obj.first_approved_by else None

    def get_second_approved_by_name(self, obj):
        return obj.second_approved_by.get_full_name() if obj.second_approved_by else None

    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None

    class Meta:
        model = LoanDisbursementCorrection
        fields = [
            'id', 'reference_number',
            'original_loan', 'original_loan_number',
            'wrong_client_name', 'wrong_client_image', 'disbursed_amount',
            'correct_client', 'correct_client_name', 'correct_client_image',
            'reason', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'first_approved_by', 'first_approved_by_name', 'first_approved_at', 'first_approval_notes',
            'second_approved_by', 'second_approved_by_name', 'second_approved_at', 'second_approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'reversal_journal_entry', 'new_loan', 'new_loan_number',
            'notes',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference_number',
            'original_loan_number',
            'wrong_client_name', 'wrong_client_image', 'disbursed_amount',
            'correct_client_name', 'correct_client_image',
            'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'first_approved_by', 'first_approved_by_name', 'first_approved_at', 'first_approval_notes',
            'second_approved_by', 'second_approved_by_name', 'second_approved_at', 'second_approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'reversal_journal_entry', 'new_loan', 'new_loan_number',
            'owner', 'branch', 'created_at', 'updated_at',
        ]

    def validate(self, attrs):
        original_loan = attrs.get('original_loan') or (self.instance.original_loan if self.instance else None)
        correct_client = attrs.get('correct_client') or (self.instance.correct_client if self.instance else None)
        if original_loan and correct_client and original_loan.client_id == correct_client.pk:
            raise serializers.ValidationError(
                {'correct_client': "The correct client must be different from the loan's current client."}
            )
        return attrs


class LoanRepaymentReversalSerializer(TenantModelSerializer):
    loan_number = serializers.CharField(source='loan.loan_number', read_only=True)
    client_name = serializers.CharField(source='loan.client.full_name', read_only=True)
    journal_entry_reference = serializers.CharField(source='journal_entry.reference_number', read_only=True)
    journal_entry_date = serializers.DateField(source='journal_entry.date', read_only=True)
    requested_by_name = serializers.SerializerMethodField()
    first_approved_by_name = serializers.SerializerMethodField()
    second_approved_by_name = serializers.SerializerMethodField()
    rejected_by_name = serializers.SerializerMethodField()

    def get_requested_by_name(self, obj):
        return obj.requested_by.get_full_name() if obj.requested_by else None

    def get_first_approved_by_name(self, obj):
        return obj.first_approved_by.get_full_name() if obj.first_approved_by else None

    def get_second_approved_by_name(self, obj):
        return obj.second_approved_by.get_full_name() if obj.second_approved_by else None

    def get_rejected_by_name(self, obj):
        return obj.rejected_by.get_full_name() if obj.rejected_by else None

    class Meta:
        model = LoanRepaymentReversal
        fields = [
            'id', 'reference_number',
            'loan', 'loan_number', 'client_name',
            'journal_entry', 'journal_entry_reference', 'journal_entry_date',
            'amount', 'reason', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'first_approved_by', 'first_approved_by_name', 'first_approved_at', 'first_approval_notes',
            'second_approved_by', 'second_approved_by_name', 'second_approved_at', 'second_approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'reversal_journal_entry',
            'notes',
            'owner', 'branch', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'reference_number',
            'loan_number', 'client_name',
            'journal_entry_reference', 'journal_entry_date',
            'amount', 'status',
            'requested_by', 'requested_by_name', 'requested_at',
            'first_approved_by', 'first_approved_by_name', 'first_approved_at', 'first_approval_notes',
            'second_approved_by', 'second_approved_by_name', 'second_approved_at', 'second_approval_notes',
            'rejected_by', 'rejected_by_name', 'rejected_at', 'rejection_reason',
            'reversal_journal_entry',
            'owner', 'branch', 'created_at', 'updated_at',
        ]


class LoanRepaymentAllocationSerializer(serializers.ModelSerializer):
    """
    Read-only: how much of one payment (journal_entry) landed on one
    installment (schedule) — see LoanRepaymentAllocation, loans/models.py.
    schedule/installment_number are null for the "leftover" portion of a
    payment that had nowhere on the schedule to land.

    Used to show, per installment on the Repayment Schedule, every payment
    that contributed to it — so if reversing the payment someone actually
    meant to undo fails (e.g. it predates allocation tracking), the ones
    that also touched that installment and *do* have allocation rows are
    still visible as an alternative.
    """
    installment_number = serializers.SerializerMethodField()
    journal_entry_reference = serializers.CharField(source='journal_entry.reference_number', read_only=True)
    journal_entry_date = serializers.DateField(source='journal_entry.date', read_only=True)
    journal_entry_is_reversed = serializers.BooleanField(source='journal_entry.is_reversed', read_only=True)
    total_applied = serializers.SerializerMethodField()

    def get_installment_number(self, obj):
        return obj.schedule.installment_number if obj.schedule_id else None

    def get_total_applied(self, obj):
        return str(obj.principal_applied + obj.interest_applied + obj.fees_applied + obj.penalty_applied)

    class Meta:
        model = LoanRepaymentAllocation
        fields = [
            'id', 'loan', 'schedule', 'installment_number',
            'journal_entry', 'journal_entry_reference', 'journal_entry_date', 'journal_entry_is_reversed',
            'principal_applied', 'interest_applied', 'fees_applied', 'penalty_applied', 'total_applied',
            'created_at',
        ]
        read_only_fields = fields

