from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ModuleViewSet, ModulePageViewSet,
    PageActionViewSet, RoleActionPermissionViewSet
)
from .views.system_links_views import (
    get_system_links,
    get_link_categories,
    get_homepage_navigation,
    search_links,
)

router = DefaultRouter()
router.register(r'modules', ModuleViewSet, basename='module')
router.register(r'module-pages', ModulePageViewSet, basename='module-page')
router.register(r'page-actions', PageActionViewSet, basename='page-action')
router.register(r'role-action-permissions', RoleActionPermissionViewSet, basename='role-action-permission')

urlpatterns = [
    path('', include(router.urls)),
    # System links registry endpoints (used by dashboard builder)
    path('system-links/', get_system_links, name='system-links'),
    path('system-links/categories/', get_link_categories, name='system-link-categories'),
    path('system-links/navigation/', get_homepage_navigation, name='system-links-navigation'),
    path('system-links/search/', search_links, name='system-links-search'),
]
