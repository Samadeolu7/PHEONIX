from django.contrib import admin
from .models import Thread, ThreadParticipant, ThreadMessage, MessageReadReceipt


class ThreadParticipantInline(admin.TabularInline):
    model = ThreadParticipant
    extra = 0
    fields = ('user', 'added_by', 'can_add_participants', 'last_read_at')
    readonly_fields = ('added_by', 'last_read_at')


class ThreadMessageInline(admin.TabularInline):
    model = ThreadMessage
    extra = 0
    fields = ('author', 'body', 'is_system_message', 'created_at')
    readonly_fields = ('created_at',)


@admin.register(Thread)
class ThreadAdmin(admin.ModelAdmin):
    list_display = ('title', 'page', 'initiated_by', 'status', 'branch', 'created_at')
    list_filter = ('status', 'reason', 'branch')
    search_fields = ('title', 'initiated_by__username')
    readonly_fields = ('initiated_by', 'closed_by', 'closed_at', 'created_at', 'updated_at')
    inlines = [ThreadParticipantInline, ThreadMessageInline]


@admin.register(ThreadMessage)
class ThreadMessageAdmin(admin.ModelAdmin):
    list_display = ('thread', 'author', 'is_system_message', 'created_at')
    list_filter = ('is_system_message',)
    readonly_fields = ('created_at',)


@admin.register(MessageReadReceipt)
class MessageReadReceiptAdmin(admin.ModelAdmin):
    list_display = ('message', 'participant', 'read_at')
    readonly_fields = ('read_at',)
