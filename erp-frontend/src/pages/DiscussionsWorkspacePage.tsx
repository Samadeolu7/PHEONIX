import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import {
  MessageSquare,
  Search,
  X,
  Lock,
  Unlock,
  Send,
  Users,
  Plus,
  Hash,
  ChevronRight,
  ChevronLeft,
  UserPlus,
  Reply,
  Paperclip,
  FileText,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import { threadService } from '../services/threadService';
import { useAuth } from '../contexts/AuthContext';
import { getRoleRank } from '../types/roles';
import { useResponsive } from '../hooks/useResponsive';
import { useThreadSocket } from '../hooks/useRealtimeSocket';
import type { Thread, ThreadMessageItem } from '../types/threads';

// ─────────────────────────────────────────────────────────────────────────────

// The active conversation is pushed live by useThreadSocket below (see
// ConversationPane) — MSG_POLL_MS is now only the fallback interval for a
// disconnected socket. The sidebar's thread list has no per-thread push
// target of its own, so LIST_POLL_MS stays a plain (now longer) poll.
const MSG_POLL_MS = 120000;
const LIST_POLL_MS = 120000;
const MAX_TABS = 6;

type FilterTab = 'mine' | 'unread' | 'all' | 'closed';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'mine', label: 'Mine' },
  { key: 'unread', label: 'Unread' },
  { key: 'all', label: 'All' },
  { key: 'closed', label: 'Closed' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  if (h < 48) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
}

