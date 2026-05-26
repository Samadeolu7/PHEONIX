from rest_framework.routers import DefaultRouter
from .views import (
    SavingsAccountViewSet,
    ContributionScheduleViewSet,
    CompulsorySavingsPolicyViewSet,
)

app_name = 'savings'

router = DefaultRouter()
router.register('accounts', SavingsAccountViewSet, basename='savings-accounts')
router.register('collection', ContributionScheduleViewSet, basename='savings-collection')
router.register('policy', CompulsorySavingsPolicyViewSet, basename='savings-policy')

urlpatterns = router.urls
