"""
Management command: report_pooled_interest_misposting

Read-only. Quantifies how much loan interest income has already been
posted to the shared generic account 4200-LNINT ("Loan Interest Income")
on behalf of the three products that should each have their own account
(Daily Collection Loan -> 4212, Weekly Loan -> 4207, Monthly Loan -> 4206).
See `audit_loan_interest_gl_mapping` and `fix_loan_interest_account_mapping`
for the underlying config bug this is quantifying the impact of.

Interest reaches 4200-LNINT via two different code paths in loans/models.py,
matched here separately since they're found differently:

  1. At disbursement (LoanAccount.disburse(), LNDIS series) — the full
     scheduled interest is booked in one journal entry, directly linked via
     LoanAccount.disbursement_journal_entry. Precise match.

  2. At repayment, only for loans whose product had a NULL
     interest_income_account at disbursement time (LoanAccount.record_payment(),
     LNPMT series, "legacy cash-basis fallback" branch) — interest is
     recognized incrementally as collected, using the CURRENT product FK.
     There's no direct FK from a repayment journal entry back to its
     LoanAccount, so these are matched by parsing the transaction
     description ("Loan repayment - <loan_number>"), which record_payment()
     always sets in that exact format.

Any 4200-LNINT credit that can't be attributed to one of these three
products via either path is reported separately as "unattributed" so the
totals stay honest rather than silently dropping unmatched amounts.

This command does NOT post any correcting journal entries — it only
reports, so the numbers can be reviewed before deciding on a reclassification
(Dr. 4200-LNINT / Cr. 4206|4207|4212 per product) for the affected period.

Usage:
    python manage.py report_pooled_interest_misposting
"""
import re
from collections import defaultdict
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError


PRODUCT_NAMES = ['Daily Collection Loan', 'Weekly Loan', 'Monthly Loan']
POOLED_ACCOUNT_CODE = '4200-LNINT'

REPAYMENT_DESC_RE = re.compile(r'^Loan repayment\s*[–-]\s*(\S+)')


class Command(BaseCommand):
    help = (
        'Read-only report: how much interest income currently sitting in 4200-LNINT '
        'is attributable to Daily/Weekly/Monthly loan products, split by product.'
    )

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanProduct
        from transactions.models import Transaction, TransactionEntry
        from common.models import Account

        try:
            pooled_account = Account.objects.get(code=POOLED_ACCOUNT_CODE)
        except Account.DoesNotExist:
            raise CommandError(f"Account with code '{POOLED_ACCOUNT_CODE}' not found.")

        products = LoanProduct.objects.filter(
            product__name__in=PRODUCT_NAMES, is_deleted=False
        ).select_related('product')
        product_by_id = {p.id: p.product.name for p in products}

        loans = LoanAccount.objects.filter(
            product_id__in=product_by_id.keys(), is_deleted=False
        ).only('id', 'loan_number', 'product_id', 'disbursement_journal_entry_id')

        loans_by_number = {loan.loan_number: loan for loan in loans}
        disbursement_txn_to_product = {
            loan.disbursement_journal_entry_id: product_by_id[loan.product_id]
            for loan in loans if loan.disbursement_journal_entry_id
        }

        totals = defaultdict(Decimal)      # product_name -> amount
        origin_totals = defaultdict(Decimal)  # (product_name, origin) -> amount
        unattributed = Decimal('0.00')
        unattributed_count = 0

        entries = TransactionEntry.objects.filter(
            account=pooled_account, side=TransactionEntry.CREDIT
        ).select_related('transaction', 'transaction__series')

        for entry in entries:
            txn = entry.transaction
            series_code = txn.series.code if txn.series_id else ''

            product_name = None
            origin = None

            if series_code == 'LNDIS':
                product_name = disbursement_txn_to_product.get(txn.id)
                origin = 'disbursement'
            elif series_code == 'LNPMT':
                m = REPAYMENT_DESC_RE.match(txn.description or '')
                if m:
                    loan = loans_by_number.get(m.group(1))
                    if loan:
                        product_name = product_by_id.get(loan.product_id)
                        origin = 'repayment'

            if product_name:
                totals[product_name] += entry.amount
                origin_totals[(product_name, origin)] += entry.amount
            else:
                unattributed += entry.amount
                unattributed_count += 1

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'Interest posted to {pooled_account.code} - {pooled_account.name} by product:'
        ))
        grand_total = Decimal('0.00')
        for product_name in PRODUCT_NAMES:
            amount = totals.get(product_name, Decimal('0.00'))
            grand_total += amount
            disb = origin_totals.get((product_name, 'disbursement'), Decimal('0.00'))
            pmt = origin_totals.get((product_name, 'repayment'), Decimal('0.00'))
            self.stdout.write(
                f'  {product_name:25} total={amount:>14,.2f}   '
                f'(disbursement={disb:>12,.2f}, repayment={pmt:>12,.2f})'
            )

        self.stdout.write('')
        self.stdout.write(
            f'  {"Unattributed":25} total={unattributed:>14,.2f}   ({unattributed_count} entries)'
        )
        self.stdout.write('')
        self.stdout.write(self.style.SUCCESS(
            f'Grand total attributable to Daily/Weekly/Monthly products: {grand_total:,.2f}'
        ))
        if unattributed:
            self.stdout.write(self.style.WARNING(
                f'{unattributed:,.2f} in {pooled_account.code} could not be matched to these '
                f'three products (may be other products correctly using this generic account, '
                f'or repayments whose description format differs — review manually).'
            ))
        self.stdout.write('')
        self.stdout.write(
            'These amounts, if you choose to reclassify, would need correcting journal entries: '
            'Dr. 4200-LNINT / Cr. <product\'s correct account> for each product total above. '
            'No entries have been posted by this command.'
        )
