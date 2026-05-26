import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes before marking stale
      staleTime: 5 * 60 * 1000,
      // Hold unused data in memory for 15 minutes
      gcTime: 15 * 60 * 1000,
      // Don't re-fetch just because the user switched browser tabs
      refetchOnWindowFocus: false,
      // Don't re-fetch when a component that already has data re-mounts
      refetchOnMount: false,
      // Only retry server-side errors, never client errors (4xx)
      retry: (failureCount, error: any) => {
        if (error?.status >= 400 && error?.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30_000),
    },
    mutations: {
      retry: false,
    },
  },
});
