from rest_framework import serializers

from treasury.models import (
    BankBorrowing,
    BorrowingAllocation,
    BorrowingContribution,
    BorrowingInstalment,
    TreasurySettings,
)


class TreasurySettingsSerializer(serializers.ModelSerializer):
    lookahead_days = serializers.IntegerField(min_value=7, max_value=180, required=False)
    smart_savings_notice_days = serializers.IntegerField(min_value=0, max_value=90, required=False)
    collection_rate_window_days = serializers.IntegerField(min_value=14, max_value=365, required=False)
    default_contribution_lead_days = serializers.IntegerField(min_value=0, max_value=60, required=False)
    max_collection_rate_pct = serializers.IntegerField(min_value=0, max_value=100, required=False)
    include_arrears_recovery = serializers.BooleanField(required=False)

    class Meta:
        model = TreasurySettings
        fields = [
            'lookahead_days', 'smart_savings_notice_days',
            'collection_rate_window_days', 'default_contribution_lead_days', 'max_collection_rate_pct',
            'include_arrears_recovery',
        ]


class ContributionSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)

    class Meta:
        model = BorrowingContribution
        fields = [
            'id', 'branch', 'branch_name', 'principal_part', 'interest_part', 'amount',
            'due_date', 'status', 'sent_at', 'transfer',
        ]


class InstalmentSerializer(serializers.ModelSerializer):
    contributions = ContributionSerializer(many=True, read_only=True)

    class Meta:
        model = BorrowingInstalment
        fields = [
            'id', 'number', 'due_date', 'principal_due', 'interest_due', 'total_due',
            'status', 'paid_at', 'contributions',
        ]


class AllocationSerializer(serializers.ModelSerializer):
    branch_name = serializers.CharField(source='branch.name', read_only=True)
    bank_account_name = serializers.SerializerMethodField()
    share = serializers.SerializerMethodField()

    class Meta:
        model = BorrowingAllocation
        fields = ['id', 'branch', 'branch_name', 'amount', 'bank_account', 'bank_account_name', 'share']

    def get_bank_account_name(self, obj):
        return str(obj.bank_account)

    def get_share(self, obj):
        return round(float(obj.share), 6)


class BorrowingListSerializer(serializers.ModelSerializer):
    debit_branch_name = serializers.CharField(source='debit_branch.name', read_only=True)
    paid_instalments = serializers.SerializerMethodField()
    next_due_date = serializers.SerializerMethodField()

    class Meta:
        model = BankBorrowing
        fields = [
            'id', 'lender_name', 'reference', 'principal', 'monthly_rate', 'tenor_months',
            'first_due_date', 'status', 'debit_branch', 'debit_branch_name', 'received_on',
            'paid_instalments', 'next_due_date',
        ]

    def get_paid_instalments(self, obj):
        return obj.instalments.filter(status=BorrowingInstalment.STATUS_PAID).count()

    def get_next_due_date(self, obj):
        nxt = obj.instalments.filter(status=BorrowingInstalment.STATUS_PENDING).order_by('number').first()
        return nxt.due_date if nxt else None


class BorrowingDetailSerializer(BorrowingListSerializer):
    allocations = AllocationSerializer(many=True, read_only=True)
    instalments = InstalmentSerializer(many=True, read_only=True)
    debit_bank_account_name = serializers.SerializerMethodField()

    class Meta(BorrowingListSerializer.Meta):
        fields = BorrowingListSerializer.Meta.fields + [
            'debit_bank_account', 'debit_bank_account_name', 'contribution_lead_days',
            'notes', 'allocations', 'instalments',
        ]

    def get_debit_bank_account_name(self, obj):
        return str(obj.debit_bank_account)


class AllocationInputSerializer(serializers.Serializer):
    branch = serializers.IntegerField()
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    bank_account = serializers.IntegerField()


class BorrowingInputSerializer(serializers.Serializer):
    """Used for both create and preview."""
    lender_name = serializers.CharField(max_length=200)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default='')
    principal = serializers.DecimalField(max_digits=18, decimal_places=2)
    monthly_rate = serializers.DecimalField(max_digits=7, decimal_places=3)
    tenor_months = serializers.IntegerField(min_value=1, max_value=360)
    first_due_date = serializers.DateField()
    debit_branch = serializers.IntegerField()
    debit_bank_account = serializers.IntegerField()
    contribution_lead_days = serializers.IntegerField(min_value=0, max_value=60, required=False)
    notes = serializers.CharField(required=False, allow_blank=True, default='')
    allocations = AllocationInputSerializer(many=True, allow_empty=False)


class ReceiveSerializer(serializers.Serializer):
    received_on = serializers.DateField(required=False)


class PaySerializer(serializers.Serializer):
    paid_on = serializers.DateField(required=False)
