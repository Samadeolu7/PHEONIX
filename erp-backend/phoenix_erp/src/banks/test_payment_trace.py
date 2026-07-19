"""
Tests for PaymentTraceView — the investigation endpoint for "someone came
with evidence": search a payment (by reference, exact amount, or narration
text) and see its full linkage story so a director can tell which pairing
is false. Covers both search axes (payments found by reference/amount,
lines found by narration/amount), the historical-claim trail unmatch()
preserves, and the netted-partner detail exceptions carry.
"""
import uuid
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
from branches.models import Branch
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant

User = get_user_model()


class PaymentTraceViewTests(TestCase):

    def setUp(self):
        self.client = APIClient()
        self.tenant = Tenant.objects.create(name='Trace Org', slug='trace-org')
        self.branch = Branch.objects.create(name='Branch A', code='TRA')
        self.director = User.objects.create_user(
            username='trace_director', password='test123',
            tenant=self.tenant, branch=self.branch, is_superuser=True,
        )
        self.gl_account = Account.objects.create(
            code='1926', name='Trace GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Trace Bank', bank_code='984')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000097', account_name='Trace Account',
            gl_account=self.gl_account, account_manager=self.director,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 10),
            uploaded_by=self.director, statement_file='bank_statements/trace.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )
        self.series = TransactionSeries.objects.create(code='LNPMT', description='Loan payments')
        self.client.force_authenticate(user=self.director)

    def _payment(self, ref_suffix, amount, description):
        txn = Transaction.objects.create(
            series=self.series, date=date(2026, 7, 10), description=description,
            owner=self.director, branch=self.branch, created_by=self.director, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=TransactionEntry.CREDIT, amount=amount,
        )
        return txn

    def _line(self, amount, narration, matched=False, matched_erp_payment_id=None, match_confidence=''):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=str(uuid.uuid4()),
            value_date=date(2026, 7, 10), direction='DEBIT', amount=amount,
            narration=narration, matched=matched,
            matched_erp_payment_id=matched_erp_payment_id, match_confidence=match_confidence,
        )

    def test_requires_at_least_three_characters(self):
        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': 'ab'})
        self.assertEqual(resp.status_code, 400)

    def test_search_by_amount_finds_both_payment_and_wrongly_matched_line(self):
        wrong_payment = self._payment('A', Decimal('2000.00'), 'Loan repayment – LN-1 | wrong client')
        true_payment = self._payment('B', Decimal('42000.00'), 'Loan repayment – LN-959 | Ref: D ROYAL')
        line = self._line(
            Decimal('42000.00'), 'FBNMOBILE:D ROYAL ARK INT SCH/Loan repayment',
            matched=True, matched_erp_payment_id=wrong_payment.id, match_confidence='HIGH',
        )

        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': '42000'})
        self.assertEqual(resp.status_code, 200, resp.data)

        payment_ids = {p['id'] for p in resp.data['payments']}
        self.assertIn(true_payment.id, payment_ids)
        self.assertNotIn(wrong_payment.id, payment_ids)  # amount 2000, not 42000

        line_ids = {l['id'] for l in resp.data['lines']}
        self.assertIn(str(line.pk), line_ids)
        found_line = next(l for l in resp.data['lines'] if l['id'] == str(line.pk))
        self.assertEqual(found_line['claiming_transaction']['id'], wrong_payment.id)
        self.assertEqual(found_line['claiming_transaction']['reference_number'], wrong_payment.reference_number)

        # The true payment's record shows it is NOT currently claimed by any line —
        # exactly the gap a director needs to see to know where to re-link.
        true_entry = next(p for p in resp.data['payments'] if p['id'] == true_payment.id)
        self.assertEqual(true_entry['claimed_by_lines'], [])

    def test_search_by_reference_number(self):
        payment = self._payment('C', Decimal('5000.00'), 'Loan repayment – LN-5')
        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': payment.reference_number})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([p['id'] for p in resp.data['payments']], [payment.id])

    def test_search_by_narration_text_finds_line(self):
        line = self._line(Decimal('3000.00'), 'CPWInward:1000042/OLAMITIDE special narration text')
        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': 'OLAMITIDE special'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual([l['id'] for l in resp.data['lines']], [str(line.pk)])

    def test_historical_claim_preserved_after_unmatch_is_visible(self):
        wrong_payment = self._payment('D', Decimal('1000.00'), 'Loan repayment – LN-9')
        line = self._line(
            Decimal('1000.00'), 'some narration',
            matched=True, matched_erp_payment_id=wrong_payment.id, match_confidence='HIGH',
        )
        line.unmatch(self.director, 'wrongly matched — evidence provided by client')
        line.refresh_from_db()

        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': wrong_payment.reference_number})
        self.assertEqual(resp.status_code, 200)
        payment_entry = next(p for p in resp.data['payments'] if p['id'] == wrong_payment.id)
        self.assertEqual(len(payment_entry['claimed_by_lines']), 1)
        claim = payment_entry['claimed_by_lines'][0]
        self.assertFalse(claim['matched'])
        self.assertEqual(claim['unmatched_by'], self.director.get_full_name() or self.director.username)
        self.assertIn('evidence provided', claim['unmatched_reason'])

    def test_exception_netted_partner_detail_included(self):
        exc_a = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='CREDIT',
            erp_amount=Decimal('4000.00'), erp_narration='side A', erp_date=date(2026, 7, 10),
            resolved=True,
        )
        exc_b = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            erp_amount=Decimal('4000.00'), erp_narration='side B', erp_date=date(2026, 7, 10),
            resolved=True, netted_with=exc_a,
        )
        exc_a.netted_with = exc_b
        exc_a.save(update_fields=['netted_with'])

        payment = self._payment('E', Decimal('4000.00'), 'Loan repayment – LN-4000')
        exc_a.loan_payment_id = payment.id
        exc_a.save(update_fields=['loan_payment_id'])

        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': '4000'})
        self.assertEqual(resp.status_code, 200)
        payment_entry = next(p for p in resp.data['payments'] if p['id'] == payment.id)
        self.assertEqual(len(payment_entry['exceptions']), 1)
        exc_entry = payment_entry['exceptions'][0]
        self.assertEqual(exc_entry['id'], exc_a.id)
        self.assertIsNotNone(exc_entry['netted_with'])
        self.assertEqual(exc_entry['netted_with']['id'], exc_b.id)
        self.assertEqual(exc_entry['netted_with']['narration'], 'side B')

    def test_branch_scoping_hides_other_tenants_data(self):
        other_tenant = Tenant.objects.create(name='Other Org', slug='other-org')
        other_branch = Branch.objects.create(name='Other Branch', code='OTB')
        other_director = User.objects.create_user(
            username='other_director', password='test123',
            tenant=other_tenant, branch=other_branch, is_superuser=True,
        )
        other_gl = Account.objects.create(
            code='1927', name='Other GL', account_level=Account.LEVEL_PARENT, branch=other_branch,
        )
        other_bank = Bank.objects.create(bank_name='Other Bank', bank_code='983')
        other_account = BankAccount.objects.create(
            bank=other_bank, account_number='0000098', account_name='Other Account',
            gl_account=other_gl, account_manager=other_director,
        )
        DailyReconciliation.objects.create(
            bank_account=other_account, reconciliation_date=date(2026, 7, 10),
            uploaded_by=other_director, statement_file='bank_statements/other.csv',
            status='completed', owner=other_director, branch=other_branch, tenant=other_tenant,
        )
        # A payment on the OTHER tenant's bank GL, unique odd amount.
        other_series = TransactionSeries.objects.create(code='OTHLN', description='Other payments')
        other_txn = Transaction.objects.create(
            series=other_series, date=date(2026, 7, 10), description='Loan repayment – other tenant',
            owner=other_director, branch=other_branch, created_by=other_director, approved=True,
        )
        TransactionEntry.objects.create(
            transaction=other_txn, account=other_gl, side=TransactionEntry.CREDIT, amount=Decimal('99999.00'),
        )

        resp = self.client.get('/api/banks/reconciliations/payment-trace/', {'q': '99999'})
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data['payments'], [])
