from rest_framework import serializers
from django.contrib.auth import get_user_model

from common.serializers import TenantModelSerializer
from .models import Thread, ThreadParticipant, ThreadMessage, MessageReadReceipt

User = get_user_model()


class ParticipantUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'full_name']

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.username


class MessageReadReceiptSerializer(serializers.ModelSerializer):
    participant_name = serializers.SerializerMethodField()

    class Meta:
        model = MessageReadReceipt
        fields = ['participant', 'participant_name', 'read_at']

    def get_participant_name(self, obj):
        return obj.participant.get_full_name() or obj.participant.username


class ThreadMessageSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    read_by = serializers.SerializerMethodField()
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = ThreadMessage
        fields = [
            'id', 'thread', 'author', 'author_name', 'body',
            'attachment', 'attachment_url', 'is_system_message',
            'created_at', 'read_by',
        ]
        read_only_fields = ['is_system_message', 'created_at', 'author']

    def get_author_name(self, obj):
        if obj.author:
            return obj.author.get_full_name() or obj.author.username
        return 'System'

    def get_read_by(self, obj):
        return MessageReadReceiptSerializer(
            obj.read_receipts.select_related('participant').all(),
            many=True,
        ).data

    def get_attachment_url(self, obj):
        if obj.attachment:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.attachment.url)
        return None


class ThreadParticipantSerializer(serializers.ModelSerializer):
    user_info = ParticipantUserSerializer(source='user', read_only=True)
    has_unread = serializers.SerializerMethodField()

    class Meta:
        model = ThreadParticipant
        fields = [
            'id', 'thread', 'user', 'user_info', 'added_by',
            'can_add_participants', 'last_read_at', 'has_unread',
        ]
        read_only_fields = ['can_add_participants', 'last_read_at', 'added_by']

    def get_has_unread(self, obj):
        return obj.has_unread


class ThreadSerializer(serializers.ModelSerializer):
    participants = ThreadParticipantSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    page_url = serializers.SerializerMethodField()
    linked_record_repr = serializers.SerializerMethodField()
    initiated_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Thread
        fields = [
            'id', 'page', 'page_url',
            'content_type', 'object_id', 'linked_record_repr',
            'title', 'reason',
            'initiated_by', 'initiated_by_name',
            'status', 'closed_by', 'closed_by_name', 'closed_at',
            'participants', 'last_message', 'unread_count',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'title', 'initiated_by', 'status',
            'closed_by', 'closed_at', 'created_at', 'updated_at',
        ]

    def get_last_message(self, obj):
        msg = obj.messages.filter(is_deleted=False).order_by('-created_at').first()
        if not msg:
            return None
        return {
            'id': msg.id,
            'body': msg.body[:100],
            'is_system_message': msg.is_system_message,
            'author_name': (msg.author.get_full_name() or msg.author.username) if msg.author else 'System',
            'created_at': msg.created_at,
        }

    def get_unread_count(self, obj):
        request = self.context.get('request')
        if not request:
            return 0
        user = request.user
        try:
            participant = obj.participants.get(user=user, is_deleted=False)
            if not participant.last_read_at:
                return obj.messages.filter(is_system_message=False, is_deleted=False).count()
            return obj.messages.filter(
                created_at__gt=participant.last_read_at,
                is_system_message=False,
                is_deleted=False,
            ).count()
        except ThreadParticipant.DoesNotExist:
            return 0

    def get_page_url(self, obj):
        return obj.page.url_path if obj.page_id else None

    def get_linked_record_repr(self, obj):
        if obj.linked_record:
            return {
                'app': obj.content_type.app_label,
                'model': obj.content_type.model,
                'id': obj.object_id,
                'repr': str(obj.linked_record),
            }
        return None

    def get_initiated_by_name(self, obj):
        return obj.initiated_by.get_full_name() or obj.initiated_by.username

    def get_closed_by_name(self, obj):
        if obj.closed_by:
            return obj.closed_by.get_full_name() or obj.closed_by.username
        return None


class ThreadCreateSerializer(serializers.ModelSerializer):
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Thread
        fields = ['page', 'content_type', 'object_id', 'reason', 'participant_ids']
