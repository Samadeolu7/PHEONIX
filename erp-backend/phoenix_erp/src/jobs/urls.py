"""
jobs/urls.py
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter

from jobs.views import ScheduledJobViewSet

app_name = 'jobs'

router = DefaultRouter()
router.register(r'scheduled', ScheduledJobViewSet, basename='scheduled-job')

urlpatterns = [
    path('', include(router.urls)),
]
