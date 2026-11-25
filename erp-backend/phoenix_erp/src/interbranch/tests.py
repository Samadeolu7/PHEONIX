from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from accounts.models import Account
from branches.models import Branch
from interbranch.models import InterBranchClearingAccount, InterBranchTransfer
from interbranch.services import create_interbranch_transfer, reverse_interbranch_transfer
from pages.models import Module, ModulePage
from permissions.models import RolePermissionPolicy, SCOPE_OWN_BRANCH
from reports.services.financial_statements import FinancialStatementService
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Role, Tenant

User = get_user_model()


class InterBranchTransferTestBase(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(username='ibt_owner', password='pass')
        self.tenant = Tenant.objects.create(name='IBT Tenant', slug='ibt-tenant', owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.save()

        self.branch_a = Branch.objects.create(name='Branch A', code='IBTA', tenant=self.tenant, owner=self.owner)
        self.branch_b = Branch.objects.create(name='Branch B', code='IBTB', tenant=self.tenant, owner=self.owner)

        self.director = User.objects.create_user(
            username='ibt_director', password='pass', tenant=self.tenant, branch=self.branch_a,
        )
        global_role = Role.objects.create(
            tenant=self.tenant, name='Director', default_scope=Role.SCOPE_GLOBAL, is_active=True,
        )
        self.director.roles.add(global_role)

        self.branch_a_staff = User.objects.create_user(
            username='ibt_branch_a_staff', password='pass', tenant=self.tenant, branch=self.branch_a,
        )
        self.branch_b_staff = User.objects.create_user(
            username='ibt_branch_b_staff', password='pass', tenant=self.tenant, branch=self.branch_b,
        )

        # Grant ordinary branch staff can_view on interbranch:transfers, own_branch
        # scope — mirrors what an admin would configure via seed_permissions
        # --create-policies / the Permission Setup UI in a real deployment.
        module, _ = Module.objects.get_or_create(
            owner=None, branch=None, code='interbranch',
            defaults={'name': 'Inter-Branch Transfers', 'icon': 'Repeat', 'order': 33, 'is_active': True},
        )
        page, _ = ModulePage.objects.get_or_create(
            module=module, code='transfers',
            defaults={
                'title': 'Inter-Branch Transfers', 'page_type': 'list', 'order': 1,
                'is_active': True, 'url_path': '/interbranch/transfers/', 'page_config': {},
            },
        )
        staff_role = Role.objects.create(
            tenant=self.tenant, name='Branch Staff', default_scope=Role.SCOPE_OWN_BRANCH, is_active=True,
        )
        RolePermissionPolicy.objects.create(
            role=staff_role, module=module, page=page,
            can_view=True, scope=SCOPE_OWN_BRANCH,
        )
        self.branch_a_staff.roles.add(staff_role)
        self.branch_b_staff.roles.add(staff_role)

        self.equity_a = self._make_account(self.branch_a, '3000', 'Opening Balance Equity A', Account.EQUITY)
        self.cash_a = self._make_account(self.branch_a, '1100', 'Cash A', Account.ASSET)
        self.equity_b = self._make_account(self.branch_b, '3000', 'Opening Balance Equity B', Account.EQUITY)
        self.cash_b = self._make_account(self.branch_b, '1100', 'Cash B', Account.ASSET)

        # Seed an opening balance the canonical way (a posted JV), since
        # Account.save() blocks direct balance writes outside TransactionEntry.post().
        self._post_opening_balance(self.branch_a, self.cash_a, self.equity_a, Decimal('100000.00'))

    def _make_account(self, branch, code, name, account_type):
        return Account.objects.create(
            name=name, code=code, account_type=account_type,
            account_level=Account.LEVEL_PARENT, parent=None,
            owner=self.owner, created_by=self.owner, branch=branch, tenant=self.tenant,
        )

    def _post_opening_balance(self, branch, debit_account, credit_account, amount):
        series, _ = TransactionSeries.objects.get_or_create(code='OB', defaults={'description': 'Opening Balance'})
        txn = Transaction.objects.create(
            series=series, description='Opening balance', branch=branch,
            owner=self.owner, created_by=self.owner, tenant=self.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=debit_account, side=TransactionEntry.DEBIT, amount=amount)
        TransactionEntry.objects.create(transaction=txn, account=credit_account, side=TransactionEntry.CREDIT, amount=amount)
        txn.post()
        return txn


class CreateInterBranchTransferTests(InterBranchTransferTestBase):
    def test_transfer_moves_balances_and_stays_balanced_per_branch(self):
        transfer = create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('25000.00'), description='Float top-up', date=None,
            user=self.director,
        )
        self.assertEqual(transfer.status, InterBranchTransfer.STATUS_POSTED)

        self.cash_a.refresh_from_db()
        self.cash_b.refresh_from_db()
        self.assertEqual(self.cash_a.balance, Decimal('75000.00'))
        self.assertEqual(self.cash_b.balance, Decimal('25000.00'))

        due_from = InterBranchClearingAccount.objects.get(
            branch=self.branch_a, counterparty_branch=self.branch_b, direction=InterBranchClearingAccount.DUE_FROM
        ).account
        due_to = InterBranchClearingAccount.objects.get(
            branch=self.branch_b, counterparty_branch=self.branch_a, direction=InterBranchClearingAccount.DUE_TO
        ).account
        due_from.refresh_from_db()
        due_to.refresh_from_db()
        self.assertEqual(due_from.balance, Decimal('25000.00'))
        self.assertEqual(due_to.balance, Decimal('25000.00'))

        self.assertTrue(transfer.source_transaction.validate_entries())
        self.assertTrue(transfer.destination_transaction.validate_entries())

        tb_a = FinancialStatementService(self.owner, branch=self.branch_a).generate_trial_balance()
        tb_b = FinancialStatementService(self.owner, branch=self.branch_b).generate_trial_balance()
        self.assertTrue(tb_a['is_balanced'])
        self.assertTrue(tb_b['is_balanced'])

    def test_second_transfer_same_pair_reuses_clearing_accounts(self):
        create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('10000.00'), description='First', date=None, user=self.director,
        )
        create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('5000.00'), description='Second', date=None, user=self.director,
        )
        self.assertEqual(
            InterBranchClearingAccount.objects.filter(branch=self.branch_a, counterparty_branch=self.branch_b).count(), 1
        )
        due_from = InterBranchClearingAccount.objects.get(
            branch=self.branch_a, counterparty_branch=self.branch_b, direction=InterBranchClearingAccount.DUE_FROM
        ).account
        due_from.refresh_from_db()
        self.assertEqual(due_from.balance, Decimal('15000.00'))

    def test_rejects_same_branch_transfer(self):
        from django.core.exceptions import ValidationError
        with self.assertRaises(ValidationError):
            create_interbranch_transfer(
                from_branch=self.branch_a, to_branch=self.branch_a,
                from_account=self.cash_a, to_account=self.cash_a,
                amount=Decimal('100.00'), description='', date=None, user=self.director,
            )


