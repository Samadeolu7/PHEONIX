from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    WorkflowApprovalViewSet,
    ApprovalDelegationViewSet,
    WorkflowTemplateViewSet,
    WorkflowRunViewSet,
    FormSchemaViewSet,
    FormSubmissionViewSet,
    celery_health_check,
)

router = DefaultRouter()
router.register(r'workflows', WorkflowTemplateViewSet, basename='workflow-template')
router.register(r'runs', WorkflowRunViewSet, basename='workflow-run')
router.register(r'forms', FormSchemaViewSet, basename='form-schema')
router.register(r'form-submissions', FormSubmissionViewSet, basename='form-submission')
router.register(r'approvals', WorkflowApprovalViewSet, basename='approval')
router.register(r'delegations', ApprovalDelegationViewSet, basename='delegation')


urlpatterns = [
    path('', include(router.urls)),
    path('celery-health/', celery_health_check, name='celery-health'),
]
