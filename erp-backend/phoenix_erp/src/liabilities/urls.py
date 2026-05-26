# liabilities/urls.py
"""
URL routing for Liabilities (Accounts Payable) API
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import AccountsPayableViewSet

app_name = 'liabilities'

router = DefaultRouter()
router.register(r'payables', AccountsPayableViewSet, basename='payable')

urlpatterns = [
    path('', include(router.urls)),
]
