"""
Management command: audit_loan_book_gl_gap

Read-only audit. Investigates why the Trial Balance's "Customer Loan
Portfolio" (GL account 1150) total differs from the dashboard's "Loan
Book" figure (analytics/views.py DashboardView, Sum('outstanding_principal')
over loans with status in active/disbursed/defaulted).

There are two independent, legitimate-vs-suspect sources for this gap:

  1. EXPECTED — interest baked into the receivable. At disbursement, when
     a product has interest_income_account configured but no deferral
     accounts (the default — see LoanAccount.disburse()), the full
     scheduled interest is debited into the SAME per-loan GL account as
     the principal:
         Dr. Loan Receivable  disbursed_amount + total_interest
         Cr. Cash / Interest Income
     So a loan's GL child-account balance tracks
     (outstanding_principal + outstanding_interest), not principal alone.
     The dashboard, deliberately, only sums outstanding_principal (it says
     so in a comment — matches the PAR report's Gross Loan Portfolio
     definition). This alone explains a GL total that's HIGHER than the
     dashboard figure by roughly the sum of outstanding_interest across
     in-scope loans.

  2. SUSPECT — orphaned balance on out-of-scope loans. The dashboard only
     sums loans with status in ('active', 'disbursed', 'defaulted'). Any
     loan in another status (paid_off, written_off, rejected, cancelled,
     or a legacy-import status) whose GL child account still carries a
     nonzero balance contributes to the Trial Balance total but is
     invisible to the dashboard. This is the same category of issue as
     fix_terminal_loan_legacy_balance.py (loans marked terminal by a
     legacy import without the GL being fully cleared).

This command buckets the gap between these two causes and flags anything
left over as unexplained drift between Account.balance (the cached field
the Trial Balance report reads for CHILD accounts) and the loan's own
principal/interest fields, worth a closer look with inspect_loan_gl_trace.

Makes no changes — report only.

Usage:
    python manage.py audit_loan_book_gl_gap
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


IN_SCOPE_STATUSES = ('active', 'disbursed', 'defaulted')


class Command(BaseCommand):
    help = (
        'Read-only audit: reconciles the Trial Balance "Customer Loan Portfolio" (1150) '
        'total against the dashboard "Loan Book" figure and buckets the gap by cause.'
    )

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from accounts.models import Account

        # Account is branch-scoped, so code='1150' has one PARENT row per
        # branch, not a single tenant-wide row. Sum across all of them to
        # match a tenant-wide ("all branches") Trial Balance view.
        parents = list(Account.objects.filter(code='1150', account_level=Account.LEVEL_PARENT).select_related('branch'))
        if not parents:
            self.stdout.write(self.style.ERROR("No parent Account with code '1150' found."))
            return

        children = Account.objects.filter(parent__in=parents, is_deleted=False)
        gl_total = children.aggregate(t=Sum('balance'))['t'] or Decimal('0.00')
        self.stdout.write(self.style.MIGRATE_HEADING('1. GL side'))
        self.stdout.write(
            f'  Sum of Account.balance across {children.count()} child account(s) under '
            f'{len(parents)} branch-level 1150 parent(s): {gl_total:,.2f}'
        )
        for p in parents:
            branch_total = Account.objects.filter(parent=p, is_deleted=False).aggregate(
                t=Sum('balance'))['t'] or Decimal('0.00')
            branch_name = p.branch.name if p.branch_id else '(no branch)'
            self.stdout.write(f'    branch={branch_name:20} 1150 total={branch_total:,.2f}')
        self.stdout.write(
            "  (If the Trial Balance shows a different 1150 total than this, a parent itself "
            "has direct postings — allow_manual_entries — not modeled by this command.)"
        )

        loans = LoanAccount.all_objects.filter(is_deleted=False).select_related('account')

        in_scope = loans.filter(status__in=IN_SCOPE_STATUSES)
        dashboard_total = in_scope.aggregate(t=Sum('outstanding_principal'))['t'] or Decimal('0.00')
        in_scope_interest = in_scope.aggregate(t=Sum('outstanding_interest'))['t'] or Decimal('0.00')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('2. Dashboard side'))
        self.stdout.write(f'  Loans in dashboard scope (status in {IN_SCOPE_STATUSES}): {in_scope.count()}')
        self.stdout.write(f'  Sum(outstanding_principal) (= dashboard "Loan Book"):    {dashboard_total:,.2f}')
        self.stdout.write(f'  Sum(outstanding_interest) on those same loans:          {in_scope_interest:,.2f}')
        self.stdout.write(f'  Sum(principal + interest) on those same loans:         {(dashboard_total + in_scope_interest):,.2f}')

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('3. Out-of-scope loans still carrying a GL balance'))
        out_of_scope = loans.exclude(status__in=IN_SCOPE_STATUSES).exclude(account__isnull=True)
        out_of_scope_with_balance = [l for l in out_of_scope if l.account and l.account.balance != Decimal('0.00')]
        out_of_scope_total = sum((l.account.balance for l in out_of_scope_with_balance), Decimal('0.00'))

        if out_of_scope_with_balance:
            self.stdout.write(self.style.ERROR(
                f'  {len(out_of_scope_with_balance)} loan(s) NOT in dashboard scope still carry a '
                f'nonzero GL balance, totalling {out_of_scope_total:,.2f}:'
            ))
            for l in sorted(out_of_scope_with_balance, key=lambda x: -abs(x.account.balance))[:30]:
                self.stdout.write(
                    f'    {l.loan_number:20} status={l.status:12} '
                    f'gl_balance={l.account.balance:>14,.2f}  '
                    f'outstanding_principal={l.outstanding_principal:>14,.2f}  '
                    f'outstanding_interest={l.outstanding_interest:>14,.2f}'
                )
            if len(out_of_scope_with_balance) > 30:
                self.stdout.write(f'    ... and {len(out_of_scope_with_balance) - 30} more.')
        else:
            self.stdout.write(self.style.SUCCESS('  None — every out-of-scope loan has a zero GL balance.'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('4. Reconciliation'))
        explained = in_scope_interest + out_of_scope_total
        gap = gl_total - dashboard_total
        unexplained = gap - explained
        self.stdout.write(f'  GL total (1150):                         {gl_total:,.2f}')
        self.stdout.write(f'  Dashboard "Loan Book":                    {dashboard_total:,.2f}')
        self.stdout.write(f'  Gap (GL - dashboard):                     {gap:,.2f}')
        self.stdout.write(f'  Explained by interest-on-receivable:      {in_scope_interest:,.2f}')
        self.stdout.write(f'  Explained by out-of-scope GL balances:    {out_of_scope_total:,.2f}')
        self.stdout.write(f'  Unexplained residual:                     {unexplained:,.2f}')

        if abs(unexplained) < Decimal('1.00'):
            self.stdout.write(self.style.SUCCESS(
                '\n  Gap is fully explained by (1) interest included in the GL receivable but not in '
                'the dashboard\'s principal-only figure, and (2) out-of-scope loans with a residual '
                'GL balance. No further action needed unless bucket 3 above should be corrected.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'\n  {unexplained:,.2f} is NOT explained by either known cause — this is real drift '
                f'between Account.balance and loan principal/interest fields on in-scope loans '
                f'(rounding aside). Worth spot-checking a few in-scope loans with '
                f'`inspect_loan_gl_trace <loan_number>` to find where the postings diverge.'
            ))
