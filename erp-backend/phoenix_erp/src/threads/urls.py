from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ThreadViewSet, ThreadMessageViewSet, ThreadParticipantViewSet

router = DefaultRouter()
router.register(r'threads', ThreadViewSet, basename='thread')
router.register(r'thread-messages', ThreadMessageViewSet, basename='thread-message')
router.register(r'thread-participants', ThreadParticipantViewSet, basename='thread-participant')

urlpatterns = [path('', include(router.urls))]
