# hr/management/commands/reconcile_advance_gl.py
"""
Management command: reconcile_advance_gl

PURPOSE
-------
Before the Fix #1 bug was corrected (April 2026), one-time DEDUCTION
BonusDeductionRequests stored their name in the payslip deductions dict as:

    "<ComponentName> (One-time)"

The payroll accounting service looked up GL accounts by plain component name,
so the lookup failed and the deduction amount was credited to account 2134
(Other Payroll Deductions Payable) instead of the component's specific GL
account (e.g. 1112 – Staff Advances & Loans).

This means:
  - The advance was debited to 1112 when the request was approved (correct)
  - But at payroll time, 1112 was never credited back — the balance stuck
  - 2134 was over-credited by that same amount

This command posts corrective journal entries:

    DR  Other Payroll Deductions Payable  (2134)  [reclassify out of catch-all]
    CR  <component.gl_account>            (e.g. 1112)  [clear the advance balance]

USAGE
-----
    # Dry-run (preview only, no changes):
    python manage.py reconcile_advance_gl --dry-run

    # Post corrective entries for all affected branches:
    python manage.py reconcile_advance_gl

    # Restrict to a specific branch:
    python manage.py reconcile_advance_gl --branch-id 3

    # Restrict to payrolls paid before a certain date:
    python manage.py reconcile_advance_gl --before 2026-04-22
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db import transaction as db_transaction
from django.utils import timezone


class Command(BaseCommand):
    help = 'Post corrective journal entries to clear mis-posted advance deductions from account 2134 to their proper GL accounts.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            default=False,
            help='Preview what would be posted without writing to the database.',
        )
        parser.add_argument(
            '--branch-id',
            type=int,
            default=None,
            help='Limit to a specific branch ID.',
        )
        parser.add_argument(
            '--before',
            type=str,
            default=None,
            help='Only consider payrolls paid before this date (YYYY-MM-DD). Defaults to today.',
        )

    def handle(self, *args, **options):
        from hr.models import BonusDeductionRequest, SalaryComponent
        from transactions.models import (
            Transaction as JournalEntry,
            TransactionEntry as JournalEntryLine,
            TransactionSeries,
        )
        from accounts.utils.account_creation import get_system_account

        dry_run = options['dry_run']
        branch_id = options['branch_id']

        if options['before']:
            import datetime
            cutoff_date = datetime.date.fromisoformat(options['before'])
        else:
            cutoff_date = timezone.now().date()

        if dry_run:
            self.stdout.write(self.style.WARNING('=== DRY RUN — no changes will be written ===\n'))

        # ── Gather affected requests ──────────────────────────────────────────
        # We are looking for one-time DEDUCTION requests that:
        #  1. Were approved (so an advance journal was posted DR: gl_account / CR: Bank)
        #  2. Were applied in a payroll (so the recovery should have cleared gl_account)
        #  3. Have a gl_account set (so the proper GL is known)
        #  4. The payroll was paid before the cutoff date (processed under the buggy code)
        qs = BonusDeductionRequest.objects.filter(
            status=BonusDeductionRequest.APPROVED,
            component__component_type=SalaryComponent.DEDUCTION,
            component__gl_account__isnull=False,
            applied_in_payroll__isnull=False,
            applied_in_payroll__status='paid',
            applied_in_payroll__paid_at__date__lt=cutoff_date,
            is_deleted=False,
        ).select_related(
            'component__gl_account',
            'staff',
            'applied_in_payroll',
        )

        if branch_id:
            qs = qs.filter(branch_id=branch_id)

        if not qs.exists():
            self.stdout.write(self.style.SUCCESS('No affected BonusDeductionRequests found. Nothing to do.'))
            return

        # ── Group by (branch, gl_account) for batching into single corrective JEs ──
        # { (branch, owner, gl_account_id) : { 'amount': Decimal, 'refs': [str], 'gl_account': Account } }
        groups = {}
        for req in qs:
            branch  = req.branch
            owner   = req.owner
            gl_acc  = req.component.gl_account
            key     = (branch.pk, owner.pk, gl_acc.pk)
            if key not in groups:
                groups[key] = {
                    'branch':     branch,
                    'owner':      owner,
                    'gl_account': gl_acc,
                    'amount':     Decimal('0.00'),
                    'refs':       [],
                    'tenant':     req.staff.tenant,
                }
            groups[key]['amount'] += req.amount
            groups[key]['refs'].append(f"BDR-{req.pk}")

        total_corrected = Decimal('0.00')

        for key, data in groups.items():
            branch     = data['branch']
            owner      = data['owner']
            gl_account = data['gl_account']
            amount     = data['amount']
            refs       = ', '.join(data['refs'])
            tenant     = data['tenant']

            self.stdout.write(
                f"\nBranch {branch}  |  GL: {gl_account}  |  Amount: {amount:,.2f}"
            )
            self.stdout.write(f"  Refs: {refs}")
            self.stdout.write(
                f"  Corrective JE: DR Other Payroll Deductions Payable (2134) {amount:,.2f} "
                f"/ CR {gl_account.account_code} – {gl_account.name} {amount:,.2f}"
            )

            if dry_run:
                total_corrected += amount
                continue

            # ── Post corrective journal entry ─────────────────────────────────
            try:
                with db_transaction.atomic():
                    other_payables_account = get_system_account(
                        'other_payroll_deductions_payable', owner, branch
                    )

                    series, _ = TransactionSeries.objects.get_or_create(
                        code='GLADJ',
                        defaults={'description': 'GL Reclassification / Adjustment'}
                    )

                    je = JournalEntry.objects.create(
                        tenant=tenant,
                        series=series,
                        date=timezone.now().date(),
                        description=(
                            f"Advance GL reclassification: {gl_account.name} "
                            f"(branch {branch}) — refs: {refs}"
                        ),
                        workflow_reference=f"GLADJ-ADV-{branch.pk}-{gl_account.pk}",
                        branch=branch,
                        owner=owner,
                    )

                    # DR: 2134 Other Payroll Deductions Payable
                    JournalEntryLine.objects.create(
                        transaction=je,
                        account=other_payables_account,
                        side=JournalEntryLine.DEBIT,
                        amount=amount,
                    )

                    # CR: component.gl_account (e.g. 1112 Staff Advances & Loans)
                    JournalEntryLine.objects.create(
                        transaction=je,
                        account=gl_account,
                        side=JournalEntryLine.CREDIT,
                        amount=amount,
                    )

                    je.post()

                    self.stdout.write(
                        self.style.SUCCESS(f"  ✓ Posted corrective JE: {je.reference_number}")
                    )
                    total_corrected += amount

            except Exception as exc:
                self.stdout.write(
                    self.style.ERROR(f"  ✗ Failed to post corrective JE: {exc}")
                )

        self.stdout.write('\n' + '─' * 60)
        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"DRY RUN complete. Would correct {total_corrected:,.2f} "
                    f"across {len(groups)} GL account group(s).\n"
                    "Re-run without --dry-run to post the entries."
                )
            )
        else:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Reconciliation complete. Total corrected: {total_corrected:,.2f} "
                    f"across {len(groups)} GL account group(s)."
                )
            )
