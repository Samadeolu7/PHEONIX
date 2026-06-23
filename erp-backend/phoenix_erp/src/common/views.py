from django.shortcuts import render
from django.utils import timezone
from django.db.models import Q
from django.core.exceptions import ValidationError

from rest_framework import viewsets, permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema_view, extend_schema

from .models import MenuGroup, MenuItem, BusinessDay, BackdateRequest
from .serializers import IsTenantUser, MenuGroupSerializer, MenuItemSerializer, BusinessDaySerializer, BackdateRequestSerializer

try:
    from permissions.permission_classes import HasActionPermission as _HasActionPermission
    _HAS_ACTION_PERMISSION_AVAILABLE = True
except ImportError:
    _HasActionPermission = None
    _HAS_ACTION_PERMISSION_AVAILABLE = False

# Create your views here.
@extend_schema_view(
    list=extend_schema(description="List all objects accessible to the current user."),
    create=extend_schema(description="Create a new object for the current user."),
    retrieve=extend_schema(description="Retrieve a specific object if accessible to the current user."),
    update=extend_schema(description="Update an object if accessible to the current user."),
    partial_update=extend_schema(description="Partially update an object if accessible to the current user."),
    destroy=extend_schema(description="Delete an object if accessible to the current user.")
)
class ScopedModelViewSet(viewsets.ModelViewSet):
    """
    Base viewset that automatically filters queryset by owner/branch and sets tenant fields.
    Subclass must define queryset and serializer_class.
    
    This viewset ensures that:
    - List endpoints return 200 OK with empty array [] when no results found
    - Retrieve endpoints return 404 when specific resource not found
    - All database integrity errors are converted to meaningful validation errors (400)

    Credit-officer data scoping
    ---------------------------
    Set ``officer_client_lookup`` on a subclass to the ORM path that leads from
    the model being listed to the ``assigned_officer`` FK on ``Client``.

    Examples::

        # Client model — direct FK
        officer_client_lookup = 'assigned_officer'

        # LoanAccount — via client
        officer_client_lookup = 'client__assigned_officer'

        # LoanCollateral — via loan → client
        officer_client_lookup = 'loan__client__assigned_officer'

    When set, ``credit_officer`` users see only records for their own clients
    (plus records where the officer field is NULL/unassigned).
    ``supervisor`` users additionally see records belonging to their direct
    reports.  All higher roles are unaffected.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    # When HasActionPermission is available, append it dynamically so all
    # subclasses get action-level enforcement without manual changes.
    # Opt out per-viewset by setting skip_action_permission = True.
    skip_action_permission: bool = False

    def get_permissions(self):
        base = super().get_permissions()
        if (
            _HAS_ACTION_PERMISSION_AVAILABLE
            and not getattr(self, 'skip_action_permission', False)
            and _HasActionPermission is not None
            and not any(isinstance(p, _HasActionPermission) for p in base)
        ):
            base.append(_HasActionPermission())
        return base

    # Override in subclasses that manage client-linked records.
    officer_client_lookup: 'str | None' = None

    # ------------------------------------------------------------------
    # Officer-scope helper
    # ------------------------------------------------------------------

    def _apply_officer_scope(self, qs):
        """
        Apply credit-officer / supervisor visibility restriction.
        No-ops when ``officer_client_lookup`` is None or the user has no
        ``staff_profile`` (system/superuser accounts remain unrestricted).
        """
        lookup = self.officer_client_lookup
        if not lookup:
            return qs

        user = self.request.user
        try:
            staff = user.staff_profile
        except Exception:
            return qs
        if staff is None:
            return qs

        role = getattr(staff, 'role_level', 'operations')

        if role == 'credit_officer':
            return qs.filter(
                Q(**{lookup: staff}) | Q(**{f'{lookup}__isnull': True})
            )

        if role == 'supervisor':
            return qs.filter(
                Q(**{lookup: staff}) |
                Q(**{f'{lookup}__reports_to': staff}) |
                Q(**{f'{lookup}__isnull': True})
            )

        # branch_manager / director / operations / admin — no extra restriction
        return qs

    def list(self, request, *args, **kwargs):
        """
        Override list to ensure empty results return 200 OK with empty array,
        not 404 Not Found which confuses frontend routing.
        """
        queryset = self.filter_queryset(self.get_queryset())

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        # Non-paginated response
        serializer = self.get_serializer(queryset, many=True)
        # Always return 200 OK with data (even if empty list)
        return Response(serializer.data, status=status.HTTP_200_OK)


    def get_queryset(self):
        qs = super().get_queryset()
        # During OpenAPI/schema generation drf-spectacular sets
        # `swagger_fake_view` on the view. Avoid accessing `request.user`
        # or other runtime attributes which may raise for AnonymousUser.
        if getattr(self, 'swagger_fake_view', False):
            try:
                return qs.none()
            except Exception:
                return qs
        user = getattr(self.request, 'user', None)

        # System admin bypass - sees all records across all tenants
        if user and getattr(user, 'is_system_admin', False):
            return qs

        # Prefer QuerySet.for_user if available
        if hasattr(qs, 'for_user') and callable(getattr(qs, 'for_user')):
            return self._apply_officer_scope(qs.for_user(user))

        # Next, try the configured manager (e.g., Model.objects.for_user)
        manager = getattr(self.queryset, 'for_user', None) or getattr(getattr(self.queryset, 'model', None, ), 'objects', None)
        # If manager has for_user, call it
        if manager is not None:
            for_user_fn = getattr(manager, 'for_user', None)
            if callable(for_user_fn):
                return self._apply_officer_scope(for_user_fn(user))

        # Fallback: filter by branch/tenant if available, NOT by owner
        # (owner is just for audit; all users in a branch should see all branch data)
        model = getattr(self.queryset, 'model', None)
        if user and getattr(user, 'is_authenticated', False) and model is not None:
            field_names = [f.name for f in model._meta.fields]
            try:
                # Filter by tenant first
                if hasattr(user, 'tenant') and user.tenant and 'tenant' in field_names:
                    qs = qs.filter(tenant=user.tenant)

                # Tenant owners see all data within their tenant; skip branch filter
                is_owner = callable(getattr(user, 'is_owner', None)) and user.is_owner()
                if not is_owner:
                    # Filter by branch, but also include records with no branch
                    # (NULL-branch records are tenant-wide and must remain visible
                    # to all staff regardless of their own branch assignment).
                    if hasattr(user, 'branch') and user.branch and 'branch' in field_names:
                        qs = qs.filter(Q(branch=user.branch) | Q(branch__isnull=True))

                return self._apply_officer_scope(qs)
            except Exception:
                pass

        # Last resort: return the unscoped queryset
        return qs

    def perform_create(self, serializer):
        """Create with owner and branch, handling database errors gracefully"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import logging
        
        logger = logging.getLogger(__name__)
        user = self.request.user
        
        # Skip if not authenticated (permission check should catch this, but be defensive)
        if not user.is_authenticated:
            raise ValidationError({'detail': 'Authentication required.'})
        
        # Handle users without owner or branch attributes
        if not hasattr(user, 'owner') or user.owner is None:
            logger.error(f"User {user.id} missing owner attribute")
            raise ValidationError({
                'detail': 'User profile incomplete. Missing tenant information.'
            })
        
        branch = getattr(user, 'branch', None)
        if branch is None:
            logger.warning(f"User {user.id} missing branch attribute")
        
        try:
            # Save the instance and explicitly set tenant from authenticated user
            # Ensure thread-local tenant is set so model managers filter correctly
            try:
                from common.managers import set_current_tenant
                if getattr(user, 'tenant', None) is not None:
                    set_current_tenant(user.tenant)
            except Exception:
                pass

            if branch is None:
                serializer.save(owner=user, tenant=getattr(user, 'tenant', None))
            else:
                serializer.save(owner=user, branch=branch, tenant=getattr(user, 'tenant', None))
        except IntegrityError as e:
            # Convert database integrity errors to validation errors
            error_message = str(e)
            logger.error(f"IntegrityError in perform_create: {error_message}", exc_info=True)
            
            # Extract meaningful error messages
            if 'unique constraint' in error_message.lower():
                # Try to extract the constraint name and columns for detailed error
                constraint_name = None
                columns = []
                
                # Parse constraint name from error message
                # Format: DETAIL:  Key (column_name)=(value) already exists.
                # or: duplicate key value violates unique constraint "constraint_name"
                try:
                    if 'constraint' in error_message and '"' in error_message:
                        # Extract constraint name
                        parts = error_message.split('"')
                        if len(parts) >= 2:
                            constraint_name = parts[1]
                    
                    # Extract column names from DETAIL line
                    if 'Key (' in error_message:
                        key_part = error_message.split('Key (')[1].split(')')[0]
                        columns = [col.strip() for col in key_part.split(',')]
                except Exception:
                    pass
                
                # Build descriptive error message
                if columns:
                    field_names = ', '.join(columns)
                    if len(columns) == 1:
                        field_name = columns[0]
                        raise ValidationError({
                            field_name: f'A record with this {field_name} already exists. Please use a different value.',
                            '_debug': f"{type(e).__name__}: Constraint: {constraint_name}, Full error: {error_message}"
                        })
                    else:
                        raise ValidationError({
                            'non_field_errors': f'A record with this combination of {field_names} already exists.',
                            '_debug': f"{type(e).__name__}: Constraint: {constraint_name}, Full error: {error_message}"
                        })
                
                # Specific field checks (fallback for when parsing fails)
                if 'code' in error_message or 'code_prefix' in error_message or 'codeprefix' in error_message:
                    try:
                        model = getattr(serializer.Meta, 'model', None)
                        section = None
                        if hasattr(self.request, 'data') and isinstance(self.request.data, dict):
                            section = self.request.data.get('section')

                        if model is not None and hasattr(model, 'all_objects') and section is not None:
                            cp = str(section)
                            branch_obj = branch
                            user_obj = user
                            existing = model.all_objects.filter(owner=user_obj, branch=branch_obj, code_prefix=cp).first()
                            if existing is not None and getattr(existing, 'is_deleted', False):
                                raise ValidationError({
                                    'non_field_errors': 'A category with this section already exists but was deleted. Restore it or choose a different section.'
                                })
                    except ValidationError:
                        raise
                    except Exception:
                        pass

                    raise ValidationError({
                        'code': 'A record with this code already exists in your branch. Please use a different code or leave it empty.',
                        '_debug': f"{type(e).__name__}: {error_message}"
                    })
                elif 'sku' in error_message:
                    raise ValidationError({
                        'sku': 'A record with this SKU already exists in your branch. Please use a different SKU.',
                        '_debug': f"{type(e).__name__}: {error_message}"
                    })
                elif 'email' in error_message:
                    raise ValidationError({
                        'email': 'This email address is already registered. Please use a different email.',
                        '_debug': f"{type(e).__name__}: {error_message}"
                    })
                elif 'phone' in error_message:
                    raise ValidationError({
                        'phone': 'This phone number is already registered. Please use a different phone number.',
                        '_debug': f"{type(e).__name__}: {error_message}"
                    })
                else:
                    # Last resort: return specific error with debug info
                    # Try to extract field/column name from error message
                    field_name = None
                    if 'column' in error_message.lower():
                        try:
                            # PostgreSQL format: 'column "field_name"'
                            parts = error_message.split('column')
                            if len(parts) > 1:
                                field_name = parts[1].split()[0].strip('"\'')
                        except:
                            pass
                    
                    error_response = {
                        'non_field_errors': 'A record with these details already exists. This may be due to a unique constraint violation.',
                        '_constraint': constraint_name if constraint_name else 'unknown',
                    }
                    
                    if field_name:
                        error_response['_field'] = field_name
                        error_response[field_name] = f'A record with this {field_name} already exists.'
                    
                    # Include full error for debugging (only in DEBUG mode or for staff)
                    if hasattr(self.request, 'user') and self.request.user.is_staff:
                        error_response['_debug'] = f"{type(e).__name__}: {error_message}"
                    
                    # Include debug info when in DEBUG or for staff users
                    from django.conf import settings
                    if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                        error_response['_debug'] = f"{type(e).__name__}: {error_message}"
                    raise ValidationError(error_response)
            elif 'foreign key constraint' in error_message.lower():
                raise ValidationError({
                    'non_field_errors': 'Referenced record does not exist. Please check your input.'
                })
            elif 'not-null constraint' in error_message.lower():
                # Try to extract field name
                field_name = 'field'
                if 'column' in error_message:
                    try:
                        field_name = error_message.split('column')[1].split()[0].strip('"')
                    except:
                        pass
                raise ValidationError({
                    field_name: f'This field is required and cannot be null.'
                })
            else:
                    from django.conf import settings
                    msg = {'non_field_errors': 'Database error: Unable to create record. Please check your input.'}
                    if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                        msg['_debug'] = f"{type(e).__name__}: {error_message}"
                    raise ValidationError(msg)
        except ValidationError:
            # Re-raise ValidationErrors from serializer with their original messages
            raise
        except Exception as e:
            # Catch any other exception to prevent 500 errors
            logger.error(f"Unexpected error in perform_create: {type(e).__name__}: {str(e)}", exc_info=True)
            from django.conf import settings
            msg = {'detail': 'An error occurred while creating the record. Please try again.'}
            if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                msg['_debug'] = f"{type(e).__name__}: {str(e)}"
            raise ValidationError(msg)
    
    def perform_update(self, serializer):
        """Update with error handling"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            serializer.save()
        except IntegrityError as e:
            error_message = str(e)
            logger.error(f"IntegrityError in perform_update: {error_message}", exc_info=True)
            
            if 'unique constraint' in error_message.lower():
                if 'code' in error_message:
                    raise ValidationError({
                        'code': 'A record with this code already exists. Please use a different code.'
                    })
                elif 'sku' in error_message:
                    raise ValidationError({
                        'sku': 'A record with this SKU already exists. Please use a different SKU.'
                    })
                else:
                    raise ValidationError({
                        'non_field_errors': 'A record with these details already exists.'
                    })
            else:
                raise ValidationError({
                    'non_field_errors': 'Unable to update record. Please check your input.'
                })
        except Exception as e:
            logger.error(f"Unexpected error in perform_update: {type(e).__name__}: {str(e)}", exc_info=True)
            from django.conf import settings
            msg = {'detail': 'An error occurred while updating the record. Please try again.'}
            if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                msg['_debug'] = f"{type(e).__name__}: {str(e)}"
            raise ValidationError(msg)
    
    def perform_destroy(self, instance):
        """Soft delete if model supports it, otherwise hard delete"""
        from django.db import IntegrityError
        from rest_framework.exceptions import ValidationError
        import logging
        
        logger = logging.getLogger(__name__)
        
        try:
            import logging
            logger = logging.getLogger(__name__)
            # Debug: log instance identity and tenant before delete
            if hasattr(instance, 'is_deleted'):
                # Soft delete
                instance.is_deleted = True
                instance.save()
            else:
                # Hard delete
                instance.delete()
        except IntegrityError as e:
            error_message = str(e)
            logger.error(f"IntegrityError in perform_destroy: {error_message}", exc_info=True)
            
            if 'foreign key constraint' in error_message.lower():
                from django.conf import settings
                msg = {'detail': 'Cannot delete this record because it is referenced by other records. Please delete the related records first.'}
                if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                    msg['_debug'] = f"{type(e).__name__}: {error_message}"
                raise ValidationError(msg)
            else:
                from django.conf import settings
                msg = {'detail': 'Unable to delete record. It may be referenced by other records.'}
                if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                    msg['_debug'] = f"{type(e).__name__}: {error_message}"
                raise ValidationError(msg)
        except Exception as e:
            logger.error(f"Unexpected error in perform_destroy: {type(e).__name__}: {str(e)}", exc_info=True)
            from django.conf import settings
            msg = {'detail': 'An error occurred while deleting the record. Please try again.'}
            if getattr(settings, 'DEBUG', False) or (hasattr(self.request, 'user') and getattr(self.request.user, 'is_staff', False)):
                msg['_debug'] = f"{type(e).__name__}: {str(e)}"
            raise ValidationError(msg)

    @action(detail=False, methods=['get'], url_path='menu')
    def menu(self, request):
        from django.core.cache import cache
        
        # Try to get from cache first
        cache_key = f'menu_tree_{request.user.id}'
        result = cache.get(cache_key)
        
        if result is None:
            # fetch all groups & items for this tenant
            groups = MenuGroup.objects.filter(tenant=request.user.tenant, is_deleted=False)
            result = []
            
            for group in groups:
                items = []
                accessible_items = group.get_accessible_items(request.user)
                
                for item in accessible_items:
                    items.append({
                        "id": item.id,
                        "code": item.code,
                        "label": item.label,
                        "route": item.route,
                        "order": item.order
                    })
                
                if items:
                    result.append({
                        "id": group.id,
                        "code": group.code,
                        "label": group.label,
                        "order": group.order,
                        "items": items
                    })
            
            # Cache for 1 hour
            cache.set(cache_key, result, timeout=3600)
        
        return Response(result)


class MenuGroupViewSet(ScopedModelViewSet):
    """
    ViewSet for managing menu groups.
    """
    permission_module = 'common'
    permission_page = 'menu-groups'
    queryset = MenuGroup.objects.all()
    serializer_class = MenuGroupSerializer

    def get_queryset(self):
        # Override to filter by tenant instead of owner/branch
        return self.queryset.filter(tenant=self.request.user.tenant)
    
    def perform_create(self, serializer):
        # MenuGroup only has tenant, not branch or owner
        serializer.save(tenant=self.request.user.tenant)
    
    def perform_update(self, serializer):
        # MenuGroup only has tenant, not branch or owner
        serializer.save()


class MenuItemViewSet(ScopedModelViewSet):
    """
    ViewSet for managing menu items within groups.
    """
    permission_module = 'common'
    permission_page = 'menu-items'
    queryset = MenuItem.objects.all()
    serializer_class = MenuItemSerializer

    def get_queryset(self):
        # Filter by tenant through the group relationship
        return self.queryset.filter(group__tenant=self.request.user.tenant)

    def perform_create(self, serializer):
        # MenuItem belongs to a group, group has tenant
        # Don't set branch or owner, just group
        group_id = self.request.data.get('group')
        if group_id:
            group = MenuGroup.objects.get(id=group_id, tenant=self.request.user.tenant)
            serializer.save(group=group)
        else:
            raise serializers.ValidationError({'group': 'Group ID is required'})

    @action(detail=False, methods=['post'])
    def bulk_create(self, request):
        """Create multiple menu items at once"""
        serializer = self.get_serializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        
        # Validate all groups belong to user's tenant
        group_ids = set(item.get('group') for item in request.data)
        groups = MenuGroup.objects.filter(
            id__in=group_ids, 
            tenant=request.user.tenant
        )
        if len(groups) != len(group_ids):
            raise serializers.ValidationError({'group': 'Invalid group ID provided'})
            
        self.perform_bulk_create(serializer)
        return Response(serializer.data, status=status.HTTP_200_OK)
        
    def perform_bulk_create(self, serializer):
        """Handle bulk create with proper group assignment"""
        from django.db import transaction
        with transaction.atomic():
            # Save without setting branch/owner since MenuItem doesn't have those fields
            items = []
            for item_data in serializer.validated_data:
                item = MenuItem.objects.create(**item_data)
                items.append(item)
            serializer.instance = items

    @action(detail=False, methods=['post'])
    def reorder(self, request):
        """Reorder items within a group"""
        group_id = request.data.get('group')
        new_order = request.data.get('order', [])
        
        if not group_id or not new_order:
            raise serializers.ValidationError({
                'detail': 'Both group and order array are required'
            })
            
        try:
            group = MenuGroup.objects.get(id=group_id, tenant=request.user.tenant)
            group.reorder_items(new_order)
            return Response({'status': 'success'})
        except MenuGroup.DoesNotExist:
            raise serializers.ValidationError({'group': 'Invalid group ID'})
        
#health check endpoint
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny


@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok'})


@api_view(['GET'])
@permission_classes([AllowAny])
def migration_diagnostics(request):
    """
    Public diagnostic endpoint — no authentication required.

    Returns a snapshot of Phoenix's current GL state for migration debugging
    and RAG ingestion.  Covers:
      - GL account balances by account type
      - Transaction counts and totals per migration series
      - Loan portfolio, savings, bank, and liability positions
      - Suspense and OBE account balances (key migration health signals)

    Query params:
        tenant_id (int) — restrict to a specific tenant (default: first tenant)
    """
    from decimal import Decimal
    from django.db.models import Sum, Count, Case, When, F, DecimalField
    from django.utils import timezone
    from django.apps import apps

    Account          = apps.get_model("accounts",     "Account")
    LoanAccount      = apps.get_model("loans",        "LoanAccount")
    SavingsAccount   = apps.get_model("savings",      "SavingsAccount")
    Transaction      = apps.get_model("transactions", "Transaction")
    TransactionEntry = apps.get_model("transactions", "TransactionEntry")
    TransactionSeries = apps.get_model("transactions", "TransactionSeries")
    Tenant           = apps.get_model("accounts",     "Tenant")

    # Tenant scoping
    tenant_id = request.GET.get("tenant_id")
    if tenant_id:
        tenant = Tenant.objects.filter(pk=tenant_id).first()
    else:
        tenant = Tenant.objects.order_by("pk").first()

    if not tenant:
        return Response({"error": "No tenant found."}, status=404)

    acct_filter = dict(tenant=tenant, is_deleted=False)

    # ── GL balance summary by account type ────────────────────────────────────
    gl_by_type = {}
    for at in [Account.ASSET, Account.LOAN, Account.SAVINGS,
               Account.LIABILITY, Account.INCOME, Account.EXPENSE, Account.EQUITY]:
        agg = Account.objects.filter(account_type=at, **acct_filter).aggregate(
            count=Count("id"),
            total_balance=Sum("balance"),
            total_balance_bf=Sum("balance_bf"),
        )
        gl_by_type[at] = {
            "account_count":   agg["count"],
            "total_balance":   str(agg["total_balance"]    or 0),
            "total_balance_bf": str(agg["total_balance_bf"] or 0),
        }

    # ── Transaction series health ─────────────────────────────────────────────
    MIGRATION_SERIES = {
        "OBMIG":  "Opening Balance Migration",
        "SVMIG":  "Savings Payment History",
        "LNDSB": "Loan Disbursement History",
        "LNMIG":  "Loan Payment History",
        "INMIG":  "Income Payment History",
        "EXMIG":  "Expense Payment History",
        "LBMIG":  "Liability Payment History",
    }
    series_stats = {}
    for code, label in MIGRATION_SERIES.items():
        txn_qs = Transaction.objects.filter(
            series__code=code, tenant=tenant
        )
        txn_count = txn_qs.count()

        entry_agg = TransactionEntry.objects.filter(
            transaction__series__code=code,
            transaction__tenant=tenant,
        ).aggregate(
            total_dr=Sum(
                Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())
            ),
            total_cr=Sum(
                Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())
            ),
        )
        series_stats[code] = {
            "label":      label,
            "txn_count":  txn_count,
            "total_dr":   str(entry_agg["total_dr"] or 0),
            "total_cr":   str(entry_agg["total_cr"] or 0),
        }

    # ── Loan portfolio detail ─────────────────────────────────────────────────
    loan_entries = TransactionEntry.objects.filter(
        account__account_type=Account.LOAN,
        account__tenant=tenant,
        account__is_deleted=False,
    ).aggregate(
        total_dr=Sum(
            Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())
        ),
        total_cr=Sum(
            Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())
        ),
    )

    # ── OBE and Suspense accounts ─────────────────────────────────────────────
    obe_acct = Account.objects.filter(code="OBE", tenant=tenant).first()
    sus_acct = Account.objects.filter(code="MIGS", tenant=tenant).first()

    # ── Bank accounts detail ──────────────────────────────────────────────────
    bank_entries = TransactionEntry.objects.filter(
        account__account_type=Account.ASSET,
        account__parent__code="1100",
        account__tenant=tenant,
        account__is_deleted=False,
    ).aggregate(
        total_dr=Sum(
            Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())
        ),
        total_cr=Sum(
            Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())
        ),
    )

    # ── Savings accounts detail ───────────────────────────────────────────────
    sav_entries = TransactionEntry.objects.filter(
        account__account_type=Account.SAVINGS,
        account__tenant=tenant,
        account__is_deleted=False,
    ).aggregate(
        total_dr=Sum(
            Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())
        ),
        total_cr=Sum(
            Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())
        ),
    )

    # ── Account-level counts ──────────────────────────────────────────────────
    loan_acct_count = LoanAccount.objects.filter(tenant=tenant).count()
    sav_acct_count  = SavingsAccount.objects.filter(tenant=tenant).count()
    bank_acct_count = Account.objects.filter(
        account_type=Account.ASSET, parent__code="1100", **acct_filter
    ).count()

    # ── Individual bank balances (for per-account visibility) ─────────────────
    bank_breakdown = list(
        Account.objects.filter(
            account_type=Account.ASSET, parent__code="1100", **acct_filter
        ).order_by("code").values("code", "name", "balance", "balance_bf")
    )
    for b in bank_breakdown:
        b["balance"]    = str(b["balance"])
        b["balance_bf"] = str(b["balance_bf"])

    loan_net = (loan_entries["total_dr"] or Decimal("0")) - (loan_entries["total_cr"] or Decimal("0"))
    bank_net = (bank_entries["total_dr"] or Decimal("0")) - (bank_entries["total_cr"] or Decimal("0"))
    sav_net  = (sav_entries["total_cr"] or Decimal("0")) - (sav_entries["total_dr"] or Decimal("0"))

    return Response({
        "as_of":  timezone.now().isoformat(),
        "tenant": {"id": tenant.pk, "name": str(tenant)},
        "gl_by_account_type": gl_by_type,
        "loan_portfolio": {
            "account_count":       loan_acct_count,
            "total_dr_entries":    str(loan_entries["total_dr"] or 0),
            "total_cr_entries":    str(loan_entries["total_cr"] or 0),
            "net_balance":         str(loan_net),
            "expected_sign":       "POSITIVE (outstanding loans = asset)",
        },
        "banks": {
            "account_count":    bank_acct_count,
            "total_dr_entries": str(bank_entries["total_dr"] or 0),
            "total_cr_entries": str(bank_entries["total_cr"] or 0),
            "net_balance":      str(bank_net),
            "breakdown":        bank_breakdown,
        },
        "savings": {
            "account_count":    sav_acct_count,
            "total_dr_entries": str(sav_entries["total_dr"] or 0),
            "total_cr_entries": str(sav_entries["total_cr"] or 0),
            "net_liability":    str(sav_net),
            "expected_sign":    "POSITIVE (savings owed to members)",
        },
        "migration_series": series_stats,
        "special_accounts": {
            "opening_balance_equity": {
                "balance": str(obe_acct.balance) if obe_acct else None,
                "balance_bf": str(obe_acct.balance_bf) if obe_acct else None,
                "_note": "Should be near-zero after a clean migration",
            },
            "migration_payment_suspense": {
                "balance": str(sus_acct.balance) if sus_acct else None,
                "_note": "Non-zero = payments whose bank could not be identified; investigate and reclassify",
            },
        },
        "balance_check": {
            "total_dr_all_entries": str(
                TransactionEntry.objects.filter(
                    transaction__tenant=tenant, side=TransactionEntry.DEBIT
                ).aggregate(t=Sum("amount"))["t"] or 0
            ),
            "total_cr_all_entries": str(
                TransactionEntry.objects.filter(
                    transaction__tenant=tenant, side=TransactionEntry.CREDIT
                ).aggregate(t=Sum("amount"))["t"] or 0
            ),
            "_note": "These MUST be equal — any difference indicates a posting bug",
        },
    })


# ---------------------------------------------------------------------------
# BusinessDay viewset
# ---------------------------------------------------------------------------

class BusinessDayViewSet(ScopedModelViewSet):
    """
    Read and manage business day status for a branch.

    Actions:
      close_day    — BM manually closes the current day
      reopen_day   — Director/admin overrides a closed day (with reason)
    """
    permission_module = 'common'
    permission_page = 'business-day'
    queryset = BusinessDay.objects.select_related('closed_by', 'override_by').all()
    serializer_class = BusinessDaySerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'head', 'options', 'post']

    def get_queryset(self):
        qs = super().get_queryset()
        date_param = self.request.query_params.get('date')
        if date_param:
            qs = qs.filter(date=date_param)
        bd_status = self.request.query_params.get('status')
        if bd_status:
            qs = qs.filter(status=bd_status)
        return qs.order_by('-date')

    @action(detail=False, methods=['post'], url_path='close-day')
    def close_day(self, request):
        """
        Branch manager closes today's business day.
        If a BusinessDay record doesn't exist yet, one is created then closed.
        """
        try:
            staff = request.user.staff_profile
        except Exception:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        if staff.role_level not in ('branch_manager', 'director', 'admin'):
            return Response(
                {'detail': 'Only branch managers or above can close the business day.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        branch = request.user.branch
        if not branch:
            return Response({'detail': 'User has no branch assigned.'}, status=status.HTTP_400_BAD_REQUEST)

        today = timezone.localdate()
        bd, _ = BusinessDay.objects.get_or_create(
            branch=branch,
            date=today,
            defaults={
                'owner': request.user,
                'tenant': getattr(request.user, 'tenant', None),
                'status': 'open',
            },
        )
        try:
            bd.close(request.user)
        except ValidationError as exc:
            return Response({'detail': str(exc.message)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(BusinessDaySerializer(bd, context={'request': request}).data)

    @action(detail=True, methods=['post'], url_path='reopen')
    def reopen_day(self, request, pk=None):
        """Director or admin overrides a closed day to allow corrections."""
        bd = self.get_object()

        try:
            staff = request.user.staff_profile
        except Exception:
            return Response({'detail': 'Staff profile required.'}, status=status.HTTP_403_FORBIDDEN)

        if staff.role_level not in ('director', 'admin'):
            return Response(
                {'detail': 'Only directors or admins can reopen a closed day.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'detail': 'A reason is required to reopen a day.'}, status=status.HTTP_400_BAD_REQUEST)

        bd.status = 'open'
        bd.override_by = request.user
        bd.override_reason = reason
        bd.save(update_fields=['status', 'override_by', 'override_reason', 'updated_at'])
        return Response(BusinessDaySerializer(bd, context={'request': request}).data)


# ---------------------------------------------------------------------------
# BackdateRequest viewset
# ---------------------------------------------------------------------------

class BackdateRequestViewSet(ScopedModelViewSet):
    """
    Backdate request workflow.

    CO submits a request; BM/supervisor approves or rejects it.
    """
    permission_module = 'common'
    permission_page = 'backdate-requests'
    queryset = BackdateRequest.objects.select_related('requested_by', 'reviewed_by').all()
    serializer_class = BackdateRequestSerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]
    http_method_names = ['get', 'head', 'options', 'post', 'patch']

    def get_queryset(self):
        qs = super().get_queryset()
        bd_status = self.request.query_params.get('status')
        if bd_status:
            qs = qs.filter(status=bd_status)
        return qs.order_by('-created_at')

    def perform_create(self, serializer):
        serializer.save(
            requested_by=self.request.user,
            owner=self.request.user,
            branch=self.request.user.branch,
            tenant=getattr(self.request.user, 'tenant', None),
        )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """BM/supervisor approves a backdate request."""
        bdreq = self.get_object()
        try:
            bdreq.approve(request.user)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BackdateRequestSerializer(bdreq, context={'request': request}).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """BM/supervisor rejects a backdate request."""
        bdreq = self.get_object()
        reason = request.data.get('reason', '').strip()
        if not reason:
            return Response({'detail': 'A rejection reason is required.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            bdreq.reject(request.user, reason)
        except ValidationError as exc:
            return Response({'detail': exc.message}, status=status.HTTP_400_BAD_REQUEST)
        return Response(BackdateRequestSerializer(bdreq, context={'request': request}).data)
