"""
Tests for the per-supplier GL subledger account.

Covers:
  - Supplier creation auto-provisions its own dedicated LIABILITY account.
  - AccountsPayable.resolve_vendor_account() routes Supplier vendors to that
    account.
  - An on-account BankPayment posts straight to the supplier's own account
    (not a pooled "Supplier Advances" account), and the automatic FIFO
    advance-clearing step nets against an existing AP with no duplicate GL
    entry, since both already share the same account.
  - The previously-broken BankPayment.post_payment() AP branch (missing
    bank_gl_account, duplicate journal entry) now posts exactly once.
  - Applying a PRE-MIGRATION advance (posted to the old pooled "Supplier
    Advances" account, before this supplier had its own account) against an
    AP that's already been reallocated onto the supplier's own account posts
    a real clearing entry rather than wrongly assuming the two already share
    an account and skipping it.
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from accounts.utils.account_creation import get_system_account
from banks.models import Bank, BankAccount, BankPayment
from branches.models import Branch
from liabilities.models import AccountsPayable
from procurement.models import Supplier
from transactions.models import Transaction, TransactionEntry
from users.models import Tenant, User


class SupplierSubledgerTests(TestCase):

    def setUp(self):
        from common.managers import set_current_tenant

        self.tenant = Tenant.objects.create(name='Subledger Org', slug='subledger-org')
        set_current_tenant(self.tenant)
        self.branch = Branch.objects.create(name='Main Branch', code='SLB', tenant=self.tenant)
        self.user = User.objects.create_user(
            username='finance_sl', email='finance_sl@test.com', password='test123',
            tenant=self.tenant,
        )
        self.user.branch = self.branch
        self.user.save()

        bank_gl_account = get_system_account('bank', self.user, self.branch)
        bank = Bank.objects.create(bank_name='Test Bank', bank_code='999')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='ACCT-SL-001', account_name='Main Operating',
            gl_account=bank_gl_account, account_manager=self.user,
            branch=self.branch, owner=self.user, tenant=self.tenant,
        )

        self.supplier = Supplier.objects.create(
            name='KPD CONCEPT TEST', email='kpd@test.com', phone='555-0001',
            branch=self.branch, owner=self.user, tenant=self.tenant,
        )

    def _post_advance(self, amount):
        payment = BankPayment.objects.create(
            bank_account=self.bank_account,
            amount=amount,
            description='Payment on account',
            supplier=self.supplier,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
        )
        payment.post_payment(posted_by=self.user)
        payment.refresh_from_db()
        return payment

    def test_supplier_auto_provisions_own_account(self):
        self.supplier.refresh_from_db()
        self.assertIsNotNone(self.supplier.account_id)
        account = self.supplier.account
        self.assertEqual(account.account_type, 'LIABILITY')
        self.assertEqual(account.account_level, Account.LEVEL_CHILD)
        self.assertEqual(account.parent.name, 'Trade and Other Payables')

    def test_resolve_vendor_account_returns_suppliers_own_account(self):
        self.supplier.refresh_from_db()
        resolved = AccountsPayable.resolve_vendor_account(self.supplier, self.user, self.branch)
        self.assertEqual(resolved.id, self.supplier.account_id)

    def test_on_account_advance_posts_to_suppliers_own_account(self):
        self.supplier.refresh_from_db()
        payment = self._post_advance(Decimal('140000.00'))

        self.supplier.account.refresh_from_db()
        # Dr on a LIABILITY account decreases its balance — a debit/credit-
        # available position, since nothing has been invoiced yet.
        self.assertEqual(self.supplier.account.balance, Decimal('-140000.00'))
        self.assertEqual(payment.advance_remaining, Decimal('140000.00'))
        self.assertIsNotNone(payment.journal_entry_id)

    def test_advance_auto_clears_against_existing_ap_with_no_duplicate_entry(self):
        self.supplier.refresh_from_db()

        ap = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.supplier.account,
            invoice_number='GRN-TEST-0001',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            amount=Decimal('180000.00'),
            branch=self.branch,
            owner=self.user,
        )
        # Simulate the invoice's own GL posting (normally done by the GRN/
        # expense caller): Cr supplier's own account for the invoice amount.
        from transactions.models import TransactionSeries
        series, _ = TransactionSeries.objects.get_or_create(code='TINV1', defaults={'description': 'Test invoice'})
        invoice_txn = Transaction.objects.create(
            series=series, date=timezone.now().date(), description='Test invoice posting',
            branch=self.branch, owner=self.user, tenant=self.tenant,
        )
        TransactionEntry.objects.create(
            transaction=invoice_txn, account=self.supplier.account,
            side=TransactionEntry.CREDIT, amount=Decimal('180000.00'),
        )
        invoice_txn.post()

        txn_count_before = Transaction.objects.count()

        # Post a 140,000 on-account advance — post_payment's auto-clear step
        # should immediately apply it against the open AP above.
        self._post_advance(Decimal('140000.00'))

        ap.refresh_from_db()
        self.assertEqual(ap.amount_paid, Decimal('140000.00'))
        self.assertEqual(ap.status, 'partial')
        self.assertEqual(ap.amount_due, Decimal('40000.00'))

        # Only the advance's own journal entry should have posted — the
        # auto-apply step must NOT create a second entry, since the advance
        # and the invoice already share the same account (a same-account
        # Dr/Cr would just be a wash).
        self.assertEqual(Transaction.objects.count(), txn_count_before + 1)

        self.supplier.account.refresh_from_db()
        # Cr 180,000 (invoice) net Dr 140,000 (advance) = 40,000 still owed.
        self.assertEqual(self.supplier.account.balance, Decimal('40000.00'))

    def test_post_payment_ap_branch_no_longer_double_posts(self):
        self.supplier.refresh_from_db()

        ap = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.supplier.account,
            invoice_number='GRN-TEST-0002',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            amount=Decimal('50000.00'),
            branch=self.branch,
            owner=self.user,
        )

        payment = BankPayment.objects.create(
            bank_account=self.bank_account,
            amount=Decimal('50000.00'),
            description='Direct AP payment',
            accounts_payable=ap,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
        )

        txn_count_before = Transaction.objects.count()

        # This used to raise ValidationError (make_payment() called without
        # the now-required bank_gl_account) — must succeed cleanly now.
        payment.post_payment(posted_by=self.user)

        ap.refresh_from_db()
        payment.refresh_from_db()

        self.assertEqual(ap.amount_paid, Decimal('50000.00'))
        self.assertEqual(ap.status, 'paid')
        self.assertIsNotNone(payment.journal_entry_id)
        # Exactly one Dr AP / Cr Bank entry, not two.
        self.assertEqual(Transaction.objects.count(), txn_count_before + 1)

    def test_apply_pre_migration_advance_posts_real_clearing_entry(self):
        """
        Reproduces the KPD CONCEPT scenario: a supplier's advance was posted
        BEFORE this supplier had its own account (Dr the old pooled
        "Supplier Advances" account), and its AP invoice has since been
        reallocated onto the supplier's own account (as backfill_supplier_
        accounts would do). Applying the advance must post a real clearing
        entry — not silently skip it just because payable.account happens to
        equal the supplier's account today.
        """
        self.supplier.refresh_from_db()
        from transactions.models import TransactionSeries

        old_advance_account = get_system_account('supplier_advance', self.user, self.branch)

        # ── Simulate the pre-migration advance (old code path) ──────────────
        adv_series, _ = TransactionSeries.objects.get_or_create(
            code='BKPAY', defaults={'description': 'Bank Payments'}
        )
        adv_txn = Transaction.objects.create(
            series=adv_series, date=timezone.now().date(),
            description='Legacy payment on account', branch=self.branch,
            owner=self.user, tenant=self.tenant,
        )
        TransactionEntry.objects.create(
            transaction=adv_txn, account=old_advance_account,
            side=TransactionEntry.DEBIT, amount=Decimal('140000.00'),
        )
        TransactionEntry.objects.create(
            transaction=adv_txn, account=self.bank_account.gl_account,
            side=TransactionEntry.CREDIT, amount=Decimal('140000.00'),
        )
        adv_txn.post()

        payment = BankPayment.objects.create(
            bank_account=self.bank_account,
            amount=Decimal('140000.00'),
            description='Legacy payment on account',
            supplier=self.supplier,
            status='posted',
            journal_entry=adv_txn,
            branch=self.branch,
            owner=self.user,
            tenant=self.tenant,
        )

        # ── Simulate the AP already reallocated onto the supplier's own
        #    account (post-backfill), with its own 180,000 Cr entry there ──
        ap = AccountsPayable.create_for_vendor(
            vendor=self.supplier,
            account=self.supplier.account,
            invoice_number='GRN-TEST-0003',
            invoice_date=timezone.now().date(),
            due_date=timezone.now().date(),
            amount=Decimal('180000.00'),
            branch=self.branch,
            owner=self.user,
        )
        inv_series, _ = TransactionSeries.objects.get_or_create(
            code='TINV2', defaults={'description': 'Test invoice'}
        )
        inv_txn = Transaction.objects.create(
            series=inv_series, date=timezone.now().date(),
            description='Reallocated invoice', branch=self.branch,
            owner=self.user, tenant=self.tenant,
        )
        TransactionEntry.objects.create(
            transaction=inv_txn, account=self.supplier.account,
            side=TransactionEntry.CREDIT, amount=Decimal('180000.00'),
        )
        inv_txn.post()

        txn_count_before = Transaction.objects.count()

        result = payment.apply_advance_to_payable(
            payable=ap, amount=Decimal('140000.00'), posted_by=self.user,
        )

        # A real clearing entry must have been posted — not skipped.
        self.assertIsNotNone(result['journal_entry_id'])
        self.assertEqual(Transaction.objects.count(), txn_count_before + 1)

        ap.refresh_from_db()
        self.assertEqual(ap.amount_paid, Decimal('140000.00'))
        self.assertEqual(ap.status, 'partial')
        self.assertEqual(ap.amount_due, Decimal('40000.00'))

        old_advance_account.refresh_from_db()
        self.assertEqual(old_advance_account.balance, Decimal('0.00'))

        self.supplier.account.refresh_from_db()
        # Cr 180,000 (invoice) net Dr 140,000 (clearing) = 40,000 still owed.
        self.assertEqual(self.supplier.account.balance, Decimal('40000.00'))
