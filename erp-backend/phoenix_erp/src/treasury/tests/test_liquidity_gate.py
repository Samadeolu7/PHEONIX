from datetime import timedelta
from decimal import Decimal
from unittest import mock

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from common.managers import set_current_tenant
from treasury.models import LiquidityDecision
from treasury.services import gate
from treasury.tests.helpers import (
    make_bank_account,
    make_borrowing,
    make_env,
    make_pending_loan,
    set_balance,
)
from users.models import User

D = Decimal


class LiquidityGateTests(TestCase):
    def setUp(self):
        self.env = make_env("gate")
        self.director = self.env['owner']
        self.maker = self.env['maker']
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "2001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "2002")
        # Ikeja holds 1,000,000 but owes all of it back to HQ in two shares.
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=timezone.localdate() + timedelta(days=10))
        self.loan = make_pending_loan(self.env, self.env['ikeja'], amount='100000.00')

    def tearDown(self):
        set_current_tenant(None)

    # ── approval ────────────────────────────────────────────────────────────

    def test_non_director_is_blocked_with_explanation(self):
        r = gate.evaluate_approval(self.loan, self.maker)
        self.assertFalse(r.allowed)
        self.assertEqual(r.code, gate.CODE_BLOCKED)
        self.assertEqual(r.assessment['available_today'], D('0.00'))
        self.assertEqual(r.assessment['shortfall_today'], D('100000.00'))
        self.assertTrue(r.assessment['breaches'])
        self.assertIn('Share of First Bank', r.message)
        self.assertIn('director can override', r.message)

    def test_director_must_give_a_reason(self):
        for reason in ('', '   ', None):
            r = gate.evaluate_approval(self.loan, self.director, reason)
            self.assertFalse(r.allowed)
            self.assertEqual(r.code, gate.CODE_OVERRIDE_REQUIRED)

    def test_director_override_with_reason_is_allowed_and_recorded(self):
        r = gate.evaluate_approval(self.loan, self.director, 'Client is a government salary earner')
        self.assertTrue(r.allowed)
        self.assertEqual(r.outcome, LiquidityDecision.OUTCOME_OVERRIDDEN)
        decision = gate.record_decision(
            self.loan, LiquidityDecision.STAGE_APPROVAL, r.outcome, self.director, r.reason, r.assessment)
        self.assertEqual(decision.reason, 'Client is a government salary earner')
        self.assertEqual(decision.available_today, D('0.00'))
        self.assertEqual(decision.snapshot['branch_name'], 'Ikeja')  # JSON snapshot saved

    def test_affordable_loan_passes_without_any_override(self):
        set_balance(self.ik_bank.gl_account, '1200000')  # 200,000 above what is committed
        r = gate.evaluate_approval(self.loan, self.maker)
        self.assertTrue(r.allowed)
        self.assertIsNone(r.outcome)

    def test_loan_without_branch_is_not_gated(self):
        self.loan.branch = None
        self.assertTrue(gate.evaluate_approval(self.loan, self.maker).allowed)

    # ── disbursement ────────────────────────────────────────────────────────

    def _approve_under_override(self):
        r = gate.evaluate_approval(self.loan, self.director, 'urgent')
        gate.record_decision(self.loan, LiquidityDecision.STAGE_APPROVAL, r.outcome, self.director, r.reason,
                             r.assessment)

    def test_disbursement_not_gated_when_affordable_and_no_override(self):
        set_balance(self.ik_bank.gl_account, '1200000')
        self.assertIsNone(gate.enforce_disbursement(self.loan, self.maker))

    def test_overridden_loan_needs_a_director_to_disburse(self):
        self._approve_under_override()
        with self.assertRaises(gate.LiquidityBlocked) as ctx:
            gate.enforce_disbursement(self.loan, self.maker)
        self.assertEqual(ctx.exception.code, gate.CODE_DIRECTOR_REQUIRED)
        self.assertEqual(ctx.exception.assessment['override']['reason'], 'urgent')

    def test_overriding_director_cannot_also_disburse(self):
        self._approve_under_override()
        with self.assertRaises(gate.LiquidityBlocked) as ctx:
            gate.enforce_disbursement(self.loan, self.director, acknowledge_impact=True)
        self.assertEqual(ctx.exception.code, gate.CODE_SAME_DIRECTOR)

    def test_second_director_must_acknowledge_then_succeeds(self):
        self._approve_under_override()
        second = User.objects.create_user(username="gate_director2", password="pass")
        second.tenant = self.env['tenant']
        second.branch = self.env['hq']
        second.save()
        with mock.patch.object(gate, 'is_director', side_effect=lambda u: u.pk in (self.director.pk, second.pk)):
            with self.assertRaises(gate.LiquidityBlocked) as ctx:
                gate.enforce_disbursement(self.loan, second)
            self.assertEqual(ctx.exception.code, gate.CODE_ACK_REQUIRED)
            self.assertIn('Ikeja', ctx.exception.message)

            decision = gate.enforce_disbursement(self.loan, second, acknowledge_impact=True, note='Seen, proceed')
        self.assertEqual(decision.outcome, LiquidityDecision.OUTCOME_ACKNOWLEDGED)
        self.assertEqual(decision.user, second)
        self.assertEqual(decision.reason, 'Seen, proceed')

    def test_disbursement_excludes_the_loan_itself_from_competing_commitments(self):
        # The loan is approved (so counts as an "approved, undisbursed" outflow elsewhere), but when assessing
        # its own disbursement it must not be double counted against itself.
        set_balance(self.ik_bank.gl_account, '1100000')
        self.loan.status = 'approved'
        self.loan.approved_amount = D('100000.00')
        self.loan.save()
        self.assertIsNone(gate.enforce_disbursement(self.loan, self.maker))


