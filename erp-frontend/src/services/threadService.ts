import { api } from './api';
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

  list(params?: {
    status?: 'open' | 'closed';
    unread?: boolean;
    page_id?: number;
    branch?: number;
    search?: string;
  }): Promise<Thread[]> {
    return api.get(`${BASE}/`, { params });
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

  listMessages(threadId: number, afterId?: number): Promise<ThreadMessageItem[]> {
    return api.get(`${MSG_BASE}/`, {
      params: { thread: threadId, ...(afterId ? { after: afterId } : {}) },
    });
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

  listParticipants(threadId: number): Promise<ThreadParticipantItem[]> {
    return api.get(`${PART_BASE}/`, { params: { thread: threadId } });
  },

  addParticipant(threadId: number, userId: number): Promise<ThreadParticipantItem> {
    return api.post(`${PART_BASE}/`, { thread: threadId, user: userId });
  },

  removeParticipant(participantId: number): Promise<void> {
    return api.delete(`${PART_BASE}/${participantId}/`);
  },
};
