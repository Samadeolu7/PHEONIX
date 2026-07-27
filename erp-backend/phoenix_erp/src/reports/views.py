# reports/views.py
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.db import transaction
from django.utils import timezone
from django.http import HttpResponse, Http404

from common.views import ScopedModelViewSet, resolve_effective_branch
from .models import (
    ReportCategory, ReportTemplate, ReportParameter,
    ReportColumn, ReportChart, ReportExecution, ReportSchedule
)
from .serializers import (
    ReportCategorySerializer, ReportTemplateSerializer,
    ReportTemplateCreateUpdateSerializer, ReportParameterSerializer,
    ReportColumnSerializer, ReportChartSerializer,
    ReportExecutionSerializer, ReportScheduleSerializer
)
from .services.executor import ReportExecutor
from .services.generator import ReportGenerator
from .services.financial_statements import FinancialStatementService
from .pdf_generators import (
    PurchaseOrderPDFGenerator,
    GoodsReceivedNotePDFGenerator,
    PayslipPDFGenerator,
)


class ReportCategoryViewSet(ScopedModelViewSet):
    permission_module = 'reports'
    permission_page = 'report-categories'
    queryset = ReportCategory.objects.all()
    serializer_class = ReportCategorySerializer
    permission_classes = [IsAuthenticated]


