import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useErrorHandler } from './useErrorHandler';

export interface OptimisticUpdate<T> {
  id: string;
  type: 'create' | 'update' | 'delete';
  data: T;
  originalData?: T;
  timestamp: number;
  queryKey: string[];
}

export interface ConflictResolution<T> {
  localData: T;
  serverData: T;
  resolution: 'use_local' | 'use_server' | 'merge' | 'manual';
  mergedData?: T;
}

export interface UseOptimisticUpdatesOptions<T> {
  onConflict?: (conflict: ConflictResolution<T>) => Promise<T>;
  conflictDetection?: (local: T, server: T) => boolean;
  autoResolveConflicts?: boolean;
}

export const useOptimisticUpdates = <T extends { id?: number | string; updated_at?: string }>(
  options: UseOptimisticUpdatesOptions<T> = {}
) => {
  const queryClient = useQueryClient();
  const { handleError } = useErrorHandler();
  const [pendingUpdates, setPendingUpdates] = useState<OptimisticUpdate<T>[]>([]);
  const [conflicts, setConflicts] = useState<ConflictResolution<T>[]>([]);
  const updateIdCounter = useRef(0);

  const {
    onConflict,
    conflictDetection = defaultConflictDetection,
    autoResolveConflicts = false,
  } = options;

  // Generate unique update ID
  const generateUpdateId = useCallback(() => {
    return `optimistic_${Date.now()}_${++updateIdCounter.current}`;
  }, []);

  // Default conflict detection based on updated_at timestamp
  function defaultConflictDetection(local: T, server: T): boolean {
    if (!local.updated_at || !server.updated_at) return false;
    return new Date(local.updated_at) < new Date(server.updated_at);
  }

  // Apply optimistic update to query cache
  const applyOptimisticUpdate = useCallback(
    <TData>(
      queryKey: string[],
      updateFn: (oldData: TData) => TData,
      updateId: string,
      type: OptimisticUpdate<T>['type'],
      data: T,
      originalData?: T
    ) => {
      // Store the update for rollback purposes
      const update: OptimisticUpdate<T> = {
        id: updateId,
        type,
        data,
        originalData,
        timestamp: Date.now(),
        queryKey,
      };

      setPendingUpdates(prev => [...prev, update]);

      // Apply optimistic update to cache
      queryClient.setQueryData(queryKey, updateFn);

      return update;
    },
    [queryClient]
  );

  // Rollback optimistic update
  const rollbackUpdate = useCallback(
    (updateId: string) => {
      const update = pendingUpdates.find(u => u.id === updateId);
      if (!update) return;

      // Remove from pending updates
      setPendingUpdates(prev => prev.filter(u => u.id !== updateId));

      // Rollback the cache change
      queryClient.setQueryData(update.queryKey, (oldData: any) => {
        if (update.type === 'create') {
          // Remove the optimistically added item
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: oldData.results.filter((item: T) => item.id !== update.data.id),
            };
          }
          return null;
        } else if (update.type === 'update' && update.originalData) {
          // Restore original data
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: oldData.results.map((item: T) =>
                item.id === update.data.id ? update.originalData! : item
              ),
            };
          }
          return update.originalData;
        } else if (update.type === 'delete' && update.originalData) {
          // Restore deleted item
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: [...oldData.results, update.originalData],
            };
          }
          return update.originalData;
        }
        return oldData;
      });
    },
    [pendingUpdates, queryClient]
  );

  // Confirm optimistic update (remove from pending)
  const confirmUpdate = useCallback((updateId: string) => {
    setPendingUpdates(prev => prev.filter(u => u.id !== updateId));
  }, []);

  // Handle server response and detect conflicts
  const handleServerResponse = useCallback(
    async (updateId: string, serverData: T, queryKey: string[]) => {
      const update = pendingUpdates.find(u => u.id === updateId);
      if (!update) return serverData;

      // Check for conflicts
      const hasConflict = conflictDetection(update.data, serverData);

      if (hasConflict) {
        const conflict: ConflictResolution<T> = {
          localData: update.data,
          serverData,
          resolution: autoResolveConflicts ? 'use_server' : 'manual',
        };

        if (autoResolveConflicts) {
          // Auto-resolve by using server data
          queryClient.setQueryData(queryKey, (oldData: any) => {
            if (Array.isArray(oldData?.results)) {
              return {
                ...oldData,
                results: oldData.results.map((item: T) =>
                  item.id === serverData.id ? serverData : item
                ),
              };
            }
            return serverData;
          });
          confirmUpdate(updateId);
          return serverData;
        } else {
          // Add to conflicts for manual resolution
          setConflicts(prev => [...prev, conflict]);

          if (onConflict) {
            try {
              const resolvedData = await onConflict(conflict);
              queryClient.setQueryData(queryKey, (oldData: any) => {
                if (Array.isArray(oldData?.results)) {
                  return {
                    ...oldData,
                    results: oldData.results.map((item: T) =>
                      item.id === resolvedData.id ? resolvedData : item
                    ),
                  };
                }
                return resolvedData;
              });
              confirmUpdate(updateId);
              return resolvedData;
            } catch (error) {
              handleError(error, 'resolve conflict');
              rollbackUpdate(updateId);
              throw error;
            }
          }
        }
      } else {
        // No conflict, confirm the update
        confirmUpdate(updateId);
      }

      return serverData;
    },
    [
      pendingUpdates,
      conflictDetection,
      autoResolveConflicts,
      queryClient,
      onConflict,
      handleError,
      confirmUpdate,
      rollbackUpdate,
    ]
  );

  // Optimistic create
  const optimisticCreate = useCallback(
    async <TData>(queryKey: string[], createFn: () => Promise<T>, newItem: T) => {
      const updateId = generateUpdateId();

      // Apply optimistic update
      const update = applyOptimisticUpdate<TData>(
        queryKey,
        (oldData: any) => {
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: [newItem, ...oldData.results],
              count: (oldData.count || 0) + 1,
            };
          }
          return newItem;
        },
        updateId,
        'create',
        newItem
      );

      try {
        const serverData = await createFn();
        return await handleServerResponse(updateId, serverData, queryKey);
      } catch (error) {
        rollbackUpdate(updateId);
        throw error;
      }
    },
    [generateUpdateId, applyOptimisticUpdate, handleServerResponse, rollbackUpdate]
  );

  // Optimistic update
  const optimisticUpdate = useCallback(
    async <TData>(
      queryKey: string[],
      updateFn: () => Promise<T>,
      updatedItem: T,
      originalItem: T
    ) => {
      const updateId = generateUpdateId();

      // Apply optimistic update
      const update = applyOptimisticUpdate<TData>(
        queryKey,
        (oldData: any) => {
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: oldData.results.map((item: T) =>
                item.id === updatedItem.id ? updatedItem : item
              ),
            };
          }
          return updatedItem;
        },
        updateId,
        'update',
        updatedItem,
        originalItem
      );

      try {
        const serverData = await updateFn();
        return await handleServerResponse(updateId, serverData, queryKey);
      } catch (error) {
        rollbackUpdate(updateId);
        throw error;
      }
    },
    [generateUpdateId, applyOptimisticUpdate, handleServerResponse, rollbackUpdate]
  );

  // Optimistic delete
  const optimisticDelete = useCallback(
    async <TData>(queryKey: string[], deleteFn: () => Promise<void>, itemToDelete: T) => {
      const updateId = generateUpdateId();

      // Apply optimistic update
      const update = applyOptimisticUpdate<TData>(
        queryKey,
        (oldData: any) => {
          if (Array.isArray(oldData?.results)) {
            return {
              ...oldData,
              results: oldData.results.filter((item: T) => item.id !== itemToDelete.id),
              count: Math.max((oldData.count || 0) - 1, 0),
            };
          }
          return null;
        },
        updateId,
        'delete',
        itemToDelete,
        itemToDelete
      );

      try {
        await deleteFn();
        confirmUpdate(updateId);
      } catch (error) {
        rollbackUpdate(updateId);
        throw error;
      }
    },
    [generateUpdateId, applyOptimisticUpdate, confirmUpdate, rollbackUpdate]
  );

  // Resolve conflict manually
  const resolveConflict = useCallback(
    (
      conflict: ConflictResolution<T>,
      resolution: ConflictResolution<T>['resolution'],
      mergedData?: T
    ) => {
      const resolvedData =
        resolution === 'use_local'
          ? conflict.localData
          : resolution === 'use_server'
            ? conflict.serverData
            : mergedData || conflict.serverData;

      // Remove from conflicts
      setConflicts(prev => prev.filter(c => c !== conflict));

      return resolvedData;
    },
    []
  );

  // Clear all conflicts
  const clearConflicts = useCallback(() => {
    setConflicts([]);
  }, []);

  return {
    // State
    pendingUpdates,
    conflicts,
    hasPendingUpdates: pendingUpdates.length > 0,
    hasConflicts: conflicts.length > 0,

    // Methods
    optimisticCreate,
    optimisticUpdate,
    optimisticDelete,
    rollbackUpdate,
    confirmUpdate,
    resolveConflict,
    clearConflicts,
  };
};

export default useOptimisticUpdates;
