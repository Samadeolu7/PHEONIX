# Bulk Invoice Generation & Receivables Workflow

## Current System Status

### ✅ What's Already Implemented

1. **Core Models**
   - `Client` - Student/customer with classifications
   - `ClientClassification` - Groups of clients (e.g., "Primary 1A", "Secondary 3B")
   - `FeeStructure` - Fee templates with amounts and recurrence
   - `Invoice` - Individual invoices
   - `FeeEntitlement` - Payment tracking and access control
   - `AcademicYear` & `AcademicTerm` - Flexible term management
   - Discount/Scholarship system (just tested!)

2. **Services**
   - `SchoolFeesService.create_student_invoice()` - Creates individual invoices
   - `IncomeAccountingService` - GL posting
   - `DiscountWorkflowService` - Automated discount application

3. **APIs**
   - CRUD for all models
   - Individual invoice creation
   - Payment recording
   - Entitlement checking

### ❌ What's NOT Implemented Yet

1. **Bulk Invoice Generation**
   - No batch generation for entire classes
   - No automatic triggering based on term start
   - No approval workflow for batch invoices
   - No bulk PDF generation/download

2. **Workflow Integration**
   - No approval process before invoices become receivables
   - No class-level summary for approvers

3. **Convenience Tools**
   - No bulk PDF download
   - No ZIP export for classes
   - No batch email sending (not needed yet per requirements)

---

## Proposed Solution Architecture

### Phase 1: Bulk Invoice Generation Service

<

/details>

### 1.1 New Service: `BulkInvoiceService`

**Location:** `incomes/services/bulk_invoice_service.py`

