from rest_framework import serializers
from .models import SavedQuery
from common.serializers import TenantResourceSerializer

class SavedQuerySerializer(TenantResourceSerializer):
    """Serializer for SavedQuery model."""
    owner_name = serializers.ReadOnlyField(source='owner.get_full_name')
    
    class Meta:
        model = SavedQuery
        fields = [
            'id', 'tenant', 'name', 'description', 'query', 
            'parameters', 'owner', 'owner_name',
            'created_by', 'created_at', 'updated_at',
            'is_deleted'
        ]
        read_only_fields = [
            'tenant', 'owner', 'created_by', 
            'created_at', 'updated_at'
        ]