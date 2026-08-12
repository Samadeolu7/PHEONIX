import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Paperclip, ChevronDown, ChevronUp, Pencil, Trash2, Check, X, Reply, FileText } from 'lucide-react';
import { cn } from '../../lib/utils';
import { threadService } from '../../services/threadService';
import type { ThreadMessageItem } from '../../types/threads';

interface Props {
  message: ThreadMessageItem;
  isOwn: boolean;
  onUpdated: (msg: ThreadMessageItem) => void;
  onDeleted: (msgId: number) => void;
  onReply?: (msg: ThreadMessageItem) => void;
  onJumpTo?: (messageId: number) => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ThreadMessageBubble: React.FC<Props> = ({ message, isOwn, onUpdated, onDeleted, onReply, onJumpTo }) => {
  const [showReaders, setShowReaders] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(message.body);

  const editMutation = useMutation({
    mutationFn: ({ messageId, body }: { messageId: number; body: string }) =>
      threadService.editMessage(messageId, body),
    onSuccess: (updated) => {
      onUpdated(updated);
      setEditing(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (messageId: number) => threadService.deleteMessage(messageId),
    onSuccess: () => onDeleted(message.id),
  });

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleSaveEdit = () => {
    if (!editBody.trim()) return;
    editMutation.mutate({ messageId: message.id, body: editBody.trim() });
  };

  const handleDelete = () => {
    if (!window.confirm('Delete this message?')) return;
    deleteMutation.mutate(message.id);
  };

  if (message.is_system_message) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    );
  }

  const attachments = message.attachments ?? [];

  return (
    <div className={cn('flex gap-2 mb-3 group', isOwn ? 'flex-row-reverse' : 'flex-row')}>
      {/* Avatar */}
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-1',
          isOwn ? 'bg-[#0a1857] text-white' : 'bg-gray-200 text-gray-700'
        )}
      >
        {message.author_name.charAt(0).toUpperCase()}
      </div>

      <div className={cn('max-w-[75%]', isOwn ? 'items-end' : 'items-start', 'flex flex-col')}>
        {/* Name + time + actions */}
        <div
          className={cn(
            'flex items-baseline gap-1.5 mb-0.5',
            isOwn ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span className="text-xs font-medium text-gray-700">{message.author_name}</span>
          <span className="text-[10px] text-gray-400">{time}</span>
          {message.edited_at && (
            <span className="text-[10px] text-gray-400 italic" title={`Edited ${new Date(message.edited_at).toLocaleString()}`}>
              (edited)
            </span>
          )}
          {!editing && (
            <span className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {onReply && (
                <button
                  onClick={() => onReply(message)}
                  title="Reply"
                  className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                >
                  <Reply className="w-3 h-3" />
                </button>
              )}
              {isOwn && (
                <>
                  <button
                    onClick={() => { setEditing(true); setEditBody(message.body); }}
                    title="Edit message"
                    className="p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={handleDelete}
                    title="Delete message"
                    className="p-0.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </span>
          )}
        </div>

        {/* Bubble or edit form */}
        {editing ? (
          <div className="flex flex-col gap-1 w-full">
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={2}
              placeholder="Edit your message…"
              aria-label="Edit message"
              className="w-full border border-[#0a1857] rounded-lg px-2 py-1 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0a1857]"
              autoFocus
            />
            {editMutation.isError && <p className="text-xs text-red-600">Failed to save edit.</p>}
            <div className="flex gap-1">
              <button
                onClick={handleSaveEdit}
                disabled={editMutation.isPending || !editBody.trim()}
                className="flex items-center gap-1 px-2 py-1 bg-[#0a1857] text-white text-xs rounded hover:bg-[#0d1f6b] disabled:opacity-50"
              >
                <Check className="w-3 h-3" /> Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1 px-2 py-1 border border-gray-300 text-xs rounded hover:bg-gray-50"
              >
                <X className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'px-3 py-2 rounded-2xl text-sm leading-relaxed',
              isOwn
                ? 'bg-[#0a1857] text-white rounded-tr-sm'
                : 'bg-gray-100 text-gray-900 rounded-tl-sm'
            )}
          >
            {message.reply_to_preview && (
              <button
                onClick={() => onJumpTo?.(message.reply_to_preview!.id)}
                className={cn(
                  'block w-full text-left mb-1.5 px-2 py-1 rounded-lg border-l-2 text-xs truncate',
                  isOwn
                    ? 'border-white/40 bg-white/10 text-blue-100'
                    : 'border-[#0a1857]/30 bg-black/5 text-gray-500'
                )}
              >
                <span className="font-medium">{message.reply_to_preview.author_name}</span>
                {': '}
                {message.reply_to_preview.body || '(empty message)'}
              </button>
            )}

            {message.body}

            {/* Legacy single attachment (messages sent before multi-attachment support) */}
            {message.attachment_url && attachments.length === 0 && (
              <a
                href={message.attachment_url}
                target="_blank"
                rel="noreferrer"
                className={cn(
                  'flex items-center gap-1 mt-1 text-xs underline',
                  isOwn ? 'text-blue-200' : 'text-blue-600'
                )}
              >
                <Paperclip className="w-3 h-3" />
                Attachment
              </a>
            )}

            {attachments.length > 0 && (
              <div className="mt-1.5 flex flex-col gap-1.5">
                {attachments.map(att => {
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
                      <span className="text-[10px] opacity-70 flex-shrink-0">{formatSize(att.size)}</span>
                    </a>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Read receipts */}
        {!editing && message.read_by.length > 0 && (
          <button
            onClick={() => setShowReaders(v => !v)}
            className="flex items-center gap-0.5 mt-0.5 text-[10px] text-gray-400 hover:text-gray-600"
          >
            <span>Seen by {message.read_by.length}</span>
            {showReaders ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        )}
        {showReaders && (
          <div className="text-[10px] text-gray-500 mt-0.5">
            {message.read_by.map(r => r.participant_name).join(', ')}
          </div>
        )}
      </div>
    </div>
  );
};
