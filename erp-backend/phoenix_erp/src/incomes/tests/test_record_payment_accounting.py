"""
Test that record_payment endpoint actually posts journal entries and updates account balances.
This test verifies the fix for the bug where invoices show as paid but GL balances don't update.
"""
from decimal import Decimal
from django.test import TestCase, TransactionTestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from django.utils import timezone

from accounts.models import Account
from clients.models import Client
from incomes.models import Invoice, IncomeCategory
from transactions.models import Transaction as JournalEntry

User = get_user_model()


class RecordPaymentAccountingTest(TransactionTestCase):
    """Test that payment recording actually updates GL balances"""
    
    def setUp(self):
        """Set up test data"""
        self.client = APIClient()
        
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        self.client.force_authenticate(user=self.user)
        
        # Create accounts
        self.income_account = Account.objects.create(
            code='400',
            name='Sales Revenue',
            account_type='INCOME',
            account_level='PARENT',
            owner=self.user,
            balance=Decimal('0.00')
        )
        
        self.ar_account = Account.objects.create(
            code='140',
            name='Accounts Receivable',
            account_type='ASSET',
            account_level='PARENT',
            owner=self.user,
            balance=Decimal('0.00')
        )
        
        self.cash_account = Account.objects.create(
            code='100',
            name='Cash',
            account_type='ASSET',
            account_level='PARENT',
            owner=self.user,
            balance=Decimal('0.00')
        )
        
        # Create income category
        self.category = IncomeCategory.objects.create(
            name='Test Category',
            income_account=self.income_account,
            owner=self.user
        )
        
        # Create client
        self.test_client = Client.objects.create(
            name='Test Client',
            email='client@example.com',
            phone='1234567890',
            owner=self.user
        )
        
        # Create invoice
        self.invoice = Invoice.objects.create(
            client=self.test_client,
            category=self.category,
            invoice_number='INV-001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description='Test Invoice',
            amount=Decimal('1000.00'),
            amount_paid=Decimal('0.00'),
            status='sent',
            owner=self.user
        )
        
    def test_full_payment_posts_to_gl(self):
        """
        CRITICAL TEST: Verify that recording a full payment:
        1. Creates journal entry
        2. Posts the journal entry (approved=True)
        3. Updates all account balances atomically
        4. Invoice status changes to 'paid'
        """
        # Record initial balances
        initial_income = Account.objects.get(pk=self.income_account.pk).balance
        initial_ar = Account.objects.get(pk=self.ar_account.pk).balance
        initial_cash = Account.objects.get(pk=self.cash_account.pk).balance
        
        print(f"\n=== BEFORE PAYMENT ===")
        print(f"Income Account Balance: {initial_income}")
        print(f"AR Account Balance: {initial_ar}")
        print(f"Cash Account Balance: {initial_cash}")
        print(f"Invoice Status: {self.invoice.status}")
        print(f"Invoice Amount Paid: {self.invoice.amount_paid}")
        
        # Make payment through API endpoint
        response = self.client.post(
            f'/api/incomes/invoices/{self.invoice.id}/record_payment/',
            {
                'amount': '1000.00',
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'bank_transfer',
                'bank_account_id': self.cash_account.id,
                'notes': 'Test payment'
            },
            format='json'
        )
        
        # Verify API response
        self.assertEqual(response.status_code, 200, f"API Error: {response.data if hasattr(response, 'data') else response.content}")
        self.assertTrue(response.data.get('success'))
        
        # Reload accounts from database to get updated balances
        income_after = Account.objects.get(pk=self.income_account.pk).balance
        ar_after = Account.objects.get(pk=self.ar_account.pk).balance
        cash_after = Account.objects.get(pk=self.cash_account.pk).balance
        
        # Reload invoice
        self.invoice.refresh_from_db()
        
        print(f"\n=== AFTER PAYMENT ===")
        print(f"Income Account Balance: {income_after} (change: {income_after - initial_income})")
        print(f"AR Account Balance: {ar_after} (change: {ar_after - initial_ar})")
        print(f"Cash Account Balance: {cash_after} (change: {cash_after - initial_cash})")
        print(f"Invoice Status: {self.invoice.status}")
        print(f"Invoice Amount Paid: {self.invoice.amount_paid}")
        
        # Get the journal entry
        journal_entry_id = response.data.get('journal_entry_id')
        self.assertIsNotNone(journal_entry_id, "Journal entry ID should be returned")
        
        journal_entry = JournalEntry.objects.get(pk=journal_entry_id)
        print(f"\n=== JOURNAL ENTRY ===")
        print(f"Journal Entry ID: {journal_entry.id}")
        print(f"Approved (Posted): {journal_entry.approved}")
        print(f"Entries:")
        for entry in journal_entry.entries.all():
            print(f"  - {entry.account.name}: {entry.side} {entry.amount}, Posted: {entry.posted}")
        
        # ASSERTIONS - THE BUG WAS THAT THESE WOULD FAIL
        # Invoice should show as paid
        self.assertEqual(self.invoice.status, 'paid', "Invoice status should be 'paid'")
        self.assertEqual(self.invoice.amount_paid, Decimal('1000.00'), "Invoice amount_paid should be 1000")
        
        # Journal entry should be approved (posted)
        self.assertTrue(journal_entry.approved, "Journal entry should be approved/posted")
        
        # All entries should be posted
        for entry in journal_entry.entries.all():
            self.assertTrue(entry.posted, f"Entry for {entry.account.name} should be posted")
        
        # Account balances should be updated
        # For full payment: Dr. Cash 1000, Cr. Income 1000
        self.assertEqual(cash_after, initial_cash + Decimal('1000.00'), 
                        "Cash account should increase by 1000")
        self.assertEqual(income_after, initial_income - Decimal('1000.00'), 
                        "Income account should increase by 1000 (negative balance for revenue)")
        
        # AR should remain unchanged for full upfront payment
        self.assertEqual(ar_after, initial_ar, 
                        "AR should not change for full upfront payment")
        
        print("\n✅ TEST PASSED: Payment correctly posted to GL and invoice updated")
    
    def test_partial_payment_posts_to_gl(self):
        """
        Test that recording a partial payment:
        1. Creates AR recognition entry (posts)
        2. Creates payment entry (posts)
        3. Updates AR, Cash, and Income balances
        4. Invoice status changes to 'partial'
        """
        # Record initial balances
        initial_income = Account.objects.get(pk=self.income_account.pk).balance
        initial_ar = Account.objects.get(pk=self.ar_account.pk).balance
        initial_cash = Account.objects.get(pk=self.cash_account.pk).balance
        
        print(f"\n=== BEFORE PARTIAL PAYMENT ===")
        print(f"Income: {initial_income}, AR: {initial_ar}, Cash: {initial_cash}")
        
        # Make partial payment (400 of 1000)
        response = self.client.post(
            f'/api/incomes/invoices/{self.invoice.id}/record_payment/',
            {
                'amount': '400.00',
                'payment_date': timezone.now().date().isoformat(),
                'payment_method': 'cash',
                'bank_account_id': self.cash_account.id,
                'notes': 'Partial payment'
            },
            format='json'
        )
        
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data.get('success'))
        
        # Reload
        income_after = Account.objects.get(pk=self.income_account.pk).balance
        ar_after = Account.objects.get(pk=self.ar_account.pk).balance
        cash_after = Account.objects.get(pk=self.cash_account.pk).balance
        self.invoice.refresh_from_db()
        
        print(f"\n=== AFTER PARTIAL PAYMENT ===")
        print(f"Income: {income_after} (Δ{income_after - initial_income})")
        print(f"AR: {ar_after} (Δ{ar_after - initial_ar})")
        print(f"Cash: {cash_after} (Δ{cash_after - initial_cash})")
        print(f"Invoice Status: {self.invoice.status}, Paid: {self.invoice.amount_paid}")
        
        # Assertions
        self.assertEqual(self.invoice.status, 'partial')
        self.assertEqual(self.invoice.amount_paid, Decimal('400.00'))
        
        # For partial payment:
        # 1. AR Recognition: Dr. AR 1000, Cr. Income 1000
        # 2. Payment: Dr. Cash 400, Cr. AR 400
        # Net: AR +600, Cash +400, Income -1000
        self.assertEqual(ar_after, initial_ar + Decimal('600.00'), "AR should increase by net 600")
        self.assertEqual(cash_after, initial_cash + Decimal('400.00'), "Cash should increase by 400")
        self.assertEqual(income_after, initial_income - Decimal('1000.00'), "Income should increase by 1000")
        
        print("\n✅ PARTIAL PAYMENT TEST PASSED")


if __name__ == '__main__':
    import django
    django.setup()
    
    # Run the test
    from django.test.utils import get_runner
    from django.conf import settings
    
    TestRunner = get_runner(settings)
    test_runner = TestRunner()
    test_runner.run_tests(['incomes.tests.test_record_payment_accounting'])
