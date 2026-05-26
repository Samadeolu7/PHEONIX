// SearchShortcut component for displaying search keyboard shortcut
import React, { useState, useEffect } from 'react';
import { Search, Command } from 'lucide-react';
import { UnifiedSearchBar } from './UnifiedSearchBar';

interface SearchShortcutProps {
  className?: string;
  placeholder?: string;
}

export const SearchShortcut: React.FC<SearchShortcutProps> = ({
  className = '',
  placeholder = 'Search...',
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  // Detect operating system
  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().indexOf('MAC') >= 0);
  }, []);

  // Handle keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        setIsSearchOpen(true);
      }

      if (event.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (isSearchOpen) {
    return (
      <div className={`relative ${className}`}>
        <UnifiedSearchBar placeholder={placeholder} autoFocus className="w-full" />
      </div>
    );
  }

  return (
    <button
      onClick={() => setIsSearchOpen(true)}
      className={`flex items-center w-full px-3 py-2 text-sm text-gray-500 bg-gray-50 
                 border border-gray-200 rounded-lg hover:bg-gray-100 hover:text-gray-700 
                 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
                 transition-colors duration-200 ${className}`}
      aria-label="Open search"
    >
      <Search className="h-4 w-4 mr-2" />
      <span className="flex-1 text-left">{placeholder}</span>

      {/* Keyboard shortcut indicator */}
      <div className="flex items-center space-x-1 text-xs text-gray-400">
        {isMac ? <Command className="h-3 w-3" /> : <span className="font-mono">Ctrl</span>}
        <span className="font-mono">K</span>
      </div>
    </button>
  );
};
