import { api, unwrapList } from './api';
import type {
  Thread,
  ThreadMessageItem,
  ThreadParticipantItem,
  ThreadWidgetSummary,
  PageThreadConfig,
  CreateThreadPayload,
} from '../types/threads';

const BASE = '/threads/threads';
const MSG_BASE = '/threads/thread-messages';
const PART_BASE = '/threads/thread-participants';

export const threadService = {
  // ── Threads ────────────────────────────────────────────────────────────────

  async list(params?: {
    status?: 'open' | 'closed';
    unread?: boolean;
    page_id?: number;
    branch?: number;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<Thread[]> {
    const res = await api.get(`${BASE}/`, { params });
    return unwrapList<Thread>(res);
  },

  get(id: number): Promise<Thread> {
    return api.get(`${BASE}/${id}/`);
  },

  create(payload: CreateThreadPayload): Promise<Thread> {
    return api.post(`${BASE}/`, payload);
  },

  close(id: number): Promise<Thread> {
    return api.post(`${BASE}/${id}/close/`, {});
  },

  reopen(id: number): Promise<Thread> {
    return api.post(`${BASE}/${id}/reopen/`, {});
  },

  requestJoin(id: number): Promise<{ status: string }> {
    return api.post(`${BASE}/${id}/request-join/`, {});
  },

  escalate(id: number): Promise<Thread> {
    return api.post(`${BASE}/${id}/escalate/`, {});
  },

  lock(id: number): Promise<Thread> {
    return api.post(`${BASE}/${id}/lock/`, {});
  },

  unlock(id: number): Promise<Thread> {
    return api.post(`${BASE}/${id}/unlock/`, {});
  },

  markRead(id: number): Promise<{ status: string }> {
    return api.post(`${BASE}/${id}/read/`, {});
  },

  widgetSummary(): Promise<ThreadWidgetSummary> {
    return api.get(`${BASE}/widget-summary/`);
  },

  pageConfig(pageId: number): Promise<PageThreadConfig> {
    return api.get(`${BASE}/page-config/${pageId}/`);
  },

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(threadId: number, afterId?: number, page?: number): Promise<ThreadMessageItem[]> {
    const params: Record<string, any> = { thread: threadId };
    if (afterId) params.after = afterId;
    if (page) params.page = page;
    const res = await api.get(`${MSG_BASE}/`, { params });
    return unwrapList<ThreadMessageItem>(res);
  },

  postMessage(
    threadId: number,
    body: string,
    options?: {
      attachments?: File[];
      mentionedUserIds?: number[];
      replyToId?: number;
    }
  ): Promise<ThreadMessageItem> {
    const { attachments, mentionedUserIds, replyToId } = options ?? {};
    if ((attachments && attachments.length > 0)) {
      const formData = new FormData();
      formData.append('thread', String(threadId));
      formData.append('body', body);
      attachments.forEach(f => formData.append('attachments', f));
      (mentionedUserIds ?? []).forEach(id => formData.append('mentioned_user_ids', String(id)));
      if (replyToId) formData.append('reply_to', String(replyToId));
      // api.post() unconditionally JSON.stringifies its payload — passing a
      // FormData instance through it serializes to the literal string "{}"
      // (FormData has no enumerable own properties), silently dropping the
      // thread id, body, and every file. postFormData() is the client's
      // actual FormData-aware path (see services/api.ts): no Content-Type
      // override, body passed through as-is so the browser sets the
      // multipart boundary itself. This exact mistake was already present
      // in the pre-existing single-attachment code this replaced.
      return api.postFormData(`${MSG_BASE}/`, formData);
    }
    return api.post(`${MSG_BASE}/`, {
      thread: threadId,
      body,
      mentioned_user_ids: mentionedUserIds ?? [],
      ...(replyToId ? { reply_to: replyToId } : {}),
    });
  },

  // ── Participants ───────────────────────────────────────────────────────────

  async listParticipants(threadId: number): Promise<ThreadParticipantItem[]> {
    const res = await api.get(`${PART_BASE}/`, { params: { thread: threadId } });
    return unwrapList<ThreadParticipantItem>(res);
  },

  addParticipant(threadId: number, userId: number): Promise<ThreadParticipantItem> {
    return api.post(`${PART_BASE}/`, { thread: threadId, user: userId });
  },

  removeParticipant(participantId: number): Promise<void> {
    return api.delete(`${PART_BASE}/${participantId}/`);
  },

  // ── Thread metadata update ─────────────────────────────────────────────────

  updateThread(id: number, payload: { title?: string; reason?: string }): Promise<Thread> {
    return api.patch(`${BASE}/${id}/`, payload);
  },

  // ── Message edit / soft-delete ─────────────────────────────────────────────

  editMessage(messageId: number, body: string): Promise<ThreadMessageItem> {
    return api.patch(`${MSG_BASE}/${messageId}/`, { body });
  },

  deleteMessage(messageId: number): Promise<void> {
    return api.delete(`${MSG_BASE}/${messageId}/`);
  },

  // ── User search (for participant picker) ───────────────────────────────────

  async searchUsers(q?: string): Promise<{ id: number; username: string; full_name: string }[]> {
    // A blank/short q is intentional here (not an early-return case like it
    // used to be) — the backend treats it as "list staff in my branch"
    // rather than a search, so the picker has something to show before the
    // user types anything.
    const res = await api.get('/users/staff-users/search/', { params: q ? { q } : {} });
    return unwrapList<{ id: number; username: string; full_name: string }>(res);
  },
};