```python
# incomes/services/bulk_invoice_service.py
from django.db import transaction
from django.utils import timezone
from decimal import Decimal
from typing import List, Dict, Optional
import logging

from incomes.models import Invoice, FeeStructure, FeeEntitlement
from incomes.models_calendar import AcademicTerm
from clients.models import Client, ClientClassification
from automations.models import WorkflowTemplate, WorkflowRun
from automations.workflow_executor import WorkflowExecutor

logger = logging.getLogger(__name__)


class BulkInvoiceService:
    """
    Service for bulk invoice generation and approval workflows
    """
    
    @staticmethod
    @transaction.atomic
    def generate_batch_for_term(
        academic_term: AcademicTerm,
        classification: ClientClassification,
        fee_structure: FeeStructure,
        created_by,
        auto_approve: bool = False
    ) -> Dict:
        """
        Generate invoices for all students in a classification for a term
        
        Args:
            academic_term: Term to generate invoices for
            classification: Student classification (class)
            fee_structure: Fee structure to apply
            created_by: User initiating the generation
            auto_approve: Skip approval workflow
            
        Returns:
            {
                'batch_id': str,
                'total_students': int,
                'total_amount': Decimal,
                'invoices_generated': int,
                'status': 'pending_approval' | 'approved',
                'workflow_run_id': int (if applicable)
            }
        """
        # Get all active students in classification
        students = Client.objects.filter(
            classification=classification,
            status='active',
            usage_context='student',
            branch=created_by.branch,
            owner=created_by
        )
        
        if not students.exists():
            raise ValueError(f"No active students found in {classification.name}")
        
        # Generate batch ID
        batch_id = f"BATCH-{academic_term.code}-{classification.code}-{timezone.now().strftime('%Y%m%d%H%M%S')}"
        
        invoices_created = []
        total_amount = Decimal('0')
        errors = []
        
        # Generate invoices for each student
        for student in students:
            try:
                invoice = BulkInvoiceService._create_single_invoice(
                    student=student,
                    fee_structure=fee_structure,
                    academic_term=academic_term,
                    batch_id=batch_id,
                    created_by=created_by
                )
                invoices_created.append(invoice)
                total_amount += invoice.amount
                
            except Exception as e:
                logger.error(f"Failed to create invoice for {student.client_id}: {str(e)}")
                errors.append({
                    'student_id': student.client_id,
                    'student_name': student.full_name,
                    'error': str(e)
                })
        
        result = {
            'batch_id': batch_id,
            'total_students': students.count(),
            'invoices_generated': len(invoices_created),
            'total_amount': str(total_amount),
            'status': 'approved' if auto_approve else 'pending_approval',
            'errors': errors,
            'academic_term': {
                'id': academic_term.id,
                'name': academic_term.name,
                'code': academic_term.code
            },
            'classification': {
                'id': classification.id,
                'name': classification.name,
                'code': classification.code
            },
            'fee_structure': {
                'id': fee_structure.id,
                'name': fee_structure.name,
                'amount': str(fee_structure.base_amount)
            }
        }
        
        # If auto-approve, mark all as sent immediately
        if auto_approve:
            for invoice in invoices_created:
                invoice.status = 'sent'
                invoice.save()
            result['approved_at'] = timezone.now().isoformat()
        else:
            # Create approval workflow if configured
            result['workflow_run_id'] = BulkInvoiceService._create_approval_workflow(
                batch_id=batch_id,
                invoices=invoices_created,
                created_by=created_by
            )
        
        return result
    
    @staticmethod
    def _create_single_invoice(
        student: Client,
        fee_structure: FeeStructure,
        academic_term: AcademicTerm,
        batch_id: str,
        created_by
    ) -> Invoice:
        """Create individual invoice for a student"""
        
        # Generate invoice number
        invoice_number = f"INV-{student.client_id}-{academic_term.code}-{timezone.now().strftime('%Y%m%d%H%M%S%f')[:-3]}"
        
        # Check for optional fees in student metadata
        optional_fees = student.get_metadata('optional_fees', [])
        total_amount = fee_structure.base_amount
        
        description_parts = [
            f"{fee_structure.name}",
            f"Academic Year: {academic_term.academic_year.name}",
            f"Term: {academic_term.name}",
            f"Class: {student.classification.name if student.classification else 'N/A'}"
        ]
        
        # Add optional fees
        if optional_fees:
            description_parts.append(f"Optional Fees: {', '.join(optional_fees)}")
        
        invoice = Invoice.objects.create(
            client=student,
            invoice_number=invoice_number,
            invoice_date=timezone.now().date(),
            due_date=academic_term.payment_due_date,
            description="\n".join(description_parts),
            amount=total_amount,
            fee_structure=fee_structure,
            status='draft',  # Starts as draft until approved
            metadata={
                'batch_id': batch_id,
                'academic_term_id': academic_term.id,
                'academic_year_id': academic_term.academic_year.id,
                'classification_id': student.classification.id if student.classification else None,
                'optional_fees': optional_fees,
                'generated_by': created_by.username,
                'generated_at': timezone.now().isoformat()
            },
            owner=created_by,
            branch=created_by.branch,
            created_by=created_by
        )
        
        return invoice
    
    @staticmethod
    def _create_approval_workflow(
        batch_id: str,
        invoices: List[Invoice],
        created_by
    ) -> Optional[int]:
        """
        Create approval workflow for batch invoices
        Returns workflow_run_id if created
        """
        try:
            # Look for configured approval workflow
            workflow_template = WorkflowTemplate.objects.filter(
                name__icontains='invoice approval',
                is_active=True,
                owner=created_by
            ).first()
            
            if not workflow_template:
                logger.warning("No invoice approval workflow configured. Skipping workflow creation.")
                return None
            
            # Prepare workflow context
            context = {
                'batch_id': batch_id,
                'total_invoices': len(invoices),
                'total_amount': str(sum(inv.amount for inv in invoices)),
                'invoice_ids': [inv.id for inv in invoices],
                'classification': invoices[0].metadata.get('classification_id'),
                'academic_term': invoices[0].metadata.get('academic_term_id'),
                'created_by': created_by.username,
                'created_at': timezone.now().isoformat()
            }
            
            # Create workflow run
            executor = WorkflowExecutor(
                template=workflow_template,
                context=context,
                user=created_by
            )
            
            run = executor.start()
            logger.info(f"Created approval workflow {run.id} for batch {batch_id}")
            
            return run.id
            
        except Exception as e:
            logger.error(f"Failed to create approval workflow: {str(e)}")
            return None
    
    @staticmethod
    @transaction.atomic
    def approve_batch(
        batch_id: str,
        approved_by,
        notes: str = ''
    ) -> Dict:
        """
        Approve batch of invoices - marks them as 'sent' (becomes receivables)
        
        Args:
            batch_id: Batch ID to approve
            approved_by: User approving
            notes: Approval notes
            
        Returns:
            {
                'approved_count': int,
                'total_amount': Decimal,
                'status': 'success'
            }
        """
        # Find all draft invoices in this batch
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            status='draft'
        )
        
        if not invoices.exists():
            raise ValueError(f"No draft invoices found for batch {batch_id}")
        
        approved_count = 0
        total_amount = Decimal('0')
        
        for invoice in invoices:
            invoice.status = 'sent'
            invoice.metadata['approved_by'] = approved_by.username
            invoice.metadata['approved_at'] = timezone.now().isoformat()
            invoice.metadata['approval_notes'] = notes
            invoice.save()
            
            approved_count += 1
            total_amount += invoice.amount
        
        logger.info(f"Approved batch {batch_id}: {approved_count} invoices, total {total_amount}")
        
        return {
            'approved_count': approved_count,
            'total_amount': str(total_amount),
            'status': 'success',
            'batch_id': batch_id
        }
    
    @staticmethod
    @transaction.atomic
    def reject_batch(
        batch_id: str,
        rejected_by,
        reason: str
    ) -> Dict:
        """
        Reject batch of invoices - marks them as 'cancelled'
        """
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id,
            status='draft'
        )
        
        if not invoices.exists():
            raise ValueError(f"No draft invoices found for batch {batch_id}")
        
        rejected_count = 0
        
        for invoice in invoices:
            invoice.status = 'cancelled'
            invoice.metadata['rejected_by'] = rejected_by.username
            invoice.metadata['rejected_at'] = timezone.now().isoformat()
            invoice.metadata['rejection_reason'] = reason
            invoice.save()
            
            rejected_count += 1
        
        logger.info(f"Rejected batch {batch_id}: {rejected_count} invoices")
        
        return {
            'rejected_count': rejected_count,
            'status': 'success',
            'batch_id': batch_id
        }
    
    @staticmethod
    def get_batch_summary(batch_id: str) -> Dict:
        """
        Get summary of a batch for approval review
        """
        invoices = Invoice.objects.filter(
            metadata__batch_id=batch_id
        ).select_related('client', 'fee_structure')
        
        if not invoices.exists():
            raise ValueError(f"Batch {batch_id} not found")
        
        # Group by status
        status_counts = {}
        for status_choice in Invoice.STATUS_CHOICES:
            count = invoices.filter(status=status_choice[0]).count()
            if count > 0:
                status_counts[status_choice[1]] = count
        
        total_amount = sum(inv.amount for inv in invoices)
        
        # Sample invoices for preview
        sample_invoices = []
        for invoice in invoices[:5]:
            sample_invoices.append({
                'invoice_number': invoice.invoice_number,
                'student_id': invoice.client.client_id,
                'student_name': invoice.client.full_name,
                'amount': str(invoice.amount),
                'status': invoice.status
            })
        
        first_invoice = invoices.first()
        
        return {
            'batch_id': batch_id,
            'total_invoices': invoices.count(),
            'total_amount': str(total_amount),
            'status_breakdown': status_counts,
            'academic_term': first_invoice.metadata.get('academic_term_id'),
            'classification': first_invoice.metadata.get('classification_id'),
            'fee_structure': {
                'name': first_invoice.fee_structure.name if first_invoice.fee_structure else 'N/A',
                'amount': str(first_invoice.amount)
            },
            'generated_by': first_invoice.metadata.get('generated_by'),
            'generated_at': first_invoice.metadata.get('generated_at'),
            'sample_invoices': sample_invoices
        }
```

