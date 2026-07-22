"""
Smoke tests for banks/management/commands/audit_unattached_statement_lines.py
— a read-only report, so these just verify it correctly classifies ghost
vs never-matched lines and never raises, rather than asserting exact output
text.
"""
from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from django.contrib.auth import get_user_model

from accounts.models import Account
from banks.models import Bank, BankAccount, ReconciliationBankTransaction

User = get_user_model()


class AuditUnattachedStatementLinesTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='audit_test_manager', password='test123')
        gl_account = Account.objects.create(
            code='1299', name='Audit Test Bank GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Audit Test Bank', bank_code='998')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000099', account_name='Audit Test Account',
            gl_account=gl_account, account_manager=self.user,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('audit_unattached_statement_lines', stdout=out, **options)
        return out.getvalue()

    def test_no_lines_reports_clean(self):
        output = self._run()
        self.assertIn('No unattached statement lines found', output)

    def test_ghost_match_is_reported_separately_from_never_matched(self):
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='GHOST-1', value_date='2026-07-01',
            direction='CREDIT', amount=Decimal('10000.00'), narration='Trf for Custo',
            matched=False, matched_erp_payment_id=999, match_confidence='MEDIUM',
        )
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='NEVER-1', value_date='2026-07-02',
            direction='CREDIT', amount=Decimal('3000.00'), narration='Unrelated credit',
            matched=False,
        )

        output = self._run()
        self.assertIn('GHOST MATCHES', output)
        self.assertIn('NEVER MATCHED', output)
        self.assertIn('previously matched to ERP payment id=999', output)
        self.assertIn('NO erp_only exception exists for ERP payment 999', output)

    def test_min_age_days_excludes_recent_lines(self):
        from django.utils import timezone
        today = timezone.now().date()
        ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref='RECENT-1', value_date=today,
            direction='CREDIT', amount=Decimal('500.00'), narration='Today', matched=False,
        )
        output = self._run(min_age_days=5)
        self.assertIn('No unattached statement lines found', output)
