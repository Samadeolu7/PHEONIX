import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrService } from '../services/hrService';
import { HRConfig, UpdateHRConfigData, WorkflowTemplate } from '../types/hr';
import { useToast } from '../contexts/ToastContext';

export const useHRConfig = () => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();

  const {
    data: config,
    isLoading,
    error,
    refetch,
  } = useQuery<HRConfig>({
    queryKey: ['hr-config'],
    queryFn: () => hrService.getHRConfig(),
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const {
    data: workflows,
    isLoading: isLoadingWorkflows,
    error: workflowsError,
  } = useQuery<WorkflowTemplate[]>({
    queryKey: ['available-workflows'],
    queryFn: () => hrService.getAvailableWorkflows(),
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  const updateConfigMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateHRConfigData }) =>
      hrService.updateHRConfig(id, data),
    onSuccess: updatedConfig => {
      queryClient.setQueryData(['hr-config'], updatedConfig);
      showSuccess('HR configuration updated successfully');
    },
    onError: (error: any) => {
      console.error('Failed to update HR configuration:', error);
      showError(error?.response?.data?.message || 'Failed to update HR configuration');
    },
  });

  const updateConfig = (data: UpdateHRConfigData) => {
    if (!config?.id) {
      showError('Configuration not loaded');
      return;
    }
    updateConfigMutation.mutate({ id: config.id, data });
  };

  return {
    config,
    workflows: workflows || [],
    isLoading,
    isLoadingWorkflows,
    error,
    workflowsError,
    updateConfig,
    isUpdating: updateConfigMutation.isPending,
    refetch,
  };
};
