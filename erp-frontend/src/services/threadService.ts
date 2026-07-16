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

  postMessage(threadId: number, body: string, attachment?: File): Promise<ThreadMessageItem> {
    if (attachment) {
      // Use FormData for file uploads
      const formData = new FormData();
      formData.append('thread', String(threadId));
      formData.append('body', body);
      formData.append('attachment', attachment);
      return api.post(`${MSG_BASE}/`, formData);
    }
    return api.post(`${MSG_BASE}/`, { thread: threadId, body });
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
