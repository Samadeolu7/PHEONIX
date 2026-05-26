from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClientViewSet, ClientClassificationViewSet, 
    ClientDocumentViewSet, ClientRelationshipViewSet, ClientNoteViewSet,
    ClientGroupViewSet,
)
from .views_statement import ClientStatementViewSet

router = DefaultRouter()
router.register(r'clients', ClientViewSet, basename='client')
router.register(r'classifications', ClientClassificationViewSet, basename='clientclassification')
router.register(r'documents', ClientDocumentViewSet, basename='clientdocument')
router.register(r'relationships', ClientRelationshipViewSet, basename='clientrelationship')
router.register(r'notes', ClientNoteViewSet, basename='clientnote')
router.register(r'statements', ClientStatementViewSet, basename='client-statement')
router.register(r'groups', ClientGroupViewSet, basename='clientgroup')

app_name = 'clients'

urlpatterns = router.urls
