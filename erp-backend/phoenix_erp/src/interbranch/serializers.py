from decimal import Decimal

from rest_framework import serializers

from accounts.models import Account
from branches.models import Branch
from interbranch.models import InterBranchTransfer


class InterBranchTransferSerializer(serializers.ModelSerializer):
    """Read serializer for list/retrieve."""
    from_branch_name = serializers.CharField(source='from_branch.name', read_only=True)
    to_branch_name = serializers.CharField(source='to_branch.name', read_only=True)
    from_account_name = serializers.CharField(source='from_account.name', read_only=True)
    to_account_name = serializers.CharField(source='to_account.name', read_only=True)
    initiated_by_name = serializers.SerializerMethodField()
    source_transaction_reference = serializers.CharField(source='source_transaction.reference_number', read_only=True)
    destination_transaction_reference = serializers.CharField(source='destination_transaction.reference_number', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = InterBranchTransfer
        fields = [
            'id', 'transfer_number', 'date',
            'from_branch', 'from_branch_name', 'to_branch', 'to_branch_name',
            'from_account', 'from_account_name', 'to_account', 'to_account_name',
            'amount', 'description',
            'status', 'status_display',
            'source_transaction', 'source_transaction_reference',
            'destination_transaction', 'destination_transaction_reference',
            'initiated_by', 'initiated_by_name',
            'reversed_by', 'reversed_at', 'reversal_reason',
            'created_at', 'updated_at',
        ]
        read_only_fields = fields

    def get_initiated_by_name(self, obj):
        user = obj.initiated_by
        if not user:
            return None
        return getattr(user, 'get_full_name', lambda: None)() or getattr(user, 'email', str(user))


class CreateInterBranchTransferSerializer(serializers.Serializer):
    """Validates the shape of a create request. Actual creation is
    orchestrated by interbranch.services.create_interbranch_transfer, not
    serializer.save(), since it must build two linked Transactions."""
    from_branch_id = serializers.PrimaryKeyRelatedField(source='from_branch', queryset=Branch.objects.filter(is_deleted=False))
    to_branch_id = serializers.PrimaryKeyRelatedField(source='to_branch', queryset=Branch.objects.filter(is_deleted=False))
    from_account_id = serializers.PrimaryKeyRelatedField(source='from_account', queryset=Account.objects.filter(is_deleted=False))
    to_account_id = serializers.PrimaryKeyRelatedField(source='to_account', queryset=Account.objects.filter(is_deleted=False))
    amount = serializers.DecimalField(max_digits=18, decimal_places=2, min_value=Decimal('0.01'))
    description = serializers.CharField(max_length=255, required=False, allow_blank=True)
    date = serializers.DateField(required=False)


class ReverseInterBranchTransferSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=1000)