---

### 1.2 New Serializers

**Location:** `incomes/serializers_bulk.py`

```python
# incomes/serializers_bulk.py
from rest_framework import serializers
from incomes.models import Invoice
from incomes.models_calendar import AcademicTerm
from clients.models import ClientClassification


class BulkInvoiceGenerationSerializer(serializers.Serializer):
    """Serializer for bulk invoice generation request"""
    
    academic_term_id = serializers.IntegerField(
        help_text="ID of academic term to generate invoices for"
    )
    classification_id = serializers.IntegerField(
        help_text="ID of client classification (class/grade)"
    )
    fee_structure_id = serializers.IntegerField(
        help_text="ID of fee structure to apply"
    )
    auto_approve = serializers.BooleanField(
        default=False,
        help_text="Skip approval workflow and approve immediately"
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Optional notes for this batch generation"
    )
    
    def validate_academic_term_id(self, value):
        try:
            AcademicTerm.objects.get(id=value)
        except AcademicTerm.DoesNotExist:
            raise serializers.ValidationError(f"Academic term {value} not found")
        return value
    
    def validate_classification_id(self, value):
        try:
            ClientClassification.objects.get(id=value)
        except ClientClassification.DoesNotExist:
            raise serializers.ValidationError(f"Classification {value} not found")
        return value


class BatchApprovalSerializer(serializers.Serializer):
    """Serializer for batch approval/rejection"""
    
    batch_id = serializers.CharField(
        help_text="Batch ID to approve or reject"
    )
    notes = serializers.CharField(
        required=False,
        allow_blank=True,
        help_text="Approval/rejection notes"
    )


class BatchSummarySerializer(serializers.Serializer):
    """Serializer for batch summary response"""
    
    batch_id = serializers.CharField()
    total_invoices = serializers.IntegerField()
    total_amount = serializers.CharField()
    status_breakdown = serializers.DictField()
    academic_term = serializers.IntegerField()
    classification = serializers.IntegerField()
    fee_structure = serializers.DictField()
    generated_by = serializers.CharField()
    generated_at = serializers.CharField()
    sample_invoices = serializers.ListField()


class BulkPDFExportSerializer(serializers.Serializer):
    """Serializer for bulk PDF export request"""
    
    batch_id = serializers.CharField(
        required=False,
        help_text="Export all invoices in this batch"
    )
    invoice_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        help_text="List of specific invoice IDs to export"
    )
    export_format = serializers.ChoiceField(
        choices=['individual', 'zip'],
        default='zip',
        help_text="Export as individual PDFs or ZIP archive"
    )
    
    def validate(self, data):
        if not data.get('batch_id') and not data.get('invoice_ids'):
            raise serializers.ValidationError(
                "Either batch_id or invoice_ids must be provided"
            )
        return data
```

