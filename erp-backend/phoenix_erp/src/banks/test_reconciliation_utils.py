"""
Regex extraction tests for banks.reconciliation_utils.

LoanAccount.record_payment() (loans/models.py) writes the journal
description as "Loan repayment – <loan_number> | Ref: <bank_reference>"
(truncated to 255 chars) — these tests pin that exact format so a change to
either side doesn't silently break reconciliation's loan-number/reference
extraction. No DB is touched; the regexes are pure module attributes.
"""
from django.test import SimpleTestCase

from banks.reconciliation_utils import _LOAN_NUMBER_RE, _BANK_REFERENCE_RE


class ErpPaymentDescriptionParsingTests(SimpleTestCase):

    def test_extracts_loan_number_and_bank_reference(self):
        description = "Loan repayment – LN-2026-00123 | Ref: TRF/20260701/778899"
        loan_match = _LOAN_NUMBER_RE.search(description)
        ref_match = _BANK_REFERENCE_RE.search(description)

        self.assertEqual(loan_match.group(1).strip(), 'LN-2026-00123')
        self.assertEqual(ref_match.group(1).strip(), 'TRF/20260701/778899')

    def test_handles_missing_bank_reference(self):
        description = "Loan repayment – LN-2026-00456"
        loan_match = _LOAN_NUMBER_RE.search(description)
        ref_match = _BANK_REFERENCE_RE.search(description)

        self.assertEqual(loan_match.group(1).strip(), 'LN-2026-00456')
        self.assertIsNone(ref_match)

    def test_handles_ascii_hyphen_variant(self):
        # record_payment() uses an en dash ("–"), but tolerate a plain hyphen too
        description = "Loan repayment - LN-2026-00999 | Ref: USSD12345"
        loan_match = _LOAN_NUMBER_RE.search(description)
        self.assertEqual(loan_match.group(1).strip(), 'LN-2026-00999')

    def test_still_matches_after_255_char_truncation(self):
        long_ref = 'X' * 300
        description = f"Loan repayment – LN-2026-00789 | Ref: {long_ref}"[:255]
        ref_match = _BANK_REFERENCE_RE.search(description)
        self.assertIsNotNone(ref_match)

    def test_no_match_on_unrelated_description(self):
        description = "Manual GL adjustment for month-end close"
        self.assertIsNone(_LOAN_NUMBER_RE.search(description))
        self.assertIsNone(_BANK_REFERENCE_RE.search(description))
