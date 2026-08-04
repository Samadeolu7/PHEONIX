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

  3. EXPECTED (once identified) — penalties/fees folded into the
     receivable. record_payment() credits penalty_payment / fee_payment
     to the Loan Receivable account (loan_account_credit) instead of a
     dedicated income account whenever LoanProduct.penalty_income_account
     / fee_income_account is not configured (see loans/models.py
     ~line 1204-1209) — the same misrouting already documented in
     audit_penalty_income_gl_mapping.py. Critically, outstanding_penalties
     and outstanding_fees are separate fields from outstanding_principal/
     outstanding_interest, so every such payment shrinks the GL balance
     WITHOUT shrinking (principal + interest) — pushing the GL total
     BELOW what bucket 1 alone would predict.

This command buckets the gap between these causes and flags anything
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

        loans = LoanAccount.all_objects.filter(is_deleted=False).select_related(
            'account', 'product__product', 'product__penalty_income_account', 'product__fee_income_account'
        )

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
        self.stdout.write(self.style.MIGRATE_HEADING(
            '3b. Penalties/fees folded into Loan Receivable (no income account configured)'
        ))
        misrouted_by_product = {}
        misrouted_total = Decimal('0.00')
        for l in in_scope:
            product = l.product
            product_name = product.product.name if product.product_id else f'LoanProduct#{product.pk}'
            entry = misrouted_by_product.setdefault(product_name, {
                'penalty_unrouted': not product.penalty_income_account_id,
                'fee_unrouted': not product.fee_income_account_id,
                'penalties_paid': Decimal('0.00'),
                'fees_paid': Decimal('0.00'),
            })
            if entry['penalty_unrouted']:
                entry['penalties_paid'] += l.penalties_paid
                misrouted_total += l.penalties_paid
            if entry['fee_unrouted']:
                entry['fees_paid'] += l.fees_paid
                misrouted_total += l.fees_paid

        any_misrouted = False
        for product_name, e in misrouted_by_product.items():
            if e['penalty_unrouted'] and e['penalties_paid'] or e['fee_unrouted'] and e['fees_paid']:
                any_misrouted = True
                self.stdout.write(self.style.WARNING(
                    f'  [{product_name}] penalty_income_account={"NOT SET" if e["penalty_unrouted"] else "set"} '
                    f'(penalties_paid folded in: {e["penalties_paid"]:,.2f})  '
                    f'fee_income_account={"NOT SET" if e["fee_unrouted"] else "set"} '
                    f'(fees_paid folded in: {e["fees_paid"]:,.2f})'
                ))
        if any_misrouted:
            self.stdout.write(self.style.ERROR(
                f'\n  Total penalties+fees folded into Loan Receivable instead of an income account: '
                f'{misrouted_total:,.2f}. These reduce the GL balance without reducing '
                f'outstanding_principal/outstanding_interest (they live in the separate '
                f'outstanding_penalties/outstanding_fees fields), which pushes GL BELOW what '
                f'bucket 1 alone predicts. See audit_penalty_income_gl_mapping for the fix path.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('  None — every product routes penalties/fees to a dedicated income account.'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING(
            '3c. Per-loan drift on in-scope loans (Account.balance vs principal+interest)'
        ))
        self.stdout.write(
            '  Absent write-offs/misrouting, each loan\'s GL child balance should exactly equal '
            '(outstanding_principal + outstanding_interest). Any nonzero difference here is a '
            'candidate for the unexplained residual below — sums to it exactly if buckets 1-3b '
            'are the only other causes.'
        )
        drift_rows = []
        for l in in_scope:
            actual = l.account.balance if l.account_id else Decimal('0.00')
            expected = l.outstanding_principal + l.outstanding_interest
            drift = actual - expected
            if drift != Decimal('0.00'):
                drift_rows.append((l, actual, expected, drift))

        drift_total = sum((d for _, _, _, d in drift_rows), Decimal('0.00'))
        if drift_rows:
            self.stdout.write(self.style.ERROR(
                f'\n  {len(drift_rows)} in-scope loan(s) have a nonzero GL/app drift, totalling {drift_total:,.2f}:'
            ))
            for l, actual, expected, drift in sorted(drift_rows, key=lambda r: -abs(r[3]))[:40]:
                self.stdout.write(
                    f'    {l.loan_number:20} status={l.status:10} disb={l.disbursement_date} '
                    f'gl_balance={actual:>14,.2f}  expected={expected:>14,.2f}  drift={drift:>12,.2f}'
                )
            if len(drift_rows) > 40:
                self.stdout.write(f'    ... and {len(drift_rows) - 40} more.')

            by_product = {}
            for l, _, _, drift in drift_rows:
                name = l.product.product.name if l.product.product_id else f'LoanProduct#{l.product_id}'
                by_product[name] = by_product.get(name, Decimal('0.00')) + drift
            self.stdout.write('\n  Drift by product:')
            for name, total in sorted(by_product.items(), key=lambda kv: -abs(kv[1])):
                self.stdout.write(f'    {name:35} {total:>14,.2f}')

            by_month = {}
            for l, _, _, drift in drift_rows:
                key = l.disbursement_date.strftime('%Y-%m') if l.disbursement_date else 'unknown'
                by_month[key] = by_month.get(key, Decimal('0.00')) + drift
            self.stdout.write('\n  Drift by disbursement month:')
            for month, total in sorted(by_month.items()):
                self.stdout.write(f'    {month:10} {total:>14,.2f}')
        else:
            self.stdout.write(self.style.SUCCESS('  None — every in-scope loan\'s GL balance matches principal+interest exactly.'))

        self.stdout.write('')
        self.stdout.write(self.style.MIGRATE_HEADING('4. Reconciliation'))
        explained = in_scope_interest + out_of_scope_total - misrouted_total
        gap = gl_total - dashboard_total
        unexplained = gap - explained
        self.stdout.write(f'  GL total (1150):                         {gl_total:,.2f}')
        self.stdout.write(f'  Dashboard "Loan Book":                    {dashboard_total:,.2f}')
        self.stdout.write(f'  Gap (GL - dashboard):                     {gap:,.2f}')
        self.stdout.write(f'  Explained by interest-on-receivable:      {in_scope_interest:,.2f}')
        self.stdout.write(f'  Explained by out-of-scope GL balances:    {out_of_scope_total:,.2f}')
        self.stdout.write(f'  Less: penalties/fees folded into GL:      -{misrouted_total:,.2f}')
        self.stdout.write(f'  Unexplained residual:                     {unexplained:,.2f}')

        if abs(unexplained) < Decimal('1.00'):
            self.stdout.write(self.style.SUCCESS(
                '\n  Gap is fully explained by (1) interest included in the GL receivable but not in '
                'the dashboard\'s principal-only figure, (2) out-of-scope loans with a residual GL '
                'balance, and (3) penalties/fees folded into the receivable. Nothing left to fix here '
                'unless buckets 2/3 above should themselves be corrected.'
            ))
        else:
            self.stdout.write(self.style.WARNING(
                f'\n  {unexplained:,.2f} is NOT explained by any of the three known causes — see '
                f'section 3c above for the specific in-scope loans carrying that drift. Spot-check '
                f'a few with `inspect_loan_gl_trace <loan_number>` to find where the postings diverge.'
            ))
