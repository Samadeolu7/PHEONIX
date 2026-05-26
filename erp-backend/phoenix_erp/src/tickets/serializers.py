# tickets/serializers.py
from rest_framework import serializers
from common.serializers import TenantModelSerializer
from .models import Ticket, TicketComment

class TicketCommentSerializer(TenantModelSerializer):
    class Meta:
        model = TicketComment
        fields = ['id', 'ticket', 'author', 'message', 'created_at', 'updated_at']


class TicketSerializer(TenantModelSerializer):
    comments = TicketCommentSerializer(many=True, read_only=True)
    linked_object = serializers.SerializerMethodField()

    class Meta:
        model  = Ticket
        fields = [
            'id','title','description','category','status','priority',
            'linked_object','created_by','assigned_to','comments',
            'owner','branch','created_at','updated_at'
        ]

    def get_linked_object(self, obj):
        if obj.linked_object:
            return {
                "app": obj.content_type.app_label,
                "model": obj.content_type.model,
                "id": obj.object_id,
                "repr": str(obj.linked_object)
            }
        return None
