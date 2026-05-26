# tests/test_receivables_detail.py
"""
Test receivable detail endpoint to identify AssertionError
"""
from django.test import TestCase
from rest_framework.test import APIClient
from decimal import Decimal
from django.utils import timezone

from common.managers import set_current_tenant
from branches.models import Branch
from clients.models import Client
from receivables.models import CustomerReceivable, ReceivableActivityLog
from incomes.models import Invoice, IncomeCategory
from accounts.models import Account
from users.models import Tenant, User


class ReceivableDetailTestCase(TestCase):
    def setUp(self):
        """Set up test environment with tenant, branch, and test data"""
        # Create tenant, user, and branch (match invoice test pattern)
        self.user = User.objects.create_user(username='rcvuser', password='pass')
        self.tenant = Tenant.objects.create(name='RcvTenant', slug='rcvtenant', owner=self.user)
        self.user.tenant = self.tenant
        self.user.save()
        self.branch = Branch.objects.create(name='Main Branch', code='MAIN', tenant=self.tenant, owner=self.user)
        self.user.branch = self.branch
        self.user.save()
        
        # Set thread-local tenant
        set_current_tenant(self.tenant)

        # Create client
        self.client_obj = Client.objects.create(
            client_id='CL001',
            first_name='John',
            last_name='Doe',
            phone_primary='08012345678',
            email='john@example.com',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch,
            gender='male'
        )

        # Create income category and account
        self.income_account = Account.objects.create(
            code='410',
            name='Income Account',
            account_type='INCOME',
            account_level=Account.LEVEL_PARENT,
            created_by=self.user,
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        self.income_category = IncomeCategory.objects.create(
            name='Test Category',
            code='TC001',
            income_account=self.income_account,
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        # Create invoice
        self.invoice = Invoice.objects.create(
            invoice_number='INV-001',
            client=self.client_obj,
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            amount=Decimal('1000.00'),
            amount_paid=Decimal('0.00'),
            description='Test Invoice',
            status='sent',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        # Create receivable
        from django.contrib.contenttypes.models import ContentType
        ct = ContentType.objects.get_for_model(Invoice)
        
        self.receivable = CustomerReceivable.objects.create(
            client=self.client_obj,
            receivable_type='invoice',
            content_type=ct,
            object_id=self.invoice.id,
            reference_number='INV-001',
            original_amount=Decimal('1000.00'),
            amount_paid=Decimal('0.00'),
            balance=Decimal('1000.00'),
            due_date=timezone.now().date(),
            status='pending',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        # Add activity log
        ReceivableActivityLog.objects.create(
            receivable=self.receivable,
            activity_type='note_added',
            description='Test note',
            performed_by=self.user,
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        # Set up API client
        self.api_client = APIClient()
        self.api_client.force_authenticate(user=self.user)

    def test_receivable_detail_endpoint(self):
        """Test GET /api/receivables/receivables/{id}/ returns detailed response"""
        response = self.api_client.get(f'/api/receivables/receivables/{self.receivable.id}/')
        
        print("Status Code:", response.status_code)
        print("Response Data:", response.data)
        
        # Should succeed
        self.assertEqual(response.status_code, 200)
        
        # Verify structure
        self.assertIn('client', response.data)
        self.assertIn('activity_logs', response.data)
        self.assertIn('content_object', response.data)
        
        # Verify client details
        self.assertEqual(response.data['client']['full_name'], 'John Doe')
        self.assertEqual(response.data['client']['phone'], '08012345678')