---

### 1.3 New ViewSet Actions

**Location:** `incomes/views.py` (add to existing `InvoiceViewSet`)

```python
# Add these imports at the top
from incomes.services.bulk_invoice_service import BulkInvoiceService
from incomes.serializers_bulk import (
    BulkInvoiceGenerationSerializer,
    BatchApprovalSerializer,
    BulkPDFExportSerializer
)
from django.http import HttpResponse, FileResponse
import io
import zipfile


# Add these actions to InvoiceViewSet class

@action(detail=False, methods=['post'])
def generate_bulk(self, request):
    """
    Generate invoices in bulk for a classification/class
    
    POST /api/incomes/invoices/generate_bulk/
    Body: {
        "academic_term_id": 1,
        "classification_id": 5,
        "fee_structure_id": 10,
        "auto_approve": false,
        "notes": "First term 2026 invoices"
    }
    """
    serializer = BulkInvoiceGenerationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    try:
        # Get related objects
        from incomes.models_calendar import AcademicTerm
        from clients.models import ClientClassification
        from incomes.models import FeeStructure
        
        academic_term = AcademicTerm.objects.get(
            id=serializer.validated_data['academic_term_id']
        )
        classification = ClientClassification.objects.get(
            id=serializer.validated_data['classification_id']
        )
        fee_structure = FeeStructure.objects.get(
            id=serializer.validated_data['fee_structure_id']
        )
        
        # Generate batch
        result = BulkInvoiceService.generate_batch_for_term(
            academic_term=academic_term,
            classification=classification,
            fee_structure=fee_structure,
            created_by=request.user,
            auto_approve=serializer.validated_data['auto_approve']
        )
        
        return Response(result, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        logger.error(f"Bulk generation failed: {str(e)}")
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@action(detail=False, methods=['get'])
def batch_summary(self, request):
    """
    Get summary of a batch for approval review
    
    GET /api/incomes/invoices/batch_summary/?batch_id=BATCH-T1-P1A-20260118143022
    """
    batch_id = request.query_params.get('batch_id')
    if not batch_id:
        return Response(
            {'error': 'batch_id parameter is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        summary = BulkInvoiceService.get_batch_summary(batch_id)
        return Response(summary)
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_404_NOT_FOUND
        )

@action(detail=False, methods=['post'])
def approve_batch(self, request):
    """
    Approve a batch of invoices - makes them receivables
    
    POST /api/incomes/invoices/approve_batch/
    Body: {
        "batch_id": "BATCH-T1-P1A-20260118143022",
        "notes": "Approved for First Term 2026"
    }
    """
    serializer = BatchApprovalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    try:
        result = BulkInvoiceService.approve_batch(
            batch_id=serializer.validated_data['batch_id'],
            approved_by=request.user,
            notes=serializer.validated_data.get('notes', '')
        )
        return Response(result)
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@action(detail=False, methods=['post'])
def reject_batch(self, request):
    """
    Reject a batch of invoices - marks as cancelled
    
    POST /api/incomes/invoices/reject_batch/
    Body: {
        "batch_id": "BATCH-T1-P1A-20260118143022",
        "notes": "Amounts need revision"
    }
    """
    serializer = BatchApprovalSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    if not serializer.validated_data.get('notes'):
        return Response(
            {'error': 'Rejection reason (notes) is required'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        result = BulkInvoiceService.reject_batch(
            batch_id=serializer.validated_data['batch_id'],
            rejected_by=request.user,
            reason=serializer.validated_data['notes']
        )
        return Response(result)
    except ValueError as e:
        return Response(
            {'error': str(e)},
            status=status.HTTP_400_BAD_REQUEST
        )

@action(detail=False, methods=['post'])
def export_bulk_pdf(self, request):
    """
    Export invoices as ZIP of PDFs
    
    POST /api/incomes/invoices/export_bulk_pdf/
    Body: {
        "batch_id": "BATCH-T1-P1A-20260118143022",
        "export_format": "zip"
    }
    
    OR
    
    Body: {
        "invoice_ids": [1, 2, 3, 4, 5],
        "export_format": "zip"
    }
    """
    serializer = BulkPDFExportSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    
    # Get invoices to export
    if serializer.validated_data.get('batch_id'):
        invoices = Invoice.objects.filter(
            metadata__batch_id=serializer.validated_data['batch_id']
        ).select_related('client', 'fee_structure')
    else:
        invoices = Invoice.objects.filter(
            id__in=serializer.validated_data['invoice_ids']
        ).select_related('client', 'fee_structure')
    
    if not invoices.exists():
        return Response(
            {'error': 'No invoices found'},
            status=status.HTTP_404_NOT_FOUND
        )
    
    try:
        # Create ZIP file in memory
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for invoice in invoices:
                # Generate PDF for each invoice
                pdf_content = BulkInvoiceService.generate_invoice_pdf(invoice)
                
                # Add to ZIP with student ID and invoice number in filename
                filename = f"{invoice.client.client_id}_{invoice.invoice_number}.pdf"
                zip_file.writestr(filename, pdf_content)
        
        # Prepare response
        zip_buffer.seek(0)
        
        batch_id = serializer.validated_data.get('batch_id', 'custom')
        response = HttpResponse(zip_buffer.getvalue(), content_type='application/zip')
        response['Content-Disposition'] = f'attachment; filename="invoices_{batch_id}.zip"'
        
        return response
        
    except Exception as e:
        logger.error(f"PDF export failed: {str(e)}")
        return Response(
            {'error': f'PDF generation failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@action(detail=True, methods=['get'])
def download_pdf(self, request, pk=None):
    """
    Download single invoice as PDF
    
    GET /api/incomes/invoices/{id}/download_pdf/
    """
    invoice = self.get_object()
    
    try:
        pdf_content = BulkInvoiceService.generate_invoice_pdf(invoice)
        
        response = HttpResponse(pdf_content, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{invoice.invoice_number}.pdf"'
        
        return response
        
    except Exception as e:
        logger.error(f"PDF generation failed for invoice {invoice.id}: {str(e)}")
        return Response(
            {'error': f'PDF generation failed: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
```

