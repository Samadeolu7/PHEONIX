"""
Management command: inspect_loan_audit_trail

READ-ONLY. Dumps every FinancialAuditLog entry that touches one loan —
either directly (record_type='LoanAccount', record_id=loan.pk), against any
of its schedule rows (record_type='LoanRepaymentSchedule', record_id in
that loan's row pks), or anything else whose `extra` mentions this
loan_number — in chronological order.

Built 2026-08-29 while chasing LN-886 (Damola Kadiri)'s total_due
corruption: inspect_loan_gl_trace only shows actual GL Transaction
postings, but several correction commands write a FinancialAuditLog entry
even when they don't post any journal entry (e.g. nothing currently owed,
or a pure schedule-row field correction with no GL impact) — so a silent
total_due change can be invisible to the GL trace and only show up here.

Usage:
    python manage.py inspect_loan_audit_trail LN-886
"""
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q


class Command(BaseCommand):
    help = 'Read-only: dump every FinancialAuditLog entry touching one loan, chronologically.'

    def add_arguments(self, parser):
        parser.add_argument('loan_number', type=str)

    def handle(self, *args, **options):
        from loans.models import LoanAccount
        from common.models import FinancialAuditLog

        loan_number = options['loan_number']
        try:
            loan = LoanAccount.all_objects.select_related('client').get(loan_number=loan_number)
        except LoanAccount.DoesNotExist:
            raise CommandError(f"No LoanAccount found with loan_number='{loan_number}'")

        sched_pks = [str(pk) for pk in loan.repayment_schedule.all().values_list('pk', flat=True)]

        logs = FinancialAuditLog.objects.filter(
            Q(record_type='LoanAccount', record_id=str(loan.pk))
            | Q(record_type='LoanRepaymentSchedule', record_id__in=sched_pks)
            | Q(extra__loan_number=loan_number)
        ).order_by('timestamp').distinct()

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'{loan.loan_number} — {loan.client.full_name} — {logs.count()} FinancialAuditLog entr'
            f'{"y" if logs.count() == 1 else "ies"}'
        ))

        for log in logs:
            self.stdout.write('')
            self.stdout.write(
                f'[{log.timestamp:%Y-%m-%d %H:%M}] {log.get_event_type_display()}  '
                f'record_type={log.record_type}  record_id={log.record_id}  amount={log.amount}'
            )
            self.stdout.write(f'    {log.description}')
            source = log.extra.get('source_command') if log.extra else None
            if source:
                self.stdout.write(f'    source_command={source}')
            for key in (
                'installment_number', 'schedule_total_due_before', 'schedule_total_due_after',
                'schedule_penalty_due_before', 'schedule_penalty_due_after',
                'penalty_shortfall', 'flat_installment', 'rows_updated',
            ):
                if log.extra and key in log.extra:
                    self.stdout.write(f'    {key}={log.extra[key]}')
