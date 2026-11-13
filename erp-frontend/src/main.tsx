import * as React from 'react';

import ReactDOM from 'react-dom/client';
import './index.css';
import { BRAND } from './constants/brand';

const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) favicon.href = BRAND.logoUrl;

// The customer portal is a completely separate app: staff code (auth
// providers, token refresh, interceptors) is never loaded for /portal/*.
const isPortal =
  window.location.pathname === '/portal' || window.location.pathname.startsWith('/portal/');

const Root = React.lazy(() => (isPortal ? import('./portal/PortalApp') : import('./App')));

if (!isPortal) document.title = `${BRAND.systemLabel} — ${BRAND.companyName}`;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <React.Suspense fallback={null}>
      <Root />
    </React.Suspense>
  </React.StrictMode>
);
