from rest_framework import serializers

from common.serializers import TenantModelSerializer

from .models import Account,AccountCategory, Period, BalanceSheetSnapshot

# accounts/serializers.py - Add to your serializers


class AccountSerializer(TenantModelSerializer):
    """Enhanced AccountSerializer with generated components info"""
    from rest_framework import serializers as _rf_serializers
    # Use all_objects for category lookup so API accepts category PKs that may
    # be created or restored outside the tenant-scoped manager during tests/migrations.
    category = _rf_serializers.PrimaryKeyRelatedField(
        queryset=AccountCategory.all_objects.all(),
        allow_null=True,
        required=False
    )
    
    generated_form_schema = serializers.SerializerMethodField()
    generated_workflow = serializers.SerializerMethodField()
    generated_page = serializers.SerializerMethodField()
    can_post_transactions = serializers.ReadOnlyField()
    is_category_account = serializers.ReadOnlyField()
    # Temporarily disabled to diagnose transaction errors
    # children_count = serializers.SerializerMethodField()
    # total_children_balance = serializers.SerializerMethodField()
    workflow_config = serializers.JSONField(write_only=True, required=False)
    
    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'account_type', 'account_level',
            'parent', 'balance', 'balance_bf', 'category',
            'can_post_transactions', 'is_category_account',
            # 'children_count', 'total_children_balance',  # Temporarily disabled
            'enable_smart_forms', 'generated_form_schema',
            'generated_workflow', 'generated_page',
            'allow_manual_entries', 'is_system_account',
            'workflow_config',
            'created_at', 'updated_at'
        ]
    
    def create(self, validated_data):
        """Create account and attach workflow config for signal processing"""
        # Extract workflow config before creating
        workflow_config = validated_data.pop('workflow_config', None)
        
        # Create account
        account = super().create(validated_data)
        
        # Attach workflow config to instance for signal handler
        if workflow_config:
            account._workflow_config = workflow_config
            account.save()  # Trigger signal again with config attached
        
        return account
    
    def get_children_count(self, obj):
        """Get count of child accounts for parent accounts"""
        if obj.is_category_account:
            try:
                return obj.children.count()
            except Exception as e:
                # Log the actual error
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error counting children for account {obj.id}: {e}", exc_info=True)
                # Try without using the manager
                from accounts.models import Account
                return Account.objects.filter(parent=obj).count()
        return 0
    
    def get_total_children_balance(self, obj):
        """Get total balance of children for parent accounts"""
        if obj.is_category_account:
            return str(obj.get_total_children_balance())
        return None
    
    def validate(self, data):
        """Validate account data before saving"""
        # Check if child account has parent
        account_level = data.get('account_level')
        parent = data.get('parent')
        
        if account_level == Account.LEVEL_CHILD and not parent:
            raise serializers.ValidationError(
                "Child accounts must have a parent"
            )
        
        if account_level == Account.LEVEL_PARENT and parent:
            raise serializers.ValidationError(
                "Parent accounts cannot have a parent"
            )
        
        return data
    
    def get_generated_form_schema(self, obj):
        """Get generated form schema if it exists"""
        try:
            from automations.models import FormSchema
            form = FormSchema.objects.filter(
                trigger_event_name=f'transaction.{obj.code.replace("-", "_").lower()}'
            ).first()
            if form:
                return {
                    'id': form.id,
                    'name': form.name,
                }
        except:
            pass
        return None
    
    def get_generated_workflow(self, obj):
        """Get master workflow template that this account uses"""
        try:
            from automations.models import WorkflowBinding
            # Find binding for this account's form
            form_event = f'transaction.{obj.code.replace("-", "_").lower()}'
            binding = WorkflowBinding.objects.filter(
                form_schema__trigger_event_name=form_event,
                is_active=True
            ).select_related('workflow_template').first()
            
            if binding:
                return {
                    'id': binding.workflow_template.id,
                    'name': binding.workflow_template.name,
                    'type': 'master_template',
                    'binding_id': binding.id,
                    'parameters': binding.parameters,
                }
        except:
            pass
        return None
    
    def get_generated_page(self, obj):
        """Get generated module page if it exists"""
        try:
            from pages.models import ModulePage
            page_code = f'{obj.code.replace("-", "_").lower()}_transaction'
            page = ModulePage.objects.filter(code=page_code).first()
            if page:
                return {
                    'id': page.id,
                    'url_path': page.url_path,
                    'title': page.title,
                }
        except:
            pass
        return None

    

