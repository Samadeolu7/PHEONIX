// Thread system types — mirrors the Django threads app API

export type ThreadStatus = 'open' | 'closed';

export type ThreadReason = 'query' | 'approval' | 'dispute' | 'note' | 'other';

export interface ThreadParticipantUser {
  id: number;
  username: string;
  full_name: string;
}

export interface MessageReadReceiptItem {
  participant: number;
  participant_name: string;
  read_at: string;
}

export interface MessageAttachmentItem {
  id: number;
  url: string | null;
  thumbnail_url: string | null;
  filename: string;
  content_type: string;
  size: number;
}

export interface ReplyToPreview {
  id: number;
  author_name: string;
  body: string;
}

export interface ThreadMessageItem {
  id: number;
  thread: number;
  author: number | null;
  author_name: string;
  body: string;
  attachment: string | null;
  attachment_url: string | null;
  attachments: MessageAttachmentItem[];
  reply_to: number | null;
  reply_to_preview: ReplyToPreview | null;
  is_system_message: boolean;
  created_at: string;
  edited_at: string | null;
  read_by: MessageReadReceiptItem[];
}

export interface ThreadParticipantItem {
  id: number;
  thread: number;
  user: number;
  user_info: ThreadParticipantUser;
  added_by: number | null;
  can_add_participants: boolean;
  last_read_at: string | null;
  has_unread: boolean;
}

export interface LinkedRecordRepr {
  app: string;
  model: string;
  id: number;
  repr: string;
}

export interface LastMessagePreview {
  id: number;
  body: string;
  is_system_message: boolean;
  author_name: string;
  created_at: string;
}

export interface ThreadPermissions {
  can_edit: boolean;
  can_close: boolean;
  can_reopen: boolean;
  can_add_participants: boolean;
  is_participant: boolean;
  // Oversight visibility (Director/Branch Manager) without being a tagged
  // participant — see ThreadViewSet.get_queryset / threads/permissions.py.
  is_observer: boolean;
  // Director-only escape hatch for a thread that must actually stay closed
  // — see Thread.lock/unlock and the auto-reopen-on-reply behavior it
  // overrides.
  can_lock: boolean;
  can_unlock: boolean;
}

export interface Thread {
  id: number;
  page: number;
  page_url: string | null;
  // See resolveThreadRecordUrl() in routeToPageMap.ts — page_url is the
  // catalog's static url_path (a list page's URL), which can't represent a
  // specific record's actual frontend route on its own.
  page_module_code: string | null;
  page_code: string | null;
  content_type: number | null;
  object_id: number | null;
  linked_record_repr: LinkedRecordRepr | null;
  title: string;
  reason: ThreadReason | '';
  initiated_by: number;
  initiated_by_name: string;
  status: ThreadStatus;
  closed_by: number | null;
  closed_by_name: string | null;
  closed_at: string | null;
  is_locked: boolean;
  participants: ThreadParticipantItem[];
  last_message: LastMessagePreview | null;
  unread_count: number;
  permissions: ThreadPermissions;
  created_at: string;
  updated_at: string;
}

export interface ThreadWidgetSummary {
  unread_count: number;
  recent_threads: {
    id: number;
    page: number | null;
    title: string;
    last_message_preview: string;
    last_activity: string;
    unread_messages: number;
    page_url: string | null;
    page_module_code: string | null;
    page_code: string | null;
    object_id: number | null;
    status: ThreadStatus;
  }[];
}

export interface PageThreadConfig {
  page_id: number;
  title: string;
  page_type: string;
  is_threadable: boolean;
  can_initiate: boolean;
  thread: {
    auto_include_roles?: string[];
    max_open_threads?: number;
    require_reason?: boolean;
  };
}

export interface CreateThreadPayload {
  page: number;
  title?: string;
  content_type?: number;
  object_id?: number;
  reason?: ThreadReason | '';
  participant_ids?: number[];
}

export type PanelState = 'hidden' | 'open' | 'minimised';
