"""
Management command: audit_penalty_compounding_bug_damage

READ-ONLY. Quantifies the damage from the penalty-on-penalty compounding
bug in update_loan_status.py, live from 2026-08-12 (when accrual-based
penalty income recognition went live, see commit c8592071 "implement
accrual-based penalty income recognition") through today.

The bug: the daily cron computed each overdue installment's fresh penalty
as a percentage of `sched.total_due - sched.total_paid`, but total_due
structurally INCLUDES the row's own penalty_due (penalty is folded into
total_due the same way interest/fees are — see models.py ~1986-1989,
"sched.total_due += portion" right after penalty_due is added). So every
day the job ran on a still-overdue installment, it fed yesterday's
already-assessed penalty back into today's base amount — charging penalty
on penalty, instead of the intended "flat percentage, once per real
missed period" behavior. Fixed in update_loan_status.py 2026-08-22 to use
principal+interest+fees remaining only, excluding the row's own
penalty_due from the base.

Methodology: for every LOAN_PENALTY_ACCRUAL FinancialAuditLog entry in the
window (one per schedule row per day the job assessed a change), grouped
by schedule row, this:
  1. Sums the actual deltas posted in the window — the real net GL amount
     (Dr Loan Receivable / Cr Penalty Income, or reverse for a downward
     self-correction) that hit the ledger for that row during the bug's
     live period. Cross-checked independently against the row's actual
     LNPEN Transaction/TransactionEntry postings for the same window —
     the two sums must match, since log_financial_event was always called
     with amount=delta immediately after creating each journal entry.
  2. Recomputes what that row's penalty_due SHOULD be right now under the
     corrected (non-penalty-only base) formula, at today's days_late —
     this reflects the true, un-compounded answer regardless of the buggy
     day-by-day path that actually happened, since calculate_late_penalty
     recomputes an absolute figure each time, not an incremental one.
  3. phantom_excess = current penalty_due (still on the row today) minus
     that corrected recomputation — the material, currently-still-
     outstanding overstatement. Rows already paid off, restructured, or
     otherwise no longer holding the inflated figure will show 0 or a
     small/negative value here even if real GL postings happened in the
     window — this command reports both figures separately so nothing is
     double-counted or hidden.

Does NOT reverse anything — report only. What to do with the totals
(credit adjustment, GL reversal, write-down) needs a decision once the
real scope is known.

Usage:
    python manage.py audit_penalty_compounding_bug_damage
    python manage.py audit_penalty_compounding_bug_damage --since 2026-08-12
"""
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from django.core.management.base import BaseCommand
from django.utils import timezone

