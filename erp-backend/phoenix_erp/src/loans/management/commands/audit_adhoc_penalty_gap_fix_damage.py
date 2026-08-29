"""
Management command: audit_adhoc_penalty_gap_fix_damage

REPORT-ONLY — never writes anything.

Found 2026-08-29 while chasing LN-886 (Damola Kadiri)'s total_due
corruption via inspect_loan_audit_trail: on 2026-08-21, shortly after
restore_flat_schedule_backward_v2 ran on a batch of loans, a SECOND,
uncommitted correction was run against at least LN-886 — a
FinancialAuditLog entry timestamped 2026-08-21 ~15:02 with NO
source_command in `extra` and a description reading "Corrected
penalty-component gap left by today's earlier flat-schedule restoration
— ... Added the shortfall to row #<n> (the earliest still-open row)."

That description text doesn't appear anywhere in this codebase — it was
never saved as a management command, most likely run once directly via
`manage.py shell`. Its effect matches restore_flat_schedule_backward_v4's
later, in-code "same-pass penalty reconciliation" step exactly: it adds a
penalty shortfall to BOTH penalty_due and total_due on a loan's earliest
open row, corrupting total_due the same way. v4 was presumably built
afterward specifically to fold this manual step into one pass — but this
earlier, manual run still did real, uncorrected damage to whatever loans
it touched, and (unlike v4) has no committed source to grep for evidence
of what it touched. The only way to find every affected loan is to search
FinancialAuditLog for this exact description text.

Usage:
    python manage.py audit_adhoc_penalty_gap_fix_damage
    python manage.py audit_adhoc_penalty_gap_fix_damage --loan LN-886
"""
from decimal import Decimal

from django.core.management.base import BaseCommand

DESCRIPTION_MARKER = 'Corrected penalty-component gap left by'


class Command(BaseCommand):
    help = (
        'Report-only: find every loan touched by the uncommitted 2026-08-21 ad-hoc script that '
        'baked a penalty shortfall into total_due (found chasing LN-886/Damola Kadiri).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Only check a single loan by loan_number.')

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']

        logs = FinancialAuditLog.objects.filter(
            record_type='LoanAccount',
            description__icontains=DESCRIPTION_MARKER,
        ).order_by('timestamp')

        loan_ids = sorted({log.record_id for log in logs}, key=int)
        if not loan_ids:
            self.stdout.write(self.style.SUCCESS(
                f'No FinancialAuditLog entries found matching "{DESCRIPTION_MARKER}".'
            ))
            return

        loans = LoanAccount.all_objects.filter(pk__in=loan_ids).select_related('client')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
            if not loans.exists():
                self.stdout.write(self.style.WARNING(
                    f'{loan_number} was not touched by this ad-hoc script.'
                ))
                return

        self.stdout.write(f'Loans touched by the ad-hoc penalty-gap-fix script: {len(loan_ids)}')
        self.stdout.write('')

        still_wrong_open = 0
        still_wrong_closed = 0
        already_ok = 0

        by_loan_id = {}
        for log in logs:
            by_loan_id.setdefault(log.record_id, []).append(log)

        for loan in loans.order_by('loan_number'):
            entries = by_loan_id.get(str(loan.pk), [])
            self.stdout.write(self.style.MIGRATE_HEADING(f'{loan.loan_number} — {loan.client.full_name}'))
            for log in entries:
                self.stdout.write(f'    [{log.timestamp:%Y-%m-%d %H:%M}] {log.description}')

            for sched in loan.repayment_schedule.all().order_by('due_date'):
                expected = sched.principal_due + sched.interest_due + sched.fees_due
                diff = (sched.total_due - expected).quantize(Decimal('0.01'))
                if abs(diff) <= Decimal('0.01'):
                    tag = 'already ok'
                    already_ok += 1
                else:
                    tag = 'STILL WRONG'
                    if sched.status in ('pending', 'partial', 'overdue'):
                        still_wrong_open += 1
                    else:
                        still_wrong_closed += 1
                self.stdout.write(
                    f'  installment #{sched.installment_number:<3d} status={sched.status:<12s} '
                    f'due={sched.due_date}  total_due={sched.total_due:>12,.2f}  '
                    f'expected={expected:>12,.2f}  diff={diff:>10,.2f}  [{tag}]'
                )
            self.stdout.write('')

        self.stdout.write(self.style.WARNING(
            f'Still wrong, open status (safe for repair_schedule_total_due to auto-fix): {still_wrong_open}'
        ))
        self.stdout.write(self.style.WARNING(
            f'Still wrong, closed status (paid/restructured — needs a deliberate decision): {still_wrong_closed}'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Already back in line (fixed by something else since): {already_ok}'
        ))
