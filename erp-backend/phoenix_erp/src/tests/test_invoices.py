from django.test import TestCase
from django.utils import timezone
from datetime import timedelta
from rest_framework.test import APIClient
from unittest.mock import patch

from users.models import Tenant, User
from branches.models import Branch
from clients.models import Client
from common.models import ReferenceTracking
from incomes.models import Invoice
from common.managers import set_current_tenant


class InvoiceTests(TestCase):
    def setUp(self):
        # Create tenant, user and branch
        self.user = User.objects.create_user(username='invuser', password='pass')
        self.tenant = Tenant.objects.create(name='InvTenant', slug='invtenant', owner=self.user)
        self.user.tenant = self.tenant
        self.user.save()
        self.branch = Branch.objects.create(name='Main Branch', code='MAIN', tenant=self.tenant, owner=self.user)
        # Ensure user's branch is set so view perform_create assigns branch
        self.user.branch = self.branch
        self.user.save()

        # Create a client (required by Invoice)
        self.client_obj = Client.objects.create(
            client_id='C001',
            first_name='Client',
            last_name='One',
            gender='male',
            phone_primary='08000000000',
            tenant=self.tenant,
            owner=self.user,
            branch=self.branch
        )

        self.api = APIClient()
        self.api.force_authenticate(user=self.user)
        # Ensure thread-local tenant is set so serializer PrimaryKeyRelatedFields resolve
        set_current_tenant(self.tenant)

    def test_invoice_auto_generates_and_registers_reference(self):
        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Test invoice auto-number',
            'amount': '1500.00'
        }

        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        if resp.status_code not in (200, 201):
            self.fail(f"Invoice create failed: status={resp.status_code}, content={resp.content}")
        data = resp.json()
        self.assertIn('invoice_number', data)
        inv_num = data['invoice_number']

        # Verify invoice exists and reference tracking was created
        inv = Invoice.objects.get(id=data['id'])
        self.assertEqual(inv.invoice_number, inv_num)

        rt = ReferenceTracking.objects.filter(reference_number=inv_num).first()
        self.assertIsNotNone(rt)
        self.assertEqual(rt.object_id, inv.id)
        self.assertEqual(rt.module, 'incomes')
        self.assertEqual(rt.model_name, 'invoice')

    def test_download_pdf_falls_back_when_inventory_generator_fails(self):
        # Create invoice via API first
        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Test invoice PDF fallback',
            'amount': '2000.00'
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        if resp.status_code not in (200, 201):
            self.fail(f"Invoice create failed: status={resp.status_code}, content={resp.content}")
        data = resp.json()
        inv_id = data['id']

        # Patch the inventory InvoicePDFService.generate to raise an AttributeError
        patch_target = 'inventory.services.pdf_service.InvoicePDFService.generate'
        with patch(patch_target, side_effect=AttributeError("'Invoice' object has no attribute 'items'")):
            pdf_resp = self.api.get(f'/api/incomes/invoices/{inv_id}/download-pdf/')
            # Ensure we got a PDF response (200) and content type is application/pdf
            self.assertEqual(pdf_resp.status_code, 200)
            self.assertEqual(pdf_resp['Content-Type'], 'application/pdf')

    def test_record_payment_partial_and_full(self):
        # Prepare accounts and fee structure with income account
        from accounts.models import Account
        from incomes.models import IncomeCategory, FeeStructure

        # Create income account
        income_account = Account.objects.create(
            name='Income Account',
            code='410',
            account_type='INCOME',
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )

        # Create bank/cash account
        bank_account = Account.objects.create(
            name='Bank Account',
            code='101',
            account_type='ASSET',
            account_level=Account.LEVEL_PARENT,
            owner=self.user,
            created_by=self.user,
            branch=self.branch
        )

        income_cat = IncomeCategory.objects.create(
            name='Test Income Cat',
            code='TINC',
            income_account=income_account,
            owner=self.user,
            branch=self.branch
        )

        fee_struct = FeeStructure.objects.create(
            name='Test Fee',
            code='TF01',
            category=income_cat,
            base_amount='10000.00',
            is_active=True,
            owner=self.user,
            branch=self.branch
        )

        # Create invoice with fee_structure so income_account is available
        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Payment test invoice',
            'amount': '10000.00',
            'fee_structure': fee_struct.id
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        if resp.status_code not in (200, 201):
            self.fail(f"Invoice create failed: status={resp.status_code}, content={resp.content}")
        data = resp.json()
        inv_id = data['id']

        # Partial payment
        pay_payload = {
            'amount': '4000.00',
            'payment_method': 'bank_transfer',
            'bank_account_id': bank_account.id,
            'notes': 'Partial payment'
        }
        pay_resp = self.api.post(f'/api/incomes/invoices/{inv_id}/record_payment/', pay_payload, format='json')
        self.assertEqual(pay_resp.status_code, 200)
        pay_data = pay_resp.json()
        self.assertTrue(pay_data.get('success'))
        inv = Invoice.objects.get(id=inv_id)
        self.assertEqual(str(inv.amount_paid), '4000.00')
        self.assertEqual(inv.status, 'partial')

        # Full payment remaining
        pay_payload2 = {
            'amount': '6000.00',
            'payment_method': 'bank_transfer',
            'bank_account_id': bank_account.id,
            'notes': 'Final payment'
        }
        pay_resp2 = self.api.post(f'/api/incomes/invoices/{inv_id}/record_payment/', pay_payload2, format='json')
        self.assertEqual(pay_resp2.status_code, 200)
        pay_data2 = pay_resp2.json()
        self.assertTrue(pay_data2.get('success'))
        inv.refresh_from_db()
        self.assertEqual(str(inv.amount_paid), '10000.00')
        self.assertEqual(inv.status, 'paid')

    def test_record_payment_overpayment_returns_400(self):
        # Setup minimal fee structure and accounts
        from accounts.models import Account
        from incomes.models import IncomeCategory, FeeStructure

        income_account = Account.objects.create(
            name='Income Account 2', code='420', account_type='INCOME', account_level=Account.LEVEL_PARENT,
            owner=self.user, created_by=self.user, branch=self.branch
        )
        income_cat = IncomeCategory.objects.create(name='Cat2', code='C2', income_account=income_account,
                                                   owner=self.user, branch=self.branch)
        fee_struct = FeeStructure.objects.create(name='F2', code='F2', category=income_cat,
                                                 base_amount='5000.00', is_active=True, owner=self.user, branch=self.branch)

        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Overpay test invoice',
            'amount': '5000.00',
            'fee_structure': fee_struct.id
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        inv_id = resp.json()['id']

        # Attempt to pay more than balance
        pay_payload = {'amount': '6000.00', 'payment_method': 'bank_transfer', 'notes': 'Overpay attempt'}
        pay_resp = self.api.post(f'/api/incomes/invoices/{inv_id}/record_payment/', pay_payload, format='json')
        self.assertEqual(pay_resp.status_code, 400)
        self.assertIn('exceeds balance', pay_resp.json().get('error', '').lower())

    def test_record_payment_invalid_bank_account_returns_400(self):
        # Reuse fee structure from earlier test setup pattern
        from accounts.models import Account
        from incomes.models import IncomeCategory, FeeStructure

        income_account = Account.objects.create(
            name='Income Account 3', code='430', account_type='INCOME', account_level=Account.LEVEL_PARENT,
            owner=self.user, created_by=self.user, branch=self.branch
        )
        income_cat = IncomeCategory.objects.create(name='Cat3', code='C3', income_account=income_account,
                                                   owner=self.user, branch=self.branch)
        fee_struct = FeeStructure.objects.create(name='F3', code='F3', category=income_cat,
                                                 base_amount='3000.00', is_active=True, owner=self.user, branch=self.branch)

        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Invalid bank account test',
            'amount': '3000.00',
            'fee_structure': fee_struct.id
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        inv_id = resp.json()['id']

        # Use non-existent bank account id
        pay_payload = {'amount': '1000.00', 'payment_method': 'bank_transfer', 'bank_account_id': 999999, 'notes': 'Bad bank'}
        pay_resp = self.api.post(f'/api/incomes/invoices/{inv_id}/record_payment/', pay_payload, format='json')
        self.assertEqual(pay_resp.status_code, 400)
        self.assertIn('not found', pay_resp.json().get('error', '').lower())

    def test_record_multiple_small_payments_accumulate_and_create_journal_entries(self):
        from accounts.models import Account
        from incomes.models import IncomeCategory, FeeStructure
        from transactions.models import Transaction, TransactionSeries

        income_account = Account.objects.create(
            name='Income Account 4', code='440', account_type='INCOME', account_level=Account.LEVEL_PARENT,
            owner=self.user, created_by=self.user, branch=self.branch
        )
        bank_account = Account.objects.create(
            name='Bank 4', code='102', account_type='ASSET', account_level=Account.LEVEL_PARENT,
            owner=self.user, created_by=self.user, branch=self.branch
        )
        income_cat = IncomeCategory.objects.create(name='Cat4', code='C4', income_account=income_account,
                                                   owner=self.user, branch=self.branch)
        fee_struct = FeeStructure.objects.create(name='F4', code='F4', category=income_cat,
                                                 base_amount='9000.00', is_active=True, owner=self.user, branch=self.branch)

        today = timezone.now().date()
        payload = {
            'client': self.client_obj.id,
            'invoice_date': str(today),
            'due_date': str(today + timedelta(days=30)),
            'description': 'Multiple payments invoice',
            'amount': '9000.00',
            'fee_structure': fee_struct.id
        }
        resp = self.api.post('/api/incomes/invoices/', payload, format='json')
        self.assertIn(resp.status_code, (200, 201))
        inv_id = resp.json()['id']

        # Count existing INV series transactions for owner
        before_count = Transaction.objects.filter(series__code='INV', owner=self.user).count()

        payments = ['3000.00', '3000.00', '3000.00']
        cumulative = 0
        for amt in payments:
            cumulative += float(amt)
            pay_payload = {'amount': amt, 'payment_method': 'bank_transfer', 'bank_account_id': bank_account.id}
            pay_resp = self.api.post(f'/api/incomes/invoices/{inv_id}/record_payment/', pay_payload, format='json')
            self.assertEqual(pay_resp.status_code, 200)
            inv = Invoice.objects.get(id=inv_id)
            self.assertEqual(float(inv.amount_paid), cumulative)

        after_count = Transaction.objects.filter(series__code='INV', owner=self.user).count()
        # Expect at least 3 additional transactions (one per payment)
        self.assertGreaterEqual(after_count - before_count, 3)
