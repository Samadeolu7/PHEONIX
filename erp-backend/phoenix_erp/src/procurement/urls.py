from rest_framework.routers import DefaultRouter
from django.urls import path, include
from .views import (
    SupplierViewSet, SupplierDocumentViewSet, PurchaseOrderViewSet,
    GoodsReceivedNoteViewSet,
    ProcurementConfigViewSet, ThreeWayMatchingViewSet, 
    PurchaseReturnViewSet, PurchaseRequisitionViewSet,
    SupplierQuoteViewSet
)


router = DefaultRouter()
router.register(r'suppliers', SupplierViewSet, basename='supplier')
router.register(r'supplier-documents', SupplierDocumentViewSet, basename='supplierdocument')
router.register(r'supplier-quotes', SupplierQuoteViewSet, basename='supplierquote')
router.register(r'purchase-orders', PurchaseOrderViewSet, basename='purchaseorder')
router.register(r'goods-receipts', GoodsReceivedNoteViewSet, basename='goodsreceivednote')
router.register(r'purchase-returns', PurchaseReturnViewSet, basename='purchasereturn')
router.register(r'purchase-requisitions', PurchaseRequisitionViewSet, basename='purchaserequisition')

# New endpoints
router.register(r'config', ProcurementConfigViewSet, basename='procurement-config')
router.register(r'three-way-matching', ThreeWayMatchingViewSet, basename='three-way-matching')

app_name = 'procurement'

urlpatterns = [
    path('', include(router.urls)),
    # Additional paths can be added here if needed
]