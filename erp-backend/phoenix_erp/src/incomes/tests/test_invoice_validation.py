from decimal import Decimal
from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from django.core.exceptions import ValidationError

from users.models import User, Tenant
from branches.models import Branch
from clients.models import Client
from common.managers import set_current_tenant
from incomes.models import Invoice


class InvoiceValidationTests(TestCase):
    def setUp(self):
        # Create tenant, user and branch
        self.user = User.objects.create_user(username='valuser', password='pass')
        self.tenant = Tenant.objects.create(name='ValTenant', slug='valtenant', owner=self.user)
        self.user.tenant = self.tenant
        self.user.save()
        self.branch = Branch.objects.create(name='Val Branch', code='VAL', tenant=self.tenant, owner=self.user)
        self.user.branch = self.branch
        self.user.save()

        # Client
        self.client = Client.objects.create(
            client_id='CL001', first_name='Test', last_name='Client',
            phone_primary='08000000001', tenant=self.tenant, owner=self.user, branch=self.branch
        )

        self.api = APIClient()
        self.api.force_authenticate(user=self.user)
        set_current_tenant(self.tenant)

    def test_model_rejects_zero_amount(self):
        today = timezone.now().date()
        inv = Invoice(
            client=self.client,
            invoice_number='INV-VAL-0001',
            invoice_date=today,
            due_date=today + timedelta(days=30),
            description='Zero amount test',
            amount=Decimal('0.00')
        )
        with self.assertRaises(ValidationError):
            inv.full_clean()

    def test_api_rejects_zero_amount(self):
        today = timezone.now().date()
        payload = {
            'client': self.client.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'API zero amount test',
            'amount': '0.00'
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('amount', resp.json())
