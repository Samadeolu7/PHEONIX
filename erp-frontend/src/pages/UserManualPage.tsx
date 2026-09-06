import React from 'react';
import { useAuth } from '../contexts/AuthContext';

// Full-screen embed of the static manual in public/phoenix-erp-manual.html.
// It's its own self-contained document (fonts, styles, nav, search) — an
// iframe keeps its styles isolated from the app shell's Tailwind/styled-components.
const UserManualPage: React.FC = () => {
  const { isDirectorPlus, activeBranch } = useAuth();
  // Matches RoleBasedLayout's pt-16/pt-24 (64px/96px) offset for the fixed top nav
  // and the all-branches banner, so the manual starts right below them.
  const topOffset = isDirectorPlus && !activeBranch ? 96 : 64;

  return (
    <iframe
      src="/phoenix-erp-manual.html"
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
