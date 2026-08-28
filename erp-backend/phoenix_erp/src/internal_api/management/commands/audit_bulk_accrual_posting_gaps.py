"""
internal_api/management/commands/audit_bulk_accrual_posting_gaps.py
=====================================================================
Finds loans that silently missed accrual cycles due to the pre-2026-08-26
(commit c1a6b45) `TransactionEntry(description=...)` bug in
BulkLoanAccrualView (internal_api/views.py).

Why this needs gap detection instead of a direct query
--------------------------------------------------------
Each entry in a bulk accrual POST is processed inside its own
`with db_transaction.atomic():` block, wrapped in a per-entry try/except.
Before the fix, any loan with `accrual_amount > 0` hit a hard TypeError
posting its GL journal entry, which rolled back that ENTIRE block —
including the `LoanAccrualRecord` row that is this codebase's own "audit
trail of every accrual cycle" (see internal_api/models.py). The exception
was caught, logged, and returned in the HTTP response's `errors` array —
but that array is never persisted anywhere, so there is no direct DB row
marking which loans failed on which dates. `batch_accrual_posted` also
never flipped to True for these loans, but it gets reset to False for
every active loan at the start of each cycle regardless (LoanBatchResetView),
so its *current* value alone can't distinguish "failed historically" from
"hasn't run yet this cycle".

The reliable signal is a GAP: BatchRunLog proves the batch ran and
completed on a given date; if a loan has LoanAccrualRecord rows on either
side of that date (i.e. it was an active participant in this batch before
and after) but no row for that specific date, its accrual for that date
was attempted and silently lost — not merely skipped, since a skip only
happens via a duplicate idempotency_key, which itself requires an existing
record.

This command is read-only. It does not backfill missing accrual or touch
outstanding_interest — it only surfaces which loans have gaps and roughly
how many, so finance can decide whether/how to book the missed interest
income and receivable.

Usage
-----
    python manage.py audit_bulk_accrual_posting_gaps
    python manage.py audit_bulk_accrual_posting_gaps --loan LN-000123
    python manage.py audit_bulk_accrual_posting_gaps --since 2026-01-01
"""
from __future__ import annotations

import datetime
from collections import defaultdict

from django.core.management.base import BaseCommand, CommandError


class Command(BaseCommand):
    help = (
        "Finds loans with missing LoanAccrualRecord rows on dates the batch "
        "definitely ran (BatchRunLog COMPLETED) - the signature of a loan "
        "that silently failed to accrue interest due to the fixed "
        "TransactionEntry(description=...) bug in BulkLoanAccrualView."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--loan', dest='loan_number', default=None,
            help='Restrict to a single loan by loan_number (e.g. LN-000123).',
        )
        parser.add_argument(
            '--since', dest='since', default=None,
            help='Only consider run dates >= this date (YYYY-MM-DD).',
        )
        parser.add_argument(
            '--limit', dest='limit', type=int, default=50,
            help='Max number of affected loans to print in detail (default 50).',
        )

    def handle(self, *args, **options):
        from internal_api.models import BatchRunLog, LoanAccrualRecord
        from loans.models import LoanAccount

        since = None
        if options['since']:
            try:
                since = datetime.date.fromisoformat(options['since'])
            except ValueError:
                raise CommandError('--since must be YYYY-MM-DD')

        run_dates_qs = BatchRunLog.objects.filter(status='COMPLETED')
        if since:
            run_dates_qs = run_dates_qs.filter(run_date__gte=since)
        completed_run_dates = sorted(set(run_dates_qs.values_list('run_date', flat=True)))

        if not completed_run_dates:
            self.stdout.write(self.style.SUCCESS(
                'No COMPLETED BatchRunLog rows found in range - nothing to check.'
            ))
            return

        records_qs = LoanAccrualRecord.objects.filter(run_date__in=completed_run_dates)
        if options['loan_number']:
            try:
                loan = LoanAccount.objects.get(loan_number=options['loan_number'])
            except LoanAccount.DoesNotExist:
                raise CommandError(f"No loan found with loan_number={options['loan_number']!r}")
            records_qs = records_qs.filter(loan_id=loan.pk)

        # loan_id -> set of run_dates it has a record for
        recorded = defaultdict(set)
        for loan_id, run_date in records_qs.values_list('loan_id', 'run_date'):
            recorded[loan_id].add(run_date)

        if not recorded:
            self.stdout.write(self.style.SUCCESS(
                'No LoanAccrualRecord rows found for the given range/loan - '
                'nothing to compare gaps against.'
            ))
            return

        # A loan is only "in scope" for a given run_date if it has records on
        # both an earlier and later run_date in this window (i.e. it was an
        # active batch participant spanning that gap) — this avoids flagging
        # loans that were simply disbursed/closed outside the window.
        gaps = {}  # loan_id -> sorted list of missing run_dates
        for loan_id, dates in recorded.items():
            first, last = min(dates), max(dates)
            spanned = [d for d in completed_run_dates if first < d < last]
            missing = [d for d in spanned if d not in dates]
            if missing:
                gaps[loan_id] = missing

        if not gaps:
            self.stdout.write(self.style.SUCCESS(
                'No accrual gaps found - every loan has a LoanAccrualRecord '
                'for every COMPLETED batch run date within its own active span.'
            ))
            return

        loans = {
            l.pk: l for l in
            LoanAccount.objects.filter(pk__in=gaps.keys()).select_related('client')
        }
        total_gap_days = sum(len(v) for v in gaps.values())
        self.stdout.write(self.style.WARNING(
            f'{len(gaps)} loan(s) have {total_gap_days} total missing accrual '
            f'date(s) across {len(completed_run_dates)} completed batch runs '
            f'checked:\n'
        ))

        for loan_id, missing_dates in sorted(gaps.items(), key=lambda kv: -len(kv[1]))[:options['limit']]:
            loan = loans.get(loan_id)
            label = loan.loan_number if loan else f'(deleted loan id={loan_id})'
            client = getattr(loan, 'client', None)
            preview = ', '.join(str(d) for d in missing_dates[:5])
            more = f' (+{len(missing_dates) - 5} more)' if len(missing_dates) > 5 else ''
            self.stdout.write(
                f'  {label}  client={client}  '
                f'missing {len(missing_dates)} date(s): {preview}{more}\n'
            )

        if len(gaps) > options['limit']:
            self.stdout.write(
                self.style.NOTICE(f'\n...and {len(gaps) - options["limit"]} more loan(s) not shown (raise --limit).')
            )
