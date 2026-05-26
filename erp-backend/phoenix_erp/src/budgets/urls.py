"""Budget URL Configuration"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import BudgetPeriodViewSet, BudgetLineViewSet

router = DefaultRouter()
router.register(r'periods', BudgetPeriodViewSet, basename='budgetperiod')
router.register(r'lines', BudgetLineViewSet, basename='budgetline')

urlpatterns = [
    path('', include(router.urls)),
]
