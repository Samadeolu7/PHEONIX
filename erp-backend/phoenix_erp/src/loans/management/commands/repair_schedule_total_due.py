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

Rows where that reconstruction would fall BELOW total_paid are never
auto-repaired — floored-at-total_paid would silently create a different
inconsistency (a row showing as paid-in-full or overpaid against a total_due
that just changed under it). Those are listed separately as "needs manual
review" and require someone to look at the row's actual payment history
before deciding what total_due should be.

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
    including the reconstructed total_due and, when found, the FinancialAuditLog
    entry that originally corrupted it (for direct before/after/before-again
    traceability).
  - Every loan whose arrears/classification changed as a result is also logged.

Usage:
    python manage.py repair_schedule_total_due                        # report only, whole book
    python manage.py repair_schedule_total_due --loan LN-362          # preview one loan
    python manage.py repair_schedule_total_due --loan LN-362 --apply  # apply to one loan
    python manage.py repair_schedule_total_due --all --apply          # apply to every flagged row
"""
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Reconstruct total_due = principal_due + interest_due + fees_due on rows flagged by "
        "audit_total_due_integrity, then refresh the affected loans' arrears/classification. "
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
        from loans.models import LoanRepaymentSchedule, LoanAccount
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        min_diff = Decimal(options['min_diff'])
        apply_changes = options['apply']
        all_flagged = options['all_flagged']

        if apply_changes and not loan_number and not all_flagged:
            raise CommandError("--apply requires either --loan <loan_number> or --all.")

        schedules = LoanRepaymentSchedule.all_objects.select_related('loan').order_by(
            'loan__loan_number', 'due_date'
        )
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
            self.stdout.write(
                f"  [REPAIR] {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                f"total_due {sched.total_due:>12,.2f} -> {expected:>12,.2f}  ({-diff:+,.2f})"
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
                evidence = correction_evidence(sched)

                sched.total_due = expected
                sched.save(update_fields=['total_due', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanRepaymentSchedule',
                    record_id=str(sched.pk),
                    amount=diff,
                    description=(
                        f'total_due integrity repair — {loan.loan_number} installment '
                        f'#{sched.installment_number}: reconstructed as principal_due + '
                        f'interest_due + fees_due.'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'installment_number': sched.installment_number,
                        'schedule_total_due_before': str(total_due_before),
                        'schedule_total_due_after': str(expected),
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

                loan._calculate_arrears()
                loan.update_risk_classification()
                loan.save(update_fields=[
                    'risk_classification', 'provision_pct', 'provision_amount', 'updated_at',
                ])

                if (
                    loan.arrears_amount != arrears_before
                    or loan.days_in_arrears != dpd_before
                    or loan.risk_classification != classification_before
                ):
                    log_financial_event(
                        FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                        acted_by=None,
                        record_type='LoanAccount',
                        record_id=str(loan.pk),
                        amount=loan.arrears_amount - arrears_before,
                        description=(
                            f'total_due integrity repair — {loan.loan_number}: refreshed arrears/'
                            f'classification following schedule repair.'
                        ),
                        extra={
                            'loan_number': loan.loan_number,
                            'arrears_amount_before': str(arrears_before),
                            'arrears_amount_after': str(loan.arrears_amount),
                            'days_in_arrears_before': dpd_before,
                            'days_in_arrears_after': loan.days_in_arrears,
                            'risk_classification_before': classification_before,
                            'risk_classification_after': loan.risk_classification,
                            'source_command': 'repair_schedule_total_due',
                        },
                    )
                    self.stdout.write(
                        f"  {loan.loan_number}: arrears {arrears_before:,.2f} -> {loan.arrears_amount:,.2f}  "
                        f"DPD {dpd_before} -> {loan.days_in_arrears}  "
                        f"risk {classification_before} -> {loan.risk_classification}"
                    )

        self.stdout.write(self.style.SUCCESS(
            f"\nApplied. Repaired {corrected_count} row(s) across {len(loans_touched)} loan(s)."
        ))
