"""
Management command: audit_outstanding_principal_vs_schedule

Read-only audit. Triggered by LN-858 (loan pk 652, Catherine Adukwu, origin=
legacy_import): outstanding_principal=800.00, but the loan's own
repayment_schedule said 57,800.00 principal was still owed (58 of 60 daily
1,000.00 installments still pending/overdue/partial) — confirmed on that loan
to be a stale schedule tail, fixed via retire_stale_legacy_schedule_rows.

IMPORTANT — this command originally compared outstanding_principal alone
against schedule principal-only remaining. That's wrong for any loan with
real interest_due or outstanding_penalties: LN-342 was flagged "OVERSTATED
by 21,899.99" on that basis, but its true owed amount is 93,561.65 — the
opening balance (70,566.66) plus a legitimate cutover-corrected penalty
accrual (22,994.99, posted via reverse_legacy_loan_penalty_accruals). Neither
the old outstanding_principal-only figure nor the old principal-only schedule
figure was right; comparing incommensurate pieces was the bug in THIS
command, not necessarily a data problem on the loan.

This version compares like-for-like on the FULL picture instead:
  loan side     = LoanAccount.total_outstanding
                  (outstanding_principal + _interest + _fees + _penalties)
  schedule side = sum over non-restructured schedule rows of
                  (total_due - total_paid)   [[principal + interest + fees]]
                  + (penalty_due - penalty_paid)   [[penalty, tracked separately
                    because total_due deliberately excludes it — see
                    audit_total_due_integrity.py]]

Per-component figures (principal/interest/fees/penalty individually) are
still printed for every flagged loan so you can see exactly which component
disagrees — that's the fast way to tell a LN-858-shaped problem (principal
component understated, everything else already agrees) from an LN-342-shaped
one (principal/interest agree, penalty is where the gap is) from something
else entirely.

Ground truth for schedule-side figures: sum over every non-restructured
repayment_schedule row of the relevant fields. Rows with status='restructured'
are excluded — a restructure retires the old schedule rows in place rather
than deleting them (see LoanAccount.restructure(), models.py ~1798), so their
amounts must not double-count against the new schedule that replaced them.

`schedule_matches_terms` is a structural-integrity signal only (unrelated to
the drift direction): does the schedule's total_due (principal+interest+fees)
reconcile to disbursed_amount within generous headroom? True means the
schedule itself isn't duplicated/corrupted — whatever drift exists is a
data-conflict between loan aggregates and schedule rows, not a schedule-
generation bug.

written_off / paid_off / closed loans are excluded — write-off and payoff
paths deliberately zero outstanding_* without touching the schedule rows'
status (models.py ~1728, ~2843, ~3597), so schedule-vs-aggregate drift on
those is expected, not a bug.

Makes no changes — report only.

Usage:
    python manage.py audit_outstanding_principal_vs_schedule
    python manage.py audit_outstanding_principal_vs_schedule --loan LN-342
    python manage.py audit_outstanding_principal_vs_schedule --tolerance 5.00
    python manage.py audit_outstanding_principal_vs_schedule --legacy-only --summary
    python manage.py audit_outstanding_principal_vs_schedule --legacy-only --list-understated
"""
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db.models import Sum

_COMPONENTS = [
    ('principal', 'outstanding_principal'),
    ('interest', 'outstanding_interest'),
    ('fees', 'outstanding_fees'),
    ('penalty', 'outstanding_penalties'),
]


