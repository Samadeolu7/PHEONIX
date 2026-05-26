"""
Expense Serializers

Comprehensive serializers for expense management including:
- Expense CRUD operations
- Expense category management
- Approval workflow integration
- Accounting integration
"""

from rest_framework import serializers
from decimal import Decimal
from django.utils import timezone
from django.db import transaction

from expenses.models import (
    Expense, ExpenseCategory, PrepaidExpense,
    PrepaidVoucher, Resource, ResourceConsumption
)
from accounts.models import Account
from users.models import User


class ExpenseCategorySerializer(serializers.ModelSerializer):
    """Serializer for expense categories"""
    
    expense_account_name = serializers.CharField(source='expense_account.name', read_only=True)
    prepaid_account_name = serializers.CharField(source='prepaid_account.name', read_only=True)
    
    class Meta:
        model = ExpenseCategory
        fields = [
            'id', 'name', 'code', 'description',
            'expense_account', 'expense_account_name',
            'prepaid_account', 'prepaid_account_name',
            'product', 'requires_approval', 'approval_threshold',
            'budget_amount', 'budget_period',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
        read_only_fields = ['branch', 'owner', 'created_at', 'updated_at']
    
    def validate_code(self, value):
        """Ensure code is unique within branch"""
        branch = self.context['request'].user.branch
        queryset = ExpenseCategory.objects.filter(branch=branch, code=value)
        
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise serializers.ValidationError(
                f"Category with code '{value}' already exists in this branch"
            )
        
        return value


class ExpenseSerializer(serializers.ModelSerializer):
    """Main serializer for expense CRUD operations"""
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    approved_by_name = serializers.CharField(source='approved_by.get_full_name', read_only=True)
    created_by_name = serializers.CharField(source='created_by.get_full_name', read_only=True)
    bank_account_number = serializers.CharField(source='bank_account.account_number', read_only=True)
    bank_account_name = serializers.CharField(source='bank_account.account_name', read_only=True)
    bank_name = serializers.CharField(source='bank_account.bank.bank_name', read_only=True)
    
    class Meta:
        model = Expense
        fields = [
            'id', 'reference_number', 'category', 'category_name',
            'expense_date', 'description', 'amount',
            'payee_name', 'payee_type',
            'payment_method', 'payment_reference',
            'bank_account', 'bank_account_number', 'bank_account_name', 'bank_name',
            'requires_approval', 'approved', 'approved_by', 'approved_by_name',
            'approved_at', 'is_posted', 'posted_at',
            'receipt_file', 'expense_type', 'origin_reference', 'parent_reference',
            'workflow_run', 'approval_chain', 'purchase_order',
            'subtotal', 'tax_amount_field', 'total_amount',
            'status', 'metadata',
            'branch', 'owner', 'created_by', 'created_by_name',
            'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'approved_by', 'approved_at',
            'is_posted', 'posted_at', 'branch', 'owner',
            'created_by', 'created_at', 'updated_at'
        ]
    
    def validate(self, data):
        """Validate expense data"""
        # Ensure amounts are consistent
        subtotal = data.get('subtotal', 0)
        tax_amount = data.get('tax_amount_field', 0)
        total_amount = data.get('total_amount', 0)
        
        expected_total = subtotal + tax_amount
        if abs(total_amount - expected_total) > Decimal('0.01'):
            raise serializers.ValidationError({
                'total_amount': f'Total amount ({total_amount}) should equal subtotal + tax ({expected_total})'
            })
        
        # If amount is provided but not subtotal, use amount as subtotal
        if 'amount' in data and 'subtotal' not in data:
            data['subtotal'] = data['amount']
            data['total_amount'] = data['amount'] + data.get('tax_amount_field', 0)
        
        # Check approval threshold
        category = data.get('category') or (self.instance.category if self.instance else None)
        if category and category.requires_approval:
            amount = data.get('total_amount', 0)
            if amount > category.approval_threshold:
                data['requires_approval'] = True
        
        # Validate status transitions
        if self.instance:
            old_status = self.instance.status
            new_status = data.get('status', old_status)
            
            # Can't directly set to 'approved' - must use approval action
            if old_status != 'approved' and new_status == 'approved':
                raise serializers.ValidationError({
                    'status': 'Use the approve endpoint to approve expenses'
                })
            
            # Can't post if not approved (when approval is required)
            if new_status == 'paid' and self.instance.requires_approval and not self.instance.approved:
                raise serializers.ValidationError({
                    'status': 'Expense must be approved before payment'
                })
        
        return data
    
    def create(self, validated_data):
        """Create expense with automatic reference number"""
        request = self.context.get('request')
        
        # Auto-generate reference number if not provided
        # (signal will handle this on save, so just ensure branch is set)
        
        # Set branch and created_by
        validated_data['branch'] = request.user.branch
        validated_data['created_by'] = request.user
        
        return super().create(validated_data)


class ExpenseReadSerializer(ExpenseSerializer):
    """Extended serializer for reading expenses with full related data"""
    
    category = ExpenseCategorySerializer(read_only=True)
    approved_by = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    
    def get_approved_by(self, obj):
        if obj.approved_by:
            return {
                'id': obj.approved_by.id,
                'username': obj.approved_by.username,
                'full_name': obj.approved_by.get_full_name()
            }
        return None
    
    def get_created_by(self, obj):
        if obj.created_by:
            return {
                'id': obj.created_by.id,
                'username': obj.created_by.username,
                'full_name': obj.created_by.get_full_name()
            }
        return None


class ExpenseApproveSerializer(serializers.Serializer):
    """Serializer for approving expenses"""
    
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        """Validate that expense can be approved"""
        expense = self.context['expense']
        user = self.context['request'].user
        
        if expense.status not in ['draft', 'submitted']:
            raise serializers.ValidationError(
                f"Cannot approve expense with status '{expense.status}'"
            )
        
        if expense.approved:
            raise serializers.ValidationError("Expense is already approved")
        
        if not expense.requires_approval:
            raise serializers.ValidationError("This expense does not require approval")
        
        return data


class ExpenseRejectSerializer(serializers.Serializer):
    """Serializer for rejecting expenses"""
    
    reason = serializers.CharField(required=True)
    
    def validate(self, data):
        """Validate that expense can be rejected"""
        expense = self.context['expense']
        
        if expense.status not in ['draft', 'submitted']:
            raise serializers.ValidationError(
                f"Cannot reject expense with status '{expense.status}'"
            )
        
        if expense.approved:
            raise serializers.ValidationError("Cannot reject an approved expense")
        
        return data


class ExpensePostSerializer(serializers.Serializer):
    """Serializer for posting expenses to accounting"""
    
    notes = serializers.CharField(required=False, allow_blank=True)
    
    def validate(self, data):
        """Validate that expense can be posted"""
        expense = self.context['expense']
        
        if expense.is_posted:
            raise serializers.ValidationError("Expense is already posted to accounting")
        
        if expense.status not in ['approved', 'paid']:
            raise serializers.ValidationError(
                f"Expense must be approved before posting (current status: {expense.status})"
            )
        
        if expense.requires_approval and not expense.approved:
            raise serializers.ValidationError("Expense must be approved before posting")
        
        return data


class PrepaidExpenseSerializer(serializers.ModelSerializer):
    """Serializer for prepaid expenses"""
    created_resource = serializers.SerializerMethodField(read_only=True)
    
    category_name = serializers.CharField(source='category.name', read_only=True)
    supplier_name_display = serializers.CharField(source='supplier.name', read_only=True)
    accounts_payable_id = serializers.IntegerField(source='accounts_payable.id', read_only=True)
    
    class Meta:
        model = PrepaidExpense
        fields = [
            'id', 'reference_number', 'category', 'category_name',
            'purchase_date', 'description',
            'total_amount', 'consumed_amount', 'remaining_amount',
            'measurable', 'unit_of_measure', 'total_units', 'consumed_units', 
            'remaining_units', 'unit_cost',
            'supplier', 'supplier_name', 'supplier_name_display', 'supplier_invoice',
            'accounts_payable_id',
            'journal_entry',
            'created_resource',
            'status', 'is_posted', 'posted_at',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'reference_number', 'consumed_amount', 'remaining_amount',
            'remaining_units', 'status', 'is_posted', 'posted_at',
            'branch', 'owner', 'created_at', 'updated_at', 'created_resource',
            'accounts_payable_id', 'supplier_name_display', 'journal_entry',
        ]
    
    def __init__(self, *args, **kwargs):
        """Initialize with dynamic resource field"""
        super().__init__(*args, **kwargs)
        
        # Add resource field dynamically based on request context
        from expenses.models import Resource
        request = self.context.get('request')
        
        # Determine queryset based on authenticated user
        if request and hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user
            if hasattr(user, 'branch') and user.branch:
                queryset = Resource.objects.filter(
                    branch=user.branch,
                    is_active=True
                )
            elif hasattr(user, 'tenant') and user.tenant:
                # User has no branch - filter by tenant only
                queryset = Resource.objects.filter(
                    tenant=user.tenant,
                    is_active=True
                )
            else:
                # User has neither branch nor tenant
                queryset = Resource.objects.none()
        else:
            # No authenticated user - return empty queryset
            queryset = Resource.objects.none()
        
        # Add the resource field
        self.fields['resource'] = serializers.PrimaryKeyRelatedField(
            queryset=queryset,
            required=False,
            allow_null=True,
            help_text="Link to existing Resource (if not provided, one will be auto-created for measurable items)"
        )
    
    def create(self, validated_data):
        """Create prepaid expense with automatic reference number and optional resource link"""
        from common.services.reference_service import ReferenceService
        from decimal import Decimal
        
        request = self.context.get('request')
        user = request.user
        
        # Extract resource if provided
        linked_resource = validated_data.pop('resource', None)
        
        # Set branch, owner, and tenant
        validated_data['branch'] = user.branch
        validated_data['owner'] = user
        validated_data['tenant'] = getattr(user, 'tenant', None)
        
        # Generate reference number BEFORE save to avoid constraint issues
        if not validated_data.get('reference_number'):
            tenant = getattr(user, 'tenant', user)
            validated_data['reference_number'] = ReferenceService.generate_reference(
                module='expenses',
                model_name='prepaid_expense',
                tenant=tenant,
                branch=user.branch
            )
        
        # Create the prepaid expense
        prepaid_expense = super().create(validated_data)

        # If a supplier is set, immediately post GL entry and create AP record.
        # Accounting: Dr Prepaid Expense (Asset) / Cr Accounts Payable (to supplier)
        # The AP is settled later via bank payment; the prepaid is then amortised.
        if prepaid_expense.supplier_id:
            from expenses.services.expense_accounting import PrepaidExpenseAccountingService
            service = PrepaidExpenseAccountingService(prepaid_expense)
            service.create_supplier_payable(posted_by=user)

        # If a Resource was explicitly linked, update its metadata
        if linked_resource:
            if not linked_resource.metadata:
                linked_resource.metadata = {}
            
            # Track this prepaid expense in the resource
            if 'prepaid_expenses' not in linked_resource.metadata:
                linked_resource.metadata['prepaid_expenses'] = []
            
            linked_resource.metadata['prepaid_expenses'].append({
                'id': prepaid_expense.id,
                'reference': prepaid_expense.reference_number,
                'amount': str(prepaid_expense.total_amount),
                'units': str(prepaid_expense.total_units) if prepaid_expense.measurable else None,
                'date': prepaid_expense.purchase_date.isoformat()
            })
            
            # Update default unit cost if this prepaid has a cost
            if prepaid_expense.unit_cost and prepaid_expense.unit_cost > 0:
                linked_resource.default_unit_cost = prepaid_expense.unit_cost
            
            linked_resource.save()
        
        # Otherwise, auto-create a Resource for this prepaid expense
        # Works for both measurable (unit-tracked) and non-measurable (amount-only) expenses
        else:
            self._ensure_resource_exists(prepaid_expense, user)
        
        return prepaid_expense

    def _ensure_resource_exists(self, prepaid_expense, user):
        """Create a Resource for this prepaid expense if none exists yet."""
        from expenses.models import Resource

        resource_code = f"PREP-{prepaid_expense.reference_number}"
        if Resource.objects.filter(resource_code=resource_code, branch=user.branch).exists():
            return  # already exists

        desc_lower = prepaid_expense.description.lower()
        unit_of_measure = prepaid_expense.unit_of_measure or 'transaction'
        unit_lower = unit_of_measure.lower()

        resource_type = 'consumable'
        if 'fuel' in desc_lower or unit_lower in ['l', 'liters', 'litres']:
            resource_type = 'fuel'
        elif 'electric' in desc_lower or unit_lower in ['kwh']:
            resource_type = 'electricity'
        elif 'water' in desc_lower or unit_lower in ['m3', 'm³']:
            resource_type = 'water'

        tracking_method = 'quantity' if prepaid_expense.measurable else 'amount'

        Resource.objects.create(
            resource_code=resource_code,
            name=f"{prepaid_expense.category.name} - {prepaid_expense.description[:50]}",
            description=(
                f"Auto-created from prepaid expense {prepaid_expense.reference_number}. "
                f"You can edit this resource to add irregularity detection, efficiency thresholds, etc."
            ),
            resource_type=resource_type,
            unit_of_measure=unit_of_measure,
            default_tracking_method=tracking_method,
            default_unit_cost=prepaid_expense.unit_cost,
            default_supplier=prepaid_expense.supplier,
            expense_category=prepaid_expense.category,
            is_active=True,
            owner=user,
            branch=user.branch,
            tenant=getattr(user, 'tenant', None),
            metadata={
                'prepaid_expense_id': prepaid_expense.id,
                'prepaid_expense_ref': prepaid_expense.reference_number,
                'total_prepaid_units': str(prepaid_expense.total_units) if prepaid_expense.measurable else None,
                'total_prepaid_amount': str(prepaid_expense.total_amount),
                'supplier_name': prepaid_expense.supplier_name or '',
                'auto_created': True,
            }
        )

    def update(self, instance, validated_data):
        """Update prepaid expense; also link/create Resource and backfill missing ones."""
        request = self.context.get('request')
        user = request.user

        linked_resource = validated_data.pop('resource', None)

        instance = super().update(instance, validated_data)

        if linked_resource:
            if not linked_resource.metadata:
                linked_resource.metadata = {}
            if 'prepaid_expenses' not in linked_resource.metadata:
                linked_resource.metadata['prepaid_expenses'] = []
            # Avoid duplicate entries
            existing_ids = [e.get('id') for e in linked_resource.metadata['prepaid_expenses']]
            if instance.id not in existing_ids:
                linked_resource.metadata['prepaid_expenses'].append({
                    'id': instance.id,
                    'reference': instance.reference_number,
                    'amount': str(instance.total_amount),
                    'units': str(instance.total_units) if instance.measurable else None,
                    'date': instance.purchase_date.isoformat()
                })
            if instance.unit_cost and instance.unit_cost > 0:
                linked_resource.default_unit_cost = instance.unit_cost
            linked_resource.save()
        else:
            # Backfill: create a resource if this expense doesn't have one yet
            self._ensure_resource_exists(instance, user)

        return instance

    def get_created_resource(self, obj):
        """Return basic info about the auto-created Resource, if any."""
        try:
            from expenses.models import Resource
            resource = Resource.objects.filter(metadata__prepaid_expense_id=obj.id, branch=obj.branch).first()
            if not resource:
                return None
            return {
                'id': resource.id,
                'resource_code': resource.resource_code,
                'name': resource.name,
                'resource_type': resource.resource_type,
                'unit_of_measure': resource.unit_of_measure
            }
        except Exception:
            return None

class ResourceConsumptionSerializer(serializers.ModelSerializer):
    """
    Serializer for ResourceConsumption with full CRUD support
    Handles both prepaid and postpaid flows
    """
    
    # Read-only display fields
    prepaid_voucher_number = serializers.CharField(
        source='prepaid_voucher.voucher_number',
        read_only=True
    )
    supplier_name = serializers.CharField(
        source='supplier.name',
        read_only=True
    )
    expense_category_name = serializers.CharField(
        source='resource.expense_category.name',
        read_only=True
    )
    asset_name = serializers.CharField(
        source='asset.name',
        read_only=True
    )
    asset_number = serializers.CharField(
        source='asset.asset_number',
        read_only=True
    )
    employee_name = serializers.CharField(
        source='employee.get_full_name',
        read_only=True
    )
    approved_by_name = serializers.CharField(
        source='approved_by.get_full_name',
        read_only=True
    )
    posted_by_name = serializers.CharField(
        source='posted_by.get_full_name',
        read_only=True
    )
    resource_name = serializers.CharField(
        source='resource.name',
        read_only=True
    )
    resource_type = serializers.CharField(
        source='resource.resource_type',
        read_only=True
    )
    # operator FK display — returns "First Last (Staff ID)" for front-end display
    operator_display = serializers.SerializerMethodField(read_only=True)
    
    # Computed fields
    remaining_voucher_balance = serializers.SerializerMethodField()
    
    class Meta:
        model = ResourceConsumption
        fields = [
            'id', 'consumption_number',
            'payment_flow', 'prepaid_voucher', 'prepaid_voucher_number',
            'supplier', 'supplier_name',
            'resource', 'resource_type', 'resource_name',
            'beneficiary_type', 'beneficiary_name', 'beneficiary_reference',
            'asset', 'asset_name', 'asset_number',
            'employee', 'employee_name',
            'consumption_date',
            'quantity_consumed', 'unit_of_measure', 'unit_cost', 'total_cost',
            'expense_category_name',
            'reading_type', 'previous_reading', 'current_reading',
            'usage_since_last', 'consumption_rate', 'expected_consumption',
            'is_irregular', 'irregularity_type', 'variance_percentage',
            'irregularity_notes', 'requires_explanation', 'explanation_provided',
            'approved_by', 'approved_by_name', 'approved_at',
            'operator', 'operator_name', 'operator_display', 'operator_signature',
            'consumption_location', 'receipt_number', 'receipt_photo',
            'invoice_number',
            'status', 'is_posted', 'posted_at', 'posted_by', 'posted_by_name',
            'accounts_payable',
            'journal_entry',
            'notes', 'metadata',
            'remaining_voucher_balance',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'consumption_number', 'usage_since_last', 'consumption_rate',
            'expected_consumption', 'is_irregular', 'irregularity_type',
            'variance_percentage', 'irregularity_notes', 'requires_explanation',
            'approved_at', 'is_posted', 'posted_at', 'posted_by',
            'accounts_payable', 'journal_entry', 'operator_display',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
    
    def get_remaining_voucher_balance(self, obj):
        """Get remaining balance on voucher"""
        if obj.prepaid_voucher:
            return {
                'units': float(obj.prepaid_voucher.remaining_units),
                'amount': float(obj.prepaid_voucher.remaining_amount)
            }
        return None

    def get_operator_display(self, obj):
        """Return a display string for the linked operator staff member."""
        if obj.operator_id:
            s = obj.operator
            return {
                'id': s.id,
                'staff_id': s.staff_id,
                'name': f'{s.first_name} {s.last_name}',
                'department': s.department,
                'position': s.position,
            }
        return None
    
    def validate(self, data):
        """Validate consumption data"""
        payment_flow = data.get('payment_flow', 'prepaid')
        
        # Validate prepaid flow
        if payment_flow == 'prepaid':
            if not data.get('prepaid_voucher'):
                raise serializers.ValidationError({
                    'prepaid_voucher': 'Prepaid flow requires a voucher'
                })
            
            # Check voucher balance
            voucher = data['prepaid_voucher']
            quantity = data.get('quantity_consumed', 0)
            
            # Block consumption against cancelled or expired vouchers
            if voucher.status in ('cancelled', 'fully_used'):
                raise serializers.ValidationError({
                    'prepaid_voucher': f'Cannot record consumption against a {voucher.status.replace("_", " ")} voucher.'
                })
            
            if voucher.expiry_date and voucher.expiry_date < timezone.now().date():
                raise serializers.ValidationError({
                    'prepaid_voucher': f'Voucher expired on {voucher.expiry_date}. Create a new voucher or extend the expiry.'
                })
            
            # Calculate remaining units (property accessor)
            remaining = voucher.allocated_units - voucher.consumed_units
            
            if quantity > remaining:
                raise serializers.ValidationError({
                    'quantity_consumed': f'Insufficient voucher balance. Available: {remaining} units, Requested: {quantity}'
                })
            
            # Cross-validate: consumption asset must match voucher beneficiary (when both are assets)
            if (
                voucher.beneficiary_type == 'asset'
                and voucher.beneficiary_reference
                and data.get('asset')
            ):
                asset = data['asset']
                asset_ref = getattr(asset, 'asset_number', None) or str(asset.id)
                if asset_ref != voucher.beneficiary_reference:
                    raise serializers.ValidationError({
                        'asset': (
                            f'This voucher was issued to asset {voucher.beneficiary_reference} '
                            f'({voucher.beneficiary_name}). You cannot record it against a different asset. '
                            f'If this is intentional (e.g. fleet reassignment), update the voucher first.'
                        )
                    })
            
            # Auto-fill resource from voucher's prepaid expense if not provided
            if not data.get('resource') and voucher.prepaid_expense:
                # ResourceSerializer.create() stores: metadata['prepaid_expenses'] = [expense_id, ...]
                # We also fall back to matching by direct FK on the resource's expense_category
                from expenses.models import Resource
                expense_id = voucher.prepaid_expense.id
                resource = (
                    Resource.objects.filter(
                        metadata__prepaid_expenses__contains=[expense_id],
                        branch=voucher.branch
                    ).first()
                    or Resource.objects.filter(
                        expense_category=voucher.prepaid_expense.category,
                        branch=voucher.branch,
                        is_active=True,
                    ).first()
                )
                
                if resource:
                    data['resource'] = resource
                else:
                    raise serializers.ValidationError({
                        'resource': 'No resource found for this voucher. Please create a resource first or link voucher to prepaid expense with resource.'
                    })
            
            # Auto-fill unit cost from voucher if not provided
            if not data.get('unit_cost') and voucher.prepaid_expense:
                data['unit_cost'] = voucher.prepaid_expense.unit_cost
            
            # Auto-fill unit of measure from resource
            if data.get('resource') and not data.get('unit_of_measure'):
                data['unit_of_measure'] = data['resource'].unit_of_measure
        
        # Validate postpaid flow
        if payment_flow == 'postpaid':
            if not data.get('supplier'):
                # Try to get from resource default
                if data.get('resource') and data['resource'].default_supplier:
                    data['supplier'] = data['resource'].default_supplier
                else:
                    raise serializers.ValidationError({
                        'supplier': 'Postpaid flow requires a supplier'
                    })
            
            # Auto-fill unit cost from resource if not provided
            if not data.get('unit_cost') and data.get('resource'):
                data['unit_cost'] = data['resource'].default_unit_cost
            
            # Auto-fill unit of measure from resource
            if data.get('resource') and not data.get('unit_of_measure'):
                data['unit_of_measure'] = data['resource'].unit_of_measure
        
        # Ensure resource is provided
        if not data.get('resource'):
            raise serializers.ValidationError({
                'resource': 'Resource is required'
            })
        
        # Validate reading consistency
        current_reading = data.get('current_reading')
        previous_reading = data.get('previous_reading')
        
        if current_reading and previous_reading:
            if current_reading < previous_reading:
                # Only allow with explicit approval note
                if not data.get('explanation_provided'):
                    raise serializers.ValidationError({
                        'current_reading': 'Current reading cannot be less than previous. Provide explanation.'
                    })
        
        # Calculate total cost if not provided
        if 'quantity_consumed' in data and 'unit_cost' in data:
            from decimal import Decimal
            data['total_cost'] = Decimal(str(data['quantity_consumed'])) * Decimal(str(data['unit_cost']))

        # Auto-populate operator_name string from the linked staff FK (for display/legacy purposes)
        if 'operator' in data and data['operator']:
            staff = data['operator']
            data['operator_name'] = f'{staff.first_name} {staff.last_name}'

        # Auto-populate beneficiary_name when employee FK is set
        if 'employee' in data and data['employee']:
            emp = data['employee']
            if not data.get('beneficiary_name'):
                data['beneficiary_name'] = f'{emp.first_name} {emp.last_name}'
        
        return data
    
    def create(self, validated_data):
        """Create resource consumption and update voucher balance if prepaid"""
        from django.db import transaction
        from decimal import Decimal
        
        request = self.context.get('request')
        validated_data['branch'] = request.user.branch
        validated_data['owner'] = request.user
        validated_data['tenant'] = getattr(request.user, 'tenant', None)
        
        with transaction.atomic():
            # Create the consumption record
            consumption = super().create(validated_data)
            
            # If prepaid flow, update voucher consumed amounts
            if consumption.payment_flow == 'prepaid' and consumption.prepaid_voucher:
                voucher = consumption.prepaid_voucher
                
                # Update consumed units and amount
                voucher.consumed_units += Decimal(str(consumption.quantity_consumed))
                voucher.consumed_amount += Decimal(str(consumption.total_cost))
                
                # Update voucher status based on remaining balance
                remaining_units = voucher.allocated_units - voucher.consumed_units
                if remaining_units <= 0:
                    voucher.status = 'fully_used'
                    voucher.is_redeemed = True
                    voucher.redemption_date = consumption.consumption_date
                elif voucher.consumed_units > 0:
                    voucher.status = 'partially_used'
                
                voucher.save()
                
                # Also update the linked PrepaidExpense
                if voucher.prepaid_expense:
                    prepaid = voucher.prepaid_expense
                    prepaid.consumed_units += Decimal(str(consumption.quantity_consumed))
                    prepaid.consumed_amount += Decimal(str(consumption.total_cost))
                    prepaid.save()  # save() method will auto-update remaining and status
            
            return consumption


class ResourceConsumptionDetailSerializer(ResourceConsumptionSerializer):
    """Extended serializer with additional details for detail views"""
    
    # Include full related objects
    prepaid_voucher_detail = serializers.SerializerMethodField()
    asset_detail = serializers.SerializerMethodField()
    historical_average = serializers.SerializerMethodField()
    
    class Meta(ResourceConsumptionSerializer.Meta):
        fields = ResourceConsumptionSerializer.Meta.fields + [
            'prepaid_voucher_detail', 'asset_detail', 'historical_average'
        ]
    
    def get_prepaid_voucher_detail(self, obj):
        """Get full voucher details"""
        if obj.prepaid_voucher:
            return {
                'voucher_number': obj.prepaid_voucher.voucher_number,
                'allocated_units': float(obj.prepaid_voucher.allocated_units),
                'consumed_units': float(obj.prepaid_voucher.consumed_units),
                'remaining_units': float(obj.prepaid_voucher.remaining_units),
                'status': obj.prepaid_voucher.status,
            }
        return None
    
    def get_asset_detail(self, obj):
        """Get asset consumption summary"""
        if obj.asset:
            # Note: Methods expect resource_id, not resource_type. Using None for now.
            avg = obj.asset.get_average_consumption_rate(resource_id=None)
            totals = obj.asset.get_total_consumption(resource_id=None, days=30)
            
            return {
                'asset_number': obj.asset.asset_number,
                'name': obj.asset.name,
                'current_reading': float(obj.asset.current_meter_reading) if obj.asset.current_meter_reading is not None else None,
                'average_consumption_rate': float(avg) if avg else None,
                'monthly_total_quantity': float(totals['total_quantity']) if totals['total_quantity'] is not None else 0,
                'monthly_total_cost': float(totals['total_cost']) if totals['total_cost'] is not None else 0,
            }
        return None
    
    def get_historical_average(self, obj):
        """Get historical average consumption rate"""
        if obj.asset:
            # Note: Method expects resource_id, not resource_type. Using None for now.
            return float(obj.asset.get_average_consumption_rate(resource_id=None) or 0)
        return None


class ResourceConsumptionListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for consumption history lists (used by resource and voucher history endpoints)"""

    resource_name = serializers.CharField(source='resource.name', read_only=True)
    resource_type = serializers.CharField(source='resource.resource_type', read_only=True)
    prepaid_voucher_number = serializers.CharField(
        source='prepaid_voucher.voucher_number', read_only=True
    )
    asset_name = serializers.CharField(source='asset.name', read_only=True)

    class Meta:
        model = ResourceConsumption
        fields = [
            'id', 'consumption_number',
            'payment_flow', 'prepaid_voucher', 'prepaid_voucher_number',
            'resource', 'resource_name', 'resource_type',
            'beneficiary_type', 'beneficiary_name',
            'asset', 'asset_name',
            'consumption_date', 'quantity_consumed', 'unit_of_measure',
            'unit_cost', 'total_cost',
            'reading_type', 'previous_reading', 'current_reading',
            'usage_since_last', 'consumption_rate',
            'is_irregular', 'irregularity_type', 'variance_percentage',
            'status', 'is_posted', 'posted_at',
            'created_at',
        ]


class ResourceConsumptionPostSerializer(serializers.Serializer):
    """Serializer for posting resource consumption"""
    
    explanation = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Explanation for irregular consumption (if flagged)"
    )
    
    def validate(self, data):
        """Validate posting prerequisites"""
        consumption = self.context['consumption']
        
        # Check if already posted
        if consumption.is_posted:
            raise serializers.ValidationError("Consumption already posted")
        
        # Check if flagged and needs explanation
        if consumption.is_irregular and consumption.requires_explanation:
            if not consumption.explanation_provided and not data.get('explanation'):
                raise serializers.ValidationError({
                    'explanation': 'Flagged consumption requires explanation before posting'
                })
        
        return data


class ResourceConsumptionApproveSerializer(serializers.Serializer):
    """Serializer for approving irregular consumption"""
    
    explanation = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Explanation for the irregularity"
    )
    
    approve = serializers.BooleanField(
        default=True,
        help_text="True to approve, False to reject"
    )
    
    rejection_reason = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Reason for rejection (if approve=False)"
    )
    
    def validate(self, data):
        """Validate approval data"""
        if not data.get('approve') and not data.get('rejection_reason'):
            raise serializers.ValidationError({
                'rejection_reason': 'Rejection reason required when rejecting'
            })
        
        return data


class ResourceConsumptionBulkPostSerializer(serializers.Serializer):
    """Serializer for bulk posting consumptions"""
    
    consumption_ids = serializers.ListField(
        child=serializers.IntegerField(),
        help_text="List of consumption IDs to post"
    )
    
    force_post = serializers.BooleanField(
        default=False,
        help_text="Force post even if flagged (requires approval rights)"
    )


# ============================================
# RESOURCE SERIALIZERS
# ============================================

class ResourceListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for resource lists"""
    
    expense_category_name = serializers.CharField(source='expense_category.name', read_only=True)
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    
    class Meta:
        model = Resource
        fields = [
            'id', 'resource_code', 'name', 'resource_type',
            'unit_of_measure', 'default_unit_cost', 'is_active',
            'expense_category', 'expense_category_name',
            'default_supplier', 'default_supplier_name',
            'default_tracking_method', 'is_service'
        ]


class ResourceSerializer(serializers.ModelSerializer):
    """Full serializer for Resource CRUD"""
    
    # Allow omitting resource_code — validate() will auto-generate one from type + name
    resource_code = serializers.CharField(
        max_length=50,
        required=False,
        allow_blank=True,
        default='',
        help_text="Unique code for this resource. Auto-generated if left blank."
    )

    expense_category_name = serializers.CharField(source='expense_category.name', read_only=True)
    expense_account_name = serializers.CharField(source='expense_category.expense_account.name', read_only=True)
    default_supplier_name = serializers.CharField(source='default_supplier.name', read_only=True)
    
    # Consumption statistics
    total_consumption_30days = serializers.SerializerMethodField()
    consumption_count_30days = serializers.SerializerMethodField()
    
    # Optional: Automatically create a prepaid expense when creating resource
    create_prepaid_expense = serializers.BooleanField(
        write_only=True,
        required=False,
        default=False,
        help_text="Set to true to automatically create a prepaid expense for this resource"
    )
    prepaid_expense_data = serializers.JSONField(
        write_only=True,
        required=False,
        help_text="Prepaid expense details if create_prepaid_expense is true"
    )
    
    class Meta:
        model = Resource
        fields = [
            'id', 'resource_code', 'name', 'description',
            'resource_type', 'unit_of_measure', 'default_tracking_method',
            'default_unit_cost', 'default_supplier', 'default_supplier_name',
            'expense_category', 'expense_category_name', 'expense_account_name',
            'is_service', 'service_contract_number', 'service_frequency',
            'enable_irregularity_detection', 'variance_threshold_percentage',
            'min_efficiency', 'max_efficiency', 'max_daily_usage',
            'is_active', 'metadata',
            'create_prepaid_expense', 'prepaid_expense_data',
            'total_consumption_30days', 'consumption_count_30days',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
        read_only_fields = ['branch', 'owner', 'created_at', 'updated_at']
    
    def get_total_consumption_30days(self, obj):
        """Get 30-day consumption totals"""
        try:
            return obj.get_total_consumption(days=30)
        except:
            return {'total_quantity': 0, 'total_cost': 0}
    
    def get_consumption_count_30days(self, obj):
        """Get 30-day consumption count"""
        try:
            return obj.get_consumption_count(days=30)
        except:
            return 0
    
    def validate_resource_code(self, value):
        """Ensure code is unique within branch"""
        # Empty value means auto-generation will happen in validate()
        if not value:
            return value

        branch = self.context['request'].user.branch
        queryset = Resource.objects.filter(branch=branch, resource_code=value)
        
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise serializers.ValidationError(
                f"Resource with code '{value}' already exists in this branch"
            )
        
        return value
    
    def validate(self, data):
        """Cross-field validation"""
        # Auto-generate resource_code if not provided
        if not data.get('resource_code') and not self.instance:
            # Generate code from resource type and name
            resource_type = data.get('resource_type', 'RES')
            name_part = data.get('name', '')[:3].upper().replace(' ', '')
            
            # Find next available number
            branch = self.context['request'].user.branch
            prefix = f"{resource_type.upper()}-{name_part}"
            existing = Resource.objects.filter(
                branch=branch,
                resource_code__startswith=prefix
            ).count()
            
            data['resource_code'] = f"{prefix}-{existing + 1:04d}"
        
        # Validate efficiency thresholds
        min_eff = data.get('min_efficiency')
        max_eff = data.get('max_efficiency')
        
        if min_eff and max_eff and min_eff >= max_eff:
            raise serializers.ValidationError({
                'min_efficiency': 'Min efficiency must be less than max efficiency'
            })
        
        # Service resources should have service details
        if data.get('is_service'):
            if not data.get('service_contract_number'):
                raise serializers.ValidationError({
                    'service_contract_number': 'Contract number required for services'
                })
        
        # Validate prepaid expense data if provided
        if data.get('create_prepaid_expense'):
            prepaid_data = data.get('prepaid_expense_data')
            if not prepaid_data:
                raise serializers.ValidationError({
                    'prepaid_expense_data': 'Prepaid expense data required when create_prepaid_expense is true'
                })
            
            required_fields = ['purchase_date', 'description', 'total_amount']
            missing = [f for f in required_fields if f not in prepaid_data]
            if missing:
                raise serializers.ValidationError({
                    'prepaid_expense_data': f'Missing required fields: {", ".join(missing)}'
                })
        
        return data
    
    def create(self, validated_data):
        """Create resource and optionally create linked prepaid expense"""
        # Extract prepaid expense flags
        create_prepaid = validated_data.pop('create_prepaid_expense', False)
        prepaid_data = validated_data.pop('prepaid_expense_data', None)
        
        # Create the resource
        resource = super().create(validated_data)
        
        # Create prepaid expense if requested
        if create_prepaid and prepaid_data:
            from expenses.models import PrepaidExpense
            from common.services.reference_service import ReferenceService
            
            request = self.context.get('request')
            user = request.user
            tenant = getattr(user, 'tenant', None)
            
            # Prepare prepaid expense data
            prepaid_expense_data = {
                'category': resource.expense_category,
                'purchase_date': prepaid_data.get('purchase_date'),
                'description': prepaid_data.get('description'),
                'total_amount': prepaid_data.get('total_amount'),
                'measurable': prepaid_data.get('measurable', True),
                'unit_of_measure': resource.unit_of_measure,
                'total_units': prepaid_data.get('total_units', 0),
                'unit_cost': prepaid_data.get('unit_cost', resource.default_unit_cost),
                'supplier': resource.default_supplier,
                'supplier_name': prepaid_data.get('supplier_name', ''),
                'supplier_invoice': prepaid_data.get('supplier_invoice', ''),
                'owner': user,
                'branch': user.branch,
                'tenant': tenant,
            }
            
            # Generate reference
            prepaid_expense_data['reference_number'] = ReferenceService.generate_reference(
                module='expenses',
                model_name='prepaid_expense',
                tenant=tenant,
                branch=user.branch
            )
            
            # Create prepaid expense
            prepaid_expense = PrepaidExpense.objects.create(**prepaid_expense_data)
            
            # Link back to resource in metadata
            if not resource.metadata:
                resource.metadata = {}
            
            resource.metadata['prepaid_expenses'] = [{
                'id': prepaid_expense.id,
                'reference': prepaid_expense.reference_number,
                'amount': str(prepaid_expense.total_amount),
                'units': str(prepaid_expense.total_units) if prepaid_expense.measurable else None,
                'date': prepaid_expense.purchase_date.isoformat()
            }]
            resource.save()
        
        return resource


class PrepaidVoucherListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for voucher lists"""
    
    prepaid_expense_name = serializers.CharField(source='prepaid_expense.description', read_only=True)
    remaining_units = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    linked_resource = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = PrepaidVoucher
        fields = [
            'id', 'voucher_number', 'prepaid_expense', 'prepaid_expense_name',
            'issue_date', 'expiry_date', 'beneficiary_type', 'beneficiary_name',
            'beneficiary_reference', 'odometer_reading',
            'allocated_units', 'allocated_amount',
            'consumed_units', 'consumed_amount',
            'remaining_units', 'remaining_amount',
            'status', 'is_redeemed', 'linked_resource',
        ]
    
    def get_linked_resource(self, obj):
        """Return the Resource linked to this voucher's PrepaidExpense, if any."""
        from expenses.models import Resource
        try:
            # Auto-created resources store prepaid_expense_id directly in metadata
            resource = Resource.objects.filter(
                metadata__prepaid_expense_id=obj.prepaid_expense_id,
                branch=obj.branch,
                is_active=True
            ).values('id', 'name', 'unit_of_measure', 'default_tracking_method').first()
            if not resource:
                # Explicitly linked resources store a list under prepaid_expenses
                resource = Resource.objects.filter(
                    metadata__prepaid_expenses__contains=[{'id': obj.prepaid_expense_id}],
                    branch=obj.branch,
                    is_active=True
                ).values('id', 'name', 'unit_of_measure', 'default_tracking_method').first()
            return dict(resource) if resource else None
        except Exception:
            return None


class PrepaidVoucherSerializer(serializers.ModelSerializer):
    """Full serializer for PrepaidVoucher CRUD"""
    
    prepaid_expense_name = serializers.CharField(source='prepaid_expense.description', read_only=True)
    asset_name = serializers.SerializerMethodField()
    employee_name = serializers.SerializerMethodField()
    beneficiary_staff_display = serializers.SerializerMethodField(read_only=True)
    remaining_units = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    remaining_amount = serializers.DecimalField(max_digits=18, decimal_places=2, read_only=True)
    consumption_count = serializers.SerializerMethodField()
    
    class Meta:
        model = PrepaidVoucher
        fields = [
            'id', 'voucher_number', 'prepaid_expense', 'prepaid_expense_name',
            'issue_date', 'expiry_date',
            'beneficiary_type', 'beneficiary_name', 'beneficiary_reference',
            'beneficiary_staff', 'beneficiary_staff_display',
            'asset_name', 'employee_name',
            'allocated_units', 'allocated_amount',
            'consumed_units', 'consumed_amount',
            'remaining_units', 'remaining_amount',
            'status', 'is_redeemed', 'redemption_date', 'redemption_location',
            'odometer_reading',
            'notes', 'consumption_count',
            'branch', 'owner', 'created_at', 'updated_at'
        ]
        read_only_fields = [
            'voucher_number', 'consumed_units', 'consumed_amount',
            'remaining_units', 'remaining_amount', 'status',
            'is_redeemed', 'branch', 'owner', 'created_at', 'updated_at',
            'beneficiary_staff_display',
        ]
        extra_kwargs = {
            'beneficiary_reference': {'required': False, 'allow_blank': True, 'allow_null': True},
            'redemption_location': {'required': False, 'allow_blank': True, 'allow_null': True},
            'notes': {'required': False, 'allow_blank': True, 'allow_null': True},
        }
    
    def to_internal_value(self, data):
        """Convert null to empty string for optional text fields before validation."""
        mutable = data.copy() if hasattr(data, 'copy') else dict(data)
        for field in ('beneficiary_reference', 'redemption_location', 'notes'):
            if mutable.get(field) is None:
                mutable[field] = ''
        return super().to_internal_value(mutable)
    
    def get_asset_name(self, obj):
        """Get asset name if beneficiary is asset"""
        if obj.beneficiary_type == 'asset' and obj.beneficiary_reference:
            try:
                from assets.models import FixedAsset
                asset = FixedAsset.objects.get(asset_code=obj.beneficiary_reference, branch=obj.branch)
                return asset.asset_name
            except:
                return None
        return None
    
    def get_employee_name(self, obj):
        """Get employee name if beneficiary is employee"""
        if obj.beneficiary_type == 'employee' and obj.beneficiary_reference:
            try:
                from hr.models import Staff
                staff = Staff.objects.get(employee_id=obj.beneficiary_reference, branch=obj.branch)
                return staff.get_full_name()
            except:
                return None
        return None

    def get_beneficiary_staff_display(self, obj):
        """Return detailed display for the linked staff beneficiary."""
        if obj.beneficiary_staff_id:
            s = obj.beneficiary_staff
            return {
                'id': s.id,
                'staff_id': s.staff_id,
                'name': f'{s.first_name} {s.last_name}',
                'department': s.department,
                'position': s.position,
            }
        return None
    
    def get_consumption_count(self, obj):
        """Get number of consumptions using this voucher"""
        return obj.consumptions.count()
    
    def validate(self, data):
        """Validate voucher data"""
        from decimal import Decimal, InvalidOperation
        
        # Ensure allocated amounts are positive
        try:
            allocated_units = data.get('allocated_units')
            if allocated_units is not None:
                allocated_units = Decimal(str(allocated_units))
                # store the normalized Decimal back into data for later checks
                data['allocated_units'] = allocated_units
                if allocated_units <= 0:
                    raise serializers.ValidationError({
                        'allocated_units': 'Allocated units must be greater than zero'
                    })
        except (InvalidOperation, ValueError, TypeError) as e:
            raise serializers.ValidationError({
                'allocated_units': f'Invalid value for allocated units: {allocated_units!r}'
            })
        
        try:
            allocated_amount = data.get('allocated_amount')
            if allocated_amount is not None:
                allocated_amount = Decimal(str(allocated_amount))
                # store the normalized Decimal back into data for later checks
                data['allocated_amount'] = allocated_amount
                if allocated_amount <= 0:
                    raise serializers.ValidationError({
                        'allocated_amount': 'Allocated amount must be greater than zero'
                    })
        except (InvalidOperation, ValueError, TypeError) as e:
            raise serializers.ValidationError({
                'allocated_amount': f'Invalid value for allocated amount: {allocated_amount!r}'
            })
        
        # Validate expiry date
        issue_date = data.get('issue_date', timezone.now().date())
        expiry_date = data.get('expiry_date')
        
        if expiry_date and expiry_date <= issue_date:
            raise serializers.ValidationError({
                'expiry_date': 'Expiry date must be after issue date'
            })
        
        # Validate that prepaid expense has sufficient balance
        if not self.instance:  # Only on create
            prepaid_expense = data.get('prepaid_expense')
            allocated_units = data.get('allocated_units')
            allocated_amount = data.get('allocated_amount')

            if prepaid_expense and allocated_units is not None:
                if prepaid_expense.measurable:
                    # Units-based expense: check remaining units
                    try:
                        remaining = Decimal(prepaid_expense.remaining_units)
                        requested = Decimal(allocated_units)
                    except Exception:
                        raise serializers.ValidationError({
                            'allocated_units': 'Unable to validate allocated units against prepaid expense balance due to invalid data types.'
                        })

                    if remaining < requested:
                        raise serializers.ValidationError({
                            'allocated_units': f'Insufficient balance on prepaid expense. '
                                               f'Available: {remaining} units, Requested: {requested} units'
                        })
                else:
                    # Amount-only expense (measurable=False): check remaining amount instead
                    # allocated_units is stored but won't exceed the units pool (there isn't one)
                    if allocated_amount is not None:
                        try:
                            remaining_amount = Decimal(prepaid_expense.remaining_amount)
                            requested_amount = Decimal(allocated_amount)
                        except Exception:
                            raise serializers.ValidationError({
                                'allocated_amount': 'Unable to validate allocated amount against prepaid expense balance.'
                            })

                        if remaining_amount < requested_amount:
                            raise serializers.ValidationError({
                                'allocated_amount': f'Insufficient balance on prepaid expense. '
                                                    f'Available: ₦{remaining_amount}, Requested: ₦{requested_amount}'
                            })
        
        return data
