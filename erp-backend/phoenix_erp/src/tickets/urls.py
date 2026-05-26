# tickets/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import TicketViewSet, TicketCommentViewSet

router = DefaultRouter()
router.register(r'tickets', TicketViewSet)
router.register(r'tickets-comments', TicketCommentViewSet)

urlpatterns = [path('', include(router.urls))]