function UserAvatar({ name, size = 8 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map(n => n[0] ?? '')
    .join('')
    .toUpperCase();
  return (
    <div
      title={name}
      className="rounded-full bg-gradient-to-br from-[#0a1857] to-[#1e3a8a] text-white font-semibold flex items-center justify-center flex-shrink-0 select-none border-2 border-white"
      style={{ width: `${size * 4}px`, height: `${size * 4}px`, fontSize: `${size * 1.5}px` }}
    >
      {initials}
    </div>
  );
}

// ── Left Sidebar ──────────────────────────────────────────────────────────────

interface SidebarProps {
  openIds: number[];
  activeId: number | null;
  onSelect: (t: Thread) => void;
  // Bumped by the parent whenever the open conversation gets marked read —
  // this list has its own unread badge/count (see totalUnread below), which
  // otherwise wouldn't reflect that until the next LIST_POLL_MS tick. This
  // page doesn't use React Query, so unlike ThreadPanel.tsx there's no
  // query-invalidation path to piggyback on; a plain counter that the
  // effect below also depends on is the equivalent for manual fetch state.
  refreshSignal?: number;
}

function Sidebar({ openIds, activeId, onSelect, refreshSignal }: SidebarProps) {
  const [filterTab, setFilterTab] = useState<FilterTab>('mine');
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [search, setSearch] = useState('');

  const fetchThreads = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (filterTab === 'unread') params.unread = true;
      else if (filterTab === 'closed') params.status = 'closed';
      else if (filterTab === 'mine') params.status = 'open';
      if (search) params.search = search;
      const data = await threadService.list(params);
      setThreads(data);
    } catch {
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [filterTab, search]);

  useEffect(() => {
    setLoading(true);
    fetchThreads();
    const t = setInterval(fetchThreads, LIST_POLL_MS);
    return () => clearInterval(t);
  }, [fetchThreads]);

  // Refetch (without the loading spinner — this is a background correction,
  // not a filter/search change) whenever the parent signals a read event.
  useEffect(() => {
    if (refreshSignal === undefined) return;
    fetchThreads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  const totalUnread = threads.reduce((s, t) => s + t.unread_count, 0);

  return (
    <div className="flex flex-col h-full select-none" style={{ background: '#0a1857' }}>
      {/* Brand header */}
      <div className="px-4 pt-5 pb-4">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white text-sm font-semibold leading-none">Discussions</p>
            {totalUnread > 0 && (
              <p className="text-white/50 text-[10px] mt-0.5">{totalUnread} unread</p>
            )}
          </div>
        </div>

        {/* Search */}
        <form
          onSubmit={e => { e.preventDefault(); setSearch(inputValue); }}
          className="relative"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40 pointer-events-none" />
          <input
            type="text"
            placeholder="Search discussions…"
            value={inputValue}
            onChange={e => setInputValue(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-1 focus:ring-white/30"
          />
        </form>
      </div>

      {/* Filter tabs */}
      <div className="flex px-2 gap-0.5 mb-1">
        {FILTER_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => { setFilterTab(t.key); setLoading(true); }}
            className={cn(
              'flex-1 py-1.5 text-[10px] font-medium rounded-md transition-all',
              filterTab === t.key
                ? 'bg-white/15 text-white'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            )}
          >
            {t.label}
            {t.key === 'unread' && totalUnread > 0 && (
              <span className="ml-0.5 bg-red-500 text-white text-[7px] px-0.5 rounded-full">{totalUnread}</span>
            )}
          </button>
        ))}
      </div>

      {/* Section label */}
      <div className="px-4 py-1.5 flex items-center justify-between">
        <span className="text-white/30 text-[10px] font-semibold uppercase tracking-wider">Threads</span>
        <ChevronRight className="w-3 h-3 text-white/20" />
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
        {loading && (
          <div className="flex justify-center mt-12">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {!loading && threads.length === 0 && (
          <div className="flex flex-col items-center mt-16 gap-2 text-center">
            <Hash className="w-6 h-6 text-white/15" />
            <p className="text-white/30 text-xs">No discussions</p>
          </div>
        )}

        {!loading && threads.map(thread => {
          const isActive = thread.id === activeId;
          const isOpen = openIds.includes(thread.id);
          return (
            <button
              key={thread.id}
              type="button"
              onClick={() => onSelect(thread)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-lg transition-all group',
                isActive
                  ? 'bg-white/20'
                  : isOpen
                  ? 'bg-white/10'
                  : 'hover:bg-white/8'
              )}
              style={{ background: isActive ? 'rgba(255,255,255,0.20)' : isOpen ? 'rgba(255,255,255,0.10)' : undefined }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex-shrink-0">
                  {thread.unread_count > 0 ? (
                    <div className="w-2 h-2 bg-white rounded-full" />
                  ) : thread.status === 'closed' ? (
                    <Lock className="w-3 h-3 text-white/30" />
                  ) : (
                    <Hash className="w-3 h-3 text-white/30 group-hover:text-white/50" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={cn(
                      'text-xs truncate leading-tight',
                      thread.unread_count > 0
                        ? 'text-white font-semibold'
                        : isActive
                        ? 'text-white font-medium'
                        : 'text-white/60 font-normal group-hover:text-white/80'
                    )}>
                      {thread.title || `Thread #${thread.id}`}
                    </p>
                    <span className="text-[9px] text-white/30 flex-shrink-0">
                      {fmtAge(thread.updated_at)}
                    </span>
                  </div>

                  {thread.last_message && (
                    <p className={cn(
                      'text-[10px] truncate mt-0.5 leading-tight',
                      thread.unread_count > 0 ? 'text-white/70' : 'text-white/35'
                    )}>
                      {thread.last_message.author_name}: {thread.last_message.body}
                    </p>
                  )}
                </div>

                {thread.unread_count > 0 && (
                  <span className="bg-white text-[#0a1857] text-[9px] font-bold min-w-[18px] h-4 px-1 rounded-full flex items-center justify-center flex-shrink-0">
                    {thread.unread_count}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Conversation Pane ─────────────────────────────────────────────────────────

interface ConversationPaneProps {
  thread: Thread;
  currentUserId: number;
  currentUserName: string;
  onStatusChange: (updated: Thread) => void;
  // Set only on mobile (see the main page component) — renders a back
  // button in the header so the conversation can hand the screen back to
  // the sidebar list instead of the two ever sharing width on a narrow
  // viewport.
  onBack?: () => void;
  // Called after a mark-read actually lands (i.e. new read receipts were
  // created, not just a no-op re-read) — lets the parent nudge the
  // sidebar's own unread count/badge and the app-wide notification bell,
  // neither of which this pane's own React Query cache touches on its own.
  onRead?: () => void;
}

function ConversationPane({
  thread,
  currentUserId,
  currentUserName,
  onStatusChange,
  onBack,
  onRead,
}: ConversationPaneProps) {
  const [local, setLocal] = useState<Thread>(thread);
  const [messages, setMessages] = useState<ThreadMessageItem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [replyTarget, setReplyTarget] = useState<ThreadMessageItem | null>(null);
  const [mentionedIds, setMentionedIds] = useState<Map<number, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevCount = useRef(0);

  const [mentionSuggestions, setMentionSuggestions] = useState<
    { id: number; username: string; full_name: string }[]
  >([]);
  useEffect(() => {
    if (mentionQuery === null) {
      setMentionSuggestions([]);
      return;
    }
    let cancelled = false;
    threadService.searchUsers(mentionQuery || undefined).then(results => {
      if (!cancelled) setMentionSuggestions(results);
    }).catch(() => { if (!cancelled) setMentionSuggestions([]); });
    return () => { cancelled = true; };
  }, [mentionQuery]);

  const handleDraftChange = (value: string) => {
    setDraft(value);
    const cursor = textareaRef.current?.selectionStart ?? value.length;
    const upToCursor = value.slice(0, cursor);
    const match = upToCursor.match(/(?:^|\s)@([\w.]*)$/);
    setMentionQuery(match ? match[1] : null);
  };

  const handleSelectMention = (u: { id: number; username: string; full_name: string }) => {
    const cursor = textareaRef.current?.selectionStart ?? draft.length;
    const upToCursor = draft.slice(0, cursor);
    const replaced = upToCursor.replace(/(?:^|\s)@([\w.]*)$/, (m) => (m.startsWith(' ') ? ' ' : '') + `@${u.username} `);
    setDraft(replaced + draft.slice(cursor));
    setMentionedIds(prev => new Map(prev).set(u.id, u.username));
    setMentionQuery(null);
  };

  useEffect(() => { setLocal(thread); }, [thread]);

  const fetchMessages = useCallback(async () => {
    try {
      const msgs = await threadService.listMessages(local.id);
      setMessages(msgs);
      // This pane only exists while its tab is the active one (see the
      // `activeThread &&` conditional render in the parent, which fully
      // unmounts it — and this interval — on tab switch), so unlike the
      // floating ThreadPanel there's no "minimised but still polling" state
      // to guard against. Re-marking read on every tick (not just mount)
      // keeps the sidebar's unread badge from re-lighting while the thread
      // is being actively viewed.
      threadService.markRead(local.id).then(() => onRead?.()).catch(() => {});
    } catch { /* retain */ } finally {
      setLoadingMsgs(false);
    }
  }, [local.id, onRead]);

  // Live-pushed refetch — this pane only exists while its tab is active
  // (see the comment above), so joining unconditionally is fine.
  useThreadSocket(local.id, () => { fetchMessages(); });

  useEffect(() => {
    setLoadingMsgs(true);
    setMessages([]);
    prevCount.current = 0;
    fetchMessages();
    const t = setInterval(fetchMessages, MSG_POLL_MS);
    return () => clearInterval(t);
  }, [fetchMessages, local.id]);

  useEffect(() => {
    setAttachFiles([]);
    setReplyTarget(null);
    setMentionedIds(new Map());
    setMentionQuery(null);
  }, [local.id]);

  useEffect(() => {
    if (!loadingMsgs && messages.length > prevCount.current) {
      prevCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, loadingMsgs]);

  const handleSend = async () => {
    const body = draft.trim();
    if ((!body && attachFiles.length === 0) || sending) return;
    setSending(true);
    try {
      const msg = await threadService.postMessage(local.id, body, {
        attachments: attachFiles.length > 0 ? attachFiles : undefined,
        mentionedUserIds: mentionedIds.size > 0 ? Array.from(mentionedIds.keys()) : undefined,
        replyToId: replyTarget?.id,
      });
      setMessages(prev => [...prev, msg]);
      setDraft('');
      setAttachFiles([]);
      setReplyTarget(null);
      setMentionedIds(new Map());
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } finally {
      setSending(false);
    }
    textareaRef.current?.focus();
  };

  const handleClose = async () => {
    setActionLoading(true);
    try {
      const updated = await threadService.close(local.id);
      setLocal(updated);
      onStatusChange(updated);
    } finally { setActionLoading(false); }
  };

  const handleReopen = async () => {
    setActionLoading(true);
    try {
      const updated = await threadService.reopen(local.id);
      setLocal(updated);
      onStatusChange(updated);
    } finally { setActionLoading(false); }
  };

  const [joinRequested, setJoinRequested] = useState(false);
  const handleRequestJoin = async () => {
    setActionLoading(true);
    try {
      await threadService.requestJoin(local.id);
      setJoinRequested(true);
    } finally { setActionLoading(false); }
  };

  const handleLock = async () => {
    setActionLoading(true);
    try {
      const updated = await threadService.lock(local.id);
      setLocal(updated);
      onStatusChange(updated);
    } finally { setActionLoading(false); }
  };

  const handleEscalate = async () => {
    setActionLoading(true);
    try {
      const updated = await threadService.escalate(local.id);
      setLocal(updated);
      onStatusChange(updated);
    } finally { setActionLoading(false); }
  };

  const handleUnlock = async () => {
    setActionLoading(true);
    try {
      const updated = await threadService.unlock(local.id);
      setLocal(updated);
      onStatusChange(updated);
    } finally { setActionLoading(false); }
  };

  const isClosed = local.status === 'closed';
  // Server-computed (threads/permissions.py via ThreadSerializer) — replaces
  // the old isDirector-only reopen check here, which missed Branch Managers
  // reopening threads in their own branch (the backend already allows that;
  // this UI just never showed the button for it). See ThreadPanel.tsx for
  // the same fix applied to the slide-over panel.
  const canClose = !isClosed && (local.permissions?.can_close ?? false);
  const canReopen = isClosed && !local.is_locked && (local.permissions?.can_reopen ?? false);
  const canLock = isClosed && (local.permissions?.can_lock ?? false);
  const canUnlock = local.is_locked && (local.permissions?.can_unlock ?? false);
  // Directors/Branch Managers can land here via oversight visibility without
  // being a tagged participant — the composer would 403 on submit, so gate
  // it the same way ThreadPanel.tsx does.
  const isObserver = local.permissions?.is_observer ?? false;
  const isParticipant = local.permissions?.is_participant ?? false;

  // Group messages by calendar day
  const grouped: Array<{ date: string; items: ThreadMessageItem[] }> = [];
  messages.forEach(msg => {
    const day = new Date(msg.created_at).toDateString();
    const last = grouped[grouped.length - 1];
    if (last && last.date === day) last.items.push(msg);
    else grouped.push({ date: day, items: [msg] });
  });

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-gray-100 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 text-gray-500 flex-shrink-0"
              aria-label="Back to discussions"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          )}
          <div className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            isClosed ? 'bg-gray-100' : 'bg-[#0a1857]/8'
          )}>
            {isClosed
              ? <Lock className="w-4 h-4 text-gray-400" />
              : <Hash className="w-4 h-4 text-[#0a1857]" />
            }
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm truncate leading-none mb-1">
              {local.title || `Thread #${local.id}`}
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              {local.linked_record_repr && (
                <span className="text-xs text-gray-400 truncate max-w-[220px]">
                  {local.linked_record_repr.model}: {local.linked_record_repr.repr}
                </span>
              )}
              {/* Participant stack */}
              <div className="flex -space-x-1.5">
                {local.participants.slice(0, 6).map(p => (
                  <UserAvatar key={p.id} name={p.user_info.full_name} size={5} />
                ))}
                {local.participants.length > 6 && (
                  <div className="w-5 h-5 rounded-full bg-gray-200 text-gray-500 text-[8px] flex items-center justify-center border-2 border-white">
                    +{local.participants.length - 6}
                  </div>
                )}
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1">
                <Users className="w-3 h-3" />
                {local.participants.length}
              </span>
              {local.reason && (
                <span className="text-[11px] bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full capitalize">
                  {local.reason}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {isParticipant && (
            <button
              type="button"
              onClick={handleEscalate}
              disabled={actionLoading}
              title="Pull all Directors into this discussion"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium"
            >
              <UserPlus className="w-3 h-3" />
              Escalate
            </button>
          )}
          {canClose && (
            <button
              type="button"
              onClick={handleClose}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 disabled:opacity-40 transition-colors font-medium"
            >
              <Lock className="w-3 h-3" />
              Close discussion
            </button>
          )}
          {canReopen && (
            <button
              type="button"
              onClick={handleReopen}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors font-medium"
            >
              <Unlock className="w-3 h-3" />
              Reopen
            </button>
          )}
          {canLock && (
            <button
              type="button"
              onClick={handleLock}
              disabled={actionLoading}
              title="Prevent this thread from reopening on reply"
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition-colors font-medium"
            >
              <Lock className="w-3 h-3" />
              Lock
            </button>
          )}
          {canUnlock && (
            <button
              type="button"
              onClick={handleUnlock}
              disabled={actionLoading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 bg-green-50 hover:bg-green-100 disabled:opacity-40 transition-colors font-medium"
            >
              <Unlock className="w-3 h-3" />
              Unlock
            </button>
          )}
        </div>
      </div>

      {/* Closed banner */}
      {isClosed && (
        <div className="flex items-center gap-3 px-6 py-2.5 bg-amber-50 border-b border-amber-100 flex-shrink-0">
          <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            {local.is_locked ? 'Locked' : 'Closed'}{local.closed_by_name ? ` by ${local.closed_by_name}` : ''}
            {local.closed_at ? ` · ${fmtAge(local.closed_at)}` : ''}.
            {canReopen && (
              <button
                type="button"
                onClick={handleReopen}
                disabled={actionLoading}
                className="ml-2 underline text-amber-700 hover:text-amber-900 disabled:opacity-50"
              >
                Reopen to reply
              </button>
            )}
            {canUnlock && (
              <button
                type="button"
                onClick={handleUnlock}
                disabled={actionLoading}
                className="ml-2 underline text-amber-700 hover:text-amber-900 disabled:opacity-50"
              >
                Unlock
              </button>
            )}
          </p>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {loadingMsgs && (
          <div className="flex justify-center mt-20">
            <div className="w-6 h-6 border-2 border-[#0a1857]/20 border-t-[#0a1857] rounded-full animate-spin" />
          </div>
        )}

        {!loadingMsgs && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <div className="w-16 h-16 rounded-2xl bg-[#0a1857]/5 flex items-center justify-center">
              <MessageSquare className="w-8 h-8 text-[#0a1857]/20" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-600">No messages yet</p>
              <p className="text-xs text-gray-400 mt-1">
                {isClosed ? 'This discussion was closed with no messages.' : 'Be the first to say something.'}
              </p>
            </div>
          </div>
        )}

        {grouped.map(group => (
          <React.Fragment key={group.date}>
            {/* Date divider */}
            <div className="flex items-center gap-4 py-5">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[11px] text-gray-400 font-medium flex-shrink-0">
                {fmtDate(group.items[0].created_at)}
              </span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            {group.items.map((msg, idx) => {
              if (msg.is_system_message) {
                return (
                  <div key={msg.id} className="flex justify-center py-2">
                    <span className="text-[11px] text-gray-400 bg-gray-50 px-4 py-1.5 rounded-full border border-gray-100">
                      {msg.body}
                    </span>
                  </div>
                );
              }

              const isOwn = msg.author === currentUserId;
              const prevMsg = group.items[idx - 1];
              const showHeader = !prevMsg || prevMsg.is_system_message || prevMsg.author !== msg.author;

              return (
                <div
                  key={msg.id}
                  id={`msg-${msg.id}`}
                  className={cn(
                    'flex items-end gap-3 group',
                    isOwn ? 'flex-row-reverse' : 'flex-row',
                    showHeader ? 'mt-5' : 'mt-1'
                  )}
                >
                  {/* Avatar */}
                  <div className="flex-shrink-0 mb-1" style={{ width: 32 }}>
                    {showHeader
                      ? <UserAvatar name={msg.author_name} size={8} />
                      : null
                    }
                  </div>

                  {/* Bubble */}
                  <div className={cn('flex flex-col max-w-[55%]', isOwn ? 'items-end' : 'items-start')}>
                    {showHeader && (
                      <div className={cn('flex items-baseline gap-2 mb-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
                        <span className="text-xs font-semibold text-gray-800">
                          {isOwn ? 'You' : msg.author_name}
                        </span>
                        <span className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          {fmtTime(msg.created_at)}
                        </span>
                        {!isClosed && isParticipant && (
                          <button
                            onClick={() => setReplyTarget(msg)}
                            title="Reply"
                            className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Reply className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    <div className={cn(
                      'px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words whitespace-pre-wrap',
                      isOwn
                        ? 'bg-[#0a1857] text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    )}>
                      {msg.reply_to_preview && (
                        <button
                          onClick={() => document.getElementById(`msg-${msg.reply_to_preview!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                          className={cn(
                            'block w-full text-left mb-1.5 px-2 py-1 rounded-lg border-l-2 text-xs truncate whitespace-nowrap',
                            isOwn ? 'border-white/40 bg-white/10 text-blue-100' : 'border-[#0a1857]/30 bg-black/5 text-gray-500'
                          )}
                        >
                          <span className="font-medium">{msg.reply_to_preview.author_name}</span>
                          {': '}
                          {msg.reply_to_preview.body || '(empty message)'}
                        </button>
                      )}
                      {msg.body}
                      {msg.attachment_url && (msg.attachments ?? []).length === 0 && (
                        <a
                          href={msg.attachment_url}
                          target="_blank"
                          rel="noreferrer"
                          className={cn('flex items-center gap-1 mt-1 text-xs underline', isOwn ? 'text-blue-200' : 'text-blue-600')}
                        >
                          <Paperclip className="w-3 h-3" />
                          Attachment
                        </a>
                      )}
                      {(msg.attachments ?? []).length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1.5">
                          {msg.attachments.map(att => {
                            const isImage = att.content_type.startsWith('image/');
                            if (isImage && att.url) {
                              return (
                                <a key={att.id} href={att.url} target="_blank" rel="noreferrer">
                                  <img
                                    src={att.url}
                                    alt={att.filename}
                                    className="max-w-[220px] max-h-[220px] rounded-lg border border-black/10 object-cover"
                                  />
                                </a>
                              );
                            }
                            return (
                              <a
                                key={att.id}
                                href={att.url ?? undefined}
                                target="_blank"
                                rel="noreferrer"
                                className={cn(
                                  'flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs',
                                  isOwn ? 'bg-white/10 text-blue-100 hover:bg-white/20' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                                )}
                              >
                                <FileText className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="truncate flex-1">{att.filename}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    {!showHeader && (
                      <span className="text-[10px] text-gray-400 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {fmtTime(msg.created_at)}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </React.Fragment>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-6 pb-5 pt-3 flex-shrink-0 border-t border-gray-100 bg-white">
        {isObserver && !isClosed ? (
          <div className="flex items-center justify-between gap-2 py-1">
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Users className="w-3 h-3" /> You&apos;re viewing this discussion as an observer.
            </p>
            <button
              type="button"
              onClick={handleRequestJoin}
              disabled={actionLoading || joinRequested}
              className="text-xs text-[#0a1857] hover:underline font-medium disabled:text-gray-400 disabled:no-underline flex items-center gap-1 flex-shrink-0"
            >
              <UserPlus className="w-3 h-3" />
              {joinRequested ? 'Requested' : 'Request to join'}
            </button>
          </div>
        ) : !isClosed ? (
          <div>
            {replyTarget && (
              <div className="flex items-start gap-2 mb-2 px-3 py-1.5 bg-gray-50 border-l-2 border-[#0a1857]/40 rounded-lg text-xs">
                <Reply className="w-3 h-3 mt-0.5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-600">{replyTarget.author_name}</span>
                  <p className="text-gray-500 truncate">{replyTarget.body || '(empty message)'}</p>
                </div>
                <button onClick={() => setReplyTarget(null)} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {attachFiles.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {attachFiles.map((f, idx) => (
                  <div key={`${f.name}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-xs text-gray-600">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate max-w-[140px]">{f.name}</span>
                    <button
                      onClick={() => setAttachFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-end gap-3 bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 focus-within:border-[#0a1857]/30 focus-within:ring-2 focus-within:ring-[#0a1857]/10 transition-all relative">
              {mentionQuery !== null && mentionSuggestions.length > 0 && (
                <ul className="absolute bottom-full left-4 right-16 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
                  {mentionSuggestions.map(u => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectMention(u)}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium">{u.full_name}</span>{' '}
                        <span className="text-gray-400">@{u.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <UserAvatar name={currentUserName} size={7} />
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={e => {
                  handleDraftChange(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = `${el.scrollHeight}px`;
                }}
                onKeyDown={e => {
                  if (mentionQuery !== null && mentionSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
                    e.preventDefault();
                    handleSelectMention(mentionSuggestions[0]);
                    return;
                  }
                  if (e.key === 'Escape' && mentionQuery !== null) {
                    setMentionQuery(null);
                    return;
                  }
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Reply to this thread… (Enter to send, @ to mention)"
                rows={1}
                className="flex-1 bg-transparent resize-none text-sm text-gray-800 placeholder-gray-400 focus:outline-none py-0.5"
                style={{ minHeight: '24px', maxHeight: '120px' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="Attach files"
                className="p-2 text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || (!draft.trim() && attachFiles.length === 0)}
                className="p-2 bg-[#0a1857] text-white rounded-xl hover:bg-[#0a1857]/90 disabled:opacity-30 transition-all flex-shrink-0"
                title="Send (Enter)"
              >
                {sending ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={e => {
                  const files = Array.from(e.target.files ?? []);
                  if (files.length) setAttachFiles(prev => [...prev, ...files]);
                  e.target.value = '';
                }}
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-3">
            <p className="text-xs text-gray-400">
              {local.is_locked
                ? 'This discussion is locked — a Director must unlock it before it can be replied to.'
                : 'This discussion is closed.'}{' '}
              {canReopen && (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={actionLoading}
                  className="text-[#0a1857] hover:underline font-medium disabled:opacity-50"
                >
                  Reopen to reply
                </button>
              )}
              {canUnlock && (
                <button
                  type="button"
                  onClick={handleUnlock}
                  disabled={actionLoading}
                  className="text-[#0a1857] hover:underline font-medium disabled:opacity-50"
                >
                  Unlock
                </button>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DiscussionsWorkspacePage() {
  const { user } = useAuth();
  const { isMobile } = useResponsive();
  const queryClient = useQueryClient();
  const [openThreads, setOpenThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  // Bumped whenever the open conversation is marked read — see Sidebar's
  // refreshSignal prop and ConversationPane's onRead prop.
  const [sidebarRefreshTick, setSidebarRefreshTick] = useState(0);

  const handleConversationRead = useCallback(() => {
    // This page doesn't use React Query for its own data, but the nav
    // bell/dashboard widget elsewhere in the app do — nudge those too,
    // otherwise they'd only catch up on their own ~120s fallback poll.
    queryClient.invalidateQueries({ queryKey: ['threads'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    setSidebarRefreshTick(t => t + 1);
  }, [queryClient]);

  const roles: string[] = (user as any)?.roles ?? [];
  const maxRank = roles.length ? Math.max(0, ...roles.map(getRoleRank)) : 0;
  const isDirector = maxRank >= 4;
  const currentUserId: number = (user as any)?.id ?? 0;
  const currentUserName: string =
    user
      ? `${user.first_name} ${user.last_name}`.trim() || user.username
      : 'Me';

  const activeThread = openThreads.find(t => t.id === activeId) ?? null;

  const handleSelect = (thread: Thread) => {
    setOpenThreads(prev => {
      if (prev.some(t => t.id === thread.id)) return prev;
      const next = [...prev, thread];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
    setActiveId(thread.id);
  };

  const handleCloseTab = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenThreads(prev => {
      const next = prev.filter(t => t.id !== id);
      if (activeId === id) {
        setActiveId(next.length > 0 ? next[next.length - 1].id : null);
      }
      return next;
    });
  };

  const handleStatusChange = (updated: Thread) => {
    setOpenThreads(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  };

  // Below md, the sidebar and the conversation never share the screen —
  // whichever one is relevant is shown full-width instead (list, then tap
  // in; back button returns to the list). See ConversationPane's onBack.
  const showSidebarOnMobile = isMobile && activeId === null;
  const showWorkspaceOnMobile = isMobile && activeId !== null;

  return (
    <div className="flex overflow-hidden bg-gray-50" style={{ height: 'calc(100vh - 4rem)' }}>
      {/* Left sidebar */}
      {(!isMobile || showSidebarOnMobile) && (
        <div className={cn(
          'flex-shrink-0 flex flex-col overflow-hidden',
          isMobile ? 'w-full' : 'w-64'
        )}>
          <Sidebar
            openIds={openThreads.map(t => t.id)}
            activeId={activeId}
            onSelect={handleSelect}
            refreshSignal={sidebarRefreshTick}
          />
        </div>
      )}

      {/* Main workspace */}
      <div className={cn(
        'flex-1 flex flex-col overflow-hidden',
        isMobile && !showWorkspaceOnMobile && 'hidden'
      )}>
        {openThreads.length === 0 ? (
          /* Empty welcome state */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center p-12">
            <div className="relative">
              <div className="w-20 h-20 rounded-3xl bg-[#0a1857]/6 flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-[#0a1857]/25" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-white rounded-xl border border-gray-100 flex items-center justify-center shadow-sm">
                <Plus className="w-3.5 h-3.5 text-[#0a1857]/40" />
              </div>
            </div>
            <div>
              <p className="text-base font-semibold text-gray-700 mb-2">
                Open a discussion to get started
              </p>
              <p className="text-sm text-gray-400 max-w-xs leading-relaxed">
                Select any discussion from the sidebar. Up to {MAX_TABS} can be open
                at once — switch between them with the tabs above.
              </p>
            </div>
            <div className="bg-gray-50 border border-gray-100 rounded-xl px-5 py-4 text-left space-y-2">
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <div className="w-2 h-2 bg-[#0a1857] rounded-full" />
                <span>Bold thread = unread messages</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Lock className="w-3 h-3" />
                <span>
                  {isDirector
                    ? 'You can close and reopen any discussion'
                    : 'You can close discussions you started; Directors can reopen'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Tab bar */}
            <div className="flex items-end bg-white border-b border-gray-200 overflow-x-auto flex-shrink-0">
              {openThreads.map(thread => {
                const isActive = thread.id === activeId;
                const isClosed = thread.status === 'closed';
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => setActiveId(thread.id)}
                    className={cn(
                      'group flex items-center gap-2 px-4 py-3 border-b-2 transition-all flex-shrink-0 max-w-[200px]',
                      isActive
                        ? 'border-[#0a1857] bg-white text-gray-900'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    )}
                  >
                    {isClosed
                      ? <Lock className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-gray-400' : 'text-gray-300')} />
                      : <Hash className={cn('w-3.5 h-3.5 flex-shrink-0', isActive ? 'text-[#0a1857]' : 'text-gray-400')} />
                    }

                    <span className={cn('text-xs truncate font-medium', isActive ? 'text-gray-900' : 'text-gray-500')}>
                      {thread.title || `Thread #${thread.id}`}
                    </span>

                    {thread.unread_count > 0 && (
                      <span className="bg-[#0a1857] text-white text-[9px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center flex-shrink-0">
                        {thread.unread_count}
                      </span>
                    )}

                    <span
                      role="button"
                      tabIndex={0}
                      onClick={e => handleCloseTab(thread.id, e)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === ' ') handleCloseTab(thread.id, e as any);
                      }}
                      className="ml-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-all flex-shrink-0"
                      aria-label="Close tab"
                    >
                      <X className="w-3 h-3" />
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Active pane */}
            {activeThread && (
              <div className="flex-1 overflow-hidden">
                <ConversationPane
                  key={activeThread.id}
                  thread={activeThread}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  onStatusChange={handleStatusChange}
                  onBack={isMobile ? () => setActiveId(null) : undefined}
                  onRead={handleConversationRead}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
