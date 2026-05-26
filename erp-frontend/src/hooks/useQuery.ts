import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface QueryOptions<T> {
  enabled?: boolean;
  initialData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  refetchInterval?: number;
  cacheTime?: number;
  staleTime?: number;
}

interface QueryResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface MutationOptions<T, R> {
  onSuccess?: (data: R) => void;
  onError?: (error: Error) => void;
  onSettled?: (data?: R, error?: Error) => void;
  onMutate?: (variables: T) => void | Promise<void>;
}

interface MutationResult<T, R> {
  mutate: (variables: T) => Promise<R>;
  isLoading: boolean;
  error: Error | null;
  reset: () => void;
}

const cache = new Map<string, { data: any; timestamp: number }>();

export function useQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: QueryOptions<T> = {}
): QueryResult<T> {
  const [data, setData] = useState<T | undefined>(options.initialData);
  const [isLoading, setIsLoading] = useState<boolean>(!options.initialData);
  const [error, setError] = useState<Error | null>(null);
  const { isAuthenticated } = useAuth();

  const fetchData = useCallback(async () => {
    // Check cache first
    const cached = cache.get(key);
    const now = Date.now();
    if (
      cached &&
      now - cached.timestamp < (options.staleTime || 5 * 60 * 1000) // Default 5 minutes
    ) {
      setData(cached.data);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher();
      setData(result);
      options.onSuccess?.(result);

      // Update cache
      cache.set(key, { data: result, timestamp: now });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [key, fetcher, options]);

  useEffect(() => {
    if (isAuthenticated && options.enabled !== false) {
      fetchData();

      // Set up refetch interval if specified
      if (options.refetchInterval) {
        const interval = setInterval(fetchData, options.refetchInterval);
        return () => clearInterval(interval);
      }
    }
  }, [isAuthenticated, fetchData, options.refetchInterval, options.enabled]);

  // Clean up old cache entries
  useEffect(() => {
    const cleanup = () => {
      const now = Date.now();
      for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > (options.cacheTime || 30 * 60 * 1000)) {
          // Default 30 minutes
          cache.delete(key);
        }
      }
    };

    cleanup();
    const interval = setInterval(cleanup, 5 * 60 * 1000); // Clean every 5 minutes
    return () => clearInterval(interval);
  }, [options.cacheTime]);

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  };
}

export function useMutation<T, R = any>(
  mutationFn: (variables: T) => Promise<R>,
  options: MutationOptions<T, R> = {}
): MutationResult<T, R> {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const reset = useCallback(() => {
    setIsLoading(false);
    setError(null);
  }, []);

  const mutate = useCallback(
    async (variables: T) => {
      setIsLoading(true);
      setError(null);

      try {
        await options.onMutate?.(variables);
        const result = await mutationFn(variables);
        options.onSuccess?.(result);
        options.onSettled?.(result);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
        options.onSettled?.(undefined, error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [mutationFn, options]
  );

  return {
    mutate,
    isLoading,
    error,
    reset,
  };
}

// Example of infinite query hook for pagination
export function useInfiniteQuery<T>(
  key: string,
  fetcher: (pageParam: number) => Promise<{ data: T[]; nextPage: number | null }>,
  options: QueryOptions<T[]> = {}
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasNextPage, setHasNextPage] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  const fetchNextPage = useCallback(async () => {
    if (!hasNextPage || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await fetcher(currentPage);
      setData(prev => [...prev, ...result.data]);
      setHasNextPage(result.nextPage !== null);
      setCurrentPage(prev => prev + 1);
      options.onSuccess?.(result.data);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, hasNextPage, isLoading, fetcher, options]);

  return {
    data,
    isLoading,
    error,
    hasNextPage,
    fetchNextPage,
  };
}
