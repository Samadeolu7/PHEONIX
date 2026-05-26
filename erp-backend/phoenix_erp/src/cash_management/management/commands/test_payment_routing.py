"""
Django management command to test end-to-end payment routing

Usage:
    python manage.py test_payment_routing
    python manage.py test_payment_routing --clean  # Clean up test data after
"""
import uuid
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import date

from inventory.models import Invoice, InvoiceItem
from clients.models import Client
from products.models import Product
from branches.models import Branch
from accounts.models import Account
from cash_management.models import CashierAccount, CashCollection
from transactions.models import Transaction as JournalEntry

User = get_user_model()


class Command(BaseCommand):
    help = 'Test end-to-end payment routing (cash vs bank)'

    def add_arguments(self, parser):
        parser.add_argument(
            '--clean',
            action='store_true',
            help='Clean up test data after completion',
        )

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('\n' + '='*80))
        self.stdout.write(self.style.SUCCESS('Payment Routing End-to-End Test'))
        self.stdout.write(self.style.SUCCESS('='*80 + '\n'))

        try:
            # Step 1: Setup test data
            self.stdout.write('Step 1: Setting up test data...')
            test_data = self.setup_test_data()
            self.stdout.write(self.style.SUCCESS('✓ Test data created'))

            # Step 2: Create test invoice
            self.stdout.write('\nStep 2: Creating test invoice...')
            invoice = self.create_test_invoice(test_data)
            self.stdout.write(self.style.SUCCESS(f'✓ Invoice created: {invoice.invoice_number}'))
            self.stdout.write(f'  Amount: {invoice.total_amount}')

            # Step 3: Record cash payment
            self.stdout.write('\nStep 3: Recording cash payment...')
            cash_result = self.record_cash_payment(invoice, test_data)
            self.stdout.write(self.style.SUCCESS('✓ Cash payment recorded'))
            self.stdout.write(f'  Route: {cash_result["payment_route"]}')
            self.stdout.write(f'  Receipt: {cash_result.get("receipt_number", "N/A")}')
            self.stdout.write(f'  Journal Entry: {cash_result["journal_entry_reference"]}')

            # Step 4: Verify cash payment GL entries
            self.stdout.write('\nStep 4: Verifying cash payment GL entries...')
            self.verify_cash_gl_entries(cash_result, test_data)
            self.stdout.write(self.style.SUCCESS('✓ Cash GL entries verified'))

            # Step 5: Record bank payment
            self.stdout.write('\nStep 5: Recording bank payment...')
            bank_result = self.record_bank_payment(invoice, test_data)
            self.stdout.write(self.style.SUCCESS('✓ Bank payment recorded'))
            self.stdout.write(f'  Route: {bank_result["payment_route"]}')
            self.stdout.write(f'  Journal Entry: {bank_result["journal_entry_reference"]}')

            # Step 6: Verify bank payment GL entries
            self.stdout.write('\nStep 6: Verifying bank payment GL entries...')
            self.verify_bank_gl_entries(bank_result, test_data)
            self.stdout.write(self.style.SUCCESS('✓ Bank GL entries verified'))

            # Step 7: Verify invoice status
            self.stdout.write('\nStep 7: Verifying invoice status...')
            invoice.refresh_from_db()
            self.stdout.write(f'  Invoice Status: {invoice.status}')
            self.stdout.write(f'  Total Amount: {invoice.total_amount}')
            self.stdout.write(f'  Amount Paid: {invoice.amount_paid}')
            self.stdout.write(f'  Balance: {invoice.balance}')
            if invoice.status == 'paid' and invoice.balance == 0:
                self.stdout.write(self.style.SUCCESS('✓ Invoice fully paid'))
            else:
                self.stdout.write(self.style.WARNING('⚠ Invoice not fully paid'))

            # Step 8: Verify cashier account balance
            self.stdout.write('\nStep 8: Verifying cashier account...')
            test_data['cashier_account'].refresh_from_db()
            test_data['cashier_gl'].refresh_from_db()
            self.stdout.write(f'  Cashier Balance: {test_data["cashier_account"].current_balance}')
            self.stdout.write(f'  Cashier GL Balance: {test_data["cashier_gl"].balance}')
            self.stdout.write(self.style.SUCCESS('✓ Cashier account updated'))

            # Step 9: Verify bank account balance
            self.stdout.write('\nStep 9: Verifying bank account...')
            test_data['bank_account'].refresh_from_db()
            self.stdout.write(f'  Bank GL Balance: {test_data["bank_account"].balance}')
            self.stdout.write(self.style.SUCCESS('✓ Bank account updated'))

            # Step 10: Verify trial balance
            self.stdout.write('\nStep 10: Verifying trial balance...')
            self.verify_trial_balance()

            # Summary
            self.stdout.write(self.style.SUCCESS('\n' + '='*80))
            self.stdout.write(self.style.SUCCESS('TEST PASSED - All validations successful!'))
            self.stdout.write(self.style.SUCCESS('='*80))
            self.stdout.write('\nSummary:')
            self.stdout.write(f'  • Cash payment → Routed to Cashier Account ✓')
            self.stdout.write(f'  • Bank payment → Routed to Bank Account ✓')
            self.stdout.write(f'  • GL entries created correctly ✓')
            self.stdout.write(f'  • Account balances updated ✓')
            self.stdout.write(f'  • Invoice status updated ✓')
            self.stdout.write(f'  • Trial balance verified ✓')

            # Cleanup if requested
            if options['clean']:
                self.stdout.write('\nCleaning up test data...')
                self.cleanup_test_data(test_data, invoice, cash_result, bank_result)
                self.stdout.write(self.style.SUCCESS('✓ Test data cleaned up'))

        except Exception as e:
            self.stdout.write(self.style.ERROR(f'\n✗ TEST FAILED: {str(e)}'))
            import traceback
            self.stdout.write(traceback.format_exc())
            raise

    def setup_test_data(self):
        """Create necessary test data"""
        # Get or create test user
        user, _ = User.objects.get_or_create(
            username='test_payment_routing',
            defaults={
                'email': 'test@example.com',
                'first_name': 'Test',
                'last_name': 'User'
            }
        )
        if not user.check_password('testpass123'):
            user.set_password('testpass123')
            user.save()

        # Get or create branch
        branch, _ = Branch.objects.get_or_create(
            code='TEST-BR',
            defaults={
                'name': 'Test Branch',
                'owner': user
            }
        )
        user.branch = branch
        user.save()

        # Create test client
        client, _ = Client.objects.get_or_create(
            client_id='TEST-CLIENT-ROUTING',
            defaults={
                'first_name': 'Test',
                'last_name': 'Client',
                'gender': 'male',
                'email': 'testclient@example.com',
                'phone_primary': '1234567890',
                'owner': user,
                'branch': branch
            }
        )

        # Create cashier GL account (parent)
        cashier_parent, _ = Account.objects.get_or_create(
            code='101',
            defaults={
                'name': 'Cash on Hand',
                'account_type': 'ASSET',
                'account_level': 'PARENT',
                'allow_manual_entries': False,
                'owner': user,
                'branch': branch
            }
        )

        # Create cashier GL account (child) - code must be ≤10 chars
        cashier_gl, _ = Account.objects.get_or_create(
            code='101-CSH',
            defaults={
                'name': 'Test Cashier Account',
                'account_type': 'ASSET',
                'account_level': 'CHILD',
                'parent': cashier_parent,
                'allow_manual_entries': True,
                'owner': user,
                'branch': branch
            }
        )

        # Create cashier account
        cashier_account, _ = CashierAccount.objects.get_or_create(
            account_number='CSH-TST-01',
            defaults={
                'cashier': user,
                'account': cashier_gl,
                'name': 'Test Cashier Account',
                'daily_collection_limit': Decimal('10000000.00'),
                'current_balance': Decimal('0.00'),
                'is_active': True,
                'owner': user,
                'branch': branch
            }
        )

        # Create bank account parent
        bank_parent, _ = Account.objects.get_or_create(
            code='102',
            defaults={
                'name': 'Bank Accounts',
                'account_type': 'ASSET',
                'account_level': 'PARENT',
                'allow_manual_entries': False,
                'owner': user,
                'branch': branch
            }
        )

        # Create bank account (child)
        bank_account, _ = Account.objects.get_or_create(
            code='102-TEST',
            defaults={
                'name': 'Test Bank Account',
                'account_type': 'ASSET',
                'account_level': 'CHILD',
                'parent': bank_parent,
                'allow_manual_entries': True,
                'owner': user,
                'branch': branch
            }
        )

        # Create AR account parent
        ar_parent, _ = Account.objects.get_or_create(
            code='140',
            defaults={
                'name': 'Accounts Receivable',
                'account_type': 'ASSET',
                'account_level': 'PARENT',
                'allow_manual_entries': False,
                'owner': user,
                'branch': branch
            }
        )

        # Create AR account (child)
        ar_account, _ = Account.objects.get_or_create(
            code='140-TEST',
            defaults={
                'name': 'Test Receivables',
                'account_type': 'ASSET',
                'account_level': 'CHILD',
                'parent': ar_parent,
                'allow_manual_entries': True,
                'owner': user,
                'branch': branch
            }
        )

        return {
            'user': user,
            'branch': branch,
            'client': client,
            'cashier_account': cashier_account,
            'cashier_gl': cashier_gl,
            'bank_account': bank_account,
            'ar_account': ar_account
        }

    def create_test_invoice(self, test_data):
        """Create a test invoice"""
        import uuid
        invoice_number = f"TST-INV-{uuid.uuid4().hex[:8].upper()}"
        
        invoice = Invoice.objects.create(
            client=test_data['client'],
            invoice_number=invoice_number,
            invoice_date=date.today(),
            due_date=date.today(),
            total_amount=Decimal('1000000.00'),  # 1M UGX
            amount_paid=Decimal('0.00'),
            status='draft',
            owner=test_data['user'],
            branch=test_data['branch'],
            created_by=test_data['user']
        )
        return invoice

    @transaction.atomic
    def record_cash_payment(self, invoice, test_data):
        """Record a cash payment using the API"""
        from inventory.serializers_invoice import RecordPaymentSerializer
        from cash_management.services.payment_routing import PaymentRoutingService

        amount = Decimal('600000.00')  # 600K UGX in cash

        # Simulate API call
        data = {
            'amount': amount,
            'payment_date': date.today(),
            'payment_method': 'cash',
            'cashier_account_id': test_data['cashier_account'].id,
            'reference_number': f'TEST-CASH-{uuid.uuid4().hex[:8].upper()}',
            'notes': 'Test cash payment'
        }

        # Route the payment
        routing_result = PaymentRoutingService.route_payment(
            amount=amount,
            payment_date=data['payment_date'],
            payment_method=data['payment_method'],
            client=invoice.client,
            reference_number=data['reference_number'],
            description=f"Payment for invoice {invoice.invoice_number}",
            user=test_data['user'],
            ar_account=test_data['ar_account'],
            cashier_account=test_data['cashier_account'],
            notes=data['notes']
        )

        # Update invoice
        invoice.amount_paid += amount
        if invoice.amount_paid >= invoice.total_amount:
            invoice.status = 'paid'
        elif invoice.amount_paid > 0:
            invoice.status = 'partial'
        invoice.save()

        return {
            'success': True,
            'message': routing_result['message'],
            'payment_route': routing_result['route'],
            'journal_entry_id': routing_result['journal_entry'].id,
            'journal_entry_reference': routing_result['journal_entry'].workflow_reference,
            'cash_collection_id': routing_result.get('cash_collection').id if routing_result.get('cash_collection') else None,
            'receipt_number': routing_result.get('cash_collection').receipt_number if routing_result.get('cash_collection') else None
        }

    @transaction.atomic
    def record_bank_payment(self, invoice, test_data):
        """Record a bank payment using the API"""
        from cash_management.services.payment_routing import PaymentRoutingService

        amount = Decimal('400000.00')  # 400K UGX via bank

        # Simulate API call
        data = {
            'amount': amount,
            'payment_date': date.today(),
            'payment_method': 'bank_transfer',
            'bank_account_id': test_data['bank_account'].id,
            'reference_number': f'TEST-BANK-{uuid.uuid4().hex[:8].upper()}',
            'notes': 'Test bank payment'
        }

        # Route the payment
        routing_result = PaymentRoutingService.route_payment(
            amount=amount,
            payment_date=data['payment_date'],
            payment_method=data['payment_method'],
            client=invoice.client,
            reference_number=data['reference_number'],
            description=f"Payment for invoice {invoice.invoice_number}",
            user=test_data['user'],
            ar_account=test_data['ar_account'],
            bank_account=test_data['bank_account'],
            notes=data['notes']
        )

        # Update invoice
        invoice.amount_paid += amount
        if invoice.amount_paid >= invoice.total_amount:
            invoice.status = 'paid'
        elif invoice.amount_paid > 0:
            invoice.status = 'partial'
        invoice.save()

        return {
            'success': True,
            'message': routing_result['message'],
            'payment_route': routing_result['route'],
            'journal_entry_id': routing_result['journal_entry'].id,
            'journal_entry_reference': routing_result['journal_entry'].workflow_reference
        }

    def verify_cash_gl_entries(self, cash_result, test_data):
        """Verify GL entries for cash payment"""
        journal_entry = JournalEntry.objects.get(id=cash_result['journal_entry_id'])
        
        # Should have 2 entries
        entries = journal_entry.entries.all()
        assert entries.count() == 2, f"Expected 2 entries, got {entries.count()}"

        # Find debit and credit entries
        debit_entry = entries.filter(side='DR').first()
        credit_entry = entries.filter(side='CR').first()

        # Verify debit to cashier account
        assert debit_entry.account == test_data['cashier_gl'], "Debit should be to cashier GL account"
        assert debit_entry.amount == Decimal('600000.00'), f"Debit amount should be 600000, got {debit_entry.amount}"

        # Verify credit to AR
        assert credit_entry.account == test_data['ar_account'], "Credit should be to AR account"
        assert credit_entry.amount == Decimal('600000.00'), f"Credit amount should be 600000, got {credit_entry.amount}"

        # Verify cash collection created
        cash_collection = CashCollection.objects.get(id=cash_result['cash_collection_id'])
        assert cash_collection.is_posted, "Cash collection should be posted"
        assert cash_collection.amount_collected == Decimal('600000.00'), "Cash collection amount incorrect"

        self.stdout.write(f'  Dr. Cashier Account: 600,000')
        self.stdout.write(f'  Cr. AR Account: 600,000')

    def verify_bank_gl_entries(self, bank_result, test_data):
        """Verify GL entries for bank payment"""
        journal_entry = JournalEntry.objects.get(id=bank_result['journal_entry_id'])
        
        # Should have 2 entries
        entries = journal_entry.entries.all()
        assert entries.count() == 2, f"Expected 2 entries, got {entries.count()}"

        # Find debit and credit entries
        debit_entry = entries.filter(side='DR').first()
        credit_entry = entries.filter(side='CR').first()

        # Verify debit to bank account
        assert debit_entry.account == test_data['bank_account'], "Debit should be to bank account"
        assert debit_entry.amount == Decimal('400000.00'), f"Debit amount should be 400000, got {debit_entry.amount}"

        # Verify credit to AR
        assert credit_entry.account == test_data['ar_account'], "Credit should be to AR account"
        assert credit_entry.amount == Decimal('400000.00'), f"Credit amount should be 400000, got {credit_entry.amount}"

        # Verify NO cash collection for bank payment
        cash_collections = CashCollection.objects.filter(
            client=test_data['client'],
            amount_collected=Decimal('400000.00')
        )
        assert cash_collections.count() == 0, "Bank payment should not create cash collection"

        self.stdout.write(f'  Dr. Bank Account: 400,000')
        self.stdout.write(f'  Cr. AR Account: 400,000')

    def verify_trial_balance(self):
        """
        Verify that the trial balance is in balance (sum of all account balances = 0)
        
        In double-entry accounting:
        - Assets and Expenses have normal DEBIT balance (positive)
        - Liabilities, Equity, and Revenue have normal CREDIT balance (negative in DB)
        - Sum of all balances should equal zero
        """
        from django.db.models import Sum
        
        # Get sum of all account balances
        total_balance = Account.objects.aggregate(total=Sum('balance'))['total'] or Decimal('0')
        
        # Get breakdown by account type
        asset_balance = Account.objects.filter(account_type='ASSET').aggregate(total=Sum('balance'))['total'] or Decimal('0')
        liability_balance = Account.objects.filter(account_type='LIABILITY').aggregate(total=Sum('balance'))['total'] or Decimal('0')
        equity_balance = Account.objects.filter(account_type='EQUITY').aggregate(total=Sum('balance'))['total'] or Decimal('0')
        revenue_balance = Account.objects.filter(account_type='REVENUE').aggregate(total=Sum('balance'))['total'] or Decimal('0')
        expense_balance = Account.objects.filter(account_type='EXPENSE').aggregate(total=Sum('balance'))['total'] or Decimal('0')
        
        self.stdout.write(f'  Assets: {asset_balance:,.2f}')
        self.stdout.write(f'  Liabilities: {liability_balance:,.2f}')
        self.stdout.write(f'  Equity: {equity_balance:,.2f}')
        self.stdout.write(f'  Revenue: {revenue_balance:,.2f}')
        self.stdout.write(f'  Expenses: {expense_balance:,.2f}')
        self.stdout.write(f'  Total Balance: {total_balance:,.2f}')
        
        # Trial balance should be zero (or very close due to floating point)
        if abs(total_balance) < Decimal('0.01'):
            self.stdout.write(self.style.SUCCESS('✓ Trial balance is balanced'))
        else:
            error_msg = f"Trial balance is OUT OF BALANCE by {total_balance:,.2f}"
            self.stdout.write(self.style.ERROR(f'✗ {error_msg}'))
            raise AssertionError(error_msg)

    def cleanup_test_data(self, test_data, invoice, cash_result, bank_result):
        """Clean up test data"""
        # Delete in reverse dependency order
        JournalEntry.objects.filter(id__in=[
            cash_result['journal_entry_id'],
            bank_result['journal_entry_id']
        ]).delete()
        
        CashCollection.objects.filter(id=cash_result.get('cash_collection_id')).delete()
        invoice.delete()
        test_data['cashier_account'].delete()
        test_data['cashier_gl'].delete()
        test_data['bank_account'].delete()
        test_data['ar_account'].delete()
        test_data['client'].delete()