---

### 1.4 PDF Generation Support

Add to `BulkInvoiceService`:

```python
@staticmethod
def generate_invoice_pdf(invoice: Invoice) -> bytes:
    """
    Generate PDF for a single invoice
    Uses existing reports/pdf_generators infrastructure
    """
    from reports.pdf_generators.base import SchoolInvoicePDFGenerator
    
    generator = SchoolInvoicePDFGenerator()
    pdf_content = generator.generate(invoice)
    
    return pdf_content
```

**Note:** Create `reports/pdf_generators/school_invoice.py` similar to existing PDF generators (purchase_order.py, etc.)

---

### Phase 2: Automated Triggering

### 2.1 Scheduled Task for Auto-Generation

**Location:** `incomes/tasks.py`

```python
# incomes/tasks.py
from celery import shared_task
from django.utils import timezone
from incomes.models_calendar import AcademicTerm
from clients.models import ClientClassification
from incomes.models import FeeStructure
from incomes.services.bulk_invoice_service import BulkInvoiceService
import logging

logger = logging.getLogger(__name__)


@shared_task
def check_and_generate_term_invoices():
    """
    Daily task to check if invoices should be generated for any terms
    Runs every day at midnight
    """
    today = timezone.now().date()
    
    # Find terms where invoice_generation_date is today
    terms_to_process = AcademicTerm.objects.filter(
        invoice_generation_date=today,
        is_active=True
    )
    
    for term in terms_to_process:
        logger.info(f"Auto-generating invoices for {term.name}")
        
        try:
            # Get all classifications (classes) for this branch
            classifications = ClientClassification.objects.filter(
                branch=term.branch,
                owner=term.owner
            )
            
            for classification in classifications:
                # Get fee structure for this classification
                # Assuming metadata has fee_structure_id or we use default
                fee_structure_id = classification.special_rates.get('fee_structure_id')
                
                if not fee_structure_id:
                    logger.warning(f"No fee structure configured for {classification.name}")
                    continue
                
                fee_structure = FeeStructure.objects.get(id=fee_structure_id)
                
                # Generate batch
                result = BulkInvoiceService.generate_batch_for_term(
                    academic_term=term,
                    classification=classification,
                    fee_structure=fee_structure,
                    created_by=term.owner,
                    auto_approve=False  # Always require approval for auto-generated
                )
                
                logger.info(
                    f"Generated {result['invoices_generated']} invoices for "
                    f"{classification.name} - {term.name}"
                )
                
        except Exception as e:
            logger.error(f"Failed to auto-generate for {term.name}: {str(e)}")
```

