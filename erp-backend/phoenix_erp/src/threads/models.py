from django.db import models
from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.utils import timezone

from common.base import TimeStampedModel, BranchScopedModel, SoftDeleteModel
from common.managers import OwnerBranchManager


class Thread(TimeStampedModel, BranchScopedModel, SoftDeleteModel):
    STATUS_OPEN = 'open'
    STATUS_CLOSED = 'closed'
    STATUS_CHOICES = [
        (STATUS_OPEN, 'Open'),
        (STATUS_CLOSED, 'Closed'),
    ]

    REASON_CHOICES = [
        ('query', 'Query'),
        ('approval', 'Approval Needed'),
        ('dispute', 'Dispute'),
        ('note', 'Note'),
        ('other', 'Other'),
    ]

    page = models.ForeignKey(
        'pages.ModulePage',
        on_delete=models.CASCADE,
        related_name='threads',
    )
    # Optional link to the specific record on the page (e.g. Loan #1234)
    content_type = models.ForeignKey(ContentType, on_delete=models.SET_NULL, null=True, blank=True)
    object_id = models.PositiveIntegerField(null=True, blank=True)
    linked_record = GenericForeignKey('content_type', 'object_id')

    title = models.CharField(max_length=300, blank=True)
    initiated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='initiated_threads',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default=STATUS_OPEN, db_index=True)
    closed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='closed_threads',
    )
    closed_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=20, choices=REASON_CHOICES, blank=True)
    # A closed-but-unlocked thread auto-reopens the moment a participant (or
    # Director) posts to it again — see ThreadMessageViewSet.perform_create.
    # is_locked is the explicit, Director-only escape hatch for threads that
    # must actually stay closed (audit-finalized, compliance-sensitive).
    is_locked = models.BooleanField(default=False)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['page', 'status']),
            models.Index(fields=['content_type', 'object_id']),
            models.Index(fields=['initiated_by', 'status']),
            models.Index(fields=['tenant', 'status']),
        ]

    def __str__(self):
        return self.title or f"Thread on {self.page}"

    def save(self, *args, **kwargs):
        if not self.title:
            if self.linked_record:
                try:
                    self.title = f"{self.page.title} — {self.linked_record}"
                except Exception:
                    self.title = self.page.title if self.page_id else ''
            elif self.page_id:
                try:
                    self.title = self.page.title
                except Exception:
                    pass
        super().save(*args, **kwargs)

    def close(self, user):
        if self.status == self.STATUS_CLOSED:
            raise ValidationError("Thread is already closed.")
        self.status = self.STATUS_CLOSED
        self.closed_by = user
        self.closed_at = timezone.now()
        self.save(update_fields=['status', 'closed_by', 'closed_at', 'updated_at'])

    def reopen(self, user):
        if self.status == self.STATUS_OPEN:
            raise ValidationError("Thread is already open.")
        self.status = self.STATUS_OPEN
        self.closed_by = None
        self.closed_at = None
        self.save(update_fields=['status', 'closed_by', 'closed_at', 'updated_at'])

    def lock(self, user):
        if self.status != self.STATUS_CLOSED:
            raise ValidationError("Only a closed thread can be locked.")
        if self.is_locked:
            raise ValidationError("Thread is already locked.")
        self.is_locked = True
        self.save(update_fields=['is_locked', 'updated_at'])

    def unlock(self, user):
        if not self.is_locked:
            raise ValidationError("Thread is not locked.")
        self.is_locked = False
        self.save(update_fields=['is_locked', 'updated_at'])


class ThreadParticipant(TimeStampedModel, SoftDeleteModel):
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='participants')
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='thread_participations',
    )
    added_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='thread_additions',
    )
    can_add_participants = models.BooleanField(default=False)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = [('thread', 'user')]
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user} in Thread #{self.thread_id}"

    def mark_read(self):
        self.last_read_at = timezone.now()
        self.save(update_fields=['last_read_at'])

    @property
    def has_unread(self):
        # A message this participant wrote themselves was, by definition,
        # already "read" by them — without this exclude, replying in a
        # thread and not immediately re-marking it read (e.g. a poll tick
        # that doesn't call read/) makes that thread look unread to its own
        # author, indistinguishable from a thread someone else actually
        # needs to look at.
        others_messages = self.thread.messages.filter(
            is_system_message=False, is_deleted=False,
        ).exclude(author=self.user)
        if not self.last_read_at:
            return others_messages.exists()
        return others_messages.filter(created_at__gt=self.last_read_at).exists()


class ThreadMessage(TimeStampedModel, SoftDeleteModel):
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name='thread_messages',
        null=True, blank=True,  # null for system messages
    )
    body = models.TextField(max_length=1000, blank=True)
    # Legacy single-attachment field — no longer written to by new messages
    # (see ThreadMessageAttachment below), kept only so already-sent messages
    # keep rendering. New attachments always go through ThreadMessageAttachment.
    attachment = models.FileField(upload_to='threads/attachments/', null=True, blank=True)
    is_system_message = models.BooleanField(default=False, db_index=True)
    edited_at = models.DateTimeField(null=True, blank=True)
    reply_to = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='replies',
    )

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        if self.is_system_message:
            return f"[system] {self.body[:60]}"
        return f"{self.author} @ {self.created_at:%H:%M}: {self.body[:60]}"


class ThreadMessageAttachment(TimeStampedModel, SoftDeleteModel):
    message = models.ForeignKey(ThreadMessage, on_delete=models.CASCADE, related_name='attachments')
    file = models.FileField(upload_to='threads/attachments/')
    content_type = models.CharField(max_length=100, blank=True)
    size = models.PositiveIntegerField(default=0)

    objects = OwnerBranchManager()
    all_objects = OwnerBranchManager(include_deleted=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return self.file.name


class MessageReadReceipt(models.Model):
    message = models.ForeignKey(ThreadMessage, on_delete=models.CASCADE, related_name='read_receipts')
    participant = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='message_read_receipts',
    )
    read_at = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = [('message', 'participant')]

    def __str__(self):
        return f"{self.participant} read message #{self.message_id}"
