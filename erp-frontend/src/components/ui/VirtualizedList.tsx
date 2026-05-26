import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface VirtualizedListProps<T> {
  items: T[];
  itemHeight: number | ((index: number) => number);
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  overscan?: number;
  className?: string;
  onScroll?: (scrollTop: number) => void;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  loading?: boolean;
  loadingComponent?: React.ReactNode;
  emptyComponent?: React.ReactNode;
  getItemKey?: (item: T, index: number) => string | number;
}

function VirtualizedList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
  onScroll,
  onEndReached,
  endReachedThreshold = 0.8,
  loading = false,
  loadingComponent,
  emptyComponent,
  getItemKey,
}: VirtualizedListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout>();

  // Calculate item positions for variable height support
  const itemPositions = useMemo(() => {
    if (typeof itemHeight === 'number') {
      return items.map((_, index) => ({
        top: index * itemHeight,
        height: itemHeight,
      }));
    }

    let top = 0;
    return items.map((_, index) => {
      const height = itemHeight(index);
      const position = { top, height };
      top += height;
      return position;
    });
  }, [items, itemHeight]);

  const totalHeight = useMemo(() => {
    if (itemPositions.length === 0) return 0;
    const lastItem = itemPositions[itemPositions.length - 1];
    return lastItem.top + lastItem.height;
  }, [itemPositions]);

  const visibleRange = useMemo(() => {
    if (itemPositions.length === 0) {
      return { start: 0, end: 0 };
    }

    // Binary search for start index
    let start = 0;
    let end = itemPositions.length - 1;

    while (start <= end) {
      const mid = Math.floor((start + end) / 2);
      const position = itemPositions[mid];

      if (position.top + position.height < scrollTop) {
        start = mid + 1;
      } else if (position.top > scrollTop) {
        end = mid - 1;
      } else {
        start = mid;
        break;
      }
    }

    // Find end index
    let endIndex = start;
    const viewportBottom = scrollTop + containerHeight;

    while (endIndex < itemPositions.length && itemPositions[endIndex].top < viewportBottom) {
      endIndex++;
    }

    return {
      start: Math.max(0, start - overscan),
      end: Math.min(itemPositions.length - 1, endIndex + overscan),
    };
  }, [scrollTop, containerHeight, itemPositions, overscan]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.start, visibleRange.end + 1);
  }, [items, visibleRange.start, visibleRange.end]);

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop;
      setScrollTop(newScrollTop);
      onScroll?.(newScrollTop);

      // Set scrolling state
      isScrollingRef.current = true;
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      scrollTimeoutRef.current = setTimeout(() => {
        isScrollingRef.current = false;
      }, 150);

      // Check if we've reached the end
      if (onEndReached) {
        const scrollPercentage = (newScrollTop + containerHeight) / totalHeight;
        if (scrollPercentage >= endReachedThreshold && !loading) {
          onEndReached();
        }
      }
    },
    [onScroll, onEndReached, containerHeight, totalHeight, endReachedThreshold, loading]
  );

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  if (items.length === 0 && !loading) {
    return (
      <div
        className={className}
        style={{
          height: containerHeight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {emptyComponent || (
          <div style={{ textAlign: 'center', color: '#6b7280' }}>No items to display</div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        height: containerHeight,
        overflow: 'auto',
        position: 'relative',
        willChange: 'scroll-position',
      }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${itemPositions[visibleRange.start]?.top || 0}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            willChange: 'transform',
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = visibleRange.start + index;
            const key = getItemKey ? getItemKey(item, actualIndex) : actualIndex;
            const position = itemPositions[actualIndex];

            return (
              <div
                key={key}
                style={{
                  height: position?.height || 0,
                  contain: 'layout style paint',
                }}
              >
                {renderItem(item, actualIndex)}
              </div>
            );
          })}
        </div>
      </div>

      {loading && loadingComponent && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '16px',
            display: 'flex',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.9)',
          }}
        >
          {loadingComponent}
        </div>
      )}
    </div>
  );
}

export default VirtualizedList;
