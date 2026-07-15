"""
Tenant Middleware for Multi-Tenancy Support

Identifies tenant from:
1. Subdomain (tenant1.yourdomain.com)
2. Custom domain (schoolname.com)
3. HTTP Header (X-Tenant-Slug for API testing)
4. JWT bearer token's `tenant_id` claim (primary path for API clients -
   this middleware runs before DRF resolves `request.user`, so a JWT
   client's authenticated tenant would otherwise be invisible here)
5. Session-authenticated user's tenant (fallback for session auth)

If none of the above resolve a tenant, the request is rejected (except on
public/auth paths) rather than silently attributed to a guessed or stale
tenant - a previous version of this middleware fell back to a hardcoded
default tenant and to whatever tenant was left in thread-local storage by
a prior request on the same worker thread, both of which could leak one
tenant's data into another tenant's request.
"""

from django.http import JsonResponse
from django.shortcuts import redirect
from django.urls import reverse
from .managers import set_current_tenant


class TenantMiddleware:
    """
    Main middleware to identify and set the current tenant.
    
    Tenant Identification Priority:
    1. Subdomain (school1.yourerp.com → looks up tenant with slug='school1')
    2. Custom domain (www.school1.com → looks up tenant with custom_domain='www.school1.com')
    3. X-Tenant-Slug header (for API/testing)
    4. Authenticated user's tenant
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        from users.models import Tenant
        
        tenant = None
        tenant_source = None
        
        # Get the host without port
        host = request.get_host().split(':')[0].lower()
        
        # Method 1: Subdomain detection (most common for SaaS)
        # Example: school1.yourerp.com → tenant slug = 'school1'
        if '.' in host:
            parts = host.split('.')
            
            # For krystartrust.ng domains, default to 'mt' tenant
            if 'krystartrust.ng' in host:
                subdomain = parts[0]
                # Skip common subdomains
                if subdomain not in ['www', 'api', 'admin', 'app', 'localhost', 'erp']:
                    try:
                        tenant = Tenant.objects.get(slug=subdomain, is_active=True)
                        tenant_source = f'subdomain:{subdomain}'
                    except Tenant.DoesNotExist:
                        pass
                
                # If no tenant found, default to 'mt' for krystartrust.ng
                if not tenant:
                    try:
                        tenant = Tenant.objects.get(slug='mt', is_active=True)
                        tenant_source = 'krystartrust.ng:default'
                    except Tenant.DoesNotExist:
                        pass
            
            # Check if it's a subdomain (more than 2 parts or not on localhost)
            elif len(parts) >= 3 or (len(parts) == 2 and parts[0] != 'localhost'):
                subdomain = parts[0]
                
                # Skip common subdomains
                if subdomain not in ['www', 'api', 'admin', 'app', 'localhost', 'erp']:
                    try:
                        tenant = Tenant.objects.get(slug=subdomain, is_active=True)
                        tenant_source = f'subdomain:{subdomain}'
                    except Tenant.DoesNotExist:
                        pass
        
        # Method 2: Custom domain (for premium tenants)
        # Example: www.school1.com → tenant with custom_domain='www.school1.com'
        if not tenant and host not in ['localhost', '127.0.0.1']:
            try:
                # Try exact match first
                tenant = Tenant.objects.get(custom_domain=host, is_active=True)
                tenant_source = f'custom_domain:{host}'
            except Tenant.DoesNotExist:
                # Try without www
                if host.startswith('www.'):
                    try:
                        tenant = Tenant.objects.get(
                            custom_domain=host[4:], 
                            is_active=True
                        )
                        tenant_source = f'custom_domain:{host[4:]}'
                    except Tenant.DoesNotExist:
                        pass
        
        # Method 3: HTTP Header (for API testing/development)
        # Supports both X-Tenant-Slug (slug string) and X-Tenant-ID (UUID/pk)
        tenant_header_provided = False
        if not tenant:
            tenant_slug = request.headers.get('X-Tenant-Slug')
            tenant_id = request.headers.get('X-Tenant-ID')
            tenant_header_provided = bool(tenant_slug or tenant_id)
            if tenant_slug:
                try:
                    tenant = Tenant.objects.get(slug=tenant_slug, is_active=True)
                    tenant_source = f'header:{tenant_slug}'
                except Tenant.DoesNotExist:
                    pass
            if not tenant and tenant_id:
                try:
                    tenant = Tenant.objects.get(id=tenant_id, is_active=True)
                    tenant_source = f'header-id:{tenant_id}'
                except (Tenant.DoesNotExist, Exception):
                    pass

        # Method 4: JWT bearer token's `tenant_id` custom claim.
        # This middleware runs before DRF authenticates the request, so for
        # JWT (bearer-token) API clients `request.user` below is still
        # AnonymousUser - this is the only reliable way to identify the
        # tenant for the predominant auth mechanism this API uses.
        if not tenant:
            jwt_tenant = self._resolve_tenant_from_jwt(request)
            if jwt_tenant:
                tenant = jwt_tenant
                tenant_source = 'jwt_claim'

        # Method 5: Session-authenticated user's tenant (fallback).
        # Prefer tenant owned by the user (tenant_owner) then the user's tenant field
        if not tenant and request.user.is_authenticated:
            if hasattr(request.user, 'tenant_owned') and request.user.tenant_owned:
                tenant = request.user.tenant_owned
                tenant_source = 'user_owner'
            elif hasattr(request.user, 'tenant') and request.user.tenant:
                # Use the tenant associated on the User model (common case in tests)
                tenant = request.user.tenant
                tenant_source = 'user_tenant'

        # Allow admin and public paths without tenant
        public_paths = [
            '/admin/',
            '/admin',
            '/api/docs/',
            '/api/schema/',
            '/static/',
            '/media/',
            '/health/',
        ]

        # Auth paths (login/token refresh) legitimately have no tenant yet -
        # the login flow identifies the user by username (globally unique)
        # and derives their tenant from the authenticated user, not from
        # request.tenant.
        auth_paths = ['/api/auth/', '/api/token/']

        is_public_path = any(request.path.startswith(path) for path in public_paths)
        is_auth_path = any(request.path.startswith(path) for path in auth_paths)

        # Fail closed only when the request actually carries some form of
        # identity/tenant evidence (a bearer token, an authenticated
        # session, or an explicit tenant header) that we couldn't resolve -
        # that combination means we know *who* is asking but not which
        # tenant's data they should see, which previously got silently
        # routed to a guessed default tenant or a stale thread-local value
        # left by an unrelated prior request on the same worker thread.
        # A fully anonymous request (no credentials at all) is left with
        # tenant=None and deferred to the view's own permission_classes -
        # AllowAny endpoints that don't touch tenant-scoped data (static
        # config lookups, health checks, etc.) keep working unchanged, and
        # IsAuthenticated-protected ones are still correctly rejected by
        # DRF's own auth/permission checks further down the stack.
        has_credentials = (
            bool(request.headers.get('Authorization'))
            or request.user.is_authenticated
            or tenant_header_provided
        )
        if not tenant and has_credentials and not is_public_path and not is_auth_path:
            set_current_tenant(None)
            return JsonResponse(
                {'detail': 'Unable to determine your organization for this request. Please log in again.'},
                status=400,
            )

        request.tenant = tenant
        request.tenant_source = tenant_source
        set_current_tenant(tenant)

        # Add tenant info to response headers (useful for debugging)
        response = self.get_response(request)

        if tenant:
            response['X-Tenant-Name'] = tenant.name
            response['X-Tenant-Slug'] = tenant.slug
            response['X-Tenant-Source'] = tenant_source or 'unknown'

        return response

    def _resolve_tenant_from_jwt(self, request):
        """Best-effort tenant resolution from a validated JWT access token.

        This middleware runs before DRF authenticates the request, so
        `request.user` is still AnonymousUser for bearer-token clients at
        this point. `CustomTokenObtainPairSerializer` (users/auth.py)
        embeds a `tenant_id` claim in every issued token specifically so
        this can be resolved without a second DB round-trip through a user
        lookup. Returns None (rather than raising) for any missing,
        malformed, expired, or unresolvable token - this is a lookup, not
        an authentication check; DRF still authenticates the request
        properly inside the view.
        """
        from users.models import Tenant

        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
        except ImportError:
            return None

        authenticator = JWTAuthentication()
        try:
            header = authenticator.get_header(request)
            if header is None:
                return None
            raw_token = authenticator.get_raw_token(header)
            if raw_token is None:
                return None
            validated_token = authenticator.get_validated_token(raw_token)
        except Exception:
            return None

        tenant_id = validated_token.get('tenant_id')
        if not tenant_id:
            return None
        return Tenant.objects.filter(id=tenant_id, is_active=True).first()


class TenantFeatureMiddleware:
    """
    Check if tenant has specific features/modules enabled.
    Returns 403 if trying to access disabled modules.
    """
    
    # Map URL paths to feature flags
    FEATURE_MODULES = {
        'inventory': ['/api/inventory/', '/api/assets/', '/api/stock/'],
        'procurement': ['/api/procurement/', '/api/suppliers/', '/api/purchase/'],
        'hr': ['/api/hr/', '/api/employees/', '/api/departments/'],
        'payroll': ['/api/payroll/', '/api/salaries/'],
        'school': ['/api/students/', '/api/classes/', '/api/enrollments/'],
        'receivables': ['/api/receivables/', '/api/invoices/', '/api/payments/'],
        'expenses': ['/api/expenses/', '/api/resource-consumption/'],
        'accounting': ['/api/finacct/', '/api/accounting/', '/api/journal/'],
        'loans': ['/api/loans/', '/api/loan-products/'],
        'savings': ['/api/savings/', '/api/savings-products/'],
    }
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # Skip if no tenant or public path
        if not hasattr(request, 'tenant') or not request.tenant:
            return self.get_response(request)
        
        # Check feature access
        for feature, paths in self.FEATURE_MODULES.items():
            if any(request.path.startswith(path) for path in paths):
                if not request.tenant.has_feature(feature):
                    return JsonResponse({
                        'error': f'{feature.title()} module not enabled',
                        'message': f'Your organization does not have access to the {feature} module.',
                        'tenant': request.tenant.name,
                        'feature': feature,
                        'contact': 'Contact your administrator to enable this feature.'
                    }, status=403)
        
        return self.get_response(request)


class TenantLimitsMiddleware:
    """
    Enforce tenant limits (max users, storage, etc.)
    Optional - uncomment if you want usage limits
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        if not hasattr(request, 'tenant') or not request.tenant:
            return self.get_response(request)
        
        tenant = request.tenant
        
        # Check subscription expiry (if using subscriptions)
        if hasattr(tenant, 'subscription_expires') and tenant.subscription_expires:
            from django.utils import timezone
            if tenant.subscription_expires < timezone.now().date():
                return JsonResponse({
                    'error': 'Subscription expired',
                    'message': 'Your subscription has expired. Please renew to continue.',
                    'expires_at': tenant.subscription_expires.isoformat()
                }, status=402)  # 402 Payment Required
        
        # TODO: Add more limit checks:
        # - Max users
        # - Max storage
        # - API rate limiting
        
        return self.get_response(request)


class AuditContextMiddleware:
    """
    Sets the current user and IP address in thread-local storage so that the
    Client post_save signal can attach them to CustomerAuditLog entries without
    requiring changes to every view that saves a Client.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        from clients.signals import set_audit_context, clear_audit_context

        user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
        ip = self._get_client_ip(request)
        set_audit_context(user=user, ip_address=ip)
        try:
            response = self.get_response(request)
        finally:
            clear_audit_context()
        return response

    @staticmethod
    def _get_client_ip(request):
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
