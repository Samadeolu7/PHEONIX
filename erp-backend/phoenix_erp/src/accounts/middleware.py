"""
Subscription Access Control Middleware

Redirects suspended/expired tenants to payment page.
Allows system admins to bypass all checks.
"""

from django.shortcuts import redirect
from django.urls import reverse


class SubscriptionAccessMiddleware:
    """
    Middleware to redirect suspended tenants to payment page
    
    Exempt URLs (tenants can still access these when suspended):
    - /payment-required/
    - /payment-submit/
    - /api/payments/
    - /api/subscriptions/current/
    - /api/users/auth/ (login, register, etc.)
    - /logout/
    - /admin/ (for staff)
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
        
        # URLs that don't require active subscription
        self.exempt_patterns = [
            '/payment-required/',
            '/payment-submit/',
            '/payment-status/',
            '/subscription-expired/',
            '/logout/',
            '/api/payments/',
            '/api/subscriptions/current/',
            '/api/users/auth/',  # CRITICAL: Allow authentication endpoints
            '/admin/',  # Django admin
            '/static/',
            '/media/',
        ]
    
    def __call__(self, request):
        # Skip for unauthenticated users
        if not request.user.is_authenticated:
            return self.get_response(request)
        
        # Skip for system admin
        if hasattr(request.user, 'is_system_admin') and request.user.is_system_admin:
            return self.get_response(request)
        
        # Skip for staff/superusers
        if request.user.is_staff or request.user.is_superuser:
            return self.get_response(request)
        
        # Skip for exempt URLs
        path = request.path
        if any(path.startswith(pattern) for pattern in self.exempt_patterns):
            return self.get_response(request)
        
        # Check if user is tenant owner
        if request.user.is_owner():
            try:
                # Import here to avoid circular dependency
                from accounts.subscription_models import TenantSubscription
                from django.db import transaction as _tx

                # Wrap in a savepoint: if TenantSubscription or its related table
                # doesn't exist yet (e.g. pending migration), the DB error only
                # rolls back the savepoint and the outer request transaction
                # stays alive.  Without this, the bare except below would swallow
                # the Python exception but leave PostgreSQL's transaction aborted,
                # poisoning every subsequent query for the entire request.
                with _tx.atomic():
                    subscription = TenantSubscription.objects.select_related(
                        'subscription_product'
                    ).get(tenant_owner=request.user, deleted_at__isnull=True)

                # Redirect suspended accounts to payment page
                if subscription.status == 'suspended':
                    if path != reverse('payment_required'):
                        return redirect(reverse('payment_required'))

                # Redirect expired accounts
                if subscription.status == 'expired':
                    if path != reverse('subscription_expired'):
                        return redirect(reverse('subscription_expired'))

                # Check if overdue (auto-suspend is handled by Celery)
                if subscription.is_overdue() and subscription.status == 'active':
                    # Mark as overdue but don't suspend yet (grace period)
                    pass

            except TenantSubscription.DoesNotExist:
                # No subscription found - allow access for initial setup
                pass
            except Exception as e:
                # Log error but don't block access
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Subscription check error for user {request.user.id}: {e}")
        
        # Call the next middleware/view
        response = self.get_response(request)
        return response
