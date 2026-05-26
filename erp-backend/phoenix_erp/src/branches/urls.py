# branches/urls.py
"""
URL configuration for branches app
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import BranchViewSet

router = DefaultRouter()
router.register(r'', BranchViewSet, basename='branch')

app_name = 'branches'

urlpatterns = [
    path('', include(router.urls)),
]
