import { useQuery } from '@tanstack/react-query';
import { staffService } from '../services/staffService';

export const useStaff = (params?: {
  page?: number;
  page_size?: number;
  search?: string;
  department?: string;
  is_active?: boolean;
}) => {
  return useQuery({
    queryKey: ['staff', params],
    queryFn: () => staffService.getStaff(params),
  });
};

export const useAllStaff = (params?: {
  search?: string;
  department?: string;
  is_active?: boolean;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['staff-all', params],
    queryFn: () => staffService.getAllStaff(params),
  });
};

export const useStaffMember = (id: number) => {
  return useQuery({
    queryKey: ['staff', id],
    queryFn: () => staffService.getStaffMember(id),
    enabled: !!id,
  });
};
