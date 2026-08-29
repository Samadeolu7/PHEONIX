"""
Management command: audit_restore_v4_penalty_shortfall_damage

REPORT-ONLY — never writes anything.

Ground-truth companion to audit_total_due_integrity. That command finds
rows where total_due currently doesn't match principal_due + interest_due +
fees_due, by recomputing from scratch — it has no memory of WHY a row is
wrong. This command instead starts from the other end: every
FinancialAuditLog entry restore_flat_schedule_backward_v4.py logged with a
nonzero penalty_shortfall (see that command, ~line 251-254 — it adds
penalty_shortfall to BOTH penalty_due and total_due on a loan's earliest
open row, which is the bug; only penalty_due should ever have received it).

For every such loan, this walks every schedule row (any status, not just
open ones) and reports:
  - whether total_due still matches principal_due+interest_due+fees_due
    today (STILL WRONG) or has since been brought back in line by something
    else (ALREADY OK) — some may have been touched by a later, unrelated
    correction that happened to fix it too.
  - the row's status, so paid/restructured rows (which
    repair_schedule_total_due deliberately never auto-touches) are visible
    separately from open rows (which it can safely fix).

This is the complete, precise scope: every row the bug could possibly have
touched, cross-checked against current state. audit_total_due_integrity's
generic scan should be a subset of "STILL WRONG, status in
pending/partial/overdue" below — if it isn't, something else is also going
on and needs separate investigation.

Usage:
    python manage.py audit_restore_v4_penalty_shortfall_damage
    python manage.py audit_restore_v4_penalty_shortfall_damage --loan LN-886
"""
from decimal import Decimal

from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = (
        'Report-only: ground-truth list of every loan/row restore_flat_schedule_backward_v4 '
        'touched with a nonzero penalty_shortfall, cross-checked against current total_due state.'
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
            extra__source_command='restore_flat_schedule_backward_v4',
        ).order_by('timestamp')

        touched_loan_ids = {}
        for log in logs:
            shortfall = Decimal(log.extra.get('penalty_shortfall', '0'))
            if shortfall == 0:
                continue
            touched_loan_ids[log.record_id] = (log, shortfall)

        if not touched_loan_ids:
            self.stdout.write(self.style.SUCCESS(
                'No FinancialAuditLog entries found for restore_flat_schedule_backward_v4 '
                'with a nonzero penalty_shortfall.'
            ))
            return

        loans = LoanAccount.all_objects.filter(pk__in=touched_loan_ids.keys()).select_related('client')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
            if not loans.exists():
                self.stdout.write(self.style.WARNING(
                    f'{loan_number} was not touched by restore_flat_schedule_backward_v4 '
                    '(or its penalty_shortfall was zero).'
                ))
                return

        self.stdout.write(f'Loans touched with nonzero penalty_shortfall: {len(touched_loan_ids)}')
        self.stdout.write('')

        still_wrong_open = 0
        still_wrong_closed = 0
        already_ok = 0

        for loan in loans.order_by('loan_number'):
            log, shortfall = touched_loan_ids[str(loan.pk)]
            self.stdout.write(self.style.MIGRATE_HEADING(
                f'{loan.loan_number} — {loan.client.full_name} — '
                f'penalty_shortfall logged {log.timestamp:%Y-%m-%d %H:%M} = {shortfall:,.2f}'
            ))
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
            f'Still wrong, closed status (paid/restructured — needs a deliberate decision, no cash impact either way): {still_wrong_closed}'
        ))
        self.stdout.write(self.style.SUCCESS(
            f'Already back in line (fixed by something else since): {already_ok}'
        ))
