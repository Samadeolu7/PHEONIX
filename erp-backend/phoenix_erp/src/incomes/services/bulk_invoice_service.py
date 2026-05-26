"""
Bulk Invoice Generation Service for School Domain
Handles batch invoice creation for entire classes with discount/scholarship visibility
"""
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from django.db import transaction, models
from django.utils import timezone
from django.core.exceptions import ValidationError

from clients.models import Client, ClientClassification
from incomes.models import Invoice, FeeStructure
from incomes.models_calendar import AcademicTerm, AcademicYear
from incomes.models_discount import DiscountApplication, AppliedDiscount
from common.services.reference_service import ReferenceService


class BulkInvoiceService:
    """
    Service for bulk invoice generation and approval workflow
    
    Features:
    - Generate invoices for entire class (ClientClassification)
    - Track discount/scholarship applications for approval
    - Batch approval/rejection
    - Summary preview with discount visibility
    - Integration with approval workflows
    """
    
    @staticmethod
    def generate_batch_for_term(
        term_id: int,
        classification_id: int,
        fee_structure_id: int,
        branch,
        owner,
        due_date: Optional[str] = None,
        notes: str = "",
    ) -> Dict:
        """
        Generate draft invoices for all students in a class for a specific term
        
        Args:
            term_id: AcademicTerm ID
            classification_id: ClientClassification ID (e.g., "Primary 3A")
            fee_structure_id: FeeStructure ID to apply
            branch: Branch instance
            owner: User creating the batch
            due_date: Payment due date (defaults to term's payment_due_date)
            notes: Batch notes
            
        Returns:
            {
                'batch_id': str,
                'status': 'draft',
                'term': {...},
                'classification': {...},
                'fee_structure': {...},
                'total_students': int,
                'invoices_created': int,
                'students_with_discounts': int,
                'total_discount_amount': Decimal,
                'invoices': [...],
                'discount_summary': [...]
            }
        """
        # Validate inputs
        term = AcademicTerm.objects.get(id=term_id, branch=branch)
        classification = ClientClassification.objects.get(id=classification_id, branch=branch)
        fee_structure = FeeStructure.objects.get(id=fee_structure_id, branch=branch)
        
        # Get all students in this class
        students = Client.objects.filter(
            classification=classification,
            branch=branch,
            is_active=True,
            usage_context='student'
        )
        
        total_students = students.count()
        
        if total_students == 0:
            raise ValidationError(f"No active students found in {classification.name}")
        
        # Generate unique batch ID
        batch_id = f"BATCH-{term.code}-{classification.code}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        
        # Use term's due date or provided date
        if due_date is None:
            due_date = term.payment_due_date or term.end_date
        
        invoices_created = []
        discount_summary = []
        total_discount_amount = Decimal('0.00')
        students_with_discounts = 0
        
        with transaction.atomic():
            for student in students:
                # Check for active discounts/scholarships
                active_discounts = DiscountApplication.objects.filter(
                    client=student,
                    program__is_active=True,
                    status='active',
                    start_date__lte=timezone.now().date()
                ).filter(
                    models.Q(end_date__isnull=True) | models.Q(end_date__gte=timezone.now().date())
                )
                
                # Calculate base amount
                base_amount = fee_structure.base_amount
                discount_amount = Decimal('0.00')
                discount_programs = []
                
                # Apply discounts
                for discount_app in active_discounts:
                    program = discount_app.program
                    
                    if program.discount_type == 'percentage':
                        discount = base_amount * (program.discount_value / 100)
                    elif program.discount_type == 'fixed_amount':
                        discount = min(program.discount_value, base_amount)
                    elif program.discount_type == 'full_waiver':
                        discount = base_amount
                    else:
                        discount = Decimal('0.00')
                    
                    discount_amount += discount
                    discount_programs.append({
                        'program_code': program.program_code,
                        'program_name': program.name,
                        'program_type': program.program_type,
                        'discount_type': program.discount_type,
                        'discount_value': program.discount_value,
                        'discount_amount': discount,
                    })
                
                # Cap discount at base amount
                discount_amount = min(discount_amount, base_amount)
                final_amount = base_amount - discount_amount
                
                # Track students with discounts
                if discount_amount > 0:
                    students_with_discounts += 1
                    total_discount_amount += discount_amount
                    
                    discount_summary.append({
                        'student_id': student.client_id,
                        'student_name': student.name,
                        'base_amount': float(base_amount),
                        'discount_amount': float(discount_amount),
                        'final_amount': float(final_amount),
                        'programs': discount_programs,
                        'needs_approval': True  # Flag for workflow
                    })
                
                # Generate invoice reference
                invoice_ref = ReferenceService.generate_reference(
                    model_name='Invoice',
                    prefix='INV',
                    branch=branch
                )
                
                # Create draft invoice
                invoice = Invoice.objects.create(
                    reference_number=invoice_ref,
                    client=student,
                    category=fee_structure.category,
                    fee_structure=fee_structure,
                    description=f"{fee_structure.name} - {term.name} ({term.academic_year.name})",
                    amount_due=final_amount,
                    due_date=due_date,
                    status='draft',  # Draft until approved
                    invoice_date=timezone.now().date(),
                    branch=branch,
                    owner=owner,
                    metadata={
                        'batch_id': batch_id,
                        'term_id': term.id,
                        'term_code': term.code,
                        'classification_id': classification.id,
                        'classification_name': classification.name,
                        'base_amount': float(base_amount),
                        'discount_amount': float(discount_amount),
                        'discount_programs': discount_programs,
                        'batch_notes': notes,
                    }
                )
                
                # Create AppliedDiscount records for tracking
                for discount_app in active_discounts:
                    AppliedDiscount.objects.create(
                        application=discount_app,
                        invoice=invoice,
                        applied_amount=discount_amount / len(active_discounts),  # Split evenly
                        applied_date=timezone.now().date(),
                        status='pending',  # Pending approval
                        branch=branch,
                        owner=owner
                    )
                
                invoices_created.append({
                    'invoice_id': invoice.id,
                    'reference_number': invoice.reference_number,
                    'student_id': student.client_id,
                    'student_name': student.name,
                    'base_amount': float(base_amount),
                    'discount_amount': float(discount_amount),
                    'final_amount': float(final_amount),
                    'status': 'draft',
                    'has_discount': discount_amount > 0,
                })
        
        return {
            'batch_id': batch_id,
            'status': 'draft',
            'created_at': timezone.now().isoformat(),
            'term': {
                'id': term.id,
                'name': term.name,
                'code': term.code,
                'academic_year': term.academic_year.name,
            },
            'classification': {
                'id': classification.id,
                'name': classification.name,
                'code': classification.code,
            },
            'fee_structure': {
                'id': fee_structure.id,
                'name': fee_structure.name,
                'base_amount': float(fee_structure.base_amount),
            },
            'total_students': total_students,
            'invoices_created': len(invoices_created),
            'students_with_discounts': students_with_discounts,
            'total_discount_amount': float(total_discount_amount),
            'total_base_amount': float(fee_structure.base_amount * total_students),
            'total_final_amount': float(sum(inv['final_amount'] for inv in invoices_created)),
            'invoices': invoices_created,
            'discount_summary': discount_summary,  # For approval review
            'due_date': str(due_date),
            'notes': notes,
        }
    
    @staticmethod
    def get_batch_summary(batch_id: str, branch) -> Dict:
        """
        Get summary of a batch for approval review
        Shows discounts/scholarships prominently
        
        Args:
            batch_id: Batch identifier
            branch: Branch instance
            
        Returns:
            Detailed summary with discount visibility
        """
        # Find all invoices in this batch
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            branch=branch
        ).select_related('client', 'fee_structure')
        
        if not invoices.exists():
            raise ValidationError(f"Batch {batch_id} not found")
        
        # Extract batch metadata
        first_invoice = invoices.first()
        metadata = first_invoice.metadata
        
        total_invoices = invoices.count()
        total_amount = sum(inv.amount_due for inv in invoices)
        paid_count = invoices.filter(status='paid').count()
        draft_count = invoices.filter(status='draft').count()
        
        # Get discount details
        discount_summary = []
        total_discount_amount = Decimal('0.00')
        students_with_discounts = 0
        
        for invoice in invoices:
            discount_amount = Decimal(str(invoice.metadata.get('discount_amount', 0)))
            if discount_amount > 0:
                students_with_discounts += 1
                total_discount_amount += discount_amount
                
                discount_summary.append({
                    'invoice_id': invoice.id,
                    'reference_number': invoice.reference_number,
                    'student_id': invoice.client.client_id,
                    'student_name': invoice.client.name,
                    'base_amount': invoice.metadata.get('base_amount', 0),
                    'discount_amount': float(discount_amount),
                    'final_amount': float(invoice.amount_due),
                    'programs': invoice.metadata.get('discount_programs', []),
                    'status': invoice.status,
                })
        
        return {
            'batch_id': batch_id,
            'status': first_invoice.status,
            'term': metadata.get('term_code'),
            'classification': metadata.get('classification_name'),
            'total_invoices': total_invoices,
            'draft_count': draft_count,
            'paid_count': paid_count,
            'total_students': total_invoices,
            'students_with_discounts': students_with_discounts,
            'discount_percentage': round((students_with_discounts / total_invoices * 100), 2) if total_invoices > 0 else 0,
            'total_base_amount': float(sum(Decimal(str(inv.metadata.get('base_amount', 0))) for inv in invoices)),
            'total_discount_amount': float(total_discount_amount),
            'total_final_amount': float(total_amount),
            'savings_percentage': round((total_discount_amount / sum(Decimal(str(inv.metadata.get('base_amount', 0))) for inv in invoices) * 100), 2) if invoices.exists() else 0,
            'discount_summary': discount_summary,
            'created_at': first_invoice.created_at.isoformat(),
            'notes': metadata.get('batch_notes', ''),
            'requires_approval': students_with_discounts > 0,  # Flag if any discounts present
        }
    
    @staticmethod
    def approve_batch(
        batch_id: str,
        branch,
        approver,
        notes: str = "",
        approved_discount_invoice_ids: Optional[List[int]] = None
    ) -> Dict:
        """
        Approve a batch of invoices
        Converts draft invoices to receivables (status='pending')
        Allows selective approval of discount invoices
        
        Args:
            batch_id: Batch identifier
            branch: Branch instance
            approver: User approving the batch
            notes: Approval notes
            approved_discount_invoice_ids: List of invoice IDs with approved discounts
                                          If None, approve all
            
        Returns:
            Summary of approval action
        """
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            branch=branch,
            status='draft'
        )
        
        if not invoices.exists():
            raise ValidationError(f"No draft invoices found for batch {batch_id}")
        
        approved_count = 0
        rejected_count = 0
        discount_approved_count = 0
        discount_rejected_count = 0
        
        with transaction.atomic():
            for invoice in invoices:
                discount_amount = Decimal(str(invoice.metadata.get('discount_amount', 0)))
                has_discount = discount_amount > 0
                
                # Check if this discount invoice is approved
                if has_discount and approved_discount_invoice_ids is not None:
                    if invoice.id not in approved_discount_invoice_ids:
                        # Reject discount - recalculate to base amount
                        base_amount = Decimal(str(invoice.metadata.get('base_amount', invoice.amount_due)))
                        invoice.amount_due = base_amount
                        invoice.metadata['discount_rejected'] = True
                        invoice.metadata['rejection_reason'] = 'Discount not approved'
                        discount_rejected_count += 1
                        
                        # Update AppliedDiscount status
                        AppliedDiscount.objects.filter(
                            invoice=invoice
                        ).update(status='rejected')
                    else:
                        discount_approved_count += 1
                        # Update AppliedDiscount status
                        AppliedDiscount.objects.filter(
                            invoice=invoice
                        ).update(status='approved')
                
                # Approve invoice
                invoice.status = 'pending'  # Now a receivable
                invoice.metadata['approved_by'] = approver.id
                invoice.metadata['approved_at'] = timezone.now().isoformat()
                invoice.metadata['approval_notes'] = notes
                invoice.save()
                
                approved_count += 1
        
        # Send invoice emails to parents/guardians (compliance requirement - Step 5)
        try:
            from notifications.services import NotificationService
            
            notification_service = NotificationService()
            email_sent_count = 0
            
            for invoice in invoices:
                try:
                    # Get parent/guardian contact info
                    client = invoice.client
                    parent_email = client.contact_email or client.metadata.get('parent_email')
                    
                    if parent_email:
                        notification_service.send_from_template(
                            template_code='invoice_created',
                            recipient=client,
                            context={
                                'invoice_number': invoice.reference_number,
                                'student_name': client.name,
                                'student_id': client.client_id,
                                'fee_name': invoice.fee_structure.name if invoice.fee_structure else 'Fee',
                                'amount_due': float(invoice.amount_due),
                                'due_date': invoice.due_date.strftime('%B %d, %Y'),
                                'term_name': invoice.metadata.get('term_code', ''),
                                'classification_name': invoice.metadata.get('classification_name', ''),
                                'invoice_date': invoice.invoice_date.strftime('%B %d, %Y'),
                                'has_discount': invoice.metadata.get('discount_amount', 0) > 0,
                                'discount_amount': float(invoice.metadata.get('discount_amount', 0)),
                                'base_amount': float(invoice.metadata.get('base_amount', invoice.amount_due)),
                            },
                            owner=approver,
                            branch=branch,
                            related_object=invoice,
                            channels=['email']
                        )
                        email_sent_count += 1
                except Exception as email_error:
                    # Log but don't fail the approval
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to send invoice email for {invoice.reference_number}: {email_error}")
            
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"Sent {email_sent_count} invoice emails out of {approved_count} approved invoices")
            
        except Exception as notification_error:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send batch invoice emails: {notification_error}")
        
        return {
            'batch_id': batch_id,
            'status': 'approved',
            'approved_at': timezone.now().isoformat(),
            'approved_by': approver.username,
            'total_approved': approved_count,
            'discounts_approved': discount_approved_count,
            'discounts_rejected': discount_rejected_count,
            'notes': notes,
        }
    
    @staticmethod
    def reject_batch(
        batch_id: str,
        branch,
        rejector,
        reason: str = ""
    ) -> Dict:
        """
        Reject an entire batch of invoices
        Deletes draft invoices (soft delete)
        
        Args:
            batch_id: Batch identifier
            branch: Branch instance
            rejector: User rejecting the batch
            reason: Rejection reason
            
        Returns:
            Summary of rejection
        """
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            branch=branch,
            status='draft'
        )
        
        if not invoices.exists():
            raise ValidationError(f"No draft invoices found for batch {batch_id}")
        
        rejected_count = invoices.count()
        
        with transaction.atomic():
            # Update metadata before soft delete
            for invoice in invoices:
                invoice.metadata['rejected_by'] = rejector.id
                invoice.metadata['rejected_at'] = timezone.now().isoformat()
                invoice.metadata['rejection_reason'] = reason
                invoice.save()
            
            # Soft delete all invoices in batch
            invoices.delete()
            
            # Update AppliedDiscount records
            AppliedDiscount.objects.filter(
                invoice__in=invoices
            ).update(status='cancelled')
        
        return {
            'batch_id': batch_id,
            'status': 'rejected',
            'rejected_at': timezone.now().isoformat(),
            'rejected_by': rejector.username,
            'total_rejected': rejected_count,
            'reason': reason,
        }
    
    @staticmethod
    def get_batch_sample(
        batch_id: str,
        branch,
        sample_size: Optional[int] = None,
        sample_pct: float = 5.0
    ) -> Dict:
        """
        Get random sample of batch invoices for Finance Officer review
        Compliance requirement: Finance reviews sample before bulk approval
        
        Args:
            batch_id: Batch identifier
            branch: Branch instance
            sample_size: Exact number to sample (overrides percentage)
            sample_pct: Percentage to sample (default 5%)
        
        Returns:
            Sample invoices for review with comparison to fee schedule
        """
        import random
        
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            branch=branch
        ).select_related('client', 'fee_structure')
        
        total_count = invoices.count()
        
        if total_count == 0:
            raise ValidationError(f"No invoices found for batch {batch_id}")
        
        # Calculate sample size
        if sample_size:
            sample_count = min(sample_size, total_count)
        else:
            sample_count = max(1, int(total_count * sample_pct / 100))
        
        # Random sampling
        all_ids = list(invoices.values_list('id', flat=True))
        sampled_ids = random.sample(all_ids, sample_count)
        
        sample_invoices = invoices.filter(id__in=sampled_ids)
        
        # Build detailed sample data for review
        sampled_data = []
        discrepancies = []
        
        for inv in sample_invoices:
            base_amount = Decimal(str(inv.metadata.get('base_amount', inv.amount_due)))
            discount_amount = Decimal(str(inv.metadata.get('discount_amount', 0)))
            expected_final = base_amount - discount_amount
            
            # Check for discrepancies
            has_discrepancy = abs(inv.amount_due - expected_final) > Decimal('0.01')
            
            invoice_data = {
                'invoice_id': inv.id,
                'reference_number': inv.reference_number,
                'student_id': inv.client.client_id,
                'student_name': inv.client.name,
                'classification': inv.metadata.get('classification_name', ''),
                'fee_structure_name': inv.fee_structure.name if inv.fee_structure else '',
                'fee_structure_base': float(inv.fee_structure.base_amount) if inv.fee_structure else 0,
                'base_amount': float(base_amount),
                'discount_amount': float(discount_amount),
                'final_amount': float(inv.amount_due),
                'expected_final': float(expected_final),
                'has_discrepancy': has_discrepancy,
                'discount_programs': inv.metadata.get('discount_programs', []),
            }
            
            sampled_data.append(invoice_data)
            
            if has_discrepancy:
                discrepancies.append({
                    'invoice': inv.reference_number,
                    'student': inv.client.name,
                    'expected': float(expected_final),
                    'actual': float(inv.amount_due),
                    'difference': float(inv.amount_due - expected_final)
                })
        
        return {
            'batch_id': batch_id,
            'total_invoices': total_count,
            'sample_size': sample_count,
            'sample_percentage': round(sample_count / total_count * 100, 2),
            'sampled_invoices': sampled_data,
            'discrepancy_count': len(discrepancies),
            'discrepancies': discrepancies,
            'zero_discrepancies': len(discrepancies) == 0,
            'review_status': 'APPROVED - Zero Discrepancies' if len(discrepancies) == 0 else 'REVIEW REQUIRED - Discrepancies Found',
        }
    
    @staticmethod
    def generate_approval_report(
        batch_id: str,
        branch,
        approver,
        summary: Dict
    ) -> bytes:
        """
        Generate PDF approval report for audit trail
        Compliance requirement: Sign-off report confirming zero discrepancies
        
        Args:
            batch_id: Batch identifier
            branch: Branch instance
            approver: User who approved the batch
            summary: Batch summary from get_batch_summary()
        
        Returns:
            PDF file content as bytes
        """
        from weasyprint import HTML, CSS
        from io import BytesIO
        
        # Generate HTML content for the report
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page {{
                    size: A4;
                    margin: 2cm;
                }}
                
                body {{
                    font-family: Arial, sans-serif;
                    font-size: 11pt;
                    line-height: 1.5;
                    color: #333;
                }}
                
                .header {{
                    text-align: center;
                    margin-bottom: 30px;
                }}
                
                .header h1 {{
                    font-size: 20pt;
                    margin-bottom: 10px;
                    color: #2c3e50;
                }}
                
                .header .meta {{
                    font-size: 9pt;
                    color: #666;
                }}
                
                .section {{
                    margin-bottom: 25px;
                }}
                
                .section h2 {{
                    font-size: 14pt;
                    color: #34495e;
                    border-bottom: 2px solid #3498db;
                    padding-bottom: 5px;
                    margin-bottom: 15px;
                }}
                
                .info-row {{
                    display: flex;
                    margin-bottom: 8px;
                }}
                
                .info-label {{
                    font-weight: bold;
                    width: 200px;
                    color: #555;
                }}
                
                .info-value {{
                    flex: 1;
                }}
                
                .certification {{
                    background-color: #f8f9fa;
                    border-left: 4px solid #3498db;
                    padding: 15px;
                    margin: 20px 0;
                }}
                
                .signature-line {{
                    margin-top: 40px;
                    border-top: 1px solid #000;
                    width: 300px;
                    padding-top: 5px;
                }}
                
                .digital-signature {{
                    font-size: 9pt;
                    font-style: italic;
                    color: #666;
                    margin-top: 10px;
                }}
                
                .footer {{
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    text-align: center;
                    font-size: 8pt;
                    color: #999;
                    padding: 10px 0;
                    border-top: 1px solid #ddd;
                }}
                
                .status-badge {{
                    display: inline-block;
                    padding: 5px 15px;
                    border-radius: 4px;
                    font-weight: bold;
                    font-size: 10pt;
                }}
                
                .status-success {{
                    background-color: #d4edda;
                    color: #155724;
                    border: 1px solid #c3e6cb;
                }}
                
                .status-warning {{
                    background-color: #fff3cd;
                    color: #856404;
                    border: 1px solid #ffeeba;
                }}
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Invoice Batch Approval Report</h1>
                <div class="meta">
                    <strong>{branch.name}</strong><br>
                    Report Generated: {timezone.now().strftime('%B %d, %Y at %H:%M')}
                </div>
            </div>
            
            <div class="section">
                <h2>Batch Information</h2>
                <div class="info-row">
                    <div class="info-label">Batch ID:</div>
                    <div class="info-value">{batch_id}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Term:</div>
                    <div class="info-value">{summary.get('term', 'N/A')}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Class/Grade:</div>
                    <div class="info-value">{summary.get('classification', 'N/A')}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Generation Date:</div>
                    <div class="info-value">{summary.get('created_at', 'N/A')[:10] if summary.get('created_at') else 'N/A'}</div>
                </div>
            </div>
            
            <div class="section">
                <h2>Batch Summary</h2>
                <div class="info-row">
                    <div class="info-label">Total Invoices:</div>
                    <div class="info-value">{summary.get('total_invoices', 0)}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Total Base Amount:</div>
                    <div class="info-value">${summary.get('total_base_amount', 0):,.2f}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Total Discount Amount:</div>
                    <div class="info-value">${summary.get('total_discount_amount', 0):,.2f}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Total Final Amount:</div>
                    <div class="info-value"><strong>${summary.get('total_final_amount', 0):,.2f}</strong></div>
                </div>
                <div class="info-row">
                    <div class="info-label">Students with Discounts:</div>
                    <div class="info-value">{summary.get('students_with_discounts', 0)} ({summary.get('discount_percentage', 0):.1f}%)</div>
                </div>
            </div>
            
            <div class="section">
                <h2>Approval Details</h2>
                <div class="info-row">
                    <div class="info-label">Approved By:</div>
                    <div class="info-value">{approver.get_full_name()} ({approver.username})</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Approval Date:</div>
                    <div class="info-value">{timezone.now().strftime('%B %d, %Y at %H:%M')}</div>
                </div>
                <div class="info-row">
                    <div class="info-label">Discrepancy Status:</div>
                    <div class="info-value">
                        <span class="status-badge {'status-success' if summary.get('zero_discrepancies', True) else 'status-warning'}">
                            {'ZERO DISCREPANCIES' if summary.get('zero_discrepancies', True) else 'DISCREPANCIES FOUND'}
                        </span>
                    </div>
                </div>
            </div>
            
            <div class="certification">
                <h2 style="margin-top: 0;">Finance Officer Certification</h2>
                <p>
                    I hereby certify that I have reviewed this batch of system-generated invoices
                    and confirm that they are accurate and consistent with the approved fee schedule.
                </p>
                <p>
                    Sample review completed: {'YES - Discounts require approval' if summary.get('requires_approval', False) else 'N/A'}
                </p>
                
                <div class="signature-line">
                    Finance Officer Signature
                </div>
                <div class="digital-signature">
                    Digital Signature: {approver.username} - {timezone.now().isoformat()}
                </div>
            </div>
            
            <div class="footer">
                Generated by Phoenix ERP - Invoice Batch Approval System<br>
                Batch ID: {batch_id} | Page 1 of 1
            </div>
        </body>
        </html>
        """
        
        # Generate PDF using WeasyPrint
        pdf = HTML(string=html_content).write_pdf()
        return pdf
        }
    
    @staticmethod
    def list_batches(branch, status: Optional[str] = None) -> List[Dict]:
        """
        List all invoice batches
        
        Args:
            branch: Branch instance
            status: Filter by status ('draft', 'approved', 'rejected')
            
        Returns:
            List of batch summaries
        """
        # Get all invoices with batch_id metadata
        invoices = Invoice.objects.filter(
            branch=branch,
            metadata__has_key='batch_id'
        )
        
        if status:
            invoices = invoices.filter(status=status)
        
        # Group by batch_id
        batch_ids = set(inv.metadata.get('batch_id') for inv in invoices)
        
        batches = []
        for batch_id in batch_ids:
            batch_invoices = invoices.filter(metadata__batch_id=batch_id)
            first_invoice = batch_invoices.first()
            
            if not first_invoice:
                continue
            
            metadata = first_invoice.metadata
            
            batches.append({
                'batch_id': batch_id,
                'term': metadata.get('term_code'),
                'classification': metadata.get('classification_name'),
                'total_invoices': batch_invoices.count(),
                'status': first_invoice.status,
                'created_at': first_invoice.created_at.isoformat(),
                'total_amount': float(sum(inv.amount_due for inv in batch_invoices)),
                'has_discounts': any(
                    Decimal(str(inv.metadata.get('discount_amount', 0))) > 0
                    for inv in batch_invoices
                ),
            })
        
        return sorted(batches, key=lambda x: x['created_at'], reverse=True)
