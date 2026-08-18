from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView


def _has_global_scope(user):
    """
    True when the user can see across every branch — mirrors
    common.views.ScopedModelViewSet._is_elevated_user exactly, so the
    frontend's branch-switcher visibility never drifts from what the
    backend actually treats as elevated (e.g. custom global-scope roles
    like "MD / CEO" or "Auditor", not just a hardcoded set of role names).
    """
    if user.is_system_admin or user.is_owner():
        return True
    try:
        return user.roles.filter(is_active=True, default_scope='global').exists()
    except Exception:
        return False


def _temp_branch_access(user):
    """
    Active temporary cross-branch grants for `user`, as
    [{id, name, expires_at}, ...] — lets the frontend branch switcher offer
    a non-elevated user their granted branch(es) alongside their own.
    Isolated try/except: must never break login/me.
    """
    try:
        from permissions.services import get_temp_branch_overrides
        return [
            {
                'id': o.target_branch_id,
                'name': o.target_branch.name,
                'expires_at': o.effective_expires_at,
            }
            for o in get_temp_branch_overrides(user)
        ]
    except Exception:
        return []


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class PasswordResetRateThrottle(AnonRateThrottle):
    scope = 'password_reset'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.core.mail import send_mail
from django.conf import settings
from .models import User, Tenant
from .serializers import UserSerializer

