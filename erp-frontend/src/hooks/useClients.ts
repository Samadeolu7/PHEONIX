import { useQuery } from '@tanstack/react-query';
import { clientService, type ClientFilters } from '../services/clientService';

export const clientKeys = {
  all: ['clients'] as const,
  lists: () => [...clientKeys.all, 'list'] as const,
  list: (params?: ClientFilters) => [...clientKeys.lists(), params] as const,
};

export const useClients = (filters?: ClientFilters) => {
  return useQuery({
    queryKey: clientKeys.list(filters),
    queryFn: async () => {
      const res = await clientService.getClients(filters);
      return Array.isArray(res) ? res : ((res as { results?: unknown[] }).results ?? res);
    },
    staleTime: 60_000,
  });
};
