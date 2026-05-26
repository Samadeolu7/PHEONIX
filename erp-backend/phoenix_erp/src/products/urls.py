"""
Product URL Configuration
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductViewSet

# Create router and register viewsets
router = DefaultRouter()
router.register(r'products', ProductViewSet, basename='product')

app_name = 'products'

urlpatterns = [
    path('', include(router.urls)),
]
