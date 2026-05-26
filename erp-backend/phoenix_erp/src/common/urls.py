from rest_framework.routers import DefaultRouter
from django.urls import path, include

from .views import MenuGroupViewSet, MenuItemViewSet, health_check, BusinessDayViewSet, BackdateRequestViewSet
from .reference_views import (
    trace_reference,
    search_references,
    get_children
)

# Create a router and register our viewsets with it
router = DefaultRouter()
router.register(r'menu-groups', MenuGroupViewSet, basename='menugroup')
router.register(r'menu-items', MenuItemViewSet, basename='menuitem')
router.register(r'business-days', BusinessDayViewSet, basename='businessday')
router.register(r'backdate-requests', BackdateRequestViewSet, basename='backdaterequest')

app_name = 'common'

urlpatterns = [
    path('', include(router.urls)),
    
    # Reference tracking endpoints
    path('references/trace/<str:reference_number>/', trace_reference, name='trace-reference'),
    path('references/search/', search_references, name='search-references'),
    path('references/<str:reference_number>/children/', get_children, name='get-children'),
    path('health/', health_check, name='health-check'),
]
