"""
API views for expense management
"""
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from decimal import Decimal, ROUND_HALF_UP
import logging

logger = logging.getLogger(__name__)

from .models import (
    Expense, ExpenseCategory, Resource, 
    PrepaidVoucher, ResourceConsumption
)
from common.views import ScopedModelViewSet
from common.approval_permissions import IsApprover
from common.services.reference_service import ReferenceService
from common.models import ReferenceTracking
from automations.models import WorkflowTemplate, WorkflowRun


class ExpenseViewSet(ScopedModelViewSet):
    """
    API endpoint for expenses
    """
    permission_module = 'expenses'
    permission_page = 'expenses'
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('approve', 'reject'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()
    
    def get_queryset(self):
        return Expense.objects.filter(
            branch=self.request.user.branch
        )
    
    def get_serializer_class(self):
        # You should create ExpenseSerializer
        from rest_framework import serializers
        
        class ExpenseSerializer(serializers.ModelSerializer):
            class Meta:
                model = Expense
                fields = '__all__'
        
        return ExpenseSerializer
    
    @action(detail=False, methods=['post'])
    def create_with_workflow(self, request):
        """
        Create an expense request and trigger approval workflow.
        
        POST /api/expenses/create_with_workflow/
        
        Body:
        {
            "expense_type": "direct_cash",
            "category_id": 1,
            "amount": 250.50,
            "description": "Office supplies purchase",
            "expense_date": "2026-01-03",
            "payment_method": "cash",
            "receipt_number": "RCP-001",
            "tax_amount": 12.50
        }
        
        Returns:
        {
            "success": true,
            "expense_id": 789,
            "expense_reference": "EXP-2026-0001",
            "workflow_run_id": 456,
            "status": "submitted",
            "total_amount": 263.00
        }
        """
        try:
            with transaction.atomic():
                # Get user's tenant and branch
                tenant = request.user.tenant
                branch = getattr(request.user, 'branch', None)
                
                # Parse amounts
                subtotal = Decimal(str(request.data.get('amount', 0)))
                tax_amount = Decimal(str(request.data.get('tax_amount', 0)))
                total_amount = subtotal + tax_amount
                
                # Create Expense
                expense_data = {
                    'expense_type': request.data.get('expense_type', 'direct_cash'),
                    'category_id': request.data.get('category_id'),
                    'amount': subtotal,
                    'description': request.data.get('description'),
                    'expense_date': request.data.get('expense_date', timezone.now().date()),
                    'payment_method': request.data.get('payment_method', 'cash'),
                    'receipt_number': request.data.get('receipt_number', ''),
                    'subtotal': subtotal,
                    'tax_amount_field': tax_amount,
                    'total_amount': total_amount,
                    'status': 'submitted',
                    'tenant': tenant,
                    'branch': branch,
                    'created_by': request.user
                }
                
                expense = Expense.objects.create(**expense_data)
                
                # Generate reference number
                reference = ReferenceService.generate_reference(
                    module='expenses',
                    model_name='expense',
                    tenant=tenant,
                    branch=branch
                )
                
                # Register reference
                ReferenceService.register_reference(
                    reference_number=reference,
                    module='expenses',
                    model_name='expense',
                    object_id=expense.id,
                    origin_reference=reference,
                    parent_reference=request.data.get('parent_reference'),  # If initiated from PO
                    workflow_run=None,  # Will be set when workflow starts
                    status='submitted',
                    amount=total_amount,
                    metadata={
                        'expense_type': expense_data['expense_type'],
                        'payment_method': expense_data['payment_method'],
                        'receipt_number': expense_data['receipt_number']
                    },
                    tenant=tenant,
                    branch=branch,
                    created_by=request.user
                )
                
                # Update expense with reference
                expense.origin_reference = reference
                if request.data.get('parent_reference'):
                    expense.parent_reference = request.data.get('parent_reference')
                expense.save()
                
                # Get workflow template
                try:
                    workflow_template = WorkflowTemplate.objects.get(
                        name='ExpenseApprovalDirect',
                        is_active=True
                    )
                except WorkflowTemplate.DoesNotExist:
                    return Response(
                        {
                            'success': False,
                            'message': 'Expense approval workflow template not found. Please run setup_expense_workflow command.'
                        },
                        status=status.HTTP_500_INTERNAL_SERVER_ERROR
                    )
                
                # Create workflow run
                workflow_run = WorkflowRun.objects.create(
                    template=workflow_template,
                    tenant=tenant,
                    branch=branch,
                    triggered_by=request.user,
                    status='running',
                    context_data={
                        'expense_id': expense.id,
                        'reference_number': reference,
                        'total_amount': str(total_amount),
                        'expense_type': expense_data['expense_type'],
                        'category_id': expense_data['category_id']
                    }
                )
                
                # Update expense with workflow_run
                expense.workflow_run = workflow_run
                expense.save()
                
                # Update reference tracking with workflow_run
                ReferenceService.update_status(reference, 'submitted')
                ref_tracking = ReferenceTracking.objects.get(reference_number=reference)
                ref_tracking.workflow_run = workflow_run
                ref_tracking.save()
                
                # Start workflow execution
                workflow_run.start_execution()

                # Notify staff with approval permissions about the new expense
                try:
                    from notifications.services import NotificationService
                    from django.contrib.auth import get_user_model
                    User = get_user_model()
                    notification_service = NotificationService()
                    # Find users who can approve expenses (is_staff or superuser in same branch)
                    approvers = User.objects.filter(
                        branch=branch,
                        is_active=True,
                        is_staff=True,
                    ).exclude(pk=request.user.pk)
                    submitter_name = request.user.get_full_name() or request.user.username
                    for approver in approvers[:5]:  # Cap at 5 to avoid spam
                        notification_service.send_from_template(
                            template_code='expense_submitted',
                            recipient=approver,
                            context={
                                'expense_reference': reference,
                                'submitted_by': submitter_name,
                                'amount': str(total_amount),
                                'description': expense.description or '',
                            },
                            owner=request.user,
                            branch=branch,
                            related_object=expense,
                            channels=['in_app'],
                        )
                except Exception as e:
                    logger.warning(f"Expense submission notification failed (non-blocking): {e}")

                return Response({
                    'success': True,
                    'expense_id': expense.id,
                    'expense_reference': reference,
                    'workflow_run_id': workflow_run.id,
                    'status': expense.status,
                    'total_amount': total_amount,
                    'message': 'Expense request created and workflow started'
                })
                
        except Exception as e:
            return Response(
                {
                    'success': False,
                    'message': f'Error creating expense with workflow: {str(e)}'
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """Approve a submitted expense."""
        expense = self.get_object()
        if expense.status != 'submitted':
            return Response(
                {'error': 'Only submitted expenses can be approved'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        expense.is_approved = True
        expense.approved_by = request.user
        expense.approved_at = timezone.now()
        expense.status = 'approved'
        expense.save(update_fields=['is_approved', 'approved_by', 'approved_at', 'status'])

        # Notify the expense creator
        try:
            from notifications.services import NotificationService
            notification_service = NotificationService()
            creator = expense.created_by or getattr(expense, 'owner', None)
            if creator and creator != request.user:
                notification_service.send_from_template(
                    template_code='expense_approved',
                    recipient=creator,
                    context={
                        'expense_reference': expense.origin_reference or str(expense.pk),
                        'approved_by': request.user.get_full_name() or request.user.username,
                        'amount': str(expense.total_amount),
                    },
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    related_object=expense,
                    channels=['in_app'],
                )
        except Exception as e:
            logger.warning(f"Expense approval notification failed (non-blocking): {e}")

        return Response({
            'success': True,
            'message': 'Expense approved',
            'expense': self.get_serializer(expense).data,
        })

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        """Reject a submitted expense."""
        expense = self.get_object()
        if expense.status != 'submitted':
            return Response(
                {'error': 'Only submitted expenses can be rejected'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        reason = request.data.get('reason', '')
        expense.status = 'rejected'
        expense.save(update_fields=['status'])

        # Notify the expense creator
        try:
            from notifications.services import NotificationService
            notification_service = NotificationService()
            creator = expense.created_by or getattr(expense, 'owner', None)
            if creator and creator != request.user:
                notification_service.send_from_template(
                    template_code='expense_rejected',
                    recipient=creator,
                    context={
                        'expense_reference': expense.origin_reference or str(expense.pk),
                        'rejected_by': request.user.get_full_name() or request.user.username,
                        'reason': reason,
                    },
                    owner=request.user,
                    branch=getattr(request.user, 'branch', None),
                    related_object=expense,
                    channels=['in_app'],
                )
        except Exception as e:
            logger.warning(f"Expense rejection notification failed (non-blocking): {e}")

        return Response({
            'success': True,
            'message': 'Expense rejected',
            'expense': self.get_serializer(expense).data,
        })

class ResourceConsumptionViewSet(ScopedModelViewSet):
    """
    API endpoint for resource consumption tracking
    Supports both prepaid (voucher-based) and postpaid (direct billing) flows
    
    Features:
    - CRUD operations for consumption records
    - Automatic irregularity detection
    - Approval workflow for flagged consumptions
    - Posting to accounting (prepaid amortization or postpaid accrual)
    - Asset consumption analytics
    """
    permission_module = 'expenses'
    permission_page = 'resource-consumption'
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in ('approve', 'approve_consumption', 'reject_consumption'):
            return [IsAuthenticated(), IsApprover()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = ResourceConsumption.objects.filter(
            branch=self.request.user.branch
        ).select_related(
            'prepaid_voucher',
            'supplier',
            'asset',
            'employee',
            'approved_by',
            'posted_by',
            'resource'
        )
        
        # Filter parameters
        payment_flow = self.request.query_params.get('payment_flow')
        resource_type = self.request.query_params.get('resource_type')
        asset_id = self.request.query_params.get('asset')
        status_filter = self.request.query_params.get('status')
        is_irregular = self.request.query_params.get('is_irregular')
        is_posted = self.request.query_params.get('is_posted')
        
        if payment_flow:
            queryset = queryset.filter(payment_flow=payment_flow)
        if resource_type:
            queryset = queryset.filter(resource__resource_type=resource_type)
        if asset_id:
            queryset = queryset.filter(asset_id=asset_id)
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        if is_irregular is not None:
            queryset = queryset.filter(is_irregular=is_irregular.lower() == 'true')
        if is_posted is not None:
            queryset = queryset.filter(is_posted=is_posted.lower() == 'true')
        
        return queryset.order_by('-consumption_date', '-created_at')
    
    def get_serializer_class(self):
        from .serializers import (
            ResourceConsumptionSerializer,
            ResourceConsumptionDetailSerializer,
            ResourceConsumptionPostSerializer,
            ResourceConsumptionApproveSerializer,
            ResourceConsumptionBulkPostSerializer
        )
        
        if self.action == 'retrieve':
            return ResourceConsumptionDetailSerializer
        elif self.action == 'post_consumption':
            return ResourceConsumptionPostSerializer
        elif self.action == 'approve':
            return ResourceConsumptionApproveSerializer
        elif self.action == 'bulk_post':
            return ResourceConsumptionBulkPostSerializer
        
        return ResourceConsumptionSerializer
    
    @action(detail=True, methods=['post'])
    def post_consumption(self, request, pk=None):
        """
        Post consumption to accounting
        
        POST /api/expenses/resource-consumptions/{id}/post_consumption/
        
        Body (optional):
        {
            "explanation": "High mileage due to long-distance trip"
        }
        
        Returns journal entry and updates for:
        - PREPAID: Amortizes from prepaid asset, updates voucher
        - POSTPAID: Creates accounts payable to supplier
        """
        consumption = self.get_object()
        serializer = self.get_serializer(data=request.data, context={'consumption': consumption})
        serializer.is_valid(raise_exception=True)
        
        # Update explanation if provided
        explanation = serializer.validated_data.get('explanation')
        if explanation:
            consumption.explanation_provided = explanation
            consumption.save()
        
        try:
            with transaction.atomic():
                consumption.posted_by = request.user
                success = consumption.post()
                
                return Response({
                    'success': True,
                    'message': 'Consumption posted successfully',
                    'consumption_number': consumption.consumption_number,
                    'payment_flow': consumption.payment_flow,
                    'total_cost': consumption.total_cost,
                    'journal_entry_id': consumption.journal_entry_id,
                    'accounts_payable_id': consumption.accounts_payable_id,
                })
        
        except Exception as e:
            return Response(
                {'success': False, 'message': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        """
        Approve irregular consumption
        
        POST /api/expenses/resource-consumptions/{id}/approve/
        
        Body:
        {
            "approve": true,
            "explanation": "Approved - long distance trip verified",
            "rejection_reason": ""  // if approve=false
        }
        """
        consumption = self.get_object()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        approve = serializer.validated_data.get('approve', True)
        explanation = serializer.validated_data.get('explanation', '')
        rejection_reason = serializer.validated_data.get('rejection_reason', '')
        
        if approve:
            consumption.approved_by = request.user
            consumption.approved_at = timezone.now()
            consumption.explanation_provided = explanation
            consumption.status = 'approved'
            consumption.requires_explanation = False
            consumption.save()
            
            return Response({
                'success': True,
                'message': 'Consumption approved',
                'status': consumption.status
            })
        else:
            consumption.status = 'cancelled'
            consumption.notes += f"\n\nRejected by {request.user.get_full_name()}: {rejection_reason}"
            consumption.save()
            
            return Response({
                'success': True,
                'message': 'Consumption rejected',
                'status': consumption.status
            })
    
    @action(detail=False, methods=['post'])
    def bulk_post(self, request):
        """
        Bulk post multiple consumptions
        
        POST /api/expenses/resource-consumptions/bulk_post/
        
        Body:
        {
            "consumption_ids": [1, 2, 3],
            "force_post": false
        }
        """
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        
        consumption_ids = serializer.validated_data['consumption_ids']
        force_post = serializer.validated_data.get('force_post', False)
        
        consumptions = ResourceConsumption.objects.filter(
            id__in=consumption_ids,
            branch=request.user.branch,
            is_posted=False
        )
        
        results = {
            'success': [],
            'failed': [],
            'skipped': []
        }
        
        for consumption in consumptions:
            # Skip flagged ones unless force_post
            if consumption.is_irregular and not force_post:
                results['skipped'].append({
                    'id': consumption.id,
                    'number': consumption.consumption_number,
                    'reason': 'Flagged for irregularity - requires approval'
                })
                continue
            
            try:
                with transaction.atomic():
                    consumption.posted_by = request.user
                    consumption.post()
                    results['success'].append({
                        'id': consumption.id,
                        'number': consumption.consumption_number
                    })
            except Exception as e:
                results['failed'].append({
                    'id': consumption.id,
                    'number': consumption.consumption_number,
                    'error': str(e)
                })
        
        return Response({
            'success': True,
            'posted_count': len(results['success']),
            'failed': len(results['failed']),
            'skipped': len(results['skipped']),
            'details': results
        })
    
    @action(detail=False, methods=['get'])
    def irregularities(self, request):
        """
        Get all flagged irregular consumptions requiring review
        
        GET /api/expenses/resource-consumptions/irregularities/
        """
        queryset = self.get_queryset().filter(
            is_irregular=True,
            is_posted=False,
            status='flagged'
        )
        
        serializer = self.get_serializer(queryset, many=True)
        return Response({
            'count': queryset.count(),
            'consumptions': serializer.data
        })
    
    @action(detail=False, methods=['get'])
    def asset_summary(self, request):
        """
        Get consumption summary for an asset
        
        GET /api/expenses/resource-consumptions/asset_summary/?asset_id=5&days=30
        """
        asset_id = request.query_params.get('asset_id')
        days = int(request.query_params.get('days', 30))
        
        if not asset_id:
            return Response(
                {'error': 'asset_id parameter required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from assets.models import FixedAsset
        
        try:
            asset = FixedAsset.objects.get(id=asset_id, branch=request.user.branch)
        except FixedAsset.DoesNotExist:
            return Response(
                {'error': 'Asset not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get consumption data
        resource_type = request.query_params.get('resource_type', 'fuel')
        # Note: Methods expect resource_id, not resource_type. Passing None to get all resources.
        # TODO: Add resource_type filtering in FixedAsset methods or resolve resource_type to resource_id here
        totals = asset.get_total_consumption(resource_id=None, days=days)
        efficiency = asset.get_consumption_efficiency(resource_id=None)
        has_irregular = asset.has_irregular_consumptions(resource_id=None, days=days)
        
        # Get recent consumptions
        recent = self.get_queryset().filter(
            asset=asset,
            resource__resource_type=resource_type
        )[:10]
        
        return Response({
            'asset': {
                'id': asset.id,
                'asset_number': asset.asset_number,
                'name': asset.name,
                'current_reading': asset.current_meter_reading if asset.current_meter_reading is not None else None,
            },
            'period_days': days,
            'totals': {
                'quantity': totals['total_quantity'] if totals['total_quantity'] is not None else 0,
                'cost': totals['total_cost'] if totals['total_cost'] is not None else 0,
                'usage': totals['total_usage'] if totals['total_usage'] is not None else 0,
            },
            'efficiency': {
                'current': efficiency['current'] if efficiency['current'] else None,
                'average': efficiency['average'] if efficiency['average'] else None,
                'best': efficiency['best'] if efficiency['best'] else None,
                'worst': efficiency['worst'] if efficiency['worst'] else None,
            },
            'has_irregularities': has_irregular,
            'recent_consumptions': self.get_serializer(recent, many=True).data
        })

    @action(detail=True, methods=['post'])
    def submit_for_approval(self, request, pk=None):
        """
        Submit consumption for approval workflow
        POST /api/expenses/resource-consumptions/{id}/submit_for_approval/
        
        Similar to procurement approval workflow
        """
        consumption = self.get_object()
        
        if consumption.status not in ['draft', 'flagged']:
            return Response(
                {'error': 'Can only submit draft or flagged consumptions'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            workflow_triggered = consumption.submit_for_approval()
            
            return Response({
                'success': True,
                'consumption_number': consumption.consumption_number,
                'status': consumption.status,
                'workflow_triggered': workflow_triggered,
                'message': 'Submitted for approval' if workflow_triggered else 'Auto-approved'
            })
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def approve_consumption(self, request, pk=None):
        """
        Approve a consumption
        POST /api/expenses/resource-consumptions/{id}/approve_consumption/
        
        Body: {\"notes\": \"Approved - looks correct\"}
        """
        consumption = self.get_object()
        notes = request.data.get('notes', '')
        
        try:
            consumption.approve(request.user, notes)
            
            return Response({
                'success': True,
                'consumption_number': consumption.consumption_number,
                'status': consumption.status,
                'approved_by': consumption.approved_by.get_full_name(),
                'approved_at': consumption.approved_at
            })
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=True, methods=['post'])
    def reject_consumption(self, request, pk=None):
        """
        Reject a consumption
        POST /api/expenses/resource-consumptions/{id}/reject_consumption/
        
        Body: {\"reason\": \"Cost exceeds budget\"}
        """
        consumption = self.get_object()
        reason = request.data.get('reason', '')
        
        if not reason:
            return Response(
                {'error': 'Rejection reason is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            consumption.reject(request.user, reason)
            
            return Response({
                'success': True,
                'consumption_number': consumption.consumption_number,
                'status': consumption.status,
                'message': 'Consumption rejected'
            })
        except ValidationError as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )

    @action(detail=False, methods=['get'])
    def staff_fuel_summary(self, request):
        """
        Get fuel/resource consumption summary grouped by staff member.
        Tracks fuel given directly to employees (not vehicles).

        GET /api/expenses/resource-consumptions/staff_fuel_summary/?days=30&resource_type=fuel

        Accounting note:
        - Prepaid: consumption reduces the prepaid voucher balance → Dr Fuel Expense / Cr Prepaid Fuel
        - Postpaid: creates AP obligation → Dr Staff Fuel Expense / Cr Accounts Payable
        """
        from datetime import timedelta
        from django.db.models import Sum, Count, Max, Q

        days = int(request.query_params.get('days', 30))
        resource_type = request.query_params.get('resource_type', 'fuel')
        cutoff = timezone.now().date() - timedelta(days=days)

        consumptions = self.get_queryset().filter(
            beneficiary_type='employee',
            consumption_date__gte=cutoff,
        )

        if resource_type:
            consumptions = consumptions.filter(resource__resource_type=resource_type)

        # Group by employee
        summary = (
            consumptions
            .values(
                'employee__id',
                'employee__first_name',
                'employee__last_name',
                'employee__staff_id',
                'employee__department__name',
                'employee__job_title',
            )
            .annotate(
                total_quantity=Sum('quantity_consumed'),
                total_cost=Sum('total_cost'),
                consumption_count=Count('id'),
                last_consumption_date=Max('consumption_date'),
                irregular_count=Count('id', filter=Q(is_irregular=True)),
            )
            .order_by('-total_cost')
        )

        staff_data = []
        grand_total_quantity = Decimal('0')
        grand_total_cost = Decimal('0')

        for item in summary:
            qty = Decimal(str(item['total_quantity'] or 0))
            cost = Decimal(str(item['total_cost'] or 0))
            grand_total_quantity += qty
            grand_total_cost += cost

            staff_data.append({
                'employee_id': item['employee__id'],
                'staff_id': item['employee__staff_id'] or '',
                'employee_name': (
                    f"{item['employee__first_name']} {item['employee__last_name']}"
                ).strip() or 'Unknown',
                'department': item['employee__department__name'] or 'N/A',
                'job_title': item['employee__job_title'] or '',
                'total_quantity': qty,
                'total_cost': cost,
                'consumption_count': item['consumption_count'],
                'last_consumption_date': item['last_consumption_date'],
                'irregular_count': item['irregular_count'],
                'has_irregularities': item['irregular_count'] > 0,
            })

        # Also get individual consumption records for drill-down (latest 50)
        recent_records = consumptions.select_related(
            'employee', 'resource', 'prepaid_voucher'
        ).order_by('-consumption_date')[:50]

        recent_data = []
        for c in recent_records:
            emp_name = 'N/A'
            if c.employee:
                emp_name = f"{c.employee.first_name} {c.employee.last_name}".strip()
            recent_data.append({
                'id': c.id,
                'consumption_number': c.consumption_number,
                'consumption_date': c.consumption_date,
                'employee_name': emp_name or c.beneficiary_name,
                'department': c.employee.department.name if (c.employee and c.employee.department) else 'N/A',
                'quantity_consumed': c.quantity_consumed,
                'unit_cost': c.unit_cost if c.unit_cost else None,
                'total_cost': c.total_cost,
                'payment_flow': c.payment_flow,
                'resource_name': c.resource.name,
                'resource_unit': c.resource.unit_of_measure,
                'consumption_location': c.consumption_location,
                'is_irregular': c.is_irregular,
                'status': c.status,
            })

        return Response({
            'period_days': days,
            'resource_type': resource_type,
            'summary': {
                'total_staff_count': len(staff_data),
                'grand_total_quantity': grand_total_quantity,
                'grand_total_cost': grand_total_cost,
            },
            'staff_summary': staff_data,
            'recent_consumptions': recent_data,
        })

    @action(detail=False, methods=['get'])
    def fleet_consumption_overview(self, request):
        """
        Overview of vehicle fleet resource consumption — companion to asset/fleet_summary.
        Returns per-vehicle consumption stats for a period.
        
        GET /api/expenses/resource-consumptions/fleet_consumption_overview/?days=30
        """
        from datetime import timedelta
        from django.db.models import Sum, Count, Q

        days = int(request.query_params.get('days', 30))
        resource_type = request.query_params.get('resource_type', 'fuel')
        cutoff = timezone.now().date() - timedelta(days=days)

        consumptions = self.get_queryset().filter(
            beneficiary_type='asset',
            asset__isnull=False,
            consumption_date__gte=cutoff,
        )

        if resource_type:
            consumptions = consumptions.filter(resource__resource_type=resource_type)

        summary = (
            consumptions
            .values(
                'asset__id',
                'asset__asset_number',
                'asset__name',
                'asset__registration_number',
                'asset__make',
                'asset__model',
            )
            .annotate(
                total_quantity=Sum('quantity_consumed'),
                total_cost=Sum('total_cost'),
                fill_count=Count('id'),
                irregular_count=Count('id', filter=Q(is_irregular=True)),
            )
            .order_by('-total_cost')
        )

        vehicles = []
        for item in summary:
            vehicles.append({
                'asset_id': item['asset__id'],
                'asset_number': item['asset__asset_number'],
                'name': item['asset__name'],
                'registration_number': item['asset__registration_number'] or '',
                'make': item['asset__make'] or '',
                'model': item['asset__model'] or '',
                'total_quantity': Decimal(str(item['total_quantity'] or 0)),
                'total_cost': Decimal(str(item['total_cost'] or 0)),
                'fill_count': item['fill_count'],
                'irregular_count': item['irregular_count'],
                'has_irregularities': item['irregular_count'] > 0,
            })

        return Response({
            'period_days': days,
            'resource_type': resource_type,
            'count': len(vehicles),
            'vehicles': vehicles,
        })

    @action(detail=True, methods=['post'])
    def raise_deduction(self, request, pk=None):
        """
        Raise a payslip deduction for the operator of this consumption record.
        Typically used when a flagged irregularity is confirmed and the cost is
        to be recovered from the responsible staff member.

        POST /api/expenses/resource-consumptions/{id}/raise_deduction/
        Body:
        {
            "deduction_component": 12,       // SalaryComponent ID (DEDUCTION type)
            "for_month": "2024-01-01",       // First day of the target payroll month
            "reason": "Optional custom reason text"
        }
        """
        from hr.models import SalaryComponent
        from django.core.exceptions import ValidationError as DjValidationError

        consumption = self.get_object()

        deduction_component_id = request.data.get('deduction_component')
        for_month              = request.data.get('for_month')
        reason                 = request.data.get('reason', '')

        if not deduction_component_id:
            return Response(
                {'error': 'deduction_component (SalaryComponent ID) is required'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not for_month:
            return Response(
                {'error': 'for_month is required (format: YYYY-MM-01)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not consumption.operator_id:
            return Response(
                {
                    'error': (
                        'This consumption record has no linked staff operator. '
                        'Set the operator field first before raising a deduction.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            component = SalaryComponent.objects.get(
                id=deduction_component_id,
                branch=request.user.branch,
            )
        except SalaryComponent.DoesNotExist:
            return Response(
                {'error': 'Deduction component not found'},
                status=status.HTTP_404_NOT_FOUND,
            )

        if component.component_type != SalaryComponent.DEDUCTION:
            return Response(
                {'error': f'Component "{component.name}" is not a DEDUCTION type.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            with transaction.atomic():
                deduction_request = consumption.create_deduction_request(
                    deduction_component=component,
                    for_month=for_month,
                    reason=reason or None,
                    requested_by=request.user,
                )
        except (DjValidationError, ValueError) as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response(
                {'error': f'Failed to create deduction request: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        operator = consumption.operator
        return Response(
            {
                'success': True,
                'deduction_request_id': deduction_request.id,
                'reference_number':     deduction_request.reference_number,
                'staff_name': f'{operator.first_name} {operator.last_name}',
                'staff_id':             operator.staff_id,
                'component_name':       component.name,
                'amount':               deduction_request.amount,
                'for_month':            str(deduction_request.for_month),
                'status':               deduction_request.status,
                'consumption_number':   consumption.consumption_number,
            },
            status=status.HTTP_201_CREATED,
        )

class ResourceViewSet(ScopedModelViewSet):
    """
    API endpoint for Resource management
    
    Resources can be created manually or automatically from PrepaidExpenses.
    Manual creation allows capturing detailed configuration like irregularity
    detection thresholds, service contracts, and efficiency parameters.
    
    Available endpoints:
    - GET /api/expenses/resources/ - List all resources
    - POST /api/expenses/resources/ - Create new resource
    - GET /api/expenses/resources/{id}/ - Get resource details
    - PATCH /api/expenses/resources/{id}/ - Update resource
    - DELETE /api/expenses/resources/{id}/ - Delete resource
    - GET /api/expenses/resources/{id}/consumption_history/ - View consumption history
    - GET /api/expenses/resources/{id}/statistics/ - View statistics
    
    Filtering:
    - ?resource_type=fuel
    - ?is_active=true
    - ?is_service=true
    - ?search=diesel
    """
    permission_module = 'expenses'
    permission_page = 'resources'
    permission_classes = [IsAuthenticated]
    filterset_fields = ['resource_type', 'is_active', 'is_service', 'default_tracking_method']
    search_fields = ['resource_code', 'name', 'description']
    ordering_fields = ['name', 'resource_type', 'default_unit_cost', 'created_at']
    ordering = ['resource_type', 'name']
    
    def get_queryset(self):
        queryset = Resource.objects.filter(
            branch=self.request.user.branch
        ).select_related(
            'expense_category',
            'expense_category__expense_account',
            'default_supplier'
        )
        
        return queryset
    
    def get_serializer_class(self):
        from .serializers import ResourceSerializer, ResourceListSerializer
        
        if self.action == 'list':
            return ResourceListSerializer
        return ResourceSerializer
    
    @action(detail=True, methods=['get'])
    def consumption_history(self, request, pk=None):
        """
        Get consumption history for this resource
        GET /api/expenses/resources/{id}/consumption_history/?days=30
        """
        resource = self.get_object()
        days = int(request.query_params.get('days', 30))
        
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days) if days else None
        
        consumptions = resource.consumptions.filter(is_posted=True)
        if cutoff_date:
            consumptions = consumptions.filter(consumption_date__gte=cutoff_date)
        
        consumptions = consumptions.order_by('-consumption_date')[:100]
        
        from .serializers import ResourceConsumptionListSerializer
        serializer = ResourceConsumptionListSerializer(consumptions, many=True)
        
        return Response({
            'resource_code': resource.resource_code,
            'resource_name': resource.name,
            'days': days,
            'consumption_count': consumptions.count(),
            'consumptions': serializer.data
        })
    
    @action(detail=True, methods=['get'])
    def statistics(self, request, pk=None):
        """
        Get consumption statistics for this resource
        GET /api/expenses/resources/{id}/statistics/?days=30
        """
        resource = self.get_object()
        days = int(request.query_params.get('days', 30))
        
        totals = resource.get_total_consumption(days=days)
        count = resource.get_consumption_count(days=days)
        
        # Get irregularity count
        from django.utils import timezone
        from datetime import timedelta
        
        cutoff_date = timezone.now().date() - timedelta(days=days) if days else None
        
        irregular_consumptions = resource.consumptions.filter(is_irregular=True)
        if cutoff_date:
            irregular_consumptions = irregular_consumptions.filter(consumption_date__gte=cutoff_date)
        
        return Response({
            'resource_code': resource.resource_code,
            'resource_name': resource.name,
            'days': days,
            'total_quantity': totals['total_quantity'],
            'total_cost': totals['total_cost'],
            'consumption_count': count,
            'irregular_count': irregular_consumptions.count(),
            'average_quantity_per_consumption': totals['total_quantity'] / count if count > 0 else 0,
            'average_cost_per_consumption': totals['total_cost'] / count if count > 0 else 0
        })
    
    @action(detail=False, methods=['get'])
    def by_type(self, request):
        """
        Get resources grouped by type
        GET /api/expenses/resources/by_type/
        """
        from django.db.models import Count, Sum
        
        resources = Resource.objects.filter(
            branch=request.user.branch,
            is_active=True
        ).values('resource_type').annotate(
            count=Count('id'),
            total_consumptions=Count('consumptions')
        ).order_by('resource_type')
        
        return Response(list(resources))


class PrepaidVoucherViewSet(ScopedModelViewSet):
    """
    API endpoint for PrepaidVoucher management
    
    Manages prepaid vouchers for resource consumption:
    - Fuel vouchers for vehicles
    - Utility prepaid cards
    - Service vouchers
    
    Filtering:
    - ?status=active
    - ?beneficiary_type=asset
    - ?is_redeemed=false
    - ?search=FUEL-V-2024
    """
    permission_module = 'expenses'
    permission_page = 'prepaid-vouchers'
    permission_classes = [IsAuthenticated]
    filterset_fields = ['beneficiary_type', 'is_redeemed']
    search_fields = ['voucher_number', 'beneficiary_name', 'beneficiary_reference']
    ordering_fields = ['issue_date', 'expiry_date', 'allocated_amount', 'remaining_amount']
    ordering = ['-issue_date']
    
    def get_queryset(self):
        queryset = PrepaidVoucher.objects.filter(
            branch=self.request.user.branch
        ).select_related('prepaid_expense')
        
        # Filter by expiry status
        show_expired = self.request.query_params.get('show_expired', 'false').lower() == 'true'
        if not show_expired:
            queryset = queryset.exclude(status='expired')
        
        # Status filtering: supports single value, comma-separated values, or the
        # special alias "available" which returns active + partially_used vouchers
        status_param = self.request.query_params.get('status')
        if status_param:
            if status_param == 'available':
                queryset = queryset.filter(status__in=['active', 'partially_used'])
            elif ',' in status_param:
                statuses = [s.strip() for s in status_param.split(',') if s.strip()]
                queryset = queryset.filter(status__in=statuses)
            else:
                queryset = queryset.filter(status=status_param)
        
        return queryset
    
    def get_serializer_class(self):
        from .serializers import PrepaidVoucherSerializer, PrepaidVoucherListSerializer
        
        if self.action == 'list':
            return PrepaidVoucherListSerializer
        return PrepaidVoucherSerializer
    
    def perform_create(self, serializer):
        """Auto-generate voucher number and register it in tracking system"""
        from common.services.reference_service import ReferenceService
        
        # Get tenant from user
        user = self.request.user
        tenant = getattr(user, 'tenant', user)
        
        # Generate unique voucher_number
        voucher_number = ReferenceService.generate_reference(
            module='expenses',
            model_name='prepaid_voucher',
            tenant=tenant,
            branch=user.branch
        )
        
        # Save the voucher
        voucher = serializer.save(
            voucher_number=voucher_number,
            owner=user,
            branch=user.branch,
            tenant=tenant
        )
        
        # CRITICAL: Register the reference number in tracking table
        # Without this, the next voucher will get the same number!
        ReferenceService.register_reference(
            reference_number=voucher_number,
            module='expenses',
            model_name='prepaid_voucher',
            object_id=voucher.id,
            tenant=tenant,
            branch=user.branch,
            created_by=user,
            status='active',
            amount=voucher.allocated_amount if voucher.allocated_amount else Decimal('0'),
            metadata={
                'prepaid_expense_id': voucher.prepaid_expense_id,
                'beneficiary_name': voucher.beneficiary_name,
                'allocated_units': str(voucher.allocated_units),
                'issue_date': voucher.issue_date.isoformat() if voucher.issue_date else None,
                'expiry_date': voucher.expiry_date.isoformat() if voucher.expiry_date else None
            }
        )
    
    @action(detail=True, methods=['get'])

    def consumptions(self, request, pk=None):
        """
        Get all consumptions using this voucher
        GET /api/expenses/vouchers/{id}/consumptions/
        """
        voucher = self.get_object()
        consumptions = voucher.consumptions.all().order_by('-consumption_date')
        
        from .serializers import ResourceConsumptionListSerializer
        serializer = ResourceConsumptionListSerializer(consumptions, many=True)
        
        return Response({
            'voucher_number': voucher.voucher_number,
            'beneficiary_name': voucher.beneficiary_name,
            'allocated_units': voucher.allocated_units,
            'consumed_units': voucher.consumed_units,
            'remaining_units': voucher.remaining_units,
            'allocated_amount': voucher.allocated_amount,
            'consumed_amount': voucher.consumed_amount,
            'remaining_amount': voucher.remaining_amount,
            'consumption_count': consumptions.count(),
            'consumptions': serializer.data
        })
    
    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        """
        Cancel a voucher
        POST /api/expenses/vouchers/{id}/cancel/
        Body: {"reason": "Lost voucher"}
        """
        voucher = self.get_object()
        reason = request.data.get('reason', '')
        
        if voucher.status in ['fully_used', 'cancelled']:
            return Response(
                {'error': f'Cannot cancel voucher with status: {voucher.status}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if voucher.consumed_units > 0:
            return Response(
                {'error': 'Cannot cancel voucher that has been partially used'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        voucher.status = 'cancelled'
        voucher.notes = f"{voucher.notes}\nCancelled by {request.user.get_full_name()}: {reason}".strip()
        voucher.save()
        
        return Response({
            'success': True,
            'voucher_number': voucher.voucher_number,
            'status': voucher.status,
            'message': 'Voucher cancelled successfully'
        })
    
    @action(detail=False, methods=['get'])
    def expiring_soon(self, request):
        """
        Get vouchers expiring within specified days
        GET /api/expenses/vouchers/expiring_soon/?days=7
        """
        from django.utils import timezone
        from datetime import timedelta
        
        days = int(request.query_params.get('days', 7))
        cutoff_date = timezone.now().date() + timedelta(days=days)
        
        vouchers = PrepaidVoucher.objects.filter(
            branch=request.user.branch,
            status__in=['active', 'partially_used'],
            expiry_date__lte=cutoff_date,
            expiry_date__gte=timezone.now().date()
        ).order_by('expiry_date')
        
        from .serializers import PrepaidVoucherListSerializer
        serializer = PrepaidVoucherListSerializer(vouchers, many=True)
        
        return Response({
            'days': days,
            'count': vouchers.count(),
            'vouchers': serializer.data
        })
