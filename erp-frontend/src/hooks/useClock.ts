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

export const useClockIn = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: ClockInRequest) => clockService.clockIn(data),
    onSuccess: (_, { staff }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['current-attendance-status', staff] });
      success('Successfully clocked in');
    },
    onError: (err: any) => {
      // Extract GPS-specific error messages
      const errorData = err.response?.data;
      const errorMessage = errorData?.error || errorData?.message || 'Failed to clock in';

      // If there's a distance value, show it
      if (errorData?.distance) {
        error(`${errorMessage} (Distance: ${errorData.distance} km)`);
      } else {
        error(errorMessage);
      }
    },
  });
};

export const useClockOut = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: ClockOutRequest) => clockService.clockOut(data),
    onSuccess: (_, { staff }) => {
      queryClient.invalidateQueries({ queryKey: ['attendance'] });
      queryClient.invalidateQueries({ queryKey: ['current-attendance-status', staff] });
      success('Successfully clocked out');
    },
    onError: (err: any) => {
      // Extract GPS-specific error messages
      const errorData = err.response?.data;
      const errorMessage = errorData?.error || errorData?.message || 'Failed to clock out';

      // If there's a distance value, show it
      if (errorData?.distance) {
        error(`${errorMessage} (Distance: ${errorData.distance} km)`);
      } else {
        error(errorMessage);
      }
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
