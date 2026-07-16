import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, Search, ExternalLink, RefreshCw, Lock, Unlock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { threadService } from '../../services/threadService';
import { useThreadContext } from '../../contexts/ThreadContext';
import { useAuth } from '../../contexts/AuthContext';
import { resolveThreadRecordUrl } from '../../config/routeToPageMap';
import type { Thread } from '../../types/threads';

type TabKey = 'mine' | 'unread' | 'started' | 'closed' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'unread', label: 'Unread' },
  { key: 'started', label: 'Started by me' },
  { key: 'closed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

const INBOX_POLL_MS = 30000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins < 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  if (hrs < 48) return 'Yesterday';
  return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export const ThreadInboxPage: React.FC = () => {
  const { openPanel } = useThreadContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('mine');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const fetchThreads = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {};
      if (activeTab === 'unread') params.unread = true;
      if (activeTab === 'closed') params.status = 'closed';
      if (activeTab === 'mine') params.status = 'open';
      if (activeTab === 'started') { params.status = 'open'; params.initiated_by = 'me'; }
      // 'all' → no status filter (returns all threads the user can see)
      if (search) params.search = search;

      const data = await threadService.list(params);
      setThreads(data);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, search]);

  useEffect(() => {
    fetchThreads();
    const timer = setInterval(fetchThreads, INBOX_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchThreads]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  const handleOpenThread = (thread: Thread) => {
    // page_url alone is the catalog's static list-page URL — resolve the
    // actual per-record route (e.g. '/clients/947', not '/clients/clients/').
    const url = resolveThreadRecordUrl({
      moduleCode: thread.page_module_code,
      pageCode: thread.page_code,
      objectId: thread.object_id,
      fallbackUrl: thread.page_url,
    });
    if (url) {
      // Navigate to the page and pass thread ID so the toggle button can auto-open the panel
      navigate(url, { state: { openThreadId: thread.id, pageId: thread.page } });
    }
  };

  const tabUnreadCounts: Partial<Record<TabKey, number>> = {};
  threads.forEach(t => {
    if (t.unread_count > 0) {
      tabUnreadCounts['mine'] = (tabUnreadCounts['mine'] ?? 0) + t.unread_count;
    }
  });

  return (
    <div className="max-w-4xl mx-auto">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#0a1857] rounded-xl flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Discussions</h1>
            <p className="text-sm text-gray-500">Page-anchored contextual threads</p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchThreads}
          title="Refresh"
          className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search discussions…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0a1857] placeholder-gray-400"
          />
        </div>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(''); setSearchInput(''); }}
            className="px-3 py-2 text-sm text-gray-500 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear
          </button>
        )}
      </form>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {TABS.map(tab => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium transition-colors relative',
              activeTab === tab.key
                ? 'text-[#0a1857] border-b-2 border-[#0a1857] -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {tab.label}
            {tab.key === 'unread' &&
              threads.reduce((s, t) => s + t.unread_count, 0) > 0 && (
                <span className="ml-1.5 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">
                  {threads.reduce((s, t) => s + t.unread_count, 0)}
                </span>
              )}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {loading && (
        <div className="flex justify-center items-center h-40">
          <div className="w-6 h-6 border-2 border-[#0a1857] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && threads.length === 0 && (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
          <MessageSquare className="w-12 h-12 text-gray-200" />
          <p className="text-sm text-gray-400">No discussions found</p>
          {search && (
            <p className="text-xs text-gray-400">Try a different search term or clear the filter</p>
          )}
        </div>
      )}

      {!loading && threads.length > 0 && (
        <div className="space-y-2">
          {threads.map(thread => (
            <div
              key={thread.id}
              className={cn(
                'bg-white border rounded-xl p-4 flex gap-4 hover:shadow-sm transition-shadow cursor-pointer',
                thread.unread_count > 0 ? 'border-[#0a1857]/20' : 'border-gray-200'
              )}
              onClick={() => handleOpenThread(thread)}
            >
              {/* Unread indicator */}
              <div className="flex-shrink-0 mt-1">
                {thread.unread_count > 0 ? (
                  <div className="w-2.5 h-2.5 bg-[#0a1857] rounded-full" />
                ) : (
                  <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                )}
              </div>

              {/* Main content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-sm truncate',
                        thread.unread_count > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                      )}
                    >
                      {thread.title || `Thread #${thread.id}`}
                    </p>
                    {thread.linked_record_repr && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">
                        {thread.linked_record_repr.model}: {thread.linked_record_repr.repr}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[11px] text-gray-400">
                      {formatDate(thread.updated_at)}
                    </span>
                    {thread.unread_count > 0 && (
                      <span className="bg-[#0a1857] text-white text-[9px] font-bold min-w-[18px] h-4 px-1 rounded-full flex items-center justify-center">
                        {thread.unread_count}
                      </span>
                    )}
                  </div>
                </div>

                {/* Last message preview */}
                {thread.last_message && (
                  <p className="text-xs text-gray-500 mt-1 truncate">
                    <span className="font-medium">{thread.last_message.author_name}:</span>{' '}
                    {thread.last_message.body}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center gap-3 mt-2">
                  {/* Participants */}
                  <div className="flex -space-x-1">
                    {thread.participants.slice(0, 4).map(p => (
                      <div
                        key={p.id}
                        title={p.user_info.full_name}
                        className="w-5 h-5 rounded-full bg-gray-300 text-gray-600 text-[8px] font-bold flex items-center justify-center border border-white"
                      >
                        {p.user_info.full_name.charAt(0).toUpperCase()}
                      </div>
                    ))}
                    {thread.participants.length > 4 && (
                      <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-[8px] flex items-center justify-center border border-white">
                        +{thread.participants.length - 4}
                      </div>
                    )}
                  </div>

                  {/* Status badge */}
                  {thread.status === 'closed' ? (
                    <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                      <Lock className="w-2.5 h-2.5" /> Closed
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[10px] text-green-600">
                      <Unlock className="w-2.5 h-2.5" /> Open
                    </span>
                  )}

                  {/* Reason tag */}
                  {thread.reason && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded capitalize">
                      {thread.reason}
                    </span>
                  )}

                  {/* Navigate to record link */}
                  {(() => {
                    const recordUrl = resolveThreadRecordUrl({
                      moduleCode: thread.page_module_code,
                      pageCode: thread.page_code,
                      objectId: thread.object_id,
                      fallbackUrl: thread.page_url,
                    });
                    return recordUrl ? (
                      <a
                        href={recordUrl}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleOpenThread(thread);
                        }}
                        title="Go to record"
                        className="ml-auto text-gray-300 hover:text-[#0a1857] transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    ) : null;
                  })()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
