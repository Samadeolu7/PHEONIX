/**
 * NotificationDropdown — Header bell icon with live unread count and dropdown
 *
 * Replaces the static bell placeholder in DashboardLayout.
 * Fetches unread count on mount, polls every 30 s, and shows a dropdown
 * with the most recent notifications on click.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck, AlertTriangle, Info, Loader2 } from 'lucide-react';
import { notificationService } from '../../services/notificationService';
import type { Notification, NotificationPriority } from '../../services/notificationService';

// ── helpers ───────────────────────────────────────────────────────────────────

const priorityConfig: Record<NotificationPriority, { dot: string; bg: string }> = {
  urgent: { dot: 'bg-red-500', bg: 'bg-red-50' },
  high: { dot: 'bg-orange-500', bg: 'bg-orange-50' },
  normal: { dot: 'bg-blue-500', bg: 'bg-blue-50' },
  low: { dot: 'bg-gray-400', bg: 'bg-gray-50' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── component ─────────────────────────────────────────────────────────────────

const NotificationDropdown: React.FC = () => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // ── queries ───────────────────────────────────────────────────────────────

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unreadCount'],
    queryFn: () => notificationService.unreadCount(),
    refetchInterval: 30_000, // poll every 30 s
    staleTime: 10_000,
    retry: 1,
  });

  const {
    data: notificationsData,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['notifications', 'recent'],
    queryFn: () => notificationService.list({ page_size: 8 }),
    enabled: open, // only fetch when dropdown is visible
    staleTime: 15_000,
  });

  const notifications = notificationsData?.results ?? [];
  const unreadTotal = unread?.total ?? 0;

  // ── mutations ─────────────────────────────────────────────────────────────

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationService.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationService.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleMarkRead = useCallback(
    (id: number, e: React.MouseEvent) => {
      e.stopPropagation();
      markReadMutation.mutate(id);
    },
    [markReadMutation]
  );

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell trigger */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label={`Notifications${unreadTotal > 0 ? ` (${unreadTotal} unread)` : ''}`}
      >
        <Bell className="w-5 h-5" />
        {unreadTotal > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-red-500 rounded-full leading-none">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadTotal > 0 && (
              <button
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 disabled:opacity-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading…
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <AlertTriangle className="w-5 h-5 mb-1 text-amber-400" />
                <span className="text-xs">Failed to load notifications</span>
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Bell className="w-6 h-6 mb-1" />
                <span className="text-xs">No notifications yet</span>
              </div>
            ) : (
              notifications.map((n: Notification) => {
                const cfg = priorityConfig[n.priority] ?? priorityConfig.normal;
                return (
                  <div
                    key={n.id}
                    className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer ${
                      !n.is_read ? cfg.bg : ''
                    }`}
                    onClick={() => {
                      if (!n.is_read) markReadMutation.mutate(n.id);
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Priority dot */}
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          !n.is_read ? cfg.dot : 'bg-transparent'
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm leading-snug ${
                            !n.is_read ? 'font-medium text-gray-900' : 'text-gray-600'
                          }`}
                        >
                          {n.subject}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">{n.message}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {/* Mark-read button */}
                      {!n.is_read && (
                        <button
                          onClick={e => handleMarkRead(n.id, e)}
                          className="mt-1 p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Mark as read"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
              <button
                onClick={() => {
                  setOpen(false);
                  // Navigate to full notifications page if it exists
                  window.location.hash = '#/notifications';
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationDropdown;
