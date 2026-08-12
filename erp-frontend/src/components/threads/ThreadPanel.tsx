import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  Minus,
  MessageSquare,
  Send,
  Paperclip,
  Plus,
  ChevronDown,
  Lock,
  Unlock,
  Users,
  UserPlus,
  UserX,
  Reply,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useThreadContext } from '../../contexts/ThreadContext';
import { useAuth } from '../../contexts/AuthContext';
import { threadService } from '../../services/threadService';
import { useThreadDraft } from '../../hooks/useThreadDraft';
import { ThreadMessageBubble } from './ThreadMessageBubble';
import type {
  Thread,
  ThreadMessageItem,
  PageThreadConfig,
  ThreadReason,
} from '../../types/threads';

const POLL_INTERVAL_MS = 8000;
const THREAD_LIST_POLL_MS = 15000;

const REASON_LABELS: Record<ThreadReason, string> = {
  query: 'Query',
  approval: 'Approval Needed',
  dispute: 'Dispute',
  note: 'Note',
  other: 'Other',
};

// Lightweight client-side nudge, not a hard rule — matches keywords in what
// the user typed to pre-select a reason on the create form. The user can
// always override it; this only fires while they haven't touched the
// dropdown themselves (see reasonManuallySet in the component).
const REASON_KEYWORDS: [ThreadReason, RegExp][] = [
  ['dispute', /\b(dispute|disagree|wrong|incorrect|error|mistake)\b/i],
  ['approval', /\b(approv|sign.?off|authoriz|permission)\b/i],
  ['query', /\b(query|question|clarif|why|how come)\b/i],
];

