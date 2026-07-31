import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { interbranchService } from '../services/interbranchService';
import type {
  CreateInterBranchTransferRequest,
  InterBranchTransferFilters,
} from '../types/interbranch';

export const interbranchKeys = {
  all: ['interbranch'] as const,
  transfers: (filters?: InterBranchTransferFilters) =>
    [...interbranchKeys.all, 'transfers', filters] as const,
  transfer: (id: number) => [...interbranchKeys.all, 'transfer', id] as const,
};

export const useInterbranchTransfers = (filters?: InterBranchTransferFilters) => {
  return useQuery({
    queryKey: interbranchKeys.transfers(filters),
    queryFn: () => interbranchService.listTransfers(filters),
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
};

export const useInterbranchTransfer = (id: number, enabled = true) => {
  return useQuery({
    queryKey: interbranchKeys.transfer(id),
    queryFn: () => interbranchService.getTransfer(id),
    enabled: enabled && !!id,
    staleTime: 30 * 1000,
  });
};

export const useCreateInterbranchTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateInterBranchTransferRequest) => interbranchService.createTransfer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interbranchKeys.all });
    },
  });
};

export const useReverseInterbranchTransfer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      interbranchService.reverseTransfer(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: interbranchKeys.all });
    },
  });
};
