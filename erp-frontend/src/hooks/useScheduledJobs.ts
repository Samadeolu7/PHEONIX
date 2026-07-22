import { useQuery, useMutation, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { scheduledJobsService, ScheduledJob } from '../services/scheduledJobsService';

export const scheduledJobsKeys = {
  all: ['scheduledJobs'] as const,
  list: () => [...scheduledJobsKeys.all, 'list'] as const,
};

export function useScheduledJobs(
  options?: Omit<UseQueryOptions<ScheduledJob[], Error>, 'queryKey' | 'queryFn'>
) {
  return useQuery({
    queryKey: scheduledJobsKeys.list(),
    queryFn: () => scheduledJobsService.getJobs(),
    ...options,
  });
}

export function useToggleJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scheduledJobsService.toggleJob(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduledJobsKeys.all });
    },
  });
}

export function useRunJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scheduledJobsService.runNow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: scheduledJobsKeys.all });
    },
  });
}
