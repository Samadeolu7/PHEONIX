"""
API Views for Reference Tracking
Provides endpoints to trace document chains and search references
"""
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from django.shortcuts import get_object_or_404

from common.models import ReferenceTracking
from common.services.reference_service import ReferenceService


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def trace_reference(request, reference_number):
    """
    Trace a complete reference chain from origin to current document.
    
    GET /api/references/trace/PR-2026-0001/
    
    Returns:
        {
            "reference": "PR-2026-0001",
            "origin": "PR-2026-0001",
            "module": "procurement",
            "status": "approved",
            "chain": [
                {
                    "reference": "PR-2026-0001",
                    "module": "procurement",
                    "model": "purchase_requisition",
                    "status": "approved",
                    "amount": 6000.00,
                    "created_at": "2026-01-03T10:00:00Z",
                    "metadata": {}
                },
                {
                    "reference": "PO-2026-0045",
                    "module": "procurement",
                    "model": "purchase_order",
                    "status": "draft",
                    "amount": null,
                    "created_at": "2026-01-03T10:05:00Z"
                }
            ]
        }
    """
    try:
        chain = ReferenceService.trace_reference(reference_number)
        
        if not chain:
            return Response(
                {
                    'success': False,
                    'message': f'Reference {reference_number} not found'
                },
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Get origin reference (first in chain)
        origin_ref = chain[0] if chain else None
        
        return Response({
            'success': True,
            'reference': reference_number,
            'origin': origin_ref.get('origin_reference', reference_number) if origin_ref else None,
            'module': origin_ref.get('module') if origin_ref else None,
            'status': origin_ref.get('status') if origin_ref else None,
            'chain': chain
        })
        
    except Exception as e:
        return Response(
            {
                'success': False,
                'message': f'Error tracing reference: {str(e)}'
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_references(request):
    """
    Search references with filters.
    
    GET /api/references/search/?module=procurement&status=approved&limit=10
    
    Query Parameters:
        - module: Filter by module (procurement, expenses, inventory, etc.)
        - status: Filter by status
        - model_name: Filter by specific model
        - limit: Number of results (default: 20, max: 100)
    
    Returns:
        {
            "success": true,
            "count": 15,
            "results": [
                {
                    "reference": "PR-2026-0001",
                    "module": "procurement",
                    "model_name": "purchase_requisition",
                    "status": "approved",
                    "amount": 6000.00,
                    "origin_reference": "PR-2026-0001",
                    "parent_reference": null,
                    "created_at": "2026-01-03T10:00:00Z"
                },
                ...
            ]
        }
    """
    # Get query parameters
    module = request.query_params.get('module')
    status_filter = request.query_params.get('status')
    model_name = request.query_params.get('model_name')
    limit = int(request.query_params.get('limit', 20))
    
    # Enforce max limit
    limit = min(limit, 100)
    
    # Get user's tenant and branch
    tenant = request.user.tenant
    branch = getattr(request.user, 'branch', None)
    
    # Build query
    queryset = ReferenceTracking.objects.filter(tenant=tenant)
    
    if branch:
        queryset = queryset.filter(branch=branch)
    
    if module:
        queryset = queryset.filter(module=module)
    
    if status_filter:
        queryset = queryset.filter(status=status_filter)
    
    if model_name:
        queryset = queryset.filter(model_name=model_name)
    
    # Order by most recent first
    queryset = queryset.order_by('-created_at')[:limit]
    
    # Serialize results
    results = []
    for ref in queryset:
        results.append({
            'reference': ref.reference_number,
            'module': ref.module,
            'model_name': ref.model_name,
            'status': ref.status,
            'amount': float(ref.amount) if ref.amount else None,
            'origin_reference': ref.origin_reference,
            'parent_reference': ref.parent_reference,
            'workflow_run_id': ref.workflow_run_id,
            'metadata': ref.metadata,
            'created_at': ref.created_at.isoformat(),
            'updated_at': ref.updated_at.isoformat()
        })
    
    return Response({
        'success': True,
        'count': len(results),
        'results': results
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_children(request, reference_number):
    """
    Get all child documents for a reference.
    
    GET /api/references/PR-2026-0001/children/
    
    Returns:
        {
            "success": true,
            "reference": "PR-2026-0001",
            "children": [
                {
                    "reference": "PO-2026-0045",
                    "module": "procurement",
                    "model_name": "purchase_order",
                    "status": "draft"
                }
            ]
        }
    """
    try:
        children = ReferenceService.get_children(reference_number)
        
        return Response({
            'success': True,
            'reference': reference_number,
            'count': len(children),
            'children': children
        })
        
    except Exception as e:
        return Response(
            {
                'success': False,
                'message': f'Error getting children: {str(e)}'
            },
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
