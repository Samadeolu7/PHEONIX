// src/hooks/useLazyLoading.ts
import { createElement, useState, useEffect, useCallback, useRef, type UIEvent } from 'react';

interface LazyLoadingOptions<T> {
  pageSize?: number;
  threshold?: number;
  enabled?: boolean;
  onLoadMore?: (page: number) => Promise<{
    data: T[];
    hasMore: boolean;
    total?: number;
  }>;
}

interface LazyLoadingState<T> {
  data: T[];
  loading: boolean;
  hasMore: boolean;
  page: number;
  total?: number;
  error: string | null;
}

export function useLazyLoading<T>({
  pageSize = 20,
  threshold = 0.8,
  enabled = true,
  onLoadMore,
}: LazyLoadingOptions<T>) {
  const [state, setState] = useState<LazyLoadingState<T>>({
    data: [],
    loading: false,
    hasMore: true,
    page: 1,
    total: undefined,
    error: null,
  });

  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadingRef = useRef<HTMLDivElement | null>(null);
  const isLoadingRef = useRef(false);

  // Load more data
  const loadMore = useCallback(async () => {
    if (!onLoadMore || isLoadingRef.current || !state.hasMore || !enabled) {
      return;
    }

    isLoadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const result = await onLoadMore(state.page);

      setState(prev => ({
        ...prev,
        data: [...prev.data, ...result.data],
        hasMore: result.hasMore,
        page: prev.page + 1,
        total: result.total,
        loading: false,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load more data',
      }));
    } finally {
      isLoadingRef.current = false;
    }
  }, [onLoadMore, state.page, state.hasMore, enabled]);

  // Reset data
  const reset = useCallback(() => {
    setState({
      data: [],
      loading: false,
      hasMore: true,
      page: 1,
      total: undefined,
      error: null,
    });
  }, []);

  // Set up intersection observer for automatic loading
  useEffect(() => {
    if (!enabled || !loadingRef.current) return;

    observerRef.current = new IntersectionObserver(
      entries => {
        const target = entries[0];
        if (target.isIntersecting && target.intersectionRatio >= threshold) {
          loadMore();
        }
      },
      { threshold }
    );

    if (loadingRef.current) {
      observerRef.current.observe(loadingRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [enabled, threshold, loadMore]);

  // Scroll-based loading for containers
  const handleScroll = useCallback(
    (e: UIEvent<HTMLElement>) => {
      if (!enabled || state.loading || !state.hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      if (scrollPercentage >= threshold) {
        loadMore();
      }
    },
    [enabled, state.loading, state.hasMore, threshold, loadMore]
  );

  // Loading trigger component
  const LoadingTrigger = useCallback(
    () =>
      createElement(
        'div',
        {
          ref: loadingRef,
          className: 'flex items-center justify-center py-4',
        },
        state.loading
          ? createElement(
              'div',
              { className: 'flex items-center space-x-2' },
              createElement('div', {
                className: 'animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600',
              }),
              createElement('span', { className: 'text-sm text-gray-600' }, 'Loading more...')
            )
          : null,
        state.error
          ? createElement(
              'div',
              { className: 'text-center' },
              createElement('p', { className: 'text-sm text-red-600 mb-2' }, state.error),
              createElement(
                'button',
                {
                  onClick: loadMore,
                  className: 'text-sm text-blue-600 hover:text-blue-800',
                },
                'Try again'
              )
            )
          : null
      ),
    [state.loading, state.error, loadMore]
  );

  return {
    ...state,
    loadMore,
    reset,
    handleScroll,
    LoadingTrigger,
  };
}

export default useLazyLoading;