class ReverseInterBranchTransferTests(InterBranchTransferTestBase):
    def test_reverse_restores_original_balances(self):
        transfer = create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('30000.00'), description='', date=None, user=self.director,
        )
        reverse_interbranch_transfer(transfer, self.director, 'Sent to the wrong branch')

        transfer.refresh_from_db()
        self.assertEqual(transfer.status, InterBranchTransfer.STATUS_REVERSED)

        self.cash_a.refresh_from_db()
        self.cash_b.refresh_from_db()
        self.assertEqual(self.cash_a.balance, Decimal('100000.00'))
        self.assertEqual(self.cash_b.balance, Decimal('0.00'))


class InterBranchTransferPermissionTests(InterBranchTransferTestBase):
    def test_non_elevated_user_cannot_create_transfer(self):
        client = APIClient()
        client.force_authenticate(self.branch_a_staff)
        response = client.post('/api/interbranch/transfers/', {
            'from_branch_id': self.branch_a.id, 'to_branch_id': self.branch_b.id,
            'from_account_id': self.cash_a.id, 'to_account_id': self.cash_b.id,
            'amount': '100.00', 'description': 'nope',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(InterBranchTransfer.objects.exists())

    def test_elevated_user_can_create_transfer_via_api(self):
        client = APIClient()
        client.force_authenticate(self.director)
        response = client.post('/api/interbranch/transfers/', {
            'from_branch_id': self.branch_a.id, 'to_branch_id': self.branch_b.id,
            'from_account_id': self.cash_a.id, 'to_account_id': self.cash_b.id,
            'amount': '2500.00', 'description': 'Float top-up',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(InterBranchTransfer.objects.count(), 1)

    def test_branch_user_sees_only_their_branch_transfers(self):
        create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('1000.00'), description='', date=None, user=self.director,
        )
        client = APIClient()
        client.force_authenticate(self.branch_a_staff)
        response = client.get('/api/interbranch/transfers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.data['results'] if isinstance(response.data, dict) else response.data
        self.assertEqual(len(results), 1)


class ConsolidatedTrialBalanceTests(InterBranchTransferTestBase):
    def test_reciprocal_pair_is_eliminated_from_combined_totals(self):
        create_interbranch_transfer(
            from_branch=self.branch_a, to_branch=self.branch_b,
            from_account=self.cash_a, to_account=self.cash_b,
            amount=Decimal('40000.00'), description='', date=None, user=self.director,
        )

        consolidated = FinancialStatementService(self.director, branch=None).generate_consolidated_trial_balance()
        self.assertTrue(consolidated['is_balanced'])

        eliminated = [a for a in consolidated['accounts'] if a['is_interbranch_eliminated']]
        self.assertEqual(len(eliminated), 2)
        eliminated_names = {a['name'] for a in eliminated}
        self.assertIn(f'Due from {self.branch_b.name}', eliminated_names)
        self.assertIn(f'Due to {self.branch_a.name}', eliminated_names)

        # Each branch's own (non-consolidated) trial balance is unaffected —
        # it still shows its own leg of the clearing pair at full value.
        tb_a = FinancialStatementService(self.owner, branch=self.branch_a).generate_trial_balance()
        due_from_entry = next(a for a in tb_a['accounts'] if a['name'] == f'Due from {self.branch_b.name}')
        self.assertEqual(Decimal(due_from_entry['balance']), Decimal('40000.00'))


class AddEntryCrossBranchTests(InterBranchTransferTestBase):
    """
    interbranch.services.add_entry: one business event that pays out of
    branch A's cash for a branch-B record (e.g. disbursing a B customer's loan
    from A's till) is split into single-branch, balanced transactions through
    Due From / Due To, and reversing the main transaction reverses both.
    """

    def setUp(self):
        super().setUp()
        self.loans_b = self._make_account(self.branch_b, '1300', 'Loans Receivable B', Account.ASSET)
        self.series, _ = TransactionSeries.objects.get_or_create(code='TST', defaults={'description': 'Test'})

    def _payout_from_a_for_b(self, amount):
        from interbranch.services import add_entry
        txn = Transaction.objects.create(
            series=self.series, description='Loan disbursement (B customer)', branch=self.branch_b,
            owner=self.owner, created_by=self.owner, tenant=self.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=self.loans_b, side=TransactionEntry.DEBIT, amount=amount)
        add_entry(txn, self.cash_a, TransactionEntry.CREDIT, amount)
        txn.post()
        return txn

    def _clearing(self, branch, counterparty, direction):
        acct = InterBranchClearingAccount.objects.get(
            branch=branch, counterparty_branch=counterparty, direction=direction).account
        acct.refresh_from_db()
        return acct

    def _assert_both_branches_balance(self):
        for branch in (self.branch_a, self.branch_b):
            tb = FinancialStatementService(self.owner, branch=branch).generate_trial_balance()
            self.assertTrue(tb['is_balanced'], f"{branch.name} trial balance does not balance")

    def test_payout_from_other_branch_is_split_and_balanced(self):
        txn = self._payout_from_a_for_b(Decimal('30000.00'))

        # Main (B) transaction touches only B accounts and is posted.
        self.assertEqual({e.account.branch_id for e in txn.entries.all()}, {self.branch_b.pk})
        leg = txn.interbranch_legs.get()
        self.assertEqual(leg.branch_id, self.branch_a.pk)
        self.assertTrue(leg.approved)
        self.assertEqual({e.account.branch_id for e in leg.entries.all()}, {self.branch_a.pk})

        self.cash_a.refresh_from_db()
        self.loans_b.refresh_from_db()
        self.assertEqual(self.cash_a.balance, Decimal('70000.00'))
        self.assertEqual(self.loans_b.balance, Decimal('30000.00'))
        # A is owed by B; B owes A — equal and opposite.
        self.assertEqual(self._clearing(self.branch_a, self.branch_b, InterBranchClearingAccount.DUE_FROM).balance,
                         Decimal('30000.00'))
        self.assertEqual(self._clearing(self.branch_b, self.branch_a, InterBranchClearingAccount.DUE_TO).balance,
                         Decimal('30000.00'))
        self._assert_both_branches_balance()

    def test_reversing_main_transaction_reverses_other_branch_leg(self):
        txn = self._payout_from_a_for_b(Decimal('30000.00'))
        txn.reverse(self.owner, 'entered in error')

        leg = txn.interbranch_legs.get()
        leg.refresh_from_db()
        self.assertTrue(leg.is_reversed)
        self.cash_a.refresh_from_db()
        self.loans_b.refresh_from_db()
        self.assertEqual(self.cash_a.balance, Decimal('100000.00'))
        self.assertEqual(self.loans_b.balance, Decimal('0.00'))
        self.assertEqual(self._clearing(self.branch_a, self.branch_b, InterBranchClearingAccount.DUE_FROM).balance,
                         Decimal('0.00'))
        self.assertEqual(self._clearing(self.branch_b, self.branch_a, InterBranchClearingAccount.DUE_TO).balance,
                         Decimal('0.00'))
        self._assert_both_branches_balance()

    def test_leg_cannot_be_reversed_on_its_own(self):
        from django.core.exceptions import ValidationError
        txn = self._payout_from_a_for_b(Decimal('1000.00'))
        with self.assertRaises(ValidationError):
            txn.interbranch_legs.get().reverse(self.owner, 'nope')

    def test_same_branch_account_is_posted_directly(self):
        from interbranch.services import add_entry
        txn = Transaction.objects.create(
            series=self.series, description='Same-branch', branch=self.branch_a,
            owner=self.owner, created_by=self.owner, tenant=self.tenant,
        )
        TransactionEntry.objects.create(transaction=txn, account=self.equity_a, side=TransactionEntry.DEBIT, amount=Decimal('5'))
        add_entry(txn, self.cash_a, TransactionEntry.CREDIT, Decimal('5'))
        txn.post()
        self.assertFalse(txn.interbranch_legs.exists())
        self.assertFalse(InterBranchClearingAccount.objects.exists())
