"""
Management command: audit_loan_outstanding_vs_gl_truth

Read-only follow-up to audit_negative_outstanding_balances. That command
found 78 loans with a negative outstanding_principal/interest/fees/penalties
field. Most are negligible (sub-naira schedule-rounding on loans that never
received a payment). This command drills into the loans that DID receive
real payments, to work out exactly what each outstanding_* field SHOULD be
and — critically — whether correcting outstanding_interest by simply
shifting the difference into/out of outstanding_principal is even safe.

It isn't, in general. self.account.balance (the real GL Loan Receivable
balance) only includes interest when disburse() actually booked it there —
the interest_recognized_at_disbursement branch, which requires
interest_income_account to have been configured on the product AT
disbursement time (see loans/models.py disburse()). Loans disbursed while
that was unconfigured (common before the 2026-08-22 hard-guard was added),
and every deferred/unearned-interest loan (interest booked to a separate
liability account, never to Loan Receivable), keep account.balance as
PURE PRINCIPAL.

Critically, interest_recognized_at_disbursement means something DIFFERENT
for legacy-import loans: they never go through disburse() at all (imported
directly, GL seeded by a single OBMIG lump sum) — audit_legacy_loan_interest.py
--confirm bulk-sets this flag True on them purely as a FORWARD safeguard
against record_payment() double-crediting Income if outstanding_interest
ever becomes nonzero later, NOT because GL actually has interest baked in
historically. So the flag is only trustworthy as a GL-history signal for
origin=native loans; for legacy-import loans, GL is always pure principal
regardless of the flag.

  correct_outstanding_interest  = Sum(schedule.interest_due) - Sum(schedule.interest_paid)
  correct_outstanding_fees      = Sum(schedule.fees_due)     - Sum(schedule.fees_paid)
  correct_outstanding_principal = self.account.balance                      # not (native AND flag)
                                   OR self.account.balance - correct_outstanding_interest
                                      - correct_outstanding_fees             # native AND flag=True

outstanding_penalties is left out of this comparison — it's already
self-correcting via update_loan_status's daily cron (recomputed from
calculate_late_penalty() every run), not seeded once and drifted.

(History: earlier versions of this command assumed account.balance was
always pure principal — wrong for interest_recognized_at_disbursement=True
native loans, producing ~65 false-positive mismatches. A next version
assumed account.balance was always principal+interest for native loans —
wrong in the OPPOSITE direction for native loans without the flag set
(confirmed 2026-08-23 via GL history hand-reconstruction on
LN-20260701-6741E4 and 7 siblings). A third version keyed off the flag
alone, forgetting it has different semantics for legacy-import loans —
wrong for LN-526/629/800 and others, whose outstanding_principal is
already GL-verified correct by a separate investigation
(project_legacy_schedule_obmig_hypothesis.md) independent of their
outstanding_interest. Fixed by requiring origin=native in addition to
the flag.)

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
            # account.balance only includes interest when disburse() actually booked
            # it onto the Loan Receivable debit — the interest_recognized_at_disbursement
            # branch (models.py disburse(), requires interest_income_account to have
            # been configured on the product AT disbursement time). Loans disbursed
            # while that was unconfigured (common before the 2026-08-22 guard), and
            # every deferred/unearned-interest loan (interest booked to a separate
            # liability account, never to Loan Receivable), keep account.balance as
            # pure principal (confirmed 2026-08-23 via GL history hand-reconstruction
            # on LN-20260701-6741E4 and 7 siblings).
            #
            # Critically, the flag means something DIFFERENT for legacy-import loans:
            # legacy loans never go through disburse() at all (imported directly, GL
            # seeded by a single OBMIG lump sum) — audit_legacy_loan_interest.py's
            # --confirm step bulk-sets this flag True on them purely as a FORWARD
            # safeguard against record_payment() double-crediting Income if
            # outstanding_interest ever becomes nonzero later, not because GL actually
            # has interest baked in historically. So for legacy loans the flag must be
            # ignored — GL is always pure principal there. (Confirmed via
            # project_legacy_schedule_obmig_hypothesis.md: LN-526/800/722/754/1030/
            # 553/855/907 all have outstanding_principal already GL-verified correct
            # by a separate investigation, independent of their outstanding_interest.)
            correct_principal = None
            if loan.account:
                interest_actually_in_gl = (
                    loan.origin == loan.ORIGIN_NATIVE
                    and loan.interest_recognized_at_disbursement
                )
                correct_principal = (
                    (loan.account.balance - correct_interest - correct_fees)
                    if interest_actually_in_gl
                    else loan.account.balance
                )

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
                f'total_paid={loan.total_paid:,.2f}  interest_recognized_at_disbursement='
                f'{loan.interest_recognized_at_disbursement}'
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
