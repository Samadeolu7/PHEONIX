import { useState, useEffect, useCallback, useRef } from 'react';

const DRAFT_PREFIX = 'thread_draft_';
const DEBOUNCE_MS = 500;
const MAX_DRAFT_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Remove stale draft keys older than MAX_DRAFT_AGE_MS from localStorage. */
function pruneOldDrafts() {
  try {
    const cutoff = Date.now() - MAX_DRAFT_AGE_MS;
    const agePrefix = `${DRAFT_PREFIX}age_`;
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith(agePrefix)) continue;
      const ts = parseInt(localStorage.getItem(key) ?? '0', 10);
      if (ts < cutoff) {
        const draftKey = DRAFT_PREFIX + key.slice(agePrefix.length);
        localStorage.removeItem(draftKey);
        localStorage.removeItem(key);
      }
    }
  } catch {
    // localStorage not available
  }
}

export function useThreadDraft(threadId: number | null) {
  const [draft, setDraftState] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Prune old drafts once on mount
  useEffect(() => { pruneOldDrafts(); }, []);

  // Load draft from localStorage when threadId changes
  useEffect(() => {
    if (!threadId) {
      setDraftState('');
      return;
    }
    const saved = localStorage.getItem(`${DRAFT_PREFIX}${threadId}`);
    setDraftState(saved ?? '');
  }, [threadId]);

  const setDraft = useCallback(
    (value: string) => {
      setDraftState(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!threadId) return;
        if (value) {
          localStorage.setItem(`${DRAFT_PREFIX}${threadId}`, value);
          localStorage.setItem(`${DRAFT_PREFIX}age_${threadId}`, String(Date.now()));
        } else {
          localStorage.removeItem(`${DRAFT_PREFIX}${threadId}`);
          localStorage.removeItem(`${DRAFT_PREFIX}age_${threadId}`);
        }
      }, DEBOUNCE_MS);
    },
    [threadId]
  );

  const clearDraft = useCallback(() => {
    setDraftState('');
    if (threadId) {
      localStorage.removeItem(`${DRAFT_PREFIX}${threadId}`);
      localStorage.removeItem(`${DRAFT_PREFIX}age_${threadId}`);
    }
  }, [threadId]);

  const hasDraft = useCallback(
    (id: number) => !!localStorage.getItem(`${DRAFT_PREFIX}${id}`),
    []
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return { draft, setDraft, clearDraft, hasDraft };
}
