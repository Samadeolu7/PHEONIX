from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import TenantViewSet, RoleViewSet, StaffUserViewSet
from .auth import (
    CustomTokenObtainPairView,
    get_current_user,
    register_user,
    change_password,
    update_profile,
    request_password_reset,
    reset_password_confirm,
    verify_token,
)

from rest_framework_simplejwt.views import TokenRefreshView, TokenVerifyView


# Create a router and register our viewsets with it
router = DefaultRouter()

router.register(r'tenants', TenantViewSet, basename='tenant')
router.register(r'roles', RoleViewSet, basename='role')
router.register(r'staff-users', StaffUserViewSet, basename='staffuser')

app_name = 'users'

urlpatterns = [
    path('', include(router.urls)),
    
    # Authentication endpoints
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/verify/', verify_token, name='token_verify'),
    path('auth/me/', get_current_user, name='current_user'),
    
    # User management
    path('auth/register/', register_user, name='register'),
    path('auth/change-password/', change_password, name='change_password'),
    path('auth/update-profile/', update_profile, name='update_profile'),
    path('auth/reset-password/', request_password_reset, name='reset_password'),
    path('auth/reset-password/confirm/', reset_password_confirm, name='reset_password_confirm'),
]