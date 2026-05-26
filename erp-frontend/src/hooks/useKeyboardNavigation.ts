// Custom hook for keyboard navigation in search results
import { useEffect, useCallback } from 'react';

interface UseKeyboardNavigationProps {
  isOpen: boolean;
  itemCount: number;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectItem: () => void;
  onClose: () => void;
  onOpen?: () => void;
}

export const useKeyboardNavigation = ({
  isOpen,
  itemCount,
  selectedIndex,
  onSelectIndex,
  onSelectItem,
  onClose,
  onOpen,
}: UseKeyboardNavigationProps) => {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Global keyboard shortcuts
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        if (onOpen) {
          onOpen();
        }
        return;
      }

      // Only handle navigation keys when search is open
      if (!isOpen || itemCount === 0) return;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          onSelectIndex(selectedIndex < itemCount - 1 ? selectedIndex + 1 : 0);
          break;

        case 'ArrowUp':
          event.preventDefault();
          onSelectIndex(selectedIndex > 0 ? selectedIndex - 1 : itemCount - 1);
          break;

        case 'Enter':
          event.preventDefault();
          if (selectedIndex >= 0) {
            onSelectItem();
          }
          break;

        case 'Escape':
          event.preventDefault();
          onClose();
          break;

        case 'Home':
          event.preventDefault();
          onSelectIndex(0);
          break;

        case 'End':
          event.preventDefault();
          onSelectIndex(itemCount - 1);
          break;

        case 'PageDown':
          event.preventDefault();
          const nextIndex = Math.min(selectedIndex + 5, itemCount - 1);
          onSelectIndex(nextIndex);
          break;

        case 'PageUp':
          event.preventDefault();
          const prevIndex = Math.max(selectedIndex - 5, 0);
          onSelectIndex(prevIndex);
          break;
      }
    },
    [isOpen, itemCount, selectedIndex, onSelectIndex, onSelectItem, onClose, onOpen]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && selectedIndex >= 0) {
      const selectedElement = document.querySelector(`[data-search-index="${selectedIndex}"]`);
      if (selectedElement) {
        selectedElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });
      }
    }
  }, [isOpen, selectedIndex]);

  return {
    // Utility functions for components
    getItemProps: (index: number) => ({
      'data-search-index': index,
      'aria-selected': index === selectedIndex,
      role: 'option',
    }),

    getListProps: () => ({
      role: 'listbox',
      'aria-activedescendant': selectedIndex >= 0 ? `search-item-${selectedIndex}` : undefined,
    }),
  };
};
