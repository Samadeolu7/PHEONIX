from rest_framework import serializers
from django.contrib.auth import get_user_model

from common.serializers import TenantModelSerializer
from .models import Thread, ThreadParticipant, ThreadMessage, MessageReadReceipt
from .permissions import thread_permissions_for_user

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
            'created_at', 'edited_at', 'read_by',
        ]
        read_only_fields = ['is_system_message', 'created_at', 'edited_at', 'author']

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
        if hasattr(obj, '_has_unread'):
            return obj._has_unread
        return obj.has_unread

class ThreadSerializer(serializers.ModelSerializer):
    participants = ThreadParticipantSerializer(many=True, read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    page_url = serializers.SerializerMethodField()
    page_module_code = serializers.SerializerMethodField()
    page_code = serializers.SerializerMethodField()
    linked_record_repr = serializers.SerializerMethodField()
    initiated_by_name = serializers.SerializerMethodField()
    closed_by_name = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = Thread
        fields = [
            'id', 'page', 'page_url', 'page_module_code', 'page_code',
            'content_type', 'object_id', 'linked_record_repr',
            'title', 'reason',
            'initiated_by', 'initiated_by_name',
            'status', 'closed_by', 'closed_by_name', 'closed_at',
            'participants', 'last_message', 'unread_count', 'permissions',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'title', 'initiated_by', 'status',
            'closed_by', 'closed_at', 'created_at', 'updated_at',
        ]

    def get_permissions(self, obj):
        request = self.context.get('request')
        if not request or not getattr(request, 'user', None) or not request.user.is_authenticated:
            return {
                'can_edit': False, 'can_close': False, 'can_reopen': False,
                'can_add_participants': False, 'is_participant': False, 'is_observer': False,
            }
        return thread_permissions_for_user(obj, request.user)

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
            # See ThreadParticipant.has_unread — a message the requesting
            # user wrote themselves never counts as unread for them.
            others_messages = obj.messages.filter(
                is_system_message=False, is_deleted=False,
            ).exclude(author=user)
            if not participant.last_read_at:
                return others_messages.count()
            return others_messages.filter(created_at__gt=participant.last_read_at).count()
        except ThreadParticipant.DoesNotExist:
            return 0

    def get_page_url(self, obj):
        return obj.page.url_path if obj.page_id else None

    def get_page_module_code(self, obj):
        # page_url is the catalog's static url_path (e.g. '/clients/clients/'
        # — a list page), which has no way to represent a specific record's
        # actual frontend route (e.g. '/clients/947' is its own hardcoded
        # React route, not derived from the catalog at all — see
        # GlobalThreadToggle.tsx/routeToPageMap.ts). module_code + page_code
        # + object_id let the frontend reverse-resolve the real per-record
        # URL instead of naively navigating to page_url and landing on the
        # list page.
        return obj.page.module.code if obj.page_id else None

    def get_page_code(self, obj):
        return obj.page.code if obj.page_id else None

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


class ThreadMessageUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ThreadMessage
        fields = ['body']
        extra_kwargs = {
            'body': {'required': True, 'allow_blank': False, 'max_length': 1000},
        }


class ThreadUpdateSerializer(serializers.ModelSerializer):
    """Allows updating mutable fields on an existing thread (title, reason)."""

    class Meta:
        model = Thread
        fields = ['title', 'reason']
        extra_kwargs = {
            'title': {'required': False, 'max_length': 300},
            'reason': {'required': False},
        }


class ThreadCreateSerializer(serializers.ModelSerializer):
    participant_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        default=list,
    )

    class Meta:
        model = Thread
        fields = ['title', 'page', 'content_type', 'object_id', 'reason', 'participant_ids']
        extra_kwargs = {
            # Left blank, Thread.save() falls back to the page's title (see
            # models.py) — same behavior as before this field was exposed
            # here. A real name is what lets someone tell threads on the
            # same page apart in the switcher instead of every one showing
            # the same generic page title.
            'title': {'required': False, 'max_length': 300},
        }

    def validate(self, attrs):
        page = attrs.get('page')
        if page is not None and page.get_thread_config().get('require_reason'):
            if not attrs.get('reason'):
                raise serializers.ValidationError(
                    {'reason': 'This page requires a reason to be selected when starting a discussion.'}
                )
        return attrs
