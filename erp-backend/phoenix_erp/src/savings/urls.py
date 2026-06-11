from rest_framework.routers import DefaultRouter
from .views import (
    SavingsAccountViewSet,
    ContributionScheduleViewSet,
    CompulsorySavingsPolicyViewSet,
    SavingsProductConfigViewSet,
    WithdrawalApprovalTierViewSet,
    SavingsWithdrawalRequestViewSet,
)

app_name = 'savings'

router = DefaultRouter()
router.register('accounts', SavingsAccountViewSet, basename='savings-accounts')
router.register('collection', ContributionScheduleViewSet, basename='savings-collection')
router.register('policy', CompulsorySavingsPolicyViewSet, basename='savings-policy')
router.register('product-configs', SavingsProductConfigViewSet, basename='savings-product-configs')
router.register('withdrawal-tiers', WithdrawalApprovalTierViewSet, basename='savings-withdrawal-tiers')
router.register('withdrawals', SavingsWithdrawalRequestViewSet, basename='savings-withdrawals')

urlpatterns = router.urls
