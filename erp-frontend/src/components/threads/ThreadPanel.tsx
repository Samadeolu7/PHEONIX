import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X, Minus, MessageSquare, Send, Paperclip, Plus,
  ChevronDown, Lock, Unlock, Users,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useThreadContext } from '../../contexts/ThreadContext';
import { useAuth } from '../../contexts/AuthContext';
import { threadService } from '../../services/threadService';
import { useThreadDraft } from '../../hooks/useThreadDraft';
import { ThreadMessageBubble } from './ThreadMessageBubble';
import type { Thread, ThreadMessageItem, PageThreadConfig, ThreadReason } from '../../types/threads';

const POLL_INTERVAL_MS = 8000;

const REASON_LABELS: Record<ThreadReason, string> = {
  query: 'Query',
  approval: 'Approval Needed',
  dispute: 'Dispute',
  note: 'Note',
  other: 'Other',
};

export const ThreadPanel: React.FC = () => {
  const { panelState, activeTarget, activeThread, openPanel, minimisePanel, closePanel, setActiveThread } =
    useThreadContext();
  const { user } = useAuth();

  // Page thread config (is_threadable, can_initiate, etc.)
  const [pageConfig, setPageConfig] = useState<PageThreadConfig | null>(null);

  // Threads list for this page+record
  const [threads, setThreads] = useState<Thread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const selectedThread = threads.find(t => t.id === selectedThreadId) ?? activeThread ?? null;

  // Messages for selected thread
  const [messages, setMessages] = useState<ThreadMessageItem[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  // Create thread flow
  const [creating, setCreating] = useState(false);
  const [createReason, setCreateReason] = useState<ThreadReason | ''>('');
  const [createParticipantIds, setCreateParticipantIds] = useState<number[]>([]);
  const [createError, setCreateError] = useState('');

  // Message input
  const { draft, setDraft, clearDraft } = useThreadDraft(selectedThreadId);
  const [sending, setSending] = useState(false);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Poll ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgIdRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Load page config + threads when target changes ─────────────────────────
  useEffect(() => {
    if (!activeTarget) return;
    setPageConfig(null);
    setThreads([]);
    setSelectedThreadId(null);
    setMessages([]);
    setCreating(false);

    threadService.pageConfig(activeTarget.pageId).then(setPageConfig).catch(() => {});

    threadService
      .list({
        page_id: activeTarget.pageId,
        ...(activeTarget.objectId ? { object_id: activeTarget.objectId } : {}),
      })
      .then(list => {
        setThreads(list);
        // Auto-select the first open thread, or the explicitly requested one
        const target = activeTarget.threadId
          ? list.find(t => t.id === activeTarget.threadId)
          : list.find(t => t.status === 'open');
        if (target) setSelectedThreadId(target.id);
      })
      .catch(() => {});
  }, [activeTarget]);

  // ── Load messages when selected thread changes ─────────────────────────────
  useEffect(() => {
    if (!selectedThreadId) return;
    setLoadingMsgs(true);
    lastMsgIdRef.current = 0;

    threadService
      .listMessages(selectedThreadId)
      .then(msgs => {
        setMessages(msgs);
        if (msgs.length) lastMsgIdRef.current = msgs[msgs.length - 1].id;
        // Mark read
        threadService.markRead(selectedThreadId).catch(() => {});
      })
      .finally(() => setLoadingMsgs(false));
  }, [selectedThreadId]);

  // ── Polling for new messages ───────────────────────────────────────────────
  useEffect(() => {
    if (panelState !== 'open' || !selectedThreadId) {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }

    pollRef.current = setInterval(async () => {
      try {
        const newMsgs = await threadService.listMessages(selectedThreadId, lastMsgIdRef.current);
        if (newMsgs.length) {
          setMessages(prev => [...prev, ...newMsgs]);
          lastMsgIdRef.current = newMsgs[newMsgs.length - 1].id;
          threadService.markRead(selectedThreadId).catch(() => {});
        }
      } catch {
        // silent
      }
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [panelState, selectedThreadId]);

  // ── Scroll to bottom when messages arrive ─────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    if (!selectedThreadId || (!draft.trim() && !attachFile)) return;
    setSending(true);
    try {
      const msg = await threadService.postMessage(selectedThreadId, draft.trim(), attachFile ?? undefined);
      setMessages(prev => [...prev, msg]);
      lastMsgIdRef.current = msg.id;
      clearDraft();
      setAttachFile(null);
    } catch {
      // silent — user sees the input still has their text
    } finally {
      setSending(false);
    }
  }, [selectedThreadId, draft, attachFile, clearDraft]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Create new thread ─────────────────────────────────────────────────────
  const handleCreateThread = useCallback(async () => {
    if (!activeTarget) return;
    setCreateError('');
    try {
      const thread = await threadService.create({
        page: activeTarget.pageId,
        content_type: activeTarget.contentTypeId,
        object_id: activeTarget.objectId,
        reason: createReason || undefined,
        participant_ids: createParticipantIds,
      });
      setThreads(prev => [thread, ...prev]);
      setSelectedThreadId(thread.id);
      setCreating(false);
      setCreateReason('');
    } catch (e: any) {
      setCreateError(e?.message ?? 'Failed to create thread.');
    }
  }, [activeTarget, createReason, createParticipantIds]);

  // ── Close / Reopen thread ─────────────────────────────────────────────────
  const handleClose = useCallback(async () => {
    if (!selectedThreadId) return;
    const updated = await threadService.close(selectedThreadId);
    setThreads(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  }, [selectedThreadId]);

  const handleReopen = useCallback(async () => {
    if (!selectedThreadId) return;
    const updated = await threadService.reopen(selectedThreadId);
    setThreads(prev => prev.map(t => (t.id === updated.id ? updated : t)));
  }, [selectedThreadId]);

  // ── Not visible ───────────────────────────────────────────────────────────
  if (panelState === 'hidden') return null;

  // ── Minimised tab ─────────────────────────────────────────────────────────
  if (panelState === 'minimised') {
    const unreadCount = selectedThread?.unread_count ?? 0;
    const draftPending = draft.trim().length > 0;
    return (
      <button
        onClick={() => openPanel(activeTarget!)}
        title="Restore thread panel"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1
                   bg-[#0a1857] text-white py-4 px-2 rounded-l-xl shadow-lg hover:bg-[#0d1f6b]
                   transition-colors"
        style={{ writingMode: 'vertical-rl' }}
      >
        <MessageSquare className="w-4 h-4 mb-1 rotate-90" style={{ writingMode: 'horizontal-tb' }} />
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
  const requiresReason = pageConfig?.thread?.require_reason ?? false;
  const canInitiate = pageConfig?.can_initiate ?? false;

  return (
    <>
      {/* Overlay dimmer for tablet */}
      <div
        className="fixed inset-0 bg-black/20 z-30 md:hidden lg:hidden xl:hidden"
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
                className={cn(
                  'flex-shrink-0 text-xs px-3 py-1 rounded-full border transition-colors',
                  selectedThreadId === t.id
                    ? 'bg-[#0a1857] text-white border-[#0a1857]'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                )}
              >
                {t.reason ? REASON_LABELS[t.reason as ThreadReason] : `Thread ${t.id}`}
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
              {selectedThread.participants.slice(0, 6).map(p => (
                <div
                  key={p.id}
                  title={p.user_info.full_name}
                  className="w-6 h-6 rounded-full bg-[#0a1857] text-white text-[9px] font-bold flex items-center justify-center border border-white"
                >
                  {p.user_info.full_name.charAt(0).toUpperCase()}
                </div>
              ))}
              {selectedThread.participants.length > 6 && (
                <div className="w-6 h-6 rounded-full bg-gray-300 text-gray-600 text-[9px] font-bold flex items-center justify-center border border-white">
                  +{selectedThread.participants.length - 6}
                </div>
              )}
            </div>
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

          {/* Create new thread form */}
          {creating && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">New discussion</p>
              {(requiresReason || true) && (
                <select
                  value={createReason}
                  onChange={e => setCreateReason(e.target.value as ThreadReason | '')}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1857]"
                >
                  <option value="">Select reason (optional)</option>
                  {(Object.entries(REASON_LABELS) as [ThreadReason, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              )}
              {createError && (
                <p className="text-xs text-red-600">{createError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleCreateThread}
                  className="flex-1 px-3 py-2 bg-[#0a1857] text-white text-sm rounded-lg hover:bg-[#0d1f6b] transition-colors"
                >
                  Create
                </button>
                <button
                  onClick={() => setCreating(false)}
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
              {loadingMsgs && (
                <div className="flex justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[#0a1857] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {messages.map(msg => (
                <ThreadMessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.author === user?.id}
                />
              ))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* ── Footer: message input ── */}
        {selectedThread && !creating && (
          <div className="border-t border-gray-200 px-4 py-3">
            {isClosed ? (
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Thread is closed
                </p>
                <button
                  onClick={handleReopen}
                  className="text-xs text-[#0a1857] hover:underline flex items-center gap-1"
                >
                  <Unlock className="w-3 h-3" /> Reopen
                </button>
              </div>
            ) : (
              <>
                {attachFile && (
                  <div className="flex items-center gap-2 mb-2 px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                    <Paperclip className="w-3 h-3" />
                    <span className="truncate flex-1">{attachFile.name}</span>
                    <button onClick={() => setAttachFile(null)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <textarea
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message… (Enter to send)"
                    rows={2}
                    className="flex-1 resize-none border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1857] placeholder-gray-400"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      title="Attach file"
                      className="p-2 rounded-xl border border-gray-300 hover:bg-gray-50 text-gray-500 transition-colors"
                    >
                      <Paperclip className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleSend}
                      disabled={sending || (!draft.trim() && !attachFile)}
                      title="Send (Enter)"
                      className={cn(
                        'p-2 rounded-xl transition-colors',
                        draft.trim() || attachFile
                          ? 'bg-[#0a1857] text-white hover:bg-[#0d1f6b]'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      )}
                    >
                      {sending ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={e => setAttachFile(e.target.files?.[0] ?? null)}
                />

                {/* Close thread action */}
                {selectedThread.initiated_by === user?.id && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={handleClose}
                      className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                    >
                      <Lock className="w-3 h-3" /> Close thread
                    </button>
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