class ApproveEndpointTests(TestCase):
    """The approve action must return 409 + explanation, then approve once a director overrides."""

    def setUp(self):
        self.env = make_env("api")
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "3001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "3002")
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=timezone.localdate() + timedelta(days=10))
        self.loan = make_pending_loan(self.env, self.env['ikeja'], amount='100000.00')
        self.api = APIClient()
        self.api.force_authenticate(user=self.env['owner'])

    def tearDown(self):
        set_current_tenant(None)

    def test_blocked_then_overridden(self):
        url = f'/api/loans/accounts/{self.loan.pk}/approve/'
        r = self.api.post(url, {}, format='json')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.data['code'], gate.CODE_OVERRIDE_REQUIRED)
        self.assertEqual(Decimal(str(r.data['assessment']['available_today'])), D('0'))
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.status, 'pending')

        r = self.api.post(url, {'override_reason': 'Director discretion'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.loan.refresh_from_db()
        self.assertEqual(self.loan.status, 'approved')
        d = LiquidityDecision.objects.get(loan=self.loan)
        self.assertEqual(d.outcome, LiquidityDecision.OUTCOME_OVERRIDDEN)
        self.assertEqual(d.user, self.env['owner'])

    def test_liquidity_check_endpoint_reports_the_impact(self):
        r = self.api.get(f'/api/treasury/liquidity-check/loan/{self.loan.pk}/?stage=approval')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertFalse(r.data['assessment']['ok'])
        self.assertTrue(r.data['is_director'])
        self.assertIsNone(r.data['override'])

    def test_forecast_endpoint_directors_choose_branch(self):
        r = self.api.get(f"/api/treasury/forecast/?branch={self.env['ikeja'].pk}&days=20")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data['branch_name'], 'Ikeja')
        self.assertEqual(len(r.data['days']), 21)


class DisburseEndpointTests(TestCase):
    """Loan approved under an override: only a *different* director who acknowledges can disburse it."""

    def setUp(self):
        self.env = make_env("dis")
        self.hq_bank = make_bank_account(self.env, self.env['hq'], "4001")
        self.ik_bank = make_bank_account(self.env, self.env['ikeja'], "4002")
        make_borrowing(self.env, self.hq_bank, self.ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=timezone.localdate() + timedelta(days=10))
        self.loan = make_pending_loan(self.env, self.env['ikeja'], amount='100000.00')
        self.director = self.env['owner']
        self.second = User.objects.create_user(username="dis_director2", password="pass")
        self.second.tenant = self.env['tenant']
        self.second.branch = self.env['hq']
        self.second.save()
        # A real second director: a role with company-wide (global) scope.
        from users.models import Role
        role = Role.objects.create(tenant=self.env['tenant'], name='MD', default_scope='global')
        self.second.roles.add(role)

        api = APIClient()
        api.force_authenticate(user=self.director)
        r = api.post(f'/api/loans/accounts/{self.loan.pk}/approve/', {'override_reason': 'urgent'}, format='json')
        assert r.status_code == 200, r.content
        self.loan.refresh_from_db()
        self.url = f'/api/loans/disbursements/{self.loan.disbursement_request.pk}/disburse/'

    def tearDown(self):
        set_current_tenant(None)

    def _client(self, user):
        c = APIClient()
        c.force_authenticate(user=user)
        return c

    def test_same_director_is_stopped(self):
        r = self._client(self.director).post(self.url, {'disbursement_account': self.ik_bank.pk}, format='json')
        self.assertEqual(r.status_code, 409, r.content)
        self.assertEqual(r.data['code'], gate.CODE_SAME_DIRECTOR)

    def test_second_director_sees_impact_then_disburses_after_acknowledging(self):
        # Page-level permission config is not what is under test: let the second director through it.
        from permissions.permission_classes import HasActionPermission
        with mock.patch.object(HasActionPermission, 'has_permission', return_value=True), \
                mock.patch.object(HasActionPermission, 'has_object_permission', return_value=True):
            api = self._client(self.second)
            r = api.post(self.url, {'disbursement_account': self.ik_bank.pk}, format='json')
            self.assertEqual(r.status_code, 409, r.content)
            self.assertEqual(r.data['code'], gate.CODE_ACK_REQUIRED)
            self.assertEqual(r.data['assessment']['override']['reason'], 'urgent')
            self.loan.refresh_from_db()
            self.assertEqual(self.loan.status, 'approved')  # nothing was paid out

            r = api.post(self.url, {
                'disbursement_account': self.ik_bank.pk, 'acknowledge_impact': True,
                'liquidity_note': 'Will move funds in from HQ',
            }, format='json')
            self.assertEqual(r.status_code, 200, r.content)
        self.loan.refresh_from_db()
        self.assertIn(self.loan.status, ('disbursed', 'active'))  # disburse() settles on 'active'
        ack = LiquidityDecision.objects.get(loan=self.loan, outcome=LiquidityDecision.OUTCOME_ACKNOWLEDGED)
        self.assertEqual(ack.user, self.second)
        self.assertEqual(ack.reason, 'Will move funds in from HQ')


class CheckEndpointOverrideTests(TestCase):
    def setUp(self):
        self.env = make_env("chk")
        hq_bank = make_bank_account(self.env, self.env['hq'], "8001")
        ik_bank = make_bank_account(self.env, self.env['ikeja'], "8002")
        make_borrowing(self.env, hq_bank, ik_bank, principal='1000000.00', rate='0', tenor=2,
                       first_due=timezone.localdate() + timedelta(days=10))
        self.loan = make_pending_loan(self.env, self.env['ikeja'], amount='100000.00')
        self.api = APIClient()
        self.api.force_authenticate(user=self.env['owner'])

    def tearDown(self):
        set_current_tenant(None)

    def test_override_details_appear_inside_the_assessment(self):
        r = gate.evaluate_approval(self.loan, self.env['owner'], 'urgent')
        gate.record_decision(self.loan, LiquidityDecision.STAGE_APPROVAL, r.outcome, self.env['owner'], r.reason,
                             r.assessment)
        resp = self.api.get(f'/api/treasury/liquidity-check/loan/{self.loan.pk}/?stage=disbursement')
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data['assessment']['override']['reason'], 'urgent')
        self.assertEqual(resp.data['override']['by_id'], self.env['owner'].pk)

    def test_bank_account_choices_cover_every_branch_despite_branch_switcher(self):
        resp = self.api.get('/api/treasury/bank-accounts/', HTTP_X_BRANCH_ID=str(self.env['hq'].pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual({row['branch'] for row in resp.data}, {self.env['hq'].pk, self.env['ikeja'].pk})

    def test_forecast_days_are_bounded(self):
        resp = self.api.get(f"/api/treasury/forecast/?branch={self.env['ikeja'].pk}&days=5000")
        self.assertEqual(resp.status_code, 400)
