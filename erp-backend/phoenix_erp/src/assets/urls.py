# assets/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    AssetCategoryViewSet,
    FixedAssetViewSet,
    AssetDepreciationViewSet,
    AssetMaintenanceViewSet,
    AssetAcquisitionViewSet,
    AssetRequisitionViewSet,
)

router = DefaultRouter()
router.register(r'categories', AssetCategoryViewSet, basename='assetcategory')
router.register(r'assets', FixedAssetViewSet, basename='fixedasset')
router.register(r'depreciation', AssetDepreciationViewSet, basename='assetdepreciation')
router.register(r'maintenance', AssetMaintenanceViewSet, basename='assetmaintenance')
router.register(r'acquisitions', AssetAcquisitionViewSet, basename='assetacquisition')
router.register(r'requisitions', AssetRequisitionViewSet, basename='assetrequisition')

urlpatterns = [
    path('', include(router.urls)),
]
