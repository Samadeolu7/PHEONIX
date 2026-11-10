"""
Money for one branch must never land in another branch's bank account
(it ends up on the wrong branch's reconciliation), and collection-sheet
transfers belong to the collecting officer, not the confirming supervisor.
"""
from datetime import date
from decimal import Decimal

from django.core.exceptions import ValidationError
from django.test import TestCase
from rest_framework import serializers as drf_serializers

from accounts.models import Account
from banks.models import Bank, BankAccount
from banks.serializers import BankTransferSerializer
from branches.models import Branch
from common.managers import set_current_tenant
from transactions.models import Transaction, TransactionEntry, TransactionSeries
from users.models import Tenant, User


class BankBranchGuardTests(TestCase):
    def setUp(self):
        set_current_tenant(None)
        self.owner = User.objects.create_user(username='bbg_owner', password='x')
        self.tenant = Tenant.objects.create(name='BBG', slug='bbg', owner=self.owner)
        self.branch_x = Branch.objects.create(name='Branch X', code='BBGX', tenant=self.tenant, owner=self.owner)
        self.branch_y = Branch.objects.create(name='Branch Y', code='BBGY', tenant=self.tenant, owner=self.owner)
        self.owner.tenant = self.tenant
        self.owner.branch = self.branch_x
        self.owner.save()
        set_current_tenant(self.tenant)
        self.addCleanup(set_current_tenant, None)

        self.series = TransactionSeries.objects.create(code='BBG', description='BBG')
        self.bank = Bank.objects.create(bank_name='BBG Bank', bank_code='991')
        self.parent_x = self._account('Cash X', '1100', self.branch_x)
        self.parent_y = self._account('Cash Y', '1200', self.branch_y)
        self.income_x = self._account('Income X', '4100', self.branch_x, account_type='INCOME')

    def _account(self, name, code, branch, *, account_type='ASSET', parent=None):
        return Account.objects.create(
            name=name, code=code, account_type=account_type,
            account_level=Account.LEVEL_CHILD if parent else Account.LEVEL_PARENT,
            parent=parent, owner=self.owner, created_by=self.owner, branch=branch,
        )

    def _bank_account(self, number, *, branch, gl):
        return BankAccount.objects.create(
            bank=self.bank, account_number=number, account_name=f'Acct {number}',
            gl_account=gl, account_manager=self.owner, owner=self.owner, branch=branch,
            tenant=self.tenant,
        )

    def _post(self, branch, debit_account):
        txn = Transaction.objects.create(
            series=self.series, description='Loan repayment', owner=self.owner,
            created_by=self.owner, branch=branch,
        )
        TransactionEntry.objects.create(transaction=txn, account=debit_account, side=TransactionEntry.DEBIT, amount=Decimal('100'))
        return txn

    def test_ledger_refuses_bank_account_owned_by_another_branch(self):
        # GL account sits in X (so the old GL-branch rule passes) but the bank
        # account — whose statement Y reconciles — belongs to Y.
        gl = self._account('Mislabelled bank', '1101', self.branch_x, parent=self.parent_x)
        self._bank_account('0000101', branch=self.branch_y, gl=gl)
        with self.assertRaises(ValidationError) as ctx:
            self._post(self.branch_x, gl)
        self.assertIn('belongs to Branch Y', ' '.join(ctx.exception.messages))

    def test_ledger_allows_own_branch_and_company_wide_bank_accounts(self):
        own = self._account('X bank', '1102', self.branch_x, parent=self.parent_x)
        self._bank_account('0000102', branch=self.branch_x, gl=own)
        self._post(self.branch_x, own)

        shared = self._account('Shared bank', '1103', self.branch_x, parent=self.parent_x)
        self._bank_account('0000103', branch=None, gl=shared)
        self._post(self.branch_x, shared)

    def test_plain_transfer_into_another_branchs_bank_account_is_refused(self):
        src = self._bank_account(
            '0000201', branch=self.branch_x, gl=self._account('X src', '1104', self.branch_x, parent=self.parent_x))
        dst = self._bank_account(
            '0000202', branch=self.branch_y, gl=self._account('Y dst', '1201', self.branch_y, parent=self.parent_y))
        with self.assertRaises(drf_serializers.ValidationError) as ctx:
            BankTransferSerializer().validate({
                'source_type': 'bank', 'source_bank_account': src,
                'destination_type': 'bank', 'destination_bank_account': dst,
                'amount': Decimal('50'),
            })
        self.assertIn('inter-branch', str(ctx.exception.detail))

    def test_collection_sheet_payment_belongs_to_collecting_officer(self):
        from banks.officer_attribution import payment_officer
        from cash_management.models import CollectionSheetItem, DailyCollectionSheet
        from clients.models import Client
        from hr.models import Staff

        officer_user = User.objects.create_user(username='bbg_officer', password='x')
        officer_user.tenant = self.tenant
        officer_user.branch = self.branch_x
        officer_user.save()
        staff = Staff.objects.get(user=officer_user)
        staff.owner = self.owner
        staff.branch = self.branch_x
        staff.save()

        supervisor = User.objects.create_user(username='bbg_supervisor', password='x')
        txn = Transaction.objects.create(
            series=self.series, description='Loan repayment | Ref: ABC123', owner=self.owner,
            created_by=supervisor, branch=self.branch_x,
        )
        client = Client.objects.create(
            client_id='BBG-1', first_name='Ada', last_name='Officer', gender='female',
            phone_primary='08020000099', tenant=self.tenant, owner=self.owner, branch=self.branch_x,
        )
        sheet = DailyCollectionSheet.objects.create(
            credit_officer=staff, collection_date=date.today(), owner=self.owner, branch=self.branch_x,
        )
        CollectionSheetItem.objects.create(
            sheet=sheet, client=client, collection_type='savings_deposit',
            amount_expected=Decimal('100'), amount_collected=Decimal('100'),
            payment_mode='bank_transfer', journal_entry=txn, owner=self.owner, branch=self.branch_x,
        )
        self.assertEqual(payment_officer(txn), officer_user)

        # A payment not from a collection sheet stays with whoever posted it.
        other = Transaction.objects.create(
            series=self.series, description='Loan repayment', owner=self.owner,
            created_by=supervisor, branch=self.branch_x,
        )
        self.assertEqual(payment_officer(other), supervisor)
