import { useQuery } from '@tanstack/react-query';
import { hrDashboardService } from '../services/hrDashboardService';

export const useHRMetrics = () => {
  return useQuery({
    queryKey: ['hr-metrics'],
    queryFn: () => hrDashboardService.getHRMetrics(),
    refetchInterval: 5 * 60 * 1000, // Refetch every 5 minutes
  });
};

export const useLeaveAnalytics = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['leave-analytics', params],
    queryFn: () => hrDashboardService.getLeaveAnalytics(params),
  });
};

export const useAttendanceAnalytics = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['attendance-analytics', params],
    queryFn: () => hrDashboardService.getAttendanceAnalytics(params),
  });
};

export const usePayrollAnalytics = (params?: { start_date?: string; end_date?: string }) => {
  return useQuery({
    queryKey: ['payroll-analytics', params],
    queryFn: () => hrDashboardService.getPayrollAnalytics(params),
  });
};
