from rest_framework.routers import DefaultRouter
from .views import (
    LoanProductViewSet, LoanAccountViewSet,
    LoanCollateralViewSet, LoanGuarantorViewSet,
    LoanVerificationRequestViewSet, LoanDisbursementViewSet,
    LoanProductFeeViewSet, LoanProductSavingsRequirementViewSet,
    LoanFeeApplicationViewSet, FeesPreviewView,
    LoanRepaymentRequestViewSet,
    LoanRestructureRequestViewSet,
    OfflinePaymentRecordViewSet,
)

router = DefaultRouter()
router.register(r'products', LoanProductViewSet, basename='loanproduct')
router.register(r'accounts', LoanAccountViewSet, basename='loanaccount')
router.register(r'collateral', LoanCollateralViewSet, basename='loancollateral')
router.register(r'guarantors', LoanGuarantorViewSet, basename='loanguarantor')
router.register(r'verification-requests', LoanVerificationRequestViewSet, basename='loanverification')
router.register(r'disbursements', LoanDisbursementViewSet, basename='loandisbursement')
# Fee config endpoints (flat — filter by loan_product= / loan_account= query param)
router.register(r'product-fees', LoanProductFeeViewSet, basename='loanproduct-fees')
router.register(r'product-savings-requirements', LoanProductSavingsRequirementViewSet, basename='loanproduct-savingsreqs')
router.register(r'fee-applications', LoanFeeApplicationViewSet, basename='loanaccount-feeapps')
router.register(r'fees-preview', FeesPreviewView, basename='loanproduct-fees-preview')
router.register(r'repayment-requests', LoanRepaymentRequestViewSet, basename='loanrepaymentrequest')
router.register(r'restructure-requests', LoanRestructureRequestViewSet, basename='loanrestructurerequest')
router.register(r'offline-payments', OfflinePaymentRecordViewSet, basename='offlinepaymentrecord')

app_name = 'loans'

urlpatterns = router.urls
