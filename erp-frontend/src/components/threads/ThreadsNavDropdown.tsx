/**
 * ThreadsNavDropdown — Nav bar MessageSquare icon linking straight to the
 * /discussions workspace (the preferred destination), with a live unread
 * badge sourced from the same widget-summary endpoint the old dashboard
 * ThreadWidget used.
 *
 * Replaces the old dashboard-only ThreadWidget as the sole source of
 * globalUnreadCount (ThreadContext) — that widget was removed from the
 * dashboard, so this is now what keeps the nav badge alive everywhere.
 */

import React, { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { threadService } from '../../services/threadService';
import { useThreadContext } from '../../contexts/ThreadContext';
import type { ThreadWidgetSummary } from '../../types/threads';

interface ThreadsNavDropdownProps {
  // Used in the mobile hamburger menu (dark background) — the desktop
  // navbar (light background) is the default and unaffected.
  variant?: 'light' | 'dark';
  // Mobile menu passes closeMobileMenu here so tapping the link also
  // dismisses the hamburger menu, matching every other mobile nav link.
  onClick?: () => void;
}

const ThreadsNavDropdown: React.FC<ThreadsNavDropdownProps> = ({ variant = 'dark', onClick }) => {
  const location = useLocation();
  const { setGlobalUnreadCount } = useThreadContext();

  const { data: summary } = useQuery<ThreadWidgetSummary>({
    queryKey: ['threads', 'widgetSummary'],
    queryFn: threadService.widgetSummary,
    // Pushed live by useNotificationSocket (RoleBasedLayout.tsx) via query
    // invalidation — this interval is only a fallback for a disconnected
    // socket.
    refetchInterval: 120_000,
    staleTime: 10_000,
    retry: 1,
  });

  useEffect(() => {
    if (summary) setGlobalUnreadCount(summary.unread_count);
  }, [summary, setGlobalUnreadCount]);

  const unreadTotal = summary?.unread_count ?? 0;
  const isActive = location.pathname.startsWith('/discussions') || location.pathname.startsWith('/threads');

  return (
    <Link
      to="/discussions"
      onClick={onClick}
      className={
        variant === 'dark'
          ? `relative p-2 rounded-md transition-colors ${isActive ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white hover:bg-white/10'}`
          : `relative p-2 rounded-lg transition-colors ${isActive ? 'bg-gray-100 text-gray-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'}`
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
    </Link>
  );
};

export default ThreadsNavDropdown;
