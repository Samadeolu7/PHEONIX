# test_runner.py
"""Quick test runner to see actual errors"""
import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'phoenix.settings')
django.setup()

from decimal import Decimal
from datetime import date, timedelta
from django.contrib.auth import get_user_model
from accounts.models import Account, AccountCategory
from transactions.models import Transaction, TransactionEntry
from branches.models import Branch
from reports.services.financial_statements import FinancialStatementService

User = get_user_model()

print("Creating test data...")

# Try to get existing user or create new one
try:
    user = User.objects.get(username='testowner_quick')
    print("Using existing test user...")
    # Clean up existing related data
    from branches.models import Branch
    Branch.objects.filter(owner=user).delete()
    Account.objects.filter(owner=user).delete()
    Transaction.objects.filter(owner=user).delete()
except User.DoesNotExist:
    print("Creating new test user...")
    user = User.objects.create_user(
        username='testowner_quick',
        email='test_quick@example.com',
        password='testpass123'
    )

from branches.models import Branch
branch, _ = Branch.objects.get_or_create(
    code='TEST',
    defaults={
        'name': 'Test Branch',
        'owner': user,
        'created_by': user
    }
)

# Create asset category
asset_cat = AccountCategory.objects.create(
    name='Assets',
    section=1,
    code_prefix='1',
    owner=user,
    branch=branch,
    created_by=user
)

# Create parent account
cash_parent = Account.objects.create(
    code='101',
    name='Cash',
    account_type=Account.ASSET,
    account_level=Account.LEVEL_PARENT,
    category=asset_cat,
    owner=user,
    branch=branch,
    created_by=user
)

# Create child account
cash_account = Account.objects.create(
    code='101-001',
    name='Main Cash',
    account_type=Account.ASSET,
    account_level=Account.LEVEL_CHILD,
    parent=cash_parent,
    category=asset_cat,
    owner=user,
    branch=branch,
    created_by=user
)

# Create capital account for equity
equity_cat = AccountCategory.objects.create(
    name='Equity',
    section=3,
    code_prefix='3',
    owner=user,
    branch=branch,
    created_by=user
)

equity_parent = Account.objects.create(
    code='301',
    name='Capital',
    account_type=Account.EQUITY,
    account_level=Account.LEVEL_PARENT,
    category=equity_cat,
    owner=user,
    branch=branch,
    created_by=user
)

capital_account = Account.objects.create(
    code='301-001',
    name='Owner Capital',
    account_type=Account.EQUITY,
    account_level=Account.LEVEL_CHILD,
    parent=equity_parent,
    category=equity_cat,
    owner=user,
    branch=branch,
    created_by=user
)

# Create transaction: DR Cash 10,000, CR Capital 10,000
trans = Transaction.objects.create(
    date=date.today() - timedelta(days=10),
    description='Initial investment',
    owner=user,
    branch=branch,
    created_by=user
)

TransactionEntry.objects.create(
    transaction=trans,
    account=cash_account,
    side=TransactionEntry.DEBIT,
    amount=Decimal('10000.00'),
    posted=True
)

TransactionEntry.objects.create(
    transaction=trans,
    account=capital_account,
    side=TransactionEntry.CREDIT,
    amount=Decimal('10000.00'),
    posted=True
)

print("\nTesting FinancialStatementService...")
service = FinancialStatementService(user, branch)

print("\n1. Testing calculate_account_balance for Cash (ASSET)...")
try:
    balance_data = service._calculate_account_balance(
        cash_account,
        None,
        date.today(),
        include_children=False
    )
    print(f"   ✓ Debit: {balance_data['debit']}")
    print(f"   ✓ Credit: {balance_data['credit']}")
    print(f"   ✓ Balance: {balance_data['balance']}")
    print(f"   Expected: Debit=10000.00, Credit=0.00, Balance=10000.00")
except Exception as e:
    print(f"   ✗ ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n2. Testing trial_balance generation...")
try:
    result = service.generate_trial_balance()
    print(f"   ✓ Total Debits: {result['totals']['total_debits']}")
    print(f"   ✓ Total Credits: {result['totals']['total_credits']}")
    print(f"   ✓ Is Balanced: {result['is_balanced']}")
    print(f"   ✓ Account count: {len(result['accounts'])}")
except Exception as e:
    print(f"   ✗ ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n3. Testing profit_loss generation...")
try:
    result = service.generate_profit_loss(
        start_date=date.today() - timedelta(days=30),
        end_date=date.today()
    )
    print(f"   ✓ Revenue: {result['revenue']['total']}")
    print(f"   ✓ Expenses: {result['expenses']['total']}")
    print(f"   ✓ Net Profit: {result['net_profit']}")
except Exception as e:
    print(f"   ✗ ERROR: {e}")
    import traceback
    traceback.print_exc()

print("\n4. Testing balance_sheet generation...")
try:
    result = service.generate_balance_sheet()
    print(f"   ✓ Total Assets: {result['assets']['total']}")
    print(f"   ✓ Total Liabilities: {result['liabilities']['total']}")
    print(f"   ✓ Total Equity: {result['equity']['total']}")
    print(f"   ✓ Is Balanced: {result['is_balanced']}")
except Exception as e:
    print(f"   ✗ ERROR: {e}")
    import traceback
    traceback.print_exc()

# Cleanup
print("\nCleaning up test data...")
Branch.objects.filter(owner=user, code='TEST').delete()
Account.objects.filter(owner=user).delete()
Transaction.objects.filter(owner=user).delete()

print("\n✓ All tests completed!")
