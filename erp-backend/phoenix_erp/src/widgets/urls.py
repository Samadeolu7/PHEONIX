from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from . import widget_endpoints

router = DefaultRouter()
router.register(r'definitions', views.WidgetDefinitionViewSet, basename='widget-definition')
router.register(r'instances', views.WidgetInstanceViewSet, basename='widget-instance')

urlpatterns = [
    path('', include(router.urls)),

    path('api/widgets/students/count/', 
         widget_endpoints.total_students_count,
         name='widget-students-count'),
    
    # Financial widgets
    path('api/widgets/finance/outstanding-fees/',
         widget_endpoints.outstanding_fees_total,
         name='widget-outstanding-fees'),
    path('api/widgets/finance/monthly-income/',
         widget_endpoints.monthly_income,
         name='widget-monthly-income'),
    path('api/widgets/finance/debtor-aging/',
         widget_endpoints.debtor_aging_summary,
         name='widget-debtor-aging'),
    
    # Workflow widgets
    path('api/widgets/workflows/pending-approvals/',
         widget_endpoints.pending_approvals_count,
         name='widget-pending-approvals'),
    path('api/widgets/workflows/recent-runs/',
         widget_endpoints.recent_workflow_runs,
         name='widget-recent-runs'),
    path('api/widgets/workflows/failed-today/',
         widget_endpoints.failed_workflows_today,
         name='widget-failed-workflows'),
    
    # Inventory widgets
    path('api/widgets/inventory/low-stock/',
         widget_endpoints.low_stock_alerts,
         name='widget-low-stock'),
    path('api/widgets/inventory/stock-value/',
         widget_endpoints.total_stock_value,
         name='widget-stock-value'),
    
    # Asset widgets
    path('api/widgets/assets/count/',
         widget_endpoints.total_assets_count,
         name='widget-assets-count'),
    path('api/widgets/assets/value/',
         widget_endpoints.total_asset_value,
         name='widget-assets-value'),
]
