"""
common/management/commands/audit_gl_bug_fix_coverage.py
==========================================================
Companion to audit_petty_cash_setup_gap / audit_collection_sheet_posting_gaps
/ audit_bulk_accrual_posting_gaps.

Those three commands report "0 found" as good news, but 0 found is
ambiguous on its own: it could mean the pre-2026-08-26 (commit c1a6b45)
`TransactionEntry(description=...)` bug's fix is holding up under real
traffic, OR it could mean the underlying feature has little-to-no real
usage in this deployment, in which case "0 found" proves nothing about
whether the fix actually works end-to-end.

This command prints raw usage counts for each of the four affected call
sites so a "0 found" result from the other audits can be read correctly:
    - if usage is near-zero, "0 found" is not meaningful evidence
    - if usage is non-trivial, "0 found" is real evidence the fix is
      holding, and any successful (is_posted=True / status=reconciled /
      journal_entry_id not null) row dated on/after 2026-08-26 is direct
      confirmation the fix works, not just the absence of a bug report.

Read-only. Prints counts only, no row-level detail (see the other three
commands for that).

Usage
-----
    python manage.py audit_gl_bug_fix_coverage
"""
from __future__ import annotations

import datetime

from django.core.management.base import BaseCommand
from django.db.models import Count

FIX_DATE = datetime.date(2026, 8, 26)


class Command(BaseCommand):
    help = (
        "Prints real-usage counts for the four call sites the 2026-08-26 "
        "TransactionEntry(description=...) fix touched, so a clean result "
        "from the companion audit_* commands can be told apart from "
        "'this feature just isn't used'."
    )

    def handle(self, *args, **options):
        from cash_management.models import PettyCashFund, DailyCollectionSheet, CollectionSheetItem
        from internal_api.models import BatchRunLog, LoanAccrualRecord

        self.stdout.write(self.style.MIGRATE_HEADING('== Petty cash fund setup =='))
        total_funds = PettyCashFund.objects.exclude(status='closed').count()
        with_entry = PettyCashFund.objects.filter(setup_journal_entry__isnull=False).count()
        posted_since_fix = PettyCashFund.objects.filter(
            setup_journal_entry__isnull=False,
            setup_journal_entry__date__gte=FIX_DATE,
        ).count()
        self.stdout.write(
            f'  {total_funds} non-closed fund(s) total, {with_entry} have a setup_journal_entry '
            f'({posted_since_fix} posted on/after {FIX_DATE}).\n'
        )

        self.stdout.write(self.style.MIGRATE_HEADING('== Daily collection sheet reconciliation =='))
        by_status = dict(
            DailyCollectionSheet.objects.values_list('status').annotate(n=Count('id')).order_by()
        )
        reconciled_since_fix = DailyCollectionSheet.objects.filter(
            status='reconciled', reconciled_at__date__gte=FIX_DATE,
        ).count()
        self.stdout.write(
            f'  Sheets by status: {by_status or "(no sheets at all)"}\n'
            f'  Reconciled on/after {FIX_DATE}: {reconciled_since_fix}\n'
        )

        self.stdout.write(self.style.MIGRATE_HEADING('== Processing-fee collection items =='))
        fee_items = CollectionSheetItem.objects.filter(collection_type='processing_fee')
        fee_total = fee_items.count()
        fee_posted = fee_items.filter(is_posted=True).count()
        fee_posted_since_fix = fee_items.filter(is_posted=True, posted_at__date__gte=FIX_DATE).count()
        self.stdout.write(
            f'  {fee_total} processing_fee item(s) total, {fee_posted} posted '
            f'({fee_posted_since_fix} posted on/after {FIX_DATE}).\n'
        )

        self.stdout.write(self.style.MIGRATE_HEADING('== Bulk loan accrual (Java App 1 -> BulkLoanAccrualView) =='))
        run_total = BatchRunLog.objects.count()
        run_by_status = dict(BatchRunLog.objects.values_list('status').annotate(n=Count('id')).order_by())
        record_total = LoanAccrualRecord.objects.count()
        record_since_fix = LoanAccrualRecord.objects.filter(run_date__gte=FIX_DATE).count()
        record_with_je_since_fix = LoanAccrualRecord.objects.filter(
            run_date__gte=FIX_DATE, journal_entry_id__isnull=False,
        ).count()
        self.stdout.write(
            f'  BatchRunLog rows: {run_total} total, by status: {run_by_status or "(none at all)"}\n'
            f'  LoanAccrualRecord rows: {record_total} total, {record_since_fix} dated on/after {FIX_DATE} '
            f'({record_with_je_since_fix} of those have a journal_entry_id set).\n'
        )
        if run_total == 0:
            self.stdout.write(self.style.WARNING(
                '  No BatchRunLog rows exist AT ALL in this database. This means either Java App 1 '
                'has never called POST /api/internal/batch/run-summary/, or it is pointed at a '
                'different environment/DB entirely. The absence of accrual gaps found by '
                'audit_bulk_accrual_posting_gaps is NOT evidence the fix works - BulkLoanAccrualView '
                'may simply never have been invoked here. Worth confirming with whoever owns the '
                'Java App 1 integration whether loan interest accrual is actually running through '
                'this endpoint for this tenant, or through some other mechanism entirely.\n'
            ))
