import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useThreadContext } from '../../contexts/ThreadContext';

interface Props {
  /** DOM id of the section to scroll to on click — see ThreadWidget's container. */
  targetId: string;
  className?: string;
}

/**
 * Small, high-visibility pill for the dashboard's greeting header — the
 * existing ThreadWidget (full discussions summary) sits far down the page,
 * below the KPI grids, so this surfaces "you have unread discussions" right
 * where the user actually looks first and scrolls them straight to it.
 * Invisible when there's nothing unread — it's a notification, not a
 * permanent nav item (see GlobalThreadToggle for the equivalent
 * always-there-when-relevant pattern on other pages).
 *
 * globalUnreadCount is populated by ThreadWidget's own poll (see
 * ThreadContext) — read only here, not re-fetched, so this stays a pure
 * display of state someone else already owns.
 */
export const DiscussionNotificationBadge: React.FC<Props> = ({ targetId, className }) => {
  const { globalUnreadCount } = useThreadContext();

  if (globalUnreadCount <= 0) return null;

  const handleClick = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${globalUnreadCount} unread discussion message${globalUnreadCount === 1 ? '' : 's'}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-colors ${className ?? ''}`}
      style={{
        background: 'rgba(220,38,38,0.18)',
        color: '#fca5a5',
        border: '1px solid rgba(220,38,38,0.40)',
      }}
    >
      <MessageSquare className="w-3.5 h-3.5" />
      {globalUnreadCount} unread {globalUnreadCount === 1 ? 'message' : 'messages'}
    </button>
  );
};
