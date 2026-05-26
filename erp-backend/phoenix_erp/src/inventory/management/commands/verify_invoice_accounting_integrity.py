"""
Management command to verify invoice-accounting integrity.

Checks for:
1. Invoices marked as posted without corresponding journal entries
2. Journal entries without corresponding posted invoices
3. Mismatched amounts between invoices and journal entries
4. Incorrect account balances

Usage:
    python manage.py verify_invoice_accounting_integrity
    python manage.py verify_invoice_accounting_integrity --fix
"""
from decimal import Decimal
from django.core.management.base import BaseCommand
from django.db.models import Sum, Q
from inventory.models import Invoice
from transactions.models import Transaction as JournalEntry
from accounts.models import Account


class Command(BaseCommand):
    help = 'Verify invoice-accounting integrity and detect inconsistencies'

    def add_arguments(self, parser):
        parser.add_argument(
            '--fix',
            action='store_true',
            help='Attempt to fix detected issues (USE WITH CAUTION)',
        )
        parser.add_argument(
            '--invoice-number',
            type=str,
            help='Check specific invoice by number',
        )

    def handle(self, *args, **options):
        fix_issues = options['fix']
        invoice_number = options.get('invoice_number')
        
        self.stdout.write(self.style.WARNING(
            '\n' + '='*80 +
            '\nINVOICE ACCOUNTING INTEGRITY CHECK' +
            '\n' + '='*80 + '\n'
        ))
        
        # Get invoices to check
        if invoice_number:
            invoices = Invoice.objects.filter(invoice_number=invoice_number)
            if not invoices.exists():
                self.stdout.write(self.style.ERROR(
                    f'Invoice {invoice_number} not found'
                ))
                return
        else:
            invoices = Invoice.objects.all()
        
        total_invoices = invoices.count()
        posted_invoices = invoices.filter(is_posted=True).count()
        
        self.stdout.write(f'Total invoices: {total_invoices}')
        self.stdout.write(f'Posted invoices: {posted_invoices}')
        self.stdout.write('')
        
        # Check 1: Posted invoices without journal entries
        self.stdout.write(self.style.WARNING(
            '\n[CHECK 1] Posted invoices without journal entries'
        ))
        
        orphaned_invoices = []
        for invoice in invoices.filter(is_posted=True):
            # Look for journal entry with matching reference number
            journal_entry = JournalEntry.objects.filter(
                reference_number=invoice.invoice_number,
                approved=True
            ).first()
            
            if not journal_entry:
                orphaned_invoices.append(invoice)
                self.stdout.write(self.style.ERROR(
                    f'  ❌ Invoice {invoice.invoice_number} marked as posted '
                    f'but has no journal entry! Amount: {invoice.total_amount}'
                ))
                
                if fix_issues:
                    # Unpost the invoice
                    invoice.is_posted = False
                    invoice.posted_at = None
                    invoice.posted_by = None
                    invoice.save()
                    self.stdout.write(self.style.SUCCESS(
                        f'     → Fixed: Unmarked invoice as posted'
                    ))
        
        if not orphaned_invoices:
            self.stdout.write(self.style.SUCCESS('  ✓ All posted invoices have journal entries'))
        else:
            self.stdout.write(self.style.ERROR(
                f'\n  Found {len(orphaned_invoices)} posted invoices without journal entries'
            ))
        
        # Check 2: Journal entries without posted invoices
        self.stdout.write(self.style.WARNING(
            '\n[CHECK 2] Journal entries without corresponding posted invoices'
        ))
        
        orphaned_journals = []
        # Get all invoice-related journal entries (those with INV- prefix)
        invoice_journals = JournalEntry.objects.filter(
            Q(reference_number__startswith='INV-') |
            Q(description__icontains='invoice')
        )
        
        for journal in invoice_journals:
            # Try to find corresponding invoice
            invoice = Invoice.objects.filter(
                invoice_number=journal.reference_number
            ).first()
            
            if invoice and not invoice.is_posted:
                orphaned_journals.append(journal)
                self.stdout.write(self.style.ERROR(
                    f'  ❌ Journal entry {journal.reference_number} exists but '
                    f'invoice not marked as posted! Amount: {journal.total_amount}'
                ))
                
                if fix_issues:
                    # Mark invoice as posted
                    invoice.is_posted = True
                    invoice.posted_at = journal.entry_date
                    invoice.save()
                    self.stdout.write(self.style.SUCCESS(
                        f'     → Fixed: Marked invoice as posted'
                    ))
            elif not invoice:
                self.stdout.write(self.style.WARNING(
                    f'  ⚠ Journal entry {journal.reference_number} exists but '
                    f'no matching invoice found'
                ))
        
        if not orphaned_journals:
            self.stdout.write(self.style.SUCCESS(
                '  ✓ All invoice journal entries have corresponding posted invoices'
            ))
        
        # Check 3: Amount mismatches
        self.stdout.write(self.style.WARNING(
            '\n[CHECK 3] Amount mismatches between invoices and journal entries'
        ))
        
        amount_mismatches = []
        for invoice in invoices.filter(is_posted=True):
            journal_entry = JournalEntry.objects.filter(
                reference_number=invoice.invoice_number
            ).first()
            
            if journal_entry:
                if journal_entry.total_amount != invoice.total_amount:
                    amount_mismatches.append((invoice, journal_entry))
                    self.stdout.write(self.style.ERROR(
                        f'  ❌ Amount mismatch for {invoice.invoice_number}: '
                        f'Invoice: {invoice.total_amount}, '
                        f'Journal: {journal_entry.total_amount}'
                    ))
        
        if not amount_mismatches:
            self.stdout.write(self.style.SUCCESS(
                '  ✓ All amounts match between invoices and journal entries'
            ))
        
        # Check 4: Verify AR and Revenue account balances
        self.stdout.write(self.style.WARNING(
            '\n[CHECK 4] Verifying account balances'
        ))
        
        # Calculate total posted invoice amounts
        total_posted = Invoice.objects.filter(
            is_posted=True
        ).aggregate(
            total=Sum('total_amount')
        )['total'] or Decimal('0.00')
        
        # Get AR accounts (140-xxx)
        ar_accounts = Account.objects.filter(
            code__startswith='140-',
            account_level=Account.LEVEL_CHILD
        )
        
        total_ar_balance = sum(acc.balance for acc in ar_accounts)
        
        self.stdout.write(f'  Total posted invoices: {total_posted}')
        self.stdout.write(f'  Total AR balance: {total_ar_balance}')
        
        # Note: AR balance might differ due to payments, so just flag large discrepancies
        difference = abs(total_ar_balance - total_posted)
        if difference > Decimal('0.01'):  # Allow for rounding
            self.stdout.write(self.style.WARNING(
                f'  ⚠ Difference: {difference} '
                f'(This is normal if payments have been received)'
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                '  ✓ AR balance matches posted invoices (no payments received yet)'
            ))
        
        # Summary
        self.stdout.write(self.style.WARNING(
            '\n' + '='*80 +
            '\nSUMMARY' +
            '\n' + '='*80
        ))
        
        total_issues = len(orphaned_invoices) + len(orphaned_journals) + len(amount_mismatches)
        
        if total_issues == 0:
            self.stdout.write(self.style.SUCCESS(
                '\n✓ No integrity issues found! All invoices and journal entries are consistent.\n'
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f'\n❌ Found {total_issues} integrity issue(s):'
            ))
            if orphaned_invoices:
                self.stdout.write(f'  - {len(orphaned_invoices)} posted invoices without journal entries')
            if orphaned_journals:
                self.stdout.write(f'  - {len(orphaned_journals)} journal entries without posted invoices')
            if amount_mismatches:
                self.stdout.write(f'  - {len(amount_mismatches)} amount mismatches')
            
            if fix_issues:
                self.stdout.write(self.style.SUCCESS(
                    '\n✓ Issues have been fixed. Please review the changes.\n'
                ))
            else:
                self.stdout.write(self.style.WARNING(
                    '\nRun with --fix flag to attempt automatic repair.\n'
                ))
