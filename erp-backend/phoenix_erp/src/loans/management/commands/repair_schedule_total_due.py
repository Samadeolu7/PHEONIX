"""
Management command: repair_schedule_total_due

Repairs LoanRepaymentSchedule rows flagged by `audit_total_due_integrity`:
total_due that doesn't match principal_due + interest_due + fees_due (penalty
is tracked entirely separately — see that command's docstring for the full
explanation of why total_due excludes it, and how the old
apply_penalty_due_correction / apply_penalty_overcollection_credit commands
used to corrupt it).

For every flagged row:

    LoanRepaymentSchedule.total_due -> principal_due + interest_due + fees_due

Rows where that reconstruction would fall BELOW total_paid, or whose status
is already 'paid', are never auto-repaired — those are listed as "needs
manual review" and left completely untouched. Retroactively bumping
total_due on a historically-settled installment is a judgment call, not
something to auto-write.

Penalty follow-on (why this command also touches penalty_due/outstanding_penalties)
--------------------------------------------------------------------------------
Fixing total_due alone isn't enough: `update_loan_status` recalculates
penalty_due every day from `total_due - total_paid` as the base (see its
"3. Auto-penalty" step). While total_due sat at 0 (the corruption this
repairs), that daily job kept recomputing penalty on a 0 base and drove
penalty_due down to ~0 too — which is why the audit now shows penalty_due=0
on these rows rather than the originally-corrected estimate the 2026-07-24
correction had set. So for every repaired row with status='overdue', this
command also recomputes penalty_due fresh, using the corrected total_due as
the base and TODAY's days_late — i.e. exactly what update_loan_status would
compute on its next run, just applied immediately instead of waiting.

outstanding_penalties (the loan-level aggregate) is then REBUILT from
scratch per loan — sum of penalty_due across that loan's still-unpaid rows,
minus penalties_paid (the loan's lifetime penalty collections) — rather than
patched with another incremental delta. The incremental-delta approach is
exactly what let this drift in the first place (each day's delta compounds
on whatever the previous day left behind); rebuilding from the now-correct
row-level figures sidesteps that history entirely. This means:

  - penalty_paid / total_paid / principal_paid / interest_paid / fees_paid
    are NEVER touched, on any row, by this command — money already
    collected is left exactly as it was. Nothing is clawed back or credited
    for penalty overcollected in the past.
  - outstanding_penalties floors at zero — if penalties_paid already exceeds
    the freshly-recomputed penalty owed, the excess already paid is simply
    not carried forward as a future credit either. It's left alone, not
    reconciled either direction.
  - Going forward, penalty_due (and therefore outstanding_penalties) reflects
    the correct, current formula — not the old inflated figure and not the
    cascaded-to-zero figure.

After repairing a loan's rows, this also refreshes that loan's
arrears_amount / days_in_arrears / risk_classification / provision_pct /
provision_amount — those are the fields that were silently understated
downstream of the corrupted total_due, and there's no reason to wait for the
next scheduled update_loan_status run to see the correct numbers.

Safety by construction:
  - Dry-run by default. Nothing is written unless --apply is passed.
  - --apply requires either --loan <loan_number> (single loan) or --all
    (every flagged row in the book) — never both silently combined.
  - Every corrected row is logged via FinancialAuditLog (LOAN_BALANCE_CORRECTION),
    including the reconstructed total_due, the recomputed penalty_due, and,
    when found, the FinancialAuditLog entry that originally corrupted it.
  - Every loan whose arrears/classification/outstanding_penalties changed as
    a result is also logged, with before/after for each field.

Usage:
    python manage.py repair_schedule_total_due                        # report only, whole book
    python manage.py repair_schedule_total_due --loan LN-362          # preview one loan
    python manage.py repair_schedule_total_due --loan LN-362 --apply  # apply to one loan
    python manage.py repair_schedule_total_due --all --apply          # apply to every flagged row
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.db.models import Sum
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Reconstruct total_due = principal_due + interest_due + fees_due on rows flagged by "
        "audit_total_due_integrity, recompute penalty_due for the now-corrected base, rebuild "
        "outstanding_penalties from scratch, and refresh arrears/classification. Leaves all "
        "*_paid fields untouched — nothing already collected is clawed back or credited. "
        "Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Scope to a single loan. Without this, scans all loans.')
        parser.add_argument('--min-diff', dest='min_diff', type=str, default='0.01',
                             help='Only repair rows where the mismatch exceeds this amount (default: 0.01).')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the correction. Without this, only previews.')
        parser.add_argument('--all', dest='all_flagged', action='store_true',
                             help='With --apply, correct every flagged row in the book. Required '
                                  'alongside --apply when --loan is not given.')

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        min_diff = Decimal(options['min_diff'])
        apply_changes = options['apply']
        all_flagged = options['all_flagged']
        today = timezone.localdate()

        if apply_changes and not loan_number and not all_flagged:
            raise CommandError("--apply requires either --loan <loan_number> or --all.")

        schedules = LoanRepaymentSchedule.all_objects.select_related(
            'loan', 'loan__product',
        ).order_by('loan__loan_number', 'due_date')
        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        repairable = []       # (sched, expected, diff)
        needs_review = []     # (sched, expected, diff, reason)

        for sched in schedules.iterator():
            expected = sched.principal_due + sched.interest_due + sched.fees_due
            diff = (sched.total_due - expected).quantize(Decimal('0.01'))
            if abs(diff) <= min_diff:
                continue
            if sched.status == 'paid':
                # A historically-settled installment. Bumping total_due above what
                # was actually collected would retroactively make a closed row look
                # underpaid — that's a judgment call, not something to auto-write.
                needs_review.append((sched, expected, diff, 'status=paid'))
            elif expected < sched.total_paid:
                needs_review.append((sched, expected, diff, 'expected < total_paid'))
            else:
                repairable.append((sched, expected, diff))

        def correction_evidence(sched):
            return FinancialAuditLog.objects.filter(
                record_type='LoanRepaymentSchedule',
                record_id=str(sched.pk),
                extra__source_command__in=[
                    'apply_penalty_due_correction',
                    'apply_penalty_overcollection_credit',
                ],
            ).order_by('-timestamp').first()

        if not repairable and not needs_review:
            self.stdout.write(self.style.SUCCESS('Nothing to repair.'))
            return

        self.stdout.write(
            f"Repairable: {len(repairable)}   Needs manual review: {len(needs_review)}"
        )

        for sched, expected, diff in repairable:
            loan = sched.loan
            penalty_preview = ''
            if sched.status == 'overdue':
                days_late = loan.product.effective_days_late(sched.due_date, today)
                new_penalty = (
                    loan.product.calculate_late_penalty(expected - sched.total_paid, days_late, loan.repayment_frequency)
                    if days_late > 0 else Decimal('0.00')
                )
                penalty_preview = f"  penalty_due {sched.penalty_due:,.2f} -> {new_penalty:,.2f}"
            self.stdout.write(
                f"  [REPAIR] {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                f"total_due {sched.total_due:>12,.2f} -> {expected:>12,.2f}  ({-diff:+,.2f})"
                f"{penalty_preview}"
            )

        for sched, expected, diff, reason in needs_review:
            loan = sched.loan
            self.stdout.write(self.style.WARNING(
                f"  [MANUAL REVIEW] {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                f"status={sched.status:<8s} total_due={sched.total_due:,.2f} total_paid={sched.total_paid:,.2f} "
                f"reconstructed={expected:,.2f} ({reason}) — left untouched."
            ))

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "\nDRY-RUN — nothing written. Re-run with --apply (and --loan or --all) to write this correction."
            ))
            return

        targets = repairable
        if loan_number:
            targets = [t for t in targets if t[0].loan.loan_number == loan_number]

        corrected_count = 0
        loans_touched = {}

        with db_transaction.atomic():
            for sched, expected, diff in targets:
                loan = sched.loan
                total_due_before = sched.total_due
                penalty_due_before = sched.penalty_due
                evidence = correction_evidence(sched)

                sched.total_due = expected
                update_fields = ['total_due', 'updated_at']

                new_penalty_due = None
                if sched.status == 'overdue':
                    days_late = loan.product.effective_days_late(sched.due_date, today)
                    new_penalty_due = (
                        loan.product.calculate_late_penalty(
                            expected - sched.total_paid, days_late, loan.repayment_frequency,
                        ) if days_late > 0 else Decimal('0.00')
                    )
                    sched.penalty_due = new_penalty_due
                    update_fields.append('penalty_due')

                sched.save(update_fields=update_fields)

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanRepaymentSchedule',
                    record_id=str(sched.pk),
                    amount=diff,
                    description=(
                        f'total_due integrity repair — {loan.loan_number} installment '
                        f'#{sched.installment_number}: reconstructed as principal_due + '
                        f'interest_due + fees_due, penalty_due recomputed on the corrected base.'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'installment_number': sched.installment_number,
                        'schedule_total_due_before': str(total_due_before),
                        'schedule_total_due_after': str(expected),
                        'schedule_penalty_due_before': str(penalty_due_before),
                        'schedule_penalty_due_after': (
                            str(new_penalty_due) if new_penalty_due is not None else None
                        ),
                        'principal_due': str(sched.principal_due),
                        'interest_due': str(sched.interest_due),
                        'fees_due': str(sched.fees_due),
                        'original_corruption_log_id': evidence.id if evidence else None,
                        'original_corruption_source_command': (
                            evidence.extra.get('source_command') if evidence else None
                        ),
                        'source_command': 'repair_schedule_total_due',
                    },
                )
                loans_touched[loan.pk] = loan
                corrected_count += 1

            for loan in loans_touched.values():
                loan.refresh_from_db()
                classification_before = loan.risk_classification
                arrears_before = loan.arrears_amount
                dpd_before = loan.days_in_arrears
                outstanding_penalties_before = loan.outstanding_penalties

                loan._calculate_arrears()
                loan.update_risk_classification()

                penalty_sum = loan.repayment_schedule.filter(
                    status__in=['pending', 'partial', 'overdue'],
                ).aggregate(t=Sum('penalty_due'))['t'] or Decimal('0.00')
                loan.outstanding_penalties = max(
                    Decimal('0.00'), penalty_sum - loan.penalties_paid,
                )

                loan.save(update_fields=[
                    'risk_classification', 'provision_pct', 'provision_amount',
                    'outstanding_penalties', 'updated_at',
                ])

                if (
                    loan.arrears_amount != arrears_before
                    or loan.days_in_arrears != dpd_before
                    or loan.risk_classification != classification_before
                    or loan.outstanding_penalties != outstanding_penalties_before
                ):
                    log_financial_event(
                        FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                        acted_by=None,
                        record_type='LoanAccount',
                        record_id=str(loan.pk),
                        amount=loan.arrears_amount - arrears_before,
                        description=(
                            f'total_due integrity repair — {loan.loan_number}: refreshed arrears/'
                            f'classification/outstanding_penalties following schedule repair.'
                        ),
                        extra={
                            'loan_number': loan.loan_number,
                            'arrears_amount_before': str(arrears_before),
                            'arrears_amount_after': str(loan.arrears_amount),
                            'days_in_arrears_before': dpd_before,
                            'days_in_arrears_after': loan.days_in_arrears,
                            'risk_classification_before': classification_before,
                            'risk_classification_after': loan.risk_classification,
                            'outstanding_penalties_before': str(outstanding_penalties_before),
                            'outstanding_penalties_after': str(loan.outstanding_penalties),
                            'source_command': 'repair_schedule_total_due',
                        },
                    )
                    self.stdout.write(
                        f"  {loan.loan_number}: arrears {arrears_before:,.2f} -> {loan.arrears_amount:,.2f}  "
                        f"DPD {dpd_before} -> {loan.days_in_arrears}  "
                        f"risk {classification_before} -> {loan.risk_classification}  "
                        f"outstanding_penalties {outstanding_penalties_before:,.2f} -> {loan.outstanding_penalties:,.2f}"
                    )

        self.stdout.write(self.style.SUCCESS(
            f"\nApplied. Repaired {corrected_count} row(s) across {len(loans_touched)} loan(s)."
        ))
