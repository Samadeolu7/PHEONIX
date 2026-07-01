// useTrialBalance Hook
// Custom hook for Trial Balance report with TanStack Query integration

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { financialReportsService } from '../services/financialReportsService';
import { TrialBalanceData, TrialBalanceParams, ExportFormat } from '../types/financialReports';

export interface UseTrialBalanceReturn {
  data: TrialBalanceData | undefined;
  loading: boolean;
  error: string | null;
  refetch: (params?: TrialBalanceParams) => Promise<void>;
  exportReport: (format: ExportFormat) => Promise<void>;
  isRefetching: boolean;
}

export const useTrialBalance = (initialParams: TrialBalanceParams = {}): UseTrialBalanceReturn => {
  const queryClient = useQueryClient();

  // Create a stable query key
  const queryKey = ['trialBalance', initialParams];

  // Main query for fetching trial balance data
  const {
    data,
    isLoading,
    error,
    refetch: queryRefetch,
    isRefetching,
  } = useQuery({
    queryKey,
    queryFn: () => financialReportsService.getTrialBalance(initialParams),
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (renamed from cacheTime in v5)
    retry: 3,
    retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
    enabled: true, // Always enabled, but can be controlled by parent component
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: (format: ExportFormat) =>
      financialReportsService.downloadReport('trial-balance', format, initialParams),
    onError: (error: any) => {
      console.error('Export failed:', error);
      toast.error(error?.response?.data?.message || 'Failed to export trial balance. Please try again.');
    },
  });

  // Refetch function that updates query parameters
  const refetch = async (params?: TrialBalanceParams) => {
    if (params) {
      // Update query with new parameters
      const newQueryKey = ['trialBalance', params];
      await queryClient.fetchQuery({
        queryKey: newQueryKey,
        queryFn: () => financialReportsService.getTrialBalance(params),
        staleTime: 5 * 60 * 1000,
      });
    } else {
      // Refetch with current parameters
      await queryRefetch();
    }
  };

  // Export function
  const exportReport = async (format: ExportFormat) => {
    await exportMutation.mutateAsync(format);
  };

  return {
    data,
    loading: isLoading,
    error: error?.message || null,
    refetch,
    exportReport,
    isRefetching,
  };
};

export default useTrialBalance;
