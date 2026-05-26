"""
Purchase Order PDF Generator
Generates professional PO documents with company branding
"""
from .base import BasePDFGenerator
from datetime import datetime


class PurchaseOrderPDFGenerator(BasePDFGenerator):
    """
    Generate PDF for Purchase Orders
    Maps tenant to company, supplier to vendor
    """
    
    template_name = 'pdf/purchase_order.html'
    
    def get_context_data(self):
        """Build PO-specific context"""
        context = super().get_context_data()
        
        po = self.instance
        
        # Company Info (from tenant)
        context.update({
            'document_type': 'PURCHASE ORDER',
            'document_title': 'Purchase Order',
            
            # PO Details
            'po': po,
            'po_number': po.po_number,
            'po_date': po.order_date,
            'expected_delivery_date': po.expected_delivery_date,
            
            # Vendor (Supplier) Information
            'vendor': po.supplier,
            'vendor_name': po.supplier.name,
            'vendor_contact': po.supplier.contact_person,
            'vendor_address': po.supplier.address,
            'vendor_phone': po.supplier.phone,
            'vendor_email': po.supplier.email,
            
            # Ship To Information
            'ship_to_name': context.get('company_name'),
            'ship_to_location': po.delivery_location.name if po.delivery_location else '',
            'ship_to_address': self._get_ship_to_address(po),
            'ship_to_phone': context.get('company_phone', ''),
            
            # Requisitioner Information
            'requisitioner': po.requisition.requested_by.get_full_name() if po.requisition else '',
            'department': po.requisition.department if po.requisition else '',
            
            # Terms
            'payment_terms': po.get_payment_terms_display(),
            'shipping_terms': self._get_shipping_terms(po),
            'fob': self._get_fob(po),
            
            # Items
            'items': po.items.all().select_related('item'),
            
            # Totals
            'subtotal': po.subtotal,
            'tax_amount': po.tax_amount,
            'shipping_cost': po.shipping_cost,
            'discount': po.discount,
            'total_amount': po.total_amount,
            
            # Additional Info
            'notes': po.notes,
            'internal_notes': po.internal_notes,
            
            # Footer
            'contact_name': po.contact_person or self.user.get_full_name(),
            'contact_phone': po.contact_phone or context.get('company_phone', ''),
            'contact_email': po.contact_email or context.get('company_email', ''),
            
            # Status
            'status': po.get_status_display(),
            'approved_by': po.approved_by.get_full_name() if po.approved_by else None,
            'approved_at': po.approved_at,
        })
        
        return context
    
    def _get_ship_to_address(self, po):
        """Get shipping address from delivery location or branch"""
        if po.delivery_location and hasattr(po.delivery_location, 'address'):
            return po.delivery_location.address
        if self.branch and hasattr(self.branch, 'address'):
            return self.branch.address
        return self._get_company_address()
    
    def _get_shipping_terms(self, po):
        """Get shipping terms from PO or supplier"""
        if hasattr(po, 'shipping_terms') and po.shipping_terms:
            return po.shipping_terms
        if po.selected_quote and po.selected_quote.delivery_terms:
            return po.selected_quote.delivery_terms
        return 'Standard Delivery'
    
    def _get_fob(self, po):
        """Get FOB (Free On Board) point"""
        # Can be configured in PO or supplier settings
        if hasattr(po, 'fob_point') and po.fob_point:
            return po.fob_point
        return 'Destination'
    
    def get_filename(self):
        """Generate filename for PO PDF"""
        po = self.instance
        date_str = po.order_date.strftime('%Y%m%d')
        return f"PO_{po.po_number}_{date_str}.pdf"
