"""
Deposit Slip / Cash Collection Receipt PDF Generator
Generates professional deposit slip documents for cash collections
"""
from .base import BasePDFGenerator


class DepositSlipPDFGenerator(BasePDFGenerator):
    """
    Generate PDF deposit slip for a CashCollection record.
    """

    template_name = 'pdf/deposit_slip.html'

    def get_context_data(self):
        """Build deposit slip context"""
        context = super().get_context_data()

        collection = self.instance

        # Basic receipt info
        context.update({
            'document_type': 'DEPOSIT SLIP',
            'document_title': 'Cash Collection Receipt',

            # Collection details
            'collection': collection,
            'receipt_number': collection.receipt_number,
            'collection_date': collection.collection_date,
            'collection_mode': collection.get_collection_mode_display()
            if hasattr(collection, 'get_collection_mode_display')
            else collection.collection_mode,
            'payment_purpose': collection.payment_purpose or '',
            'reference_number': collection.reference_number or '',

            # Amounts
            'amount_due': collection.amount_due,
            'amount_collected': collection.amount_collected,
            'variance': collection.variance,
            'variance_action': collection.get_variance_action_display()
            if hasattr(collection, 'get_variance_action_display')
            and collection.variance_action != 'none'
            else '',

            # Client info
            'client_name': str(collection.client) if collection.client else 'Walk-in',
            'client_id': collection.client.id if collection.client else '',

            # Receivable reference
            'receivable_reference': (
                collection.receivable.invoice_number
                if hasattr(collection, 'receivable')
                and collection.receivable
                and hasattr(collection.receivable, 'invoice_number')
                else ''
            ),

            # Cashier info
            'cashier_name': (
                collection.cashier_account.name
                if collection.cashier_account
                else 'N/A'
            ),

            # Posting status
            'is_posted': collection.is_posted,
            'posted_at': collection.posted_at,
            'posted_by_name': (
                collection.posted_by.get_full_name()
                if collection.posted_by
                else ''
            ),
            'journal_entry_ref': (
                collection.journal_entry.reference_number
                if collection.journal_entry
                else ''
            ),

            # Notes
            'notes': collection.notes or '',
        })

        return context

    def get_filename(self):
        """Generate filename for deposit slip PDF"""
        collection = self.instance
        date_str = collection.collection_date.strftime('%Y%m%d')
        return f"DepositSlip_{collection.receipt_number}_{date_str}.pdf"
