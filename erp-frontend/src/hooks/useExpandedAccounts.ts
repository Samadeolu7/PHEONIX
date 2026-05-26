// useExpandedAccounts Hook
// Manages expanded/collapsed state for account hierarchies

import { useState, useCallback } from 'react';

export interface UseExpandedAccountsReturn {
  expandedAccounts: Set<string>;
  toggleAccount: (code: string) => void;
  expandAll: (accountCodes: string[]) => void;
  collapseAll: () => void;
  isExpanded: (code: string) => boolean;
}

export const useExpandedAccounts = (initialExpanded: string[] = []): UseExpandedAccountsReturn => {
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set(initialExpanded));

  const toggleAccount = useCallback((code: string) => {
    setExpandedAccounts(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const expandAll = useCallback((accountCodes: string[]) => {
    setExpandedAccounts(new Set(accountCodes));
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedAccounts(new Set());
  }, []);

  const isExpanded = useCallback(
    (code: string) => {
      return expandedAccounts.has(code);
    },
    [expandedAccounts]
  );

  return {
    expandedAccounts,
    toggleAccount,
    expandAll,
    collapseAll,
    isExpanded,
  };
};

export default useExpandedAccounts;