function suggestReason(text: string): ThreadReason | null {
  for (const [reason, pattern] of REASON_KEYWORDS) {
    if (pattern.test(text)) return reason;
  }
  return null;
}

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export const ThreadPanel: React.FC = () => {
  const {
    panelState,
    activeTarget,
    activeThread,
    openPanel,
    minimisePanel,
    restorePanel,
    closePanel,
    setActiveThread,
  } = useThreadContext();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [showParticipantManager, setShowParticipantManager] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [participantSuggestions, setParticipantSuggestions] = useState<
    { id: number; username: string; full_name: string }[]
  >([]);
  const [participantError, setParticipantError] = useState('');
  const [createTitle, setCreateTitle] = useState('');
  const [createReason, setCreateReason] = useState<ThreadReason | ''>('');
  const [reasonManuallySet, setReasonManuallySet] = useState(false);
  const [createParticipants, setCreateParticipants] = useState<{ id: number; full_name: string }[]>([]);
  const [createSearch, setCreateSearch] = useState('');
  const [createError, setCreateError] = useState('');
  const { draft, setDraft, clearDraft } = useThreadDraft(selectedThreadId);
  const [actionError, setActionError] = useState('');
  const [attachFiles, setAttachFiles] = useState<File[]>([]);
  const [replyTarget, setReplyTarget] = useState<ThreadMessageItem | null>(null);
  const [mentionedIds, setMentionedIds] = useState<Map<number, string>>(new Map());
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMsgIdRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const threadKeys = {
    pageConfig: (pageId: number) => ['threads', 'pageConfig', pageId] as const,
    list: (params: Record<string, any>) => ['threads', 'list', params] as const,
    messages: (threadId: number) => ['threads', 'messages', threadId] as const,
    searchUsers: (q: string) => ['threads', 'searchUsers', q] as const,
  };

  const { data: pageConfig } = useQuery({
    queryKey: threadKeys.pageConfig(activeTarget?.pageId ?? 0),
    queryFn: () => threadService.pageConfig(activeTarget!.pageId),
    enabled: !!activeTarget,
    staleTime: 60_000,
  });
  const requiresReason = pageConfig?.thread?.require_reason ?? false;

  const listParams = activeTarget
    ? { page_id: activeTarget.pageId, ...(activeTarget.objectId ? { object_id: activeTarget.objectId } : {}) }
    : {};
  const { data: threads = [] } = useQuery({
    queryKey: threadKeys.list(listParams),
    queryFn: () => threadService.list(listParams),
    enabled: !!activeTarget,
    // 'minimised' is not 'hidden', but the user isn't actually looking at the
    // panel then — only poll while it's genuinely open on screen.
    refetchInterval: panelState === 'open' ? THREAD_LIST_POLL_MS : false,
    staleTime: 5_000,
  });

  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? activeThread ?? null;

  const { data: messages = [], isLoading: loadingMsgs } = useQuery({
    queryKey: threadKeys.messages(selectedThreadId ?? 0),
    queryFn: async () => {
      const msgs = await threadService.listMessages(selectedThreadId!);
      // Only mark read while the panel is actually open — a minimised panel
      // still fetches on remount/enable transitions, but must not silently
      // consume unread messages the user hasn't looked at yet.
      if (panelState === 'open') {
        // Wait for the mark-read POST to actually land before invalidating —
        // firing these in parallel let the refetch race ahead of the write,
        // so the bell/badge would refetch the still-unread count and then
        // sit on that stale value until the next poll tick, making it look
        // like the notification "stayed" even though the thread was read.
        threadService
          .markRead(selectedThreadId!)
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ['threads', 'list'] });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          })
          .catch(() => {});
      }
      lastMsgIdRef.current = msgs.length ? msgs[msgs.length - 1].id : 0;
      return msgs;
    },
    enabled: !!selectedThreadId,
    staleTime: 2_000,
    // Same reasoning as the list poll above: don't keep fetching (and
    // therefore marking read) while merely minimised.
    refetchInterval: panelState === 'open' && selectedThreadId ? POLL_INTERVAL_MS : false,
  });

  const { data: participantSearchResults = [] } = useQuery({
    queryKey: threadKeys.searchUsers(participantSearch),
    queryFn: () => threadService.searchUsers(participantSearch || undefined),
    enabled: showParticipantManager,
    staleTime: 10_000,
  });

  const { data: createSearchData = [] } = useQuery({
    queryKey: threadKeys.searchUsers(createSearch),
    queryFn: () => threadService.searchUsers(createSearch || undefined),
    enabled: creating,
    staleTime: 10_000,
  });

  const { data: mentionSuggestions = [] } = useQuery({
    queryKey: threadKeys.searchUsers(mentionQuery ?? ''),
    queryFn: () => threadService.searchUsers(mentionQuery || undefined),
    enabled: mentionQuery !== null,
    staleTime: 10_000,
  });

  const createMutation = useMutation({
    mutationFn: threadService.create,
    onSuccess: (thread) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => [thread, ...(old ?? [])]);
      setSelectedThreadId(thread.id);
      setCreating(false);
      setCreateTitle('');
      setCreateReason('');
      setReasonManuallySet(false);
      setCreateParticipants([]);
      setCreateSearch('');
    },
    onError: (e: any) => setCreateError(e?.response?.data?.detail ?? e?.message ?? 'Failed to create thread.'),
  });

  const closeMutation = useMutation({
    mutationFn: threadService.close,
    onSuccess: (updated) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => (old ?? []).map(t => t.id === updated.id ? updated : t));
    },
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to close thread.'),
  });

  const reopenMutation = useMutation({
    mutationFn: threadService.reopen,
    onSuccess: (updated) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => (old ?? []).map(t => t.id === updated.id ? updated : t));
    },
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to reopen thread.'),
  });

  const requestJoinMutation = useMutation({
    mutationFn: threadService.requestJoin,
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to send request.'),
  });

  const escalateMutation = useMutation({
    mutationFn: threadService.escalate,
    onSuccess: (updated) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => (old ?? []).map(t => t.id === updated.id ? updated : t));
    },
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to escalate thread.'),
  });

  const lockMutation = useMutation({
    mutationFn: threadService.lock,
    onSuccess: (updated) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => (old ?? []).map(t => t.id === updated.id ? updated : t));
    },
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to lock thread.'),
  });

  const unlockMutation = useMutation({
    mutationFn: threadService.unlock,
    onSuccess: (updated) => {
      queryClient.setQueryData<Thread[]>(threadKeys.list(listParams), (old) => (old ?? []).map(t => t.id === updated.id ? updated : t));
    },
    onError: (e: any) => setActionError(e?.response?.data?.detail ?? 'Failed to unlock thread.'),
  });

  const postMessageMutation = useMutation({
    mutationFn: ({ threadId, body, attachments, mentionedUserIds, replyToId }: {
      threadId: number; body: string; attachments?: File[]; mentionedUserIds?: number[]; replyToId?: number;
    }) => threadService.postMessage(threadId, body, { attachments, mentionedUserIds, replyToId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads', 'messages'] });
      clearDraft();
      setAttachFiles([]);
      setReplyTarget(null);
      setMentionedIds(new Map());
    },
    onError: () => {},
  });

  const addParticipantMutation = useMutation({
    mutationFn: ({ threadId, userId }: { threadId: number; userId: number }) =>
      threadService.addParticipant(threadId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads', 'list'] });
      setParticipantSearch('');
      setParticipantSuggestions([]);
    },
    onError: () => setParticipantError('Failed to add participant.'),
  });

  const removeParticipantMutation = useMutation({
    mutationFn: (participantId: number) => threadService.removeParticipant(participantId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['threads', 'list'] });
    },
    onError: () => setParticipantError('Failed to remove participant.'),
  });

  // ── Refresh immediately when restored from minimised ──────────────────────
  // Polling is paused while minimised (see the queries above), so cached
  // data can be stale by the time the user reopens the panel — refetch
  // right away instead of waiting for the next interval tick.
  useEffect(() => {
    if (panelState !== 'open') return;
    queryClient.invalidateQueries({ queryKey: threadKeys.list(listParams) });
    if (selectedThreadId) {
      queryClient.invalidateQueries({ queryKey: threadKeys.messages(selectedThreadId) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelState]);

  // ── Reset UI state when target changes ────────────────────────────────────
  useEffect(() => {
    if (!activeTarget) return;
    setSelectedThreadId(null);
    setCreating(false);
  }, [activeTarget]);

  // ── Reset the "Request to join" button and reply/attachment/mention state
  // when switching threads ───────────────────────────────────────────────
  useEffect(() => {
    requestJoinMutation.reset();
    setReplyTarget(null);
    setAttachFiles([]);
    setMentionedIds(new Map());
    setMentionQuery(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedThreadId]);

  // ── Scroll to bottom when messages arrive ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!selectedThreadId || (!draft.trim() && attachFiles.length === 0)) return;
    postMessageMutation.mutate({
      threadId: selectedThreadId,
      body: draft.trim(),
      attachments: attachFiles.length > 0 ? attachFiles : undefined,
      mentionedUserIds: mentionedIds.size > 0 ? Array.from(mentionedIds.keys()) : undefined,
      replyToId: replyTarget?.id,
    });
  }, [selectedThreadId, draft, attachFiles, mentionedIds, replyTarget, postMessageMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && mentionSuggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
      // While a mention dropdown is open, Enter/Tab picks the first match
      // instead of sending — matches common chat-app mention UX.
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
  };

  // ── @mention detection ─────────────────────────────────────────────────
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

  // ── Create new thread ─────────────────────────────────────────────────────
  const handleCreateThread = useCallback(async () => {
    if (!activeTarget) return;
    if (requiresReason && !createReason) {
      setCreateError('Please select a reason for this discussion.');
      return;
    }
    setCreateError('');
    createMutation.mutate({
      page: activeTarget.pageId,
      title: createTitle.trim() || undefined,
      content_type: activeTarget.contentTypeId,
      object_id: activeTarget.objectId,
      reason: createReason || undefined,
      participant_ids: createParticipants.map(p => p.id),
    });
  }, [activeTarget, createTitle, createReason, createParticipants, createMutation, requiresReason]);

  // ── Close / Reopen thread ─────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    closeMutation.mutate(selectedThreadId);
  }, [selectedThreadId, closeMutation]);

  const handleReopen = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    reopenMutation.mutate(selectedThreadId);
  }, [selectedThreadId, reopenMutation]);

  const handleRequestJoin = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    requestJoinMutation.mutate(selectedThreadId);
  }, [selectedThreadId, requestJoinMutation]);

  const handleEscalate = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    escalateMutation.mutate(selectedThreadId);
  }, [selectedThreadId, escalateMutation]);

  const handleLock = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    lockMutation.mutate(selectedThreadId);
  }, [selectedThreadId, lockMutation]);

  const handleUnlock = useCallback(async () => {
    if (!selectedThreadId) return;
    setActionError('');
    unlockMutation.mutate(selectedThreadId);
  }, [selectedThreadId, unlockMutation]);

  // ── Not visible ───────────────────────────────────────────────────────────
  if (panelState === 'hidden') return null;

  // ── Minimised tab ─────────────────────────────────────────────────────────
  if (panelState === 'minimised') {
    // Count unread from live message list (updated by background poll)
    const myLastRead = (selectedThread?.participants ?? []).find(p => p.user === user?.id)
      ?.last_read_at;
    const unreadCount =
      messages.filter(
        msg =>
          !msg.is_system_message &&
          selectedThread &&
          (myLastRead ? new Date(msg.created_at) > new Date(myLastRead) : true)
      ).length ||
      selectedThread?.unread_count ||
      0;
    const draftPending = draft.trim().length > 0;
    return (
      <button
        onClick={restorePanel}
        title="Restore thread panel"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1
                   bg-[#0a1857] text-white py-4 px-2 rounded-l-xl shadow-lg hover:bg-[#0d1f6b]
                   transition-colors"
        style={{ writingMode: 'vertical-rl' }}
      >
        <MessageSquare
          className="w-4 h-4 mb-1 rotate-90"
          style={{ writingMode: 'horizontal-tb' }}
        />
        {unreadCount > 0 && (
          <span
            className="bg-red-500 text-white text-[10px] font-bold px-1 rounded-full"
            style={{ writingMode: 'horizontal-tb' }}
          >
            {unreadCount}
          </span>
        )}
        {draftPending && (
          <span
            className="text-yellow-300 text-[10px]"
            style={{ writingMode: 'horizontal-tb' }}
            title="Draft in progress"
          >
            ✏
          </span>
        )}
        <span className="text-[11px] mt-1">Thread</span>
      </button>
    );
  }

  // ── Full panel ────────────────────────────────────────────────────────────
  const isClosed = selectedThread?.status === 'closed';
  // Branch Managers/Directors can land here on a thread they were only
  // notified about, not tagged into (see threads/views.py's oversight
  // queryset carve-out) — posting would 403, so show read-only instead.
  // Server-computed (threads/permissions.py) so the UI never guesses at
  // something that'll 403 — see ThreadSerializer.get_permissions.
  const permissions = selectedThread?.permissions;
  const isParticipant = permissions?.is_participant ?? false;
  const isObserver = permissions?.is_observer ?? false;
  const canInitiate = pageConfig?.can_initiate ?? false;

  return (
    <>
      {/* Overlay dimmer below sm — panel is full-width there (matches the
          panel's own w-full sm:w-[420px] below) so the page behind it needs
          dimming; sm: and up it's a fixed-width side panel that leaves the
          rest of the page visible, so no dimmer is shown. */}
      <div
        className="fixed inset-0 bg-black/20 z-30 sm:hidden"
        onClick={minimisePanel}
      />

      <div
        className={cn(
          'fixed top-0 right-0 h-full z-40 flex flex-col bg-white shadow-2xl border-l border-gray-200',
          'transition-transform duration-300',
          // Responsive width
          'w-full sm:w-[420px]'
        )}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-4 h-4 text-[#0a1857] flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {activeTarget?.recordLabel ?? selectedThread?.title ?? 'Discussion'}
              </p>
              {threads.length > 1 && (
                <p className="text-[11px] text-gray-500">{threads.length} threads on this record</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={minimisePanel}
              title="Minimise"
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              onClick={closePanel}
              title="Close"
              className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ── Thread selector (if multiple) ── */}
        {threads.length > 1 && (
          <div className="border-b border-gray-200 px-3 py-2 flex gap-2 overflow-x-auto">
            {threads.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedThreadId(t.id)}
                title={t.title || undefined}
                className={cn(
                  'flex-shrink-0 max-w-[160px] truncate text-xs px-3 py-1 rounded-full border transition-colors',
                  selectedThreadId === t.id
                    ? 'bg-[#0a1857] text-white border-[#0a1857]'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                )}
              >
                {t.title || (t.reason ? REASON_LABELS[t.reason as ThreadReason] : `Thread ${t.id}`)}
                {t.unread_count > 0 && (
                  <span className="ml-1 bg-red-500 text-white text-[9px] px-1 rounded-full">
                    {t.unread_count}
                  </span>
                )}
              </button>
            ))}
            {canInitiate && (
              <button
                onClick={() => setCreating(true)}
                className="flex-shrink-0 text-xs px-3 py-1 rounded-full border border-dashed border-gray-400 text-gray-500 hover:bg-gray-50 flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> New
              </button>
            )}
          </div>
        )}

        {/* ── Participants strip ── */}
        {selectedThread && (
          <div className="flex items-center gap-1 px-4 py-2 border-b border-gray-100 bg-gray-50">
            <Users className="w-3 h-3 text-gray-400 flex-shrink-0" />
            <div className="flex -space-x-1.5 overflow-hidden">
              {(selectedThread.participants ?? []).slice(0, 6).map(p => (
                <div
                  key={p.id}
                  title={p.user_info.full_name}
                  className="w-6 h-6 rounded-full bg-[#0a1857] text-white text-[9px] font-bold flex items-center justify-center border border-white"
                >
                  {p.user_info.full_name.charAt(0).toUpperCase()}
                </div>
              ))}
              {(selectedThread.participants ?? []).length > 6 && (
                <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-[9px] font-bold flex items-center justify-center border border-white">
                  +{(selectedThread.participants ?? []).length - 6}
                </div>
              )}
            </div>
            <button
              onClick={() => setShowParticipantManager(v => !v)}
              title="Manage participants"
              className="ml-1 p-1 rounded hover:bg-gray-200 text-gray-400 transition-colors"
            >
              <UserPlus className="w-3 h-3" />
            </button>
            {isClosed && (
              <span className="ml-auto text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" /> Closed
              </span>
            )}
            {!isClosed && selectedThread && (
              <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex items-center gap-1">
                <Unlock className="w-2.5 h-2.5" /> Open
              </span>
            )}
          </div>
        )}

        {/* ── Participant manager ── */}
        {selectedThread && showParticipantManager && (
          <div className="border-b border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-700">
                Participants ({(selectedThread.participants ?? []).length})
              </p>
              <button
                onClick={() => setShowParticipantManager(false)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <ul className="space-y-1 max-h-32 overflow-y-auto">
              {(selectedThread.participants ?? []).map(p => (
                <li key={p.id} className="flex items-center justify-between text-xs text-gray-600">
                  <span>{p.user_info.full_name}</span>
                  <button
                    onClick={() => {
                      setParticipantError('');
                      removeParticipantMutation.mutate(p.id);
                    }}
                    className="text-red-400 hover:text-red-600"
                    title="Remove participant"
                  >
                    <UserX className="w-3 h-3" />
                  </button>
                </li>
              ))}
            </ul>
            {/* User search for adding participants */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name or username…"
                value={participantSearch}
                onChange={e => setParticipantSearch(e.target.value)}
                className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0a1857]"
              />
              {participantSearchResults.length > 0 && (
                <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                  {participantSearchResults.map(u => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedThread) return;
                          setParticipantError('');
                          addParticipantMutation.mutate({ threadId: selectedThread.id, userId: u.id });
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                      >
                        <span className="font-medium">{u.full_name}</span>{' '}
                        <span className="text-gray-400">@{u.username}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {participantError && <p className="text-xs text-red-600">{participantError}</p>}
          </div>
        )}

        {/* ── Body: CREATE flow OR message list ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {/* No threads yet + not creating */}
          {threads.length === 0 && !creating && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
              <MessageSquare className="w-10 h-10 text-gray-300" />
              <p className="text-sm text-gray-500">No discussions yet on this record.</p>
              {canInitiate && (
                <button
                  onClick={() => setCreating(true)}
                  className="px-4 py-2 bg-[#0a1857] text-white text-sm rounded-lg hover:bg-[#0d1f6b] transition-colors"
                >
                  Start a discussion
                </button>
              )}
            </div>
          )}

          {/* ── Choose a discussion — the deliberate landing step after
              clicking Discuss, instead of silently guessing which open
              thread to drop someone into. Named threads (see the create
              form) are what make picking the right one possible. ── */}
          {!creating && !selectedThread && threads.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500">
                {threads.length} discussion{threads.length === 1 ? '' : 's'} on this record
              </p>
              {threads.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedThreadId(t.id)}
                  className="w-full text-left px-3 py-2.5 border border-gray-200 rounded-lg hover:border-[#0a1857]/40 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {t.title || (t.reason ? REASON_LABELS[t.reason as ThreadReason] : `Thread ${t.id}`)}
                    </span>
                    {t.unread_count > 0 && (
                      <span className="flex-shrink-0 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                        {t.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {t.status === 'closed' ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                        <Lock className="w-2.5 h-2.5" /> Closed
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600">
                        <Unlock className="w-2.5 h-2.5" /> Open
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      {(t.participants ?? []).length} participant{(t.participants ?? []).length === 1 ? '' : 's'}
                    </span>
                    <span className="text-[11px] text-gray-400">· {timeAgo(t.updated_at)}</span>
                  </div>
                  {t.last_message && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      {t.last_message.author_name}: {t.last_message.body}
                    </p>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Create new thread form */}
          {creating && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">New discussion</p>
              <div>
                <p className="text-xs text-gray-500 mb-1">Name this discussion</p>
                <input
                  type="text"
                  value={createTitle}
                  onChange={e => {
                    const value = e.target.value;
                    setCreateTitle(value);
                    if (!reasonManuallySet) {
                      const suggested = suggestReason(value);
                      if (suggested) setCreateReason(suggested);
                    }
                  }}
                  placeholder="e.g. Inactive clients follow-up"
                  maxLength={300}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1857]"
                />
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Helps tell this discussion apart from others on the same record — shown in the switcher above.
                </p>
              </div>
              <select
                value={createReason}
                onChange={e => {
                  setCreateReason(e.target.value as ThreadReason | '');
                  setReasonManuallySet(true);
                }}
                required={requiresReason}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1857]"
              >
                <option value="">{requiresReason ? 'Select a reason' : 'Select reason (optional)'}</option>
                {(Object.entries(REASON_LABELS) as [ThreadReason, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              {/* Participant picker */}
              <div>
                <p className="text-xs text-gray-500 mb-1">Tag participants (optional)</p>
                {createParticipants.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {createParticipants.map(p => (
                      <span
                        key={p.id}
                        className="flex items-center gap-1 bg-[#0a1857]/10 text-[#0a1857] text-xs px-2 py-0.5 rounded-full"
                      >
                        {p.full_name}
                        <button
                          onClick={() =>
                            setCreateParticipants(prev => prev.filter(x => x.id !== p.id))
                          }
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search by name or username…"
                    value={createSearch}
                    onChange={e => setCreateSearch(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-[#0a1857]"
                  />
                  {createSearchData.length > 0 && (
                    <ul className="absolute top-full left-0 right-0 z-50 bg-white border border-gray-200 rounded shadow-lg max-h-40 overflow-y-auto">
                      {createSearchData.map(u => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => {
                              if (!createParticipants.find(p => p.id === u.id)) {
                                setCreateParticipants(prev => [
                                  ...prev,
                                  { id: u.id, full_name: u.full_name },
                                ]);
                              }
                              setCreateSearch('');
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50"
                          >
                            <span className="font-medium">{u.full_name}</span>{' '}
                            <span className="text-gray-400">@{u.username}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              {createError && <p className="text-xs text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateThread}
                  className="flex-1 px-3 py-2 bg-[#0a1857] text-white text-sm rounded-lg hover:bg-[#0d1f6b] transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => {
                    setCreating(false);
                    setCreateTitle('');
                    setCreateReason('');
                    setReasonManuallySet(false);
                    setCreateSearch('');
                    setCreateParticipants([]);
                  }}
                  className="px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          {!creating && selectedThread && (
            <>
              {threads.length > 1 && (
                <button
                  onClick={() => setSelectedThreadId(null)}
                  className="text-xs text-gray-400 hover:text-[#0a1857] mb-2 flex items-center gap-1"
                >
                  ← All discussions
                </button>
              )}
              {loadingMsgs && (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[#0a1857] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} id={`msg-${msg.id}`}>
                  <ThreadMessageBubble
                    message={msg}
                    isOwn={msg.author === user?.id}
                    onUpdated={() => queryClient.invalidateQueries({ queryKey: ['threads', 'messages'] })}
                    onDeleted={() => queryClient.invalidateQueries({ queryKey: ['threads', 'messages'] })}
                    onReply={isParticipant ? (m) => setReplyTarget(m) : undefined}
                    onJumpTo={(id) => document.getElementById(`msg-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  />
                </div>
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* ── Footer: message input ── */}
        {selectedThread && !creating && (
          <div className="border-t border-gray-200 px-4 py-3">
            {actionError && <p className="text-xs text-red-600 mb-1">{actionError}</p>}
            {isClosed ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  {selectedThread?.is_locked
                    ? 'Thread is locked — a Director must unlock it first.'
                    : 'Thread is closed'}
                </p>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedThread?.is_locked ? (
                    permissions?.can_unlock && (
                      <button
                        onClick={handleUnlock}
                        className="text-xs text-[#0a1857] hover:underline flex items-center gap-1"
                      >
                        <Unlock className="w-3 h-3" /> Unlock
                      </button>
                    )
                  ) : (
                    <>
                      {permissions?.can_reopen && (
                        <button
                          onClick={handleReopen}
                          className="text-xs text-[#0a1857] hover:underline flex items-center gap-1"
                        >
                          <Unlock className="w-3 h-3" /> Reopen
                        </button>
                      )}
                      {permissions?.can_lock && (
                        <button
                          onClick={handleLock}
                          title="Prevent this thread from reopening on reply"
                          className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                        >
                          <Lock className="w-3 h-3" /> Lock
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ) : isObserver ? (
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Users className="w-3 h-3" /> You&apos;re viewing this discussion as an observer.
                </p>
                <button
                  onClick={handleRequestJoin}
                  disabled={requestJoinMutation.isPending || requestJoinMutation.isSuccess}
                  className="text-xs text-[#0a1857] hover:underline flex items-center gap-1 disabled:text-gray-400 disabled:no-underline shrink-0"
                >
                  <UserPlus className="w-3 h-3" />
                  {requestJoinMutation.isSuccess ? 'Requested' : 'Request to join'}
                </button>
              </div>
            ) : !isParticipant ? (
              <p className="text-xs text-gray-500 flex items-center gap-1">
                <Users className="w-3 h-3" /> You don&apos;t have access to reply in this discussion.
              </p>
            ) : (
              <>
                {replyTarget && (
                  <div className="flex items-start gap-2 mb-2 px-2 py-1.5 bg-gray-50 border-l-2 border-[#0a1857]/40 rounded-lg text-xs">
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
                  <div className="flex flex-col gap-1 mb-2">
                    {attachFiles.map((f, idx) => (
                      <div key={`${f.name}-${idx}`} className="flex items-center gap-2 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                        <Paperclip className="w-3 h-3" />
                        <span className="truncate flex-1">{f.name}</span>
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
                <div className="flex gap-2 items-end relative">
                  {mentionQuery !== null && mentionSuggestions.length > 0 && (
                    <ul className="absolute bottom-full left-0 right-10 mb-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto z-10">
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
                  <textarea
                    ref={textareaRef}
                    value={draft}
                    onChange={e => handleDraftChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send, @ to mention)"
                    rows={2}
                    className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1857] placeholder-gray-400"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach files"
                      className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-500 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={postMessageMutation.isPending || (!draft.trim() && attachFiles.length === 0)}
                      title="Send (Enter)"
                      className={cn(
                        'p-2 rounded-xl transition-colors',
                        draft.trim() || attachFiles.length > 0
                          ? 'bg-[#0a1857] text-white hover:bg-[#0d1f6b]'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      {postMessageMutation.isPending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                {postMessageMutation.isError && <p className="text-xs text-red-600 mt-1">Failed to send. Try again.</p>}
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

                {/* Escalate / Close thread actions */}
                {(isParticipant || permissions?.can_close) && (
                  <div className="mt-2 flex items-center justify-end gap-3">
                    {isParticipant && (
                      <button
                        onClick={handleEscalate}
                        disabled={escalateMutation.isPending}
                        title="Pull all Directors into this discussion"
                        className="text-xs text-gray-400 hover:text-[#0a1857] flex items-center gap-1 transition-colors disabled:opacity-50"
                      >
                        <UserPlus className="w-3 h-3" /> Escalate to Director
                      </button>
                    )}
                    {permissions?.can_close && (
                      <button
                        onClick={handleClose}
                        className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                      >
                        <Lock className="w-3 h-3" /> Close thread
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Start a thread button when threads exist */}
        {threads.length > 0 && !creating && canInitiate && (
          <div className="px-4 pb-3 flex justify-center">
            <button
              onClick={() => setCreating(true)}
              className="text-xs text-[#0a1857] hover:underline flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Start another discussion
            </button>
          </div>
        )}
      </div>
    </>
  );
};
