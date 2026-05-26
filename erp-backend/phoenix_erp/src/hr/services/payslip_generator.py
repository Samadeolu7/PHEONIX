# hr/services/payslip_generator.py
"""
Payslip PDF Generation Service

Generates professional PDF payslips
"""

from decimal import Decimal
from django.core.files.base import ContentFile
from django.template.loader import render_to_string
import io


class PayslipGenerator:
    """Service for generating payslip PDFs"""
    
    def __init__(self, payslip):
        """
        Initialize generator with payslip
        
        Args:
            payslip: Payslip instance
        """
        self.payslip = payslip
    
    def generate_pdf(self):
        """
        Generate PDF payslip
        
        Returns:
            str: Path to generated PDF file
        """
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter, A4
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.platypus import (
                SimpleDocTemplate, Table, TableStyle,
                Paragraph, Spacer, Image
            )
        except ImportError:
            # Fallback to simple HTML if reportlab not available
            return self._generate_html()
        
        # Create PDF buffer
        buffer = io.BytesIO()
        
        # Create PDF document
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            rightMargin=30,
            leftMargin=30,
            topMargin=30,
            bottomMargin=18,
        )
        
        # Container for PDF elements
        elements = []
        styles = getSampleStyleSheet()
        
        # Title
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor=colors.HexColor('#1a1a1a'),
            spaceAfter=30,
            alignment=1,  # Center
        )
        elements.append(Paragraph("PAYSLIP", title_style))
        elements.append(Spacer(1, 12))
        
        # Company & Period Info
        info_data = [
            ['Payslip Number:', self.payslip.payslip_number],
            ['Period:', f"{self.payslip.payroll.period_start} to {self.payslip.payroll.period_end}"],
            ['Pay Date:', str(self.payslip.payroll.pay_date)],
        ]
        info_table = Table(info_data, colWidths=[2*inch, 4*inch])
        info_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#666666')),
        ]))
        elements.append(info_table)
        elements.append(Spacer(1, 20))
        
        # Employee Info
        employee_data = [
            ['Employee Name:', f"{self.payslip.staff.first_name} {self.payslip.staff.last_name}"],
            ['Position:', self.payslip.staff.position or 'N/A'],
            ['Department:', self.payslip.staff.department or 'N/A'],
        ]
        employee_table = Table(employee_data, colWidths=[2*inch, 4*inch])
        employee_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TEXTCOLOR', (0, 0), (0, -1), colors.HexColor('#666666')),
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f5f5f5')),
            ('PADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(employee_table)
        elements.append(Spacer(1, 20))
        
        # Earnings Section
        earnings_data = [
            ['EARNINGS', '', 'AMOUNT'],
            ['Basic Salary', '', f"{self.payslip.basic_salary:,.2f}"],
        ]
        
        # Add allowances — values may be plain numbers OR {amount, is_taxable, is_pensionable} dicts
        if self.payslip.allowances:
            for name, value in self.payslip.allowances.items():
                if isinstance(value, dict):
                    amt = float(value.get('amount', 0) or 0)
                else:
                    amt = float(value or 0)
                earnings_data.append([name, '', f"{amt:,.2f}"])
        
        # Add overtime
        if self.payslip.overtime_pay > 0:
            earnings_data.append([
                f"Overtime Pay ({self.payslip.overtime_hours} hrs)",
                '',
                f"{self.payslip.overtime_pay:,.2f}"
            ])
        
        # Add bonuses
        if self.payslip.bonuses > 0:
            earnings_data.append(['Bonuses', '', f"{self.payslip.bonuses:,.2f}"])
        
        # Gross pay
        earnings_data.append(['', 'Gross Pay:', f"{self.payslip.gross_pay:,.2f}"])
        
        earnings_table = Table(earnings_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        earnings_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#4CAF50')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            # Data rows
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
            # Gross pay row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#e8f5e9')),
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(earnings_table)
        elements.append(Spacer(1, 15))
        
        # Deductions Section
        deductions_data = [
            ['DEDUCTIONS', '', 'AMOUNT'],
        ]

        # PAYE Tax
        tax_val = float(self.payslip.tax or 0)
        if tax_val > 0:
            deductions_data.append(['PAYE Tax', '', f"{tax_val:,.2f}"])

        # Employee Pension (8%)
        pension_val = float(self.payslip.employee_pension or 0)
        if pension_val > 0:
            deductions_data.append(['Employee Pension (8%)', '', f"{pension_val:,.2f}"])

        # Add other deductions
        if self.payslip.deductions:
            for name, amount in self.payslip.deductions.items():
                deductions_data.append([name, '', f"{float(amount or 0):,.2f}"])

        # Total deductions
        deductions_data.append(['', 'Total Deductions:', f"{float(self.payslip.total_deductions or 0):,.2f}"])
        
        deductions_table = Table(deductions_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        deductions_table.setStyle(TableStyle([
            # Header row
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f44336')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            # Data rows
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('ALIGN', (-1, 0), (-1, -1), 'RIGHT'),
            # Total row
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#ffebee')),
            # Grid
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(deductions_table)
        elements.append(Spacer(1, 20))
        
        # Net Pay (Highlighted)
        net_pay_data = [
            ['NET PAY', f"{self.payslip.net_pay:,.2f}"],
        ]
        net_pay_table = Table(net_pay_data, colWidths=[4.5*inch, 1.5*inch])
        net_pay_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#2196F3')),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors.whitesmoke),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 14),
            ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
            ('PADDING', (0, 0), (-1, -1), 12),
        ]))
        elements.append(net_pay_table)
        elements.append(Spacer(1, 20))
        
        # Attendance Summary
        attendance_data = [
            ['ATTENDANCE SUMMARY', '', ''],
            ['Days Worked:', str(self.payslip.days_worked), ''],
            ['Days Absent:', str(self.payslip.days_absent), ''],
            ['Days on Leave:', str(self.payslip.days_on_leave), ''],
            ['Overtime Hours:', str(self.payslip.overtime_hours), ''],
        ]
        attendance_table = Table(attendance_data, colWidths=[3*inch, 1.5*inch, 1.5*inch])
        attendance_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#9E9E9E')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('FONTNAME', (0, 0), (0, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(attendance_table)
        
        # Build PDF
        doc.build(elements)
        
        # Save to file
        pdf_content = buffer.getvalue()
        buffer.close()
        
        # Save to payslip model
        filename = f"payslip_{self.payslip.payslip_number}.pdf"
        self.payslip.pdf_file.save(filename, ContentFile(pdf_content), save=True)
        
        return self.payslip.pdf_file.path
    
    def _generate_html(self):
        """
        Generate HTML payslip (fallback if reportlab not available)
        
        Returns:
            str: Path to generated HTML file
        """
        context = {
            'payslip': self.payslip,
            'payroll': self.payslip.payroll,
            'staff': self.payslip.staff,
        }
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payslip - {self.payslip.payslip_number}</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                .header {{ text-align: center; margin-bottom: 30px; }}
                .section {{ margin-bottom: 20px; }}
                table {{ width: 100%; border-collapse: collapse; margin-bottom: 20px; }}
                th, td {{ padding: 10px; text-align: left; border: 1px solid #ddd; }}
                th {{ background-color: #4CAF50; color: white; }}
                .total {{ font-weight: bold; background-color: #f5f5f5; }}
                .net-pay {{ background-color: #2196F3; color: white; font-size: 18px; font-weight: bold; }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>PAYSLIP</h1>
                <p>Payslip Number: {self.payslip.payslip_number}</p>
                <p>Period: {self.payslip.payroll.period_start} to {self.payslip.payroll.period_end}</p>
            </div>
            
            <div class="section">
                <h3>Employee Information</h3>
                <p>Name: {self.payslip.staff.first_name} {self.payslip.staff.last_name}</p>
                <p>Position: {self.payslip.staff.position or 'N/A'}</p>
                <p>Department: {self.payslip.staff.department or 'N/A'}</p>
            </div>
            
            <div class="section">
                <h3>Earnings</h3>
                <table>
                    <tr><td>Basic Salary</td><td>{float(self.payslip.basic_salary or 0):,.2f}</td></tr>
                    <tr><td>Overtime Pay</td><td>{float(self.payslip.overtime_pay or 0):,.2f}</td></tr>
                    <tr class="total"><td>Gross Pay</td><td>{float(self.payslip.gross_pay or 0):,.2f}</td></tr>
                </table>
            </div>
            
            <div class="section">
                <h3>Deductions</h3>
                <table>
                    <tr><td>PAYE Tax</td><td>{float(self.payslip.tax or 0):,.2f}</td></tr>
                    <tr><td>Employee Pension (8%)</td><td>{float(self.payslip.employee_pension or 0):,.2f}</td></tr>
                    <tr class="total"><td>Total Deductions</td><td>{float(self.payslip.total_deductions or 0):,.2f}</td></tr>
                </table>
            </div>
            
            <div class="section">
                <table>
                    <tr class="net-pay"><td>NET PAY</td><td>{float(self.payslip.net_pay or 0):,.2f}</td></tr>
                </table>
            </div>
        </body>
        </html>
        """
        
        # Save HTML to file
        filename = f"payslip_{self.payslip.payslip_number}.html"
        html_file = ContentFile(html_content.encode('utf-8'))
        self.payslip.pdf_file.save(filename, html_file, save=True)
        
        return self.payslip.pdf_file.path
    
    def email_payslip(self, recipient_email=None):
        """
        Email payslip to staff
        
        Args:
            recipient_email: Optional email address. Uses staff email if not provided
            
        Returns:
            bool: True if email sent successfully
        """
        from django.core.mail import EmailMessage
        from django.utils import timezone
        
        if not recipient_email:
            recipient_email = self.payslip.staff.email
        
        if not recipient_email:
            return False
        
        # Generate PDF if not already generated
        if not self.payslip.pdf_file:
            self.generate_pdf()
        
        # Prepare email
        subject = f"Payslip for {self.payslip.payroll.period_start} to {self.payslip.payroll.period_end}"
        message = f"""
Dear {self.payslip.staff.first_name},

Please find attached your payslip for the period {self.payslip.payroll.period_start} to {self.payslip.payroll.period_end}.

Net Pay: {self.payslip.net_pay:,.2f}

If you have any questions, please contact HR.

Best regards,
HR Department
        """
        
        email = EmailMessage(
            subject=subject,
            body=message,
            to=[recipient_email],
        )
        
        # Attach PDF
        if self.payslip.pdf_file:
            email.attach_file(self.payslip.pdf_file.path)
        
        # Send email
        try:
            email.send()
            self.payslip.emailed_at = timezone.now()
            self.payslip.save(update_fields=['emailed_at'])
            return True
        except Exception as e:
            print(f"Error sending email: {str(e)}")
            return False
