"""
Tests for the backfill_journal_entry_attribution management command —
recovers Transaction.created_by on historical BankTransfer/BankPayment
journal entries from completed_by/posted_by, for entries posted before
the created_by fix in BankTransfer.complete()/BankPayment.post_payment().
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, BankPayment, BankTransfer
from branches.models import Branch
from transactions.models import Transaction, TransactionSeries
from users.models import Tenant

User = get_user_model()


class BackfillJournalEntryAttributionTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Backfill Org', slug='backfill-org')
        self.branch = Branch.objects.create(name='Branch A', code='BFA')
        self.actor = User.objects.create_user(
            username='backfill_actor', password='test123', tenant=self.tenant, branch=self.branch,
        )

        gl_a = Account.objects.create(
            code='1701', name='Source GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        gl_b = Account.objects.create(
            code='1702', name='Dest GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Backfill Bank', bank_code='994')
        self.source_account = BankAccount.objects.create(
            bank=bank, account_number='0000030', account_name='Source', gl_account=gl_a,
            account_manager=self.actor,
        )
        self.dest_account = BankAccount.objects.create(
            bank=bank, account_number='0000031', account_name='Dest', gl_account=gl_b,
            account_manager=self.actor,
        )
        self.btrf_series, _ = TransactionSeries.objects.get_or_create(
            code='BTRF', defaults={'description': 'Bank Transfers'},
        )
        self.bkpay_series, _ = TransactionSeries.objects.get_or_create(
            code='BKPAY', defaults={'description': 'Bank Payments'},
        )

    def _unattributed_transfer(self):
        # Simulates the pre-fix state: journal entry with no created_by,
        # even though the transfer itself correctly records completed_by.
        journal_entry = Transaction.objects.create(
            series=self.btrf_series, date=date(2026, 7, 1),
            description='Transfer: test', owner=self.actor, branch=self.branch, tenant=self.tenant,
        )
        transfer = BankTransfer.objects.create(
            transfer_number='BTRF-BF-1', source_type='bank', destination_type='bank',
            source_bank_account=self.source_account, destination_bank_account=self.dest_account,
            amount=Decimal('500.00'), description='test', initiated_by=self.actor,
            approved_by=self.actor, completed_by=self.actor, status='completed',
            journal_entry=journal_entry, branch=self.branch, owner=self.actor, tenant=self.tenant,
        )
        return transfer, journal_entry

    def _unattributed_payment(self):
        journal_entry = Transaction.objects.create(
            series=self.bkpay_series, date=date(2026, 7, 1),
            description='Bank Payment: test', owner=self.actor, branch=self.branch, tenant=self.tenant,
        )
        payment = BankPayment.objects.create(
            payment_number='BKPAY-BF-1', bank_account=self.source_account, amount=Decimal('75.00'),
            description='test', status='posted', posted_by=self.actor,
            journal_entry=journal_entry, branch=self.branch, owner=self.actor, tenant=self.tenant,
        )
        return payment, journal_entry

    def test_backfills_transfer_and_payment_created_by(self):
        transfer, transfer_je = self._unattributed_transfer()
        payment, payment_je = self._unattributed_payment()

        call_command('backfill_journal_entry_attribution', stdout=StringIO())

        transfer_je.refresh_from_db()
        payment_je.refresh_from_db()
        self.assertEqual(transfer_je.created_by_id, self.actor.id)
        self.assertEqual(payment_je.created_by_id, self.actor.id)

    def test_dry_run_makes_no_changes(self):
        transfer, transfer_je = self._unattributed_transfer()

        out = StringIO()
        call_command('backfill_journal_entry_attribution', '--dry-run', stdout=out)

        transfer_je.refresh_from_db()
        self.assertIsNone(transfer_je.created_by_id)
        self.assertIn('DRY RUN', out.getvalue())
        self.assertIn('BTRF-BF-1', out.getvalue())

    def test_already_attributed_entries_are_left_untouched_and_not_reported(self):
        transfer, transfer_je = self._unattributed_transfer()
        other_user = User.objects.create_user(
            username='already_attributed', password='test123', tenant=self.tenant, branch=self.branch,
        )
        transfer_je.created_by = other_user
        transfer_je.save(update_fields=['created_by'])

        out = StringIO()
        call_command('backfill_journal_entry_attribution', stdout=out)

        transfer_je.refresh_from_db()
        self.assertEqual(transfer_je.created_by_id, other_user.id)
        self.assertNotIn('BTRF-BF-1', out.getvalue())

    def test_entry_with_no_actor_to_recover_from_is_reported_and_skipped(self):
        # completed_by should always be set by complete(), but guard against
        # the theoretical case rather than silently guessing an attribution.
        transfer, transfer_je = self._unattributed_transfer()
        transfer.completed_by = None
        transfer.save(update_fields=['completed_by'])

        out = StringIO()
        call_command('backfill_journal_entry_attribution', stdout=out)

        transfer_je.refresh_from_db()
        self.assertIsNone(transfer_je.created_by_id)
        self.assertIn('no completed_by/posted_by to recover from', out.getvalue())

    def test_is_safely_re_runnable(self):
        self._unattributed_transfer()

        call_command('backfill_journal_entry_attribution', stdout=StringIO())
        out = StringIO()
        call_command('backfill_journal_entry_attribution', stdout=out)

        self.assertIn('No unattributed BankTransfer/BankPayment journal entries found.', out.getvalue())
