from django.urls import path

from treasury import views

app_name = 'treasury'

borrowings = views.BorrowingViewSet

urlpatterns = [
    path('forecast/', views.ForecastView.as_view(), name='forecast'),
    path('liquidity-check/loan/<int:loan_id>/', views.LoanLiquidityCheckView.as_view(), name='loan-liquidity-check'),
    path('settings/', views.TreasurySettingsView.as_view(), name='settings'),
    path('bank-accounts/', views.BankAccountChoicesView.as_view(), name='bank-accounts'),

    path('borrowings/', borrowings.as_view({'get': 'list', 'post': 'create'}), name='borrowing-list'),
    path('borrowings/preview/', borrowings.as_view({'post': 'preview'}), name='borrowing-preview'),
    path('borrowings/<int:pk>/', borrowings.as_view({'get': 'retrieve', 'delete': 'destroy'}), name='borrowing-detail'),
    path('borrowings/<int:pk>/receive/', borrowings.as_view({'post': 'receive'}), name='borrowing-receive'),
    path('borrowings/contributions/<int:pk>/send/',
         borrowings.as_view({'post': 'send_contribution'}), name='borrowing-contribution-send'),
    path('borrowings/instalments/<int:pk>/record/',
         borrowings.as_view({'post': 'record_instalment'}), name='borrowing-instalment-record'),
]
