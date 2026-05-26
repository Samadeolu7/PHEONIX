"""
Comprehensive Tests for Cash Management System
Tests the cashier account workflow with NO LOOPHOLES

Test Coverage:
1. Receipt recording increases balance
2. Regular cashiers CANNOT transfer directly to non-cashier banks
3. Transfers must go through cashier bank accounts (intermediate)
4. Approval workflow enforcement
5. Head cashier/admin bypass approval
6. All cashier accounts must be zero at EOD
7. Balance protection mechanisms
8. Double-entry accounting validation
"""
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db import transaction as db_transaction

from accounts.models import Account, AccountCategory
from clients.models import Client
from branches.models import Branch
from .models import CashierAccount, CashCollection, CashTransfer


User = get_user_model()


class CashierAccountWorkflowTests(TestCase):
    """Test complete cashier account workflow with approval chain"""
    
    def setUp(self):
        """Set up test data"""
        # Create users
        self.regular_cashier_user = User.objects.create_user(
            username='cashier1',
            email='cashier1@example.com',
            password='test123',
            is_staff=False
        )
        
        self.head_cashier_user = User.objects.create_user(
            username='head_cashier',
            email='head@example.com',
            password='test123',
            is_staff=True
        )
        
        self.admin_user = User.objects.create_user(
            username='admin',
            email='admin@example.com',
            password='test123',
            is_staff=True,
            is_superuser=True
        )
        
        self.approver_user = User.objects.create_user(
            username='approver',
            email='approver@example.com',
            password='test123',
            is_staff=True
        )
        
        # Create branch
        self.branch = Branch.objects.create(
            name='Main Branch',
            code='MB001'
        )
        
        # Create account hierarchy
        # Parent: Cash on Hand (150)
        self.cash_parent = Account.objects.create(
            code='150',
            name='Cash on Hand',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            branch=self.branch
        )
        
        # Child: Regular Cashier Account (150-001)
        self.regular_cashier_gl_account = Account.objects.create(
            code='150-001',
            name='Cashier 1 Account',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.cash_parent,
            branch=self.branch
        )
        
        # Child: Head Cashier Account (150-002)
        self.head_cashier_gl_account = Account.objects.create(
            code='150-002',
            name='Head Cashier Account',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.cash_parent,
            branch=self.branch,
            is_cashier_bank=True  # Head cashier account IS a cashier bank (intermediate point)
        )
        
        # Child: Intermediate Cashier Bank (150-003) - for transfers needing approval
        self.intermediate_cashier_bank = Account.objects.create(
            code='150-003',
            name='Cashier Bank - Pending',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.cash_parent,
            branch=self.branch,
            is_cashier_bank=True  # Flag to indicate this is a cashier bank
        )
        
        # Parent: Bank Accounts (101)
        self.bank_parent = Account.objects.create(
            code='101',
            name='Bank Accounts',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            branch=self.branch
        )
        
        # Child: Main Bank Account (101-001) - NON-CASHIER BANK
        self.main_bank_account = Account.objects.create(
            code='101-001',
            name='Main Bank Account',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.bank_parent,
            branch=self.branch,
            is_cashier_bank=False  # This is NOT a cashier bank
        )
        
        # Parent: Income Accounts (400)
        self.income_parent = Account.objects.create(
            code='400',
            name='Income',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME,
            branch=self.branch
        )
        
        # Child: Tuition Income (400-001)
        self.tuition_income = Account.objects.create(
            code='400-001',
            name='Tuition Fee Income',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.INCOME,
            parent=self.income_parent,
            branch=self.branch
        )
        
        # Create cashier accounts
        self.regular_cashier = CashierAccount.objects.create(
            account_number='CASH-001',
            name='Regular Cashier 1',
            cashier=self.regular_cashier_user,
            account=self.regular_cashier_gl_account,
            branch=self.branch,
            is_active=True,
            daily_collection_limit=Decimal('100000.00'),
            requires_dual_approval=False
        )
        
        self.head_cashier = CashierAccount.objects.create(
            account_number='CASH-HEAD',
            name='Head Cashier',
            cashier=self.head_cashier_user,
            account=self.head_cashier_gl_account,
            branch=self.branch,
            is_active=True,
            requires_dual_approval=False
        )
        
        # Create client
        self.client = Client.objects.create(
            first_name='John',
            last_name='Student',
            branch=self.branch
        )
    
    def test_receipt_increases_cashier_balance(self):
        """Test 1: Recording receipt increases cashier balance"""
        initial_balance = self.regular_cashier.current_balance
        
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_due=Decimal('50000.00'),
            amount_collected=Decimal('50000.00'),
            payment_purpose='Tuition Fee',
            branch=self.branch
        )
        
        # Post the collection
        collection.post(user=self.regular_cashier_user)
        
        # Refresh cashier account
        self.regular_cashier.refresh_from_db()
        
        # Balance should increase by collected amount
        self.assertEqual(
            self.regular_cashier.current_balance,
            initial_balance + Decimal('50000.00')
        )
    
    def test_regular_cashier_cannot_transfer_to_non_cashier_bank(self):
        """Test 2: Regular cashier CANNOT transfer directly to non-cashier bank"""
        # Give cashier some balance
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Try to transfer directly to main bank (should fail)
        with self.assertRaises(ValidationError) as context:
            transfer = CashTransfer.objects.create(
                cashier_account=self.regular_cashier,
                destination_account=self.main_bank_account,  # Non-cashier bank
                amount=Decimal('50000.00'),
                branch=self.branch
            )
            transfer.full_clean()  # This should raise ValidationError
        
        self.assertIn('Regular cashiers cannot transfer directly to non-cashier bank', 
                      str(context.exception))
    
    def test_regular_cashier_must_use_intermediate_cashier_bank(self):
        """Test 3: Regular cashier must transfer to intermediate cashier bank first"""
        # Give cashier some balance
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Transfer to intermediate cashier bank (should succeed)
        transfer = CashTransfer.objects.create(
            cashier_account=self.regular_cashier,
            destination_account=self.intermediate_cashier_bank,  # Cashier bank
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='draft'
        )
        
        # Should not raise error
        transfer.full_clean()
        self.assertEqual(transfer.status, 'draft')
    
    def test_transfer_approval_workflow(self):
        """Test 4: Transfer approval workflow is enforced"""
        # Give cashier balance
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Create transfer to cashier bank
        transfer = CashTransfer.objects.create(
            cashier_account=self.regular_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='draft'
        )
        
        # Submit for approval
        transfer.submit(user=self.regular_cashier_user)
        self.assertEqual(transfer.status, 'pending')
        
        # Approve
        transfer.approve(user=self.approver_user)
        self.assertEqual(transfer.status, 'posted')
        
        # Cashier balance should now be zero
        self.regular_cashier.refresh_from_db()
        self.assertEqual(self.regular_cashier.current_balance, Decimal('0.00'))
    
    def test_head_cashier_can_bypass_to_main_bank(self):
        """Test 5: Head cashier can transfer directly to non-cashier bank"""
        # Give head cashier balance
        collection = CashCollection.objects.create(
            cashier_account=self.head_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('75000.00'),
            amount_due=Decimal('75000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.head_cashier_user)
        
        # Head cashier can transfer directly to main bank
        transfer = CashTransfer.objects.create(
            cashier_account=self.head_cashier,
            destination_account=self.main_bank_account,  # Non-cashier bank
            amount=Decimal('75000.00'),
            branch=self.branch,
            status='draft'
        )
        
        # Should not raise error for head cashier
        transfer.full_clean()
        
        # Submit and auto-approve (head cashier privilege)
        transfer.submit(user=self.head_cashier_user)
        transfer.approve(user=self.head_cashier_user)
        
        # Should be posted
        self.assertEqual(transfer.status, 'posted')
        
        # Head cashier balance should be zero
        self.head_cashier.refresh_from_db()
        self.assertEqual(self.head_cashier.current_balance, Decimal('0.00'))
    
    def test_admin_can_bypass_to_main_bank(self):
        """Test 6: Admin can transfer directly to non-cashier bank"""
        # Create admin cashier account
        admin_gl_account = Account.objects.create(
            code='150-004',
            name='Admin Cashier Account',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.cash_parent,
            branch=self.branch
        )
        
        admin_cashier = CashierAccount.objects.create(
            account_number='CASH-ADMIN',
            name='Admin Cashier',
            cashier=self.admin_user,
            account=admin_gl_account,
            branch=self.branch,
            is_active=True
        )
        
        # Give admin balance
        collection = CashCollection.objects.create(
            cashier_account=admin_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('100000.00'),
            amount_due=Decimal('100000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.admin_user)
        
        # Admin can transfer directly to main bank
        transfer = CashTransfer.objects.create(
            cashier_account=admin_cashier,
            destination_account=self.main_bank_account,
            amount=Decimal('100000.00'),
            branch=self.branch,
            status='draft'
        )
        
        # Should not raise error for admin
        transfer.full_clean()
        transfer.submit(user=self.admin_user)
        transfer.approve(user=self.admin_user)
        
        self.assertEqual(transfer.status, 'posted')
        admin_cashier.refresh_from_db()
        self.assertEqual(admin_cashier.current_balance, Decimal('0.00'))
    
    def test_all_cashier_accounts_must_be_zero_eod(self):
        """Test 7: All cashier accounts must be zero at end of day"""
        # Give multiple cashiers balances
        collection1 = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection1.post(user=self.regular_cashier_user)
        
        collection2 = CashCollection.objects.create(
            cashier_account=self.head_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('75000.00'),
            amount_due=Decimal('75000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection2.post(user=self.head_cashier_user)
        
        # Check that cashiers have balances
        self.regular_cashier.refresh_from_db()
        self.head_cashier.refresh_from_db()
        
        self.assertGreater(self.regular_cashier.current_balance, Decimal('0.00'))
        self.assertGreater(self.head_cashier.current_balance, Decimal('0.00'))
        
        # Regular cashier transfers to intermediate bank
        transfer1 = CashTransfer.objects.create(
            cashier_account=self.regular_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=self.regular_cashier.current_balance,
            branch=self.branch,
            status='draft'
        )
        transfer1.submit(user=self.regular_cashier_user)
        transfer1.approve(user=self.approver_user)
        
        # Head cashier transfers to main bank
        transfer2 = CashTransfer.objects.create(
            cashier_account=self.head_cashier,
            destination_account=self.main_bank_account,
            amount=self.head_cashier.current_balance,
            branch=self.branch,
            status='draft'
        )
        transfer2.submit(user=self.head_cashier_user)
        transfer2.approve(user=self.head_cashier_user)
        
        # Both cashier balances should now be zero
        self.regular_cashier.refresh_from_db()
        self.head_cashier.refresh_from_db()
        
        self.assertEqual(self.regular_cashier.current_balance, Decimal('0.00'))
        self.assertEqual(self.head_cashier.current_balance, Decimal('0.00'))
    
    def test_cannot_transfer_more_than_balance(self):
        """Test 8: Cannot transfer more than current balance"""
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Try to transfer more than balance
        with self.assertRaises(ValidationError) as context:
            transfer = CashTransfer.objects.create(
                cashier_account=self.regular_cashier,
                destination_account=self.intermediate_cashier_bank,
                amount=Decimal('60000.00'),  # More than 50,000 balance
                branch=self.branch
            )
            transfer.full_clean()
        
        self.assertIn('exceeds cashier balance', str(context.exception))
    
    def test_double_entry_accounting_balance(self):
        """Test 9: Double-entry accounting creates balanced journal entries"""
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        
        journal = collection.post(user=self.regular_cashier_user)
        
        # Check journal entries
        entries = journal.entries.all()
        self.assertEqual(entries.count(), 2)
        
        # Sum debits and credits
        total_debits = sum(e.amount for e in entries if e.side == 'DR')
        total_credits = sum(e.amount for e in entries if e.side == 'CR')
        
        # Must be balanced
        self.assertEqual(total_debits, total_credits)
        self.assertEqual(total_debits, Decimal('50000.00'))
    
    def test_cannot_bypass_approval_by_posting_directly(self):
        """Test 10: Cannot bypass approval by posting transfer directly"""
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        transfer = CashTransfer.objects.create(
            cashier_account=self.regular_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='draft'
        )
        
        # Try to post directly without approval
        with self.assertRaises(ValidationError) as context:
            transfer.post(user=self.regular_cashier_user)
        
        self.assertIn('Only approved transfers can be posted', str(context.exception))
    
    def test_dual_approval_workflow(self):
        """Test 11: Dual approval workflow works correctly"""
        # Create cashier requiring dual approval
        dual_approval_gl = Account.objects.create(
            code='150-005',
            name='Dual Approval Cashier',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.cash_parent,
            branch=self.branch
        )
        
        dual_cashier = CashierAccount.objects.create(
            account_number='CASH-DUAL',
            name='Dual Approval Cashier',
            cashier=self.regular_cashier_user,
            account=dual_approval_gl,
            branch=self.branch,
            is_active=True,
            requires_dual_approval=True
        )
        
        # Give balance
        collection = CashCollection.objects.create(
            cashier_account=dual_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('100000.00'),
            amount_due=Decimal('100000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Create transfer
        transfer = CashTransfer.objects.create(
            cashier_account=dual_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=Decimal('100000.00'),
            branch=self.branch,
            status='draft'
        )
        
        transfer.submit(user=self.regular_cashier_user)
        
        # First approval
        result1 = transfer.approve(user=self.approver_user)
        self.assertEqual(result1, 'first_approval')
        self.assertIsNotNone(transfer.approved_by)
        self.assertNotEqual(transfer.status, 'posted')
        
        # Second approval by different user
        result2 = transfer.approve(user=self.head_cashier_user)
        self.assertEqual(result2, 'second_approval_posted')
        self.assertEqual(transfer.status, 'posted')
        
        # Cannot have same user approve twice
        transfer2 = CashTransfer.objects.create(
            cashier_account=dual_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='pending'
        )
        transfer2.approved_by = self.approver_user
        transfer2.save()
        
        with self.assertRaises(ValidationError) as context:
            transfer2.approve(user=self.approver_user)
        
        self.assertIn('Same user cannot provide both approvals', str(context.exception))
    
    def test_balance_protection_mechanism(self):
        """Test 12: Balance protection prevents direct manipulation"""
        from django.conf import settings
        
        # Ensure balance protection is enabled
        setattr(settings, 'DISABLE_BALANCE_PROTECTION', False)
        
        # Try to directly modify balance (should fail)
        original_balance = self.regular_cashier.current_balance
        
        with self.assertRaises(PermissionError):
            self.regular_cashier.current_balance = Decimal('999999.00')
            self.regular_cashier.save(update_fields=['current_balance'])
    
    def test_complete_workflow_regular_to_main_bank(self):
        """Test 13: Complete workflow from regular cashier to main bank"""
        # Step 1: Regular cashier collects cash
        collection = CashCollection.objects.create(
            cashier_account=self.regular_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Tuition',
            branch=self.branch
        )
        collection.post(user=self.regular_cashier_user)
        
        # Step 2: Regular cashier transfers to intermediate cashier bank
        transfer1 = CashTransfer.objects.create(
            cashier_account=self.regular_cashier,
            destination_account=self.intermediate_cashier_bank,
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='draft'
        )
        transfer1.submit(user=self.regular_cashier_user)
        transfer1.approve(user=self.approver_user)
        
        # Regular cashier balance should be zero
        self.regular_cashier.refresh_from_db()
        self.assertEqual(self.regular_cashier.current_balance, Decimal('0.00'))
        
        # Step 3: Head cashier receives and acknowledges (via collection to their account)
        # In practice, this would be a special "internal transfer" mechanism
        # For now, we simulate head cashier collecting from intermediate bank
        
        # Step 4: Head cashier transfers to main bank
        # Give head cashier balance (simulating acknowledgment)
        head_collection = CashCollection.objects.create(
            cashier_account=self.head_cashier,
            client=self.client,
            income_account=self.tuition_income,
            amount_collected=Decimal('50000.00'),
            amount_due=Decimal('50000.00'),
            payment_purpose='Internal Transfer',
            branch=self.branch
        )
        head_collection.post(user=self.head_cashier_user)
        
        transfer2 = CashTransfer.objects.create(
            cashier_account=self.head_cashier,
            destination_account=self.main_bank_account,  # To main bank
            amount=Decimal('50000.00'),
            branch=self.branch,
            status='draft'
        )
        transfer2.submit(user=self.head_cashier_user)
        transfer2.approve(user=self.head_cashier_user)
        
        # All cashier accounts should be zero
        self.regular_cashier.refresh_from_db()
        self.head_cashier.refresh_from_db()
        
        self.assertEqual(self.regular_cashier.current_balance, Decimal('0.00'))
        self.assertEqual(self.head_cashier.current_balance, Decimal('0.00'))


class CashierAccountSecurityTests(TestCase):
    """Additional security tests to prevent loopholes"""
    
    def setUp(self):
        """Set up minimal test data"""
        self.user = User.objects.create_user(
            username='test_user',
            email='test@example.com',
            password='test123'
        )
        
        self.branch = Branch.objects.create(
            name='Test Branch',
            code='TB001'
        )
        
        # Create account hierarchy
        self.parent = Account.objects.create(
            code='150',
            name='Cash',
            account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET,
            branch=self.branch
        )
        
        self.child = Account.objects.create(
            code='150-001',
            name='Test Cashier',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET,
            parent=self.parent,
            branch=self.branch
        )
    
    def test_cannot_create_cashier_with_parent_account(self):
        """Cannot create cashier account with parent-level GL account"""
        with self.assertRaises(ValidationError):
            cashier = CashierAccount(
                account_number='CASH-BAD',
                name='Bad Cashier',
                cashier=self.user,
                account=self.parent,  # Parent account - should fail
                branch=self.branch
            )
            cashier.full_clean()
    
    def test_cannot_create_cashier_with_non_asset_account(self):
        """Cannot create cashier account with non-ASSET account"""
        income_account = Account.objects.create(
            code='400-001',
            name='Income',
            account_level=Account.LEVEL_CHILD,
            account_type=Account.INCOME,
            parent=Account.objects.create(
                code='400',
                name='Income Parent',
                account_level=Account.LEVEL_PARENT,
                account_type=Account.INCOME,
                branch=self.branch
            ),
            branch=self.branch
        )
        
        with self.assertRaises(ValidationError):
            cashier = CashierAccount(
                account_number='CASH-BAD2',
                name='Bad Cashier 2',
                cashier=self.user,
                account=income_account,  # INCOME account - should fail
                branch=self.branch
            )
            cashier.full_clean()
    
    def test_cannot_post_collection_without_income_account(self):
        """Cannot post collection without income account"""
        cashier = CashierAccount.objects.create(
            account_number='CASH-001',
            name='Test Cashier',
            cashier=self.user,
            account=self.child,
            branch=self.branch
        )
        
        client = Client.objects.create(
            first_name='Test',
            last_name='Client',
            branch=self.branch
        )
        
        collection = CashCollection.objects.create(
            cashier_account=cashier,
            client=client,
            # income_account=None,  # No income account
            amount_collected=Decimal('10000.00'),
            amount_due=Decimal('10000.00'),
            payment_purpose='Test',
            branch=self.branch
        )
        
        with self.assertRaises(ValidationError) as context:
            collection.post(user=self.user)
        
        self.assertIn('Income account is required', str(context.exception))
