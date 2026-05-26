"""
Accounts app test suite.

Import all test modules to make them discoverable by Django's test runner.
"""

from .test_models import (
    PeriodModelTest,
    AccountCategoryModelTest,
    AccountModelTest,
    AccountConcurrencyTest,
    BalanceSheetSnapshotTest
)

from .test_services import (
    CloseMonthServiceTest,
    ReopenPeriodServiceTest,
    YearEndCloseServiceTest,
    CreateBalanceSnapshotsServiceTest,
    GetLiveBalanceServiceTest
)

from .test_api import (
    AccountAPITest,
    PeriodAPITest,
    AccountCategoryAPITest
)

__all__ = [
    # Model tests
    'PeriodModelTest',
    'AccountCategoryModelTest',
    'AccountModelTest',
    'AccountConcurrencyTest',
    'BalanceSheetSnapshotTest',
    
    # Service tests
    'CloseMonthServiceTest',
    'ReopenPeriodServiceTest',
    'YearEndCloseServiceTest',
    'CreateBalanceSnapshotsServiceTest',
    'GetLiveBalanceServiceTest',
    
    # API tests
    'AccountAPITest',
    'PeriodAPITest',
    'AccountCategoryAPITest',
]
