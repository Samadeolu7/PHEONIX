# incomes/services/pdf_batch_service.py
"""
PDF Batch Generation Service for Invoices
Generates PDFs in bulk and creates ZIP archives
"""
import os
import zipfile
from io import BytesIO
from typing import List, Dict
from django.conf import settings
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import logging

from incomes.models import Invoice

logger = logging.getLogger(__name__)


class InvoicePDFBatchService:
    """Generate and package invoices in bulk"""
    
    def generate_class_invoice_pdfs(
        self, 
        class_code: str, 
        invoice_ids: List[int]
    ) -> List[Dict]:
        """
        Generate PDFs for all invoices in a class
        
        Returns list of:
        [
            {
                'invoice_id': int,
                'invoice_number': str,
                'student_name': str,
                'pdf_path': str,
                'file_size': int
            }
        ]
        """
        invoices = Invoice.objects.filter(id__in=invoice_ids).select_related('client')
        
        results = []
        for invoice in invoices:
            try:
                # Generate PDF using existing inventory service or create new one
                pdf_bytes = self._generate_invoice_pdf(invoice)
                
                # Save to storage
                filename = f"{invoice.invoice_number}.pdf"
                metadata = invoice.metadata or {}
                year = metadata.get('academic_year', 'unknown')
                term = metadata.get('term', 'unknown')
                
                file_path = f"invoices/{year}/{term}/{class_code}/{filename}"
                
                # Save using Django's storage backend
                saved_path = default_storage.save(file_path, ContentFile(pdf_bytes))
                
                # Update invoice with PDF path
                invoice.metadata['pdf_path'] = saved_path
                invoice.save(update_fields=['metadata', 'modified_at'])
                
                results.append({
                    'invoice_id': invoice.id,
                    'invoice_number': invoice.invoice_number,
                    'student_name': invoice.client.full_name,
                    'pdf_path': saved_path,
                    'file_size': len(pdf_bytes)
                })
                
                logger.info(f"Generated PDF for invoice {invoice.invoice_number}")
                
            except Exception as e:
                logger.error(f"Failed to generate PDF for invoice {invoice.invoice_number}: {e}")
                results.append({
                    'invoice_id': invoice.id,
                    'invoice_number': invoice.invoice_number,
                    'student_name': invoice.client.full_name if invoice.client else 'Unknown',
                    'error': str(e)
                })
        
        return results
    
    def _generate_invoice_pdf(self, invoice: Invoice) -> bytes:
        """
        Generate PDF for a single invoice using the student_invoice.html template (WeasyPrint).
        Falls back to a simple ReportLab PDF if WeasyPrint is unavailable.
        """
        try:
            from reports.pdf_generators.invoice import InvoicePDFGenerator
            pdf_generator = InvoicePDFGenerator(invoice, invoice.owner)
            pdf_bytesio = pdf_generator.generate_pdf()
            return pdf_bytesio.getvalue()
        except Exception as e:
            logger.warning(
                f"InvoicePDFGenerator (HTML template) failed for invoice "
                f"{getattr(invoice, 'invoice_number', invoice.id)}: {e}. "
                f"Falling back to simple PDF."
            )
            return self._generate_simple_pdf(invoice)
    
    def _generate_simple_pdf(self, invoice: Invoice) -> bytes:
        """Generate a simple PDF using ReportLab as fallback"""
        from io import BytesIO
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import inch
        from reportlab.lib import colors
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4)
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        elements.append(Paragraph(f"<b>INVOICE</b>", styles['Title']))
        elements.append(Spacer(1, 0.3*inch))
        
        # Invoice Details
        data = [
            ['Invoice Number:', invoice.invoice_number],
            ['Date:', str(invoice.invoice_date)],
            ['Due Date:', str(invoice.due_date)],
            ['Student:', invoice.client.full_name if invoice.client else ''],
            ['Class:', invoice.metadata.get('class_name', '')],
        ]
        
        t = Table(data, colWidths=[2*inch, 4*inch])
        t.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 0.5*inch))
        
        # Fee Breakdown
        elements.append(Paragraph('<b>Fee Breakdown</b>', styles['Heading2']))
        elements.append(Spacer(1, 0.2*inch))
        
        fee_data = [['Description', 'Amount']]
        metadata = invoice.metadata or {}
        
        for item in metadata.get('fee_breakdown', []):
            fee_data.append([
                item['description'],
                f"₦{item['base_amount']:,.2f}"
            ])
        
        # Add discounts
        for disc in metadata.get('discount_breakdown', []):
            fee_data.append([
                f"Discount: {disc['program_name']}",
                f"-₦{disc['discount_amount']:,.2f}"
            ])
        
        # Add total
        fee_data.append(['', ''])
        fee_data.append(['<b>Total Amount Due</b>', f"<b>₦{invoice.amount:,.2f}</b>"])
        
        t2 = Table(fee_data, colWidths=[4*inch, 2*inch])
        t2.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (1, 1), (-1, -1), 'RIGHT'),
            ('GRID', (0, 0), (-1, -2), 0.5, colors.grey),
            ('LINEABOVE', (0, -1), (-1, -1), 2, colors.black),
        ]))
        elements.append(t2)
        
        # Build PDF
        doc.build(elements)
        return buffer.getvalue()
    
    def create_invoice_zip(
        self, 
        class_code: str, 
        pdf_files: List[Dict], 
        output_path: str
    ) -> str:
        """
        Create ZIP archive of all PDFs for a class
        
        Args:
            class_code: Class identifier (e.g., "P1A")
            pdf_files: List of PDF file info from generate_class_invoice_pdfs()
            output_path: Where to save the ZIP file (relative to MEDIA_ROOT)
        
        Returns:
            Path to created ZIP file
        """
        # Create ZIP in memory
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for pdf_info in pdf_files:
                if 'error' in pdf_info:
                    continue  # Skip failed PDFs
                
                try:
                    # Read PDF from storage
                    pdf_path = pdf_info['pdf_path']
                    with default_storage.open(pdf_path, 'rb') as pdf_file_obj:
                        pdf_content = pdf_file_obj.read()
                    
                    # Sanitize filename for ZIP
                    student_name = self._sanitize_filename(pdf_info['student_name'])
                    zip_filename = f"{student_name}_{pdf_info['invoice_number']}.pdf"
                    
                    # Add to ZIP
                    zip_file.writestr(zip_filename, pdf_content)
                    logger.info(f"Added {zip_filename} to ZIP")
                    
                except Exception as e:
                    logger.error(f"Failed to add {pdf_info.get('invoice_number')} to ZIP: {e}")
        
        # Save ZIP to storage
        zip_buffer.seek(0)
        saved_zip_path = default_storage.save(output_path, ContentFile(zip_buffer.read()))
        
        logger.info(f"Created ZIP archive at {saved_zip_path}")
        return saved_zip_path
    
    def _sanitize_filename(self, filename: str) -> str:
        """Sanitize filename for safe use in filesystem"""
        # Remove or replace problematic characters
        import re
        # Replace spaces with underscores
        filename = filename.replace(' ', '_')
        # Remove any non-alphanumeric characters except underscore and hyphen
        filename = re.sub(r'[^a-zA-Z0-9_-]', '', filename)
        return filename
    
    def get_invoice_pdf_url(self, invoice: Invoice) -> str:
        """Get public download URL for invoice PDF"""
        metadata = invoice.metadata or {}
        pdf_path = metadata.get('pdf_path')
        if pdf_path and default_storage.exists(pdf_path):
            return default_storage.url(pdf_path)
        return ''
    
    def get_class_zip_url(self, class_code: str, academic_year: str, term: str) -> str:
        """Get URL for class ZIP archive"""
        zip_path = f"invoices/{academic_year}/{term}/{class_code}.zip"
        if default_storage.exists(zip_path):
            return default_storage.url(zip_path)
        return ''
    
    def generate_single_pdf(self, invoice_id: int) -> bytes:
        """Generate PDF for a single invoice on-demand"""
        try:
            invoice = Invoice.objects.select_related('client').get(id=invoice_id)
            return self._generate_invoice_pdf(invoice)
        except Invoice.DoesNotExist:
            raise ValueError(f"Invoice {invoice_id} not found")
    
    def generate_batch_zip(self, invoices, batch_id: str) -> bytes:
        """
        Generate ZIP archive for a batch of invoices
        
        Args:
            invoices: QuerySet or list of Invoice objects
            batch_id: Batch identifier for filename
            
        Returns:
            ZIP file as bytes (in-memory, not saved to storage)
        """
        from reports.pdf_generators.invoice import InvoicePDFGenerator
        
        zip_buffer = BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for invoice in invoices:
                try:
                    # Generate PDF using our new generator
                    pdf_generator = InvoicePDFGenerator(invoice, invoice.owner)
                    pdf_bytesio = pdf_generator.generate_pdf()
                    
                    # Read bytes from BytesIO
                    pdf_bytes = pdf_bytesio.getvalue()
                    
                    # Create filename
                    student_name = self._sanitize_filename(invoice.client.full_name)
                    filename = f"{student_name}_{invoice.invoice_number}.pdf"
                    
                    # Add to ZIP
                    zip_file.writestr(filename, pdf_bytes)
                    logger.info(f"Added {filename} to batch ZIP")
                    
                except Exception as e:
                    logger.error(f"Failed to generate PDF for invoice {invoice.reference_number}: {e}")
                    # Continue with other invoices
        
        zip_buffer.seek(0)
        return zip_buffer.read()
