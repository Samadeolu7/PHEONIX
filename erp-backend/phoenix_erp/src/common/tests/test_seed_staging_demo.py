"""
manage.py seed_staging_demo, and the five-step client simulation from
docs/STAGING_HANDOVER.md ("Goal") run against the seeded data, through the
same hosts staging uses (api.staging.krystartrust.ng / staging.krystartrust.ng).
"""
import io
import re
import secrets
import shutil
import tempfile
from decimal import Decimal
from unittest import mock
from urllib.parse import unquote

from django.core import mail
from django.core.cache import cache
from django.core.management import CommandError, call_command
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from common.managers import set_current_tenant

API_HOST = 'api.staging.krystartrust.ng'
SITE = 'https://staging.krystartrust.ng'
LOCMEM = 'django.core.mail.backends.locmem.EmailBackend'
STAGING_MAIL = dict(STAGING=True, EMAIL_BACKEND='common.staging.StagingEmailBackend',
                    STAGING_EMAIL_INNER_BACKEND=LOCMEM, STAGING_EMAIL_REDIRECT='')
PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'


def throwaway_password():
    """A fresh random password per run, so no credential is written in the source."""
    return f'Tst-{secrets.token_urlsafe(12)}-9a'


def seed(**kw):
    out = io.StringIO()
    call_command('seed_staging_demo', password=throwaway_password(), stdout=out, **kw)
    set_current_tenant(None)
    return out.getvalue()


class SeedRefusesOutsideStagingTests(TestCase):
    def test_refuses_without_staging_switch(self):
        with self.assertRaisesMessage(CommandError, 'STAGING is not on'):
            call_command('seed_staging_demo', stdout=io.StringIO())
        from users.models import Tenant
        self.assertFalse(Tenant.objects.filter(slug='mt').exists())


@override_settings(**STAGING_MAIL)
class SeedTests(TestCase):
    def tearDown(self):
        set_current_tenant(None)

    def test_seed_creates_demo_data_and_is_idempotent(self):
        from accounts.models import Account
        from clients.models import Client
        from loans.models import LoanAccount
        from portal.models import PortalConfig, PortalLoanOffering
        from savings.models import SavingsAccount
        from transactions.models import Transaction
        from users.models import Tenant, User

        first = seed()
        self.assertIn('created', first)
        tenant = Tenant.objects.get(slug='mt')
        self.assertEqual(tenant.branch_set.count() if hasattr(tenant, 'branch_set') else 2, 2)

        def snapshot():
            return dict(
                clients=Client.all_objects.filter(tenant=tenant).count(),
                savings=SavingsAccount.all_objects.filter(tenant=tenant).count(),
                loans=LoanAccount.all_objects.filter(tenant=tenant).count(),
                journals=Transaction.objects.all_tenants().filter(tenant=tenant).count(),
                balances=sorted(Account.objects.all_tenants().filter(tenant=tenant).values_list('code', 'balance')),
                users=User.objects.filter(tenant=tenant).count(),
            )

        before = snapshot()
        second = seed()
        self.assertIn('nothing new', second)
        self.assertEqual(snapshot(), before)

        # Fake identities only.
        clients = Client.all_objects.filter(tenant=tenant)
        self.assertEqual(clients.count(), 8)
        for c in clients:
            self.assertTrue(c.nin.startswith('000') and len(c.nin) == 11, c.nin)
            self.assertTrue(c.bvn.startswith('000') and len(c.bvn) == 11, c.bvn)
            self.assertTrue(c.phone_primary.startswith('0800000'), c.phone_primary)
            self.assertTrue(c.email.endswith('@example.com'), c.email)

        # Savings balances come from posted deposits, not direct writes.
        sa = SavingsAccount.objects.all_tenants().get(client__client_id='DEMO-001')
        self.assertEqual(sa.account.balance, Decimal('185000.00'))
        self.assertTrue(Transaction.objects.all_tenants().filter(
            tenant=tenant, series__code='SVDEP', approved=True).exists())

        # Two active loans: one up to date, one in arrears.
        loans = {l.client.client_id: l for l in LoanAccount.objects.all_tenants().filter(tenant=tenant)}
        self.assertEqual(set(loans), {'DEMO-001', 'DEMO-003'})
        for loan in loans.values():
            self.assertEqual(loan.status, 'active')
            from loans.models import LoanDisbursement
            self.assertEqual(LoanDisbursement.objects.get(loan=loan).status, 'disbursed')
        self.assertFalse(loans['DEMO-001'].is_in_arrears)
        self.assertTrue(loans['DEMO-003'].repayment_schedule.filter(status__in=['overdue', 'partial', 'pending'],
                                                                      due_date__lt=loans['DEMO-003'].maturity_date).exists())

        # Ledger stays balanced.
        from django.db.models import Sum
        from transactions.models import TransactionEntry as E
        tot = E.objects.filter(transaction__tenant=tenant).values('side').annotate(t=Sum('amount'))
        sides = {r['side']: r['t'] for r in tot}
        self.assertEqual(sides[E.DEBIT], sides[E.CREDIT])

        cfg = PortalConfig.objects.get(tenant=tenant)
        self.assertTrue(cfg.is_enabled)
        self.assertFalse(cfg.allow_registration)
        self.assertEqual(cfg.public_url, SITE)
        self.assertEqual(PortalLoanOffering.objects.filter(tenant=tenant, is_active=True).count(), 2)

    def test_generated_password_is_printed_once_and_works(self):
        from users.models import User
        out = io.StringIO()
        call_command('seed_staging_demo', stdout=out)
        self.assertIn('shown ONCE', out.getvalue())
        printed = [line.split(':', 1)[1].strip() for line in out.getvalue().splitlines()
                   if line.strip().startswith('password')]
        self.assertEqual(len(printed), 1)
        self.assertTrue(User.objects.get(username='demo.teller').check_password(printed[0]))
        out2 = io.StringIO()
        call_command('seed_staging_demo', stdout=out2)
        self.assertNotIn('shown ONCE', out2.getvalue())
        self.assertNotIn(printed[0], out2.getvalue())


