# urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from reports.views import (
    ReportCategoryViewSet, ReportTemplateViewSet,
    ReportExecutionViewSet, ReportScheduleViewSet,
    PDFGeneratorViewSet, FinancialReportsViewSet
)
router = DefaultRouter()

router.register(r'categories', ReportCategoryViewSet, basename='report-category')
router.register(r'templates', ReportTemplateViewSet, basename='report-template')
router.register(r'executions', ReportExecutionViewSet, basename='report-execution')
router.register(r'schedules', ReportScheduleViewSet, basename='report-schedule')
router.register(r'pdf', PDFGeneratorViewSet, basename='pdf-generator')
router.register(r'financial', FinancialReportsViewSet, basename='financial-reports')

urlpatterns = router.urls