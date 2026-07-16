import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, RefreshCw, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { threadService } from '../../services/threadService';
import { useThreadContext } from '../../contexts/ThreadContext';
import { resolveThreadRecordUrl } from '../../config/routeToPageMap';
import type { ThreadWidgetSummary } from '../../types/threads';

const BADGE_POLL_MS = 30000;

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const ThreadWidget: React.FC = () => {
  const navigate = useNavigate();
  const { openPanel, setGlobalUnreadCount } = useThreadContext();
  const [summary, setSummary] = useState<ThreadWidgetSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchSummary = useCallback(async () => {
    try {
      setError(false);
      const data = await threadService.widgetSummary();
      setSummary(data);
      setGlobalUnreadCount(data.unread_count);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [setGlobalUnreadCount]);

  useEffect(() => {
    fetchSummary();
    const timer = setInterval(fetchSummary, BADGE_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchSummary]);

  const handleThreadClick = (thread: ThreadWidgetSummary['recent_threads'][number]) => {
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
      // Use SPA navigation and pass the thread ID so the destination page can auto-open the panel
      navigate(url, { state: { openThreadId: thread.id, pageId: thread.page } });
    } else {
      navigate('/threads');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Widget header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#0a1857]" />
          <span className="text-sm font-semibold text-gray-900">Discussions</span>
          {summary && summary.unread_count > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {summary.unread_count}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchSummary}
            title="Refresh"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <a
            href="/threads"
            title="View all threads"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="flex justify-center items-center h-24">
          <div className="w-5 h-5 border-2 border-[#0a1857] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && error && (
        <div className="flex flex-col items-center justify-center h-20 gap-2">
          <p className="text-xs text-gray-500">Failed to load discussions</p>
          <button onClick={fetchSummary} className="text-xs text-[#0a1857] hover:underline">
            Retry
          </button>
        </div>
      )}

      {!loading && !error && summary?.recent_threads.length === 0 && (
        <div className="flex flex-col items-center justify-center h-20 gap-1">
          <p className="text-xs text-gray-400">No active discussions</p>
        </div>
      )}

      {!loading && !error && summary && summary.recent_threads.length > 0 && (
        <ul className="divide-y divide-gray-50">
          {summary.recent_threads.map(thread => (
            <li key={thread.id}>
              <button
                onClick={() => handleThreadClick(thread)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-xs font-medium truncate',
                        thread.unread_messages > 0 ? 'text-gray-900' : 'text-gray-600'
                      )}
                    >
                      {thread.title}
                    </p>
                    {thread.last_message_preview && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">
                        {thread.last_message_preview}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">
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
            </li>
          ))}
        </ul>
      )}

      {/* Footer link */}
      {!loading && !error && summary && summary.recent_threads.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100">
          <a
            href="/threads"
            className="text-xs text-[#0a1857] hover:underline"
          >
            View all discussions →
          </a>
        </div>
      )}
    </div>
  );
};
