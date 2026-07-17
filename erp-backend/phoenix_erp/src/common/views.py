from django.shortcuts import render
from django.utils import timezone
from django.db.models import Q
from django.core.exceptions import ValidationError
from rest_framework.views import APIView

from rest_framework import viewsets, permissions, serializers, status
from rest_framework.decorators import action
from rest_framework.response import Response
from drf_spectacular.utils import extend_schema_view, extend_schema

from .models import MenuGroup, MenuItem, BusinessDay, BackdateRequest, RoleNavigationConfig
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

    # Optional: ORM path from the model to the group's assigned_officer.
    # When set, the officer scope also includes records where the group is
    # assigned to this officer (e.g. 'group__assigned_officer' for Client).
    officer_group_lookup: 'str | None' = None

    # Optional: ORM path from the model to the group's member_officers M2M.
    # When set, the officer scope also includes records whose group lists
    # this officer as a member (not just the primary assigned_officer) —
    # e.g. 'group__member_officers' for Client. Lets a supervisor added as a
    # secondary officer on a group see that group's clients/loans/savings
    # without becoming each client's cascading assigned_officer.
    officer_group_members_lookup: 'str | None' = None

    # ------------------------------------------------------------------
    # Officer-scope helper
    # ------------------------------------------------------------------

    def _apply_officer_scope(self, qs):
        """
        Restrict queryset to the records this user may see, based on the
        RolePermissionPolicy scope configured for THIS specific module/page
        via the Permission Setup UI (permission_module/permission_page class
        attrs) — not the old single, per-role Role.default_scope field, which
        was a coarser, page-blind value the Permission Setup UI's per-page
        Scope dropdown never actually controlled. Fails closed for restricted
        users who have no linked Staff record.
        """
        lookup = self.officer_client_lookup
        if not lookup:
            return qs

        user = self.request.user

        if getattr(user, 'is_system_admin', False):
            return qs
        if callable(getattr(user, 'is_owner', None)) and user.is_owner():
            return qs

        from permissions.services import PermissionResolver
        eff = PermissionResolver.resolve(
            user,
            module=getattr(self, 'permission_module', None),
            page=getattr(self, 'permission_page', None),
        )
        scope = eff.scope

        # own_branch / global — no additional officer-level narrowing; the
        # tenant/branch scoping already applied upstream (for_user()) is enough.
        if scope in ('own_branch', 'global'):
            return qs

        # assigned_clients / own_records / ajo_group all require a Staff record.
        staff = None
        try:
            staff = user.staff_profile
        except Exception:
            pass
        if not staff:
            return qs.none()

        group_lookup = self.officer_group_lookup
        group_members_lookup = self.officer_group_members_lookup
        # Every caller of this scoping tier documents unassigned records
        # (officer_client_lookup IS NULL) as visible to everyone, not just
        # the officers they'd otherwise be scoped to — e.g. ClientViewSet's
        # own docstring: "credit_officer → only their assigned clients +
        # unassigned clients". Include that OR-clause in both narrowed
        # branches below so the actual filtering matches that documented
        # behavior instead of silently hiding unassigned records.
        unassigned = Q(**{f'{lookup}__isnull': True})

        if scope == 'ajo_group':
            q = (
                Q(**{lookup: staff}) |
                Q(**{f'{lookup}__reports_to': staff}) |
                unassigned
            )
            if group_lookup:
                q |= Q(**{group_lookup: staff})
            if group_members_lookup:
                q |= Q(**{group_members_lookup: staff})
                return qs.filter(q).distinct()
            return qs.filter(q)

        # own_records / assigned_clients (and any other/unrecognized value) —
        # narrowest tier, fail toward MORE restriction rather than less.
        q = Q(**{lookup: staff}) | unassigned
        if group_lookup:
            q |= Q(**{group_lookup: staff})
        if group_members_lookup:
            q |= Q(**{group_members_lookup: staff})
            return qs.filter(q).distinct()
        return qs.filter(q)

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


    # ------------------------------------------------------------------
    # Director branch-override helper
    # ------------------------------------------------------------------

    def _get_director_branch_override(self):
        """
        When a global-scope user (director/admin/owner) sends X-Branch-ID in
        the request header, return that Branch for further filtering.
        Non-elevated users cannot use this header (returns None = no change).
        """
        if getattr(self, 'swagger_fake_view', False):
            return None

        header_val = self.request.META.get('HTTP_X_BRANCH_ID', '').strip()
        if not header_val:
            return None

        user = getattr(self.request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return None

        if not self._is_elevated_user(user):
            return None

        try:
            from branches.models import Branch
            tenant = getattr(user, 'tenant', None)
            qs = Branch.objects.filter(pk=int(header_val), is_deleted=False)
            if tenant:
                qs = qs.filter(tenant=tenant)
            return qs.get()
        except Exception:
            return None

    def _is_elevated_user(self, user=None):
        """True when the user has global-scope access (can see across branches)."""
        if user is None:
            user = getattr(self.request, 'user', None)
        if not user or not getattr(user, 'is_authenticated', False):
            return False
        if getattr(user, 'is_system_admin', False):
            return True
        if callable(getattr(user, 'is_owner', None)) and user.is_owner():
            return True
        try:
            return user.roles.filter(is_active=True, default_scope='global').exists()
        except Exception:
            return False

    def _apply_director_branch_override(self, qs):
        """Apply the X-Branch-ID branch override if one is in effect."""
        branch = self._get_director_branch_override()
        if branch is None:
            return qs
        try:
            model = getattr(qs, 'model', None)
            if model and any(f.name == 'branch' for f in model._meta.get_fields()):
                return qs.filter(branch=branch)
        except Exception:
            pass
        return qs

    # ------------------------------------------------------------------
    # Core queryset scoping
    # ------------------------------------------------------------------

    def get_queryset(self):
        qs = self._scoped_queryset()
        return self._apply_director_branch_override(qs)

    def _scoped_queryset(self):
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
                    # Filter by the user's branch, always including NULL-branch records
                    # (tenant-wide config like fee structures, loan products, etc.).
                    if hasattr(user, 'branch') and user.branch and 'branch' in field_names:
                        qs = qs.filter(Q(branch=user.branch) | Q(branch__isnull=True))

                return self._apply_officer_scope(qs)
            except Exception:
                pass

        # Last resort: return the unscoped queryset
        return qs

    def _resolve_create_scope(self, model=None):
        """
        Return ``(user, branch, tenant)`` for a create operation, enforcing all
        the same rules as ``perform_create``:

        - User must be authenticated with an ``owner`` attribute
        - Elevated users (director/admin/owner) must have selected a branch via
          the ``X-Branch-ID`` request header before writing branch-scoped records
        - Regular users use their assigned branch

        Subclasses that override ``perform_create`` should call this instead of
        duplicating the elevated-user logic.  ``model`` is optional; pass it to
        enable the "has branch field" check for elevated users.
        """
        from rest_framework.exceptions import ValidationError
        import logging
        logger = logging.getLogger(__name__)

        user = self.request.user

        if not getattr(user, 'is_authenticated', False):
            raise ValidationError({'detail': 'Authentication required.'})

        if not hasattr(user, 'owner') or user.owner is None:
            logger.error(f"User {user.id} missing owner attribute")
            raise ValidationError({'detail': 'User profile incomplete. Missing tenant information.'})

        if self._is_elevated_user(user):
            branch_override = self._get_director_branch_override()
            if branch_override is None:
                has_branch_field = False
                try:
                    resolved_model = model or getattr(self.queryset, 'model', None)
                    if resolved_model:
                        has_branch_field = any(
                            f.name == 'branch' for f in resolved_model._meta.get_fields()
                        )
                except Exception:
                    pass
                if has_branch_field:
                    raise ValidationError({
                        'non_field_errors': [
                            'Select a branch from the branch switcher before creating records.'
                        ]
                    })
            branch = branch_override
        else:
            branch = getattr(user, 'branch', None)

        if branch is None:
            logger.warning(f"User {user.id} missing branch attribute")

        return user, branch, getattr(user, 'tenant', None)

    def perform_create(self, serializer):
        """Create with owner and branch, handling database errors gracefully"""
        from django.db import IntegrityError, transaction
        from rest_framework.exceptions import ValidationError
        import logging

        logger = logging.getLogger(__name__)

        try:
            model = (
                getattr(getattr(serializer, 'Meta', None), 'model', None)
                or getattr(self.queryset, 'model', None)
            )
        except Exception:
            model = None

        user, branch, tenant = self._resolve_create_scope(model=model)
        
        try:
            # Save the instance and explicitly set tenant from authenticated user
            # Ensure thread-local tenant is set so model managers filter correctly
            try:
                from common.managers import set_current_tenant
                if getattr(user, 'tenant', None) is not None:
                    set_current_tenant(user.tenant)
            except Exception:
                pass

            # Nested atomic() creates a savepoint so an IntegrityError here only
            # rolls back this attempt, not the whole request transaction — otherwise
            # the error-message-lookup queries below raise TransactionManagementError.
            with transaction.atomic():
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
        from django.db import IntegrityError, transaction
        from rest_framework.exceptions import ValidationError
        import logging

        logger = logging.getLogger(__name__)

        try:
            # Nested atomic() creates a savepoint so an IntegrityError here only
            # rolls back this attempt, not the whole request transaction.
            with transaction.atomic():
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
        from django.db import IntegrityError, transaction
        from rest_framework.exceptions import ValidationError
        import logging

        logger = logging.getLogger(__name__)

        try:
            # Nested atomic() creates a savepoint so an IntegrityError here only
            # rolls back this attempt, not the whole request transaction.
            with transaction.atomic():
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
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny


@api_view(['GET'])
@permission_classes([AllowAny])
@throttle_classes([])
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
      - Loan portfolio, savings, bank, inventory, and liability positions
      - Suspense and OBE account balances (key migration health signals)

    Query params:
        tenant_id (int) — restrict to a specific tenant (default: first tenant)
    """
    from decimal import Decimal
    from django.db.models import Sum, Count, Case, When, F, DecimalField
    from django.utils import timezone
    from django.apps import apps

    Account           = apps.get_model("accounts",     "Account")
    LoanAccount       = apps.get_model("loans",        "LoanAccount")
    SavingsAccount    = apps.get_model("savings",      "SavingsAccount")
    Transaction       = apps.get_model("transactions", "Transaction")
    TransactionEntry  = apps.get_model("transactions", "TransactionEntry")
    TransactionSeries = apps.get_model("transactions", "TransactionSeries")
    Tenant            = apps.get_model("users",        "Tenant")
    InventoryItem     = apps.get_model("inventory",    "InventoryItem")
    InventoryStock    = apps.get_model("inventory",    "InventoryStock")

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

    # ── Savings entries broken down by series ─────────────────────────────────
    sav_by_series = {}
    for code in MIGRATION_SERIES:
        se = TransactionEntry.objects.filter(
            account__account_type=Account.SAVINGS,
            account__tenant=tenant,
            account__is_deleted=False,
            transaction__series__code=code,
        ).aggregate(
            dr=Sum(Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())),
            cr=Sum(Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())),
        )
        if se["dr"] or se["cr"]:
            sav_by_series[code] = {
                "dr": str(se["dr"] or 0),
                "cr": str(se["cr"] or 0),
                "net_cr": str((se["cr"] or Decimal("0")) - (se["dr"] or Decimal("0"))),
            }

    # ── MIGS suspense breakdown by series ─────────────────────────────────────
    migs_by_series = {}
    if sus_acct:
        for code in MIGRATION_SERIES:
            me = TransactionEntry.objects.filter(
                account=sus_acct,
                transaction__series__code=code,
            ).aggregate(
                dr=Sum(Case(When(side=TransactionEntry.DEBIT,  then=F("amount")), output_field=DecimalField())),
                cr=Sum(Case(When(side=TransactionEntry.CREDIT, then=F("amount")), output_field=DecimalField())),
            )
            if me["dr"] or me["cr"]:
                migs_by_series[code] = {
                    "dr": str(me["dr"] or 0),
                    "cr": str(me["cr"] or 0),
                }

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

    # ── Inventory ─────────────────────────────────────────────────────────────
    inv_item_count  = InventoryItem.objects.filter(tenant=tenant, is_deleted=False).count()
    inv_stock_agg   = InventoryStock.objects.filter(
        tenant=tenant, is_deleted=False
    ).aggregate(
        total_qty=Sum("quantity_on_hand"),
        total_val=Sum("total_value"),
    )
    inv_gl_acct = Account.objects.filter(
        code="1200-00001", tenant=tenant, is_deleted=False
    ).first()
    inv_parent_acct = Account.objects.filter(
        code="1200", tenant=tenant, is_deleted=False
    ).first()

    return Response({
        "as_of":  timezone.now().isoformat(),
        "tenant": {"id": tenant.pk, "name": str(tenant)},
        "gl_by_account_type": {
            **gl_by_type,
            "_note": (
                "WARNING: total_balance includes both parent and child accounts. "
                "Parent balances mirror their children via signals, so totals here are ~2x the real GL balance. "
                "Use loan_portfolio/savings/banks sections for accurate entry-level figures."
            ),
        },
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
        "inventory": {
            "item_count":           inv_item_count,
            "total_quantity_on_hand": str(inv_stock_agg["total_qty"] or 0),
            "total_stock_value":    str(inv_stock_agg["total_val"] or 0),
            "gl_account_1200_00001": {
                "balance":    str(inv_gl_acct.balance)    if inv_gl_acct else None,
                "balance_bf": str(inv_gl_acct.balance_bf) if inv_gl_acct else None,
            },
            "gl_parent_1200": {
                "balance":    str(inv_parent_acct.balance)    if inv_parent_acct else None,
                "balance_bf": str(inv_parent_acct.balance_bf) if inv_parent_acct else None,
            },
            "_note": "GL balance should equal total_stock_value (cost-basis). balance_bf = Jan-1 opening.",
        },
        "savings": {
            "account_count":    sav_acct_count,
            "total_dr_entries": str(sav_entries["total_dr"] or 0),
            "total_cr_entries": str(sav_entries["total_cr"] or 0),
            "net_liability":    str(sav_net),
            "expected_sign":    "POSITIVE (savings owed to members)",
            "entries_by_series": sav_by_series,
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
                "account_type": sus_acct.account_type if sus_acct else None,
                "breakdown_by_series": migs_by_series,
                "_note": (
                    "Non-zero = payments whose bank could not be identified. "
                    "ASSET type: positive balance = net debit (cash came in but not routed). "
                    "breakdown_by_series shows DR (incoming to suspense) vs CR (outgoing from suspense) per series."
                ),
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


# ── Role Navigation Config ─────────────────────────────────────────────────────

class RoleNavigationConfigView(APIView):
    """
    GET  /api/common/navigation/config/
         Returns { role: [id, ...], ... } for every configured role in the tenant.
         Roles not yet saved return null so the frontend falls back to its defaults.

    PUT  /api/common/navigation/config/
         Body: { "role": "Credit Officer", "enabled_ids": ["leaf-x", "leaf-y", ...] }
         Upserts the config for that role (Director/Principal only).

    DELETE /api/common/navigation/config/
         Body: { "role": "Credit Officer" }
         Removes the server-side override so the role reverts to frontend defaults.
    """
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    def get(self, request):
        tenant = getattr(request.user, 'tenant', None)
        if not tenant:
            return Response({})
        configs = RoleNavigationConfig.objects.filter(tenant=tenant)
        return Response({c.role: c.enabled_ids for c in configs})

    def put(self, request):
        user = request.user
        # Only Director/Principal/admin can change nav config
        try:
            allowed = {'Director', 'Principal', 'Admin'}
            role_names = set(user.roles.filter(is_active=True).values_list('name', flat=True))
            if not (allowed & role_names) and not getattr(user, 'is_system_admin', False):
                return Response(
                    {'detail': 'Only Directors and Principals can configure navigation.'},
                    status=status.HTTP_403_FORBIDDEN,
                )
        except Exception:
            pass

        role = request.data.get('role', '').strip()
        enabled_ids = request.data.get('enabled_ids')
        if not role:
            return Response({'detail': 'role is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(enabled_ids, list):
            return Response({'detail': 'enabled_ids must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        tenant = getattr(user, 'tenant', None)
        if not tenant:
            return Response({'detail': 'No tenant.'}, status=status.HTTP_400_BAD_REQUEST)

        obj, _ = RoleNavigationConfig.objects.update_or_create(
            tenant=tenant,
            role=role,
            defaults={'enabled_ids': enabled_ids, 'updated_by': user},
        )
        return Response({'role': obj.role, 'enabled_ids': obj.enabled_ids})

    def delete(self, request):
        role = request.data.get('role', '').strip()
        tenant = getattr(request.user, 'tenant', None)
        if role and tenant:
            RoleNavigationConfig.objects.filter(tenant=tenant, role=role).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
