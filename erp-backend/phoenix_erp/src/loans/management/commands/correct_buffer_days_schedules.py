"""
Management command: correct_buffer_days_schedules

Fixes repayment schedules generated before the first_repayment_buffer_days
bug fix. Before the fix, _build_due_dates() treated the buffer as a floor
("first repayment won't be before day N"), so any buffer <= the product's
natural repayment period (e.g. 7 days on a weekly loan) was silently a
no-op. The fix makes the buffer additive: it's now added on top of the
first naturally-occurring due date.

This command finds loans whose stored schedule matches what the OLD
(buggy) algorithm would have produced, and re-bases every installment's
due_date by the same constant offset the fix would have applied — cadence
and installment amounts are left untouched, only dates move.

Note this is a deliberately simpler correction than fully regenerating the
schedule: a full regenerate would, for some buffer/frequency combinations,
produce one FEWER installment than the buggy schedule had (because the
later first-due-date leaves less room before the loan's original maturity
window). This command does not drop or merge installments or touch amounts
— it shifts every row by the same offset, which means the loan's effective
maturity moves out by that same offset too. loan.first_payment_date and
loan.maturity_date (both denormalized copies of the first/last schedule
row's due_date, see LoanAccount.disburse()) are updated to match. Nothing
else reads those fields as a hard cutoff, so this is safe.

Safety by construction:
  - Dry-run by default. Nothing is written unless --apply is passed.
  - Detection is self-diagnosing: it recomputes what the OLD algorithm
    would have produced for each loan and only flags loans whose actual
    stored first-installment due_date matches that exactly. It does not
    rely on guessing deployment dates.
  - Loans where ANY installment has a payment recorded (total_paid > 0) or
    deferred-interest recognized (interest_recognized=True) are never
    auto-corrected — they're listed separately as "needs manual review",
    since shifting dates on a schedule with real payment/GL activity
    against it is a judgment call, not something to script blindly.
  - --apply requires either --loan <loan_number> (single loan) or
    --all-safe (every loan in the safe bucket) — never both silently
    combined, and there is no flag to force-apply to the unsafe bucket.
  - Writes a FinancialAuditLog(LOAN_BALANCE_CORRECTION) entry per
    corrected loan recording the shift applied.

Usage:
    python manage.py correct_buffer_days_schedules                       # report only
    python manage.py correct_buffer_days_schedules --loan LN-770         # preview one loan
    python manage.py correct_buffer_days_schedules --loan LN-770 --apply # apply to one loan
    python manage.py correct_buffer_days_schedules --all-safe --apply    # apply to every safe loan
"""
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction
from django.utils import timezone


def _old_first_due(disbursement_date, date_increment, buffer_days):
    """Replicates the pre-fix (buggy, floor-semantics) first-due-date calc."""
    first_due = disbursement_date + date_increment
    if buffer_days > 0:
        buffer_end = disbursement_date + timedelta(days=buffer_days)
        while first_due < buffer_end:
            first_due += date_increment
    return first_due


def _new_first_due(disbursement_date, date_increment, buffer_days):
    """Replicates the post-fix (additive) first-due-date calc."""
    first_due = disbursement_date + date_increment
    if buffer_days > 0:
        first_due += timedelta(days=buffer_days)
    return first_due


