from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import InterBranchTransferViewSet

router = DefaultRouter()
router.register(r'transfers', InterBranchTransferViewSet, basename='interbranch-transfer')

urlpatterns = [
    path('', include(router.urls)),
]
