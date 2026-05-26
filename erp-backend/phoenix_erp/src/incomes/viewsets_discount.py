# incomes/viewsets_discount.py
"""
ViewSets for discount, scholarship, and waiver system
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter

from common.views import ScopedModelViewSet
from incomes.models_discount import DiscountProgram, DiscountApplication, AppliedDiscount
from incomes.serializers_discount import (
    DiscountProgramSerializer,
    DiscountApplicationSerializer,
    DiscountApplicationApprovalSerializer,
    DiscountApplicationRejectionSerializer,
    AppliedDiscountSerializer,
    ApplyDiscountSerializer,
    ReverseDiscountSerializer,
    ClientDiscountSummarySerializer
)
from incomes.services.discount_service import DiscountService
import logging

logger = logging.getLogger(__name__)


class DiscountProgramViewSet(ScopedModelViewSet):
    """
    ViewSet for managing discount programs
    
    Custom actions:
    - eligibility/{id}: Check eligibility for a program
    - budget/{id}: Get budget details
    - statistics/{id}: Get detailed statistics
    """
    queryset = DiscountProgram.objects.all()
    serializer_class = DiscountProgramSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['program_type', 'discount_type', 'is_active']
    search_fields = ['name', 'program_code', 'description']
    ordering_fields = ['name', 'program_code', 'start_date', 'budget_used']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter programs by status if requested"""
        queryset = super().get_queryset()
        
        # Filter by validity
        only_valid = self.request.query_params.get('only_valid')
        if only_valid == 'true':
            from django.utils import timezone
            now = timezone.now().date()
            queryset = queryset.filter(
                is_active=True,
                start_date__lte=now
            ).filter(
                Q(end_date__gte=now) | Q(end_date__isnull=True)
            )
        
        # Filter by budget availability
        has_budget = self.request.query_params.get('has_budget')
        if has_budget == 'true':
            queryset = [p for p in queryset if p.is_within_budget]
        
        return queryset
    
    @action(detail=True, methods=['get'])
    def eligibility(self, request, pk=None):
        """
        Check eligibility criteria for a program
        
        GET /discount-programs/{id}/eligibility/
        """
        program = self.get_object()
        
        return Response({
            'program_code': program.program_code,
            'program_name': program.name,
            'eligibility_criteria': program.eligibility_criteria,
            'requires_approval': program.requires_approval,
            'is_active': program.is_active,
            'is_valid': program.is_valid,
            'has_budget': program.is_within_budget,
            'has_capacity': program.has_recipient_capacity,
            'can_accept_applications': (
                program.is_active and 
                program.is_valid and 
                program.is_within_budget and 
                program.has_recipient_capacity
            )
        })
    
    @action(detail=True, methods=['get'])
    def budget(self, request, pk=None):
        """
        Get budget details for a program
        
        GET /discount-programs/{id}/budget/
        """
        program = self.get_object()
        
        return Response({
            'program_code': program.program_code,
            'program_name': program.name,
            'budget_allocated': program.budget_allocated,
            'budget_used': program.budget_used,
            'budget_remaining': program.budget_remaining,
            'budget_utilization_percent': float(program.budget_utilization_percent),
            'is_within_budget': program.is_within_budget,
        })
    
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Get detailed statistics for a program
        
        GET /discount-programs/{id}/statistics/
        """
        program = self.get_object()
        stats = DiscountService.get_program_statistics(program)
        
        return Response(stats)
    
    @action(detail=True, methods=['post'])
    def preview_impact(self, request, pk=None):
        """
        Preview discount impact for a classification/class
        
        POST /discount-programs/{id}/preview-impact/
        Body: {
            "classification_code": "P1A",
            "academic_term_id": 1
        }
        """
        from incomes.services.discount_workflow_service import DiscountWorkflowService
        
        program = self.get_object()
        
        classification_code = request.data.get('classification_code')
        academic_term_id = request.data.get('academic_term_id')
        
        if not classification_code or not academic_term_id:
            return Response(
                {'error': 'classification_code and academic_term_id are required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        preview = DiscountWorkflowService.get_discount_preview(
            program=program,
            client_classification_code=classification_code,
            academic_term_id=academic_term_id
        )
        
        return Response(preview)
    
    @action(detail=True, methods=['post'])
    def validate_workflow(self, request, pk=None):
        """
        Validate eligibility workflow configuration
        
        POST /discount-programs/{id}/validate-workflow/
        """
        from incomes.services.discount_workflow_service import DiscountWorkflowService
        
        program = self.get_object()
        
        if not program.eligibility_workflow:
            return Response({
                'valid': True,
                'message': 'No eligibility workflow configured'
            })
        
        workflow_definition = program.eligibility_workflow.workflow_definition
        errors = DiscountWorkflowService.validate_workflow_steps(workflow_definition)
        
        if errors:
            return Response({
                'valid': False,
                'errors': errors
            }, status=status.HTTP_400_BAD_REQUEST)
        
        return Response({
            'valid': True,
            'message': 'Workflow configuration is valid',
            'step_count': len(workflow_definition.get('steps', []))
        })
    
    @action(detail=False, methods=['get'])
    def available_workflows(self, request):
        """
        Get list of available workflows that can be attached to discount programs
        
        GET /discount-programs/available-workflows/
        """
        from automations.models import WorkflowTemplate
        
        # Get workflows without transaction steps
        workflows = WorkflowTemplate.objects.filter(
            owner=request.user,
            is_deleted=False
        )
        
        valid_workflows = []
        for workflow in workflows:
            if not workflow.workflow_definition:
                continue
            
            steps = workflow.workflow_definition.get('steps', [])
            has_transaction = any(
                step.get('type') == 'transaction' for step in steps
            )
            
            if not has_transaction:
                valid_workflows.append({
                    'id': workflow.id,
                    'name': workflow.name,
                    'description': workflow.description or '',
                    'step_count': len(steps)
                })
        
        return Response({
            'workflows': valid_workflows,
            'count': len(valid_workflows)
        })


class DiscountApplicationViewSet(ScopedModelViewSet):
    """
    ViewSet for managing discount applications
    
    Custom actions:
    - submit/{id}: Submit draft application
    - approve/{id}: Approve application
    - reject/{id}: Reject application
    - revoke/{id}: Revoke approved application
    - my-applications/: Get current user's applications
    """
    queryset = DiscountApplication.objects.select_related(
        'program', 'client', 'reviewed_by'
    ).all()
    serializer_class = DiscountApplicationSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['status', 'program', 'client']
    search_fields = ['application_number', 'client__name', 'program__name']
    ordering_fields = ['application_date', 'review_date', 'status']
    ordering = ['-application_date']
    
    def get_queryset(self):
        """Filter applications by status"""
        queryset = super().get_queryset()
        
        # Filter by active status
        only_active = self.request.query_params.get('only_active')
        if only_active == 'true':
            queryset = [app for app in queryset if app.is_active]
        
        # Filter pending approvals
        pending = self.request.query_params.get('pending')
        if pending == 'true':
            queryset = queryset.filter(
                status__in=['submitted', 'under_review']
            )
        
        return queryset
    
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        """
        Submit a draft application
        
        POST /discount-applications/{id}/submit/
        """
        application = self.get_object()
        
        try:
            application.submit()
            serializer = self.get_serializer(application)
            return Response(serializer.data)
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['get'])
    def preview_impact(self, request, pk=None):
        """
        Preview the financial impact of approving this application
        Shows which receivables would be affected and total discount amount
        
        GET /discount-applications/{id}/preview-impact/
        """
        application = self.get_object()
        
        # Get client's eligible receivables
        from receivables.models import CustomerReceivable
        from django.db.models import Sum
        
        receivables = CustomerReceivable.objects.filter(
            client=application.client,
            status__in=['pending', 'partial']
        )
        
        # Calculate potential discount for each receivable
        preview_items = []
        total_discount = 0
        
        for receivable in receivables:
            # Check if discount already applied
            already_applied = AppliedDiscount.objects.filter(
                application=application,
                receivable=receivable,
                is_reversed=False
            ).exists()
            
            if already_applied:
                continue
            
            discount_amount = DiscountService.calculate_discount_amount(
                program=application.program,
                application=application,
                receivable=receivable
            )
            
            total_discount += discount_amount
            
            preview_items.append({
                'receivable_id': receivable.id,
                'receivable_reference': receivable.reference_number,
                'receivable_type': receivable.receivable_type,
                'original_amount': str(receivable.original_amount),
                'current_balance': str(receivable.balance),
                'discount_amount': str(discount_amount),
                'balance_after_discount': str(receivable.balance - discount_amount)
            })
        
        return Response({
            'application_id': application.id,
            'application_number': application.application_number,
            'client_id': application.client.id,
            'client_name': application.client.name,
            'program_name': application.program.name,
            'discount_type': application.program.discount_type,
            'discount_value': str(application.actual_discount_value),
            'total_receivables_affected': len(preview_items),
            'total_discount_amount': str(total_discount),
            'program_budget_remaining': str(application.program.budget_remaining),
            'sufficient_budget': total_discount <= application.program.budget_remaining or application.program.budget_allocated == 0,
            'receivables': preview_items
        })
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve an application
        
        POST /discount-applications/{id}/approve/
        Body: {
            "effective_from": "2026-01-01",
            "effective_to": "2026-12-31",  # optional
            "review_notes": "Approved for academic excellence",
            "custom_discount_value": 80  # optional override
        }
        
        Response includes:
        - Application details
        - auto_apply_task_id: Celery task ID for tracking background discount application
        - auto_apply_status: 'queued' (discounts being applied in background)
        
        Discounts are automatically applied to all eligible receivables
        for the client asynchronously after approval.
        """
        application = self.get_object()
        serializer = DiscountApplicationApprovalSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                application.approve(
                    approved_by=request.user,
                    effective_from=serializer.validated_data['effective_from'],
                    effective_to=serializer.validated_data.get('effective_to'),
                    notes=serializer.validated_data.get('review_notes', '')
                )
                
                # Update custom discount value if provided
                custom_value = serializer.validated_data.get('custom_discount_value')
                if custom_value:
                    application.custom_discount_value = custom_value
                    application.save()
                
                response_serializer = self.get_serializer(application)
                
                # Queue async task to auto-apply discounts (non-blocking)
                from incomes.tasks import auto_apply_discounts_after_approval
                task = auto_apply_discounts_after_approval.delay(
                    application_id=application.id,
                    user_id=request.user.id
                )
                
                # Return approval result with task ID for tracking
                data = response_serializer.data
                data['auto_apply_task_id'] = task.id
                data['auto_apply_status'] = 'queued'
                data['message'] = (
                    'Application approved. Discounts are being applied '
                    'automatically in the background.'
                )
                
                logger.info(
                    f"Queued auto-apply task {task.id} for application "
                    f"{application.application_number}"
                )
                
                return Response(data)
                
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """
        Reject an application
        
        POST /discount-applications/{id}/reject/
        Body: {
            "review_notes": "Does not meet GPA requirement"
        }
        """
        application = self.get_object()
        serializer = DiscountApplicationRejectionSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                application.reject(
                    rejected_by=request.user,
                    notes=serializer.validated_data['review_notes']
                )
                
                response_serializer = self.get_serializer(application)
                return Response(response_serializer.data)
                
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def revoke(self, request, pk=None):
        """
        Revoke an approved application
        
        POST /discount-applications/{id}/revoke/
        Body: {
            "review_notes": "Student failed courses"
        }
        """
        application = self.get_object()
        serializer = DiscountApplicationRejectionSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                application.revoke(
                    revoked_by=request.user,
                    notes=serializer.validated_data['review_notes']
                )
                
                response_serializer = self.get_serializer(application)
                return Response(response_serializer.data)
                
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'])
    def my_applications(self, request):
        """
        Get applications for current user's client
        
        GET /discount-applications/my-applications/
        """
        # Assuming user has a related client profile
        # Adjust based on your user-client relationship
        client = getattr(request.user, 'client_profile', None)
        
        if not client:
            return Response(
                {'error': 'No client profile found for current user'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        applications = self.get_queryset().filter(client=client)
        
        page = self.paginate_queryset(applications)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        
        serializer = self.get_serializer(applications, many=True)
        return Response(serializer.data)


class AppliedDiscountViewSet(ScopedModelViewSet):
    """
    ViewSet for managing applied discounts
    
    Custom actions:
    - apply/: Apply discount to receivable
    - reverse/{id}: Reverse applied discount
    - client-summary/: Get discount summary for client
    """
    queryset = AppliedDiscount.objects.select_related(
        'application', 'application__program', 'application__client',
        'receivable', 'posted_by', 'reversed_by'
    ).all()
    serializer_class = AppliedDiscountSerializer
    permission_classes = [IsAuthenticated]
    # Ensure lookup values are numeric so list-level action names
    # like 'auto-apply' are not mistaken for a detail lookup.
    lookup_value_regex = r"\d+"
    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    filterset_fields = ['is_posted', 'is_reversed', 'application', 'receivable']
    search_fields = [
        'application__application_number',
        'application__client__name',
        'application__program__name'
    ]
    ordering_fields = ['created_at', 'posted_at', 'discount_amount']
    ordering = ['-created_at']
    
    def get_queryset(self):
        """Filter by client or program if requested"""
        queryset = super().get_queryset()
        
        # Filter by client
        client_id = self.request.query_params.get('client_id')
        if client_id:
            queryset = queryset.filter(application__client_id=client_id)
        
        # Filter by program
        program_id = self.request.query_params.get('program_id')
        if program_id:
            queryset = queryset.filter(application__program_id=program_id)
        
        # Filter unposted only
        unposted = self.request.query_params.get('unposted')
        if unposted == 'true':
            queryset = queryset.filter(is_posted=False)
        
        return queryset
    
    @action(detail=False, methods=['post'])
    def apply(self, request):
        """
        Apply discount to a receivable
        
        POST /applied-discounts/apply/
        Body: {
            "application_id": 1,
            "receivable_id": 123
        }
        """
        serializer = ApplyDiscountSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            try:
                applied_discount = serializer.save()
                response_serializer = self.get_serializer(applied_discount)
                return Response(
                    response_serializer.data,
                    status=status.HTTP_201_CREATED
                )
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'])
    def reverse(self, request, pk=None):
        """
        Reverse an applied discount
        
        POST /applied-discounts/{id}/reverse/
        Body: {
            "reason": "Student lost scholarship due to failing grades"
        }
        """
        applied_discount = self.get_object()
        serializer = ReverseDiscountSerializer(data=request.data)
        
        if serializer.is_valid():
            try:
                applied_discount.reverse(
                    user=request.user,
                    reason=serializer.validated_data['reason']
                )
                
                response_serializer = self.get_serializer(applied_discount)
                return Response(response_serializer.data)
                
            except Exception as e:
                return Response(
                    {'error': str(e)},
                    status=status.HTTP_400_BAD_REQUEST
                )
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def client_summary(self, request):
        """
        Get discount summary for a client
        
        POST /applied-discounts/client-summary/
        Body: {
            "client_id": 123
        }
        """
        serializer = ClientDiscountSummarySerializer(data=request.data)
        
        if serializer.is_valid():
            summary = serializer.to_representation(serializer.validated_data)
            return Response(summary)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'])
    def auto_apply(self, request):
        """
        Automatically apply discounts to client's receivables
        
        POST /applied-discounts/auto-apply/
        Body: {
            "client_id": 123
        }
        """
        from clients.models import Client
        
        client_id = request.data.get('client_id')
        if not client_id:
            return Response(
                {'error': 'client_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            client = Client.objects.get(id=client_id)
        except Client.DoesNotExist:
            return Response(
                {'error': f'Client {client_id} not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        try:
            applied_discounts = DiscountService.auto_apply_to_client_receivables(
                client=client,
                user=request.user
            )
            
            serializer = self.get_serializer(applied_discounts, many=True)
            return Response({
                'count': len(applied_discounts),
                'applied_discounts': serializer.data
            })
            
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
