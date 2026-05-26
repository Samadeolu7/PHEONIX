# inventory/services/pdf_service.py
"""
PDF generation service for invoices and other documents
"""
from io import BytesIO
from decimal import Decimal
from django.conf import settings
from django.utils import timezone
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER


class InvoicePDFService:
    """
    Generate professional PDF invoices
    """
    
    def __init__(self, invoice):
        self.invoice = invoice
        self.buffer = BytesIO()
        self.width, self.height = A4
        self.styles = getSampleStyleSheet()
        self._setup_custom_styles()
    
    def _setup_custom_styles(self):
        """Define custom paragraph styles"""
        self.styles.add(ParagraphStyle(
            name='CompanyName',
            fontSize=20,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=6,
            fontName='Helvetica-Bold'
        ))
        
        self.styles.add(ParagraphStyle(
            name='InvoiceTitle',
            fontSize=24,
            textColor=colors.HexColor('#2563eb'),
            spaceAfter=12,
            fontName='Helvetica-Bold',
            alignment=TA_RIGHT
        ))
        
        self.styles.add(ParagraphStyle(
            name='SectionHeader',
            fontSize=12,
            textColor=colors.HexColor('#374151'),
            fontName='Helvetica-Bold',
            spaceAfter=6
        ))
        
        self.styles.add(ParagraphStyle(
            name='NormalText',
            fontSize=10,
            textColor=colors.HexColor('#4b5563'),
            spaceAfter=4
        ))
        
        self.styles.add(ParagraphStyle(
            name='SmallText',
            fontSize=8,
            textColor=colors.HexColor('#6b7280'),
            spaceAfter=4
        ))
    
    def _format_currency(self, amount):
        """Format currency with proper formatting"""
        if amount is None:
            amount = Decimal('0')
        return f"₦{amount:,.2f}"  # Nigerian Naira symbol
    
    def _get_company_info(self):
        """Get company information from settings or branch"""
        branch = self.invoice.branch
        if branch:
            return {
                'name': getattr(settings, 'COMPANY_NAME', branch.name),
                'address': getattr(branch, 'address', ''),
                'phone': getattr(branch, 'phone', ''),
                'email': getattr(branch, 'email', ''),
                'tax_id': getattr(branch, 'tax_id', ''),
                'logo_path': getattr(settings, 'COMPANY_LOGO_PATH', None),
            }
        return {
            'name': getattr(settings, 'COMPANY_NAME', 'Phoenix ERP'),
            'address': getattr(settings, 'COMPANY_ADDRESS', ''),
            'phone': getattr(settings, 'COMPANY_PHONE', ''),
            'email': getattr(settings, 'COMPANY_EMAIL', ''),
            'tax_id': getattr(settings, 'COMPANY_TAX_ID', ''),
            'logo_path': getattr(settings, 'COMPANY_LOGO_PATH', None),
        }
    
    def generate(self):
        """Generate the PDF invoice"""
        doc = SimpleDocTemplate(
            self.buffer,
            pagesize=A4,
            rightMargin=0.5*inch,
            leftMargin=0.5*inch,
            topMargin=0.5*inch,
            bottomMargin=0.5*inch,
        )
        
        story = []
        
        # Header section
        story.extend(self._create_header())
        story.append(Spacer(1, 0.3*inch))
        
        # Invoice details
        story.extend(self._create_invoice_details())
        story.append(Spacer(1, 0.2*inch))
        
        # Client information
        story.extend(self._create_client_section())
        story.append(Spacer(1, 0.3*inch))
        
        # Line items table
        story.extend(self._create_items_table())
        story.append(Spacer(1, 0.2*inch))
        
        # Totals section
        story.extend(self._create_totals_section())
        story.append(Spacer(1, 0.3*inch))
        
        # Payment information
        story.extend(self._create_payment_info())
        story.append(Spacer(1, 0.2*inch))
        
        # Notes and footer
        story.extend(self._create_footer())
        
        # Build PDF
        doc.build(story)
        
        # Get PDF value
        pdf = self.buffer.getvalue()
        self.buffer.close()
        return pdf
    
    def _create_header(self):
        """Create invoice header with company info and logo"""
        company_info = self._get_company_info()
        elements = []
        
        # Create header table (logo + company info on left, invoice title on right)
        header_data = []
        
        # Company info
        company_text = f"""
        <font size="16"><b>{company_info['name']}</b></font><br/>
        <font size="9">{company_info['address']}</font><br/>
        <font size="9">Phone: {company_info['phone']}</font><br/>
        <font size="9">Email: {company_info['email']}</font><br/>
        <font size="9">Tax ID: {company_info['tax_id']}</font>
        """
        
        invoice_text = f"""
        <font size="20" color="#2563eb"><b>INVOICE</b></font><br/>
        <font size="10">#{self.invoice.invoice_number}</font>
        """
        
        header_data.append([
            Paragraph(company_text, self.styles['NormalText']),
            Paragraph(invoice_text, self.styles['NormalText'])
        ])
        
        header_table = Table(header_data, colWidths=[3.5*inch, 3.5*inch])
        header_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        
        elements.append(header_table)
        
        # Horizontal line
        line_data = [['', '']]
        line_table = Table(line_data, colWidths=[7*inch])
        line_table.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, 0), 2, colors.HexColor('#2563eb')),
        ]))
        elements.append(line_table)
        
        return elements
    
    def _create_invoice_details(self):
        """Create invoice date and due date section"""
        elements = []
        
        details_data = [
            ['Invoice Date:', self.invoice.invoice_date.strftime('%B %d, %Y')],
            ['Due Date:', self.invoice.due_date.strftime('%B %d, %Y')],
            ['Status:', self.invoice.get_status_display()],
        ]
        
        details_table = Table(details_data, colWidths=[1.5*inch, 2*inch])
        details_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#374151')),
            ('TEXTCOLOR', (1, 0), (1, -1), colors.HexColor('#4b5563')),
        ]))
        
        elements.append(details_table)
        return elements
    
    def _create_client_section(self):
        """Create bill to section"""
        elements = []
        
        client = self.invoice.client
        
        # Bill to header
        elements.append(Paragraph('<b>BILL TO:</b>', self.styles['SectionHeader']))
        
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
        """Create line items table"""
        elements = []
        
        # Table header
        table_data = [[
            'Item',
            'Description',
            'Qty',
            'Unit Price',
            'Discount',
            'Total'
        ]]
        
        # Get invoice items
        items = self.invoice.items.all()
        
        for item in items:
            # Get item name - use inventory item name if available, otherwise use description
            item_name = item.item.name if (hasattr(item, 'item') and item.item) else item.description[:30]
            
            table_data.append([
                item_name,
                item.description[:50] if len(item.description) > 50 else item.description,
                f"{item.quantity:.2f}",
                self._format_currency(item.unit_price),
                self._format_currency(item.discount),
                self._format_currency(item.total_price),
            ])
        
        # Create table
        items_table = Table(table_data, colWidths=[
            1.5*inch,  # Item
            2*inch,    # Description
            0.6*inch,  # Qty
            1*inch,    # Unit Price
            0.8*inch,  # Discount
            1.1*inch,  # Total
        ])
        
        items_table.setStyle(TableStyle([
            # Header style
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#2563eb')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            
            # Body style
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('ALIGN', (2, 1), (2, -1), 'CENTER'),  # Qty
            ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),  # Prices
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f9fafb')]),
        ]))
        
        elements.append(items_table)
        return elements
    
    def _create_totals_section(self):
        """Create totals section"""
        elements = []
        
        # Totals data (right-aligned)
        totals_data = [
            ['Subtotal:', self._format_currency(self.invoice.subtotal)],
            ['Discount:', f"- {self._format_currency(self.invoice.discount)}"],
            ['Tax:', self._format_currency(self.invoice.tax_amount)],
            ['', ''],  # Spacer row
            ['<b>Total Amount:</b>', f"<b>{self._format_currency(self.invoice.total_amount)}</b>"],
        ]
        
        if self.invoice.amount_paid > 0:
            totals_data.append(['Amount Paid:', f"- {self._format_currency(self.invoice.amount_paid)}"])
            balance_due = self.invoice.total_amount - self.invoice.amount_paid
            totals_data.append([
                '<b>Balance Due:</b>',
                f"<b>{self._format_currency(balance_due)}</b>"
            ])
        
        # Create table (aligned to right side)
        totals_table = Table(totals_data, colWidths=[1.5*inch, 1.5*inch])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
            ('ALIGN', (1, 0), (1, -1), 'RIGHT'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
            ('LINEABOVE', (0, 4), (-1, 4), 2, colors.HexColor('#2563eb')),
            ('TOPPADDING', (0, 4), (-1, 4), 10),
            ('BOTTOMPADDING', (0, 4), (-1, 4), 10),
        ]))
        
        # Wrap in outer table to align right
        outer_table = Table([[totals_table]], colWidths=[7*inch])
        outer_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'RIGHT'),
        ]))
        
        elements.append(outer_table)
        return elements
    
    def _create_payment_info(self):
        """Create payment information section"""
        elements = []
        
        elements.append(Paragraph('<b>PAYMENT INFORMATION</b>', self.styles['SectionHeader']))
        
        payment_text = """
        Please make payment to:<br/>
        <b>Bank Name:</b> [Your Bank Name]<br/>
        <b>Account Name:</b> [Your Company Name]<br/>
        <b>Account Number:</b> [Your Account Number]<br/>
        <b>Reference:</b> Please quote invoice number in payment reference
        """
        
        elements.append(Paragraph(payment_text, self.styles['SmallText']))
        
        return elements
    
    def _create_footer(self):
        """Create invoice footer with notes and terms"""
        elements = []
        
        if self.invoice.notes:
            elements.append(Paragraph('<b>NOTES:</b>', self.styles['SectionHeader']))
            elements.append(Paragraph(self.invoice.notes, self.styles['SmallText']))
            elements.append(Spacer(1, 0.2*inch))
        
        # Terms and conditions
        terms_text = """
        <b>TERMS & CONDITIONS:</b><br/>
        1. Payment is due within the specified due date.<br/>
        2. Late payments may incur additional charges.<br/>
        3. Please inspect goods upon delivery and report any issues immediately.<br/>
        4. This invoice is computer-generated and does not require a signature.
        """
        
        elements.append(Paragraph(terms_text, self.styles['SmallText']))
        
        # Thank you message
        elements.append(Spacer(1, 0.3*inch))
        thank_you = '<para align="center"><b>Thank you for your business!</b></para>'
        elements.append(Paragraph(thank_you, self.styles['NormalText']))
        
        return elements
