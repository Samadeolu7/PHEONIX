"""
cash_management/management/commands/audit_collection_sheet_posting_gaps.py
============================================================================
Surfaces two distinct GL-posting gaps left by the pre-2026-08-26 (commit
c1a6b45) `TransactionEntry(description=...)` bug in cash_management/models.py:

1. DailyCollectionSheet.reconcile() — the EOD cash-to-bank sweep — is a
   single db_transaction.atomic() method. Before the fix, any sheet with
   cash to sweep (and a fully configured cashier/bank GL account) raised a
   TypeError inside that block, which rolled back the ENTIRE reconcile()
   call — including the `status = 'reconciled'` transition. The calling
   view (PettyCash... actually DailyCollectionSheetViewSet.reconcile) catches
   the exception and returns it as a 400, so this was visible to whoever
   clicked "Reconcile", but the sheet was left permanently stuck in
   'submitted' unless someone retried after the fix landed. (There is also
   a `notify_unreconciled_sheets` Celery task that pages the officer's
   supervisor once a submitted sheet passes its grace period — so some of
   these may already be known to ops, just not resolved.)

2. CollectionSheetItem._post_processing_fee() — reached via post_cash_
   collection() / confirm_bank_transfer(), also atomic — hit the same bug.
   A processing-fee item with money collected but is_posted still False is
   the same shape: attempted, failed, silently left unposted (is_posted
   defaults to False regardless of outcome, so this can't be told apart
   from "genuinely not yet processed" by the DB alone — both are listed for
   a human to triage using payment_mode / transfer_confirmation_status).

This command is read-only — it does not reconcile sheets, post items, or
retry anything. Use it to scope how many sheets/items need someone to
retry the now-fixed action, or a manual correcting entry if the underlying
cash has since been accounted for another way.

Usage
-----
    python manage.py audit_collection_sheet_posting_gaps
    python manage.py audit_collection_sheet_posting_gaps --since 2026-01-01
"""
from __future__ import annotations

import datetime

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Sum


class Command(BaseCommand):
    help = (
        "Lists DailyCollectionSheets stuck unreconciled with cash to sweep, "
        "and processing-fee CollectionSheetItems never posted to the GL."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--since', dest='since', default=None,
            help='Only consider collection_date/sheet__collection_date >= this date (YYYY-MM-DD).',
        )

    def handle(self, *args, **options):
        from cash_management.models import DailyCollectionSheet, CollectionSheetItem

        since = None
        if options['since']:
            try:
                since = datetime.date.fromisoformat(options['since'])
            except ValueError:
                raise CommandError('--since must be YYYY-MM-DD')

        # ── 1. Stuck reconciliations ───────────────────────────────────────
        sheets = (
            DailyCollectionSheet.objects
            .filter(status='submitted', total_collected_cash__gt=0)
            .select_related('credit_officer', 'branch')
            .order_by('collection_date')
        )
        if since:
            sheets = sheets.filter(collection_date__gte=since)

        self.stdout.write(self.style.MIGRATE_HEADING(
            '== Sheets stuck in "submitted" with cash to sweep =='
        ))
        if not sheets:
            self.stdout.write(self.style.SUCCESS('  None found.\n'))
        else:
            total_stuck_cash = sheets.aggregate(t=Sum('total_collected_cash'))['t']
            self.stdout.write(self.style.WARNING(
                f'  {sheets.count()} sheet(s), N{total_stuck_cash} total uncollected-to-bank cash:\n'
            ))
            for sheet in sheets:
                self.stdout.write(
                    f'    {sheet.collection_date}  {sheet.credit_officer}  '
                    f'branch={sheet.branch}  N{sheet.total_collected_cash}\n'
                )

        # ── 2. Unposted processing-fee items ────────────────────────────────
        items = (
            CollectionSheetItem.objects
            .filter(collection_type='processing_fee', is_posted=False, amount_collected__gt=0)
            .select_related('sheet', 'client', 'loan_account')
            .order_by('sheet__collection_date')
        )
        if since:
            items = items.filter(sheet__collection_date__gte=since)

        self.stdout.write(self.style.MIGRATE_HEADING(
            '\n== Processing-fee items collected but never posted to GL =='
        ))
        if not items:
            self.stdout.write(self.style.SUCCESS('  None found.\n'))
            return

        total_unposted_fees = items.aggregate(t=Sum('amount_collected'))['t']
        self.stdout.write(self.style.WARNING(
            f'  {items.count()} item(s), N{total_unposted_fees} total unposted fee income:\n'
        ))
        for item in items:
            self.stdout.write(
                f'    {item.sheet.collection_date}  {item.client}  '
                f'loan={item.loan_account.loan_number if item.loan_account else "?"}  '
                f'N{item.amount_collected}  '
                f'mode={item.payment_mode}  status={item.status}  '
                f'transfer={item.transfer_confirmation_status}\n'
            )
