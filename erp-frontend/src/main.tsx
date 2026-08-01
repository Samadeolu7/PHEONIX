import * as React from 'react';

import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { BRAND } from './constants/brand';

document.title = `${BRAND.systemLabel} — ${BRAND.companyName}`;
const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (favicon) favicon.href = BRAND.logoUrl;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
