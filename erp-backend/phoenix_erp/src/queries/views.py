from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.decorators import action
from drf_spectacular.utils import extend_schema
from common.views import ScopedModelViewSet
from common.serializers import IsTenantUser
from .models import SavedQuery
from .serializers import SavedQuerySerializer

class SavedQueryViewSet(ScopedModelViewSet):
    """
    API endpoint that allows saved queries to be viewed or edited.
    Queries are scoped to tenant and owner.
    """
    permission_module = 'queries'
    permission_page = 'saved-queries'
    queryset = SavedQuery.objects.all()
    serializer_class = SavedQuerySerializer
    permission_classes = [permissions.IsAuthenticated, IsTenantUser]

    @extend_schema(description="Execute a saved query with optional parameters")
    @action(detail=True, methods=['post'])
    def execute(self, request, pk=None):
        """Execute the saved query with optional parameters."""
        query = self.get_object()

        if not query.user_has_permission(request.user):
            return Response(
                {'error': 'Permission denied'}, 
                status=403
            )

        # Validate parameters against schema
        parameters = request.data.get('parameters', {})
        # TODO: Implement parameter validation against query.parameters schema
        # TODO: Implement query execution logic

        return Response({
            'status': 'scheduled',
            'query_id': query.id,
            'parameters': parameters
        })