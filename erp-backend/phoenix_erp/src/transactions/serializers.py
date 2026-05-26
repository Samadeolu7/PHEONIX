from rest_framework import serializers
from .models import Transaction, TransactionEntry, TransactionSeries
from accounts.models import Account


class TransactionSeriesSerializer(serializers.ModelSerializer):
    class Meta:
        model = TransactionSeries
        fields = ['id', 'code', 'description']


class AccountMinimalSerializer(serializers.ModelSerializer):
    """Minimal account info for transaction entries"""
    class Meta:
        model = Account
        fields = ['id', 'code', 'name']


class TransactionEntrySerializer(serializers.ModelSerializer):
    """Serializer for transaction entries"""
    account = AccountMinimalSerializer(read_only=True)
    account_id = serializers.PrimaryKeyRelatedField(
        queryset=Account.objects.all(),
        source='account',
        write_only=True
    )
    signed_amount = serializers.SerializerMethodField()
    
    class Meta:
        model = TransactionEntry
        fields = [
            'id', 'account', 'account_id', 'side', 
            'amount', 'signed_amount'
        ]
    
    def get_signed_amount(self, obj):
        return str(obj.signed_amount())


class TransactionSerializer(serializers.ModelSerializer):
    """Basic transaction serializer"""
    series = TransactionSeriesSerializer(read_only=True)
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True
    )
    reversed_by_name = serializers.CharField(
        source='reversed_by.get_full_name',
        read_only=True
    )
    entry_count = serializers.SerializerMethodField()
    total_debits = serializers.SerializerMethodField()
    total_credits = serializers.SerializerMethodField()
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'series', 'date', 'reference_number',
            'workflow_reference', 'description', 'approved',
            'approved_by_name', 'approved_at', 'is_reversed',
            'reversed_at', 'reversed_by_name', 'reversal_reason',
            'is_reversal', 'entry_count', 'total_debits', 
            'total_credits', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'id', 'reference_number', 'approved_at', 
            'reversed_at', 'created_at', 'updated_at'
        ]
    
    def get_entry_count(self, obj):
        return obj.entries.count()
    
    def get_total_debits(self, obj):
        from decimal import Decimal
        total = sum(
            e.amount for e in obj.entries.all() 
            if e.side == TransactionEntry.DEBIT
        )
        return str(total)
    
    def get_total_credits(self, obj):
        from decimal import Decimal
        total = sum(
            e.amount for e in obj.entries.all() 
            if e.side == TransactionEntry.CREDIT
        )
        return str(total)


class TransactionDetailSerializer(serializers.ModelSerializer):
    """Detailed transaction serializer with entries"""
    series = TransactionSeriesSerializer(read_only=True)
    entries = TransactionEntrySerializer(many=True, read_only=True)
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True
    )
    reversed_by_name = serializers.CharField(
        source='reversed_by.get_full_name',
        read_only=True
    )
    reversal_transaction_ref = serializers.CharField(
        source='reversal_transaction.reference_number',
        read_only=True
    )
    reverses_transaction_ref = serializers.CharField(
        source='reverses_transaction.reference_number',
        read_only=True
    )
    total_debits = serializers.SerializerMethodField()
    total_credits = serializers.SerializerMethodField()
    is_balanced = serializers.SerializerMethodField()
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'series', 'date', 'reference_number',
            'workflow_reference', 'description', 'approved',
            'approved_by_name', 'approved_at', 'is_reversed',
            'reversed_at', 'reversed_by_name', 'reversal_reason',
            'reversal_transaction_ref', 'is_reversal',
            'reverses_transaction_ref', 'entries', 'total_debits',
            'total_credits', 'is_balanced', 'created_at', 'updated_at'
        ]
    
    def get_total_debits(self, obj):
        from decimal import Decimal
        total = sum(
            e.amount for e in obj.entries.all() 
            if e.side == TransactionEntry.DEBIT
        )
        return str(total)
    
    def get_total_credits(self, obj):
        from decimal import Decimal
        total = sum(
            e.amount for e in obj.entries.all() 
            if e.side == TransactionEntry.CREDIT
        )
        return str(total)
    
    def get_is_balanced(self, obj):
        from decimal import Decimal
        total = sum(e.signed_amount() for e in obj.entries.all())
        return total == Decimal('0.00')


class CreateTransactionSerializer(serializers.Serializer):
    """Serializer for creating transactions"""
    series = serializers.IntegerField(write_only=True, source='series_id')
    series_id = serializers.IntegerField(write_only=True, required=False)
    date = serializers.DateField()
    description = serializers.CharField(max_length=255)
    workflow_reference = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True
    )
    entries = serializers.ListField(
        child=serializers.DictField(),
        min_length=2
    )
    
    def validate_entries(self, entries):
        """Validate that entries balance"""
        from decimal import Decimal
        
        if len(entries) < 2:
            raise serializers.ValidationError(
                "At least 2 entries required (debit and credit)"
            )
        
        total = Decimal('0.00')
        for entry in entries:
            # Normalize field names: accept both 'account' and 'account_id'
            if 'account' in entry and 'account_id' not in entry:
                entry['account_id'] = entry.pop('account')
            
            if 'account_id' not in entry:
                raise serializers.ValidationError("Each entry must have account_id or account")
            if 'side' not in entry:
                raise serializers.ValidationError("Each entry must have side (DR/CR)")
            if 'amount' not in entry:
                raise serializers.ValidationError("Each entry must have amount")
            
            amount = Decimal(str(entry['amount']))
            if entry['side'] == 'DR':
                total += amount
            else:
                total -= amount
        
        if total != Decimal('0.00'):
            raise serializers.ValidationError(
                f"Entries must balance. Current difference: {total}"
            )
        
        return entries
    
    def create(self, validated_data):
        """Create transaction with entries"""
        from django.db import transaction as db_transaction
        
        entries_data = validated_data.pop('entries')
        series_id = validated_data.pop('series_id')
        
        # Get owner and branch from context (set by view)
        request = self.context.get('request')
        if request and hasattr(request, 'user'):
            validated_data.setdefault('owner', request.user)
            validated_data.setdefault('created_by', request.user)
        if request and hasattr(request.user, 'default_branch'):
            validated_data.setdefault('branch', request.user.default_branch)
        
        with db_transaction.atomic():
            # Get series
            series = TransactionSeries.objects.get(pk=series_id)
            
            # Create transaction
            txn = Transaction.objects.create(
                series=series,
                **validated_data
            )
            
            # Create entries
            for entry_data in entries_data:
                TransactionEntry.objects.create(
                    transaction=txn,
                    account_id=entry_data['account_id'],
                    side=entry_data['side'],
                    amount=entry_data['amount']
                )
            
            # Post all entries
            for entry in txn.entries.all():
                entry.post()
        
        return txn