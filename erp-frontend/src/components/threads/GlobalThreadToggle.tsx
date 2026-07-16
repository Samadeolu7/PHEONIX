import React, { useEffect, useMemo, useState } from 'react';
import { matchPath, useLocation } from 'react-router-dom';
import { ROUTE_TO_PAGE } from '../../config/routeToPageMap';
import { api } from '../../services/api';
import { ThreadToggleButton } from './ThreadToggleButton';

// Literal (non-parameterized) patterns are tried before ':id'-style ones so
// a more specific static route is never shadowed by a broader dynamic one
// matching the same segment count (e.g. '/loans/accounts/new' should win
// over '/loans/accounts/:id' when both could match).
const SORTED_ROUTE_PATTERNS = Object.keys(ROUTE_TO_PAGE).sort(
  (a, b) => Number(a.includes(':')) - Number(b.includes(':'))
);

interface ResolvedPage {
  module: string;
  page: string;
  objectId?: number;
}

function resolveCurrentPage(pathname: string): ResolvedPage | null {
  for (const pattern of SORTED_ROUTE_PATTERNS) {
    const match = matchPath({ path: pattern, end: true }, pathname);
    if (match) {
      const mapping = ROUTE_TO_PAGE[pattern];
      const rawId = match.params?.id;
      const objectId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : undefined;
      return { module: mapping.module, page: mapping.page, objectId };
    }
  }
  return null;
}

// module:page -> ModulePage id, or null if no catalog row exists for it.
// The same page is revisited constantly during normal navigation and its
// id never changes within a session, so there's no reason to re-fetch it
// on every route change — only the very first visit to a given page pays
// for the by-code lookup.
const pageIdCache = new Map<string, number | null>();

/**
 * Mounted once in RoleBasedLayout — resolves whichever page is currently
 * active (via routeToPageMap, the same module/page taxonomy already used
 * for permission checks) to its ModulePage catalog row, and renders the
 * "Discuss" toggle only when a director has marked that page
 * is_threadable=true (see pages/admin/PageDiscussionsPage.tsx). Invisible
 * everywhere else, including pages with no catalog entry at all — no
 * per-page wiring needed; toggling the admin setting is the whole
 * activation mechanism.
 */
export const GlobalThreadToggle: React.FC = () => {
  const location = useLocation();
  const resolved = useMemo(() => resolveCurrentPage(location.pathname), [location.pathname]);
  const [pageId, setPageId] = useState<number | null>(null);

  useEffect(() => {
    if (!resolved) {
      setPageId(null);
      return;
    }
    const cacheKey = `${resolved.module}:${resolved.page}`;
    if (pageIdCache.has(cacheKey)) {
      setPageId(pageIdCache.get(cacheKey) ?? null);
      return;
    }
    let cancelled = false;
    api
      .get('/pages/module-pages/by-code/', { params: { module: resolved.module, page: resolved.page } })
      .then((res: any) => {
        const id = res?.data?.id ?? null;
        pageIdCache.set(cacheKey, id);
        if (!cancelled) setPageId(id);
      })
      .catch(() => {
        pageIdCache.set(cacheKey, null);
        if (!cancelled) setPageId(null);
      });
    return () => {
      cancelled = true;
    };
    // Deliberately keyed on the codes, not `resolved` itself — navigating
    // between records of the SAME page (e.g. loan #563 -> #564) must not
    // re-trigger a by-code lookup, only objectId needs to change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolved?.module, resolved?.page]);

  if (!resolved || pageId === null) return null;

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <ThreadToggleButton
        pageId={pageId}
        objectId={resolved.objectId}
        recordLabel={resolved.objectId ? `${resolved.page} — #${resolved.objectId}` : resolved.page}
        className="shadow-lg"
      />
    </div>
  );
};
