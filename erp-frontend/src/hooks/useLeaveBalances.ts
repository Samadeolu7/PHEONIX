import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveBalanceService } from '../services/leaveBalanceService';
import { useToast } from '../contexts/ToastContext';

export const useLeaveBalances = (params?: {
  staff?: number;
  year?: number;
  leave_type?: number;
  page?: number;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['leave-balances', params],
    queryFn: () => leaveBalanceService.getLeaveBalances(params),
  });
};

export const useLeaveBalance = (id: number) => {
  return useQuery({
    queryKey: ['leave-balance', id],
    queryFn: () => leaveBalanceService.getLeaveBalance(id),
    enabled: !!id,
  });
};

export const useInitializeLeaveBalances = () => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: (data: { year: number; staff_ids?: number[] }) =>
      leaveBalanceService.initializeLeaveBalancesForYear(data),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      showToast(`Successfully initialized leave balances for ${result.year}`, 'success');
    },
    onError: (error: any) => {
      const errorMessage = error.response?.data?.message || 'Failed to initialize leave balances';
      showToast(errorMessage, 'error');
    },
  });
};
