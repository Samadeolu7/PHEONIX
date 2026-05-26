from django.test import TestCase
from rest_framework.test import APIClient, APITestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from django.utils import timezone

from branches.models import Branch
from clients.models import Client
from accounts.models import Account
from incomes.models import IncomeCategory, FeeStructure, Invoice
from transactions.models import Transaction, TransactionEntry


class RecordPaymentIntegrationTest(APITestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.filter(is_superuser=True).first()
        if not self.user:
            self.user = User.objects.create(username='intuser', email='int@example.com')
            self.user.set_password('secret')
            self.user.is_superuser = True
            self.user.save()

        self.client_api = APIClient()
        self.client_api.force_authenticate(self.user)

        self.branch = Branch.objects.first() or Branch.objects.create(name='Int Branch', code='INT', owner=self.user)

        # Create parent and child income account for category
        parent_income = Account.objects.create(
            code='400', name='Income Parent', account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME, owner=self.user, branch=self.branch
        )
        income_child = Account.objects.create(
            code='400-001', name='Income - Fees', account_level=Account.LEVEL_CHILD,
            account_type=Account.INCOME, owner=self.user, branch=self.branch, parent=parent_income
        )

        # Create IncomeCategory and FeeStructure
        self.category = IncomeCategory.objects.create(
            name='Tuition Test', code='TU_TEST', income_account=income_child, owner=self.user, branch=self.branch
        )

        self.fee_structure = FeeStructure.objects.create(
            name='Test Fee', code='TF-INT', category=self.category,
            base_amount=Decimal('500.00'), is_active=True, approval_status='approved', owner=self.user, branch=self.branch,
            created_by=self.user
        )

        # Create client
        self.client_obj = Client.objects.create(
            client_id='CINT-001', first_name='Alice', last_name='Integration', gender='female', phone_primary='+100000', owner=self.user, branch=self.branch
        )

        # Create invoice
        self.invoice = Invoice.objects.create(
            client=self.client_obj,
            invoice_number=f'INT-{timezone.now().strftime("%Y%m%d%H%M%S")}',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description='Integration Test Invoice',
            amount=Decimal('500.00'),
            fee_structure=self.fee_structure,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )

    def test_record_payment_posts_journal_and_updates_invoice(self):
        url = f"/api/incomes/invoices/{self.invoice.id}/record_payment/"
        data = {
            'amount': '500.00',
            'payment_date': timezone.now().date().isoformat(),
            'payment_method': 'cash',
            'reference': 'INT-DEP-001',
            'notes': 'Integration test payment'
        }

        resp = self.client_api.post(url, data, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body.get('success'))

        # Verify invoice updated
        self.invoice.refresh_from_db()
        self.assertEqual(str(self.invoice.amount_paid), '500.00')
        self.assertEqual(self.invoice.status, 'paid')

        # Verify journal entry posted
        journal_id = body.get('journal_entry_id')
        self.assertIsNotNone(journal_id)
        tx = Transaction.objects.get(pk=journal_id)
        self.assertTrue(tx.approved)

        # All entries of the transaction should be posted
        entries = TransactionEntry.objects.filter(transaction=tx)
        self.assertTrue(all(e.posted for e in entries))

    def test_partial_payment_updates_invoice_and_posts_payment(self):
        # create a larger invoice for partial payment
        invoice2 = Invoice.objects.create(
            client=self.client_obj,
            invoice_number=f'INT-P-{timezone.now().strftime("%Y%m%d%H%M%S")}',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            description='Partial Payment Invoice',
            amount=Decimal('1000.00'),
            fee_structure=self.fee_structure,
            owner=self.user,
            branch=self.branch,
            created_by=self.user
        )

        url = f"/api/incomes/invoices/{invoice2.id}/record_payment/"
        data = {
            'amount': '400.00',
            'payment_date': timezone.now().date().isoformat(),
            'payment_method': 'cash',
            'reference': 'INT-PMT-PTL',
        }

        resp = self.client_api.post(url, data, format='json')
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertTrue(body.get('success'))

        invoice2.refresh_from_db()
        self.assertEqual(str(invoice2.amount_paid), '400.00')
        self.assertEqual(invoice2.status, 'partial')

        journal_id = body.get('journal_entry_id')
        self.assertIsNotNone(journal_id)
        tx = Transaction.objects.get(pk=journal_id)
        self.assertTrue(tx.approved)
        entries = TransactionEntry.objects.filter(transaction=tx)
        self.assertTrue(all(e.posted for e in entries))

    def test_negative_payment_rejected(self):
        url = f"/api/incomes/invoices/{self.invoice.id}/record_payment/"
        data = {
            'amount': '-100.00',
            'payment_date': timezone.now().date().isoformat(),
            'payment_method': 'cash',
            'reference': 'INT-NEG-001',
        }

        resp = self.client_api.post(url, data, format='json')
        # Should be rejected with 400 and validation error about positivity
        self.assertEqual(resp.status_code, 400)
        body = resp.json()
        # Serializer returns field errors for 'amount'
        self.assertIn('amount', body)
        self.assertTrue(any('positive' in str(m).lower() for m in body['amount']))
