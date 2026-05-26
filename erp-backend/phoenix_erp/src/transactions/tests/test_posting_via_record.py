from django.test import TestCase
from django.contrib.auth import get_user_model
from decimal import Decimal
from django.utils import timezone

from branches.models import Branch
from accounts.models import AccountCategory, Account
from transactions.models import TransactionSeries, Transaction, TransactionEntry


class RecordPaymentPostingTest(TestCase):
    def setUp(self):
        User = get_user_model()
        self.user = User.objects.filter(is_superuser=True).first()
        if not self.user:
            self.user = User.objects.create(username='testuser', email='test@example.com')
            self.user.set_password('testpass')
            self.user.is_superuser = True
            self.user.save()

        self.branch = Branch.objects.first() or Branch.objects.create(name='Test Branch', code='TST', owner=self.user)

        # Create minimal account categories
        self.asset_cat = AccountCategory.objects.create(
            section=1, name='Tmp Assets', owner=self.user, branch=self.branch, created_by=self.user
        )
        self.income_cat = AccountCategory.objects.create(
            section=4, name='Tmp Income', owner=self.user, branch=self.branch, created_by=self.user
        )

        # Create parent accounts then child accounts
        parent_asset = Account.objects.create(
            code='101', name='Assets Parent', account_level=Account.LEVEL_PARENT,
            account_type=Account.ASSET, owner=self.user, branch=self.branch
        )
        parent_income = Account.objects.create(
            code='400', name='Income Parent', account_level=Account.LEVEL_PARENT,
            account_type=Account.INCOME, owner=self.user, branch=self.branch
        )

        self.cash = Account.objects.create(
            code='101-001', name='Test Cash', account_level=Account.LEVEL_CHILD,
            account_type=Account.ASSET, owner=self.user, branch=self.branch, parent=parent_asset
        )

        self.income = Account.objects.create(
            code='400-001', name='Test Income', account_level=Account.LEVEL_CHILD,
            account_type=Account.INCOME, owner=self.user, branch=self.branch, parent=parent_income
        )

        # Transaction series
        self.series = TransactionSeries.objects.create(code='TST', description='Test Series')

    def test_transaction_post_updates_account_balances(self):
        # Create transaction and balanced entries
        tx = Transaction.objects.create(
            series=self.series,
            date=timezone.now().date(),
            description='Test TX',
            owner=self.user,
            branch=self.branch,
            created_by=self.user,
        )

        TransactionEntry.objects.create(
            transaction=tx,
            account=self.cash,
            side=TransactionEntry.DEBIT,
            amount=Decimal('100.00')
        )

        TransactionEntry.objects.create(
            transaction=tx,
            account=self.income,
            side=TransactionEntry.CREDIT,
            amount=Decimal('100.00')
        )

        cash_before = Account.objects.get(pk=self.cash.pk).balance
        income_before = Account.objects.get(pk=self.income.pk).balance

        # Post the transaction (this should post entries and mark tx approved)
        tx.post()

        cash_after = Account.objects.get(pk=self.cash.pk).balance
        income_after = Account.objects.get(pk=self.income.pk).balance

        self.assertTrue(tx.approved)
        self.assertEqual(cash_after - cash_before, Decimal('100.00'))
        # Income account balance should decrease by 100 (stored as negative increase)
        self.assertEqual(income_after - income_before, Decimal('-100.00'))
