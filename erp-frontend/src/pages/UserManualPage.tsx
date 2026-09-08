import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Full-screen embed of the static manual in public/phoenix-erp-manual.html.
// It's its own self-contained document (fonts, styles, nav, search) — an
// iframe keeps its styles isolated from the app shell's Tailwind/styled-components.
const UserManualPage: React.FC = () => {
  const { isDirectorPlus, activeBranch } = useAuth();
  // Matches RoleBasedLayout's pt-16/pt-24 (64px/96px) offset for the fixed top nav
  // and the all-branches banner, so the manual starts right below them.
  const topOffset = isDirectorPlus && !activeBranch ? 96 : 64;

  // ?topic=howto-petty-cash-bank deep-links straight to a chapter or How-To
  // entry (its anchor id in the manual) — see ManualLink.tsx for the sender side.
  const [searchParams] = useSearchParams();
  const topic = searchParams.get('topic');
  const src = topic
    ? `/phoenix-erp-manual.html#${encodeURIComponent(topic)}`
    : '/phoenix-erp-manual.html';

  return (
    <iframe
      key={src}
      src={src}
      title="Phoenix ERP Manual"
      style={{
        position: 'fixed',
        top: topOffset,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        border: 'none',
      }}
    />
  );
};

export default UserManualPage;
