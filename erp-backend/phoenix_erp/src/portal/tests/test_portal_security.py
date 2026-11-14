"""
Security-focused tests for the customer portal.

Each test class maps to one guarantee described in portal/models.py.
"""
import re
from unittest import mock
from datetime import date, timedelta
from decimal import Decimal

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken

from accounts.models import Account
from branches.models import Branch
from clients.models import Client
from common.managers import set_current_tenant
from loans.models import LoanAccount, LoanProduct
from products.models import Product
from users.models import Tenant, User

from portal import tokens
from portal.models import (
    OnlineLoanApplication, PortalAuditEvent, PortalConfig, PortalCustomer, PortalLoanOffering,
    PortalSession, hash_token,
)

STRONG_PW = 'Kestrel-Harbour-2291'
COOKIE = 'phx_portal_session'


def make_tenant(slug, *, enabled=True):
    set_current_tenant(None)
    owner = User.objects.create_user(username=f'{slug}_owner', password='x' * 12)
    tenant = Tenant.objects.create(name=f'Org {slug}', slug=slug, owner=owner)
    owner.tenant = tenant
    owner.save()
    branch = Branch.objects.create(name=f'{slug} HQ', code=slug[:10], tenant=tenant, owner=owner, city='Ibadan')
    owner.branch = branch
    owner.save()
    set_current_tenant(tenant)

    def acct(name, code, kind):
        return Account.objects.create(
            name=name, code=code, account_type=kind, account_level=Account.LEVEL_PARENT,
            owner=owner, created_by=owner, branch=branch, tenant=tenant,
        )

    loan_parent = acct('Loans Receivable', '1300', Account.LOAN)
    cash = acct('Bank', '1001', Account.ASSET)
    interest = acct('Interest Income', '4100', Account.INCOME)
    product = Product.objects.create(
        name='Business Loan', code=f'LN-{slug[:6]}', product_type='LOAN',
        owner=owner, branch=branch, tenant=tenant,
    )
    loan_product = LoanProduct.objects.create(
        product=product, parent_account=loan_parent, disbursement_account=cash,
        interest_income_account=interest, default_interest_rate=Decimal('5.00'),
        min_loan_amount=Decimal('10000'), max_loan_amount=Decimal('1000000'),
        min_term_months=1, max_term_months=12, term_unit='months',
        allowed_repayment_frequencies=['monthly', 'weekly'],
        owner=owner, branch=branch, tenant=tenant,
    )
    # Most tests exercise open sign-up; InvitationTests covers the invite-only default.
    PortalConfig.objects.create(tenant=tenant, is_enabled=enabled, allow_registration=True)
    offering = PortalLoanOffering.objects.create(
        tenant=tenant, loan_product=loan_product, max_online_amount=Decimal('500000'),
    )
    set_current_tenant(None)
    return {'tenant': tenant, 'owner': owner, 'branch': branch, 'product': loan_product, 'offering': offering}


def portal_client(slug):
    c = APIClient()
    c.defaults['HTTP_X_TENANT_SLUG'] = slug
    c.defaults['HTTP_X_PORTAL_REQUEST'] = '1'
    return c


def make_customer(env, email='ada@example.com', verified=True, password=STRONG_PW):
    c = PortalCustomer(
        tenant=env['tenant'], email=email, phone='08031234567', first_name='Ada', last_name='Obi',
        accepted_terms_at=timezone.now(),
        email_verified_at=timezone.now() if verified else None,
    )
    c.set_password(password)
    c.save()
    return c


def login(client, email='ada@example.com', password=STRONG_PW):
    return client.post('/api/portal/auth/login/', {'email': email, 'password': password}, format='json')


def application_payload(env, **over):
    data = {
        'offering': env['offering'].pk, 'branch': env['branch'].pk,
        'requested_amount': '150000', 'term': 6, 'repayment_frequency': 'monthly',
        'loan_purpose': 'Restock my provisions shop',
        'title': 'mrs', 'first_name': 'Ada', 'last_name': 'Obi', 'gender': 'female',
        'date_of_birth': '1990-05-04', 'marital_status': 'married',
        'phone_primary': '08031234567', 'address_street': '12 Ring Road',
        'address_city': 'Ibadan', 'address_state': 'Oyo',
        'nin': '12345678901', 'bvn': '22345678901',
        'employment_status': 'self_employed', 'occupation': 'Trader', 'monthly_income': '250000',
        'next_of_kin_name': 'Chidi Obi', 'next_of_kin_relationship': 'Spouse',
        'next_of_kin_phone': '08099998888',
        'consent_credit_check': True, 'consent_data_processing': True,
    }
    data.update(over)
    return data


class PortalTestCase(TestCase):
    def setUp(self):
        cache.clear()
        self.env = make_tenant('alpha')

    def tearDown(self):
        set_current_tenant(None)


# ─────────────────────────────────────────────────────────────────────────────

class TenantFailClosedTests(PortalTestCase):
    def test_portal_404_when_not_enabled(self):
        make_tenant('beta', enabled=False)
        self.assertEqual(portal_client('beta').get('/api/portal/products/').status_code, 404)

    def test_portal_404_without_any_tenant(self):
        c = APIClient()
        self.assertEqual(c.get('/api/portal/products/').status_code, 404)

    def test_products_only_lists_allowlisted_offerings(self):
        # A second, non-offered product must not appear.
        set_current_tenant(self.env['tenant'])
        p = Product.objects.create(name='Secret Staff Loan', code='LN-SEC', product_type='LOAN',
                                   owner=self.env['owner'], branch=self.env['branch'], tenant=self.env['tenant'])
        LoanProduct.objects.create(
            product=p, parent_account=self.env['product'].parent_account,
            default_interest_rate=Decimal('1'), min_loan_amount=1, max_loan_amount=2,
            owner=self.env['owner'], branch=self.env['branch'], tenant=self.env['tenant'],
        )
        set_current_tenant(None)
        res = portal_client('alpha').get('/api/portal/products/')
        self.assertEqual(res.status_code, 200)
        names = [o['name'] for o in res.json()]
        self.assertEqual(names, ['Business Loan'])
        # No GL/internal data leaks into the public catalogue.
        self.assertNotIn('parent_account', res.json()[0])
        self.assertEqual(Decimal(str(res.json()[0]['max_amount'])), Decimal('500000'))

    def test_session_is_bound_to_its_tenant(self):
        make_tenant('beta')
        make_customer(self.env)
        a = portal_client('alpha')
        self.assertEqual(login(a).status_code, 200)
        raw = a.cookies[COOKIE].value
        b = portal_client('beta')
        b.cookies[COOKIE] = raw
        self.assertEqual(b.get('/api/portal/me/').status_code, 401)
        self.assertEqual(a.get('/api/portal/me/').status_code, 200)

    def test_offering_cannot_point_at_another_tenants_product(self):
        from django.core.exceptions import ValidationError
        beta = make_tenant('beta')
        bad = PortalLoanOffering(tenant=self.env['tenant'], loan_product=beta['product'])
        with self.assertRaises(ValidationError):
            bad.full_clean()


