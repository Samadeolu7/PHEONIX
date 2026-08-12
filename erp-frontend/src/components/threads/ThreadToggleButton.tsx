import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useThreadContext } from '../../contexts/ThreadContext';
import { threadService } from '../../services/threadService';

// Pushed live by useNotificationSocket (RoleBasedLayout.tsx) via query
// invalidation — this is only a fallback for a disconnected socket now.
const BADGE_POLL_MS = 120_000;

interface Props {
  /** The ModulePage id for this detail page */
  pageId: number;
  /** The ContentType id of the record being viewed */
  contentTypeId?: number;
  /** The PK of the specific record */
  objectId?: number;
  /** Human-readable label shown in the panel header, e.g. "Loan #1234 – James Okafor" */
  recordLabel?: string;
  className?: string;
}

export const ThreadToggleButton: React.FC<Props> = ({
  pageId,
  contentTypeId,
  objectId,
  recordLabel,
  className,
}) => {
  const { openPanel, panelState, activeTarget, closePanel } = useThreadContext();
  const location = useLocation();

  const isThisPageOpen =
    panelState !== 'hidden' && activeTarget?.pageId === pageId && activeTarget?.objectId === objectId;

  const { data: pageConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ['threads', 'pageConfig', pageId],
    queryFn: () => threadService.pageConfig(pageId),
    staleTime: 60_000,
  });
  const isThreadable = pageConfig?.is_threadable ?? null;

  const listParams = { page_id: pageId, ...(objectId ? { object_id: objectId } : {}) };
  // Same queryKey shape as ThreadPanel's list query — shares its cache, so
  // this badge also benefits from ThreadPanel's more frequent poll whenever
  // the panel happens to be open on this record, without an extra request.
  const { data: threads = [], isLoading: loadingThreads } = useQuery({
    queryKey: ['threads', 'list', listParams],
    queryFn: () => threadService.list(listParams),
    enabled: !!isThreadable,
    staleTime: 5_000,
    // Independent backstop so the badge doesn't go stale when ThreadPanel
    // isn't mounted/open for this record (e.g. new message arrives while
    // the user reads it elsewhere, or the panel gets closed after reading).
    refetchInterval: BADGE_POLL_MS,
  });

  const loading = loadingConfig || (!!isThreadable && loadingThreads);
  const hasOpenThreads = threads.some(t => t.status === 'open');
  const unreadCount = threads.reduce((s, t) => s + (t.unread_count ?? 0), 0);

  // Auto-open panel when navigated here from inbox/widget with a specific thread ID
  useEffect(() => {
    const state = location.state as { openThreadId?: number; pageId?: number } | null;
    if (state?.openThreadId && state?.pageId === pageId && isThreadable) {
      openPanel({ pageId, contentTypeId, objectId, recordLabel, threadId: state.openThreadId });
      // Clear the navigation state so re-renders don't re-trigger
      window.history.replaceState({}, '');
    }
  }, [location.state, pageId, isThreadable, contentTypeId, objectId, recordLabel, openPanel]);

  if (loading || !isThreadable) return null;

  const handleClick = () => {
    if (isThisPageOpen) {
      closePanel();
    } else {
      openPanel({ pageId, contentTypeId, objectId, recordLabel });
    }
  };

  return (
    <button
      onClick={handleClick}
      title={isThisPageOpen ? 'Close discussion panel' : 'Open discussion panel'}
      className={cn(
        'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium',
        'border transition-colors',
        isThisPageOpen
          ? 'bg-[#0a1857] text-white border-[#0a1857]'
          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
        className
      )}
    >
      <MessageSquare className="w-4 h-4" />
      <span>Discuss</span>

      {/* Unread badge */}
      {unreadCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}

      {/* Pulsing dot for open threads with no unread (subtle reminder) */}
      {hasOpenThreads && unreadCount === 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full" />
      )}
    </button>
  );
};
