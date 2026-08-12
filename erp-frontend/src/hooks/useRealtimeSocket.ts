// Reconnecting WebSocket hooks for the threads/notifications real-time
// layer (Django Channels, see erp-backend/phoenix_erp/src/notifications).
//
// Reconnect/backoff shape is modeled on the existing, already-in-production
// src/services/statsRealTimeService.ts (same exponential-backoff pattern),
// but fixes the gap that file has: no auth token is attached to that
// connection at all. Here the access token is read from tokenManager
// (sessionStorage — same source used for every REST call, see
// services/api.ts) and passed as a `?token=` query param, since the browser
// WebSocket API cannot set an Authorization header on the handshake.
// Reconnects with a fresh token whenever tokenManager rotates one, instead
// of riding a stale token until the server-side expiry closes the socket.
//
// Deliberately push-as-invalidation, not push-as-data: every event just
// tells the caller "something changed, go refetch" (matching what the
// backend actually sends — see notifications/realtime.py's docstring on why
// payloads are ids, not full objects). Callers decide how to refetch
// (React Query invalidation, or a plain re-fetch call for pages that don't
// use React Query, like DiscussionsWorkspacePage).

import { useEffect, useRef } from 'react';
import { tokenManager } from '../services/tokenManager';
import { BASE_URL } from '../services/api';

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;

function resolveWsUrl(path: string): string {
  // BASE_URL is either a relative dev-proxy path ('/api') or an absolute
  // cross-origin API URL in production (see services/api.ts) — the socket
  // has to go to the same host the REST API is actually served from, which
  // is not necessarily this page's own origin.
  if (/^https?:\/\//i.test(BASE_URL)) {
    const apiUrl = new URL(BASE_URL);
    const wsProtocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${apiUrl.host}${path}`;
  }
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}${path}`;
}

/**
 * Generic reconnecting WebSocket subscription. `path` starting with `/ws/`;
 * pass `null` to stay disconnected (e.g. no thread selected yet). Calls
 * `onMessage` with the parsed JSON payload for every frame received.
 */
export function useRealtimeSocket(path: string | null, onMessage: (data: any) => void): void {
  const onMessageRef = useRef(onMessage);
  // Ref updates must happen in an effect, not during render (the "latest
  // callback" ref pattern) — this keeps the socket's listener able to call
  // the newest `onMessage` without the socket itself needing to reconnect
  // every time the caller passes a new function reference.
  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    if (!path) return undefined;

    let ws: WebSocket | null = null;
    let closedByClient = false;
    let reconnectAttempts = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const { accessToken } = tokenManager.getTokens();
      if (!accessToken) return; // not logged in yet — nothing to connect to
      const url = `${resolveWsUrl(path)}?token=${encodeURIComponent(accessToken)}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        reconnectAttempts = 0;
      };

      ws.onmessage = (event) => {
        try {
          onMessageRef.current(JSON.parse(event.data));
        } catch {
          // Ignore malformed frames rather than tearing down the socket.
        }
      };

      ws.onclose = (event) => {
        // Code 1000 = normal closure (we initiated it, e.g. on unmount or
        // token rotation) — don't reconnect for those.
        if (closedByClient || event.code === 1000) return;
        reconnectAttempts += 1;
        const delay = Math.min(
          RECONNECT_BASE_DELAY_MS * 2 ** (reconnectAttempts - 1),
          RECONNECT_MAX_DELAY_MS
        );
        reconnectTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws?.close();
      };
    };

    connect();

    const unsubscribeTokenRefresh = tokenManager.addRefreshListener(() => {
      ws?.close(1000, 'token-rotated');
      connect();
    });

    return () => {
      closedByClient = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close(1000, 'unmount');
      unsubscribeTokenRefresh();
    };
  }, [path]);
}

/** App-wide notification push — mount once (see RoleBasedLayout.tsx). */
export function useNotificationSocket(onMessage: (data: any) => void): void {
  useRealtimeSocket('/ws/notifications/', onMessage);
}

/** Per-thread live updates — pass null while no thread is open/selected. */
export function useThreadSocket(threadId: number | null, onMessage: (data: any) => void): void {
  useRealtimeSocket(threadId ? `/ws/threads/${threadId}/` : null, onMessage);
}