class StaffCustomerIsolationTests(PortalTestCase):
    """Customers can never reach staff endpoints, and vice versa."""

    def test_portal_cookie_does_not_authenticate_staff_endpoints(self):
        make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        for url in ['/api/loans/accounts/', '/api/clients/', '/api/portal/staff/applications/',
                    '/api/users/']:
            res = c.get(url)
            self.assertIn(res.status_code, (401, 403, 404), f'{url} returned {res.status_code}')
            self.assertNotEqual(res.status_code, 200, url)

    def test_staff_jwt_does_not_authenticate_portal(self):
        token = AccessToken.for_user(self.env['owner'])
        c = portal_client('alpha')
        res = c.get('/api/portal/me/', HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(res.status_code, 401)

    def test_customer_is_never_a_staff_user(self):
        make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        self.assertFalse(User.objects.filter(email='ada@example.com').exists())


class CsrfTests(PortalTestCase):
    def test_state_changing_requests_need_portal_header(self):
        make_customer(self.env)
        c = APIClient()
        c.defaults['HTTP_X_TENANT_SLUG'] = 'alpha'
        # Login without header (login CSRF)
        self.assertEqual(login(c).status_code, 403)
        # With header, then drop it for an authenticated POST.
        c.defaults['HTTP_X_PORTAL_REQUEST'] = '1'
        self.assertEqual(login(c).status_code, 200)
        del c.defaults['HTTP_X_PORTAL_REQUEST']
        res = c.post('/api/portal/applications/', application_payload(self.env), format='json')
        self.assertEqual(res.status_code, 403)
        self.assertEqual(OnlineLoanApplication.objects.count(), 0)


class SessionCookieTests(PortalTestCase):
    def test_cookie_flags_and_hashed_storage(self):
        make_customer(self.env)
        c = portal_client('alpha')
        res = login(c)
        morsel = res.cookies[COOKIE]
        self.assertTrue(morsel['httponly'])
        self.assertEqual(morsel['samesite'], 'Strict')
        self.assertEqual(morsel['path'], '/api/portal/')
        raw = morsel.value
        # Only the hash is stored.
        self.assertFalse(PortalSession.objects.filter(token_hash=raw).exists())
        self.assertTrue(PortalSession.objects.filter(token_hash=hash_token(raw)).exists())
        # Token never appears in the response body.
        self.assertNotIn(raw, res.content.decode())

    def test_logout_revokes_server_side(self):
        make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        raw = c.cookies[COOKIE].value
        self.assertEqual(c.post('/api/portal/auth/logout/').status_code, 200)
        replay = portal_client('alpha')
        replay.cookies[COOKIE] = raw
        self.assertEqual(replay.get('/api/portal/me/').status_code, 401)

    def test_idle_and_absolute_expiry(self):
        cust = make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        s = PortalSession.objects.get(customer=cust)
        s.last_seen_at = timezone.now() - timedelta(minutes=31)
        s.save()
        self.assertEqual(c.get('/api/portal/me/').status_code, 401)
        s.last_seen_at = timezone.now()
        s.expires_at = timezone.now() - timedelta(seconds=1)
        s.save()
        self.assertEqual(c.get('/api/portal/me/').status_code, 401)

    def test_login_rotates_session(self):
        make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        first = c.cookies[COOKIE].value
        login(c)
        second = c.cookies[COOKIE].value
        self.assertNotEqual(first, second)
        self.assertIsNotNone(PortalSession.objects.get(token_hash=hash_token(first)).revoked_at)

    def test_stale_cookie_does_not_break_public_pages(self):
        c = portal_client('alpha')
        c.cookies[COOKIE] = 'garbage'
        self.assertEqual(c.get('/api/portal/products/').status_code, 200)
        self.assertEqual(c.get('/api/portal/me/').status_code, 401)

    def test_deactivated_customer_loses_access(self):
        cust = make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        cust.is_active = False
        cust.save()
        self.assertEqual(c.get('/api/portal/me/').status_code, 401)


class BruteForceAndEnumerationTests(PortalTestCase):
    def test_lockout_after_repeated_failures(self):
        make_customer(self.env)
        c = portal_client('alpha')
        for _ in range(5):
            self.assertEqual(login(c, password='wrong-password').status_code, 401)
        # Correct password is now refused too, with the same generic message.
        res = login(c)
        self.assertEqual(res.status_code, 401)
        self.assertTrue(PortalCustomer.objects.get().is_locked())
        self.assertTrue(PortalAuditEvent.objects.filter(event='account_locked').exists())

    def test_login_errors_are_generic(self):
        make_customer(self.env)
        c = portal_client('alpha')
        wrong_pw = login(c, password='nope-nope-nope')
        no_user = login(c, email='ghost@example.com')
        self.assertEqual(wrong_pw.status_code, no_user.status_code)
        self.assertEqual(wrong_pw.json(), no_user.json())

    def test_register_does_not_reveal_existing_email(self):
        make_customer(self.env)
        c = portal_client('alpha')
        body = {'first_name': 'Eve', 'last_name': 'Mallory', 'email': 'ADA@example.com',
                'phone': '08031230000', 'password': STRONG_PW, 'accept_terms': True}
        dup = c.post('/api/portal/auth/register/', body, format='json')
        new = c.post('/api/portal/auth/register/', {**body, 'email': 'new@example.com'}, format='json')
        self.assertEqual(dup.status_code, new.status_code)
        self.assertEqual(dup.json(), new.json())
        # Existing account wasn't modified, and its owner was told.
        self.assertEqual(PortalCustomer.objects.get(email='ada@example.com').first_name, 'Ada')
        self.assertTrue(any('already have one' in m.body for m in mail.outbox))

    def test_password_reset_request_is_generic(self):
        make_customer(self.env)
        c = portal_client('alpha')
        a = c.post('/api/portal/auth/password-reset/', {'email': 'ada@example.com'}, format='json')
        b = c.post('/api/portal/auth/password-reset/', {'email': 'ghost@example.com'}, format='json')
        self.assertEqual(a.json(), b.json())
        self.assertEqual(len(mail.outbox), 1)

    def test_login_is_rate_limited_per_ip(self):
        c = portal_client('alpha')
        codes = [login(c, email=f'u{i}@example.com').status_code for i in range(12)]
        self.assertIn(429, codes)

    def test_spoofed_forwarded_for_does_not_evade_throttle(self):
        c = portal_client('alpha')
        codes = []
        for i in range(12):
            codes.append(c.post(
                '/api/portal/auth/login/', {'email': f'u{i}@example.com', 'password': 'x'},
                format='json', HTTP_X_FORWARDED_FOR=f'10.0.0.{i}, 203.0.113.9',
            ).status_code)
        self.assertIn(429, codes)

    def test_weak_password_rejected(self):
        c = portal_client('alpha')
        res = c.post('/api/portal/auth/register/', {
            'first_name': 'Ada', 'last_name': 'Obi', 'email': 'x@example.com', 'phone': '08031234567',
            'password': 'password1', 'accept_terms': True,
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.json().get('errors', res.json()) if isinstance(res.json(), dict) else {})
        self.assertFalse(PortalCustomer.objects.exists())


class TokenTests(PortalTestCase):
    def _link_token(self, path):
        body = mail.outbox[-1].body
        m = re.search(re.escape(path) + r'\?token=(\S+)', body)
        from urllib.parse import unquote
        return unquote(m.group(1))

    def test_register_verify_flow_and_single_use(self):
        c = portal_client('alpha')
        res = c.post('/api/portal/auth/register/', {
            'first_name': 'Ada', 'last_name': 'Obi', 'email': 'ada@example.com', 'phone': '08031234567',
            'password': STRONG_PW, 'accept_terms': True,
        }, format='json')
        self.assertEqual(res.status_code, 201)
        token = self._link_token('/portal/verify-email')
        self.assertEqual(c.post('/api/portal/auth/verify-email/', {'token': token}, format='json').status_code, 200)
        self.assertTrue(PortalCustomer.objects.get().is_email_verified)
        # Replaying the same link fails.
        self.assertEqual(c.post('/api/portal/auth/verify-email/', {'token': token}, format='json').status_code, 400)

    def test_tampered_token_rejected(self):
        cust = make_customer(self.env, verified=False)
        token = tokens.make_token(cust, 'verify')
        self.assertIsNone(tokens.read_token(token[:-2] + 'xx', 'verify', self.env['tenant']))
        # Verify-token can't be used as a reset token.
        self.assertIsNone(tokens.read_token(token, 'reset', self.env['tenant']))
        # Wrong tenant.
        beta = make_tenant('beta')
        self.assertIsNone(tokens.read_token(token, 'verify', beta['tenant']))

    def test_reset_password_single_use_and_revokes_sessions(self):
        make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        c.post('/api/portal/auth/password-reset/', {'email': 'ada@example.com'}, format='json')
        token = self._link_token('/portal/reset-password')
        new_pw = 'Granite-Lantern-8812'
        res = c.post('/api/portal/auth/password-reset/confirm/', {'token': token, 'new_password': new_pw}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(PortalSession.objects.filter(revoked_at__isnull=True).count(), 0)
        again = c.post('/api/portal/auth/password-reset/confirm/', {'token': token, 'new_password': 'Other-Pass-77661'}, format='json')
        self.assertEqual(again.status_code, 400)
        self.assertEqual(login(c, password=new_pw).status_code, 200)


class ApplicationTests(PortalTestCase):
    def setUp(self):
        super().setUp()
        self.customer = make_customer(self.env)
        self.c = portal_client('alpha')
        login(self.c)

    def test_submit_and_view_masked(self):
        res = self.c.post('/api/portal/applications/', application_payload(self.env), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        body = res.json()
        self.assertEqual(body['nin_masked'], '*******8901')
        self.assertNotIn('nin', body)
        self.assertNotIn('bvn', body)
        self.assertNotIn('staff_notes', body)
        self.assertTrue(body['reference'].startswith('OLA-'))
        # Nothing has touched the real ERP tables yet.
        self.assertEqual(Client.objects.count(), 0)
        self.assertEqual(LoanAccount.objects.count(), 0)

    def test_identifiers_encrypted_at_rest(self):
        self.c.post('/api/portal/applications/', application_payload(self.env), format='json')
        from django.db import connection
        with connection.cursor() as cur:
            cur.execute('SELECT nin, bvn FROM portal_onlineloanapplication')
            nin_raw, bvn_raw = cur.fetchone()
        self.assertNotIn(b'12345678901', bytes(nin_raw))
        self.assertNotIn(b'22345678901', bytes(bvn_raw))
        self.assertEqual(OnlineLoanApplication.objects.get().nin, '12345678901')

    def test_unverified_email_cannot_apply(self):
        self.customer.email_verified_at = None
        self.customer.save()
        res = self.c.post('/api/portal/applications/', application_payload(self.env), format='json')
        self.assertEqual(res.status_code, 400)

    def test_server_side_product_rules(self):
        cases = [
            {'requested_amount': '600000'},           # above online cap
            {'requested_amount': '5000'},             # below product minimum
            {'term': 24},                             # above max term
            {'repayment_frequency': 'daily'},         # not allowed
            {'date_of_birth': str(date.today().replace(year=date.today().year - 16))},
            {'nin': '123'},
            {'consent_credit_check': False},
            {'phone_primary': '12345'},
        ]
        for over in cases:
            res = self.c.post('/api/portal/applications/', application_payload(self.env, **over), format='json')
            self.assertEqual(res.status_code, 400, over)
        self.assertEqual(OnlineLoanApplication.objects.count(), 0)

    def test_cannot_target_other_tenant_branch_or_offering(self):
        beta = make_tenant('beta')
        for over in [{'branch': beta['branch'].pk}, {'offering': beta['offering'].pk}]:
            res = self.c.post('/api/portal/applications/', application_payload(self.env, **over), format='json')
            self.assertEqual(res.status_code, 400, over)

    def test_mass_assignment_ignored(self):
        payload = application_payload(self.env, status='converted', staff_notes='x',
                                      customer=999, tenant=999, reference='OLA-HACK')
        res = self.c.post('/api/portal/applications/', payload, format='json')
        self.assertEqual(res.status_code, 201)
        app = OnlineLoanApplication.objects.get()
        self.assertEqual(app.status, 'submitted')
        self.assertEqual(app.staff_notes, '')
        self.assertEqual(app.customer, self.customer)
        self.assertNotEqual(app.reference, 'OLA-HACK')

    def test_one_open_application_at_a_time(self):
        self.assertEqual(self.c.post('/api/portal/applications/', application_payload(self.env), format='json').status_code, 201)
        self.assertEqual(self.c.post('/api/portal/applications/', application_payload(self.env), format='json').status_code, 400)

    def test_cannot_read_or_withdraw_someone_elses_application(self):
        self.c.post('/api/portal/applications/', application_payload(self.env), format='json')
        ref = OnlineLoanApplication.objects.get().reference
        make_customer(self.env, email='eve@example.com')
        eve = portal_client('alpha')
        login(eve, email='eve@example.com')
        self.assertEqual(eve.get(f'/api/portal/applications/{ref}/').status_code, 404)
        self.assertEqual(eve.post(f'/api/portal/applications/{ref}/withdraw/').status_code, 404)
        self.assertEqual(eve.get('/api/portal/applications/').json(), [])
        self.assertEqual(OnlineLoanApplication.objects.get().status, 'submitted')

    def test_withdraw(self):
        ref = self.c.post('/api/portal/applications/', application_payload(self.env), format='json').json()['reference']
        res = self.c.post(f'/api/portal/applications/{ref}/withdraw/')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()['status'], 'withdrawn')

    def test_responses_not_cacheable(self):
        res = self.c.get('/api/portal/applications/')
        self.assertEqual(res['Cache-Control'], 'no-store')


class StaffReviewTests(PortalTestCase):
    def setUp(self):
        super().setUp()
        customer = make_customer(self.env)
        c = portal_client('alpha')
        login(c)
        self.assertEqual(c.post('/api/portal/applications/', application_payload(self.env), format='json').status_code, 201)
        self.app = OnlineLoanApplication.objects.get()
        self.customer = customer
        self.staff = APIClient()
        self.staff.force_authenticate(self.env['owner'])  # tenant owner = full permissions

    def url(self, suffix=''):
        return f'/api/portal/staff/applications/{self.app.pk}/{suffix}'

    def _staff(self, username, *, tenant=True, policies=False):
        from users.models import Role
        u = User.objects.create_user(username=username, password='x' * 12)
        if tenant:
            u.tenant = self.env['tenant']
            u.branch = self.env['branch']
        u.save()
        role = Role.objects.create(name=f'Role {username}', tenant=self.env['tenant'])
        u.roles.add(role)
        return u, role

    def test_legacy_mode_role_can_review_but_not_decide(self):
        """
        Roles with no permission policies run in "legacy mode": view/create/edit
        allowed, approve denied. The generic HasActionPermission maps POST
        /convert/ to can_create, so only the explicit can_approve check here
        stops such a user from accepting applications.
        """
        officer, _ = self._staff('officer')
        s = APIClient()
        s.force_authenticate(officer)
        self.assertEqual(s.get('/api/portal/staff/applications/').status_code, 200)
        self.assertEqual(s.post(self.url('start-review/')).status_code, 200)
        self.assertEqual(s.post(self.url('convert/'), {'create_new_client': True}, format='json').status_code, 403)
        self.assertEqual(s.post(self.url('reject/'), {'customer_message': 'no'}, format='json').status_code, 403)
        self.assertEqual(OnlineLoanApplication.objects.get().status, 'under_review')
        self.assertEqual(LoanAccount.objects.count(), 0)

    def test_staff_user_without_tenant_sees_nothing(self):
        # The generic scoping skips the tenant filter when user.tenant is None;
        # this viewset must fail closed instead of showing every organisation.
        orphan, _ = self._staff('orphan', tenant=False)
        s = APIClient()
        s.force_authenticate(orphan)
        res = s.get('/api/portal/staff/applications/')
        rows = res.json().get('results', res.json()) if res.status_code == 200 else []
        self.assertEqual(rows, [])
        self.assertIn(s.get(self.url()).status_code, (403, 404))

    def test_staff_without_permission_is_denied(self):
        clerk, role = self._staff('clerk')
        # Give the role a policy elsewhere so it is not in "legacy allow" mode.
        from permissions.models import RolePermissionPolicy
        from pages.models import Module
        module, _ = Module.objects.get_or_create(code='hr', defaults={'name': 'HR'})
        RolePermissionPolicy.objects.create(role=role, module=module, can_view=True)
        s = APIClient()
        s.force_authenticate(clerk)
        self.assertEqual(s.post(self.url('convert/'), {'create_new_client': True}, format='json').status_code, 403)
        self.assertEqual(s.post(self.url('reject/'), {'customer_message': 'no'}, format='json').status_code, 403)
        self.assertEqual(OnlineLoanApplication.objects.get().status, 'submitted')

    def test_other_tenant_staff_cannot_see_application(self):
        beta = make_tenant('beta')
        s = APIClient()
        s.force_authenticate(beta['owner'])
        self.assertEqual(s.get('/api/portal/staff/applications/').json().get('results', []), [])
        self.assertEqual(s.get(self.url()).status_code, 404)
        self.assertEqual(s.post(self.url('convert/'), {'create_new_client': True}, format='json').status_code, 404)

    def test_staff_cannot_create_or_edit_via_api(self):
        # Refused either by the explicit permission map (403) or the method guard (405).
        self.assertIn(self.staff.post('/api/portal/staff/applications/', {}, format='json').status_code, (403, 405))
        self.assertIn(self.staff.patch(self.url(), {'status': 'converted'}, format='json').status_code, (403, 405))
        self.assertIn(self.staff.delete(self.url()).status_code, (403, 405))
        self.assertEqual(OnlineLoanApplication.objects.get().status, 'submitted')

    def test_reject_shows_message_to_customer(self):
        res = self.staff.post(self.url('reject/'), {'customer_message': 'Income too low', 'staff_notes': 'internal'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        c = portal_client('alpha')
        login(c)
        body = c.get(f'/api/portal/applications/{self.app.reference}/').json()
        self.assertEqual(body['status'], 'rejected')
        self.assertEqual(body['customer_message'], 'Income too low')
        self.assertNotIn('internal', str(body))

    def test_convert_creates_client_and_pending_loan(self):
        self.assertEqual(self.staff.post(self.url('start-review/')).status_code, 200)
        res = self.staff.post(self.url('convert/'), {'create_new_client': False}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        app = OnlineLoanApplication.objects.get()
        self.assertEqual(app.status, 'converted')
        loan = app.converted_loan
        self.assertEqual(loan.status, 'pending')            # still needs normal approval
        self.assertEqual(loan.requested_amount, Decimal('150000'))
        self.assertEqual(loan.branch, self.env['branch'])
        client = app.converted_client
        self.assertEqual(client.nin, '12345678901')
        self.assertEqual(client.kyc_status, 'pending')
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.client, client)
        # Cannot convert twice.
        self.assertEqual(self.staff.post(self.url('convert/'), {}, format='json').status_code, 400)

    def test_convert_refuses_to_silently_link_matching_nin(self):
        set_current_tenant(self.env['tenant'])
        existing = Client.objects.create(
            first_name='Real', last_name='Person', gender='female', phone_primary='08000000000',
            nin='12345678901', tenant=self.env['tenant'], branch=self.env['branch'], owner=self.env['owner'],
        )
        set_current_tenant(None)
        res = self.staff.post(self.url('convert/'), {'create_new_client': True}, format='json')
        self.assertEqual(res.status_code, 409)
        self.assertEqual(res.json()['matches'][0]['matched_on'], ['nin'])
        self.assertEqual(LoanAccount.objects.count(), 0)
        # Explicit link after staff confirm identity.
        res = self.staff.post(self.url('convert/'), {'client_id': existing.pk}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(OnlineLoanApplication.objects.get().converted_client, existing)

    def test_convert_cannot_link_client_from_other_tenant(self):
        beta = make_tenant('beta')
        set_current_tenant(beta['tenant'])
        foreign = Client.objects.create(
            first_name='X', last_name='Y', gender='male', phone_primary='08011111111',
            tenant=beta['tenant'], branch=beta['branch'], owner=beta['owner'],
        )
        set_current_tenant(None)
        res = self.staff.post(self.url('convert/'), {'client_id': foreign.pk}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(LoanAccount.objects.count(), 0)

    def test_staff_detail_has_full_identifiers_list_does_not(self):
        detail = self.staff.get(self.url()).json()
        self.assertEqual(detail['nin'], '12345678901')
        listing = self.staff.get('/api/portal/staff/applications/').json()
        rows = listing.get('results', listing)
        self.assertNotIn('nin', rows[0])


class ErrorLeakTests(PortalTestCase):
    def test_unexpected_errors_do_not_leak_internals(self):
        from unittest import mock
        make_customer(self.env)
        c = portal_client('alpha')
        from django.db import DatabaseError
        # The project-wide handler echoes DatabaseError text back to the caller.
        with mock.patch('portal.services.authenticate_customer',
                        side_effect=DatabaseError('relation "portal_secret" password=hunter2')):
            res = login(c)
        self.assertEqual(res.status_code, 500)
        self.assertNotIn('hunter2', res.content.decode())
        self.assertNotIn('portal_secret', res.content.decode())


class ApplicationDocumentTests(PortalTestCase):
    PDF = b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'

    def setUp(self):
        super().setUp()
        import tempfile
        self.media = tempfile.mkdtemp()
        self._ov = override_settings(MEDIA_ROOT=self.media)
        self._ov.enable()
        self.customer = make_customer(self.env)
        self.c = portal_client('alpha')
        login(self.c)
        self.ref = self.c.post('/api/portal/applications/', application_payload(self.env), format='json').json()['reference']
        self.app = OnlineLoanApplication.objects.get()
        self.staff = APIClient()
        self.staff.force_authenticate(self.env['owner'])

    def tearDown(self):
        import shutil
        self._ov.disable()
        shutil.rmtree(self.media, ignore_errors=True)
        super().tearDown()

    def upload(self, client=None, name='id.pdf', data=None, ctype='application/pdf', ref=None, **extra):
        from django.core.files.uploadedfile import SimpleUploadedFile
        return (client or self.c).post(
            f'/api/portal/applications/{ref or self.ref}/documents/',
            {'document_type': 'id_card', 'file': SimpleUploadedFile(name, data or self.PDF, content_type=ctype)},
            format='multipart', **extra,
        )

    def test_upload_private_and_staff_download_audited(self):
        from pathlib import Path
        from portal.models import OnlineApplicationDocument
        res = self.upload()
        self.assertEqual(res.status_code, 201, res.content)
        self.assertNotIn('download', res.json())          # customers get metadata only
        doc = OnlineApplicationDocument.objects.get()
        self.assertTrue((Path(self.media) / 'private' / doc.file.name).is_file())
        self.assertEqual(APIClient().get(f'/media/private/{doc.file.name}').status_code, 404)
        detail = self.staff.get(f'/api/portal/staff/applications/{self.app.pk}/').json()
        path = detail['documents'][0]['download']
        dl = self.staff.get(f'/api{path}')
        self.assertEqual(dl.status_code, 200)
        self.assertEqual(b''.join(dl.streaming_content), self.PDF)
        self.assertTrue(PortalAuditEvent.objects.filter(event='document_viewed').exists())
        # The customer's cookie cannot use the staff download endpoint.
        self.assertIn(self.c.get(f'/api{path}').status_code, (401, 403))

    def test_image_reencoded_and_exif_stripped(self):
        import io
        from PIL import Image
        from portal.models import OnlineApplicationDocument
        img = Image.new('RGB', (300, 200), (10, 20, 30))
        exif = img.getexif()
        exif[0x8825] = {2: (6, 30, 0)}  # GPSInfo
        exif[0x010F] = 'PhoneMaker'
        buf = io.BytesIO()
        img.save(buf, format='JPEG', exif=exif)
        res = self.upload(name='me.jpg', data=buf.getvalue(), ctype='image/jpeg')
        self.assertEqual(res.status_code, 201, res.content)
        stored = OnlineApplicationDocument.objects.get()
        with stored.file.open('rb') as fh:
            self.assertEqual(len(Image.open(fh).getexif()), 0)

    def test_content_and_size_checks(self):
        self.assertEqual(self.upload(name='id.pdf', data=b'<html>x</html>').status_code, 400)
        self.assertEqual(self.upload(name='id.docx', data=b'PK\x03\x04').status_code, 400)  # no Word from public
        big = self.upload(CONTENT_LENGTH=str(6 * 1024 * 1024))
        self.assertEqual(big.status_code, 413)

    def test_oversize_rejected_without_parsing_body(self):
        from rest_framework.request import Request
        with mock.patch.object(Request, 'data', new_callable=mock.PropertyMock,
                               side_effect=AssertionError('body was parsed')):
            res = self.upload(CONTENT_LENGTH=str(50 * 1024 * 1024))
        self.assertEqual(res.status_code, 413)

    def test_cannot_upload_to_someone_elses_application(self):
        make_customer(self.env, email='eve@example.com')
        eve = portal_client('alpha')
        login(eve, email='eve@example.com')
        self.assertEqual(self.upload(client=eve).status_code, 404)

    def test_limits_and_lifecycle(self):
        from portal.models import OnlineApplicationDocument
        for _ in range(10):
            self.assertEqual(self.upload().status_code, 201)
        self.assertEqual(self.upload().status_code, 400)
        doc = OnlineApplicationDocument.objects.first()
        self.assertEqual(self.c.delete(f'/api/portal/applications/{self.ref}/documents/{doc.pk}/').status_code, 204)
        # Once review starts, documents can't be removed; once closed, none can be added.
        self.staff.post(f'/api/portal/staff/applications/{self.app.pk}/start-review/')
        doc = OnlineApplicationDocument.objects.first()
        self.assertEqual(self.c.delete(f'/api/portal/applications/{self.ref}/documents/{doc.pk}/').status_code, 400)
        self.staff.post(f'/api/portal/staff/applications/{self.app.pk}/reject/', {'customer_message': 'no'}, format='json')
        self.assertEqual(self.upload().status_code, 400)

    def test_upload_requires_csrf_header(self):
        from django.core.files.uploadedfile import SimpleUploadedFile
        res = self.c.post(f'/api/portal/applications/{self.ref}/documents/',
                          {'document_type': 'id_card', 'file': SimpleUploadedFile('a.pdf', self.PDF)},
                          format='multipart', HTTP_X_PORTAL_REQUEST='0')
        self.assertEqual(res.status_code, 403)



class _InviteBase(PortalTestCase):
    def setUp(self):
        super().setUp()
        cfg = PortalConfig.objects.get(tenant=self.env['tenant'])
        cfg.allow_registration = False   # the production default
        cfg.save()
        set_current_tenant(self.env['tenant'])
        self.client_rec = Client.objects.create(
            first_name='Kemi', last_name='Bello', gender='female', phone_primary='08035550000',
            email='kemi@example.com', nin='12345678901',
            tenant=self.env['tenant'], branch=self.env['branch'], owner=self.env['owner'],
        )
        set_current_tenant(None)
        self.staff = APIClient()
        self.staff.force_authenticate(self.env['owner'])

    def invite(self, staff=None, email='kemi@example.com', client=None):
        return (staff or self.staff).post('/api/portal/staff/invitations/', {
            'client': (client or self.client_rec).pk, 'email': email,
        }, format='json')

    def token_from_mail(self):
        from urllib.parse import unquote
        m = re.search(r'/portal/accept-invite\?token=(\S+)', mail.outbox[-1].body)
        return unquote(m.group(1))

    def accept(self, token, client=None, password='Lagoon-Mango-4471'):
        return (client or portal_client('alpha')).post('/api/portal/auth/accept-invitation/', {
            'token': token, 'password': password, 'accept_terms': True,
        }, format='json')


class InvitationTests(_InviteBase):
    def test_new_configs_are_invite_only(self):
        self.assertFalse(PortalConfig(tenant=self.env['tenant']).allow_registration)
        res = portal_client('alpha').post('/api/portal/auth/register/', {
            'first_name': 'Eve', 'last_name': 'X', 'email': 'eve@example.com', 'phone': '08031234567',
            'password': STRONG_PW, 'accept_terms': True}, format='json')
        self.assertEqual(res.status_code, 403)
        self.assertFalse(PortalCustomer.objects.exists())

    def test_invite_accept_creates_linked_verified_account_and_signs_in(self):
        self.assertEqual(self.invite().status_code, 201)
        token = self.token_from_mail()
        from portal.models import PortalInvitation
        self.assertFalse(PortalInvitation.objects.filter(token_hash=token).exists())  # only the hash is stored
        c = portal_client('alpha')
        self.assertEqual(c.post('/api/portal/auth/invitation/', {'token': token}, format='json').json()['first_name'], 'Kemi')
        res = self.accept(token, client=c)
        self.assertEqual(res.status_code, 201, res.content)
        cust = PortalCustomer.objects.get()
        self.assertEqual(cust.client, self.client_rec)
        self.assertTrue(cust.is_email_verified)
        self.assertEqual(c.get('/api/portal/me/').status_code, 200)   # signed in by the cookie
        # Single use.
        self.assertEqual(self.accept(token).status_code, 400)
        # Status visible to staff.
        body = self.staff.get(f'/api/portal/staff/invitations/for-client/?client={self.client_rec.pk}').json()
        self.assertEqual(body['account']['email'], 'kemi@example.com')
        self.assertEqual(body['invitations'][0]['status'], 'accepted')

    def test_expired_revoked_and_superseded_invites_fail(self):
        from portal.models import PortalInvitation
        self.invite()
        first = self.token_from_mail()
        self.invite()                                  # supersedes the first
        second = self.token_from_mail()
        self.assertEqual(self.accept(first).status_code, 400)
        inv = PortalInvitation.objects.get(revoked_at__isnull=True)
        inv.expires_at = timezone.now() - timedelta(minutes=1)
        inv.save()
        self.assertEqual(self.accept(second).status_code, 400)
        self.invite()
        third = self.token_from_mail()
        inv = PortalInvitation.objects.get(revoked_at__isnull=True, expires_at__gt=timezone.now())
        self.assertEqual(self.staff.post(f'/api/portal/staff/invitations/{inv.pk}/revoke/').status_code, 200)
        self.assertEqual(self.accept(third).status_code, 400)
        self.assertFalse(PortalCustomer.objects.exists())

    def test_token_is_bound_to_tenant(self):
        make_tenant('beta')
        self.invite()
        token = self.token_from_mail()
        self.assertEqual(self.accept(token, client=portal_client('beta')).status_code, 400)

    def test_weak_password_rejected_on_accept(self):
        self.invite()
        res = self.accept(self.token_from_mail(), password='password1')
        self.assertEqual(res.status_code, 400)
        self.assertIn('password', res.json())

    def test_staff_scope_for_invitations(self):
        beta = make_tenant('beta')
        other = APIClient()
        other.force_authenticate(beta['owner'])
        self.assertEqual(self.invite(staff=other).status_code, 400)       # other tenant's client: "not found"
        self.assertEqual(other.get(f'/api/portal/staff/invitations/for-client/?client={self.client_rec.pk}').status_code, 404)
        # Same tenant, different branch, not elevated.
        set_current_tenant(self.env['tenant'])
        b2 = Branch.objects.create(name='Oyo', code='OYO2', tenant=self.env['tenant'], owner=self.env['owner'])
        set_current_tenant(None)
        clerk = User.objects.create_user(username='b2clerk', password='x' * 12)
        clerk.tenant, clerk.branch = self.env['tenant'], b2
        clerk.save()
        from users.models import Role
        clerk.roles.add(Role.objects.create(name='Clerk', tenant=self.env['tenant']))
        c = APIClient()
        c.force_authenticate(clerk)
        self.assertEqual(self.invite(staff=c).status_code, 400)
        self.assertEqual(len(mail.outbox), 0)

    def test_cannot_invite_when_account_exists(self):
        self.invite()
        self.accept(self.token_from_mail())
        self.assertEqual(self.invite().status_code, 400)

    def test_convert_uses_linked_client_without_nin_conflict(self):
        self.invite()
        c = portal_client('alpha')
        self.accept(self.token_from_mail(), client=c)
        # Same NIN as the existing client: an un-invited applicant would get a 409.
        res = c.post('/api/portal/applications/', application_payload(self.env, nin='12345678901'), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        app = OnlineLoanApplication.objects.get()
        res = self.staff.post(f'/api/portal/staff/applications/{app.pk}/convert/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        app.refresh_from_db()
        self.assertEqual(app.converted_client, self.client_rec)
        self.assertEqual(Client.objects.count(), 1)   # no duplicate client created


class EmailFailureTests(_InviteBase):
    """Staff must learn when an invitation didn't go out; customers must not learn anything."""

    def _fail_mail(self):
        import smtplib
        return mock.patch('portal.services.send_mail', side_effect=smtplib.SMTPAuthenticationError(535, b'bad creds'))

    def test_invite_reports_failure_and_leaves_no_live_link(self):
        from portal.models import PortalInvitation
        with self._fail_mail():
            res = self.invite()
        self.assertEqual(res.status_code, 400)
        self.assertIn('could not be sent', str(res.json()))
        self.assertFalse(PortalInvitation.objects.filter(revoked_at__isnull=True, accepted_at__isnull=True).exists())

    def test_customer_flows_stay_generic_when_mail_fails(self):
        cfg = PortalConfig.objects.get(tenant=self.env['tenant'])
        cfg.allow_registration = True
        cfg.save()
        c = portal_client('alpha')
        ok = c.post('/api/portal/auth/password-reset/', {'email': 'ghost@example.com'}, format='json')
        with self._fail_mail():
            res = c.post('/api/portal/auth/register/', {
                'first_name': 'Ada', 'last_name': 'Obi', 'email': 'ada2@example.com', 'phone': '08031234567',
                'password': STRONG_PW, 'accept_terms': True}, format='json')
            reset = c.post('/api/portal/auth/password-reset/', {'email': 'ada2@example.com'}, format='json')
        self.assertEqual(res.status_code, 201)
        self.assertEqual(reset.json(), ok.json())


class DirectorSettingsTests(PortalTestCase):
    URL = '/api/portal/staff/settings/'

    def setUp(self):
        super().setUp()
        self.director = APIClient()
        self.director.force_authenticate(self.env['owner'])   # tenant owner = director

    def body(self, **over):
        b = {'is_enabled': True, 'allow_registration': False, 'max_open_applications': 1,
             'public_url': 'https://erp.example.ng', 'support_phone': '0700', 'support_email': 'help@example.ng',
             'terms_url': 'https://example.ng/terms', 'privacy_url': 'https://example.ng/privacy'}
        b.update(over)
        return b

    def test_non_director_staff_cannot_view_or_change(self):
        from users.models import Role
        officer = User.objects.create_user(username='officer2', password='x' * 12)
        officer.tenant, officer.branch = self.env['tenant'], self.env['branch']
        officer.save()
        officer.roles.add(Role.objects.create(name='Officer', tenant=self.env['tenant']))  # branch-scoped role
        c = APIClient()
        c.force_authenticate(officer)
        self.assertEqual(c.get(self.URL).status_code, 403)
        self.assertEqual(c.put(self.URL, self.body(is_enabled=False), format='json').status_code, 403)
        self.assertTrue(PortalConfig.objects.get(tenant=self.env['tenant']).is_enabled)
        # A customer session is no use either.
        make_customer(self.env)
        cust = portal_client('alpha')
        login(cust)
        self.assertIn(cust.get(self.URL).status_code, (401, 403))

    def test_director_updates_settings_and_it_is_audited(self):
        res = self.director.put(self.URL, self.body(allow_registration=True, support_phone='0800 123'), format='json')
        self.assertEqual(res.status_code, 200, res.content)
        cfg = PortalConfig.objects.get(tenant=self.env['tenant'])
        self.assertTrue(cfg.allow_registration)
        self.assertEqual(cfg.public_url, 'https://erp.example.ng')
        self.assertTrue(PortalAuditEvent.objects.filter(event='settings_changed').exists())
        # Emails now use the configured address.
        from portal.services import _frontend_url
        self.assertEqual(_frontend_url('/portal/login', self.env['tenant']), 'https://erp.example.ng/portal/login')

    def test_settings_validation(self):
        for over in [{'public_url': 'http://evil.example'}, {'public_url': 'https://x.ng/path?q=1'},
                     {'max_open_applications': 0}, {'support_email': 'nope'}]:
            self.assertEqual(self.director.put(self.URL, self.body(**over), format='json').status_code, 400, over)

    def test_settings_isolated_per_tenant(self):
        beta = make_tenant('beta')
        other = APIClient()
        other.force_authenticate(beta['owner'])
        other.put(self.URL, self.body(is_enabled=False, public_url='https://beta.example.ng'), format='json')
        self.assertTrue(PortalConfig.objects.get(tenant=self.env['tenant']).is_enabled)
        names = [p['name'] for p in other.get(self.URL).json()['products']]
        self.assertEqual(names, ['Business Loan'])   # beta's own product only, not alpha's
        res = other.post(self.URL + 'offerings/', {'loan_product': self.env['product'].pk}, format='json')
        self.assertEqual(res.status_code, 400)       # can't offer another organisation's product

    def test_offer_and_stop_offering_a_product(self):
        pid = self.env['product'].pk
        off = self.env['offering']
        res = self.director.post(self.URL + 'offerings/', {
            'loan_product': pid, 'is_active': True, 'display_name': 'SME Loan', 'max_online_amount': '200000'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        off.refresh_from_db()
        self.assertEqual(off.display_name, 'SME Loan')
        self.assertEqual(portal_client('alpha').get('/api/portal/products/').json()[0]['name'], 'SME Loan')
        bad = self.director.post(self.URL + 'offerings/', {'loan_product': pid, 'max_online_amount': '5'}, format='json')
        self.assertEqual(bad.status_code, 400)       # below product minimum
        self.assertEqual(self.director.post(self.URL + f'offerings/{off.pk}/remove/').status_code, 200)
        self.assertEqual(portal_client('alpha').get('/api/portal/products/').json(), [])



class BalancesAndWithdrawalTests(PortalTestCase):
    def setUp(self):
        super().setUp()
        from savings.models import SavingsAccount
        t, o, b = self.env['tenant'], self.env['owner'], self.env['branch']
        set_current_tenant(t)

        def gl(name, code, level=Account.LEVEL_PARENT, parent=None, balance='0'):
            acc = Account.objects.create(name=name, code=code, account_type=Account.SAVINGS, account_level=level,
                                         parent=parent, owner=o, created_by=o, branch=b, tenant=t)
            # Test-only seeding: the ledger forbids balance edits through save()
            # (they must come from posted transactions); queryset.update bypasses it.
            Account.objects.filter(pk=acc.pk).update(balance=Decimal(balance))
            acc.refresh_from_db()
            return acc
        parent = gl('Savings', '2100')
        self.sav_product = Product.objects.create(name='Regular Savings', code='SAV-R', product_type='SAVINGS',
                                                  owner=o, branch=b, tenant=t)
        self.client_rec = Client.objects.create(first_name='Kemi', last_name='Bello', gender='female',
                                                phone_primary='08035550000', tenant=t, branch=b, owner=o)
        self.other_client = Client.objects.create(first_name='Other', last_name='Person', gender='male',
                                                  phone_primary='08035550001', tenant=t, branch=b, owner=o)

        def sav(client, number, code, balance):
            return SavingsAccount.objects.create(
                client=client, account=gl(f'{number}', code, Account.LEVEL_CHILD, parent, balance),
                product=self.sav_product, account_number=number, interest_rate=Decimal('0'),
                interest_calculation_method='monthly', minimum_balance=Decimal('1000'),
                opened_on=date.today(), status='active', owner=o, branch=b, tenant=t)
        self.mine = sav(self.client_rec, 'SAV-0001', '2101', '50000')
        self.theirs = sav(self.other_client, 'SAV-0002', '2102', '90000')
        set_current_tenant(None)

        self.customer = make_customer(self.env)
        self.customer.client = self.client_rec
        self.customer.save()
        self.c = portal_client('alpha')
        login(self.c)
        self.staff = APIClient()
        self.staff.force_authenticate(self.env['owner'])

    def request_withdrawal(self, client=None, account=None, amount='10000'):
        return (client or self.c).post('/api/portal/withdrawals/', {
            'savings_account': (account or self.mine).pk, 'amount': amount, 'payout_preference': 'bank',
            'reason': 'School fees'}, format='json')

    def test_balances_show_only_own_accounts(self):
        body = self.c.get('/api/portal/me/accounts/').json()
        self.assertTrue(body['linked'])
        self.assertEqual([s['account_number'] for s in body['savings']], ['SAV-0001'])
        s = body['savings'][0]
        self.assertEqual(Decimal(str(s['balance'])), Decimal('50000.00'))
        self.assertEqual(Decimal(str(s['withdrawable'])), Decimal('49000.00'))  # minus compulsory minimum

    def test_unlinked_customer_sees_nothing_and_cannot_withdraw(self):
        make_customer(self.env, email='new@example.com')
        c = portal_client('alpha')
        login(c, email='new@example.com')
        self.assertEqual(c.get('/api/portal/me/accounts/').json(), {'linked': False, 'loans': [], 'savings': []})
        self.assertEqual(self.request_withdrawal(client=c).status_code, 400)

    def test_cannot_withdraw_from_someone_elses_account_or_over_balance(self):
        from portal.models import OnlineWithdrawalRequest
        self.assertEqual(self.request_withdrawal(account=self.theirs).status_code, 400)
        self.assertEqual(self.request_withdrawal(amount='49000.01').status_code, 400)
        self.assertFalse(OnlineWithdrawalRequest.objects.exists())

    def test_request_cancel_and_one_open_per_account(self):
        res = self.request_withdrawal()
        self.assertEqual(res.status_code, 201, res.content)
        ref = res.json()['reference']
        self.assertEqual(self.request_withdrawal().status_code, 400)       # already one waiting
        self.assertEqual(self.c.post(f'/api/portal/withdrawals/{ref}/cancel/').status_code, 200)
        self.assertEqual(self.request_withdrawal().status_code, 201)

    def test_withdrawal_requires_csrf_header(self):
        res = self.c.post('/api/portal/withdrawals/', {'savings_account': self.mine.pk, 'amount': '100',
                                                        'payout_preference': 'bank'},
                          format='json', HTTP_X_PORTAL_REQUEST='0')
        self.assertEqual(res.status_code, 403)

    def test_staff_forward_goes_through_existing_workflow(self):
        from savings.models import SavingsWithdrawalRequest
        ref = self.request_withdrawal().json()['reference']
        from portal.models import OnlineWithdrawalRequest
        wr = OnlineWithdrawalRequest.objects.get(reference=ref)
        res = self.staff.post(f'/api/portal/staff/withdrawals/{wr.pk}/forward/', {}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        real = SavingsWithdrawalRequest.objects.get()
        self.assertEqual(real.status, 'pending')                     # approvals still required
        self.assertEqual(real.requested_by, self.env['owner'])
        self.assertEqual(real.amount, Decimal('10000.00'))
        self.assertEqual(real.client_requested_on, wr.submitted_at.date())
        # No money has moved.
        self.mine.account.refresh_from_db()
        self.assertEqual(self.mine.account.balance, Decimal('50000.00'))
        mine = self.c.get('/api/portal/withdrawals/').json()[0]
        self.assertEqual(mine['status_display'], 'Awaiting approval')
        self.assertFalse(mine['can_cancel'])
        # Can't forward twice.
        self.assertEqual(self.staff.post(f'/api/portal/staff/withdrawals/{wr.pk}/forward/', {}, format='json').status_code, 400)

    def test_account_manager_rule_is_respected(self):
        from savings.models import SavingsProduct, SavingsWithdrawalRequest
        from portal.models import OnlineWithdrawalRequest
        set_current_tenant(self.env['tenant'])
        SavingsProduct.objects.create(product=self.sav_product, only_account_manager_can_withdraw=True,
                                      owner=self.env['owner'], branch=self.env['branch'], tenant=self.env['tenant'])
        set_current_tenant(None)
        ref = self.request_withdrawal().json()['reference']
        wr = OnlineWithdrawalRequest.objects.get(reference=ref)
        res = self.staff.post(f'/api/portal/staff/withdrawals/{wr.pk}/forward/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('account manager', str(res.json()).lower())
        self.assertFalse(SavingsWithdrawalRequest.objects.exists())
        wr.refresh_from_db()
        self.assertEqual(wr.status, 'submitted')

    def test_decline_needs_message_and_customer_sees_it(self):
        from portal.models import OnlineWithdrawalRequest
        ref = self.request_withdrawal().json()['reference']
        wr = OnlineWithdrawalRequest.objects.get(reference=ref)
        self.assertEqual(self.staff.post(f'/api/portal/staff/withdrawals/{wr.pk}/decline/', {}, format='json').status_code, 400)
        res = self.staff.post(f'/api/portal/staff/withdrawals/{wr.pk}/decline/',
                              {'customer_message': 'Please visit the branch with your ID.', 'staff_notes': 'internal'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        mine = self.c.get('/api/portal/withdrawals/').json()[0]
        self.assertEqual(mine['status'], 'declined')
        self.assertEqual(mine['customer_message'], 'Please visit the branch with your ID.')
        self.assertNotIn('internal', str(mine))

    def test_staff_scope(self):
        from portal.models import OnlineWithdrawalRequest
        ref = self.request_withdrawal().json()['reference']
        wr = OnlineWithdrawalRequest.objects.get(reference=ref)
        beta = make_tenant('beta')
        other = APIClient()
        other.force_authenticate(beta['owner'])
        self.assertEqual(other.post(f'/api/portal/staff/withdrawals/{wr.pk}/forward/', {}, format='json').status_code, 404)
        # Portal cookie can't reach the staff endpoint.
        self.assertIn(self.c.get('/api/portal/staff/withdrawals/').status_code, (401, 403))


class ProductionDomainResolutionTests(PortalTestCase):
    """
    Production: the customer is on erp.krystartrust.ng and the browser calls
    the API on api.kti.krystartrust.ng with no tenant header. The middleware
    can't tell the organisation from that host; the portal must use the web
    address the director configured.
    """
    API_HOST = 'api.kti.krystartrust.ng'
    SITE = 'https://erp.krystartrust.ng'

    def setUp(self):
        super().setUp()
        cfg = PortalConfig.objects.get(tenant=self.env['tenant'])
        cfg.public_url = self.SITE
        cfg.save()

    def browser(self, origin=None):
        c = APIClient()
        c.defaults['HTTP_HOST'] = self.API_HOST
        c.defaults['HTTP_ORIGIN'] = origin or self.SITE
        c.defaults['HTTP_X_PORTAL_REQUEST'] = '1'
        return c

    def test_portal_found_from_configured_web_address(self):
        res = self.browser().get('/api/portal/info/')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['organisation'], self.env['tenant'].name)

    def test_not_found_without_configured_address(self):
        PortalConfig.objects.filter(tenant=self.env['tenant']).update(public_url='')
        self.assertEqual(self.browser().get('/api/portal/info/').status_code, 404)

    def test_sign_in_and_session_work_through_api_host(self):
        make_customer(self.env)
        c = self.browser()
        self.assertEqual(login(c).status_code, 200)
        self.assertEqual(c.get('/api/portal/me/').status_code, 200)

    def test_session_bound_to_its_organisation_even_with_other_origin(self):
        beta = make_tenant('beta')
        PortalConfig.objects.filter(tenant=beta['tenant']).update(public_url='https://beta.example.ng')
        make_customer(self.env)
        c = self.browser()
        login(c)
        c.defaults['HTTP_ORIGIN'] = 'https://beta.example.ng'   # spoofed / other org's site
        self.assertEqual(c.get('/api/portal/me/').status_code, 401)

    def test_two_organisations_cannot_claim_the_same_address(self):
        beta = make_tenant('beta')
        d = APIClient()
        d.force_authenticate(beta['owner'])
        res = d.put('/api/portal/staff/settings/', {
            'is_enabled': True, 'allow_registration': False, 'max_open_applications': 1,
            'public_url': self.SITE, 'support_phone': '', 'support_email': '', 'terms_url': '', 'privacy_url': '',
        }, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('Another organisation', str(res.json()))

    def test_accept_invitation_through_api_host(self):
        set_current_tenant(self.env['tenant'])
        client_rec = Client.objects.create(first_name='Kemi', last_name='Bello', gender='female',
                                           phone_primary='08035550000', tenant=self.env['tenant'],
                                           branch=self.env['branch'], owner=self.env['owner'])
        set_current_tenant(None)
        staff = APIClient()
        staff.force_authenticate(self.env['owner'])
        self.assertEqual(staff.post('/api/portal/staff/invitations/', {'client': client_rec.pk, 'email': 'kemi@example.com'},
                                    format='json').status_code, 201)
        from urllib.parse import unquote
        token = unquote(re.search(r'/portal/accept-invite\?token=(\S+)', mail.outbox[-1].body).group(1))
        self.assertIn(self.SITE + '/portal/accept-invite', mail.outbox[-1].body)
        c = self.browser()
        self.assertEqual(c.post('/api/portal/auth/invitation/', {'token': token}, format='json').status_code, 200)
        res = c.post('/api/portal/auth/accept-invitation/', {'token': token, 'password': 'Lagoon-Mango-4471',
                                                              'accept_terms': True}, format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(c.get('/api/portal/me/').status_code, 200)


class OfferingProductScopeTests(PortalTestCase):
    """Settings and the public list use the same product visibility as the ERP."""

    def setUp(self):
        super().setUp()
        self.director = APIClient()
        self.director.force_authenticate(self.env['owner'])

    def test_offering_a_product_from_settings_lists_it_publicly(self):
        PortalLoanOffering.objects.all().delete()
        self.assertEqual(portal_client('alpha').get('/api/portal/products/').json(), [])
        pid = self.env['product'].pk
        res = self.director.post('/api/portal/staff/settings/offerings/', {'loan_product': pid, 'is_active': True}, format='json')
        self.assertEqual(res.status_code, 200, res.content)
        names = [o['name'] for o in portal_client('alpha').get('/api/portal/products/').json()]
        self.assertEqual(names, ['Business Loan'])

    def test_settings_lists_the_directors_erp_products(self):
        names = [p['name'] for p in self.director.get('/api/portal/staff/settings/').json()['products']]
        self.assertEqual(names, ['Business Loan'])

    def test_other_tenants_product_never_listed(self):
        beta = make_tenant('beta')
        # Even a hand-made offering pointing at beta's product stays invisible to alpha.
        PortalLoanOffering.objects.create(tenant=self.env['tenant'], loan_product=beta['product'])
        names = [o['name'] for o in portal_client('alpha').get('/api/portal/products/').json()]
        self.assertEqual(names.count('Business Loan'), 1)   # alpha's own only


class OfficerVisibilityAndNotificationTests(PortalTestCase):
    """Credit officers can pick up new applications; staff get bell notifications."""

    def setUp(self):
        super().setUp()
        from users.models import Role
        from permissions.models import RolePermissionPolicy
        from pages.models import Module, ModulePage
        t, b, o = self.env['tenant'], self.env['branch'], self.env['owner']
        module, _ = Module.all_objects.get_or_create(code='loans', defaults={'name': 'Loans'})
        page, _ = ModulePage.all_objects.get_or_create(
            module=module, code='online-loan-applications',
            defaults={'title': 'Online Applications', 'url_path': '/loans/online-loan-applications/'})
        role = Role.objects.create(name='Credit Officer', tenant=t)
        RolePermissionPolicy.objects.create(role=role, page=page, can_view=True, can_edit=True,
                                            scope='assigned_clients')
        self.officer = User.objects.create_user(username='co1', password='x' * 12)
        self.officer.tenant, self.officer.branch = t, b
        self.officer.save()
        self.officer.roles.add(role)
        self.officer_api = APIClient()
        self.officer_api.force_authenticate(self.officer)

        make_customer(self.env)
        self.c = portal_client('alpha')
        login(self.c)

    def submit(self):
        with self.captureOnCommitCallbacks(execute=True):
            res = self.c.post('/api/portal/applications/', application_payload(self.env), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        return OnlineLoanApplication.objects.get(reference=res.json()['reference'])

    def officer_rows(self):
        res = self.officer_api.get('/api/portal/staff/applications/')
        self.assertEqual(res.status_code, 200, res.content)
        body = res.json()
        return [r['reference'] for r in body.get('results', body)]

    def test_narrow_scope_officer_sees_unassigned_and_can_pick_up(self):
        app = self.submit()
        self.assertEqual(self.officer_rows(), [app.reference])
        res = self.officer_api.post(f'/api/portal/staff/applications/{app.pk}/start-review/')
        self.assertEqual(res.status_code, 200, res.content)
        app.refresh_from_db()
        self.assertEqual(app.assigned_to, self.officer)
        self.assertEqual(self.officer_rows(), [app.reference])

    def test_application_taken_by_someone_else_is_hidden_from_officer(self):
        app = self.submit()
        director = APIClient()
        director.force_authenticate(self.env['owner'])
        director.post(f'/api/portal/staff/applications/{app.pk}/start-review/')
        self.assertEqual(self.officer_rows(), [])

    def test_other_branch_applications_stay_hidden(self):
        set_current_tenant(self.env['tenant'])
        b2 = Branch.objects.create(name='Ikeja', code='IKJ2', tenant=self.env['tenant'], owner=self.env['owner'])
        set_current_tenant(None)
        with self.captureOnCommitCallbacks(execute=True):
            self.c.post('/api/portal/applications/', application_payload(self.env, branch=b2.pk), format='json')
        self.assertEqual(self.officer_rows(), [])

    def test_branch_staff_get_notified_of_new_application(self):
        from notifications.models import Notification
        app = self.submit()
        notes = Notification.objects.filter(recipient_user=self.officer)
        self.assertEqual(notes.count(), 1)
        n = notes.get()
        self.assertIn(app.reference, n.message)
        self.assertNotIn(app.nin, n.message)       # no identity numbers in notifications
        self.assertNotIn(app.bvn, n.message)

    def test_staff_without_page_access_not_notified(self):
        from notifications.models import Notification
        from users.models import Role
        from permissions.models import RolePermissionPolicy
        from pages.models import Module
        teller = User.objects.create_user(username='teller1', password='x' * 12)
        teller.tenant, teller.branch = self.env['tenant'], self.env['branch']
        teller.save()
        role = Role.objects.create(name='Teller', tenant=self.env['tenant'])
        module, _ = Module.all_objects.get_or_create(code='hr', defaults={'name': 'HR'})
        RolePermissionPolicy.objects.create(role=role, module=module, can_view=True)
        teller.roles.add(role)
        self.submit()
        self.assertFalse(Notification.objects.filter(recipient_user=teller).exists())

    def test_notification_failure_never_blocks_the_customer(self):
        with mock.patch('hr.notifications._create_notification', side_effect=RuntimeError('boom')):
            self.submit()   # still 201
