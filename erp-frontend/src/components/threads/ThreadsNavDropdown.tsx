/**
 * ThreadsNavDropdown — Nav bar MessageSquare icon with live unread count and
 * a recent-discussions dropdown, in the same pattern as NotificationDropdown.
 *
 * Replaces the old dashboard-only ThreadWidget as the sole source of
 * globalUnreadCount (ThreadContext) — that widget was removed from the
 * dashboard, so this is now what keeps the nav badge alive everywhere.
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';
import { threadService } from '../../services/threadService';
import { useThreadContext } from '../../contexts/ThreadContext';
import { resolveThreadRecordUrl } from '../../config/routeToPageMap';
import type { ThreadWidgetSummary } from '../../types/threads';

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface ThreadsNavDropdownProps {
  // Used in the mobile hamburger menu (dark background) — the desktop
  // navbar (light background) is the default and unaffected.
  variant?: 'light' | 'dark';
}

const ThreadsNavDropdown: React.FC<ThreadsNavDropdownProps> = ({ variant = 'dark' }) => {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { setGlobalUnreadCount } = useThreadContext();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const { data: summary, isLoading, isError } = useQuery<ThreadWidgetSummary>({
    queryKey: ['threads', 'widgetSummary'],
    queryFn: threadService.widgetSummary,
    // Pushed live by useNotificationSocket (RoleBasedLayout.tsx) via query
    // invalidation — this interval is only a fallback for a disconnected
    // socket. Runs unconditionally (not just while `open`) since the nav
    // badge needs a fresh count on every page, not only when the dropdown
    // is open.
    refetchInterval: 120_000,
    staleTime: 10_000,
    retry: 1,
  });

  useEffect(() => {
    if (summary) setGlobalUnreadCount(summary.unread_count);
  }, [summary, setGlobalUnreadCount]);

  const unreadTotal = summary?.unread_count ?? 0;
  const recentThreads = summary?.recent_threads ?? [];

  const handleThreadClick = (thread: ThreadWidgetSummary['recent_threads'][number]) => {
    setOpen(false);
    // page_url alone is the catalog's static list-page URL — resolve the
    // actual per-record route (e.g. '/clients/947', not '/clients/clients/')
    // via the same module/page taxonomy the rest of the app already uses.
    const url = resolveThreadRecordUrl({
      moduleCode: thread.page_module_code,
      pageCode: thread.page_code,
      objectId: thread.object_id,
      fallbackUrl: thread.page_url,
    });
    if (url) {
      navigate(url, { state: { openThreadId: thread.id, pageId: thread.page } });
    } else {
      navigate('/discussions', { state: { openThreadId: thread.id } });
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(prev => !prev)}
        className={
          variant === 'dark'
            ? 'relative p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-md transition-colors'
            : 'relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors'
        }
        aria-label={`Discussions${unreadTotal > 0 ? ` (${unreadTotal} unread)` : ''}`}
        title="Discussions"
      >
        <MessageSquare className="h-4 w-4" />
        {unreadTotal > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[8px] font-bold min-w-[14px] h-3.5 px-0.5 rounded-full flex items-center justify-center">
            {unreadTotal > 99 ? '99+' : unreadTotal}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Discussions</h3>
            {unreadTotal > 0 && (
              <span className="text-xs text-gray-400">{unreadTotal} unread</span>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-10 text-gray-400 text-xs">
                Loading…
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <span className="text-xs">Failed to load discussions</span>
              </div>
            ) : recentThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                <Hash className="w-6 h-6 mb-1" />
                <span className="text-xs">No active discussions</span>
              </div>
            ) : (
              recentThreads.map(thread => (
                <button
                  key={thread.id}
                  onClick={() => handleThreadClick(thread)}
                  className="w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          'text-sm truncate',
                          thread.unread_messages > 0 ? 'font-medium text-gray-900' : 'text-gray-600'
                        )}
                      >
                        {thread.title}
                      </p>
                      {thread.last_message_preview && (
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {thread.last_message_preview}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <span className="text-[11px] text-gray-400">
                        {timeAgo(thread.last_activity)}
                      </span>
                      {thread.unread_messages > 0 && (
                        <span className="bg-[#0a1857] text-white text-[9px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center">
                          {thread.unread_messages}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 text-center">
            <button
              onClick={() => {
                setOpen(false);
                navigate('/discussions');
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              View all discussions
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ThreadsNavDropdown;
