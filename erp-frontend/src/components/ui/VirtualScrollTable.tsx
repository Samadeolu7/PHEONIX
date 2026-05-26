// src/components/ui/VirtualScrollTable.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface VirtualScrollTableProps<T> {
  data: T[];
  columns: Array<{
    key: string;
    header: string;
    width?: number;
    render?: (item: T, index: number) => React.ReactNode;
    className?: string;
  }>;
  rowHeight?: number;
  containerHeight?: number;
  overscan?: number;
  onRowClick?: (item: T, index: number) => void;
  className?: string;
  loading?: boolean;
  emptyMessage?: string;
}

export function VirtualScrollTable<T extends Record<string, any>>({
  data,
  columns,
  rowHeight = 60,
  containerHeight = 400,
  overscan = 5,
  onRowClick,
  className = '',
  loading = false,
  emptyMessage = 'No data available',
}: VirtualScrollTableProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate visible range
  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
    const endIndex = Math.min(
      data.length - 1,
      Math.ceil((scrollTop + containerHeight) / rowHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, rowHeight, containerHeight, overscan, data.length]);

  // Get visible items
  const visibleItems = useMemo(() => {
    return data.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [data, visibleRange]);

  // Handle scroll
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Calculate total height
  const totalHeight = data.length * rowHeight;

  // Calculate offset for visible items
  const offsetY = visibleRange.startIndex * rowHeight;

  if (loading) {
    return (
      <div className={`border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className={`border border-gray-200 rounded-lg ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <p>{emptyMessage}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="bg-gray-50 border-b border-gray-200">
        <div className="flex">
          {columns.map(column => (
            <div
              key={column.key}
              className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${column.className || ''}`}
              style={{ width: column.width || 'auto', minWidth: column.width || 150 }}
            >
              {column.header}
            </div>
          ))}
        </div>
      </div>

      {/* Virtual Scrolling Container */}
      <div
        ref={containerRef}
        className="overflow-auto bg-white"
        style={{ height: containerHeight }}
        onScroll={handleScroll}
      >
        {/* Total height spacer */}
        <div style={{ height: totalHeight, position: 'relative' }}>
          {/* Visible items */}
          <div style={{ transform: `translateY(${offsetY}px)` }}>
            {visibleItems.map((item, index) => {
              const actualIndex = visibleRange.startIndex + index;
              return (
                <div
                  key={actualIndex}
                  className={`flex border-b border-gray-200 hover:bg-gray-50 ${
                    onRowClick ? 'cursor-pointer' : ''
                  }`}
                  style={{ height: rowHeight }}
                  onClick={() => onRowClick?.(item, actualIndex)}
                >
                  {columns.map(column => (
                    <div
                      key={column.key}
                      className={`px-6 py-4 flex items-center ${column.className || ''}`}
                      style={{ width: column.width || 'auto', minWidth: column.width || 150 }}
                    >
                      {column.render ? column.render(item, actualIndex) : item[column.key]}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer with row count */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-2">
        <div className="text-sm text-gray-500">
          Showing {visibleRange.startIndex + 1}-{Math.min(visibleRange.endIndex + 1, data.length)}{' '}
          of {data.length} rows
        </div>
      </div>
    </div>
  );
}

export default VirtualScrollTable;
