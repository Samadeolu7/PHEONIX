"""
Preview or run the automatic prepaid release (e.g. Rent Prepayment -> Rent Expense).

    python manage.py run_prepaid_amortization --dry-run
    python manage.py run_prepaid_amortization
    python manage.py run_prepaid_amortization --reference PREP-0001 --as-of 2026-10-31

Same logic as the daily Celery job (expenses.tasks.post_due_prepaid_amortizations).
Use it to check what will post before switching a record on, or to catch up if
the scheduled job was down. Months already posted are skipped.
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from django.utils.dateparse import parse_date

from expenses.services.expense_accounting import PrepaidExpenseAccountingService
from expenses.services.prepaid_amortization import (
    due_candidates, plan_due_amortizations, post_due_amortizations,
)


class Command(BaseCommand):
    help = 'Post (or preview) due monthly releases for auto-amortizing prepaid expenses.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Show what would post; write nothing.')
        parser.add_argument('--as-of', help='Treat this date (YYYY-MM-DD) as today. Default: today.')
        parser.add_argument('--reference', help='Only this prepaid expense reference number.')

    def handle(self, *args, **opts):
        as_of = timezone.localdate()
        if opts['as_of']:
            as_of = parse_date(opts['as_of'])
            if not as_of:
                raise CommandError('--as-of must be YYYY-MM-DD')

        qs = due_candidates(as_of).select_related(
            'category__expense_account', 'category__prepaid_account'
        )
        if opts['reference']:
            qs = qs.filter(reference_number=opts['reference'])

        dry = opts['dry_run']
        self.stdout.write(f"{'DRY RUN — ' if dry else ''}as of {as_of}, {qs.count()} candidate(s)")

        total_journals = 0
        for prepaid in qs:
            plan = plan_due_amortizations(prepaid, as_of)
            if not plan:
                continue
            svc = PrepaidExpenseAccountingService(prepaid)
            dr, cr = svc._get_expense_account(), svc._get_prepaid_account()
            self.stdout.write(
                f"\n{prepaid.reference_number} [{prepaid.branch}] {prepaid.description[:50]}\n"
                f"  total {prepaid.total_amount} over {prepaid.amortization_months} months "
                f"from {prepaid.amortization_start_date:%b %Y}; released so far {prepaid.consumed_amount}\n"
                f"  Dr {dr.code} {dr.name} / Cr {cr.code} {cr.name}"
            )
            if dry:
                for period_end, amount in plan:
                    self.stdout.write(f"    {period_end}  {amount}")
                total_journals += len(plan)
                continue
            try:
                for period_end, amount, journal in post_due_amortizations(prepaid.pk, as_of):
                    self.stdout.write(f"    {period_end}  {amount}  -> journal {journal.pk}")
                    total_journals += 1
            except Exception as exc:  # noqa: BLE001
                self.stderr.write(self.style.ERROR(f"    FAILED: {exc}"))

        verb = 'would post' if dry else 'posted'
        self.stdout.write(self.style.SUCCESS(f"\nDone: {verb} {total_journals} journal(s)."))
