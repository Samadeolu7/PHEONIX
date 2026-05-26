"""
API Integration Test - Verify account balances actually update when recording payment
"""
from decimal import Decimal
from django.test import TransactionTestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.utils import timezone

from accounts.models import Account
from clients.models import Client
from incomes.models import Invoice, IncomeCategory
from branches.models import Branch

User = get_user_model()


class PaymentAPIBalanceTest(TransactionTestCase):
    """Test that payment API actually updates account balances in database"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create test user
        self.user = User.objects.create_user(
            username='apitest',
            email='apitest@example.com',
            password='testpass123'
        )
        self.user.is_superuser = True
        self.user.save()
        self.client.force_authenticate(user=self.user)
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TEST',
            owner=self.user
        )
        
        # Create parent accounts
        self.income_parent = Account.objects.create(
            code='400',
            name='Income',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            balance=Decimal('0.00')
        )
        
        self.asset_parent = Account.objects.create(
            code='100',
            name='Assets',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            branch=self.branch,
            balance=Decimal('0.00')
        )
        
        # Create child accounts with initial zero balances
        self.income_account = Account.objects.create(
            code='400-001',
            name='Test Income',
            account_type=Account.INCOME,
            account_level=Account.LEVEL_CHILD,
            parent=self.income_parent,
            owner=self.user,
            branch=self.branch,
            balance=Decimal('0.00')
        )
        
        self.cash_account = Account.objects.create(
            code='100-001',
            name='Test Cash',
            account_type=Account.ASSET,
            account_level=Account.LEVEL_CHILD,
            parent=self.asset_parent,
            owner=self.user,
            branch=self.branch,
            balance=Decimal('0.00')
        )
        
        # Create income category
        self.category = IncomeCategory.objects.create(
            name='Test Category',
            code='TEST_CAT',
            income_account=self.income_account,
            owner=self.user,
            branch=self.branch
        )
        
        # Create client
        self.test_client = Client.objects.create(
            client_id='API-TEST-001',
            first_name='API Test',
            last_name='Client',
            gender='male',
            email='apiclient@example.com',
            phone_primary='1234567890',
            owner=self.user,
            branch=self.branch
        )
        
        # Create invoice
        self.invoice = Invoice.objects.create(
            client=self.test_client,
            invoice_number=f'API-TEST-{timezone.now().strftime("%Y%m%d%H%M%S")}',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description='API Test Invoice',
            amount=Decimal('1000.00'),
            fee_structure=None,  # Not required for this test
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )
        
    def test_api_payment_updates_account_balances(self):
        """
        CRITICAL TEST: Verify API endpoint actually updates account balances
        
        This test:
        1. Records initial account balances
        2. Calls the API endpoint to record payment
        3. Re-queries the database for account balances
        4. Verifies balances actually changed
        """
        print("\n" + "=" * 70)
        print("API PAYMENT BALANCE UPDATE TEST")
        print("=" * 70)
        
        # Get initial balances from database
        cash_before = Account.objects.get(pk=self.cash_account.pk).balance
        income_before = Account.objects.get(pk=self.income_account.pk).balance
        
        print(f"\n✅ BEFORE PAYMENT:")
        print(f"   Cash Account ({self.cash_account.code}): {cash_before}")
        print(f"   Income Account ({self.income_account.code}): {income_before}")
        print(f"   Invoice Status: {self.invoice.status}")
        print(f"   Invoice Paid: {self.invoice.amount_paid}")
        
        # Make payment through API
        response = self.client.post(
            f'/api/incomes/invoices/{self.invoice.id}/record_payment/',
            {
                'amount': '1000.00',
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'cash',
                'bank_account_id': self.cash_account.id,
                'notes': 'API test payment'
            },
            format='json'
        )
        
        # Verify API response
        print(f"\n\u2705 API RESPONSE:")
        print(f"   Status Code: {response.status_code}")
        if response.status_code == 200:
            print(f"   Response Data: {response.data}")
        else:
            print(f"   Error: {response.content}")
        
        self.assertEqual(response.status_code, 200, f"API returned error: {response.content}")
        self.assertTrue(response.data.get('success'))
        
        # RE-QUERY database for updated balances (this is the critical part!)
        cash_after = Account.objects.get(pk=self.cash_account.pk).balance
        income_after = Account.objects.get(pk=self.income_account.pk).balance
        
        # Reload invoice
        self.invoice.refresh_from_db()
        
        print(f"\n✅ AFTER PAYMENT:")
        print(f"   Cash Account ({self.cash_account.code}): {cash_after}")
        print(f"   Income Account ({self.income_account.code}): {income_after}")
        print(f"   Invoice Status: {self.invoice.status}")
        print(f"   Invoice Paid: {self.invoice.amount_paid}")
        
        # Calculate changes
        cash_change = cash_after - cash_before
        income_change = income_after - income_before
        
        print(f"\n✅ CHANGES:")
        print(f"   Cash Change: {cash_change} (expected: +1000.00)")
        print(f"   Income Change: {income_change} (expected: +1000.00)")
        
        # CRITICAL ASSERTIONS - These will fail if balances don't update
        self.assertEqual(
            cash_after, 
            cash_before + Decimal('1000.00'),
            f"Cash account balance should increase by 1000! Before: {cash_before}, After: {cash_after}"
        )
        
        self.assertEqual(
            income_after,
            income_before + Decimal('1000.00'),
            f"Income account balance should increase by 1000 (positive for income)! Before: {income_before}, After: {income_after}"
        )
        
        # Verify invoice status
        self.assertEqual(self.invoice.status, 'paid', "Invoice should be marked as paid")
        self.assertEqual(self.invoice.amount_paid, Decimal('1000.00'), "Invoice amount_paid should be 1000")
        
        print("\n" + "=" * 70)
        print("\u2705\u2705\u2705 TEST PASSED - ACCOUNT BALANCES UPDATED CORRECTLY!")
        print("=" * 70)


if __name__ == '__main__':
    import django
    django.setup()
    
    from django.test.utils import get_runner
    from django.conf import settings
    
    TestRunner = get_runner(settings)
    test_runner = TestRunner()
    test_runner.run_tests(['incomes.tests.test_api_payment_balance'])