**Setup in Celery Beat Schedule:**

```python
# phoenix/celery.py or settings
from celery.schedules import crontab

app.conf.beat_schedule = {
    'check-term-invoice-generation': {
        'task': 'incomes.tasks.check_and_generate_term_invoices',
        'schedule': crontab(hour=0, minute=0),  # Midnight daily
    },
}
```

---

### Phase 3: Approval Workflow Integration

### 3.1 Workflow Template

**Location:** `automations/workflow_definitions/school_invoice_approval.py`

```python
# automations/workflow_definitions/school_invoice_approval.py

INVOICE_APPROVAL_WORKFLOW = {
    "name": "School Invoice Batch Approval",
    "description": "Approval workflow for bulk-generated student invoices",
    "workflow_definition": {
        "steps": [
            {
                "id": "notify_approver",
                "type": "notification",
                "config": {
                    "recipient_role": "finance_manager",
                    "message": "New invoice batch {batch_id} requires approval. Total: {total_amount} for {total_invoices} students.",
                    "channel": "system"
                },
                "next": "wait_approval"
            },
            {
                "id": "wait_approval",
                "type": "approval",
                "config": {
                    "approver_role": "finance_manager",
                    "timeout_days": 3,
                    "approval_required": True,
                    "rejection_allowed": True
                },
                "on_approve": "approve_invoices",
                "on_reject": "reject_invoices"
            },
            {
                "id": "approve_invoices",
                "type": "transaction",
                "config": {
                    "action": "approve_invoice_batch",
                    "batch_id": "{batch_id}"
                },
                "next": "notify_completion"
            },
            {
                "id": "reject_invoices",
                "type": "transaction",
                "config": {
                    "action": "reject_invoice_batch",
                    "batch_id": "{batch_id}"
                },
                "next": "notify_rejection"
            },
            {
                "id": "notify_completion",
                "type": "notification",
                "config": {
                    "recipient": "creator",
                    "message": "Invoice batch {batch_id} has been approved. Invoices are now receivables.",
                    "channel": "system"
                }
            },
            {
                "id": "notify_rejection",
                "type": "notification",
                "config": {
                    "recipient": "creator",
                    "message": "Invoice batch {batch_id} was rejected. Reason: {rejection_reason}",
                    "channel": "system"
                }
            }
        ]
    }
}
```