class ReportTemplateViewSet(ScopedModelViewSet):
    permission_module = 'reports'
    permission_page = 'report-templates'
    queryset = ReportTemplate.objects.filter(is_active=True)
    serializer_class = ReportTemplateSerializer
    permission_classes = [IsAuthenticated]
    
    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return ReportTemplateCreateUpdateSerializer
        return ReportTemplateSerializer
    
    @action(detail=True, methods=['post'], url_path='execute')
    def execute(self, request, pk=None):
        """
        Execute report with parameters
        
        POST /api/reports/templates/{id}/execute/
        Body: {
            "parameters": {
                "start_date": "2024-01-01",
                "end_date": "2024-12-31"
            }
        }
        """
        template = self.get_object()
        parameters = request.data.get('parameters', {})
        
        try:
            # Execute report
            executor = ReportExecutor(template, request.user, parameters)
            result = executor.execute()
            
            return Response({
                'success': True,
                'data': result['data'],
                'metadata': result['metadata'],
                'execution_id': result['execution_id']
            })
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=True, methods=['post'], url_path='validate')
    def validate_config(self, request, pk=None):
        """
        Validate report configuration
        
        POST /api/reports/templates/{id}/validate/
        """
        template = self.get_object()
        
        try:
            template.validate_config()
            return Response({
                'success': True,
                'message': 'Report configuration is valid'
            })
        except Exception as e:
            return Response({
                'success': False,
                'errors': [str(e)]
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'], url_path='by-code/(?P<code>[^/.]+)')
    def by_code(self, request, code=None):
        """
        Get report template by code
        
        GET /api/reports/templates/by-code/savings_report_101_001/
        
        Returns:
        {
            "success": true,
            "data": {
                "id": 2,
                "code": "savings_report_101_001",
                "name": "Child 2 Savings Report",
                "page_config": {...}
            }
        }
        """
        try:
            template = self.get_queryset().get(code=code)
            
            if not template.user_can_access(request.user):
                return Response(
                    {'error': 'Permission denied'},
                    status=status.HTTP_403_FORBIDDEN
                )
            
            serializer = self.get_serializer(template)
            return Response({
                'success': True,
                'data': serializer.data
            })
        except ReportTemplate.DoesNotExist:
            return Response({
                'success': False,
                'error': f'Report not found: {code}'
            }, status=status.HTTP_404_NOT_FOUND)
    
    @action(detail=True, methods=['get'], url_path='run')
    def run(self, request, pk=None):
        """
        Execute report with GET query parameters (simpler alternative to execute action)
        
        GET /api/reports/templates/{id}/run/?start_date=2024-01-01&end_date=2024-12-31
        
        Query parameters are passed as report parameters.
        Use this for simple report execution without POST body.
        
        Returns:
        {
            "success": true,
            "data": {...report data...},
            "metadata": {...execution metadata...}
        }
        """
        template = self.get_object()
        
        if not template.user_can_access(request.user):
            return Response(
                {'error': 'Permission denied'},
                status=status.HTTP_403_FORBIDDEN
            )
        
        # Extract only defined report parameters from query params
        # This prevents passing arbitrary fields that aren't defined in the template
        parameters = {}
        defined_param_codes = {param.code for param in template.parameters.all()}
        
        for key, value in request.query_params.items():
            # Only include parameters that are defined in the report template
            if key in defined_param_codes:
                # Convert lists back to single values if needed
                if isinstance(value, list) and len(value) == 1:
                    parameters[key] = value[0]
                else:
                    parameters[key] = value
        
        try:
            # Execute report
            executor = ReportExecutor(template, request.user, parameters)
            result = executor.execute()
            
            return Response({
                'success': True,
                'data': result['data'],
                'metadata': result['metadata']
            })
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['get'], url_path='by-account')
    def by_account(self, request):
        """
        Get reports for a specific account
        
        GET /api/reports/templates/by-account/?account_id=123
        """
        account_id = request.query_params.get('account_id')
        
        if not account_id:
            return Response(
                {'error': 'account_id parameter is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        reports = ReportTemplate.objects.filter(
            linked_account_id=account_id,
            is_active=True
        )
        
        serializer = self.get_serializer(reports, many=True)
        return Response({
            'success': True,
            'data': serializer.data
        })
    
    @action(detail=True, methods=['post'], url_path='duplicate')
    def duplicate(self, request, pk=None):
        """
        Duplicate a report
        
        POST /api/reports/templates/{id}/duplicate/
        Body: {
            "name": "Copy of Report Name"
        }
        """
        original = self.get_object()
        new_name = request.data.get('name', f"Copy of {original.name}")
        
        with transaction.atomic():
            # Duplicate template
            new_report = ReportTemplate.objects.create(
                owner=request.user,
                branch=original.branch,
                created_by=request.user,
                tenant=request.user.tenant,
                name=new_name,
                code=f"{original.code}_copy_{timezone.now().timestamp()}",
                description=original.description,
                category=original.category,
                report_type=original.report_type,
                access_level='private',
                report_config=original.report_config,
                primary_entity=original.primary_entity,
                allowed_entities=original.allowed_entities,
                allowed_fields=original.allowed_fields,
                allowed_calculations=original.allowed_calculations,
                max_rows=original.max_rows,
                default_date_range=original.default_date_range,
                is_editable=True
            )
            
            # Duplicate parameters
            for param in original.parameters.all():
                ReportParameter.objects.create(
                    template=new_report,
                    owner=new_report.owner,
                    branch=new_report.branch,
                    created_by=request.user,
                    tenant=new_report.tenant,
                    name=param.name,
                    code=param.code,
                    parameter_type=param.parameter_type,
                    label=param.label,
                    description=param.description,
                    is_required=param.is_required,
                    default_value=param.default_value,
                    options=param.options,
                    validation_rules=param.validation_rules,
                    order=param.order
                )
            
            # Duplicate columns
            for col in original.columns.all():
                ReportColumn.objects.create(
                    template=new_report,
                    owner=new_report.owner,
                    branch=new_report.branch,
                    created_by=request.user,
                    tenant=new_report.tenant,
                    name=col.name,
                    code=col.code,
                    column_type=col.column_type,
                    label=col.label,
                    description=col.description,
                    field_path=col.field_path,
                    aggregation_function=col.aggregation_function,
                    formula=col.formula,
                    format_type=col.format_type,
                    format_options=col.format_options,
                    width=col.width,
                    is_visible=col.is_visible,
                    is_sortable=col.is_sortable,
                    is_filterable=col.is_filterable,
                    order=col.order,
                    conditional_formatting=col.conditional_formatting
                )
            
            # Duplicate charts
            for chart in original.charts.all():
                ReportChart.objects.create(
                    template=new_report,
                    owner=new_report.owner,
                    branch=new_report.branch,
                    created_by=request.user,
                    tenant=new_report.tenant,
                    name=chart.name,
                    chart_type=chart.chart_type,
                    title=chart.title,
                    description=chart.description,
                    data_config=chart.data_config,
                    display_config=chart.display_config,
                    position=chart.position,
                    order=chart.order,
                    is_visible=chart.is_visible
                )
        
        serializer = self.get_serializer(new_report)
        return Response({
            'success': True,
            'data': serializer.data
        }, status=status.HTTP_201_CREATED)
    
    @action(detail=False, methods=['post'], url_path='generate-for-product')
    def generate_for_product(self, request):
        """
        Generate a report for a specific product
        
        POST /api/reports/templates/generate-for-product/
        Body: {
            "product_id": 1
        }
        """
        from products.models import Product
        
        product_id = request.data.get('product_id')
        if not product_id:
            return Response({
                'success': False,
                'error': 'product_id is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            product = Product.objects.get(id=product_id)
            
            # Check if report already exists
            existing = ReportTemplate.objects.filter(
                linked_product=product,
                is_auto_generated=True
            ).first()
            
            if existing:
                return Response({
                    'success': True,
                    'message': 'Report already exists for this product',
                    'data': self.get_serializer(existing).data
                })
            
            # Generate new report
            report = ReportGenerator.generate_for_product(product, request.user)
            
            return Response({
                'success': True,
                'message': f'Report generated for product: {product.name}',
                'data': self.get_serializer(report).data
            }, status=status.HTTP_201_CREATED)
            
        except Product.DoesNotExist:
            return Response({
                'success': False,
                'error': 'Product not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_400_BAD_REQUEST)


class ReportExecutionViewSet(ScopedModelViewSet):
    permission_module = 'reports'
    permission_page = 'report-executions'
    queryset = ReportExecution.objects.all()
    serializer_class = ReportExecutionSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        # Filter by template if specified
        template_id = self.request.query_params.get('template_id')
        if template_id:
            queryset = queryset.filter(template_id=template_id)
        
        return queryset.order_by('-executed_at')


class ReportScheduleViewSet(ScopedModelViewSet):
    permission_module = 'reports'
    permission_page = 'report-schedules'
    queryset = ReportSchedule.objects.all()
    serializer_class = ReportScheduleSerializer
    permission_classes = [IsAuthenticated]


class PDFGeneratorViewSet(viewsets.ViewSet):
    """
    ViewSet for generating PDF documents
    Handles Purchase Orders, GRNs, and other procurement documents
    """
    permission_module = 'reports'
    permission_page = 'pdf-generator'
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'], url_path='purchase-order/(?P<po_id>[^/.]+)')
    def purchase_order(self, request, po_id=None):
        """
        Generate Purchase Order PDF
        
        GET /api/reports/pdf/purchase-order/{po_id}/
        GET /api/reports/pdf/purchase-order/{po_id}/?download=true
        
        Query Parameters:
            download (bool): If true, force download. If false, display inline.
        
        Returns:
            PDF document (application/pdf)
        """
        from procurement.models import PurchaseOrder
        
        try:
            # Get PO with proper scoping
            po = PurchaseOrder.objects.filter(
                pk=po_id
            ).select_related('supplier', 'delivery_location', 'requisition').first()
            
            if not po:
                raise Http404("Purchase Order not found")
            
            # Check permissions
            if not request.user.has_perm('procurement.view_purchaseorder'):
                return HttpResponse(
                    "Permission denied",
                    status=403,
                    content_type="text/plain"
                )
            
            # Generate PDF
            generator = PurchaseOrderPDFGenerator(po, request.user)
            download = request.query_params.get('download', 'false').lower() == 'true'
            
            return generator.as_response(download=download)
            
        except PurchaseOrder.DoesNotExist:
            raise Http404("Purchase Order not found")
        except Exception as e:
            return HttpResponse(
                f"Error generating PDF: {str(e)}",
                status=500,
                content_type="text/plain"
            )
    
    @action(detail=False, methods=['get'], url_path='test-text/purchase-order/(?P<po_id>[^/.]+)')
    def test_purchase_order_text(self, request, po_id=None):
        """
        Generate Purchase Order as text for testing (no PDF dependencies)
        
        GET /api/reports/pdf/test-text/purchase-order/{po_id}/
        
        Returns:
            Plain text representation of all data
        """
        from procurement.models import PurchaseOrder
        
        try:
            po = PurchaseOrder.objects.filter(
                pk=po_id
            ).select_related(
                'supplier',
                'delivery_location',
                'requisition',
                'requisition__requested_by',
                'approved_by'
            ).prefetch_related('items__item').first()
            
            if not po:
                raise Http404("Purchase Order not found")
            
            # Generate text
            generator = PurchaseOrderPDFGenerator(po, request.user)
            text_output = generator.generate_text()
            
            return HttpResponse(
                text_output,
                content_type="text/plain; charset=utf-8"
            )
            
        except Exception as e:
            import traceback
            error_detail = f"Error: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
            return HttpResponse(
                error_detail,
                status=500,
                content_type="text/plain"
            )
    
    @action(detail=False, methods=['get'], url_path='test-text/resource-consumption/(?P<consumption_id>[^/.]+)')
    def test_resource_consumption_text(self, request, consumption_id=None):
        """
        Generate Resource Consumption as text for testing (no PDF dependencies)
        
        GET /api/reports/pdf/test-text/resource-consumption/{consumption_id}/
        
        Returns:
            Plain text representation of all data
        """
        from expenses.models import ResourceConsumption
        from reports.pdf_generators.resource_consumption import ResourceConsumptionPDFGenerator
        
        try:
            consumption = ResourceConsumption.objects.filter(
                pk=consumption_id
            ).select_related(
                'resource',
                'resource__expense_category',
                'prepaid_voucher',
                'supplier',
                'asset',
                'employee',
                'employee__department',
                'approved_by',
                'posted_by'
            ).first()
            
            if not consumption:
                raise Http404("Resource Consumption record not found")
            
            # Generate text
            generator = ResourceConsumptionPDFGenerator(consumption, request.user)
            text_output = generator.generate_text()
            
            return HttpResponse(
                text_output,
                content_type="text/plain; charset=utf-8"
            )
            
        except Exception as e:
            import traceback
            error_detail = f"Error: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
            return HttpResponse(
                error_detail,
                status=500,
                content_type="text/plain"
            )
    
    @action(detail=False, methods=['get'], url_path='test-text/goods-received-note/(?P<grn_id>[^/.]+)')
    def test_goods_received_note_text(self, request, grn_id=None):
        """
        Generate Goods Received Note as text for testing (no PDF dependencies)
        
        GET /api/reports/pdf/test-text/goods-received-note/{grn_id}/
        
        Returns:
            Plain text representation of all data
        """
        from procurement.models import GoodsReceivedNote
        
        try:
            grn = GoodsReceivedNote.objects.filter(
                pk=grn_id
            ).select_related(
                'purchase_order', 
                'purchase_order__supplier',
                'received_location',
                'received_by'
            ).prefetch_related('items__item').first()
            
            if not grn:
                raise Http404("Goods Received Note not found")
            
            # Generate text
            generator = GoodsReceivedNotePDFGenerator(grn, request.user)
            text_output = generator.generate_text()
            
            return HttpResponse(
                text_output,
                content_type="text/plain; charset=utf-8"
            )
            
        except Exception as e:
            import traceback
            error_detail = f"Error: {str(e)}\n\nTraceback:\n{traceback.format_exc()}"
            return HttpResponse(
                error_detail,
                status=500,
                content_type="text/plain"
            )
    
    @action(detail=False, methods=['get'], url_path='resource-consumption/(?P<consumption_id>[^/.]+)')
    def resource_consumption(self, request, consumption_id=None):
        """
        Generate Resource Consumption Invoice/Voucher PDF
        
        GET /api/reports/pdf/resource-consumption/{consumption_id}/
        GET /api/reports/pdf/resource-consumption/{consumption_id}/?download=true
        
        Use Cases:
        - Fuel vouchers for drivers
        - Utility consumption invoices
        - Material consumption records
        - Equipment usage billing
        
        Query Parameters:
            download (bool): If true, force download. If false, display inline.
        
        Returns:
            PDF document (application/pdf)
        """
        from expenses.models import ResourceConsumption
        from reports.pdf_generators.resource_consumption import ResourceConsumptionPDFGenerator
        
        try:
            # Get consumption with related data
            consumption = ResourceConsumption.objects.filter(
                pk=consumption_id
            ).select_related(
                'resource',
                'resource__category',
                'prepaid_voucher',
                'supplier',
                'asset',
                'employee',
                'employee__department',
                'approved_by',
                'posted_by'
            ).first()
            
            if not consumption:
                raise Http404("Resource Consumption record not found")
            
            # Check permissions
            if not request.user.has_perm('expenses.view_resourceconsumption'):
                return HttpResponse(
                    "Permission denied",
                    status=403,
                    content_type="text/plain"
                )
            
            # Generate PDF
            generator = ResourceConsumptionPDFGenerator(consumption, request.user)
            download = request.query_params.get('download', 'false').lower() == 'true'
            
            return generator.as_response(download=download)
            
        except ResourceConsumption.DoesNotExist:
            raise Http404("Resource Consumption record not found")
        except Exception as e:
            return HttpResponse(
                f"Error generating PDF: {str(e)}",
                status=500,
                content_type="text/plain"
            )
    
    @action(detail=False, methods=['get'], url_path='goods-received-note/(?P<grn_id>[^/.]+)')
    def goods_received_note(self, request, grn_id=None):
        """
        Generate Goods Received Note PDF
        
        GET /api/reports/pdf/goods-received-note/{grn_id}/
        GET /api/reports/pdf/goods-received-note/{grn_id}/?download=true
        
        Query Parameters:
            download (bool): If true, force download. If false, display inline.
        
        Returns:
            PDF document (application/pdf)
        """
        from procurement.models import GoodsReceivedNote
        
        try:
            # Get GRN with proper scoping
            grn = GoodsReceivedNote.objects.filter(
                pk=grn_id
            ).select_related(
                'purchase_order', 
                'purchase_order__supplier',
                'received_location',
                'received_by'
            ).first()
            
            if not grn:
                raise Http404("Goods Received Note not found")
            
            # Check permissions
            if not request.user.has_perm('procurement.view_goodsreceivednote'):
                return HttpResponse(
                    "Permission denied",
                    status=403,
                    content_type="text/plain"
                )
            
            # Generate PDF
            generator = GoodsReceivedNotePDFGenerator(grn, request.user)
            download = request.query_params.get('download', 'false').lower() == 'true'
            
            return generator.as_response(download=download)
            
        except GoodsReceivedNote.DoesNotExist:
            raise Http404("Goods Received Note not found")
        except Exception as e:
            return HttpResponse(
                f"Error generating PDF: {str(e)}",
                status=500,
                content_type="text/plain"
            )

    @action(detail=False, methods=['get'], url_path='payslip/(?P<payslip_id>[^/.]+)')
    def payslip(self, request, payslip_id=None):
        """
        Generate or retrieve a Payslip PDF.

        GET /api/reports/pdf/payslip/{payslip_id}/
        GET /api/reports/pdf/payslip/{payslip_id}/?download=true
        GET /api/reports/pdf/payslip/{payslip_id}/?regenerate=true

        Query Parameters:
            download   (bool): Force browser download. Default: false (inline view).
            regenerate (bool): Re-generate PDF even if one already exists. Default: false.

        Returns:
            PDF document (application/pdf)
        """
        from hr.models import Payslip

        try:
            payslip = Payslip.objects.filter(
                pk=payslip_id
            ).select_related(
                'staff', 'staff__user', 'payroll'
            ).first()

            if not payslip:
                raise Http404("Payslip not found")

            # Scope check: payslip must belong to the requesting user's owner
            if payslip.owner != request.user.owner:
                return HttpResponse("Permission denied", status=403)

            download   = request.query_params.get('download', 'false').lower() == 'true'
            regenerate = request.query_params.get('regenerate', 'false').lower() == 'true'

            # Return cached PDF if available and not forcing regeneration
            if payslip.pdf_file and not regenerate:
                try:
                    response = HttpResponse(
                        payslip.pdf_file.read(),
                        content_type='application/pdf'
                    )
                    filename = f"payslip_{payslip.payslip_number}.pdf"
                    disposition = 'attachment' if download else 'inline'
                    response['Content-Disposition'] = f'{disposition}; filename="{filename}"'
                    return response
                except Exception:
                    pass  # Fall through to regeneration if file unreadable

            # Generate and stream the PDF
            generator = PayslipPDFGenerator(payslip, request.user)
            return generator.as_response(download=download)

        except Exception as e:
            import traceback
            return HttpResponse(
                f"Error generating payslip PDF: {str(e)}\n\n{traceback.format_exc()}",
                status=500,
                content_type="text/plain"
            )


class FinancialReportsViewSet(viewsets.ViewSet):
    """
    ViewSet for generating standard financial statements
    Handles Trial Balance, Profit & Loss, and Balance Sheet
    """
    permission_module = 'reports'
    permission_page = 'financial-reports'
    permission_classes = [IsAuthenticated]
    
    @action(detail=False, methods=['get'], url_path='trial_balance')
    def trial_balance(self, request):
        """
        Generate Trial Balance Report
        
        GET /api/reports/financial/trial_balance/
        
        Query Parameters:
            start_date (date): Start date for transactions (optional)
            end_date (date): End date for transactions (default: today)
            detail_level (str): 'summary' (parent only), 'detailed' (with children), 'all' (default: 'summary')
            include_zero_balances (bool): Include accounts with zero balance (default: false)
            export_format (str): 'json', 'pdf', 'excel' (default: 'json')
        
        Returns:
            {
                "success": true,
                "data": {
                    "report_date": "2024-12-31",
                    "date_range": {
                        "start": "2024-01-01",
                        "end": "2024-12-31"
                    },
                    "accounts": [
                        {
                            "code": "100",
                            "name": "Cash and Bank",
                            "account_type": "ASSET",
                            "level": "PARENT",
                            "debit": "150000.00",
                            "credit": "50000.00",
                            "balance": "100000.00",
                            "children": [...]
                        }
                    ],
                    "totals": {
                        "total_debits": "500000.00",
                        "total_credits": "500000.00",
                        "difference": "0.00"
                    },
                    "is_balanced": true
                }
            }
        """
        from datetime import datetime
        
        # Parse query parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        detail_level = request.query_params.get('detail_level', 'summary')
        include_zero = request.query_params.get('include_zero_balances', 'false').lower() == 'true'
        export_format = request.query_params.get('export_format', 'json')
        
        # Validate and parse dates
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate detail_level
        if detail_level not in ['summary', 'detailed', 'all']:
            return Response({
                'success': False,
                'error': 'Invalid detail_level. Use: summary, detailed, or all'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Generate report
            service = FinancialStatementService(
                owner=request.user,
                branch=resolve_effective_branch(request)
            )
            
            report_data = service.generate_trial_balance(
                start_date=start_date,
                end_date=end_date,
                detail_level=detail_level,
                include_zero_balances=include_zero
            )
            
            # Handle export formats
            if export_format == 'json':
                return Response({
                    'success': True,
                    'data': report_data
                })
            elif export_format == 'pdf':
                # TODO: Implement PDF export
                return Response({
                    'success': False,
                    'error': 'PDF export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
            elif export_format == 'excel':
                # TODO: Implement Excel export
                return Response({
                    'success': False,
                    'error': 'Excel export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
            else:
                return Response({
                    'success': False,
                    'error': 'Invalid export_format. Use: json, pdf, or excel'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='profit_loss')
    def profit_loss(self, request):
        """
        Generate Profit & Loss Statement (Income Statement)
        
        GET /api/reports/financial/profit_loss/
        
        Query Parameters:
            start_date (date): Period start date (required)
            end_date (date): Period end date (default: today)
            detail_level (str): 'summary', 'detailed', 'all' (default: 'summary')
            comparative (bool): Include comparative period (default: false)
            export_format (str): 'json', 'pdf', 'excel' (default: 'json')
        
        Returns:
            {
                "success": true,
                "data": {
                    "period": {
                        "start": "2024-01-01",
                        "end": "2024-12-31"
                    },
                    "revenue": {
                        "total": "500000.00",
                        "accounts": [...]
                    },
                    "expenses": {
                        "total": "350000.00",
                        "accounts": [...]
                    },
                    "net_profit": "150000.00",
                    "net_margin_percent": "30.00",
                    "comparative": {...}
                }
            }
        """
        from datetime import datetime
        
        # Parse query parameters
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        detail_level = request.query_params.get('detail_level', 'summary')
        comparative = request.query_params.get('comparative', 'false').lower() == 'true'
        export_format = request.query_params.get('export_format', 'json')
        
        # Validate start_date (required)
        if not start_date:
            return Response({
                'success': False,
                'error': 'start_date is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
        except ValueError:
            return Response({
                'success': False,
                'error': 'Invalid start_date format. Use YYYY-MM-DD'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid end_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if detail_level not in ['summary', 'detailed', 'all']:
            return Response({
                'success': False,
                'error': 'Invalid detail_level. Use: summary, detailed, or all'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            service = FinancialStatementService(
                owner=request.user,
                branch=resolve_effective_branch(request)
            )
            
            report_data = service.generate_profit_loss(
                start_date=start_date,
                end_date=end_date,
                detail_level=detail_level,
                comparative_period=comparative
            )
            
            if export_format == 'json':
                return Response({
                    'success': True,
                    'data': report_data
                })
            else:
                return Response({
                    'success': False,
                    'error': f'{export_format} export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    @action(detail=False, methods=['get'], url_path='balance_sheet')
    def balance_sheet(self, request):
        """
        Generate Balance Sheet (Statement of Financial Position)
        
        GET /api/reports/financial/balance_sheet/
        
        Query Parameters:
            as_of_date (date): Balance sheet date (default: today)
            detail_level (str): 'summary', 'detailed', 'all' (default: 'summary')
            comparative_date (date): Prior date for comparison (optional)
            export_format (str): 'json', 'pdf', 'excel' (default: 'json')
        
        Returns:
            {
                "success": true,
                "data": {
                    "as_of_date": "2024-12-31",
                    "assets": {
                        "current": {
                            "total": "250000.00",
                            "accounts": [...]
                        },
                        "non_current": {
                            "total": "500000.00",
                            "accounts": [...]
                        },
                        "total": "750000.00"
                    },
                    "liabilities": {
                        "current": {
                            "total": "100000.00",
                            "accounts": [...]
                        },
                        "non_current": {
                            "total": "200000.00",
                            "accounts": [...]
                        },
                        "total": "300000.00"
                    },
                    "equity": {
                        "total": "450000.00",
                        "accounts": [...]
                    },
                    "total_liabilities_equity": "750000.00",
                    "is_balanced": true,
                    "comparative": {...}
                }
            }
        """
        from datetime import datetime
        
        # Parse query parameters
        as_of_date = request.query_params.get('as_of_date')
        detail_level = request.query_params.get('detail_level', 'summary')
        comparative_date = request.query_params.get('comparative_date')
        export_format = request.query_params.get('export_format', 'json')
        
        # Parse dates
        if as_of_date:
            try:
                as_of_date = datetime.strptime(as_of_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid as_of_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if comparative_date:
            try:
                comparative_date = datetime.strptime(comparative_date, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid comparative_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        if detail_level not in ['summary', 'detailed', 'all']:
            return Response({
                'success': False,
                'error': 'Invalid detail_level. Use: summary, detailed, or all'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            service = FinancialStatementService(
                owner=request.user,
                branch=resolve_effective_branch(request)
            )
            
            report_data = service.generate_balance_sheet(
                as_of_date=as_of_date,
                detail_level=detail_level,
                comparative_date=comparative_date
            )
            
            if export_format == 'json':
                return Response({
                    'success': True,
                    'data': report_data
                })
            else:
                return Response({
                    'success': False,
                    'error': f'{export_format} export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=False, methods=['get'], url_path='monthly_profit_loss')
    def monthly_profit_loss(self, request):
        """
        Generate month-by-month Profit & Loss for a calendar year.

        GET /api/reports/financial/monthly_profit_loss/?year=2026&format=json|csv

        Spreadsheet-style successor to the client's old system report: one
        row per GL income/expense account (grouped under its parent, e.g.
        "Interest Income" holding Daily/Weekly/Monthly Loan Interest), one
        column per calendar month, plus a Net Profit row. See
        FinancialStatementService.generate_monthly_profit_loss.

        Query Parameters:
            year (int): Calendar year to report on (default: current year)
            format (str): 'json' or 'csv' (default: 'json')
        """
        from datetime import datetime

        year_param = request.query_params.get('year')
        try:
            year = int(year_param) if year_param else timezone.now().year
        except (TypeError, ValueError):
            return Response({
                'success': False,
                'error': 'Invalid year. Use a 4-digit calendar year, e.g. 2026'
            }, status=status.HTTP_400_BAD_REQUEST)

        if year < 2000 or year > 2100:
            return Response({
                'success': False,
                'error': 'year must be between 2000 and 2100'
            }, status=status.HTTP_400_BAD_REQUEST)

        fmt = request.query_params.get('format', 'json')

        try:
            service = FinancialStatementService(
                owner=request.user,
                branch=resolve_effective_branch(request)
            )
            report_data = service.generate_monthly_profit_loss(year=year)

            if fmt == 'json':
                return Response({
                    'success': True,
                    'data': report_data
                })
            elif fmt == 'csv':
                return self._monthly_profit_loss_csv(report_data)
            else:
                return Response({
                    'success': False,
                    'error': f"Unsupported format '{fmt}'. Use json or csv"
                }, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def _monthly_profit_loss_csv(self, report_data):
        """Flatten generate_monthly_profit_loss's nested groups into a CSV matrix."""
        import csv as csv_module

        month_keys = [m['key'] for m in report_data['months']]
        month_labels = [m['label'] for m in report_data['months']]

        response = HttpResponse(content_type='text/csv')
        year = report_data['year']
        response['Content-Disposition'] = f'attachment; filename="monthly-profit-loss-{year}.csv"'

        writer = csv_module.writer(response)
        writer.writerow(['Type', *month_labels, 'Total'])

        def write_section(title, section):
            writer.writerow([title.upper()])
            for group in section['groups']:
                writer.writerow([
                    group['name'],
                    *[group['months'][k] for k in month_keys],
                    group['total'],
                ])
                for acc in group['accounts']:
                    writer.writerow([
                        f"  {acc['name']}",
                        *[acc['months'][k] for k in month_keys],
                        acc['total'],
                    ])
            writer.writerow([
                f'Total {title}',
                *[section['months'][k] for k in month_keys],
                section['total'],
            ])

        write_section('Income', report_data['income'])
        write_section('Expenses', report_data['expenses'])
        writer.writerow([
            'Net Profit',
            *[report_data['net_profit']['months'][k] for k in month_keys],
            report_data['net_profit']['total'],
        ])

        return response

    @action(detail=False, methods=['get'], url_path='cash_flow')
    def cash_flow_statement(self, request):
        """
        Generate Cash Flow Statement
        
        GET /api/reports/financial/cash_flow/
        
        Query Parameters:
        - start_date (required): Start date for cash flow period (YYYY-MM-DD)
        - end_date (optional): End date for cash flow period (defaults to today)
        - method (optional): 'direct' or 'indirect' (default: 'direct')
        - export_format (optional): 'json', 'pdf', or 'excel'
        
        Returns:
        {
            "success": true,
            "data": {
                "period": {...},
                "operating_activities": {...},
                "investing_activities": {...},
                "financing_activities": {...},
                "net_change_in_cash": "...",
                "beginning_cash": "...",
                "ending_cash": "...",
                "verification": {...}
            }
        }
        """
        try:
            # Get and validate parameters
            start_date_str = request.query_params.get('start_date')
            if not start_date_str:
                return Response({
                    'success': False,
                    'error': 'start_date parameter is required'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                start_date = datetime.strptime(start_date_str, '%Y-%m-%d').date()
            except ValueError:
                return Response({
                    'success': False,
                    'error': 'Invalid start_date format. Use YYYY-MM-DD'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get end date (optional, defaults to today)
            end_date_str = request.query_params.get('end_date')
            if end_date_str:
                try:
                    end_date = datetime.strptime(end_date_str, '%Y-%m-%d').date()
                except ValueError:
                    return Response({
                        'success': False,
                        'error': 'Invalid end_date format. Use YYYY-MM-DD'
                    }, status=status.HTTP_400_BAD_REQUEST)
            else:
                end_date = timezone.now().date()
            
            # Validate date range
            if start_date > end_date:
                return Response({
                    'success': False,
                    'error': 'start_date must be before or equal to end_date'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get method (optional)
            method = request.query_params.get('method', 'direct')
            if method not in ['direct', 'indirect']:
                return Response({
                    'success': False,
                    'error': 'method must be "direct" or "indirect"'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Get export format (optional)
            export_format = request.query_params.get('export_format', 'json')
            
            # Generate cash flow statement
            statement_service = FinancialStatementService(
                owner=request.user,
                branch=resolve_effective_branch(request)
            )
            
            statement_data = statement_service.generate_cash_flow_statement(
                start_date=start_date,
                end_date=end_date,
                method=method
            )
            
            # Handle different export formats
            if export_format == 'json':
                return Response({
                    'success': True,
                    'data': statement_data
                })
            elif export_format == 'pdf':
                # TODO: Implement PDF export
                return Response({
                    'success': False,
                    'error': 'PDF export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
            elif export_format == 'excel':
                # TODO: Implement Excel export
                return Response({
                    'success': False,
                    'error': 'Excel export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
            else:
                return Response({
                    'success': False,
                    'error': f'{export_format} export not yet implemented'
                }, status=status.HTTP_501_NOT_IMPLEMENTED)
        
        except Exception as e:
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