class Command(BaseCommand):
    help = (
        "Correct repayment schedules generated under the old buggy "
        "first_repayment_buffer_days floor logic. Dry-run unless --apply is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Scope to a single loan. Without this, scans all loans.',
        )
        parser.add_argument(
            '--all-safe',
            action='store_true',
            help='With --apply, correct every affected loan that has zero payment/GL '
                 'activity recorded against it. Ignored in dry-run (report already lists them).',
        )
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Actually write the correction. Without this, only reports what would happen.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanAccount, LoanRepaymentSchedule
        from loans.schedule_service import FREQ_CONFIG, _DEFAULT_FREQ
        from common.models import FinancialAuditLog, log_financial_event

        loan_number = options['loan_number']
        apply_changes = options['apply']
        all_safe = options['all_safe']
        today = timezone.localdate()

        if apply_changes and not loan_number and not all_safe:
            raise CommandError("--apply requires either --loan <loan_number> or --all-safe.")

        qs = LoanAccount.all_objects.select_related('product').filter(
            disbursement_date__isnull=False,
            product__first_repayment_buffer_days__gt=0,
        ).prefetch_related('repayment_schedule')
        if loan_number:
            qs = qs.filter(loan_number=loan_number)

        safe, unsafe, unaffected = [], [], 0

        for loan in qs:
            schedule = sorted(loan.repayment_schedule.all(), key=lambda s: s.installment_number)
            if not schedule:
                continue

            buffer_days = loan.product.first_repayment_buffer_days
            date_increment, _ = FREQ_CONFIG.get(loan.repayment_frequency, _DEFAULT_FREQ)

            old_first_due = _old_first_due(loan.disbursement_date, date_increment, buffer_days)
            new_first_due = _new_first_due(loan.disbursement_date, date_increment, buffer_days)

            first_row = schedule[0]
            if first_row.due_date != old_first_due or old_first_due == new_first_due:
                unaffected += 1
                continue

            shift_days = (new_first_due - old_first_due).days
            has_activity = any(
                row.total_paid > 0 or row.interest_recognized for row in schedule
            )
            entry = (loan, schedule, shift_days, old_first_due, new_first_due)
            (unsafe if has_activity else safe).append(entry)

        if loan_number and not safe and not unsafe:
            self.stdout.write(self.style.SUCCESS(
                f"{loan_number}: not affected by the buffer bug (schedule already matches "
                f"current logic, or buffer had no effect either way) — nothing to do."
            ))
            return

        self.stdout.write(
            f"Scanned. Affected: {len(safe) + len(unsafe)}  "
            f"(safe to auto-correct: {len(safe)}, needs manual review: {len(unsafe)})  "
            f"Unaffected/skipped: {unaffected}"
        )

        for loan, schedule, shift_days, old_first_due, new_first_due in unsafe:
            self.stdout.write(self.style.WARNING(
                f"  [MANUAL REVIEW] {loan.loan_number}: first_due {old_first_due} -> {new_first_due} "
                f"(+{shift_days}d) — has payment/GL activity on at least one installment, skipped."
            ))

        for loan, schedule, shift_days, old_first_due, new_first_due in safe:
            self.stdout.write(
                f"  [SAFE] {loan.loan_number}: first_due {old_first_due} -> {new_first_due} "
                f"(+{shift_days}d) across {len(schedule)} installment(s), no payments recorded yet."
            )

        if not apply_changes:
            self.stdout.write(self.style.WARNING(
                "\nDRY RUN — nothing written. Re-run with --apply (and --loan or --all-safe) to write this correction."
            ))
            return

        targets = safe if all_safe else [e for e in safe if e[0].loan_number == loan_number]
        if loan_number and not targets:
            matched_unsafe = [e for e in unsafe if e[0].loan_number == loan_number]
            if matched_unsafe:
                raise CommandError(
                    f"{loan_number} has payment/GL activity recorded against it — refusing to "
                    f"auto-correct. This needs a manual, individually-reviewed fix."
                )
            raise CommandError(f"{loan_number} is not in the safe-to-correct set.")

        corrected = []
        with db_transaction.atomic():
            for loan, schedule, shift_days, old_first_due, new_first_due in targets:
                delta = timedelta(days=shift_days)
                installment_numbers = []
                for row in schedule:
                    due_before = row.due_date
                    row.due_date = row.due_date + delta
                    if row.status == 'overdue' and row.due_date >= today:
                        row.status = 'pending'
                    row.save(update_fields=['due_date', 'status', 'updated_at'])
                    installment_numbers.append((row.installment_number, str(due_before), str(row.due_date)))

                old_maturity_date = loan.maturity_date
                old_first_payment_date = loan.first_payment_date
                loan.first_payment_date = schedule[0].due_date
                loan.maturity_date = schedule[-1].due_date
                loan.save(update_fields=['first_payment_date', 'maturity_date', 'updated_at'])

                log_financial_event(
                    FinancialAuditLog.LOAN_BALANCE_CORRECTION,
                    acted_by=None,
                    record_type='LoanAccount',
                    record_id=str(loan.pk),
                    description=(
                        f'Buffer-days schedule correction — {loan.loan_number}: shifted '
                        f'{len(schedule)} installment(s) forward by {shift_days} day(s) to match '
                        f'the fixed first_repayment_buffer_days (additive) logic.'
                    ),
                    extra={
                        'loan_number': loan.loan_number,
                        'product_id': loan.product_id,
                        'buffer_days': loan.product.first_repayment_buffer_days,
                        'shift_days': shift_days,
                        'old_first_due': str(old_first_due),
                        'new_first_due': str(new_first_due),
                        'installments_shifted': installment_numbers,
                        'first_payment_date_before': str(old_first_payment_date),
                        'first_payment_date_after': str(loan.first_payment_date),
                        'maturity_date_before': str(old_maturity_date),
                        'maturity_date_after': str(loan.maturity_date),
                        'source_command': 'correct_buffer_days_schedules',
                    },
                )
                corrected.append(loan.loan_number)

        self.stdout.write(self.style.SUCCESS(
            f"\nApplied. Corrected {len(corrected)} loan(s): {', '.join(corrected)}"
        ))
