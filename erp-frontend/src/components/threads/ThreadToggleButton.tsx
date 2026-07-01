import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useThreadContext } from '../../contexts/ThreadContext';
import { threadService } from '../../services/threadService';

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

  const [isThreadable, setIsThreadable] = useState<boolean | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasOpenThreads, setHasOpenThreads] = useState(false);
  const [loading, setLoading] = useState(true);

  const isThisPageOpen =
    panelState !== 'hidden' && activeTarget?.pageId === pageId && activeTarget?.objectId === objectId;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    threadService
      .pageConfig(pageId)
      .then(cfg => {
        if (cancelled) return;
        setIsThreadable(cfg.is_threadable);

        if (cfg.is_threadable) {
          return threadService.list({
            page_id: pageId,
            ...(objectId ? { object_id: objectId } : {}),
          });
        }
      })
      .then(threads => {
        if (cancelled || !threads) return;
        const open = threads.filter(t => t.status === 'open');
        setHasOpenThreads(open.length > 0);
        setUnreadCount(threads.reduce((s, t) => s + (t.unread_count ?? 0), 0));
      })
      .catch(() => {
        if (!cancelled) setIsThreadable(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [pageId, objectId]);

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
