from rest_framework.routers import DefaultRouter
from .views import (
    LoanProductViewSet, LoanAccountViewSet,
    LoanCollateralViewSet, LoanGuarantorViewSet,
    LoanVerificationRequestViewSet, LoanDisbursementViewSet,
)

router = DefaultRouter()
router.register(r'products', LoanProductViewSet, basename='loanproduct')
router.register(r'accounts', LoanAccountViewSet, basename='loanaccount')
router.register(r'collateral', LoanCollateralViewSet, basename='loancollateral')
router.register(r'guarantors', LoanGuarantorViewSet, basename='loanguarantor')
router.register(r'verification-requests', LoanVerificationRequestViewSet, basename='loanverification')
router.register(r'disbursements', LoanDisbursementViewSet, basename='loandisbursement')

app_name = 'loans'

urlpatterns = router.urls
