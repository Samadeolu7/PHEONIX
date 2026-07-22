import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { hrService } from '../services/hrService';
import { useToast } from '../contexts/ToastContext';
import {
  AttendanceFilters,
  CreateAttendanceData,
  UpdateAttendanceData,
  CreatePayrollData,
  UpdatePayrollData,
  CreatePayrollScheduleData,
  PersonnelChangesReport,
} from '../types/hr';

interface ApiError {
  response?: { data?: { detail?: string } };
  message?: string;
}

export { useStaff } from './useStaff';

// ─── Query Key Factory ────────────────────────────────────────────────────────

const HR_ROOT = ['hr'] as const;

export const hrKeys = {
  all: HR_ROOT,
  attendance: {
    all: [...HR_ROOT, 'attendance'] as const,
    list: (filters?: AttendanceFilters) => [...HR_ROOT, 'attendance', 'list', filters] as const,
    detail: (id: number) => [...HR_ROOT, 'attendance', 'detail', id] as const,
  },
  payroll: {
    all: [...HR_ROOT, 'payroll'] as const,
    list: (filters?: Record<string, unknown>) => [...HR_ROOT, 'payroll', 'list', filters] as const,
    detail: (id: number) => [...HR_ROOT, 'payroll', 'detail', id] as const,
  },
  payrollSchedule: {
    all: [...HR_ROOT, 'payrollSchedule'] as const,
    list: (params?: Record<string, unknown>) =>
      [...HR_ROOT, 'payrollSchedule', 'list', params] as const,
    detail: (id: number) => [...HR_ROOT, 'payrollSchedule', 'detail', id] as const,
  },
  staffDropdown: [...HR_ROOT, 'staffDropdown'] as const,
};

// ─── Query Hooks ──────────────────────────────────────────────────────────────

export const useAttendanceList = (filters?: AttendanceFilters) => {
  return useQuery({
    queryKey: hrKeys.attendance.list(filters),
    queryFn: () => hrService.getAttendance(filters),
  });
};

export const useAttendanceRecord = (id: number) => {
  return useQuery({
    queryKey: hrKeys.attendance.detail(id),
    queryFn: () => hrService.getAttendanceRecord(id),
    enabled: !!id,
  });
};

export const useStaffForDropdown = () => {
  return useQuery({
    queryKey: hrKeys.staffDropdown,
    queryFn: () => hrService.getStaffForDropdown(),
  });
};

export const usePayrollDetail = (id: number) => {
  return useQuery({
    queryKey: hrKeys.payroll.detail(id),
    queryFn: () => hrService.getPayrollWithPayslips(id),
    enabled: !!id,
  });
};

export const usePayrollScheduleDetail = (id: number) => {
  return useQuery({
    queryKey: hrKeys.payrollSchedule.detail(id),
    queryFn: () => hrService.getPayrollSchedule(id),
    enabled: !!id,
  });
};

// ─── Attendance Mutations ─────────────────────────────────────────────────────

export const useCreateAttendance = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreateAttendanceData) => hrService.createAttendance(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.attendance.all });
      toast.success('Attendance record created successfully!');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to create attendance record');
    },
  });
};

export const useUpdateAttendance = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAttendanceData }) =>
      hrService.updateAttendance(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.attendance.all });
      toast.success('Attendance record updated successfully!');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to update attendance record');
    },
  });
};

export const useDeleteAttendance = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.deleteAttendance(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.attendance.all });
      toast.success('Attendance record deleted successfully!');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to delete attendance record');
    },
  });
};

// ─── Payroll Mutations ────────────────────────────────────────────────────────

export const useCreatePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreatePayrollData) => hrService.createPayroll(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll created successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to create payroll');
    },
  });
};

export const useUpdatePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePayrollData }) =>
      hrService.updatePayroll(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll updated successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to update payroll');
    },
  });
};

export const useDeletePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.deletePayroll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll deleted successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to delete payroll');
    },
  });
};

export const useCalculatePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.calculatePayroll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll calculated successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to calculate payroll');
    },
  });
};

export const useRecalculatePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.recalculatePayroll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success(
        'Payroll recalculated successfully — payslips now include up-to-date IOU deductions'
      );
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to recalculate payroll');
    },
  });
};

export const useApprovePayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.approvePayroll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll approved successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to approve payroll');
    },
  });
};

export const useProcessPayroll = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.processPayroll(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll processed successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to process payroll');
    },
  });
};

export const useMarkPayrollPaid = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.markPayrollPaid(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success('Payroll marked as paid successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to mark payroll as paid');
    },
  });
};

export const useGeneratePayslips = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (id: number) => hrService.generatePayslips(id),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payroll.all });
      toast.success(result.message || `Generated ${result.generated} payslips`);
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to generate payslips');
    },
  });
};

// ─── Payroll Schedule Mutations ───────────────────────────────────────────────

export const useCreatePayrollSchedule = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: (data: CreatePayrollScheduleData) => hrService.createPayrollSchedule(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payrollSchedule.all });
      toast.success('Payroll schedule created successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to create payroll schedule');
    },
  });
};

export const useUpdatePayrollSchedule = () => {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CreatePayrollScheduleData> }) =>
      hrService.updatePayrollSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: hrKeys.payrollSchedule.all });
      toast.success('Payroll schedule updated successfully');
    },
    onError: (err: ApiError) => {
      toast.error(err?.response?.data?.detail || 'Failed to update payroll schedule');
    },
  });
};

// ─── Personnel Changes Report ─────────────────────────────────────────────────

export const usePersonnelChangesReport = (periodStart: string, periodEnd: string) => {
  return useQuery({
    queryKey: [...HR_ROOT, 'personnelChanges', periodStart, periodEnd],
    queryFn: () => hrService.getPersonnelChangesReport(periodStart, periodEnd) as Promise<PersonnelChangesReport>,
    enabled: !!periodStart && !!periodEnd,
  });
};