class Command(BaseCommand):
    help = (
        'Read-only audit: loans whose total_outstanding (principal+interest+fees+penalties) '
        'disagrees with the full remaining amount implied by their own repayment_schedule rows.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--tolerance', type=str, default='1.00',
                             help='Naira drift below which a loan is not flagged (default 1.00).')
        parser.add_argument('--legacy-only', action='store_true',
                             help='Only check loans with origin=legacy_import.')
        parser.add_argument('--summary', action='store_true',
                             help='Print only the direction/schedule_matches_terms breakdown counts, '
                                  'not the full per-loan detail.')
        parser.add_argument('--list-understated', action='store_true',
                             help='Print just a space-separated list of loan_numbers for the '
                                  'legacy_import + UNDERSTATED + schedule_matches_terms=True cohort '
                                  '(the LN-858 pattern) — for piping into a batch-apply loop.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        tolerance = Decimal(options['tolerance'])
        loan_number = options['loan_number']
        legacy_only = options['legacy_only']
        summary_only = options['summary']
        list_understated = options['list_understated']

        loans = LoanAccount.all_objects.filter(
            is_deleted=False,
        ).exclude(
            status__in=['written_off', 'paid_off', 'closed'],
        ).select_related('client').order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
        if legacy_only:
            loans = loans.filter(origin=LoanAccount.ORIGIN_LEGACY_IMPORT)

        flagged = []
        for loan in loans.iterator():
            agg = loan.repayment_schedule.exclude(status='restructured').aggregate(
                principal_due=Sum('principal_due'), principal_paid=Sum('principal_paid'),
                interest_due=Sum('interest_due'), interest_paid=Sum('interest_paid'),
                fees_due=Sum('fees_due'), fees_paid=Sum('fees_paid'),
                penalty_due=Sum('penalty_due'), penalty_paid=Sum('penalty_paid'),
                total_due=Sum('total_due'),
            )
            component_remaining = {
                'principal': (agg['principal_due'] or Decimal('0.00')) - (agg['principal_paid'] or Decimal('0.00')),
                'interest': (agg['interest_due'] or Decimal('0.00')) - (agg['interest_paid'] or Decimal('0.00')),
                'fees': (agg['fees_due'] or Decimal('0.00')) - (agg['fees_paid'] or Decimal('0.00')),
                'penalty': (agg['penalty_due'] or Decimal('0.00')) - (agg['penalty_paid'] or Decimal('0.00')),
            }
            total_due = agg['total_due'] or Decimal('0.00')
            schedule_owed = sum(component_remaining.values())
            loan_owed = loan.total_outstanding
            drift = loan_owed - schedule_owed

            if abs(drift) > tolerance:
                # Sanity-check the schedule itself: does its full total_due (principal+
                # interest+fees; penalty tracked separately, see module docstring)
                # reconcile to what this loan was actually disbursed? If total_due is
                # wildly larger than anything disbursed_amount could justify, the
                # schedule side may be structurally corrupted rather than just
                # disagreeing with the loan aggregate.
                disbursed = loan.disbursed_amount or Decimal('0.00')
                schedule_matches_terms = (
                    disbursed > 0
                    and total_due <= disbursed * Decimal('3')
                )
                flagged.append((loan, component_remaining, schedule_owed, drift, schedule_matches_terms))

        if not flagged:
            self.stdout.write(self.style.SUCCESS(
                'No loans found where total_outstanding disagrees with the repayment schedule.'
            ))
            return

        # The batch-apply candidate cohort for retire_stale_legacy_schedule_rows: same
        # shape as LN-858 (legacy_import, UNDERSTATED, schedule structurally intact).
        # OVERSTATED loans are a different, unvalidated problem — deliberately excluded.
        understated_cohort = [
            loan for loan, _, _, drift, schedule_matches_terms in flagged
            if drift < 0
            and schedule_matches_terms
            and loan.origin == LoanAccount.ORIGIN_LEGACY_IMPORT
        ]

        if list_understated:
            self.stdout.write(' '.join(loan.loan_number for loan in understated_cohort))
            return

        legacy_count = sum(
            1 for loan, *_ in flagged if loan.origin == LoanAccount.ORIGIN_LEGACY_IMPORT
        )
        understated_count = sum(1 for _, _, _, drift, _ in flagged if drift < 0)
        overstated_count = len(flagged) - understated_count
        matches_terms_count = sum(1 for *_, m in flagged if m)

        if summary_only:
            self.stdout.write(self.style.ERROR(
                f'{len(flagged)} loan(s) have total_outstanding out of sync with their schedule:'
            ))
            self.stdout.write(f'  legacy_import origin       : {legacy_count}/{len(flagged)}')
            self.stdout.write(f'  UNDERSTATED (schedule > OP) : {understated_count}')
            self.stdout.write(f'  OVERSTATED  (OP > schedule) : {overstated_count}')
            self.stdout.write(f'  schedule_matches_terms=True : {matches_terms_count}/{len(flagged)}')
            self.stdout.write(self.style.SUCCESS(
                f'\nBatch-apply candidates (legacy_import + UNDERSTATED + schedule_matches_terms=True, '
                f'the validated LN-858 pattern): {len(understated_cohort)}\n'
                f'  Re-run with --list-understated to get their loan_numbers.\n'
            ))
            self.stdout.write(self.style.WARNING(
                f'{overstated_count} OVERSTATED loan(s) are a different, unvalidated problem — '
                'total_outstanding claims more than the full schedule (principal+interest+fees+'
                'penalty) shows remaining. retire_stale_legacy_schedule_rows does not apply to '
                'them. Needs separate diagnosis before any correction.'
            ))
            return

        self.stdout.write(self.style.ERROR(
            f'{len(flagged)} loan(s) have total_outstanding out of sync with their schedule:\n'
        ))

        for loan, component_remaining, schedule_owed, drift, schedule_matches_terms in flagged:
            direction = 'UNDERSTATED' if drift < 0 else 'OVERSTATED'
            component_lines = '\n'.join(
                f'          {comp:9s} outstanding={getattr(loan, field):>12,.2f}  '
                f'schedule remaining={component_remaining[comp]:>12,.2f}'
                for comp, field in _COMPONENTS
            )
            self.stdout.write(
                f'  [{loan.loan_number}] pk={loan.pk}  client={loan.client_id}  status={loan.status}  '
                f'origin={loan.origin}  days_in_arrears={loan.days_in_arrears}\n'
                f'      total_outstanding (loan)          = {loan.total_outstanding:>14,.2f}\n'
                f'      schedule-derived remaining (all)   = {schedule_owed:>14,.2f}\n'
                f'      drift                              = {drift:>14,.2f}  ({direction})\n'
                f'{component_lines}\n'
                f'      schedule_matches_terms             = {schedule_matches_terms}  '
                f'(schedule total_due vs disbursed_amount={loan.disbursed_amount:,.2f})\n'
                f'      provision_amount (built on outstanding_principal alone) = {loan.provision_amount:,.2f}\n'
            )

        self.stdout.write(self.style.WARNING(
            f'\n{legacy_count}/{len(flagged)} flagged loans are origin=legacy_import '
            f'({understated_count} UNDERSTATED, {overstated_count} OVERSTATED). For legacy_import '
            'loans, outstanding_* came from the old system\'s own aggregate fields and the '
            'schedule\'s paid/unpaid flags came from a separate export — nothing cross-checks them '
            'at import (see import_legacy_data.py:_import_loans). schedule_matches_terms=True means '
            'the schedule itself is structurally intact (not duplicated/corrupted) — the disagreement '
            'is a data conflict, not a schedule-generation bug. Check the per-component lines: a '
            'gap concentrated in one component (e.g. penalty, as on LN-342) points at a different '
            'cause than a gap spread across all of them (as on LN-858). Confirm against the legacy '
            'source, GL ledger, or ops before trusting either figure over the other; this command '
            'applies no correction. Use --summary for just the counts, or --list-understated for the '
            'retire_stale_legacy_schedule_rows batch-apply candidate list.'
        ))
