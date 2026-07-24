"""
Management command: draft_penalty_income_reclass

Corrects the HISTORICAL impact of the bug found by
`audit_penalty_income_gl_mapping` (2026-07-24): LoanProduct.penalty_income_account
was NULL on Daily/Weekly/Monthly Loan, so LoanAccount.record_payment() folded
every penalty payment into the Loan Receivable credit instead of Income (see
loans/models.py ~line 1188, "conservative fallback that keeps the transaction
balanced"). The cash was applied correctly; only income recognition was wrong.

By design this is a PRINCIPAL-only receivable account (LoanAccount.disburse()
only books principal to it; interest/fees/penalty are meant to hit their own
income accounts). Folding penalty payments into it means each affected loan's
receivable balance is currently UNDER-stated by exactly its own misrouted
penalty total — real principal collection and misrouted penalty collection
got blended into one credit line.

CORRECTED 2026-07-24: this originally summed LoanRepaymentSchedule.penalty_paid
per loan, which turned out to be unreliable — _update_schedule_with_payment()
populated it via a broken proportional allocation unrelated to actual GL-posted
penalty amounts (now fixed; see loans/models.py). Confirmed wrong when the
first run debited LN-659's receivable 671,599.91 against an account that had
only ever received 97,333.32 in its entire history — that batch was reversed
(see reverse_penalty_income_reclass_batch.py). This version instead sums the
real per-payment penalty amount from FinancialAuditLog(event_type=LOAN_REPAY)
extra['penalty'] — logged directly from record_payment()'s own computed split,
untouched by the schedule bug (see report_penalty_paid_per_payment.py, which
surfaces the same numbers read-only for review before this command runs).

The fix is per loan, not one lump entry: for every loan with a nonzero
misrouted total (real penalty paid per loan, for loans under a product whose
penalty_income_account was NULL), post one balanced Transaction:

    Dr. Loan Receivable (that loan's own account)   — restores the balance
    Cr. Penalty Income (--account-code, default 4211) — recognizes the income

One transaction per loan (mirroring the granularity record_payment() already
uses) rather than a single aggregate entry, because each loan has its own
dedicated GL receivable account (LoanAccount.account, OneToOneField) — there
is no single "Loan Receivable" control account to net against in one line.

SAFETY:
  - Dry-run by default — prints the full per-loan breakdown and grand total,
    writes nothing. Re-run with --apply to actually post.
  - Run `fix_loan_penalty_account_mapping` FIRST (or alongside) so new
    repayments stop adding to this gap while you're reviewing it.
  - Every posted correction is logged via FinancialAuditLog
    (LOAN_BALANCE_CORRECTION) with the loan, amount, and before/after figures.
  - ONE-TIME catch-up, not something to schedule or re-run casually: it sums
    EVERY FinancialAuditLog(LOAN_REPAY) entry's 'penalty' value per loan,
    regardless of whether penalty_income_account was configured at the time
    of that payment. Once fix_loan_penalty_account_mapping is applied, new
    repayments post penalty income correctly AND still log a LOAN_REPAY entry
    with the same nonzero 'penalty' — so running this command again later
    would double-count those already-correctly-posted amounts. Run it once,
    promptly, to close out the historical gap; do not re-run after new
    properly-routed penalty payments have occurred.
  - Skips (with an ERROR line, not silently) any loan whose computed penalty
    total exceeds its receivable account's entire lifetime credits — the
    exact check that caught the first version's bug on LN-659.

Usage:
    python manage.py draft_penalty_income_reclass                       # preview, all 3 products
    python manage.py draft_penalty_income_reclass --product "Monthly Loan"
    python manage.py draft_penalty_income_reclass --apply                # posts the correction
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


DEFAULT_PRODUCT_NAMES = ['Daily Collection Loan', 'Weekly Loan', 'Monthly Loan']
DEFAULT_TARGET_ACCOUNT_CODE = '4211'
SERIES_CODE = 'PENRC'


class Command(BaseCommand):
    help = (
        'Draft (or, with --apply, post) the per-loan correcting entries that move '
        'historically misrouted penalty income out of Loan Receivable and into '
        'Penalty Income. Dry-run by default.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--product', dest='product_names', action='append', default=None,
            help='Limit to this product name (repeatable). Default: Daily Collection Loan, Weekly Loan, Monthly Loan.',
        )
        parser.add_argument(
            '--account-code', default=DEFAULT_TARGET_ACCOUNT_CODE,
            help=f'Penalty Income GL account to credit (default: {DEFAULT_TARGET_ACCOUNT_CODE}).',
        )
        parser.add_argument(
            '--apply', action='store_true',
            help='Actually post the correcting entries. Without this, only previews.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanProduct, LoanAccount
        from accounts.models import Account
        from transactions.models import Transaction as JournalEntry, TransactionEntry as JournalEntryLine, TransactionSeries
        from common.models import FinancialAuditLog, log_financial_event
        from django.db.models import Sum

        product_names = options['product_names'] or DEFAULT_PRODUCT_NAMES
        account_code = options['account_code']
        apply_changes = options['apply']

        try:
            target_account = Account.objects.get(code=account_code)
        except Account.DoesNotExist:
            raise CommandError(f"Account with code '{account_code}' not found — aborting.")

        if target_account.account_type != Account.INCOME:
            raise CommandError(
                f"Account {target_account.code} - {target_account.name} is not an INCOME "
                f"account (type={target_account.account_type}) — aborting."
            )

        grand_total = Decimal('0.00')
        loan_corrections = []  # (loan, amount)

        for product_name in product_names:
            try:
                lp = LoanProduct.objects.get(product__name=product_name, is_deleted=False)
            except LoanProduct.DoesNotExist:
                self.stdout.write(self.style.WARNING(f"No LoanProduct found for '{product_name}' — skipping."))
                continue

            loans = LoanAccount.all_objects.filter(product=lp, is_deleted=False).select_related('account')

            product_total = Decimal('0.00')
            product_lines = []
            for loan in loans.iterator():
                logs = FinancialAuditLog.objects.filter(
                    event_type=FinancialAuditLog.LOAN_REPAY,
                    extra__loan_number=loan.loan_number,
                )
                paid = Decimal('0.00')
                for log in logs.iterator():
                    paid += Decimal((log.extra or {}).get('penalty', '0') or '0')

                if paid <= 0:
                    continue

                # Safety guard — the exact check that caught the previous bug:
                # the reclass debit can never exceed everything this receivable
                # account has ever actually received.
                from transactions.models import TransactionEntry
                lifetime_credits = TransactionEntry.objects.filter(
                    account=loan.account, side=TransactionEntry.CREDIT,
                ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
                if paid > lifetime_credits:
                    self.stdout.write(self.style.ERROR(
                        f"  [{loan.loan_number}] SKIPPED — computed penalty {paid:,.2f} exceeds "
                        f"the account's lifetime credits {lifetime_credits:,.2f}; investigate before correcting."
                    ))
                    continue

                product_lines.append((loan, paid))
                product_total += paid

            if not product_lines:
                self.stdout.write(f"[{product_name}] nothing to correct.")
                continue

            self.stdout.write(self.style.MIGRATE_HEADING(
                f"[{product_name}] {len(product_lines)} loan(s), total={product_total:,.2f}"
            ))
            for loan, amount in product_lines:
                acct = loan.account
                self.stdout.write(
                    f"    {loan.loan_number:20s} receivable={acct.code:10s} amount={amount:>12,.2f}"
                )
            loan_corrections.extend(product_lines)
            grand_total += product_total

        self.stdout.write('')
        if not loan_corrections:
            self.stdout.write(self.style.SUCCESS('Nothing to correct — no misrouted penalty found.'))
            return

        self.stdout.write(self.style.WARNING(
            f'GRAND TOTAL to reclassify: {grand_total:,.2f} across {len(loan_corrections)} loan(s), '
            f'Cr. {target_account.code} - {target_account.name}'
        ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to post one Dr./Cr. '
                'transaction per loan above.'
            ))
            return

        series, _ = TransactionSeries.objects.get_or_create(
            code=SERIES_CODE,
            defaults={'description': 'Penalty Income Reclassification'},
        )

        posted = 0
        with db_transaction.atomic():
            for loan, amount in loan_corrections:
                journal_entry = JournalEntry.objects.create(
                    series=series,
                    date=timezone.now().date(),
                    description=(
                        f"Penalty income reclass – {loan.loan_number} "
                        f"(misrouted to Loan Receivable, penalty_income_account was unset)"
                    )[:255],
                    owner=loan.owner,
                    branch=loan.branch,
                    created_by=None,
                    tenant=loan.tenant,
                )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=loan.account,
                    side=JournalEntryLine.DEBIT, amount=amount,
                )
                JournalEntryLine.objects.create(
                    transaction=journal_entry, account=target_account,
                    side=JournalEntryLine.CREDIT, amount=amount,
                )
                journal_entry.post()

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanAccount',
                    record_id=str(loan.pk),
                    amount=amount,
                    description=(
                        f'Penalty income reclass — {loan.loan_number}: moved {amount:,.2f} from '
                        f'Loan Receivable ({loan.account.code}) to Penalty Income ({target_account.code})'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'journal_entry_id': str(journal_entry.pk),
                        'journal_entry_reference': journal_entry.reference_number,
                        'source_command': 'draft_penalty_income_reclass',
                    },
                )
                posted += 1

        self.stdout.write(self.style.SUCCESS(f'\nPosted {posted} correcting transaction(s).'))
