from django.urls import include, path
from rest_framework.routers import DefaultRouter

from . import views

app_name = 'portal'

staff_router = DefaultRouter()
staff_router.register('applications', views.StaffOnlineApplicationViewSet, basename='staff-application')
staff_router.register('invitations', views.StaffPortalInvitationViewSet, basename='staff-invitation')
staff_router.register('withdrawals', views.StaffOnlineWithdrawalViewSet, basename='staff-withdrawal')

urlpatterns = [
    # Public
    path('info/', views.PortalInfoView.as_view(), name='info'),
    path('products/', views.PortalProductsView.as_view(), name='products'),
    path('branches/', views.PortalBranchesView.as_view(), name='branches'),

    # Customer auth
    path('auth/register/', views.RegisterView.as_view(), name='register'),
    path('auth/verify-email/', views.VerifyEmailView.as_view(), name='verify-email'),
    path('auth/resend-verification/', views.ResendVerificationView.as_view(), name='resend-verification'),
    path('auth/login/', views.LoginView.as_view(), name='login'),
    path('auth/invitation/', views.InvitationLookupView.as_view(), name='invitation'),
    path('auth/accept-invitation/', views.AcceptInvitationView.as_view(), name='accept-invitation'),
    path('auth/logout/', views.LogoutView.as_view(), name='logout'),
    path('auth/password-reset/', views.PasswordResetRequestView.as_view(), name='password-reset'),
    path('auth/password-reset/confirm/', views.PasswordResetConfirmView.as_view(), name='password-reset-confirm'),
    path('auth/change-password/', views.ChangePasswordView.as_view(), name='change-password'),
    path('me/', views.MeView.as_view(), name='me'),
    path('me/accounts/', views.MyAccountsView.as_view(), name='my-accounts'),
    path('withdrawals/', views.WithdrawalListCreateView.as_view(), name='withdrawals'),
    path('withdrawals/<str:reference>/cancel/', views.WithdrawalCancelView.as_view(), name='withdrawal-cancel'),

    # Customer applications
    path('applications/', views.ApplicationListCreateView.as_view(), name='applications'),
    path('applications/<str:reference>/', views.ApplicationDetailView.as_view(), name='application-detail'),
    path('applications/<str:reference>/withdraw/', views.ApplicationWithdrawView.as_view(), name='application-withdraw'),
    path('applications/<str:reference>/documents/', views.ApplicationDocumentsView.as_view(), name='application-documents'),
    path('applications/<str:reference>/documents/<int:doc_id>/', views.ApplicationDocumentDeleteView.as_view(), name='application-document'),

    # Director settings (staff JWT; directors only)
    path('staff/settings/', views.StaffPortalSettingsViewSet.as_view({'get': 'list', 'put': 'put'}), name='staff-settings'),
    path('staff/settings/offerings/', views.StaffPortalSettingsViewSet.as_view({'post': 'save_offering'}), name='staff-settings-offering'),
    path('staff/settings/offerings/<int:offering_id>/remove/', views.StaffPortalSettingsViewSet.as_view({'post': 'remove_offering'}), name='staff-settings-offering-remove'),

    # Staff review (staff JWT auth + page permission)
    path('staff/', include(staff_router.urls)),
]
