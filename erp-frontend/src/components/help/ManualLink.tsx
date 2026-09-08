import React from 'react';
import { HelpCircle } from 'lucide-react';

interface ManualLinkProps {
  /** Anchor id of the chapter or How-To entry in the manual, e.g. 'howto-petty-cash-bank'. */
  topic: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Deep-links into the in-app User Manual (see UserManualPage) at a specific
 * chapter or How-To entry. Opens in a new tab so it never disturbs an
 * in-progress form on the current page.
 */
export const ManualLink: React.FC<ManualLinkProps> = ({ topic, children, className }) => (
  <a
    href={`/manual?topic=${encodeURIComponent(topic)}`}
    target="_blank"
    rel="noopener noreferrer"
    className={
      className ??
      'inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline'
    }
  >
    <HelpCircle size={14} className="flex-shrink-0" />
    {children}
  </a>
);

export default ManualLink;
