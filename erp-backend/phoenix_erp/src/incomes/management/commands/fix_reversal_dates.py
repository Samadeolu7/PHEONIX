"""
Management command to preview or fix approved payment reversal dates.

Usage:
  python manage.py fix_reversal_dates [--apply] [--id ID] [--limit N]

By default the command runs in dry-run mode and prints proposed changes.
Use `--apply` to actually update reversal transaction dates and related
EntitlementPaymentLog.payment_date values to match the original payment date.
"""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from incomes.models import (
    PaymentReversalRequest,
    InvoiceItemPayment,
    EntitlementPaymentLog,
)
from transactions.models import Transaction as JournalEntry


class Command(BaseCommand):
    help = 'Preview or apply fixes for approved payment reversals with incorrect reversal dates'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', dest='apply', default=False,
                            help='Apply fixes (default: dry-run)')
        parser.add_argument('--id', type=int, dest='request_id', help='Limit to a specific PaymentReversalRequest id')
        parser.add_argument('--limit', type=int, dest='limit', help='Limit number of processed requests')

    def handle(self, *args, **options):
        apply_changes = options.get('apply', False)
        request_id = options.get('request_id')
        limit = options.get('limit')

        qs = PaymentReversalRequest.objects.filter(
            status=PaymentReversalRequest.STATUS_APPROVED,
        ).select_related('draft_journal_entry', 'invoice', 'approved_by')

        if request_id:
            qs = qs.filter(id=request_id)

        if limit:
            qs = qs[:limit]

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS('No approved reversal requests found matching criteria'))
            return

        applied = 0
        self.stdout.write(f'Found {total} approved reversal request(s) to inspect')

        for rr in qs:
            invoice = rr.invoice

            try:
                original_je = JournalEntry.objects.get(
                    workflow_reference=rr.payment_reference,
                    owner=invoice.owner,
                )
            except JournalEntry.DoesNotExist:
                self.stdout.write(self.style.WARNING(
                    f'ReversalRequest {rr.id}: original journal entry not found for payment_reference="{rr.payment_reference}"'
                ))
                continue

            # Determine the reversal transaction (posted reversal)
            reversal_txn = None
            if rr.draft_journal_entry:
                reversal_txn = rr.draft_journal_entry
            elif getattr(original_je, 'reversal_transaction', None):
                reversal_txn = original_je.reversal_transaction
            else:
                reversal_txn = JournalEntry.objects.filter(reverses_transaction=original_je).first()

            if not reversal_txn:
                self.stdout.write(self.style.WARNING(f'ReversalRequest {rr.id}: no reversal transaction found'))
                continue

            orig_date = original_je.date
            rev_date = reversal_txn.date

            if orig_date == rev_date:
                self.stdout.write(f'ReversalRequest {rr.id}: reversal date already correct ({orig_date})')
                continue

            # Find entitlement payment logs likely created during approval
            item_payments = InvoiceItemPayment.objects.filter(
                invoice=invoice,
                journal_entry_reference=rr.payment_reference,
            ).select_related('invoice_item__entitlement')

            entitlement_ids = [
                ip.invoice_item.entitlement_id
                for ip in item_payments
                if getattr(ip, 'invoice_item', None) and getattr(ip.invoice_item, 'entitlement_id', None)
            ]

            logs_qs = EntitlementPaymentLog.objects.none()
            if entitlement_ids:
                logs_qs = EntitlementPaymentLog.objects.filter(
                    entitlement_id__in=entitlement_ids,
                    amount__lt=0,
                    payment_date=rev_date,
                )
                if rr.approved_by:
                    logs_qs = logs_qs.filter(created_by=rr.approved_by)

            logs = list(logs_qs)

            # Report
            self.stdout.write('\n' + '-' * 60)
            self.stdout.write(f'ReversalRequest {rr.id} — Invoice {invoice.invoice_number}')
            self.stdout.write(f'  Original JE id={original_je.id} date={orig_date}')
            self.stdout.write(f'  Reversal JE id={reversal_txn.id} date={rev_date}')
            self.stdout.write(f'  EntitlementPaymentLog candidates: {len(logs)}')

            if not apply_changes:
                self.stdout.write(self.style.WARNING(
                    f'  Dry-run: would set reversal date -> {orig_date} and update {len(logs)} entitlement log(s)'
                ))
                continue

            # Apply changes atomically for this request
            try:
                with transaction.atomic():
                    reversal_txn.date = orig_date
                    reversal_txn.save(update_fields=['date'])

                    for log in logs:
                        log.payment_date = orig_date
                        log.save(update_fields=['payment_date'])

                applied += 1
                self.stdout.write(self.style.SUCCESS(
                    f'  Applied: set reversal JE {reversal_txn.id} date -> {orig_date}; updated {len(logs)} log(s)'
                ))

            except Exception as e:
                self.stdout.write(self.style.ERROR(
                    f'  ERROR applying fix for ReversalRequest {rr.id}: {e}'
                ))

        self.stdout.write(self.style.SUCCESS(f'Finished. Applied fixes to {applied} reversal(s)'))
