import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clockService } from '../services/clockService';
import { useToast } from '../contexts/ToastContext';
import { ClockInRequest, ClockOutRequest, BulkAttendanceRequest } from '../types/leaveBalance';

export const useAttendance = (params?: {
  staff?: number;
  date?: string;
  date__gte?: string;
  date__lte?: string;
  status?: string;
  page?: number;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['attendance', params],
    queryFn: () => clockService.getAttendance(params),
  });
};

export const useAttendanceRecord = (id: number) => {
  return useQuery({
    queryKey: ['attendance-record', id],
    queryFn: () => clockService.getAttendanceRecord(id),
    enabled: !!id,
  });
};

export const useCurrentAttendanceStatus = (staffId: number, date?: string) => {
  return useQuery({
    queryKey: ['current-attendance-status', staffId, date],
    queryFn: () => clockService.getCurrentAttendanceStatus(staffId, date),
    enabled: !!staffId,
    refetchInterval: 60000, // Refetch every minute
  });
};

export const useMyClockStatus = (enabled = true) => {
  return useQuery({
    queryKey: ['my-clock-status'],
    queryFn: () => clockService.getMyStatus(),
    enabled,
    refetchInterval: 60000,
    retry: false,
  });
};

/** The server's reason for a failed clock-in/out, e.g. "You are 820 m from Head Office…". */
export const clockErrorMessage = (err: any, fallback: string): string => {
  const data = err?.response?.data || err?.details;
  return data?.error || data?.detail || data?.message || err?.message || fallback;
};

const invalidateClockQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['attendance'] });
  queryClient.invalidateQueries({ queryKey: ['current-attendance-status'] });
  queryClient.invalidateQueries({ queryKey: ['my-clock-status'] });
  queryClient.invalidateQueries({ queryKey: ['my-attendance'] });
};

export const useClockIn = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: ClockInRequest) => clockService.clockIn(data),
    onSuccess: () => {
      invalidateClockQueries(queryClient);
      success('Successfully clocked in');
    },
    onError: (err: any) => {
      error(clockErrorMessage(err, 'Failed to clock in'));
    },
  });
};

export const useClockOut = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: ClockOutRequest) => clockService.clockOut(data),
    onSuccess: () => {
      invalidateClockQueries(queryClient);
      success('Successfully clocked out');
    },
    onError: (err: any) => {
      error(clockErrorMessage(err, 'Failed to clock out'));
    },
  });
};

export const useBulkCreateAttendance = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: BulkAttendanceRequest) => clockService.bulkCreateAttendance(data),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      success(`Successfully created ${result.created} attendance records`);
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to create attendance records');
    },
  });
};
