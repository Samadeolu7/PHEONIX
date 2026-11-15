"""SMS receipts: safety rules, message format, director API."""
from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from clients.signals import clear_audit_context, set_audit_context
from common.managers import set_current_tenant
from notifications.models import Notification, NotificationChannel, SmsReceiptSettings
from notifications.receipts import SMS_LIMIT, _GSM7, build_message, normalise_ng_mobile
from products.models import Product
from savings.models import SavingsAccount
from users.models import Tenant, User


class _Env(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.owner = User.objects.create_user(username='smsown', password='x' * 12)
        self.tenant = Tenant.objects.create(name='SMS Org', slug='sms-org', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()
        self.branch = Branch.objects.create(name='HQ', code='SMSHQ', tenant=self.tenant, owner=self.owner)
        self.owner.branch = self.branch
        self.owner.save()
        set_current_tenant(self.tenant)

        def gl(name, code, kind, level=Account.LEVEL_PARENT, parent=None):
            return Account.objects.create(name=name, code=code, account_type=kind, account_level=level,
                                          parent=parent, owner=self.owner, created_by=self.owner,
                                          branch=self.branch, tenant=self.tenant)
        sav_parent = gl('Savings', '2100', Account.SAVINGS)
        cash_parent = gl('Cash', '1000', Account.ASSET)
        self.cashier = gl('Till', '1001', Account.ASSET, Account.LEVEL_CHILD, cash_parent)
        product = Product.objects.create(name='Regular Savings', code='SAV-R', product_type='SAVINGS',
                                         owner=self.owner, branch=self.branch, tenant=self.tenant)
        self.client_rec = Client.objects.create(first_name='Bisi', last_name='Ade', gender='female',
                                                phone_primary='0803 123 4567', tenant=self.tenant,
                                                branch=self.branch, owner=self.owner)
        self.savings = SavingsAccount.objects.create(
            client=self.client_rec, account=gl('Bisi Savings', '2101', Account.SAVINGS, Account.LEVEL_CHILD, sav_parent),
            product=product, account_number='SAV-2026-000871', interest_rate=Decimal('0'),
            interest_calculation_method='monthly', minimum_balance=Decimal('0'), opened_on=timezone.localdate(),
            status='active', owner=self.owner, branch=self.branch, tenant=self.tenant)
        set_current_tenant(None)
        NotificationChannel.objects.update_or_create(
            code='sms', defaults={'name': 'SMS', 'provider': 'log', 'provider_config': {'provider': 'log'}, 'is_active': True})
        self.cfg = SmsReceiptSettings.objects.create(tenant=self.tenant, is_enabled=True, brand_name='KTIL',
                                                     support_phone='07000000000')

    def tearDown(self):
        clear_audit_context()
        set_current_tenant(None)

    def deposit(self, amount='5000', date=None, in_request=True):
        if in_request:
            set_audit_context(user=None, ip_address='10.0.0.1')
        else:
            clear_audit_context()
        with mock.patch('notifications.tasks.send_notification_task.apply_async') as queued, \
                self.captureOnCommitCallbacks(execute=True):
            je = self.savings.deposit(Decimal(amount), cashier_account=self.cashier, transacted_by=self.owner, date=date)
        return je, queued


class ReceiptRuleTests(_Env):
    def test_live_deposit_sends_one_receipt(self):
        je, queued = self.deposit()
        self.assertIsNotNone(je)
        n = Notification.objects.get(recipient_client=self.client_rec)
        self.assertEqual(n.recipient_contact, '+2348031234567')
        self.assertIn('NGN5,000.00', n.message)
        self.assertIn('..0871', n.message)          # masked account number
        self.assertNotIn('SAV-2026-000871', n.message)
        self.assertIn('Bal NGN5,000.00', n.message)
        self.assertLessEqual(len(n.message), SMS_LIMIT)
        self.assertTrue(set(n.message) <= _GSM7)
        queued.assert_called_once()

    def test_no_receipt_outside_a_user_request(self):
        self.deposit(in_request=False)               # e.g. management command / Celery job
        self.assertFalse(Notification.objects.exists())

    def test_no_receipt_for_backdated_postings(self):
        self.deposit(date=timezone.localdate() - timedelta(days=10))
        self.assertFalse(Notification.objects.exists())

    def test_no_receipt_when_switched_off_or_event_disabled(self):
        self.cfg.is_enabled = False
        self.cfg.save()
        self.deposit()
        self.cfg.is_enabled = True
        self.cfg.send_savings_deposit = False
        self.cfg.save()
        self.deposit()
        self.assertFalse(Notification.objects.exists())

    def test_no_receipt_for_invalid_phone(self):
        Client.all_objects.filter(pk=self.client_rec.pk).update(phone_primary='12345')
        self.savings.client.refresh_from_db()
        self.deposit()
        self.assertFalse(Notification.objects.exists())

    def test_sms_failure_never_breaks_the_posting(self):
        with mock.patch('notifications.models.Notification.objects.create', side_effect=RuntimeError('db down')):
            je, _ = self.deposit()
        self.assertIsNotNone(je)
        self.savings.account.refresh_from_db()
        self.assertEqual(self.savings.account.balance, Decimal('5000.00'))

    def test_nothing_sent_if_posting_rolls_back(self):
        from django.db import transaction
        set_audit_context(user=None, ip_address='10.0.0.1')
        with mock.patch('notifications.tasks.send_notification_task.apply_async') as queued:
            with self.captureOnCommitCallbacks(execute=True):
                try:
                    with transaction.atomic():
                        self.savings.deposit(Decimal('100'), cashier_account=self.cashier, transacted_by=self.owner)
                        raise RuntimeError('teller cancelled')
                except RuntimeError:
                    pass
        queued.assert_not_called()
        self.assertFalse(Notification.objects.exists())


class MessageFormatTests(TestCase):
    def test_every_event_fits_one_gsm_sms(self):
        for event in ('loan_disbursement', 'loan_repayment', 'savings_deposit', 'savings_withdrawal'):
            msg = build_message(event, brand='KRYSTARTRUST', amount=Decimal('12345678.90'),
                                when=timezone.localdate(), label='LN-20261115-AB12CD',
                                reference='TXN-2026-11-000123456', balance=Decimal('98765432.10'),
                                support_phone='0700 123 4567', extra='Repay NGN1,234,567.00 weekly.')
            self.assertLessEqual(len(msg), SMS_LIMIT, event)
            self.assertTrue(set(msg) <= _GSM7, event)
            self.assertNotIn('₦', msg)

    def test_phone_normalisation(self):
        self.assertEqual(normalise_ng_mobile('08031234567'), '+2348031234567')
        self.assertEqual(normalise_ng_mobile('+234 803 123 4567'), '+2348031234567')
        self.assertIsNone(normalise_ng_mobile('0123'))
        self.assertIsNone(normalise_ng_mobile('01-2345678'))   # landline


class DirectorApiTests(_Env):
    URL = '/api/notifications/sms-receipts/'

    def body(self, **over):
        b = {'is_enabled': True, 'brand_name': 'KTIL', 'support_phone': '07000000000',
             'send_loan_disbursement': True, 'send_loan_repayment': True, 'send_savings_deposit': True,
             'send_savings_withdrawal': True, 'provider': 'termii', 'sender_id': 'KRYSTAR',
             'channel': 'dnd', 'api_key': 'secret-key-123'}
        b.update(over)
        return b

    def test_director_saves_and_secret_is_never_returned(self):
        c = APIClient()
        c.force_authenticate(self.owner)
        res = c.put(self.URL, self.body(), format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertNotIn('secret-key-123', res.content.decode())
        self.assertEqual(res.json()['provider']['secrets_saved'], ['api_key'])
        # Blank key on a later save keeps the stored one.
        c.put(self.URL, self.body(api_key='', brand_name='K2'), format='json')
        self.assertEqual(NotificationChannel.objects.get(code='sms').provider_config['api_key'], 'secret-key-123')

    def test_non_director_denied(self):
        from users.models import Role
        clerk = User.objects.create_user(username='clerk9', password='x' * 12)
        clerk.tenant, clerk.branch = self.tenant, self.branch
        clerk.save()
        clerk.roles.add(Role.objects.create(name='Teller', tenant=self.tenant))
        c = APIClient()
        c.force_authenticate(clerk)
        self.assertEqual(c.get(self.URL).status_code, 403)
        self.assertEqual(c.put(self.URL, self.body(), format='json').status_code, 403)

    def test_validation(self):
        c = APIClient()
        c.force_authenticate(self.owner)
        self.assertEqual(c.put(self.URL, self.body(support_phone=''), format='json').status_code, 400)
        self.assertEqual(c.put(self.URL, self.body(sender_id=''), format='json').status_code, 400)
        self.assertEqual(c.put(self.URL, self.body(sender_id='WAY-TOO-LONG-NAME'), format='json').status_code, 400)

    def test_test_sms_in_test_mode(self):
        c = APIClient()
        c.force_authenticate(self.owner)
        res = c.post(self.URL + 'test/', {'phone': '08031234567'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertTrue(res.json()['test_mode'])
        self.assertEqual(c.post(self.URL + 'test/', {'phone': '123'}, format='json').status_code, 400)

    def test_termii_uses_transactional_route_by_default(self):
        from notifications.providers import SMSProvider
        with mock.patch('notifications.providers.requests.post') as post:
            post.return_value.status_code = 200
            post.return_value.json.return_value = {'message_id': 'abc'}
            SMSProvider().send(recipient='08031234567', subject='', message='hi',
                               channel_config={'provider': 'termii', 'api_key': 'k', 'sender_id': 'KRYSTAR'})
        self.assertEqual(post.call_args.kwargs['json']['channel'], 'dnd')
        self.assertEqual(post.call_args.kwargs['json']['to'], '+2348031234567')


class EstimateCommandTests(_Env):
    def test_counts_per_month_and_skips_invalid_phones(self):
        import io
        from django.core.management import call_command
        self.deposit(in_request=False)          # logged in the audit log, client has a valid phone
        self.deposit(in_request=False)
        out = io.StringIO()
        call_command('estimate_sms_volume', '--price', '6.5', stdout=out)
        text = out.getvalue()
        self.assertIn('TOTAL SMS', text)
        this_month = timezone.localdate().strftime('%Y-%m')
        line = next(l for l in text.splitlines() if l.startswith(this_month))
        self.assertIn('13.00', line)            # 2 SMS x NGN6.50
        csv_out = io.StringIO()
        call_command('estimate_sms_volume', '--csv', stdout=csv_out)
        self.assertIn('total_sms', csv_out.getvalue())


from loans.tests import test_bulk_repair_task as _loan_fx  # module import: don't re-collect its tests


class PenaltyWarningEstimateTests(TestCase):
    setUp = _loan_fx.BulkRepairTaskTestCase.setUp
    tearDown = _loan_fx.BulkRepairTaskTestCase.tearDown
    _make_loan = _loan_fx.BulkRepairTaskTestCase._make_loan
    _make_row = _loan_fx.BulkRepairTaskTestCase._make_row

    def test_counts_due_and_missed_instalments(self):
        import io
        from django.core.management import call_command
        today = timezone.localdate()
        loan = self._make_loan('LN-WARN-001', status='active', outstanding_principal=Decimal('20000'))
        d = today - timedelta(days=1)
        self._make_row(loan, 1, d, Decimal('10000'), Decimal('10000'), 'paid')      # paid: reminder only
        self._make_row(loan, 2, d, Decimal('10000'), Decimal('0'), 'overdue')       # missed
        self._make_row(loan, 3, today + timedelta(days=5), Decimal('10000'), Decimal('0'), 'pending')  # future
        out = io.StringIO()
        set_current_tenant(None)
        call_command('estimate_sms_volume', stdout=out)
        text = out.getvalue()
        section = text[text.index('Warnings before penalties'):]
        line = next(l for l in section.splitlines() if l.startswith(d.strftime('%Y-%m')))
        self.assertEqual(line.split()[-4:], ['2', '1', '1', '0'], line)

    def test_customers_without_a_phone_are_still_counted(self):
        import io
        from django.core.management import call_command
        Client.all_objects.filter(pk=self.client_.pk).update(phone_primary='')
        d = timezone.localdate() - timedelta(days=1)
        loan = self._make_loan('LN-WARN-002', status='active', outstanding_principal=Decimal('10000'))
        self._make_row(loan, 1, d, Decimal('10000'), Decimal('0'), 'overdue')
        out = io.StringIO()
        set_current_tenant(None)
        call_command('estimate_sms_volume', stdout=out)
        section = out.getvalue()[out.getvalue().index('Warnings before penalties'):]
        line = next(l for l in section.splitlines() if l.startswith(d.strftime('%Y-%m')))
        self.assertEqual(line.split()[-4:], ['1', '1', '1', '1'], line)
        self.assertIn('1 customers to collect', section)
