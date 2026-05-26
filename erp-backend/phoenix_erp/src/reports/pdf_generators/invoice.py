"""
Student Invoice PDF Generator
Generates professional invoice documents for student fees with discount visibility
"""
from .base import BasePDFGenerator
from datetime import datetime
from decimal import Decimal


class InvoicePDFGenerator(BasePDFGenerator):
    """
    Generate PDF for Student Fee Invoices
    Shows base amount, discounts/scholarships, and final amount
    """
    
    template_name = 'pdf/student_invoice.html'
    
    def get_context_data(self):
        """Build invoice-specific context with discount visibility"""
        context = super().get_context_data()
        
        invoice = self.instance
        metadata = invoice.metadata or {}
        
        # Get discount programs from metadata
        discount_programs = metadata.get('discount_programs', [])
        # Use total_amount (new field) or fall back to legacy amount field
        effective_total = invoice.total_amount if invoice.total_amount else (invoice.amount or Decimal('0'))
        discount_amount = (
            invoice.discount_amount
            if hasattr(invoice, 'discount_amount') and invoice.discount_amount
            else Decimal(str(metadata.get('discount_amount', 0)))
        )

        # ── Line items ────────────────────────────────────────────────────────
        # Prefer the normalised InvoiceItem rows (unified invoice system).
        # Fall back to the legacy single-fee representation for old invoices.
        line_items_qs = invoice.items.select_related(
            'service_item', 'inventory_item'
        ).all() if hasattr(invoice, 'items') else []
        line_items = list(line_items_qs)

        if line_items:
            # Compute subtotal directly from items so it's accurate
            subtotal = sum(item.line_total for item in line_items)
            base_amount = subtotal
        else:
            # Legacy fallback: single row from fee_structure / metadata
            base_amount = Decimal(str(metadata.get('base_amount', effective_total)))
            subtotal = base_amount
        
        # Student Information
        student = invoice.client
        
        # Resolve student class: prefer metadata, then direct model fields
        student_class = (
            metadata.get('classification_name', '')
            or getattr(student, 'class_name', '')
            or (student.classification.name if getattr(student, 'classification', None) else '')
        )
        
        # Resolve guardian info from actual model fields (not metadata)
        parent_name = getattr(student, 'primary_guardian_name', '') or ''
        parent_phone = getattr(student, 'primary_guardian_phone', '') or ''
        parent_email = getattr(student, 'primary_guardian_email', '') or ''
        
        # Resolve fee category via fee_structure relationship
        fee_category = ''
        if invoice.fee_structure and getattr(invoice.fee_structure, 'category', None):
            fee_category = invoice.fee_structure.category.name
        
        context.update({
            'document_type': 'FEE INVOICE',
            'document_title': 'Student Fee Invoice',
            
            # Invoice Details
            'invoice': invoice,
            'invoice_number': invoice.invoice_number,
            'invoice_date': invoice.invoice_date,
            'due_date': invoice.due_date,
            'status': invoice.get_status_display() if hasattr(invoice, 'get_status_display') else invoice.status,
            
            # Student Information
            'student': student,
            'student_id': student.client_id,
            'student_name': student.full_name,
            'student_class': student_class,
            'student_address': getattr(student, 'address_street', '') or '',
            'student_phone': getattr(student, 'phone_primary', '') or '',
            'parent_name': parent_name,
            'parent_phone': parent_phone,
            'parent_email': parent_email,
            
            # Academic Info
            'academic_year': metadata.get('term_code', '').split('-')[0] if metadata.get('term_code') else '',
            'term': metadata.get('term_code', ''),
            'term_name': invoice.description,
            
            # Fee Structure (kept for reference / legacy fallback)
            'fee_structure': invoice.fee_structure,
            'fee_name': invoice.fee_structure.name if invoice.fee_structure else 'School Fees',
            'fee_category': fee_category or 'Tuition',

            # Line Items (unified invoice system)
            'line_items': line_items,
            'has_line_items': bool(line_items),

            # Amount Breakdown
            'subtotal': subtotal,
            'base_amount': base_amount,
            'discount_amount': discount_amount,
            'final_amount': effective_total,
            'amount_paid': invoice.amount_paid,
            'balance': invoice.balance,
            
            # Discount/Scholarship Details
            'has_discount': discount_amount > 0,
            'discount_programs': discount_programs,
            'discount_count': len(discount_programs),
            
            # Payment Status
            'is_paid': invoice.status == 'paid',
            'is_overdue': invoice.due_date < datetime.now().date() if invoice.due_date else False,
            'days_overdue': (datetime.now().date() - invoice.due_date).days if invoice.due_date and invoice.due_date < datetime.now().date() else 0,
            
            # Payment Instructions
            'payment_instructions': self._get_payment_instructions(),

            # Footer
            'notes': metadata.get('batch_notes', ''),
            'approved_by': metadata.get('approved_by'),
            'approved_at': metadata.get('approved_at'),
            
            # Batch Info (if applicable)
            'batch_id': metadata.get('batch_id'),
            'is_batch_invoice': bool(metadata.get('batch_id')),
        })
        
        return context
    
    def _get_payment_instructions(self):
        """Get payment instructions from tenant settings"""
        if self.tenant and hasattr(self.tenant, 'settings'):
            settings = self.tenant.settings
            if isinstance(settings, dict):
                return settings.get('payment_instructions', 'Please pay within the due date to avoid late fees.')
        return 'Please pay within the due date to avoid late fees.'