class AccountReadSerializer(TenantModelSerializer):
    """Lightweight serializer for read operations to avoid expensive lookups.

    Excludes `generated_form_schema`, `generated_workflow` and `generated_page`
    which trigger additional DB queries and slow down GET requests.
    """
    parent_name = serializers.SerializerMethodField()

    class Meta:
        model = Account
        fields = [
            'id', 'code', 'name', 'account_type', 'account_level',
            'parent', 'parent_name', 'balance', 'balance_bf', 'category',
            'can_post_transactions', 'is_category_account',
            'allow_manual_entries', 'is_system_account',
            'created_at', 'updated_at'
        ]

    def get_parent_name(self, obj):
        """Return the name of the parent account, or None for root-level accounts."""
        if obj.parent_id:
            # Use the cached _parent_name attribute if set (e.g. via select_related)
            parent = getattr(obj, 'parent', None)
            if parent:
                return parent.name
        return None


class AccountCategorySerializer(TenantModelSerializer):
    note = serializers.SerializerMethodField()

    class Meta:
        model = AccountCategory
        fields = ['id', 'name', 'section', 'code_prefix', 'is_system_category', 'description', 'owner', 'branch', 'note']
        read_only_fields = ['id', 'code_prefix', 'is_system_category', 'owner', 'branch', 'note']

    def get_note(self, obj):
        return getattr(obj, '_note', None)

    def create(self, validated_data):
        """Create or reuse an AccountCategory safely.

        - Use `AccountCategory.all_objects` to check for existing categories (including deleted).
        - If a deleted category exists, restore and return it (note added).
        - If an active one exists, reuse it and return with a note explaining reuse.
        - Otherwise create a new category, ensuring `owner`, `branch`, and `tenant` are set
          from the request user when available.
        The serializer always returns an AccountCategory instance; the view will return
        HTTP 201 and the serialized `note` will explain any non-standard behavior.
        """
        request = self.context.get('request') if hasattr(self, 'context') else None
        owner = getattr(request, 'user', None) if request else validated_data.get('owner')
        branch = validated_data.get('branch') or (getattr(owner, 'branch', None) if owner else None)

        # Ensure thread-local tenant matches request user's tenant during creation
        try:
            from common.managers import set_current_tenant
            if owner is not None and getattr(owner, 'tenant', None) is not None:
                set_current_tenant(owner.tenant)
        except Exception:
            pass
        section = validated_data.get('section')
        code_prefix = str(section) if section is not None else validated_data.get('code_prefix')
        category_name = validated_data.get('name')

        try:
            existing = AccountCategory.all_objects.filter(
                owner=owner, 
                branch=branch, 
                section=section,
                name=category_name
            ).first()
        except Exception:
            existing = None

        if existing:
            if getattr(existing, 'is_deleted', False):
                # revive deleted category and update name/description
                existing.name = validated_data.get('name', existing.name)
                existing.description = validated_data.get('description', existing.description)
                existing.is_deleted = False
                existing._note = 'Restored deleted category instead of creating duplicate.'
                existing.save()
                return existing
            # Active one exists — this is a duplicate according to tests; raise validation error
            from rest_framework import serializers as _rf_serializers
            raise _rf_serializers.ValidationError({
                'name': f'A category named "{category_name}" already exists in section {section} for your branch.'
            })

        # Ensure owner/branch/tenant are set for creation
        if owner is not None:
            validated_data['owner'] = owner
        if branch is not None:
            validated_data['branch'] = branch
        if owner is not None and getattr(owner, 'tenant', None) is not None:
            validated_data['tenant'] = owner.tenant

        # Create via all_objects manager to bypass default filtering during tests/migrations
        try:
            from django.db import IntegrityError, transaction
            with transaction.atomic():
                category = AccountCategory.all_objects.create(**validated_data)
            try:
                import logging
                logger = logging.getLogger(__name__)
                logger.debug(f"Created AccountCategory id={category.id} owner_id={getattr(category,'owner_id',None)} branch_id={getattr(category,'branch_id',None)} tenant_id={getattr(category,'tenant_id',None)} is_deleted={getattr(category,'is_deleted',None)}")
            except Exception:
                pass
            category._note = 'Created new category.'
            return category
        except IntegrityError:
            from rest_framework import serializers as _rf_serializers
            raise _rf_serializers.ValidationError({
                'section': 'A category with this section already exists in your branch.'
            })
        except Exception:
            # Fallback to super() create for normal behavior and error propagation
            category = super().create(validated_data)
            category._note = 'Created new category (fallback path).'
            return category


class PeriodSerializer(TenantModelSerializer):
    class Meta:
        model = Period
        fields = ['id', 'period_type', 'year', 'month', 'is_closed', 'can_reopen']
        read_only_fields = ['id']


class BalanceSheetSnapshotSerializer(TenantModelSerializer):
    account_code = serializers.CharField(source='account.code', read_only=True)
    account_name = serializers.CharField(source='account.name', read_only=True)
    
    class Meta:
        model = BalanceSheetSnapshot
        fields = ['id', 'period', 'account', 'balance', 'account_code', 'account_name']
        read_only_fields = ['id']