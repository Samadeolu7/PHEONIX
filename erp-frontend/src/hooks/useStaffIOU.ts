import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrService } from '../services/hrService';
import { CreateStaffIOUData, StaffIOUFilters } from '../types/hr';

const QUERY_KEY = 'staff-ious';

export const useStaffIOUs = (filters?: StaffIOUFilters) =>
  useQuery({
    queryKey: [QUERY_KEY, filters],
    queryFn: () => hrService.getStaffIOUs(filters),
  });

export const useStaffIOU = (id: number) =>
  useQuery({
    queryKey: [QUERY_KEY, id],
    queryFn: () => hrService.getStaffIOU(id),
    enabled: !!id,
  });

export const useCreateStaffIOU = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateStaffIOUData) => hrService.createStaffIOU(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};

export const useCancelStaffIOU = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => hrService.cancelStaffIOU(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};

export const useApproveStaffIOU = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => hrService.approveStaffIOU(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};

export const useDisburseStaffIOU = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      type: 'payroll_only' | 'cash';
      credit_account_id?: number;
      description_override?: string;
    }) =>
      hrService.disburseStaffIOU(args.id, {
        type: args.type,
        credit_account_id: args.credit_account_id,
        description_override: args.description_override,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};

export const useAdjustStaffIOUBalance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; new_total_amount: number; reason: string }) =>
      hrService.adjustStaffIOUBalance(args.id, {
        new_total_amount: args.new_total_amount,
        reason: args.reason,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};

export const useBulkDebitStaffIOU = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Parameters<typeof hrService.bulkDebitStaffIOU>[0]) =>
      hrService.bulkDebitStaffIOU(payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: [QUERY_KEY] }),
  });
};
