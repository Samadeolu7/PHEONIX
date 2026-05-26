import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { salaryComponentService } from '../services/salaryComponentService';
import { useToast } from '../contexts/ToastContext';
import {
  SalaryComponent,
  CreateSalaryComponentRequest,
  UpdateSalaryComponentRequest,
  CreateStaffPayInfoRequest,
  CreatePayComponentRemovalRequest,
} from '../types/salaryComponent';

export const useSalaryComponents = (params?: {
  component_type?: 'EARNING' | 'DEDUCTION';
  page?: number;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['salary-components', params],
    queryFn: () => salaryComponentService.getSalaryComponents(params),
  });
};

export const useAllSalaryComponents = (params?: {
  component_type?: 'EARNING' | 'DEDUCTION';
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['salary-components-all', params],
    queryFn: () => salaryComponentService.getAllSalaryComponents(params),
  });
};

export const useSalaryComponent = (id: number) => {
  return useQuery({
    queryKey: ['salary-component', id],
    queryFn: () => salaryComponentService.getSalaryComponent(id),
    enabled: !!id,
  });
};

export const useCreateSalaryComponent = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: CreateSalaryComponentRequest) =>
      salaryComponentService.createSalaryComponent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-components'] });
      success('Salary component created successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to create salary component');
    },
  });
};

export const useUpdateSalaryComponent = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSalaryComponentRequest }) =>
      salaryComponentService.updateSalaryComponent(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['salary-components'] });
      queryClient.invalidateQueries({ queryKey: ['salary-component', id] });
      success('Salary component updated successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to update salary component');
    },
  });
};

export const useDeleteSalaryComponent = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (id: number) => salaryComponentService.deleteSalaryComponent(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salary-components'] });
      success('Salary component deleted successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to delete salary component');
    },
  });
};

export const useStaffPayInfo = (staffId: number | string) => {
  return useQuery({
    queryKey: ['staff-pay-info', staffId],
    queryFn: () => salaryComponentService.getStaffPayInfo(staffId),
    enabled: !!staffId,
  });
};

export const useStaffWithPayInfo = (staffId: number | string) => {
  return useQuery({
    queryKey: ['staff-with-pay-info', staffId],
    queryFn: () => salaryComponentService.getStaffWithPayInfo(staffId),
    enabled: !!staffId,
  });
};

export const useAssignComponentToStaff = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: CreateStaffPayInfoRequest) =>
      salaryComponentService.assignComponentToStaff(data),
    onSuccess: (_, { staff }) => {
      queryClient.invalidateQueries({ queryKey: ['staff-pay-info', staff] });
      queryClient.invalidateQueries({ queryKey: ['staff-with-pay-info', staff] });
      success('Component assigned to staff successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to assign component to staff');
    },
  });
};

export const useUpdateStaffPayInfo = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, amount, staffId }: { id: number; amount: string; staffId: number }) =>
      salaryComponentService.updateStaffPayInfo(id, { amount }),
    onSuccess: (_, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ['staff-pay-info', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-with-pay-info', staffId] });
      success('Staff pay component updated successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to update staff pay component');
    },
  });
};

export const useRemoveComponentFromStaff = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, staffId }: { id: number; staffId: number }) =>
      salaryComponentService.removeComponentFromStaff(id),
    onSuccess: (_, { staffId }) => {
      queryClient.invalidateQueries({ queryKey: ['staff-pay-info', staffId] });
      queryClient.invalidateQueries({ queryKey: ['staff-with-pay-info', staffId] });
      success('Component removed from staff successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to remove component from staff');
    },
  });
};

// ── Pay Component Removal Requests ─────────────────────────────────────────

export const usePayComponentRemovals = (params?: {
  status?: string;
  staff?: number | string;
  page?: number;
}) => {
  return useQuery({
    queryKey: ['pay-component-removals', params],
    queryFn: () => salaryComponentService.getPayComponentRemovals(params),
  });
};

export const usePayComponentRemovalPendingCount = () => {
  return useQuery({
    queryKey: ['pay-component-removal-pending-count'],
    queryFn: () => salaryComponentService.getPayComponentRemovalPendingCount(),
    refetchInterval: 60_000,
  });
};

export const useCreatePayComponentRemoval = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (data: CreatePayComponentRemovalRequest) =>
      salaryComponentService.createPayComponentRemoval(data),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['pay-component-removals'] });
      queryClient.invalidateQueries({ queryKey: ['pay-component-removal-pending-count'] });
      // Refresh the staff pay info so the pending badge shows
      queryClient.invalidateQueries({ queryKey: ['staff-pay-info', result.staff_id] });
      success('Removal request submitted — awaiting approval');
    },
    onError: (err: any) => {
      const msg =
        err.response?.data?.staff_pay_info?.[0] ||
        err.response?.data?.non_field_errors?.[0] ||
        err.response?.data?.detail ||
        'Failed to submit removal request';
      error(msg);
    },
  });
};

export const useApprovePayComponentRemoval = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (id: number) => salaryComponentService.approvePayComponentRemoval(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-component-removals'] });
      queryClient.invalidateQueries({ queryKey: ['pay-component-removal-pending-count'] });
      queryClient.invalidateQueries({ queryKey: ['staff-pay-info'] });
      success('Removal approved — component removed from staff profile');
    },
    onError: (err: any) => {
      error(err.response?.data?.error || 'Failed to approve removal request');
    },
  });
};

export const useRejectPayComponentRemoval = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, rejectionReason }: { id: number; rejectionReason: string }) =>
      salaryComponentService.rejectPayComponentRemoval(id, rejectionReason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-component-removals'] });
      queryClient.invalidateQueries({ queryKey: ['pay-component-removal-pending-count'] });
      success('Removal request rejected');
    },
    onError: (err: any) => {
      error(err.response?.data?.error || 'Failed to reject removal request');
    },
  });
};
