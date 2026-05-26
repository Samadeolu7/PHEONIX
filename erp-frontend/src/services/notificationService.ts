/**
 * Notification Service
 *
 * Wraps the backend /api/notifications/ endpoints for
 * fetching, reading, and managing user notifications.
 */

import { api } from './api';

// ── Types ─────────────────────────────────────────────────────────────────────

export type NotificationPriority = 'low' | 'normal' | 'high' | 'urgent';

export type NotificationStatus =
  | 'pending'
  | 'scheduled'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'cancelled'
  | 'read';

export interface Notification {
  id: number;
  subject: string;
  message: string;
  status: NotificationStatus;
  priority: NotificationPriority;
  channel_name: string;
  is_read: boolean;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationDetail extends Notification {
  template_name: string | null;
  html_message: string;
  scheduled_for: string | null;
  delivered_at: string | null;
  read_at: string | null;
  error_message: string;
  retry_count: number;
}

export interface UnreadCount {
  total: number;
  by_priority: Record<string, number>;
}

export interface NotificationListParams {
  page?: number;
  page_size?: number;
  status?: NotificationStatus;
  priority?: NotificationPriority;
  search?: string;
}

export interface PaginatedNotifications {
  count: number;
  next: string | null;
  previous: string | null;
  results: Notification[];
}

// ── Service ───────────────────────────────────────────────────────────────────

const BASE = '/notifications/notifications';

export const notificationService = {
  /**
   * List current user's notifications (paginated)
   */
  async list(params?: NotificationListParams): Promise<PaginatedNotifications> {
    return api.get(`${BASE}/`, { params });
  },

  /**
   * Get a single notification's full details
   */
  async get(id: number): Promise<NotificationDetail> {
    return api.get(`${BASE}/${id}/`);
  },

  /**
   * Mark a single notification as read
   */
  async markRead(id: number): Promise<{ status: string }> {
    return api.post(`${BASE}/${id}/mark_read/`, {});
  },

  /**
   * Mark ALL unread notifications as read
   */
  async markAllRead(): Promise<{ status: string }> {
    return api.post(`${BASE}/mark_all_read/`, {});
  },

  /**
   * Get unread count with priority breakdown
   */
  async unreadCount(): Promise<UnreadCount> {
    return api.get(`${BASE}/unread_count/`);
  },

  /**
   * Get notification statistics
   */
  async stats(): Promise<Record<string, unknown>> {
    return api.get(`${BASE}/stats/`);
  },
};

// Note: keep only the named export `notificationService` to avoid duplicate
// export issues when bundling. Consumers should import { notificationService }.
