from django.urls import path, include

from rest_framework.routers import DefaultRouter

from .views import TransactionSeriesViewSet, TransactionViewSet


# Create a router and register our viewsets with it
router = DefaultRouter()
# Register sub-resources first, then the main resource
# This prevents the empty-string route from catching everything
router.register(r'transaction-series', TransactionSeriesViewSet, basename='transactionseries')
router.register(r'', TransactionViewSet, basename='transaction')  # Register last to avoid catching sub-routes

app_name = 'transactions'

urlpatterns = [
    path('', include(router.urls)),
    # Additional URLs can be added here
]