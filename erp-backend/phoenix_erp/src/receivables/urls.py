from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerReceivableViewSet,
    ReceivableActivityLogViewSet,
    CustomerStatementViewSet
)

router = DefaultRouter()
router.register(r'receivables', CustomerReceivableViewSet, basename='customerreceivable')
router.register(r'activity-logs', ReceivableActivityLogViewSet, basename='receivableactivitylog')
router.register(r'statements', CustomerStatementViewSet, basename='customerstatement')

urlpatterns = [
    path('', include(router.urls)),
]