User = get_user_model()

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        
        # Add custom claims
        token['username'] = user.username
        token['email'] = user.email
        token['tenant_id'] = str(user.tenant.id) if user.tenant else None
        token['tenant_name'] = user.tenant.name if user.tenant else None
        token['is_owner'] = user.is_owner()
        token['is_staff'] = user.is_staff
        token['is_system_admin'] = user.is_system_admin
        token['branch_id'] = str(user.branch.id) if user.branch else None
        token['assigned_dashboard_id'] = user.assigned_dashboard.id if hasattr(user, 'assigned_dashboard') and user.assigned_dashboard else None
        # Avoid embedding full permission lists in JWT (can make token very large)
        # Keep role names in token for quick checks; full permissions are returned in login response
        try:
            token['roles'] = list(user.roles.values_list('name', flat=True))
        except Exception:
            token['roles'] = []
        
        return token

    def validate(self, attrs):
        # Temporarily disable tenant filtering for authentication
        from common.managers import set_current_tenant
        
        # Clear tenant context during authentication
        set_current_tenant(None)
        
        try:
            data = super().validate(attrs)
        except Exception as e:
            # Re-raise with more context
            raise
        
        # Add extra responses
        data['user'] = {
            'id': self.user.id,
            'username': self.user.username,
            'email': self.user.email,
            'first_name': self.user.first_name,
            'last_name': self.user.last_name,
            'tenant_id': self.user.tenant.id if self.user.tenant else None,
            'tenant_name': self.user.tenant.name if self.user.tenant else None,
            'is_owner': self.user.is_owner(),
            'is_staff': self.user.is_staff,
            'is_system_admin': self.user.is_system_admin,
            'has_global_scope': _has_global_scope(self.user),
            'temp_branch_access': _temp_branch_access(self.user),
            'branch_id': self.user.branch.id if self.user.branch else None,
            'branch_name': self.user.branch.name if self.user.branch else None,
            'assigned_dashboard_id': self.user.assigned_dashboard.id if hasattr(self.user, 'assigned_dashboard') and self.user.assigned_dashboard else None,
            'assigned_dashboard_slug': self.user.assigned_dashboard.slug if hasattr(self.user, 'assigned_dashboard') and self.user.assigned_dashboard else None,
            'role_dashboard_id': None,
            'role_dashboard_slug': None,
            'roles': list(self.user.roles.values_list('name', flat=True)),
            # Action permission codes (custom hyphenated codes from roles/user)
            'permission_codes': list(self.user.get_all_action_permissions()),
            # Role-level permission mappings
            'role_permissions': {},
            'role_permission_codes': {},
            'roles_permission_codes': [],
        }
        # populate role permission entries for the response
        try:
            role_perms_map = {}
            role_perm_codes_map = {}
            all_excluded: set = set()
            for r in self.user.roles.all():
                # Use role.permission_codes (JSONField) which stores action codes like 'po-list'
                codes = r.permission_codes if isinstance(r.permission_codes, list) else []
                role_perms_map[r.name] = codes
                role_perm_codes_map[r.name] = codes
                excluded = r.excluded_permission_codes if isinstance(r.excluded_permission_codes, list) else []
                all_excluded.update(excluded)
            data['user']['role_permissions'] = role_perms_map
            data['user']['role_permission_codes'] = role_perm_codes_map
            data['user']['roles_permission_codes'] = list({c for codes in role_perm_codes_map.values() for c in codes})
            # Surface the aggregated exclusions so the frontend can honour them
            data['user']['excluded_permission_codes'] = sorted(all_excluded)
        except Exception:
            pass

        # Bulk module:page permission matrix — lets the frontend derive route
        # access and nav visibility from one payload instead of hand-written
        # per-role nav allowlists. Isolated in its own try/except: a failure
        # here must not break login.
        try:
            from permissions.services import PermissionResolver
            data['user']['page_permissions'] = PermissionResolver.resolve_bulk_matrix(self.user)
        except Exception:
            data['user']['page_permissions'] = {'wildcard': False, 'legacy_mode': True, 'pages': {}}

        # Role-level default dashboard fallback (for bulk-assigned staff)
        try:
            role_dash = (
                self.user.roles
                .filter(default_dashboard__isnull=False)
                .select_related('default_dashboard')
                .values_list('default_dashboard__id', 'default_dashboard__slug')
                .first()
            )
            if role_dash:
                data['user']['role_dashboard_id'] = role_dash[0]
                data['user']['role_dashboard_slug'] = role_dash[1]
        except Exception:
            pass

        return data

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_classes = [LoginRateThrottle]

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user(request):
    """Get current authenticated user details"""
    user = request.user
    try:
        from permissions.services import PermissionResolver
        page_permissions = PermissionResolver.resolve_bulk_matrix(user)
    except Exception:
        page_permissions = {'wildcard': False, 'legacy_mode': True, 'pages': {}}
    return Response({
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'tenant_id': user.tenant.id if user.tenant else None,
        'tenant_name': user.tenant.name if user.tenant else None,
        'is_owner': user.is_owner(),
        'is_staff': user.is_staff,
        'is_system_admin': user.is_system_admin,
        'has_global_scope': _has_global_scope(user),
        'temp_branch_access': _temp_branch_access(user),
        'branch_id': user.branch.id if user.branch else None,
        'branch_name': user.branch.name if user.branch else None,
        'assigned_dashboard_id': user.assigned_dashboard.id if hasattr(user, 'assigned_dashboard') and user.assigned_dashboard else None,
        'assigned_dashboard_slug': user.assigned_dashboard.slug if hasattr(user, 'assigned_dashboard') and user.assigned_dashboard else None,
        'roles': list(user.roles.values_list('name', flat=True)),
        'permission_codes': list(user.get_all_action_permissions()),
        # Role-level permission mappings (role name -> [action permission codes])
        'role_permissions': {
            r.name: (r.permission_codes if isinstance(r.permission_codes, list) else [])
            for r in user.roles.all()
        },
        'role_permission_codes': {
            r.name: (r.permission_codes if isinstance(r.permission_codes, list) else [])
            for r in user.roles.all()
        },
        'page_permissions': page_permissions,
    })

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([RegisterRateThrottle])
def register_user(request):
    """Register a new user (for tenant creation or staff invitation)"""
    data = request.data
    
    # Validate required fields
    required_fields = ['username', 'email', 'password', 'tenant_name']
    for field in required_fields:
        if field not in data:
            return Response(
                {'error': f'{field} is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    # Check if username already exists
    if User.objects.filter(username=data['username']).exists():
        return Response(
            {'error': 'Username already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check if email already exists
    if User.objects.filter(email=data['email']).exists():
        return Response(
            {'error': 'Email already exists'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate password
    try:
        validate_password(data['password'])
    except ValidationError as e:
        return Response(
            {'error': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        # Create tenant
        tenant = Tenant.objects.create(
            name=data['tenant_name'],
            slug=data['tenant_name'].lower().replace(' ', '-'),
            domain_type=data.get('domain_type', 'microfinance'),
        )
        
        # Create user as tenant owner
        user = User.objects.create_user(
            username=data['username'],
            email=data['email'],
            password=data['password'],
            first_name=data.get('first_name', ''),
            last_name=data.get('last_name', ''),
            tenant=tenant,
        )
        
        # Set as owner
        tenant.owner = user
        tenant.save()
        
        return Response({
            'message': 'User registered successfully',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email,
                'tenant_id': tenant.id,
                'tenant_name': tenant.name,
            }
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    """Change user password"""
    user = request.user
    data = request.data
    
    # Validate required fields
    if 'old_password' not in data or 'new_password' not in data:
        return Response(
            {'error': 'old_password and new_password are required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Check old password
    if not user.check_password(data['old_password']):
        return Response(
            {'error': 'Old password is incorrect'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Validate new password
    try:
        validate_password(data['new_password'], user)
    except ValidationError as e:
        return Response(
            {'error': list(e.messages)},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Set new password
    user.set_password(data['new_password'])
    user.save()
    
    return Response({'message': 'Password changed successfully'})

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    """Update user profile"""
    user = request.user
    data = request.data
    
    # Update allowed fields
    allowed_fields = ['first_name', 'last_name', 'email']
    for field in allowed_fields:
        if field in data:
            setattr(user, field, data[field])
    
    user.save()
    
    return Response({
        'message': 'Profile updated successfully',
        'user': {
            'id': user.id,
            'username': user.username,
            'email': user.email,
            'first_name': user.first_name,
            'last_name': user.last_name,
        }
    })

@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def request_password_reset(request):
    """Request password reset (sends email with token)"""
    email = request.data.get('email')
    
    if not email:
        return Response(
            {'error': 'Email is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        user = User.objects.get(email=email)

        # Create token and uid
        token = default_token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))

        # Build a password reset URL (frontend should handle the token)
        reset_path = f"/account/reset-password/confirm?uid={uid}&token={token}"
        reset_url = request.build_absolute_uri(reset_path)

        subject = 'Password reset instructions'
        message = (
            f'Hello {user.first_name or user.username},\n\n'
            'We received a request to reset your password. Click the link below to reset it:\n\n'
            f'{reset_url}\n\n'
            'If you did not request this, you can ignore this email.'
        )

        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
        try:
            send_mail(subject, message, from_email, [email], fail_silently=False)
        except Exception as e:
            # Log and return generic success so user enumeration is not possible
            print('Failed to send reset email:', e)

        return Response({'message': 'If that email exists, password reset instructions have been sent'})
    except User.DoesNotExist:
        # Always return generic response for security
        return Response({'message': 'If that email exists, password reset instructions have been sent'})


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([PasswordResetRateThrottle])
def reset_password_confirm(request):
    """Confirm password reset: accepts uid, token and new_password"""
    uidb64 = request.data.get('uid') or request.query_params.get('uid')
    token = request.data.get('token') or request.query_params.get('token')
    new_password = request.data.get('new_password')

    if not uidb64 or not token or not new_password:
        return Response({'error': 'uid, token and new_password are required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        uid = force_str(urlsafe_base64_decode(uidb64))
        user = User.objects.get(pk=uid)
    except Exception:
        return Response({'error': 'Invalid uid/token'}, status=status.HTTP_400_BAD_REQUEST)

    if not default_token_generator.check_token(user, token):
        return Response({'error': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        validate_password(new_password, user)
    except ValidationError as e:
        return Response({'error': list(e.messages)}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.save()
    return Response({'message': 'Password has been reset successfully'})

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def verify_token(request):
    """Verify if token is valid"""
    return Response({'valid': True, 'user_id': request.user.id})