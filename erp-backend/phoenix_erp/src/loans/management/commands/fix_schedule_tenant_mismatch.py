"""
Management command: fix_schedule_tenant_mismatch

Finds LoanRepaymentSchedule rows whose `tenant` does not match their loan's
own `tenant` (including rows where tenant is NULL). These rows are created by
RepaymentScheduleService.generate() at disbursement time; before this fix it
relied on TimeStampedModel.save()'s thread-local tenant fallback instead of
passing tenant=loan.tenant explicitly (see loans/schedule_service.py).

A mismatched/NULL tenant on a schedule row makes it invisible to any
tenant-scoped query — in particular LoanAccount._update_schedule_with_payment(),
which reads `self.repayment_schedule` (OwnerBranchManager, tenant-filtered).
The result: a repayment posts fine to the GL and to the loan's own aggregate
totals, but the schedule row it should have marked 'paid' is never even
selected, let alone updated — silently, with no exception. This is a
DIFFERENT bug from the posting-race fixed in LoanAccount.record_payment();
this one causes a payment to miss the schedule entirely (0 rows updated),
not just one row in a multi-payment sequence.

This command never touches money — it only rewrites the `tenant` FK on
schedule rows to match their loan. Run schedule-payment-drift AFTER this to
catch up any schedule rows now correctly visible but still behind on
total_paid.

Usage:
    python manage.py fix_schedule_tenant_mismatch                # report only
    python manage.py fix_schedule_tenant_mismatch --loan LN-...  # single loan
    python manage.py fix_schedule_tenant_mismatch --fix          # apply fix
"""

from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction


class Command(BaseCommand):
    help = (
        "Find (and optionally fix) LoanRepaymentSchedule rows whose tenant "
        "doesn't match their loan's tenant — makes the row invisible to "
        "tenant-scoped queries used when posting repayments."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Set the mismatched rows\' tenant to match their loan.',
        )
        parser.add_argument(
            '--loan',
            dest='loan_number',
            default=None,
            help='Only check/fix a single loan by loan_number.',
        )

    def handle(self, *args, **options):
        from loans.models import LoanRepaymentSchedule

        do_fix = options['fix']
        loan_number = options['loan_number']

        # all_tenants() bypasses the OwnerBranchManager's automatic tenant
        # filter so mismatched/NULL-tenant rows are actually visible to us.
        schedules = (
            LoanRepaymentSchedule.all_objects.all_tenants()
            .select_related('loan')
            .order_by('loan__loan_number', 'installment_number')
        )
        if loan_number:
            schedules = schedules.filter(loan__loan_number=loan_number)

        mismatched = []
        checked = 0
        for row in schedules.iterator():
            checked += 1
            if row.tenant_id != row.loan.tenant_id:
                mismatched.append(row)

        affected_loans = sorted({row.loan.loan_number for row in mismatched})

        self.stdout.write(f"Schedule rows checked: {checked}")
        self.stdout.write(f"Rows with tenant mismatch: {len(mismatched)}")
        self.stdout.write(f"Loans affected: {len(affected_loans)}")

        if not mismatched:
            self.stdout.write(self.style.SUCCESS("No tenant mismatches found."))
            return

        self.stdout.write("\n--- Affected rows ---")
        for row in mismatched:
            self.stdout.write(
                f"  {row.loan.loan_number:24s} installment#{row.installment_number:<3d} "
                f"row.tenant={row.tenant_id!s:<6s} loan.tenant={row.loan.tenant_id!s:<6s} "
                f"status={row.status}"
            )

        if not do_fix:
            self.stdout.write(self.style.WARNING(
                "\nDry-run only. Re-run with --fix to correct the tenant on these rows, "
                "then run fix_schedule_payment_drift to catch up any paid-but-unmarked installments."
            ))
            return

        fixed = 0
        errors = 0
        with db_transaction.atomic():
            for row in mismatched:
                try:
                    row.tenant = row.loan.tenant
                    row.save(update_fields=['tenant'])
                    fixed += 1
                except Exception as exc:
                    errors += 1
                    self.stderr.write(self.style.ERROR(
                        f"  [{row.loan.loan_number}#{row.installment_number}] FAILED: {exc}"
                    ))

        self.stdout.write(self.style.SUCCESS(f"\nFixed {fixed}/{len(mismatched)} rows. Errors: {errors}."))
        self.stdout.write(
            "\nNow run: python manage.py fix_schedule_payment_drift --fix "
            "to catch up any installments that should already be marked paid."
        )
