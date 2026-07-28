"""
Management command: audit_total_due_integrity

REPORT-ONLY — never writes anything.

Context: total_due on a LoanRepaymentSchedule row is defined as
    principal_due + interest_due + fees_due
Penalty is tracked entirely separately (penalty_due/penalty_paid on the row,
outstanding_penalties on the loan) — see update_loan_status.py (penalty_delta
is applied to outstanding_penalties, never to total_due) and
LoanAccount.apply_payment (the unpaid-installment allocation loop divides
`installment.total_due - installment.total_paid` into principal/interest/fees
only; outstanding_penalties is settled separately before that loop even
starts).

Two management commands — `apply_penalty_due_correction` and
`apply_penalty_overcollection_credit` — used to violate this by subtracting
a penalty correction directly from total_due (floored at total_paid, not at
principal_due + interest_due + fees_due). Whenever the correction being
applied was larger than the row's total_due, this silently zeroed out
principal/interest that had nothing to do with the penalty and was never
inflated — e.g. legacy-imported loans (origin=ORIGIN_LEGACY_IMPORT) where
penalty_due started out inflated relative to a total_due that never included
it in the first place. Both commands have since been fixed to only ever
touch penalty_due. This command finds rows already damaged by the old
behaviour (or corrupted for any other reason) so they can be repaired.

A row is flagged when:
    total_due != principal_due + interest_due + fees_due   (beyond tolerance)
or
    total_due < total_paid                                  (impossible state)

For each flagged row this also checks FinancialAuditLog for a prior
LOAN_BALANCE_CORRECTION entry against that row from either of the two
commands above, and prints the before/after it recorded — direct evidence
of whether this is the known bug or something else.

Usage:
    python manage.py audit_total_due_integrity
    python manage.py audit_total_due_integrity --loan LN-362
    python manage.py audit_total_due_integrity --min-diff 1.00
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        "Report-only: find LoanRepaymentSchedule rows whose total_due doesn't match "
        "principal_due + interest_due + fees_due (penalty is tracked separately and "
        "should never be part of total_due), and correlate against known corruption "
        "from the old apply_penalty_due_correction / apply_penalty_overcollection_credit bug."
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')
        parser.add_argument('--min-diff', dest='min_diff', type=str, default='0.01',
                             help='Only list rows where the mismatch exceeds this amount (default: 0.01).')

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']
        min_diff = Decimal(options['min_diff'])

        schedules = LoanRepaymentSchedule.all_objects.select_related(
            'loan',
        ).order_by('loan__loan_number', 'due_date')

        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        understated = []   # total_due too LOW — the damaging direction
        overstated = []    # total_due too HIGH — different issue, still worth flagging
        impossible = []    # total_due < total_paid

        for sched in schedules.iterator():
            expected = sched.principal_due + sched.interest_due + sched.fees_due
            diff = (sched.total_due - expected).quantize(Decimal('0.01'))

            if sched.total_due < sched.total_paid:
                impossible.append((sched, expected, diff))
            elif diff < -min_diff:
                understated.append((sched, expected, diff))
            elif diff > min_diff:
                overstated.append((sched, expected, diff))

        def correction_evidence(sched):
            return list(
                FinancialAuditLog.objects.filter(
                    record_type='LoanRepaymentSchedule',
                    record_id=str(sched.pk),
                    extra__source_command__in=[
                        'apply_penalty_due_correction',
                        'apply_penalty_overcollection_credit',
                    ],
                ).order_by('timestamp')
            )

        checked = schedules.count()
        self.stdout.write(f"Schedule rows checked: {checked}")
        self.stdout.write(
            f"Understated (total_due too low — principal/interest may be hidden): {len(understated)}"
        )
        self.stdout.write(f"Overstated (total_due too high): {len(overstated)}")
        self.stdout.write(f"Impossible (total_due < total_paid): {len(impossible)}")

        per_loan_understated = {}

        if understated:
            self.stdout.write(self.style.ERROR(
                "\n--- UNDERSTATED total_due (the damaging direction) ---"
            ))
            for sched, expected, diff in understated:
                loan = sched.loan
                per_loan_understated[loan.loan_number] = (
                    per_loan_understated.get(loan.loan_number, Decimal('0.00')) - diff
                )
                flags = []
                if loan.status == 'defaulted':
                    flags.append('DEFAULTED')
                if loan.risk_classification in ('doubtful', 'loss'):
                    flags.append(loan.risk_classification.upper())
                if loan.origin == loan.ORIGIN_LEGACY_IMPORT:
                    flags.append('LEGACY_IMPORT')
                flag_str = f" [{', '.join(flags)}]" if flags else ''

                self.stdout.write(
                    f"  {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                    f"status={sched.status:<12s} due={sched.due_date} "
                    f"principal_due={sched.principal_due:>12,.2f} interest_due={sched.interest_due:>12,.2f} "
                    f"fees_due={sched.fees_due:>10,.2f} penalty_due={sched.penalty_due:>12,.2f}  "
                    f"total_due={sched.total_due:>12,.2f} (expected {expected:>12,.2f}, short {-diff:,.2f})"
                    f"{flag_str}"
                )
                evidence = correction_evidence(sched)
                for log in evidence:
                    self.stdout.write(
                        f"      -> {log.timestamp:%Y-%m-%d %H:%M} {log.extra.get('source_command')}: "
                        f"penalty_due {log.extra.get('schedule_penalty_due_before')} -> "
                        f"{log.extra.get('schedule_penalty_due_after')}"
                        + (
                            f", total_due {log.extra.get('schedule_total_due_before')} -> "
                            f"{log.extra.get('schedule_total_due_after')}"
                            if 'schedule_total_due_before' in log.extra else ''
                        )
                    )
                if not evidence and sched.penalty_due > 0:
                    self.stdout.write(
                        "      -> no correction command found in FinancialAuditLog for this row "
                        "— mismatch has a different cause, not the known bug."
                    )

        if overstated:
            self.stdout.write(self.style.WARNING(
                "\n--- OVERSTATED total_due ---"
            ))
            for sched, expected, diff in overstated:
                loan = sched.loan
                self.stdout.write(
                    f"  {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                    f"status={sched.status:<12s} due={sched.due_date} "
                    f"total_due={sched.total_due:>12,.2f} (expected {expected:>12,.2f}, over {diff:,.2f})"
                )

        if impossible:
            self.stdout.write(self.style.ERROR(
                "\n--- IMPOSSIBLE total_due < total_paid ---"
            ))
            for sched, expected, diff in impossible:
                loan = sched.loan
                self.stdout.write(
                    f"  {loan.loan_number:20s} installment #{sched.installment_number:<3d} "
                    f"status={sched.status:<12s} total_due={sched.total_due:>12,.2f} "
                    f"total_paid={sched.total_paid:>12,.2f}"
                )

        if per_loan_understated:
            self.stdout.write("\n--- Per-loan understatement (principal+interest currently hidden) ---")
            for ln, amt in sorted(per_loan_understated.items(), key=lambda x: -x[1]):
                self.stdout.write(f"  {ln:24s} {amt:>14,.2f}")

        self.stdout.write('')
        if understated or impossible:
            self.stdout.write(self.style.ERROR(
                "Rows found where total_due understates what's actually owed — arrears_amount, "
                "days-in-arrears collections views, and any dashboard summing total_due will all "
                "understate real exposure on these loans. Report-only; no repair command exists "
                "yet for these rows — reconstruct total_due as principal_due + interest_due + "
                "fees_due per row once reviewed."
            ))
        else:
            self.stdout.write(self.style.SUCCESS('No total_due integrity issues found.'))
