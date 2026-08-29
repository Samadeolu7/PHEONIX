"""
Management command: fix_stuck_overdue_status

Found 2026-08-29 on LN-886 (Damola Kadiri): repair_schedule_total_due
correctly fixed a corrupted total_due back down to what she'd already
paid, but the row's own status stayed 'overdue' (and days_in_arrears kept
counting it) because nothing re-derives status when total_due changes —
only _update_schedule_with_payment() (at actual payment time) ever flips
'overdue'/'partial' -> 'paid'. repair_schedule_total_due has since been
fixed (see fixes 18a397a/24aed81) to do this DURING its own repair, but
that only helps rows it repairs from here on — it can't retroactively fix
the 37 rows already repaired in the 2026-08-29 --all --apply run before
that fix existed. This is that one-time retroactive pass.

Scope: every LoanRepaymentSchedule row, any loan, where status is
'overdue' or 'partial' but total_paid already covers total_due (i.e. it's
genuinely fully settled and just never got told). Not limited to the 37
loans from today's total_due repair — the same "total_due changed but
status never re-checked" gap could exist wherever anything else has ever
adjusted total_due without touching status (e.g. the restore_flat_schedule_
backward_v2/v3/v4 family), so this scans the whole book.

For each flagged row: sets status='paid', payment_date from the row's own
most recent LoanRepaymentAllocation (the real settling payment's journal
entry date — never today, to stay historically accurate; falls back to
today only if no allocation is found), days_late if payment_date is past
due_date, and increments loan.installments_paid. Then refreshes that
loan's arrears_amount/days_in_arrears/risk_classification (never
outstanding_penalties/GL — this command touches status only, no money).

Usage:
    python manage.py fix_stuck_overdue_status              # dry-run
    python manage.py fix_stuck_overdue_status --apply
    python manage.py fix_stuck_overdue_status --loan LN-886 --apply
"""
from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = (
        "Flip LoanRepaymentSchedule rows stuck on 'overdue'/'partial' to 'paid' when "
        "total_paid already covers total_due — a status/payment_date/days_late-only "
        "retroactive fix, no money touched. Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument('--loan', dest='loan_number', default=None,
                             help='Scope to a single loan. Without this, scans all loans.')
        parser.add_argument('--apply', action='store_true',
                             help='Actually write the fix. Without this, only previews.')

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule

        loan_number = options['loan_number']
        apply_changes = options['apply']
        today = timezone.localdate()

        schedules = LoanRepaymentSchedule.all_objects.filter(
            status__in=['overdue', 'partial'],
        ).select_related('loan').order_by('loan__loan_number', 'due_date')
        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        stuck = [s for s in schedules.iterator() if s.total_paid >= s.total_due]

        if not stuck:
            self.stdout.write(self.style.SUCCESS('No stuck rows found.'))
            return

        self.stdout.write(f'Stuck rows found (status wrong, already fully paid): {len(stuck)}')

        loans_touched = {}
        with db_transaction.atomic():
            for sched in stuck:
                loan = sched.loan
                last_alloc = sched.payment_allocations.order_by('-journal_entry__date').first()
                payment_date = last_alloc.journal_entry.date if last_alloc else today

                self.stdout.write(
                    f'  {loan.loan_number:20s} installment #{sched.installment_number:<3d} '
                    f'status={sched.status:<8s} total_due={sched.total_due:>12,.2f} '
                    f'total_paid={sched.total_paid:>12,.2f}  -> status=paid, payment_date={payment_date}'
                )

                if not apply_changes:
                    continue

                sched.status = 'paid'
                sched.payment_date = payment_date
                update_fields = ['status', 'payment_date', 'updated_at']
                if sched.due_date and payment_date > sched.due_date:
                    sched.days_late = (payment_date - sched.due_date).days
                    update_fields.append('days_late')
                sched.save(update_fields=update_fields)

                loans_touched[loan.pk] = loan

            if apply_changes:
                for loan in loans_touched.values():
                    loan.refresh_from_db()
                    stuck_on_this_loan = sum(1 for s in stuck if s.loan_id == loan.pk)
                    loan.installments_paid += stuck_on_this_loan
                    loan._calculate_arrears()
                    loan.update_risk_classification()
                    loan.save(update_fields=[
                        'installments_paid', 'risk_classification',
                        'provision_pct', 'provision_amount', 'updated_at',
                    ])
                    self.stdout.write(
                        f'  {loan.loan_number}: days_in_arrears={loan.days_in_arrears} '
                        f'arrears_amount={loan.arrears_amount:,.2f} risk={loan.risk_classification}'
                    )

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                '\nDRY-RUN — nothing written. Re-run with --apply to fix.'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f'\nApplied. Fixed {len(stuck)} row(s) across {len(loans_touched)} loan(s).'
            ))
