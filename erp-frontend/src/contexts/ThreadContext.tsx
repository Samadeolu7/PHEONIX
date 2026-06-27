import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { Thread, PanelState } from '../types/threads';

interface ThreadPanelTarget {
  pageId: number;
  contentTypeId?: number;
  objectId?: number;
  recordLabel?: string;
  threadId?: number; // open a specific existing thread
}

interface ThreadContextType {
  // Panel state
  panelState: PanelState;
  activeTarget: ThreadPanelTarget | null;
  activeThread: Thread | null;

  // Actions
  openPanel: (target: ThreadPanelTarget) => void;
  minimisePanel: () => void;
  restorePanel: () => void;
  closePanel: () => void;
  setActiveThread: (thread: Thread | null) => void;

  // Unread badge (for nav icon)
  globalUnreadCount: number;
  setGlobalUnreadCount: (count: number) => void;
}

const ThreadContext = createContext<ThreadContextType | undefined>(undefined);

export const ThreadProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [panelState, setPanelState] = useState<PanelState>('hidden');
  const [activeTarget, setActiveTarget] = useState<ThreadPanelTarget | null>(null);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [globalUnreadCount, setGlobalUnreadCount] = useState(0);

  // Remember scroll position of the content area when panel opens/minimises
  const prevTargetRef = useRef<ThreadPanelTarget | null>(null);

  const openPanel = useCallback((target: ThreadPanelTarget) => {
    prevTargetRef.current = target;
    setActiveTarget(target);
    setPanelState('open');
  }, []);

  const minimisePanel = useCallback(() => {
    setPanelState('minimised');
  }, []);

  const restorePanel = useCallback(() => {
    setPanelState('open');
  }, []);

  const closePanel = useCallback(() => {
    setPanelState('hidden');
    setActiveTarget(null);
    setActiveThread(null);
  }, []);

  return (
    <ThreadContext.Provider
      value={{
        panelState,
        activeTarget,
        activeThread,
        openPanel,
        minimisePanel,
        restorePanel,
        closePanel,
        setActiveThread,
        globalUnreadCount,
        setGlobalUnreadCount,
      }}
    >
      {children}
    </ThreadContext.Provider>
  );
};

export const useThreadContext = (): ThreadContextType => {
  const ctx = useContext(ThreadContext);
  if (!ctx) throw new Error('useThreadContext must be used inside <ThreadProvider>');
  return ctx;
};
