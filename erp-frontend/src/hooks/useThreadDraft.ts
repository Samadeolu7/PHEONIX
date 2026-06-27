import { useState, useEffect, useCallback, useRef } from 'react';

const DRAFT_PREFIX = 'thread_draft_';
const DEBOUNCE_MS = 500;

export function useThreadDraft(threadId: number | null) {
  const [draft, setDraftState] = useState<string>('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        } else {
          localStorage.removeItem(`${DRAFT_PREFIX}${threadId}`);
        }
      }, DEBOUNCE_MS);
    },
    [threadId]
  );

  const clearDraft = useCallback(() => {
    setDraftState('');
    if (threadId) localStorage.removeItem(`${DRAFT_PREFIX}${threadId}`);
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
