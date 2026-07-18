"""
Tests for the backfill_auto_resolve_matched_exceptions management command —
auto-resolves bank_only/erp_only exceptions whose underlying bank line/ERP
payment is already matched elsewhere, the phantom-exception race between
two reconciliation dates' overlapping match windows (see the guard added
directly in banks/tasks.py's _persist_outcome for future runs; this
command is the one-time catch-up for exceptions created before that fix).
"""
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase
from django.utils import timezone

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
from branches.models import Branch
from users.models import Tenant

User = get_user_model()


class BackfillAutoResolveMatchedExceptionsTests(TestCase):

    def setUp(self):
        self.tenant = Tenant.objects.create(name='Phantom Backfill Org', slug='phantom-backfill-org')
        self.branch = Branch.objects.create(name='Branch A', code='PBA')
        self.director = User.objects.create_user(
            username='phantom_director', password='test123', tenant=self.tenant, branch=self.branch,
        )

        gl_account = Account.objects.create(
            code='1921', name='Phantom Backfill GL', account_level=Account.LEVEL_PARENT, branch=self.branch,
        )
        bank = Bank.objects.create(bank_name='Phantom Backfill Bank', bank_code='988')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000080', account_name='Phantom Backfill Account',
            gl_account=gl_account, account_manager=self.director,
        )
        self.recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date='2026-07-01',
            uploaded_by=self.director, statement_file='bank_statements/phantom.csv',
            status='completed', owner=self.director, branch=self.branch, tenant=self.tenant,
        )

    def test_resolves_erp_only_exception_for_an_already_matched_payment(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-1', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('5000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=555, match_confidence='HIGH',
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=555, erp_amount=Decimal('5000.00'),
            erp_narration='Loan disbursement – phantom', erp_date='2026-07-01',
        )

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())

        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    def test_resolves_bank_only_exception_for_an_already_matched_transaction(self):
        tx = ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-2', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('3000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=777, match_confidence='HIGH',
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=tx.id, bank_amount=Decimal('3000.00'),
            bank_narration='real bank line', bank_date='2026-07-01',
        )

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())

        exc.refresh_from_db()
        self.assertTrue(exc.resolved)
        self.assertIn('Auto-resolved', exc.resolution_notes)

    def test_leaves_genuinely_unmatched_exceptions_untouched(self):
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=999, erp_amount=Decimal('1000.00'),
            erp_narration='genuinely unexplained', erp_date='2026-07-01',
        )

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())

        exc.refresh_from_db()
        self.assertFalse(exc.resolved)

    def test_dry_run_makes_no_changes(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-3', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('2000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=333, match_confidence='HIGH',
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=333, erp_amount=Decimal('2000.00'),
            erp_narration='phantom', erp_date='2026-07-01',
        )

        out = StringIO()
        call_command('backfill_auto_resolve_matched_exceptions', '--dry-run', stdout=out)

        exc.refresh_from_db()
        self.assertFalse(exc.resolved)
        self.assertIn('DRY RUN', out.getvalue())
        self.assertIn(f'erp_only exception id={exc.id}', out.getvalue())

    def test_already_resolved_exceptions_are_not_reprocessed(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-4', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('4000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=444, match_confidence='HIGH',
        )
        exc = ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=444, erp_amount=Decimal('4000.00'),
            erp_narration='already resolved by a director', erp_date='2026-07-01',
            resolved=True, resolved_by=self.director, resolved_at=timezone.now(),
            resolution_notes='Reviewed manually — legitimate.',
        )

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())

        exc.refresh_from_db()
        self.assertEqual(exc.resolution_notes, 'Reviewed manually — legitimate.')

    def test_recomputes_reconciliation_counts(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-5', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('6000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=666, match_confidence='HIGH',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=666, erp_amount=Decimal('6000.00'),
            erp_narration='phantom', erp_date='2026-07-01',
        )
        self.recon.unmatched_erp_count = 1
        self.recon.save(update_fields=['unmatched_erp_count'])

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())

        self.recon.refresh_from_db()
        self.assertEqual(self.recon.unmatched_erp_count, 0)

    def test_is_safely_re_runnable(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='PHM-6', value_date='2026-07-01',
            direction='DEBIT', amount=Decimal('7000.00'), narration='real bank line',
            matched=True, matched_erp_payment_id=888, match_confidence='HIGH',
        )
        ReconciliationException.objects.create(
            reconciliation=self.recon, exception_type='erp_only', direction='DEBIT',
            loan_payment_id=888, erp_amount=Decimal('7000.00'),
            erp_narration='phantom', erp_date='2026-07-01',
        )

        call_command('backfill_auto_resolve_matched_exceptions', stdout=StringIO())
        out = StringIO()
        call_command('backfill_auto_resolve_matched_exceptions', stdout=out)

        self.assertIn('No phantom matched exceptions found.', out.getvalue())
