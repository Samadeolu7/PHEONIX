import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { payslipService } from '../services/payslipService';
import { useToast } from '../contexts/ToastContext';
import { EmailPayslipRequest } from '../types/payslip';

export const usePayslips = (params?: {
  payroll?: number;
  staff?: number;
  page?: number;
  page_size?: number;
}) => {
  return useQuery({
    queryKey: ['payslips', params],
    queryFn: () => payslipService.getPayslips(params),
  });
};

export const usePayslip = (id: number) => {
  return useQuery({
    queryKey: ['payslip', id],
    queryFn: () => payslipService.getPayslip(id),
    enabled: !!id,
  });
};

export const useGeneratePayslipPDF = () => {
  const queryClient = useQueryClient();
  const { success, error } = useToast();

  return useMutation({
    mutationFn: (id: number) => payslipService.generatePDF(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['payslip', id] });
      queryClient.invalidateQueries({ queryKey: ['payslips'] });
      success('Payslip PDF generated successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to generate PDF');
    },
  });
};

export const useEmailPayslip = () => {
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: EmailPayslipRequest }) =>
      payslipService.emailPayslip(id, data),
    onSuccess: () => {
      success('Payslip emailed successfully');
    },
    onError: (err: any) => {
      error(err.response?.data?.message || 'Failed to email payslip');
    },
  });
};

export const useDownloadPayslipPDF = () => {
  const { success, error } = useToast();

  return useMutation({
    mutationFn: ({ id, filename }: { id: number; filename?: string }) =>
      payslipService.downloadPDF(id, filename),
    onSuccess: () => {
      success('Payslip PDF downloaded');
    },
    onError: (err: any) => {
      error(err?.message || 'Failed to download payslip PDF');
    },
  });
};