---

### Phase 4: Invoice-as-Entitlement for Inventory

### 4.1 Service Method

Already exists in `inventory` views! The invoice code/number can be used to redeem items.

**Key Integration Point:** When invoice status changes to 'paid', the `invoice_number` becomes the redemption code for inventory items.

```python
# This already exists in your inventory system
@action(detail=True, methods=['post'])
def redeem_by_invoice(self, request, pk=None):
    """
    Redeem inventory items using invoice number
    
    POST /api/inventory/allocations/{id}/redeem_by_invoice/
    Body: {
        "invoice_number": "INV-STU-001-T1-20260118"
    }
    """
    allocation = self.get_object()
    invoice_number = request.data.get('invoice_number')
    
    # Verify invoice is paid
    try:
        invoice = Invoice.objects.get(
            invoice_number=invoice_number,
            client=allocation.client,
            status='paid'
        )
    except Invoice.DoesNotExist:
        return Response(
            {'error': 'Invoice not found or not paid'},
            status=status.HTTP_400_BAD_REQUEST
        )
    
    # Redeem items
    allocation.redeem(redeemed_by=request.user)
    
    return Response({
        'status': 'redeemed',
        'invoice_number': invoice_number,
        'items': allocation.items_data
    })
```

---

## Complete API Reference

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/incomes/invoices/generate_bulk/` | Generate invoices for entire class |
| GET | `/api/incomes/invoices/batch_summary/?batch_id=XXX` | Get batch summary for approval |
| POST | `/api/incomes/invoices/approve_batch/` | Approve batch → become receivables |
| POST | `/api/incomes/invoices/reject_batch/` | Reject batch → cancel invoices |
| POST | `/api/incomes/invoices/export_bulk_pdf/` | Export batch as ZIP of PDFs |
| GET | `/api/incomes/invoices/{id}/download_pdf/` | Download single invoice PDF |

---

## Complete Workflow Example

### Scenario: First Term 2026 Invoice Generation

**Step 1: Configure Academic Term**

```bash
POST /api/incomes/academic-terms/
{
  "academic_year": 1,
  "name": "First Term",
  "code": "T1",
  "term_number": "first",
  "start_date": "2026-01-20",
  "end_date": "2026-04-10",
  "invoice_generation_date": "2026-01-15",  # Auto-generate 5 days before term
  "payment_due_date": "2026-02-01"
}
```

**Step 2: Generate Invoices for Primary 1A**

```bash
POST /api/incomes/invoices/generate_bulk/
{
  "academic_term_id": 1,
  "classification_id": 5,  # Primary 1A
  "fee_structure_id": 10,  # Primary school fees
  "auto_approve": false,
  "notes": "First term 2026 - Primary 1A"
}

# Response:
{
  "batch_id": "BATCH-T1-P1A-20260115143022",
  "total_students": 45,
  "invoices_generated": 45,
  "total_amount": "2250000.00",
  "status": "pending_approval",
  "workflow_run_id": 123,
  "academic_term": {
    "id": 1,
    "name": "First Term",
    "code": "T1"
  },
  "classification": {
    "id": 5,
    "name": "Primary 1A",
    "code": "P1A"
  }
}
```

**Step 3: Review Batch Summary**

```bash
GET /api/incomes/invoices/batch_summary/?batch_id=BATCH-T1-P1A-20260115143022

# Response:
{
  "batch_id": "BATCH-T1-P1A-20260115143022",
  "total_invoices": 45,
  "total_amount": "2250000.00",
  "status_breakdown": {
    "Draft": 45
  },
  "sample_invoices": [
    {
      "invoice_number": "INV-STU-001-T1-...",
      "student_id": "STU-00001",
      "student_name": "John Doe",
      "amount": "50000.00",
      "status": "draft"
    },
    // ...4 more samples
  ]
}
```

**Step 4: Approve Batch**

```bash
POST /api/incomes/invoices/approve_batch/
{
  "batch_id": "BATCH-T1-P1A-20260115143022",
  "notes": "Reviewed and approved for First Term 2026"
}

