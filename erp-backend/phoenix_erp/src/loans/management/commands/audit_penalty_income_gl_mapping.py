"""
Management command: audit_penalty_income_gl_mapping

Read-only audit. Investigates why a penalty income account (e.g. "Loan
Penalty (2026)") may show no activity other than the opening-balance
migration entry and a manual reversal — i.e. no *organic* GL postings from
actual client repayments, even though loans are known to be charging and
collecting penalties.

Context: LoanAccount.record_payment() (loans/models.py) only credits
`LoanProduct.penalty_income_account` for the penalty portion of a payment
IF that FK is configured. When it is NULL, the penalty amount collected is
silently folded into the Loan Receivable credit instead (see
`loan_account_credit += penalty_payment` in record_payment) — the cash is
correctly applied against the client's balance, but no income is ever
recognized on any P&L account. It doesn't show up as an error anywhere;
the GL just never receives the entry. This is the same class of bug
already found for interest income (see audit_loan_interest_gl_mapping.py /
report_pooled_interest_misposting.py) — this command is the penalty-income
analogue.

This command checks two independent things:

  1. Per LoanProduct: is penalty_income_account configured at all? If not,
     sum LoanRepaymentSchedule.penalty_paid across that product's loans —
     this is penalty money actually collected from clients that never
     posted as income anywhere (it is sitting inside Loan Receivable
     credits instead, indistinguishable from principal in the GL).

  2. Per penalty_income_account actually in use: list what has ever been
     credited to it, split into "opening balance / migration" (series
     OBMIG), "manual/reclass" (anything that isn't the LNPMT repayment
     series — e.g. a manual reversal), and "organic" (LNPMT credits, i.e.
     real repayment-time penalty income). If an account's organic total is
     zero while loans under it are actively collecting penalties, that's
     the smoking gun: the ledger balance is just the migrated legacy total
     minus whatever was manually removed from it, with no live repayment
     activity ever landing there.

Makes no changes — report only.

Usage:
    python manage.py audit_penalty_income_gl_mapping
    python manage.py audit_penalty_income_gl_mapping --account-code 4211
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only audit: is loan penalty income actually posting to GL, or silently '
        'folding into Loan Receivable because penalty_income_account is unconfigured?'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--account-code',
            dest='account_code',
            default=None,
            help='Only inspect posting history for this specific penalty income account code.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanProduct, LoanAccount, LoanRepaymentSchedule
        from transactions.models import TransactionEntry

        account_code = options['account_code']

        self.stdout.write(self.style.MIGRATE_HEADING(
            '1. LoanProduct -> penalty_income_account, and unposted penalty collections'
        ))
        products = LoanProduct.objects.select_related(
            'product', 'penalty_income_account'
        ).filter(is_deleted=False)

        if not products.exists():
            self.stdout.write(self.style.WARNING('No LoanProduct rows found in this database.'))

        total_unposted = Decimal('0.00')
        for p in products:
            acct = p.penalty_income_account
            product_name = p.product.name if p.product_id else f'LoanProduct#{p.pk}'
            acct_str = f'{acct.code} - {acct.name}' if acct else 'NONE'

            loans_qs = LoanAccount.all_objects.filter(product=p, is_deleted=False)
            collected = LoanRepaymentSchedule.all_objects.filter(
                loan__in=loans_qs,
            ).aggregate(total=Sum('penalty_paid'))['total'] or Decimal('0.00')

            if not acct:
                total_unposted += collected
                flag = (
                    f'** NO PENALTY INCOME ACCOUNT SET — {collected:,.2f} in penalty_paid across '
                    f'this product\'s loans was collected from clients but never posted as income '
                    f'anywhere (folded into Loan Receivable at repayment time).'
                    if collected else
                    '** NO PENALTY INCOME ACCOUNT SET (no penalties collected yet under this product).'
                )
                self.stdout.write(self.style.WARNING(
                    f'  [{product_name}] -> {acct_str}  penalty_paid_total={collected:,.2f}\n      {flag}'
                ))
            else:
                self.stdout.write(self.style.SUCCESS(
                    f'  [{product_name}] -> {acct_str}  penalty_paid_total={collected:,.2f}'
                ))

        if total_unposted:
            self.stdout.write(self.style.ERROR(
                f'\n  TOTAL penalty income collected but never posted to any GL account: '
                f'{total_unposted:,.2f}'
            ))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            '2. Posting history of each penalty_income_account actually in use'
        ))

        accounts = {p.penalty_income_account for p in products if p.penalty_income_account}

        if account_code:
            from accounts.models import Account
            try:
                explicit_acct = Account.objects.get(code=account_code)
            except Account.DoesNotExist:
                self.stdout.write(self.style.ERROR(f"No Account found with code '{account_code}'."))
                return
            if explicit_acct not in accounts:
                self.stdout.write(self.style.ERROR(
                    f"** Account {explicit_acct.code} - {explicit_acct.name} is NOT the "
                    f"penalty_income_account of any active LoanProduct — nothing currently routes "
                    f"live repayment income to it, regardless of what its ledger shows below."
                ))
            accounts = {explicit_acct}

        if not accounts:
            self.stdout.write(self.style.WARNING('No configured penalty_income_account(s) to inspect.'))
            return

        for acct in accounts:
            entries = TransactionEntry.objects.filter(
                account=acct, side=TransactionEntry.CREDIT,
            ).select_related('transaction', 'transaction__series')
            debits = TransactionEntry.objects.filter(
                account=acct, side=TransactionEntry.DEBIT,
            ).select_related('transaction', 'transaction__series')

            migration_total = Decimal('0.00')
            organic_total = Decimal('0.00')
            other_credit_total = Decimal('0.00')
            other_credit_entries = []

            for e in entries:
                series_code = e.transaction.series.code if e.transaction.series_id else ''
                if series_code == 'OBMIG':
                    migration_total += e.amount
                elif series_code == 'LNPMT':
                    organic_total += e.amount
                else:
                    other_credit_total += e.amount
                    other_credit_entries.append(e)

            reversal_total = Decimal('0.00')
            reversal_entries = []
            for e in debits:
                reversal_total += e.amount
                reversal_entries.append(e)

            self.stdout.write(f'\n  Account {acct.code} - {acct.name} (current balance={acct.balance:,.2f})')
            self.stdout.write(f'    Migration opening balance (OBMIG credits): {migration_total:,.2f}')
            self.stdout.write(f'    Organic repayment-time credits (LNPMT):    {organic_total:,.2f}')
            self.stdout.write(f'    Other credits (manual/reclass, non-LNPMT): {other_credit_total:,.2f}')
            self.stdout.write(f'    Debits against this account (reversals/etc): {reversal_total:,.2f}')

            if migration_total and not organic_total:
                self.stdout.write(self.style.ERROR(
                    '    ** This account has NEVER received a live repayment-time penalty credit. '
                    'Its entire balance is the migrated legacy total plus/minus manual journal '
                    'entries — not a reflection of any Phoenix-recorded penalty activity.'
                ))

            for e in other_credit_entries:
                t = e.transaction
                self.stdout.write(
                    f'      [other credit] {t.date} {t.reference_number} "{t.description}" '
                    f'amount={e.amount:,.2f} created_by_id={t.created_by_id}'
                )
            for e in reversal_entries:
                t = e.transaction
                self.stdout.write(
                    f'      [debit/reversal] {t.date} {t.reference_number} "{t.description}" '
                    f'amount={e.amount:,.2f} created_by_id={t.created_by_id}'
                )

        self.stdout.write('')
        self.stdout.write(
            'No changes made. If an account shows organic_total=0 while its product(s) have '
            'penalty_paid_total > 0, the collected penalty money is misclassified inside Loan '
            'Receivable, not missing — reclassifying it requires a correcting journal entry '
            '(Dr. Loan Receivable / Cr. Penalty Income) for the affected period, decided per '
            'loan/product, not automated by this command.'
        )
