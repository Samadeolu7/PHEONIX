import React, { useState } from 'react';
import { Paperclip, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { ThreadMessageItem } from '../../types/threads';

interface Props {
  message: ThreadMessageItem;
  isOwn: boolean;
}

export const ThreadMessageBubble: React.FC<Props> = ({ message, isOwn }) => {
  const [showReaders, setShowReaders] = useState(false);

  const time = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (message.is_system_message) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
          {message.body}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2 mb-3', isOwn ? 'flex-row-reverse' : 'flex-row')}>
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
        {/* Name + time */}
        <div
          className={cn(
            'flex items-baseline gap-1.5 mb-0.5',
            isOwn ? 'flex-row-reverse' : 'flex-row'
          )}
        >
          <span className="text-xs font-medium text-gray-700">{message.author_name}</span>
          <span className="text-[10px] text-gray-400">{time}</span>
        </div>

        {/* Bubble */}
        <div
          className={cn(
            'px-3 py-2 rounded-2xl text-sm leading-relaxed',
            isOwn
              ? 'bg-[#0a1857] text-white rounded-tr-sm'
              : 'bg-gray-100 text-gray-900 rounded-tl-sm'
          )}
        >
          {message.body}
          {message.attachment_url && (
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
        </div>

        {/* Read receipts */}
        {message.read_by.length > 0 && (
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
