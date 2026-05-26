"""
Credit Note PDF Generation Service

Generates professional PDF credit notes using ReportLab.
Adapted from invoice PDF service with credit note specific branding.
"""

from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from reportlab.lib.colors import HexColor
from decimal import Decimal


class CreditNotePDFService:
    """Generate professional credit note PDFs"""
    
    def __init__(self, credit_note):
        """
        Initialize PDF service
        
        Args:
            credit_note: CreditNote instance
        """
        self.credit_note = credit_note
        self.buffer = BytesIO()
        self.width, self.height = A4
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Setup custom paragraph styles"""
        # Credit note header (red for credit)
        self.styles.add(ParagraphStyle(
            name='CreditNoteHeader',
            parent=self.styles['Heading1'],
            fontSize=24,
            textColor=HexColor('#dc2626'),  # Red for credit
            spaceAfter=30,
            alignment=1,  # Center
            fontName='Helvetica-Bold'
        ))
        
        # Section headers
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            parent=self.styles['Heading2'],
            fontSize=12,
            textColor=HexColor('#4b5563'),
            spaceAfter=12,
            fontName='Helvetica-Bold'
        ))
        
        # Normal text
        self.styles.add(ParagraphStyle(
            name='NormalText',
            parent=self.styles['Normal'],
            fontSize=10,
            textColor=HexColor('#1f2937'),
            spaceAfter=6
        ))
        
        # Company info
        self.styles.add(ParagraphStyle(
            name='CompanyInfo',
            parent=self.styles['Normal'],
            fontSize=9,
            textColor=HexColor('#6b7280'),
            alignment=1  # Center
        ))
    
    def generate(self):
        """
        Generate the credit note PDF
        
        Returns:
            bytes: PDF content
        """
        # Create document
        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=A4,
            rightMargin=0.75*inch,
            leftMargin=0.75*inch,
            topMargin=0.75*inch,
            bottomMargin=0.75*inch
        )
        
        # Build content
        story = []
        
        # Company header
        story.extend(self._create_header())
        story.append(Spacer(1, 0.3*inch))
        
        # Credit note title and details
        story.append(Paragraph('CREDIT NOTE', self.styles['CreditNoteHeader']))
        story.append(Spacer(1, 0.2*inch))
        
        # Credit note details
        story.extend(self._create_credit_note_details())
        story.append(Spacer(1, 0.3*inch))
        
        # Client section
        story.extend(self._create_client_section())
        story.append(Spacer(1, 0.3*inch))
        
        # Items table
        story.extend(self._create_items_table())
        story.append(Spacer(1, 0.3*inch))
        
        # Totals section
        story.extend(self._create_totals_section())
        story.append(Spacer(1, 0.3*inch))
        
        # Reason and notes
        story.extend(self._create_reason_section())
        
        # Footer
        story.extend(self._create_footer())
        
        # Build PDF
        doc.build(story)
        
        # Get PDF content
        pdf_content = self.buffer.getvalue()
        self.buffer.close()
        
        return pdf_content
    
    def _create_header(self):
        """Create company header"""
        elements = []
        
        company_info = self._get_company_info()
        
        # Company name and info
        company_text = f"""
        <b><font size="16">{company_info['name']}</font></b><br/>
        {company_info['address']}<br/>
        Phone: {company_info['phone']} | Email: {company_info['email']}
        """
        
        elements.append(Paragraph(company_text, self.styles['CompanyInfo']))
        
        return elements
    
    def _create_credit_note_details(self):
        """Create credit note details section"""
        elements = []
        
        cn = self.credit_note
        
        # Details table
        details_data = [
            ['Credit Note #:', cn.credit_note_number, 'Date:', cn.issue_date.strftime('%b %d, %Y')],
            ['Original Invoice:', cn.original_invoice.invoice_number, 'Status:', cn.status.upper()],
        ]
        
        details_table = Table(details_data, colWidths=[1.5*inch, 2*inch, 1*inch, 2*inch])
        details_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (-1, -1), HexColor('#1f2937')),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        elements.append(details_table)
        return elements
    
    def _create_client_section(self):
        """Create client/customer section"""
        elements = []
        
        client = self.credit_note.client
        
        # Credit to header
        elements.append(Paragraph('<b>CREDIT TO:</b>', self.styles['SectionHeader']))
        
        # Build client name
        client_name = f"{client.title} {client.first_name} {client.last_name}".strip() if hasattr(client, 'first_name') else getattr(client, 'name', 'N/A')
        
        # Build address
        address_parts = []
        if getattr(client, 'address_street', None):
            address_parts.append(client.address_street)
        if getattr(client, 'address_city', None):
            address_parts.append(client.address_city)
        if getattr(client, 'address_state', None):
            address_parts.append(client.address_state)
        address = ', '.join(address_parts) if address_parts else 'N/A'
        
        phone = getattr(client, 'phone_primary', None) or getattr(client, 'phone', 'N/A')
        email = getattr(client, 'email', 'N/A')
        
        client_text = f"""
        <b>{client_name}</b><br/>
        {address}<br/>
        Phone: {phone}<br/>
        Email: {email}
        """
        
        elements.append(Paragraph(client_text, self.styles['NormalText']))
        
        return elements
    
    def _create_items_table(self):
        """Create returned items table"""
        elements = []
        
        # Table header
        table_data = [[
            'Item',
            'Description',
            'Qty Returned',
            'Unit Price',
            'Discount',
            'Total'
        ]]
        
        # Get credit note items
        items = self.credit_note.items.all()
        
        for item in items:
            # Get item name - use inventory item name if available
            item_name = item.item.name if (hasattr(item, 'item') and item.item) else item.description[:30]
            
            table_data.append([
                item_name,
                item.description[:50] if len(item.description) > 50 else item.description,
                f"{item.quantity_returned:.2f}",
                self._format_currency(item.unit_price),
                self._format_currency(item.discount),
                self._format_currency(item.line_total),
            ])
        
        # Create table
        items_table = Table(table_data, colWidths=[
            1.5*inch,  # Item
            2*inch,    # Description
            0.9*inch,  # Qty
            1*inch,    # Unit Price
            0.8*inch,  # Discount
            1*inch,    # Total
        ])
        
        items_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), HexColor('#dc2626')),  # Red header
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('TOPPADDING', (0, 0), (-1, 0), 12),
            
            # Data rows
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('TEXTCOLOR', (0, 1), (-1, -1), HexColor('#1f2937')),
            ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),  # Right align numbers
            ('ALIGN', (0, 0), (1, -1), 'LEFT'),    # Left align text
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 1), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 1), (-1, -1), 8),
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, HexColor('#e5e7eb')),
            
            # Alternating row colors
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, HexColor('#f9fafb')]),
        ]))
        
        elements.append(items_table)
        
        return elements
    
    def _create_totals_section(self):
        """Create totals section"""
        elements = []
        
        cn = self.credit_note
        
        # Totals table
        totals_data = [
            ['Subtotal:', self._format_currency(cn.subtotal)],
            ['Discount:', f'-{self._format_currency(cn.discount)}'],
            ['Tax:', self._format_currency(cn.tax_amount)],
            ['', ''],  # Separator
            ['TOTAL CREDIT:', self._format_currency(cn.total_amount)],
        ]
        
        totals_table = Table(totals_data, colWidths=[5.5*inch, 1.5*inch])
        totals_table.setStyle(TableStyle([
            # Regular rows
            ('FONTNAME', (0, 0), (0, 2), 'Helvetica'),
            ('FONTNAME', (1, 0), (1, 2), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 2), 10),
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('TEXTCOLOR', (0, 0), (-1, 2), HexColor('#4b5563')),
            
            # Total row
            ('FONTNAME', (0, 4), (-1, 4), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 4), (-1, 4), 12),
            ('TEXTCOLOR', (0, 4), (-1, 4), HexColor('#dc2626')),  # Red for credit
            ('LINEABOVE', (0, 4), (-1, 4), 2, HexColor('#dc2626')),
            ('TOPPADDING', (0, 4), (-1, 4), 12),
        ]))
        
        elements.append(totals_table)
        
        return elements
    
    def _create_reason_section(self):
        """Create reason and notes section"""
        elements = []
        
        cn = self.credit_note
        
        # Reason
        if cn.reason:
            elements.append(Paragraph('<b>REASON FOR CREDIT:</b>', self.styles['SectionHeader']))
            elements.append(Paragraph(cn.reason, self.styles['NormalText']))
            elements.append(Spacer(1, 0.2*inch))
        
        # Additional notes
        if cn.notes:
            elements.append(Paragraph('<b>NOTES:</b>', self.styles['SectionHeader']))
            elements.append(Paragraph(cn.notes, self.styles['NormalText']))
        
        return elements
    
    def _create_footer(self):
        """Create footer with terms"""
        elements = []
        
        elements.append(Spacer(1, 0.5*inch))
        
        footer_text = """
        <font size="8" color="#6b7280">
        This credit note reduces the customer's outstanding balance by the amount shown above.
        Please retain this document for your records.
        </font>
        """
        
        elements.append(Paragraph(footer_text, self.styles['Normal']))
        
        return elements
    
    def _format_currency(self, amount):
        """Format amount as Nigerian Naira"""
        if amount is None:
            amount = Decimal('0.00')
        return f"₦{amount:,.2f}"
    
    def _get_company_info(self):
        """Get company information from settings or branch"""
        from django.conf import settings
        
        branch = self.credit_note.branch
        
        return {
            'name': getattr(settings, 'COMPANY_NAME', None) or branch.name or 'Phoenix ERP',
            'address': getattr(settings, 'COMPANY_ADDRESS', None) or branch.address or 'N/A',
            'phone': getattr(settings, 'COMPANY_PHONE', None) or 'N/A',
            'email': getattr(settings, 'COMPANY_EMAIL', None) or 'N/A',
            'logo': getattr(settings, 'COMPANY_LOGO', None),
        }