# Response:
{
  "approved_count": 45,
  "total_amount": "2250000.00",
  "status": "success",
  "batch_id": "BATCH-T1-P1A-20260115143022"
}
```

**Step 5: Export PDFs**

```bash
POST /api/incomes/invoices/export_bulk_pdf/
{
  "batch_id": "BATCH-T1-P1A-20260115143022",
  "export_format": "zip"
}

# Downloads: invoices_BATCH-T1-P1A-20260115143022.zip
# Contains: STU-00001_INV-STU-001-T1-....pdf (45 files)
```

**Step 6: Student Pays**

```bash
POST /api/incomes/invoices/{invoice_id}/record_payment/
{
  "amount": "50000.00",
  "payment_method": "bank_transfer"
}

# Invoice status → 'paid'
```

**Step 7: Student Redeems Books**

```bash
POST /api/inventory/allocations/{allocation_id}/redeem_by_invoice/
{
  "invoice_number": "INV-STU-001-T1-20260115143022015"
}

# Books released from inventory
```

---

## Implementation Checklist

### Phase 1: Bulk Generation (Priority 1)
- [ ] Create `incomes/services/bulk_invoice_service.py`
- [ ] Create `incomes/serializers_bulk.py`
- [ ] Add viewset actions to `InvoiceViewSet`
- [ ] Test bulk generation endpoint
- [ ] Test batch summary endpoint
- [ ] Test approve/reject endpoints

### Phase 2: PDF Export (Priority 2)
- [ ] Create `reports/pdf_generators/school_invoice.py`
- [ ] Create invoice PDF template in `reports/templates/pdf/`
- [ ] Implement single PDF download
- [ ] Implement bulk ZIP export
- [ ] Test PDF generation

### Phase 3: Automated Triggering (Priority 3)
- [ ] Create Celery task in `incomes/tasks.py`
- [ ] Configure Celery beat schedule
- [ ] Add fee_structure_id to classification metadata
- [ ] Test automated generation

### Phase 4: Approval Workflow (Priority 4)
- [ ] Create workflow template definition
- [ ] Create approval step handler
- [ ] Integrate with bulk generation service
- [ ] Test workflow execution

### Phase 5: Testing & Documentation
- [ ] Write unit tests for BulkInvoiceService
- [ ] Write integration tests for workflow
- [ ] Test end-to-end scenarios
- [ ] Update API documentation
- [ ] Create frontend integration guide

---

## Frontend Requirements

### New UI Components Needed

1. **Bulk Invoice Generation Page**
   - Academic term selector
   - Classification (class) selector
   - Fee structure selector
   - Preview button
   - Generate button
   - Progress indicator

2. **Batch Approval Dashboard**
   - List of pending batches
   - Batch summary modal
   - Sample invoice preview
   - Approve/Reject buttons

3. **Batch Management Page**
   - List all batches (approved, pending, rejected)
   - Filter by status, term, classification
   - Bulk PDF download button
   - View invoices in batch

4. **Invoice List Enhancements**
   - Batch ID column
   - Bulk select for PDF export
   - Status indicators

---

## Summary

### ✅ What We're Adding

1. **Bulk Invoice Generation** - Generate invoices for entire classes
2. **Approval Workflow** - Review and approve batches before they become receivables
3. **Automated Triggering** - Auto-generate based on term dates
4. **Bulk PDF Export** - Download ZIP of invoices for a class
5. **Invoice-as-Entitlement** - Already exists! Invoice number used for inventory redemption

### 🎯 Key Benefits

- Reduce manual work (45 invoices → 1 batch operation)
- Quality control via approval workflow
- Flexible timing (Nigerian school system supported)
- Easy distribution (bulk PDFs)
- Integrated with existing systems (inventory, discounts, accounting)

### 📅 Estimated Implementation Time

- Phase 1 (Core): 2-3 days
- Phase 2 (PDF): 1-2 days
- Phase 3 (Auto): 1 day
- Phase 4 (Workflow): 1-2 days
- Testing: 2 days

**Total: 1-2 weeks**

---

## Next Steps

1. Review and approve this architecture
2. Prioritize phases (can start with Phase 1 only)
3. Implement `BulkInvoiceService`
4. Add API endpoints
5. Test with sample data
6. Move to Phase 2 (PDF) or Phase 3 (automation)

**Ready to start implementation?** 🚀
