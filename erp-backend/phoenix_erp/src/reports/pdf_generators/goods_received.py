"""
Goods Received Note PDF Generator
Generates GRN documents for receiving documentation
"""
from .base import BasePDFGenerator
from datetime import datetime


class GoodsReceivedNotePDFGenerator(BasePDFGenerator):
    """
    Generate PDF for Goods Received Notes
    """
    
    template_name = 'pdf/goods_received_note.html'
    
    def get_context_data(self):
        """Build GRN-specific context"""
        context = super().get_context_data()
        
        grn = self.instance
        
        # Company Info
        context.update({
            'document_type': 'GOODS RECEIVED NOTE',
            'document_title': 'Goods Received Note',
            
            # GRN Details
            'grn': grn,
            'grn_number': grn.grn_number,
            'received_date': grn.received_date,
            'receipt_date': grn.received_date,
            
            # Purchase Order Reference
            'po': grn.purchase_order,
            'po_number': grn.purchase_order.po_number if grn.purchase_order else 'N/A',
            'po_date': grn.purchase_order.order_date if grn.purchase_order else None,
            
            # Vendor (Supplier) Information
            'vendor': grn.purchase_order.supplier if grn.purchase_order else None,
            'vendor_name': grn.purchase_order.supplier.name if grn.purchase_order else 'N/A',
            'vendor_address': grn.purchase_order.supplier.address if grn.purchase_order else '',
            
            # Received By/At Information
            'received_by': grn.received_by.get_full_name() if grn.received_by else 'N/A',
            'received_location': grn.received_location.name if grn.received_location else '',
            'received_location_address': grn.received_location.address if hasattr(grn.received_location, 'address') else '',
            
            # Items
            'items': grn.items.all().select_related('po_item__item'),
            
            # Totals
            'total_quantity_ordered': sum(
                item.po_item.quantity for item in grn.items.all() 
                if item.po_item
            ) if grn.items.exists() else 0,
            'total_quantity_received': sum(
                item.quantity_received for item in grn.items.all()
            ) if grn.items.exists() else 0,
            'total_quantity_accepted': sum(
                item.quantity_accepted for item in grn.items.all()
            ) if grn.items.exists() else 0,
            'total_quantity_rejected': sum(
                item.quantity_rejected for item in grn.items.all()
            ) if grn.items.exists() else 0,
            
            # Status
            'status': 'Posted' if grn.is_posted else 'Not Posted',
            'quality_status': grn.get_quality_status_display() if hasattr(grn, 'quality_status') else 'N/A',
            'inspection_status': grn.inspection_notes if grn.inspection_notes else 'N/A',
            
            # Notes
            'notes': grn.notes if hasattr(grn, 'notes') else '',
            'inspection_notes': grn.inspection_notes if hasattr(grn, 'inspection_notes') else '',
            
            # Signatures
            'received_by_signature': grn.received_by.get_full_name() if grn.received_by else '',
            'inspected_by': grn.inspected_by.get_full_name() if hasattr(grn, 'inspected_by') and grn.inspected_by else '',
            'approved_by': grn.approved_by.get_full_name() if hasattr(grn, 'approved_by') and grn.approved_by else '',
        })
        
        return context
    
    def get_filename(self):
        """Generate filename for GRN PDF"""
        grn = self.instance
        date_str = grn.received_date.strftime('%Y%m%d')
        return f"GRN_{grn.grn_number}_{date_str}.pdf"
