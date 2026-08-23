"""
Management command: audit_loan_outstanding_vs_gl_truth

Read-only follow-up to audit_negative_outstanding_balances. That command
found 78 loans with a negative outstanding_principal/interest/fees/penalties
field. Most are negligible (sub-naira schedule-rounding on loans that never
received a payment). This command drills into the loans that DID receive
real payments, to work out exactly what each outstanding_* field SHOULD be
and — critically — whether correcting outstanding_interest by simply
shifting the difference into/out of outstanding_principal is even safe.

It isn't, in general. outstanding_principal is meant to track the real GL
Loan Receivable balance (self.account.balance) — every record_payment()
credits that account by exactly principal_payment (see loans/models.py
record_payment(), the `loan_account_credit` line), so the two move in
lockstep. If we "fixed" outstanding_interest by algebraically subtracting
the same delta from outstanding_principal (to keep total_outstanding
unchanged), we'd silently desync outstanding_principal from the real GL
balance — trading a visible bug (negative interest) for an invisible one
(wrong principal). So this command computes the two corrections
independently, from two different sources of truth:

  correct_outstanding_interest  = Sum(schedule.interest_due) - Sum(schedule.interest_paid)
  correct_outstanding_fees      = Sum(schedule.fees_due)     - Sum(schedule.fees_paid)
  correct_outstanding_principal = self.account.balance   (the real GL Loan Receivable balance)

outstanding_penalties is left out of this comparison — it's already
self-correcting via update_loan_status's daily cron (recomputed from
calculate_late_penalty() every run), not seeded once and drifted.

For legacy-imported loans (origin=LEGACY_IMPORT), import_legacy_data.py
never set outstanding_interest at all (defaults to 0) and never posted a
per-loan LNDIS disbursement entry — the GL Loan Receivable balance was
seeded via a single OBMIG opening-balance debit instead. For natively
created loans, disburse() seeds outstanding_interest correctly, so any
drift there has a different, not-yet-diagnosed cause (e.g. a schedule
regeneration that changed interest_due after disbursement without
resyncing the aggregate) and deserves individual review before correcting.

Makes no changes — report only. No --confirm/--fix flag on purpose: the
principal-vs-GL-balance correction in particular should be eyeballed
per loan before anything writes to the database.

Usage:
    python manage.py audit_loan_outstanding_vs_gl_truth
    python manage.py audit_loan_outstanding_vs_gl_truth --loan LN-714
    python manage.py audit_loan_outstanding_vs_gl_truth --min-total-paid 0
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        'Read-only: for loans with real payment history, compare outstanding_principal/'
        'interest/fees against GL truth (account.balance) and schedule truth '
        '(Sum(due) - Sum(paid)) independently — does not assume shifting the delta '
        'between principal and interest is safe.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check this loan number.')
        parser.add_argument('--min-total-paid', type=str, default='0.01',
                             help='Skip loans with total_paid below this (default 0.01 — '
                                  'excludes never-paid loans, a separate rounding-only bucket).')
        parser.add_argument('--status', dest='statuses', default=None,
                             help='Comma-separated status list to include (e.g. '
                                  '"active,disbursed,defaulted"). Default: all statuses.')
        parser.add_argument('--exclude-loans', dest='exclude_loans', default=None,
                             help='Comma-separated loan numbers to skip (already triaged elsewhere).')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        min_total_paid = Decimal(options['min_total_paid'])

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
            total_paid__gte=min_total_paid,
        ).select_related('account').order_by('loan_number')

        if options['loan_number']:
            loans = loans.filter(loan_number=options['loan_number'])

        if options['statuses']:
            statuses = [s.strip() for s in options['statuses'].split(',') if s.strip()]
            loans = loans.filter(status__in=statuses)

        if options['exclude_loans']:
            excluded = [ln.strip() for ln in options['exclude_loans'].split(',') if ln.strip()]
            loans = loans.exclude(loan_number__in=excluded)

        checked = 0
        flagged = 0

        for loan in loans:
            checked += 1
            agg = loan.repayment_schedule.aggregate(
                interest_due=Sum('interest_due'), interest_paid=Sum('interest_paid'),
                fees_due=Sum('fees_due'), fees_paid=Sum('fees_paid'),
            )
            correct_interest = (agg['interest_due'] or Decimal('0.00')) - (agg['interest_paid'] or Decimal('0.00'))
            correct_fees = (agg['fees_due'] or Decimal('0.00')) - (agg['fees_paid'] or Decimal('0.00'))
            correct_principal = loan.account.balance if loan.account else None

            interest_delta = correct_interest - loan.outstanding_interest
            fees_delta = correct_fees - loan.outstanding_fees
            principal_delta = (
                (correct_principal - loan.outstanding_principal)
                if correct_principal is not None else Decimal('0.00')
            )

            if (abs(interest_delta) <= Decimal('0.01')
                    and abs(fees_delta) <= Decimal('0.01')
                    and abs(principal_delta) <= Decimal('0.01')):
                continue

            flagged += 1
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'[{loan.loan_number}] pk={loan.pk}  origin={loan.origin}  status={loan.status}  '
                f'total_paid={loan.total_paid:,.2f}'
            ))
            if abs(interest_delta) > Decimal('0.01'):
                self.stdout.write(
                    f'    outstanding_interest   current={loan.outstanding_interest:>14,.2f}  '
                    f'schedule-truth={correct_interest:>14,.2f}  delta={interest_delta:>+14,.2f}'
                )
            if abs(fees_delta) > Decimal('0.01'):
                self.stdout.write(
                    f'    outstanding_fees       current={loan.outstanding_fees:>14,.2f}  '
                    f'schedule-truth={correct_fees:>14,.2f}  delta={fees_delta:>+14,.2f}'
                )
            if correct_principal is None:
                self.stdout.write(self.style.ERROR('    outstanding_principal  no linked GL account — cannot verify'))
            elif abs(principal_delta) > Decimal('0.01'):
                self.stdout.write(
                    f'    outstanding_principal  current={loan.outstanding_principal:>14,.2f}  '
                    f'GL-truth={correct_principal:>14,.2f}  delta={principal_delta:>+14,.2f}'
                )

            old_total = loan.total_outstanding
            new_total = (
                (correct_principal if correct_principal is not None else loan.outstanding_principal)
                + correct_interest + correct_fees + loan.outstanding_penalties
            )
            self.stdout.write(
                f'    total_outstanding      current={old_total:>14,.2f}  corrected={new_total:>14,.2f}  '
                f'net_change={(new_total - old_total):>+14,.2f}'
            )
            self.stdout.write('')

        self.stdout.write('')
        self.stdout.write(f'Checked {checked} loan(s) with total_paid >= {min_total_paid}.')
        if flagged:
            self.stdout.write(self.style.WARNING(
                f'{flagged} loan(s) have outstanding_principal/interest/fees inconsistent with '
                'GL/schedule truth. No changes applied — review before writing a correction command, '
                'especially any loan where net_change != 0 (the previous total_outstanding was itself wrong).'
            ))
        else:
            self.stdout.write(self.style.SUCCESS('No inconsistencies found.'))