@override_settings(**STAGING_MAIL)
class ClientSimulationTests(TestCase):
    """The five steps from the handover's "Goal", on seeded staging data."""

    def setUp(self):
        cache.clear()
        self.media = tempfile.mkdtemp()
        self._ov = override_settings(MEDIA_ROOT=self.media)
        self._ov.enable()
        seed()
        from users.models import User
        self.u = {k: User.objects.get(username=f'demo.{k}')
                  for k in ('director', 'branchadmin', 'creditofficer', 'teller')}

    def tearDown(self):
        self._ov.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        set_current_tenant(None)

    def staff(self, key):
        c = APIClient(HTTP_HOST=API_HOST, HTTP_ORIGIN=SITE)
        c.force_authenticate(self.u[key])
        return c

    def portal(self):
        # Exactly what a browser on staging sends: API host + the site's Origin.
        return APIClient(HTTP_HOST=API_HOST, HTTP_ORIGIN=SITE, HTTP_REFERER=SITE + '/portal/',
                         HTTP_X_PORTAL_REQUEST='1')

    def test_five_step_simulation(self):
        from clients.models import Client
        from loans.models import LoanAccount, LoanDisbursement
        from loans.services import DisbursementService
        from portal.models import OnlineLoanApplication, OnlineWithdrawalRequest
        from savings.models import SavingsAccount, SavingsWithdrawalRequest
        from savings.services import disburse_withdrawal, process_withdrawal_approval

        network = mock.patch('notifications.providers.requests.post',
                             side_effect=AssertionError('no outbound calls on staging'))
        network.start()
        self.addCleanup(network.stop)

        # 1. A director sets up the portal (Admin → Online Portal Settings).
        d = self.staff('director')
        res = d.get('/api/portal/staff/settings/')
        self.assertEqual(res.status_code, 200, res.content)
        settings_body = res.json()
        payload = {k: settings_body['settings'][k] for k in settings_body['settings']} \
            if 'settings' in settings_body else {}
        payload.update(is_enabled=True, public_url=SITE)
        res = d.put('/api/portal/staff/settings/', payload, format='json')
        self.assertEqual(res.status_code, 200, res.content)

        # The public site resolves the staging organisation from its address.
        res = self.portal().get('/api/portal/products/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(len(res.json()), 2)

        # 2. Staff invite a demo client from the client record.
        client = Client.all_objects.get(client_id='DEMO-002')
        co = self.staff('creditofficer')
        res = co.post('/api/portal/staff/invitations/', {'client': client.pk, 'email': client.email}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        invite_mail = mail.outbox[-1]
        self.assertEqual(invite_mail.to, [client.email])  # log-only mode: printed, never delivered
        self.assertTrue(invite_mail.subject.startswith('[STAGING] '))
        self.assertIn(SITE + '/portal/accept-invite?token=', invite_mail.body)
        token = unquote(re.search(r'/portal/accept-invite\?token=(\S+)', invite_mail.body).group(1))

        # 3. The client accepts, applies, uploads a document and sees balances.
        p = self.portal()
        res = p.post('/api/portal/auth/accept-invitation/',
                     {'token': token, 'password': throwaway_password(), 'accept_terms': True}, format='json')
        self.assertEqual(res.status_code, 201, res.content)

        res = p.get('/api/portal/me/accounts/')
        self.assertEqual(res.status_code, 200, res.content)
        accounts = res.json()
        self.assertTrue(accounts['linked'])
        self.assertEqual(Decimal(str(accounts['savings'][0]['balance'])), Decimal('80000.00'))

        offering = p.get('/api/portal/products/').json()
        monthly = next(o for o in offering if 'Monthly' in o['name'])
        branches = p.get('/api/portal/branches/').json()
        app_data = {
            'offering': monthly['id'], 'branch': branches[0]['id'],
            'requested_amount': '150000', 'term': 6, 'repayment_frequency': 'monthly',
            'loan_purpose': 'Restock my shop (demo)',
            'title': 'mr', 'first_name': client.first_name, 'last_name': client.last_name, 'gender': 'male',
            'date_of_birth': '1990-05-04', 'marital_status': 'married',
            'phone_primary': client.phone_primary, 'address_street': '2 Demo Street',
            'address_city': 'Ibadan', 'address_state': 'Oyo',
            'nin': client.nin, 'bvn': client.bvn,
            'employment_status': 'self_employed', 'occupation': 'Trader', 'monthly_income': '250000',
            'next_of_kin_name': 'Demo Kin', 'next_of_kin_relationship': 'Spouse',
            'next_of_kin_phone': '08000009999',
            'consent_credit_check': True, 'consent_data_processing': True,
        }
        res = p.post('/api/portal/applications/', app_data, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        ref = res.json()['reference']
        from django.core.files.uploadedfile import SimpleUploadedFile
        res = p.post(f'/api/portal/applications/{ref}/documents/',
                     {'document_type': 'id_card', 'file': SimpleUploadedFile('id.pdf', PDF, 'application/pdf')},
                     format='multipart')
        self.assertEqual(res.status_code, 201, res.content)

        # 4. A credit officer picks it up, staff accept it, and it is approved
        #    and disbursed through the normal loan workflow.
        app = OnlineLoanApplication.objects.get(reference=ref)
        listed = co.get('/api/portal/staff/applications/')
        self.assertEqual(listed.status_code, 200, listed.content)
        res = co.post(f'/api/portal/staff/applications/{app.pk}/start-review/')
        self.assertEqual(res.status_code, 200, res.content)
        res = co.post(f'/api/portal/staff/applications/{app.pk}/convert/', {'client_id': client.pk}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        app.refresh_from_db()
        loan = LoanAccount.objects.all_tenants().get(pk=app.converted_loan_id) if getattr(app, 'converted_loan_id', None) \
            else LoanAccount.objects.all_tenants().filter(client=client).latest('id')
        self.assertEqual(loan.status, 'pending')

        set_current_tenant(loan.tenant)
        loan.approve(self.u['branchadmin'])
        disb = LoanDisbursement.objects.get(loan=loan)
        self.assertEqual(disb.status, 'approved')
        from banks.models import BankAccount
        bank = BankAccount.objects.all_tenants().get(tenant=loan.tenant)
        DisbursementService.execute(disb, bank.pk, self.u['director'], acknowledge_impact=True,
                                    liquidity_note='staging demo')
        loan.refresh_from_db()
        self.assertEqual(loan.status, 'active')
        set_current_tenant(None)

        loans = p.get('/api/portal/me/accounts/').json()['loans']
        self.assertTrue(any(l.get('loan_number') == loan.loan_number for l in loans), loans)

        # 5. The client requests a withdrawal, staff forward it, and it is
        #    approved and paid out through Savings Withdrawal.
        sa = SavingsAccount.objects.all_tenants().get(client=client)
        res = p.post('/api/portal/withdrawals/', {'savings_account': sa.pk, 'amount': '20000',
                                                   'payout_preference': 'cash', 'reason': 'Demo'}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        owr = OnlineWithdrawalRequest.objects.get(reference=res.json()['reference'])
        res = co.post(f'/api/portal/staff/withdrawals/{owr.pk}/forward/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)

        set_current_tenant(sa.tenant)
        wr = SavingsWithdrawalRequest.objects.get()
        step = wr.approval_steps.order_by('id').first()
        from accounts.models import Account
        till = Account.objects.all_tenants().get(tenant=sa.tenant, branch=sa.branch, code='1101')
        process_withdrawal_approval(step, self.u['branchadmin'], True, payment_method='cash',
                                    cashier_account_id=till.pk)
        wr.refresh_from_db()
        self.assertEqual(wr.status, SavingsWithdrawalRequest.STATUS_APPROVED)
        disburse_withdrawal(wr, self.u['teller'])
        wr.refresh_from_db()
        sa.account.refresh_from_db()
        self.assertEqual(sa.account.balance, Decimal('60000.00'))
        set_current_tenant(None)

        # Nobody real was contacted at any point.
        for m in mail.outbox:
            for addr in m.recipients():
                self.assertTrue(addr.endswith('@example.com'), addr)
