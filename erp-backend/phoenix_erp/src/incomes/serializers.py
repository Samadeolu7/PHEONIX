# incomes/serializers.py
"""
Serializers for income, invoices, and fee entitlements
"""
from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone

from .models import (
    IncomeCategory, Income, FeeStructure, FeeStructureComponent,
    ServiceItem, Invoice, InvoiceItem, InvoiceItemPayment,
    FeeEntitlement, EntitlementPaymentLog, EntitlementUsageLog,
    EntitlementStatusLog, PaymentPlan, PaymentPlanInstallment
)
from clients.models import Client
from accounts.models import Account


class IncomeCategorySerializer(serializers.ModelSerializer):
    """Serializer for income categories"""
    
    class Meta:
        model = IncomeCategory
        fields = [
            'id', 'name', 'code', 'description', 'income_account',
            'behavior_config', 'parent_category', 'is_active',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


class IncomeSerializer(serializers.ModelSerializer):
    """Serializer for income transactions"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    is_fully_paid = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Income
        fields = [
            'id', 'category', 'category_name', 'client', 'client_name',
            'reference_number', 'income_date', 'description', 'amount',
            'amount_paid', 'balance', 'is_fully_paid', 'invoice',
            'inventory_allocation', 'status', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'balance', 'is_fully_paid']
    
    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive")
        return value


class ServiceItemSerializer(serializers.ModelSerializer):
    """Serializer for the service catalog (ServiceItem)."""
    category_name = serializers.CharField(source='category.name', read_only=True)
    # Allow null from the API; standard services send null when MR is disabled
    material_request_config = serializers.JSONField(required=False, allow_null=True, default=dict)

    class Meta:
        model = ServiceItem
        fields = [
            'id', 'name', 'code', 'description', 'category', 'category_name',
            'default_price',
            # Material-request control fields
            'service_type', 'allows_material_requests',
            'material_request_limit', 'material_request_config',
            'creates_entitlement', 'entitlement_config',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate_material_request_config(self, value):
        """Coerce null → empty dict; the DB column is NOT NULL (default=dict)."""
        if value is None:
            return {}
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        # If material requests are disabled, clear related fields automatically
        if not attrs.get('allows_material_requests', False):
            attrs['material_request_config'] = {}
            attrs['material_request_limit'] = None
        return attrs


class FeeStructureComponentSerializer(serializers.ModelSerializer):
    """Serializer for a single line of a FeeStructure template."""
    service_item_name = serializers.CharField(source='service_item.name', read_only=True)
    inventory_item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    effective_unit_price = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )
    line_total = serializers.DecimalField(
        max_digits=18, decimal_places=2, read_only=True
    )

    class Meta:
        model = FeeStructureComponent
        fields = [
            'id', 'component_type',
            'service_item', 'service_item_name',
            'inventory_item', 'inventory_item_name',
            'quantity', 'unit_price', 'effective_unit_price', 'line_total',
            'is_mandatory', 'order',
        ]


class FeeStructureSerializer(serializers.ModelSerializer):
    """Serializer for fee structures"""
    category_name = serializers.CharField(source='category.name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    components = FeeStructureComponentSerializer(many=True, read_only=True)
    computed_total = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    class Meta:
        model = FeeStructure
        fields = [
            'id', 'name', 'code', 'description', 'category', 'category_name',
            'base_amount', 'computed_total', 'is_recurring', 'frequency', 'industry_config',
            'components',
            'is_active', 'effective_from', 'effective_to',
            'approval_status', 'approved_by', 'approved_by_name', 'approved_at', 'approval_notes',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'approved_by', 'approved_at',
            'approval_status', 'computed_total',
        ]
    
    def validate(self, data):
        if data.get('is_recurring') and not data.get('frequency'):
            raise serializers.ValidationError({
                'frequency': 'Frequency is required for recurring fees'
            })
        return data


class FeeStructureApprovalSerializer(serializers.Serializer):
    """Serializer for approving or rejecting fee structures"""
    approval_notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Notes from approver or reason for rejection"
    )


class InvoiceItemSerializer(serializers.ModelSerializer):
    """Serializer for invoice line items"""
    item_type_display = serializers.CharField(source='get_item_type_display', read_only=True)
    service_item_name = serializers.CharField(source='service_item.name', read_only=True)
    inventory_item_name = serializers.CharField(source='inventory_item.name', read_only=True)
    inventory_item_sku = serializers.CharField(source='inventory_item.sku', read_only=True)
    # Inventory category info — populated when item_type='inventory'
    inventory_item_category = serializers.IntegerField(
        source='inventory_item.category_id', read_only=True, default=None
    )
    inventory_item_category_name = serializers.CharField(
        source='inventory_item.category.name', read_only=True, default=None
    )
    inventory_item_category_code = serializers.CharField(
        source='inventory_item.category.code', read_only=True, default=None
    )
    inventory_item_category_item_type = serializers.CharField(
        source='inventory_item.category.item_type', read_only=True, default=None
    )
    # Service item material-request flags — populated when item_type='service'
    service_item_service_type = serializers.CharField(
        source='service_item.service_type', read_only=True, default=None
    )
    service_item_allows_material_requests = serializers.BooleanField(
        source='service_item.allows_material_requests', read_only=True, default=False
    )
    service_item_material_request_config = serializers.JSONField(
        source='service_item.material_request_config', read_only=True, default=None
    )
    calculated_line_total = serializers.SerializerMethodField()
    amount_paid = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    line_balance = serializers.SerializerMethodField()
    payment_percentage = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'item_type', 'item_type_display',
            'service_item', 'service_item_name',
            'service_item_service_type',
            'service_item_allows_material_requests',
            'service_item_material_request_config',
            'inventory_item', 'inventory_item_name', 'inventory_item_sku',
            'inventory_item_category', 'inventory_item_category_name',
            'inventory_item_category_code', 'inventory_item_category_item_type',
            'description', 'quantity', 'unit_price',
            'discount_amount', 'tax_amount', 'line_total', 'calculated_line_total',
            'amount_paid', 'line_balance', 'payment_percentage',
            'reserved_from_location', 'reserved_quantity', 'is_stock_reduced',
            'creates_entitlement', 'entitlement', 'metadata',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'line_total', 'calculated_line_total',
            'entitlement', 'amount_paid', 'line_balance', 'payment_percentage',
        ]
    
    def get_calculated_line_total(self, obj):
        """Calculate line total for display"""
        return str(obj.calculate_line_total())

    def get_line_balance(self, obj):
        return str(obj.line_balance)

    def get_payment_percentage(self, obj):
        return str(obj.payment_percentage)
    
    def validate(self, data):
        """Validate item based on type"""
        item_type = data.get('item_type')

        # Service items: service_item FK is REQUIRED (select from service catalog)
        # Use item_type='custom' for free-text lines with no catalog entry
        if item_type == 'service' and not data.get('service_item'):
            raise serializers.ValidationError({
                'service_item': (
                    'A ServiceItem must be selected for service line items. '
                    'Use item_type="custom" for free-text lines.'
                )
            })

        # Inventory items: inventory_item is REQUIRED
        if item_type == 'inventory' and not data.get('inventory_item'):
            raise serializers.ValidationError({
                'inventory_item': 'Inventory item is required for inventory items'
            })

        # Validate positive values
        if data.get('quantity', 0) <= 0:
            raise serializers.ValidationError({
                'quantity': 'Quantity must be greater than zero'
            })

        if data.get('unit_price', 0) < 0:
            raise serializers.ValidationError({
                'unit_price': 'Unit price cannot be negative'
            })

        # Ensure description is provided for custom items
        if item_type == 'custom' and not data.get('description', '').strip():
            raise serializers.ValidationError({
                'description': 'Description is required for custom items'
            })

        return data


class InvoiceSerializer(serializers.ModelSerializer):
    """Unified serializer for invoices with line items"""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    fee_structure_name = serializers.CharField(source='fee_structure.name', read_only=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    items_count = serializers.SerializerMethodField()
    posted_by_name = serializers.SerializerMethodField()
    journal_entry_reference = serializers.SerializerMethodField()
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'client', 'client_name', 'invoice_number', 'invoice_date',
            'due_date', 'description', 'notes',
            # New amount fields
            'subtotal', 'discount_amount', 'tax_amount', 'total_amount',
            # Legacy field
            'amount', 'amount_paid', 'balance',
            'fee_structure', 'fee_structure_name', 'status', 'metadata',
            'inventory_allocation', 'is_overdue',
            # Account posting
            'is_posted', 'posted_at', 'posted_by', 'posted_by_name', 
            'journal_entry', 'journal_entry_reference',
            # Line items
            'items', 'items_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'balance', 'is_overdue', 'invoice_number',
            'subtotal', 'tax_amount', 'total_amount', 'items_count',
            'is_posted', 'posted_at', 'posted_by', 'posted_by_name',
            'journal_entry', 'journal_entry_reference'
        ]
    
    def get_items_count(self, obj):
        """Get count of line items"""
        return obj.items.count()
    
    def get_posted_by_name(self, obj):
        """Get name of user who posted the invoice"""
        if obj.posted_by:
            return f"{obj.posted_by.first_name} {obj.posted_by.last_name}".strip() or obj.posted_by.username
        return None
    
    def get_journal_entry_reference(self, obj):
        """Get journal entry reference number"""
        if obj.journal_entry:
            return obj.journal_entry.reference_number
        return None
    
    def validate(self, data):
        """Validate invoice dates"""
        invoice_date = data.get('invoice_date', getattr(self.instance, 'invoice_date', None) if hasattr(self, 'instance') and self.instance else None)
        due_date = data.get('due_date', getattr(self.instance, 'due_date', None) if hasattr(self, 'instance') and self.instance else None)
        
        if invoice_date and due_date and due_date < invoice_date:
            raise serializers.ValidationError({
                'due_date': 'Due date cannot be before invoice date.'
            })
        
        return data


class InvoiceCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating invoices with line items"""
    items = InvoiceItemSerializer(many=True, required=True)
    
    class Meta:
        model = Invoice
        fields = [
            'client', 'invoice_date', 'due_date', 'description', 'notes',
            'discount_amount', 'fee_structure', 'status', 'metadata',
            'items'
        ]
    
    def validate_items(self, value):
        """Ensure at least one item"""
        if not value or len(value) == 0:
            raise serializers.ValidationError("Invoice must have at least one line item")
        return value
    
    def create(self, validated_data):
        """Create invoice with line items"""
        from decimal import Decimal
        items_data = validated_data.pop('items')

        # Pre-compute totals from items so the post_save signal (receivables)
        # sees real amounts instead of the field default (0) on the very first save.
        _zero = Decimal('0')
        pre_subtotal = sum(
            (Decimal(str(item.get('line_total', 0))) if item.get('line_total') is not None
             else Decimal(str(item.get('quantity', 1))) * Decimal(str(item.get('unit_price', 0))))
            for item in items_data
        ) or _zero
        invoice_discount = Decimal(str(validated_data.get('discount_amount', 0) or 0))
        pre_total = pre_subtotal - invoice_discount

        # Create invoice with pre-computed totals
        invoice = Invoice.objects.create(
            subtotal=pre_subtotal,
            total_amount=pre_total,
            amount=pre_total,
            **validated_data
        )
        
        # Create line items
        for item_data in items_data:
            InvoiceItem.objects.create(invoice=invoice, **item_data)
        
        # Recalculate and persist accurate totals from saved line items
        invoice.update_totals()
        
        return invoice


class InvoiceUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating invoices"""
    items = InvoiceItemSerializer(many=True, required=False)
    
    class Meta:
        model = Invoice
        fields = [
            'client', 'invoice_date', 'due_date', 'description', 'notes',
            'discount_amount', 'fee_structure', 'status', 'metadata',
            'items'
        ]
    
    def update(self, instance, validated_data):
        """Update invoice and optionally replace line items"""
        items_data = validated_data.pop('items', None)
        
        # Update invoice fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # If items are provided, replace all items
        if items_data is not None:
            # Delete existing items
            instance.items.all().delete()
            
            # Create new items
            for item_data in items_data:
                InvoiceItem.objects.create(invoice=instance, **item_data)
            
            # Recalculate totals
            instance.update_totals()
        
        return instance


# Keep old InvoiceSerializer for backward compatibility (to be deprecated)
class InvoiceSerializerLegacy(serializers.ModelSerializer):
    """DEPRECATED: Serializer for invoices (old format)"""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    fee_structure_name = serializers.CharField(source='fee_structure.name', read_only=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = Invoice
        fields = [
            'id', 'client', 'client_name', 'invoice_number', 'invoice_date',
            'due_date', 'description', 'amount', 'amount_paid', 'balance',
            'fee_structure', 'fee_structure_name', 'status', 'metadata',
            'inventory_allocation', 'is_overdue',
            'created_at', 'updated_at'
        ]
        # invoice_number is generated server-side; mark it read-only so clients
        # are not required to provide it when creating invoices.
        read_only_fields = ['created_at', 'updated_at', 'balance', 'is_overdue', 'invoice_number']

    def validate(self, data):
        """Ensure amount is present and positive and dates are logical."""
        # Amount: consider update vs create
        amount = data.get('amount', None)
        if amount is None and getattr(self, 'instance', None) is not None:
            amount = getattr(self.instance, 'amount', None)

        if amount is None:
            raise serializers.ValidationError({'amount': 'This field is required.'})

        try:
            if Decimal(amount) <= Decimal('0.00'):
                raise serializers.ValidationError({'amount': 'Amount must be greater than zero.'})
        except TypeError:
            raise serializers.ValidationError({'amount': 'Invalid amount value.'})

        # Dates
        invoice_date = data.get('invoice_date', getattr(self.instance, 'invoice_date', None) if getattr(self, 'instance', None) else None)
        due_date = data.get('due_date', getattr(self.instance, 'due_date', None) if getattr(self, 'instance', None) else None)
        if invoice_date and due_date and due_date < invoice_date:
            raise serializers.ValidationError({'due_date': 'Due date cannot be before invoice date.'})

        return data


class EntitlementPaymentLogSerializer(serializers.ModelSerializer):
    """Serializer for payment logs"""
    
    class Meta:
        model = EntitlementPaymentLog
        fields = [
            'id', 'entitlement', 'amount', 'payment_date', 'balance_after',
            'transaction_entry', 'notes', 'created_at'
        ]
        read_only_fields = ['created_at', 'balance_after']


class EntitlementUsageLogSerializer(serializers.ModelSerializer):
    """Serializer for usage logs"""
    
    class Meta:
        model = EntitlementUsageLog
        fields = [
            'id', 'entitlement', 'units_consumed', 'remaining_units',
            'service_code', 'usage_date', 'location', 'metadata', 'created_at'
        ]
        read_only_fields = ['created_at', 'remaining_units']


class EntitlementStatusLogSerializer(serializers.ModelSerializer):
    """Serializer for status logs"""
    
    class Meta:
        model = EntitlementStatusLog
        fields = [
            'id', 'entitlement', 'old_status', 'new_status', 'reason', 'changed_at'
        ]
        read_only_fields = ['changed_at']


class FeeEntitlementSerializer(serializers.ModelSerializer):
    """Serializer for fee entitlements"""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    service_item_name = serializers.CharField(source='service_item.name', read_only=True)
    fee_structure_name = serializers.CharField(source='fee_structure.name', read_only=True)
    invoice_number = serializers.CharField(source='invoice.invoice_number', read_only=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    meets_minimum_requirement = serializers.BooleanField(read_only=True)
    remaining_units = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)

    # Related logs
    payment_logs = EntitlementPaymentLogSerializer(many=True, read_only=True)
    usage_logs = EntitlementUsageLogSerializer(many=True, read_only=True)
    status_logs = EntitlementStatusLogSerializer(many=True, read_only=True)

    class Meta:
        model = FeeEntitlement
        fields = [
            'id', 'client', 'client_name', 'invoice', 'invoice_number',
            'service_item', 'service_item_name',
            'fee_structure', 'fee_structure_name', 'academic_period',
            'payment_term_type', 'total_amount', 'amount_paid', 'minimum_required',
            'balance', 'payment_percentage', 'meets_minimum_requirement',
            'current_access_level', 'access_rules', 'status',
            'valid_from', 'valid_until', 'suspended_at', 'completed_at',
            'allocated_units', 'consumed_units', 'remaining_units',
            'inventory_allocation', 'payment_logs', 'usage_logs', 'status_logs',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'created_at', 'updated_at', 'balance', 'payment_percentage',
            'meets_minimum_requirement', 'remaining_units', 'current_access_level',
            'suspended_at', 'completed_at'
        ]


class FeeEntitlementListSerializer(serializers.ModelSerializer):
    """Lighter serializer for list views"""
    client_name = serializers.CharField(source='client.full_name', read_only=True)
    service_item_name = serializers.CharField(source='service_item.name', read_only=True)
    fee_structure_name = serializers.CharField(source='fee_structure.name', read_only=True)
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)

    class Meta:
        model = FeeEntitlement
        fields = [
            'id', 'client', 'client_name',
            'service_item', 'service_item_name',
            'fee_structure', 'fee_structure_name',
            'academic_period', 'payment_term_type', 'total_amount', 'amount_paid',
            'balance', 'payment_percentage', 'current_access_level', 'status',
            'valid_from', 'valid_until', 'created_at'
        ]


class PaymentPlanInstallmentSerializer(serializers.ModelSerializer):
    """Serializer for payment plan installments"""
    balance = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    is_overdue = serializers.BooleanField(read_only=True)
    
    class Meta:
        model = PaymentPlanInstallment
        fields = [
            'id', 'payment_plan', 'installment_number', 'due_date',
            'amount_due', 'amount_paid', 'penalty_amount', 'balance',
            'status', 'payment_date', 'is_overdue', 'created_at'
        ]
        read_only_fields = ['created_at', 'balance', 'is_overdue']


class PaymentPlanSerializer(serializers.ModelSerializer):
    """Serializer for payment plans"""
    entitlement_id = serializers.IntegerField(source='entitlement.id', read_only=True)
    client_name = serializers.CharField(source='entitlement.client.full_name', read_only=True)
    installments = PaymentPlanInstallmentSerializer(many=True, read_only=True)
    
    class Meta:
        model = PaymentPlan
        fields = [
            'id', 'entitlement', 'entitlement_id', 'client_name',
            'plan_name', 'description', 'total_amount', 'down_payment',
            'number_of_installments', 'installment_amount', 'frequency',
            'start_date', 'end_date', 'status', 'late_payment_penalty',
            'grace_period_days', 'installments', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']


# Action Serializers for specific operations

class RecordPaymentSerializer(serializers.Serializer):
    """Serializer for recording payment"""
    amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    payment_date = serializers.DateField(required=False)
    payment_method = serializers.CharField(max_length=50, required=False)
    bank_account_id = serializers.IntegerField(required=False)
    cashier_account_id = serializers.IntegerField(required=False)
    reference = serializers.CharField(max_length=255, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)

    # Optional per-line-item allocations.
    # If provided they must cover all items where payment is being made and must sum to `amount`.
    # If omitted the backend will distribute the payment proportionally across all line items.
    #
    # Format: [{"invoice_item_id": <int>, "amount": "<decimal>", "notes": "<optional str>"}]
    line_item_allocations = serializers.ListField(
        child=serializers.DictField(),
        required=False,
        allow_empty=True,
        help_text=(
            'Per-line-item payment allocations. '
            'Each entry: {"invoice_item_id": 1, "amount": "500.00", "notes": ""}. '
            'Must sum to the top-level amount field if provided.'
        ),
    )

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Payment amount must be positive")
        return value

    def validate_line_item_allocations(self, value):
        """Validate structure of each allocation entry."""
        from decimal import Decimal, InvalidOperation
        for idx, entry in enumerate(value):
            if 'invoice_item_id' not in entry:
                raise serializers.ValidationError(
                    f"Entry {idx}: 'invoice_item_id' is required"
                )
            if 'amount' not in entry:
                raise serializers.ValidationError(
                    f"Entry {idx}: 'amount' is required"
                )
            try:
                amt = Decimal(str(entry['amount']))
            except (InvalidOperation, TypeError):
                raise serializers.ValidationError(
                    f"Entry {idx}: 'amount' is not a valid decimal"
                )
            if amt <= 0:
                raise serializers.ValidationError(
                    f"Entry {idx}: 'amount' must be positive"
                )
        return value

    def validate(self, attrs):
        """Ensure allocation amounts sum to total payment amount (when provided)."""
        from decimal import Decimal
        allocations = attrs.get('line_item_allocations')
        if allocations:
            total = attrs.get('amount', Decimal('0'))
            alloc_sum = sum(Decimal(str(e['amount'])) for e in allocations)
            # Allow small rounding tolerance (0.01)
            if abs(alloc_sum - total) > Decimal('0.01'):
                raise serializers.ValidationError(
                    f"Line item allocation total ({alloc_sum}) must equal payment amount ({total})"
                )
        return attrs


class ConsumeUnitsSerializer(serializers.Serializer):
    """Serializer for consuming prepaid units"""
    units = serializers.DecimalField(max_digits=18, decimal_places=2)
    service_code = serializers.CharField(max_length=50, required=False)
    location = serializers.CharField(max_length=100, required=False)
    metadata = serializers.JSONField(required=False)
    
    def validate_units(self, value):
        if value <= 0:
            raise serializers.ValidationError("Units must be positive")
        return value


class CheckAccessSerializer(serializers.Serializer):
    """Serializer for checking service access"""
    service_code = serializers.CharField(max_length=50, required=False)


class AccessResponseSerializer(serializers.Serializer):
    """Response serializer for access checks"""
    can_access = serializers.BooleanField()
    reason = serializers.CharField()
    entitlement_status = serializers.CharField()
    payment_percentage = serializers.DecimalField(max_digits=5, decimal_places=2)
    access_level = serializers.CharField()


class RedeemInventorySerializer(serializers.Serializer):
    """Serializer for inventory redemption"""
    items = serializers.ListField(
        child=serializers.DictField(),
        help_text="List of items to redeem: [{'item_id': 1, 'quantity': 2}, ...]"
    )
    
    def validate_items(self, value):
        for item in value:
            if 'item_id' not in item or 'quantity' not in item:
                raise serializers.ValidationError(
                    "Each item must have 'item_id' and 'quantity'"
                )
            if item['quantity'] <= 0:
                raise serializers.ValidationError("Quantity must be positive")
        return value


class CreateInvoiceWithEntitlementSerializer(serializers.Serializer):
    """Serializer for creating invoice with entitlement"""
    client = serializers.IntegerField(source='client_id')
    client_id = serializers.IntegerField(required=False)
    fee_structure = serializers.IntegerField(source='fee_structure_id')
    fee_structure_id = serializers.IntegerField(required=False)
    academic_period = serializers.JSONField(required=False)
    
    # Support both old and new field names for payment terms
    payment_term_type = serializers.ChoiceField(
        choices=['full_upfront', 'minimum_deposit', 'installments', 'prepaid_allocation'],
        required=False
    )
    payment_terms = serializers.JSONField(required=False)
    
    minimum_deposit_percent = serializers.DecimalField(
        max_digits=5, decimal_places=2, required=False, default=0
    )
    installment_config = serializers.JSONField(required=False)
    inventory_allocation_id = serializers.IntegerField(required=False)
    access_rules = serializers.JSONField(required=False)
    
    def validate(self, data):
        """Handle multiple input formats"""
        # Handle client/client_id
        if 'client_id' not in data and 'client' in self.initial_data:
            data['client_id'] = self.initial_data['client']
        
        # Handle fee_structure/fee_structure_id
        if 'fee_structure_id' not in data and 'fee_structure' in self.initial_data:
            data['fee_structure_id'] = self.initial_data['fee_structure']
        
        # Handle payment_terms object
        if 'payment_terms' in data:
            payment_terms = data['payment_terms']
            if 'type' in payment_terms:
                data['payment_term_type'] = payment_terms['type']
            if 'minimum_percent' in payment_terms:
                data['minimum_deposit_percent'] = payment_terms['minimum_percent']
            if 'grace_period_days' in payment_terms:
                # Store for later use
                data['grace_period_days'] = payment_terms['grace_period_days']
        
        # Validate required fields
        if 'client_id' not in data:
            raise serializers.ValidationError({'client': 'This field is required'})
        if 'fee_structure_id' not in data:
            raise serializers.ValidationError({'fee_structure': 'This field is required'})
        if 'payment_term_type' not in data:
            raise serializers.ValidationError({'payment_term_type': 'This field is required'})
        
        return data
    
    def validate_client_id(self, value):
        if not Client.objects.filter(id=value).exists():
            raise serializers.ValidationError("Client not found")
        return value
    
    def validate_fee_structure_id(self, value):
        if not FeeStructure.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Fee structure not found or inactive")
        return value
    
    def validate_minimum_deposit_percent(self, value):
        if value < 0 or value > 100:
            raise serializers.ValidationError("Percentage must be between 0 and 100")
        return value


class EnrollSerializer(serializers.Serializer):
    """Serializer for enrolling a student/client (creates invoice + entitlement)"""
    client = serializers.IntegerField(help_text="Client ID")
    fee_structure = serializers.IntegerField(help_text="Fee Structure ID")
    academic_period = serializers.JSONField(
        required=False,
        help_text='{"year": "2024-2025", "term": "2", "start_date": "2025-01-20", "end_date": "2025-04-10"}'
    )
    payment_terms = serializers.JSONField(
        required=False,
        help_text='{"type": "minimum_deposit", "minimum_percent": 50, "full_access_percent": 80, "grace_period_days": 14}'
    )
    access_rules = serializers.JSONField(
        required=False,
        help_text='{"allowed_services": ["classes", "library"], "restricted_services": ["exams"]}'
    )
    inventory_allocation_id = serializers.IntegerField(required=False)
    
    def validate_client(self, value):
        if not Client.objects.filter(id=value).exists():
            raise serializers.ValidationError("Client not found")
        return value
    
    def validate_fee_structure(self, value):
        from incomes.models import FeeStructure
        if not FeeStructure.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Fee structure not found or inactive")
        return value


class FeeSummarySerializer(serializers.Serializer):
    """Summary of student/client fees"""
    client_id = serializers.IntegerField()
    client_name = serializers.CharField()
    total_fees = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_paid = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_balance = serializers.DecimalField(max_digits=18, decimal_places=2)
    active_entitlements = serializers.IntegerField()
    pending_entitlements = serializers.IntegerField()
    overdue_invoices = serializers.IntegerField()
    entitlements = FeeEntitlementListSerializer(many=True)


class BulkInvoiceCreateSerializer(serializers.Serializer):
    """Serializer for bulk invoice creation"""
    fee_structure = serializers.IntegerField()
    clients = serializers.ListField(
        child=serializers.IntegerField(),
        allow_empty=False
    )
    invoice_date = serializers.DateField()
    due_date = serializers.DateField()
    description_template = serializers.CharField(required=False, default="{student_name} - {fee_structure_name}")
    period_context = serializers.JSONField(required=False, default=dict)
    
    def validate_fee_structure(self, value):
        if not FeeStructure.objects.filter(id=value, is_active=True).exists():
            raise serializers.ValidationError("Fee structure not found or inactive")
        return value
    
    def validate_clients(self, value):
        if len(value) > 1000:
            raise serializers.ValidationError("Cannot create more than 1000 invoices at once")
        
        existing_count = Client.objects.filter(id__in=value).count()
        if existing_count != len(value):
            raise serializers.ValidationError(f"Some clients not found. Found {existing_count} of {len(value)}")
        return value
    
    def validate(self, attrs):
        if attrs['due_date'] < attrs['invoice_date']:
            raise serializers.ValidationError("Due date must be on or after invoice date")
        return attrs


# ============================================================================
# BULK INVOICE GENERATION SERIALIZERS
# ============================================================================

class DiscountProgramSummarySerializer(serializers.Serializer):
    """Summary of discount/scholarship program in invoice"""
    program_code = serializers.CharField()
    program_name = serializers.CharField()
    program_type = serializers.CharField()
    discount_type = serializers.CharField()
    discount_value = serializers.DecimalField(max_digits=10, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=18, decimal_places=2)


class StudentInvoicePreviewSerializer(serializers.Serializer):
    """Preview of individual student invoice with discount visibility"""
    invoice_id = serializers.IntegerField(required=False)
    reference_number = serializers.CharField(required=False)
    student_id = serializers.CharField()
    student_name = serializers.CharField()
    base_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    discount_amount = serializers.DecimalField(max_digits=18, decimal_places=2, default=0)
    final_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    has_discount = serializers.BooleanField(default=False)
    programs = DiscountProgramSummarySerializer(many=True, required=False)
    status = serializers.CharField(default='draft')
    needs_approval = serializers.BooleanField(default=False)


class GenerateBatchSerializer(serializers.Serializer):
    """Serializer for bulk invoice generation request"""
    term_id = serializers.IntegerField(
        help_text="AcademicTerm ID for which to generate invoices"
    )
    classification_id = serializers.IntegerField(
        help_text="ClientClassification ID (class/group of students)"
    )
    fee_structure_id = serializers.IntegerField(
        help_text="FeeStructure ID to apply to all students"
    )
    due_date = serializers.DateField(
        required=False,
        allow_null=True,
        help_text="Payment due date (defaults to term's payment_due_date)"
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Batch notes"
    )
    
    def validate(self, data):
        """Validate that referenced objects exist"""
        from incomes.models_calendar import AcademicTerm
        from clients.models import ClientClassification
        from incomes.models import FeeStructure
        
        # Validate term exists
        try:
            AcademicTerm.objects.get(id=data['term_id'])
        except AcademicTerm.DoesNotExist:
            raise serializers.ValidationError({
                'term_id': f"AcademicTerm with ID {data['term_id']} not found"
            })
        
        # Validate classification exists
        try:
            ClientClassification.objects.get(id=data['classification_id'])
        except ClientClassification.DoesNotExist:
            raise serializers.ValidationError({
                'classification_id': f"ClientClassification with ID {data['classification_id']} not found"
            })
        
        # Validate fee structure exists
        try:
            FeeStructure.objects.get(id=data['fee_structure_id'])
        except FeeStructure.DoesNotExist:
            raise serializers.ValidationError({
                'fee_structure_id': f"FeeStructure with ID {data['fee_structure_id']} not found"
            })
        
        return data


class BatchSummarySerializer(serializers.Serializer):
    """Summary of invoice batch with discount visibility"""
    batch_id = serializers.CharField()
    status = serializers.CharField()
    term = serializers.CharField()
    classification = serializers.CharField()
    total_invoices = serializers.IntegerField()
    draft_count = serializers.IntegerField()
    paid_count = serializers.IntegerField()
    total_students = serializers.IntegerField()
    students_with_discounts = serializers.IntegerField()
    discount_percentage = serializers.DecimalField(max_digits=10, decimal_places=4)
    total_base_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_discount_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    total_final_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    savings_percentage = serializers.DecimalField(max_digits=10, decimal_places=4)
    discount_summary = StudentInvoicePreviewSerializer(many=True)
    created_at = serializers.DateTimeField()
    notes = serializers.CharField(allow_blank=True)
    requires_approval = serializers.BooleanField()


class ApproveRejectSerializer(serializers.Serializer):
    """Serializer for batch approval/rejection"""
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
        help_text="Approval/rejection notes"
    )
    approved_discount_invoice_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_null=True,
        help_text="List of invoice IDs with approved discounts (null = approve all)"
    )


class BatchListSerializer(serializers.Serializer):
    """List view of invoice batches"""
    batch_id = serializers.CharField()
    term = serializers.CharField()
    classification = serializers.CharField()
    total_invoices = serializers.IntegerField()
    status = serializers.CharField()
    created_at = serializers.DateTimeField()
    total_amount = serializers.DecimalField(max_digits=18, decimal_places=2)
    has_discounts = serializers.BooleanField()


# ── Academic Calendar Serializers ─────────────────────────────────────────────

class AcademicTermSerializer(serializers.ModelSerializer):
    """Serializer for academic terms within an academic year."""

    class Meta:
        from incomes.models_calendar import AcademicTerm
        model = AcademicTerm
        fields = [
            'id', 'academic_year', 'name', 'code', 'term_number',
            'start_date', 'end_date', 'payment_due_date',
            'invoice_generation_date',
            'has_mid_term_break', 'mid_term_break_start', 'mid_term_break_end',
            'is_active', 'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def validate(self, data):
        start = data.get('start_date')
        end = data.get('end_date')
        if start and end and start >= end:
            raise serializers.ValidationError("end_date must be after start_date")
        return data


class AcademicYearSerializer(serializers.ModelSerializer):
    """Serializer for academic years (sessions)."""

    terms = AcademicTermSerializer(many=True, read_only=True)
    is_closed = serializers.SerializerMethodField()

    class Meta:
        from incomes.models_calendar import AcademicYear
        model = AcademicYear
        fields = [
            'id', 'name', 'code', 'start_date', 'end_date',
            'is_active', 'is_closed', 'term_system', 'terms',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at', 'is_closed']

    def get_is_closed(self, obj) -> bool:
        """An academic year is considered closed when it is no longer active
        and its end_date is in the past."""
        from django.utils import timezone
        today = timezone.now().date()
        return not obj.is_active and obj.end_date < today
