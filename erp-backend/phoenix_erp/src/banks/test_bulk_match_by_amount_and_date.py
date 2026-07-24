"""
Tests for banks/management/commands/bulk_match_by_amount_and_date.py — the
client-approved, date-bounded exception that pairs unmatched bank lines to
unclaimed ERP payments by amount + closest date proximity only, recorded
as MANUAL confidence.
"""
from datetime import date
from decimal import Decimal
from io import StringIO

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from accounts.models import Account
from banks.models import Bank, BankAccount, DailyReconciliation, ReconciliationBankTransaction, ReconciliationException
from banks.reconciliation_utils import narration_relationship
from transactions.models import Transaction, TransactionEntry, TransactionSeries

User = get_user_model()


class NarrationRelationshipTests(TestCase):
    """Direct unit tests for the tri-state primitive bulk_match_by_amount_and_date relies on."""

    def test_shared_meaningful_word_is_confirmed(self):
        self.assertEqual(
            narration_relationship('CPWInward:.../KAFILAT A', 'Loan repayment | Ref: KAFILAT abdulrazak'),
            'CONFIRMED',
        )

    def test_shared_long_digit_token_is_confirmed(self):
        self.assertEqual(
            narration_relationship(
                'FIP CHARGES Ref002278932824',
                'Bank Payment: EXP-2026-000018 - FIP CHARGES Ref002278932824',
            ),
            'CONFIRMED',
        )

    def test_two_different_named_customers_is_contradicted(self):
        self.assertEqual(
            narration_relationship(
                'CPWInward:100004260716190817165549851580/KAFILAT A',
                'Loan repayment – LN-20260706-892715 | Ref: CPWInward:100004260723070805166115964890/MARVELLOU',
            ),
            'CONTRADICTED',
        )

    def test_generic_boilerplate_only_is_neutral(self):
        self.assertEqual(
            narration_relationship('Transfer from Krystar customer', 'Transfer: Krystar payment received'),
            'NEUTRAL',
        )

    def test_shared_digit_blob_alone_never_causes_a_false_contradiction(self):
        # Regression: bank narrations on this feed embed a long,
        # transaction-timestamp-derived digit run (varying length,
        # multiple channel prefixes — CPWInward/ISW/FIP/QS894). Before the
        # fix, that digit blob got treated as "a meaningful word" on the
        # bank side with nothing to match on a short ERP description,
        # forcing a false CONTRADICTED verdict for what was actually a
        # genuine same-customer pair with no name in common in the
        # extracted text at all — should be NEUTRAL (not enough
        # identifiable name text), never CONTRADICTED.
        self.assertEqual(
            narration_relationship(
                'CPWInward:100004260720134408165871030330/GOD IS GO Ref100233721315',
                'Transfer: God is good',
            ),
            'NEUTRAL',
        )

    def test_blank_side_is_neutral(self):
        self.assertEqual(narration_relationship('', 'Loan repayment – LN-1 | Ref: something'), 'NEUTRAL')
        self.assertEqual(narration_relationship('CPWInward:.../SOMEONE', ''), 'NEUTRAL')


class BulkMatchByAmountAndDateTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username='bulk_match_manager', password='test123')
        self.gl_account = Account.objects.create(
            code='2399', name='Bulk Match GL', account_level=Account.LEVEL_PARENT
        )
        bank = Bank.objects.create(bank_name='Bulk Match Bank', bank_code='982')
        self.bank_account = BankAccount.objects.create(
            bank=bank, account_number='0000000082', account_name='Bulk Match Account',
            gl_account=self.gl_account, account_manager=self.user,
        )
        self.series = TransactionSeries.objects.create(code='BM', description='Bulk match series')

    def _payment(self, amount, txn_date, description='Transfer: unrelated text', direction='CREDIT'):
        txn = Transaction.objects.create(
            series=self.series, date=txn_date, description=description,
            owner=self.user, created_by=self.user, approved=True,
        )
        side = TransactionEntry.DEBIT if direction == 'CREDIT' else TransactionEntry.CREDIT
        TransactionEntry.objects.create(
            transaction=txn, account=self.gl_account, side=side, amount=amount,
        )
        return txn

    def _line(self, bank_ref, amount, value_date, direction='CREDIT', narration='unrelated narration'):
        return ReconciliationBankTransaction.objects.create(
            bank_account=self.bank_account, bank_ref=bank_ref, value_date=value_date,
            direction=direction, amount=amount, narration=narration, matched=False,
        )

    def _run(self, **options):
        out = StringIO()
        call_command('bulk_match_by_amount_and_date', stdout=out, **options)
        return out.getvalue()

    def test_pairs_by_nearest_date_within_amount_bucket(self):
        payment_near = self._payment(Decimal('2000.00'), date(2026, 7, 5))
        payment_far = self._payment(Decimal('2000.00'), date(2026, 7, 15))
        line = self._line('L-1', Decimal('2000.00'), date(2026, 7, 6))

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertEqual(line.matched_erp_payment_id, payment_near.id)
        self.assertEqual(line.match_confidence, 'MANUAL')
        payment_far  # unused directly, just needs to exist as the "wrong" farther candidate

    def test_leftover_is_reported_not_force_matched(self):
        self._payment(Decimal('3000.00'), date(2026, 7, 5))
        line_a = self._line('L-A', Decimal('3000.00'), date(2026, 7, 6))
        line_b = self._line('L-B', Decimal('3000.00'), date(2026, 7, 7))

        output = self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        line_a.refresh_from_db()
        line_b.refresh_from_db()
        matched_count = sum(1 for ln in (line_a, line_b) if ln.matched)
        self.assertEqual(matched_count, 1)
        self.assertIn('left over', output)

    def test_amount_on_only_one_side_is_skipped(self):
        line = self._line('ONLY-1', Decimal('4000.00'), date(2026, 7, 6))

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)

    def test_debit_excluded_by_default_included_with_flag(self):
        self._payment(Decimal('5000.00'), date(2026, 7, 5), direction='DEBIT')
        line = self._line('DEBIT-1', Decimal('5000.00'), date(2026, 7, 6), direction='DEBIT')

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)
        line.refresh_from_db()
        self.assertFalse(line.matched)

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True, include_debits=True)
        line.refresh_from_db()
        self.assertTrue(line.matched)

    def test_dry_run_makes_no_changes(self):
        self._payment(Decimal('6000.00'), date(2026, 7, 5))
        line = self._line('DRY-1', Decimal('6000.00'), date(2026, 7, 6))

        output = self._run(start_date='2026-07-01', end_date='2026-07-18')

        line.refresh_from_db()
        self.assertFalse(line.matched)
        self.assertIn('DRY RUN', output)
        self.assertIn('Would match 1', output)

    def test_resolves_existing_exception_pair_on_apply(self):
        payment = self._payment(Decimal('7000.00'), date(2026, 7, 5))
        line = self._line('EXC-1', Decimal('7000.00'), date(2026, 7, 6))
        recon = DailyReconciliation.objects.create(
            bank_account=self.bank_account, reconciliation_date=date(2026, 7, 6),
            uploaded_by=self.user, statement_file='bank_statements/x.csv', status='completed',
        )
        bank_exc = ReconciliationException.objects.create(
            reconciliation=recon, exception_type='bank_only', direction='CREDIT',
            bank_transaction_id=line.id, bank_amount=Decimal('7000.00'),
            bank_narration='unrelated narration', bank_date=date(2026, 7, 6),
        )
        erp_exc = ReconciliationException.objects.create(
            reconciliation=recon, exception_type='erp_only', direction='CREDIT',
            loan_payment_id=payment.id, erp_amount=Decimal('7000.00'),
            erp_narration='Transfer: unrelated text', erp_date=date(2026, 7, 5),
        )

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        bank_exc.refresh_from_db()
        erp_exc.refresh_from_db()
        self.assertTrue(bank_exc.resolved)
        self.assertTrue(erp_exc.resolved)
        self.assertIn('MANUAL', bank_exc.resolution_notes)
        self.assertIn('2026-07-01', bank_exc.resolution_notes)

    def test_bank_account_filter_narrows_scope(self):
        other_gl = Account.objects.create(code='2398', name='Other GL', account_level=Account.LEVEL_PARENT)
        bank2 = Bank.objects.create(bank_name='Other Bulk Bank', bank_code='981')
        other_account = BankAccount.objects.create(
            bank=bank2, account_number='0000000081', account_name='Other Bulk Account',
            gl_account=other_gl, account_manager=self.user,
        )
        self._payment(Decimal('8000.00'), date(2026, 7, 5))
        line = self._line('SCOPE-1', Decimal('8000.00'), date(2026, 7, 6))
        other_line = ReconciliationBankTransaction.objects.create(
            bank_account=other_account, bank_ref='OTHER-1', value_date=date(2026, 7, 6),
            direction='CREDIT', amount=Decimal('8000.00'), narration='n/a', matched=False,
        )

        self._run(
            start_date='2026-07-01', end_date='2026-07-18', apply=True,
            bank_account_id=other_account.id,
        )

        line.refresh_from_db()
        other_line.refresh_from_db()
        self.assertFalse(line.matched)  # different account than the one scoped, untouched
        self.assertFalse(other_line.matched)  # no ERP payment on ITS account, so no pair either

    def test_contradicted_narration_is_never_paired_even_as_only_option(self):
        # The exact live case: a bank line clearly naming one customer and
        # the only same-amount ERP payment clearly naming a DIFFERENT one
        # — nearest-date alone would have paired them (nothing else at
        # this amount), but the narration conflict must block it.
        self._payment(
            Decimal('4000.00'), date(2026, 7, 23),
            description='Loan repayment – LN-20260706-892715 | Ref: CPWInward:100004260723070805166115964890/MARVELLOU',
        )
        line = self._line(
            'KAFILAT-1', Decimal('4000.00'), date(2026, 7, 16),
            narration='CPWInward:100004260716190817165549851580/KAFILAT A Ref100229919329',
        )

        output = self._run(start_date='2026-07-01', end_date='2026-07-25', apply=True)

        line.refresh_from_db()
        self.assertFalse(line.matched)
        self.assertIn('SKIPPED (narration conflict)', output)
        self.assertIn('Matched 0', output)

    def test_confirmed_narration_preferred_over_closer_neutral_date(self):
        # Two same-amount ERP payments: one is CLOSER in date but shares no
        # narration text with the bank line at all (neutral, generic
        # "unrelated" text), the other is FARTHER in date but its
        # narration genuinely corresponds. The referenced one must win
        # even though it's not the nearest date.
        far_but_confirmed = self._payment(
            Decimal('5000.00'), date(2026, 7, 10),
            description='Transfer: OLUWASEUN BABATUNDE',
        )
        near_but_neutral = self._payment(
            Decimal('5000.00'), date(2026, 7, 6),
            description='Transfer: generic entry, no matching detail',
        )
        line = self._line(
            'PREF-1', Decimal('5000.00'), date(2026, 7, 5),
            narration='Transfer from OLUWASEUN BABATUNDE',
        )

        self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        line.refresh_from_db()
        self.assertTrue(line.matched)
        self.assertEqual(line.matched_erp_payment_id, far_but_confirmed.id)
        near_but_neutral  # the farther-in-time but unconfirmed candidate correctly loses

    def test_already_matched_payment_is_never_reused(self):
        payment = self._payment(Decimal('9000.00'), date(2026, 7, 5))
        already_claiming = self._line('ALREADY-1', Decimal('9000.00'), date(2026, 7, 1))
        already_claiming.matched = True
        already_claiming.matched_erp_payment_id = payment.id
        already_claiming.match_confidence = 'HIGH'
        already_claiming.save(update_fields=['matched', 'matched_erp_payment_id', 'match_confidence'])

        new_line = self._line('NEW-1', Decimal('9000.00'), date(2026, 7, 6))

        output = self._run(start_date='2026-07-01', end_date='2026-07-18', apply=True)

        new_line.refresh_from_db()
        self.assertFalse(new_line.matched)  # the only candidate payment is already claimed elsewhere
        self.assertIn('Matched 0', output)
