"""
Management command: fix_schedule_payment_drift

Finds loans where LoanAccount.total_paid (the aggregate, fed by the GL and
shown on the loan detail screen as "Total Repaid") is AHEAD of the sum of
LoanRepaymentSchedule.total_paid across that loan's installments — i.e. cash
was received and posted (loan balance dropped, GL is correct) but one or more
schedule rows never flipped from 'pending'/'partial'/'overdue' to 'paid'.

Root cause: LoanAccount.record_payment() previously read/updated the loan's
aggregate fields and its schedule rows without locking the loan row, so two
overlapping postings for the same loan (double-submit, retried request,
concurrent collection-sheet items) could both see the same "next pending"
installment as open, both mark only that one row paid, and neither ever
reach the next row — while each posting's own aggregate delta still saved
correctly. See LoanAccount.record_payment() in loans/models.py, which now
takes a select_for_update() lock at entry to prevent this going forward.

This command only repairs the SCHEDULE (cosmetic/status fields) to match
money that has already and correctly moved through the GL. It never touches
GL balances, Account.balance, or LoanAccount.total_paid/outstanding_* — those
are already right. It applies the undistributed amount across the earliest
open installments using the same due-date-ordered waterfall used by
LoanAccount._update_schedule_with_payment().

Usage:
    python manage.py fix_schedule_payment_drift                 # report only
    python manage.py fix_schedule_payment_drift --loan LN-...    # single loan
    python manage.py fix_schedule_payment_drift --fix            # apply fixes
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.db.models import Sum


TOLERANCE = Decimal('0.01')


class Command(BaseCommand):
    help = (
        "Find (and optionally fix) loans whose repayment schedule rows are "
        "behind LoanAccount.total_paid — money posted to the loan but not "
        "reflected as 'paid' on the schedule."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Apply the correction (mark schedule rows paid/partial to match total_paid).',
        )
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Only check/fix a single loan by loan_number.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount

        do_fix = options['fix']
        loan_number = options['loan_number']

        loans = LoanAccount.all_objects.filter(is_deleted=False).order_by('loan_number')
        if loan_number:
            loans = loans.filter(loan_number=loan_number)
        else:
            loans = loans.filter(status__in=['active', 'disbursed', 'defaulted', 'paid_off'])

        affected = []
        checked = 0

        for loan in loans.iterator():
            checked += 1
            schedule_paid = loan.repayment_schedule.aggregate(
                total=Sum('total_paid')
            )['total'] or Decimal('0.00')

            drift = (loan.total_paid or Decimal('0.00')) - schedule_paid
            if drift > TOLERANCE:
                affected.append((loan, schedule_paid, drift))

        self.stdout.write(f"Loans checked: {checked}")
        self.stdout.write(f"Loans with schedule behind total_paid: {len(affected)}")

        if not affected:
            self.stdout.write(self.style.SUCCESS("No drift found."))
            return

        self.stdout.write("\n--- Affected loans ---")
        for loan, schedule_paid, drift in affected:
            self.stdout.write(
                f"  {loan.loan_number:24s} client={loan.client_id}  "
                f"total_paid={loan.total_paid:>10,.2f}  "
                f"schedule_paid={schedule_paid:>10,.2f}  "
                f"undistributed={drift:>10,.2f}"
            )

        if not do_fix:
            self.stdout.write(self.style.WARNING(
                "\nDry-run only. Re-run with --fix to apply corrections to the schedule."
            ))
            return

        fixed = 0
        errors = 0
        for loan, _schedule_paid, drift in affected:
            try:
                with db_transaction.atomic():
                    locked = type(loan).objects.select_for_update().get(pk=loan.pk)
                    self._catch_up_schedule(locked, drift)
                fixed += 1
            except Exception as exc:
                errors += 1
                self.stderr.write(self.style.ERROR(f"  [{loan.loan_number}] FAILED: {exc}"))

        self.stdout.write(self.style.SUCCESS(f"\nFixed {fixed}/{len(affected)} loans. Errors: {errors}."))

    def _catch_up_schedule(self, loan, amount):
        """
        Distribute `amount` (money already reflected in loan.total_paid but not
        yet in any schedule row) across the earliest open installments, in
        due-date order — mirrors LoanAccount._update_schedule_with_payment()
        but only touches schedule rows, never the GL or the loan aggregate.
        """
        remaining = amount
        schedules = loan.repayment_schedule.select_for_update().filter(
            status__in=['pending', 'partial', 'overdue']
        ).order_by('due_date')

        for schedule in schedules:
            if remaining <= 0:
                break

            installment_remaining = schedule.total_due - schedule.total_paid
            if installment_remaining <= 0:
                continue
            payment_to_schedule = min(remaining, installment_remaining)

            if schedule.total_due > 0 and payment_to_schedule > 0:
                ratio = payment_to_schedule / schedule.total_due
                schedule.principal_paid = min(
                    schedule.principal_due,
                    (schedule.principal_paid + schedule.principal_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.interest_paid = min(
                    schedule.interest_due,
                    (schedule.interest_paid + schedule.interest_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.fees_paid = min(
                    schedule.fees_due,
                    (schedule.fees_paid + schedule.fees_due * ratio).quantize(Decimal('0.01')),
                )
                schedule.penalty_paid = min(
                    schedule.penalty_due,
                    (schedule.penalty_paid + schedule.penalty_due * ratio).quantize(Decimal('0.01')),
                )

            schedule.total_paid += payment_to_schedule

            if schedule.total_paid >= schedule.total_due:
                schedule.status = 'paid'
                if not schedule.payment_date:
                    schedule.payment_date = loan.updated_at.date() if loan.updated_at else None
                loan.installments_paid += 1
            else:
                schedule.status = 'partial'

            schedule.save()
            remaining -= payment_to_schedule

        loan.save(update_fields=['installments_paid', 'updated_at'])

        if remaining > TOLERANCE:
            raise ValueError(
                f"{remaining:.2f} still undistributed after filling every open "
                f"installment — loan may be fully paid off already or have no "
                f"open schedule rows left; investigate manually."
            )
