# pages/views/system_links_views.py
"""
API views for system links registry
Provides endpoints for dashboard builder and homepage navigation
"""

from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework import status

from pages.system_links_registry import SystemLinksRegistry, CATEGORY_METADATA, LinkCategory


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_system_links(request):
    """
    Get all system links accessible to the current user
    
    Query Parameters:
    - category: Filter by category (optional)
    - grouped: Return links grouped by category (default: false)
    """
    user = request.user
    user_roles = []
    
    # Determine user roles
    if hasattr(user, 'is_system_admin') and user.is_system_admin:
        user_roles.append('sys_admin')
    
    if user.is_staff:
        user_roles.append('admin')
    
    # Always add authenticated role
    user_roles.append('authenticated')
    
    # Get query parameters
    category_filter = request.query_params.get('category')
    grouped = request.query_params.get('grouped', 'false').lower() == 'true'
    
    if grouped:
        # Return links grouped by category
        grouped_links = SystemLinksRegistry.get_links_grouped_by_category(user_roles)
        
        # Serialize grouped links
        result = {}
        for category, links in grouped_links.items():
            result[category] = {
                'metadata': CATEGORY_METADATA.get(category, {}),
                'links': [SystemLinksRegistry.serialize_link(link) for link in links]
            }
        
        return Response({
            'success': True,
            'data': result
        })
    
    elif category_filter:
        # Filter by specific category
        try:
            category = LinkCategory(category_filter)
            links = SystemLinksRegistry.get_links_by_category(category)
            
            # Filter by user access
            accessible_links = [
                link for link in links
                if not link.required_roles or any(role in user_roles for role in link.required_roles)
            ]
            
            serialized_links = [SystemLinksRegistry.serialize_link(link) for link in accessible_links]
            
            return Response({
                'success': True,
                'data': {
                    'category': category_filter,
                    'metadata': CATEGORY_METADATA.get(category_filter, {}),
                    'links': serialized_links
                }
            })
        except ValueError:
            return Response({
                'success': False,
                'error': f'Invalid category: {category_filter}'
            }, status=status.HTTP_400_BAD_REQUEST)
    
    else:
        # Return all accessible links
        serialized_links = SystemLinksRegistry.serialize_all(user_roles)
        
        return Response({
            'success': True,
            'data': serialized_links
        })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_link_categories(request):
    """Get all link categories with metadata"""
    
    return Response({
        'success': True,
        'data': CATEGORY_METADATA
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_homepage_navigation(request):
    """
    Get navigation structure for homepage
    Returns links organized by category for main navigation
    """
    user = request.user
    user_roles = []
    
    # Determine user roles
    if hasattr(user, 'is_system_admin') and user.is_system_admin:
        user_roles.append('sys_admin')
    
    if user.is_staff:
        user_roles.append('admin')
    
    user_roles.append('authenticated')
    
    # Get all accessible links grouped by category
    grouped_links = SystemLinksRegistry.get_links_grouped_by_category(user_roles)
    
    # Build navigation structure
    navigation = []
    
    # Priority order for main navigation
    priority_categories = [
        'dashboard',
        'financial_operations',
        'accounting',
        'transactions',
        'student_management',
        'procurement',
        'inventory',
        'hr',
        'assets',
        'reports',
        'approvals',
        'forms',
        'user_management',
    ]
    
    # Add priority categories first
    for category in priority_categories:
        if category in grouped_links:
            links = grouped_links[category]
            metadata = CATEGORY_METADATA.get(category, {})
            
            navigation.append({
                'category': category,
                'label': metadata.get('label', category.title()),
                'icon': metadata.get('icon', 'folder'),
                'color': metadata.get('color', '#1a73e8'),
                'description': metadata.get('description', ''),
                'links': [SystemLinksRegistry.serialize_link(link) for link in links]
            })
    
    # Add remaining categories
    for category, links in grouped_links.items():
        if category not in priority_categories:
            metadata = CATEGORY_METADATA.get(category, {})
            
            navigation.append({
                'category': category,
                'label': metadata.get('label', category.title()),
                'icon': metadata.get('icon', 'folder'),
                'color': metadata.get('color', '#1a73e8'),
                'description': metadata.get('description', ''),
                'links': [SystemLinksRegistry.serialize_link(link) for link in links]
            })
    
    return Response({
        'success': True,
        'data': {
            'navigation': navigation,
            'user_roles': user_roles
        }
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def search_links(request):
    """
    Search system links by query string
    
    Query Parameters:
    - q: Search query (required)
    """
    query = request.query_params.get('q', '').lower()
    
    if not query:
        return Response({
            'success': False,
            'error': 'Query parameter "q" is required'
        }, status=status.HTTP_400_BAD_REQUEST)
    
    user = request.user
    user_roles = []
    
    if hasattr(user, 'is_system_admin') and user.is_system_admin:
        user_roles.append('sys_admin')
    
    if user.is_staff:
        user_roles.append('admin')
    
    user_roles.append('authenticated')
    
    # Get all accessible links
    all_links = SystemLinksRegistry.get_links_for_user(user_roles, include_admin_only=True)
    
    # Search in title, description, and category
    matching_links = []
    for link in all_links:
        if (query in link.title.lower() or 
            query in link.description.lower() or 
            query in link.category.value.lower()):
            matching_links.append(SystemLinksRegistry.serialize_link(link))
    
    return Response({
        'success': True,
        'data': {
            'query': query,
            'count': len(matching_links),
            'results': matching_links
        }
    })
