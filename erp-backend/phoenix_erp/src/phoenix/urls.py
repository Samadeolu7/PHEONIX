"""
URL configuration for phoenix project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.views.static import serve as serve_static
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from common.debug_views import migration_snapshot


urlpatterns = [
    # Temporary migration-comparison endpoint — remove after verification
    path('api/debug/migration-snapshot/', migration_snapshot, name='migration-snapshot'),

    path('api/common/', include('common.urls', namespace='common')),
    path('admin/', admin.site.urls),
    
    # JWT authentication endpoints
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),

    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"),
    
    #health check endpoint


    path('api/users/', include('users.urls')),
    path('api/accounts/', include('accounts.urls')),
    path('api/transactions/', include('transactions.urls')),
    path('api/automations/', include('automations.urls')),
    path('api/products/', include('products.urls')),
    path('api/procurement/', include('procurement.urls')),
    path('api/branches/', include('branches.urls')),
    path('api/hr/', include('hr.urls', namespace='hr')),
    path('api/clients/', include('clients.urls')),
    path('api/incomes/', include('incomes.urls')),  # Fee management & school fees configuration
    path('api/reports/', include('reports.urls')),
    path('api/loans/', include('loans.urls', namespace='loans')),
    # path('api/savings/', include('savings.urls')),
    path('api/savings/', include('savings.urls', namespace='savings')),
    path('api/pages/', include('pages.urls')),
    path('api/inventory/', include('inventory.urls')),
    path('api/assets/', include('assets.urls')),
    path('api/expenses/', include('expenses.urls')),  # Expense management with workflow
    path('api/liabilities/', include('liabilities.urls')),  # Accounts payable & vendor payments
    path('api/notifications/', include('notifications.urls')),
    path('api/receivables/', include('receivables.urls')),  # Unified accounts receivable
    path('api/tickets/', include('tickets.urls')),  # Support tickets & comments
    path('api/cash-management/', include('cash_management.urls', namespace='cash_management')),  # Cash/Bank Treasury Management
    path('api/budgets/', include('budgets.urls')),  # Budget management and variance reporting
    path('api/banks/', include('banks.urls')),  # Bank management system
    path('api/internal/', include('internal_api.urls', namespace='internal_api')),  # Java microservice internal endpoints
    path('api/', include('dashboards.urls')),
    path('api/analytics/', include('analytics.urls', namespace='analytics')),  # School dashboard analytics
    path('api/permissions/', include('permissions.urls')),  # Fine-grained scope-aware permissions
    path('api/threads/', include('threads.urls')),  # Contextual page-anchored discussion threads
    path('api/jobs/', include('jobs.urls', namespace='jobs')),  # Scheduled job (Celery Beat) admin visibility

]

# Serve media files — use re_path+serve directly so it works in both
# DEBUG=True (development) and DEBUG=False (production/staging).
# Django's static() helper is a no-op when DEBUG=False, so we bypass it.
urlpatterns += [
    re_path(r'^media/(?P<path>.*)$', serve_static, {'document_root': settings.MEDIA_ROOT}),
]