DEFAULT_WINDOW_START = date(2026, 8, 12)
TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        'READ-ONLY: quantifies phantom penalty from the penalty-on-penalty compounding bug '
        '(update_loan_status.py, live 2026-08-12 to 2026-08-22) — actual GL amount posted per '
        'row in the window vs. what the corrected formula says should be owed today.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--since', dest='since', default=None,
                             help='Window start date (YYYY-MM-DD). Default: 2026-08-12.')

    def handle(self, *args, **options):
        from common.models import FinancialAuditLog
        from loans.models import LoanRepaymentSchedule
        from transactions.models import TransactionEntry as JournalEntryLine

        since = (
            datetime.strptime(options['since'], '%Y-%m-%d').date()
            if options['since'] else DEFAULT_WINDOW_START
        )
        today = timezone.localdate()

        logs = FinancialAuditLog.objects.filter(
            event_type=FinancialAuditLog.LOAN_PENALTY_ACCRUAL,
            timestamp__date__gte=since,
        ).order_by('timestamp')

        by_schedule = defaultdict(lambda: {'deltas': [], 'loan_number': None})
        for log in logs.iterator():
            sched_id = (log.extra or {}).get('schedule_id')
            if not sched_id:
                continue
            entry = by_schedule[sched_id]
            entry['deltas'].append(log.amount)
            entry['loan_number'] = (log.extra or {}).get('loan_number', log.record_id)

        self.stdout.write(f'Window: {since} -> {today}  ({len(by_schedule)} schedule rows touched)\n')

        rows_out = []
        total_net_posted = Decimal('0.00')
        total_phantom_outstanding = Decimal('0.00')
        cross_check_mismatches = []

        for sched_id, info in by_schedule.items():
            net_posted = sum(info['deltas']) or Decimal('0.00')
            total_net_posted += net_posted

            try:
                sched = LoanRepaymentSchedule.objects.select_related('loan', 'loan__product').get(pk=sched_id)
            except LoanRepaymentSchedule.DoesNotExist:
                rows_out.append((info['loan_number'], sched_id, net_posted, None, None, 'ROW DELETED'))
                continue

            loan = sched.loan
            product = loan.product

            # Independent cross-check: actual GL debit lines against this loan's
            # account, posted under the LNPEN series, in the same window — must
            # match net_posted (within tolerance) or something is inconsistent
            # between the audit log and the real ledger.
            gl_lines = JournalEntryLine.objects.filter(
                transaction__series__code='LNPEN',
                transaction__date__gte=since,
                account=loan.account,
            )
            gl_debits = sum(l.amount for l in gl_lines.filter(side=JournalEntryLine.DEBIT)) or Decimal('0.00')
            gl_credits = sum(l.amount for l in gl_lines.filter(side=JournalEntryLine.CREDIT)) or Decimal('0.00')
            gl_net = gl_debits - gl_credits
            if abs(gl_net - net_posted) > TOLERANCE:
                cross_check_mismatches.append((info['loan_number'], sched_id, net_posted, gl_net))

            non_penalty_remaining = (
                (sched.principal_due + sched.interest_due + sched.fees_due)
                - (sched.principal_paid + sched.interest_paid + sched.fees_paid)
            )
            days_late = product.effective_days_late(sched.due_date, today)
            corrected_penalty = (
                product.calculate_late_penalty(non_penalty_remaining, days_late, loan.repayment_frequency)
                if days_late > 0 else Decimal('0.00')
            )
            phantom = sched.penalty_due - corrected_penalty
            if phantom > 0:
                total_phantom_outstanding += phantom

            rows_out.append((
                info['loan_number'], sched_id, net_posted, sched.penalty_due, corrected_penalty, phantom,
            ))

        rows_out.sort(key=lambda r: (r[5] if len(r) > 5 and r[5] is not None else Decimal('0')), reverse=True)

        self.stdout.write('=== Per-row detail (sorted by currently-outstanding phantom excess) ===')
        for r in rows_out:
            if r[-1] == 'ROW DELETED':
                loan_number, sched_id, net_posted, _, _, _ = r
                self.stdout.write(f'[{loan_number}] sched={sched_id} net_posted_in_window={net_posted:,.2f}  ROW NO LONGER EXISTS')
                continue
            loan_number, sched_id, net_posted, current_penalty_due, corrected_penalty, phantom = r
            self.stdout.write(
                f'[{loan_number}] sched={sched_id}  net_GL_posted_in_window={net_posted:,.2f}  '
                f'current_penalty_due={current_penalty_due:,.2f}  corrected_penalty_due={corrected_penalty:,.2f}  '
                f'phantom_still_outstanding={phantom:,.2f}'
            )

        if cross_check_mismatches:
            self.stdout.write(self.style.WARNING(f'\n=== {len(cross_check_mismatches)} cross-check mismatches (audit log vs actual GL) ==='))
            for m in cross_check_mismatches:
                self.stdout.write(f'  {m}')

        self.stdout.write(self.style.MIGRATE_HEADING(
            f'\n=== TOTALS ===\n'
            f'Schedule rows touched by LNPEN in window: {len(by_schedule)}\n'
            f'Total NET amount posted to GL via LNPEN in window (Dr Loan Receivable / Cr Penalty Income, net of self-corrections): {total_net_posted:,.2f}\n'
            f'Total phantom penalty STILL outstanding today (sum of positive phantom_excess only): {total_phantom_outstanding:,.2f}\n'
        ))
