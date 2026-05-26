import { api } from './api';
import type { PaginatedResponse } from '../types/api';
import type {
  PaymentPlan,
  PaymentPlanInstallment,
  PaymentPlanFilters,
  InstallmentFilters,
} from '../types/paymentPlan';

export const getPaymentPlans = async (
  filters?: PaymentPlanFilters,
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<PaymentPlan>> => {
  const params: Record<string, string | number | boolean> = { page, page_size: pageSize };
  if (filters?.status) params.status = filters.status;
  if (filters?.search) params.search = filters.search;
  const response = await api.get('/incomes/payment-plans/', { params });
  return response.data;
};

export const getPaymentPlan = async (id: number): Promise<PaymentPlan> => {
  const response = await api.get(`/incomes/payment-plans/${id}/`);
  return response.data;
};

export const getInstallments = async (
  filters?: InstallmentFilters,
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<PaymentPlanInstallment>> => {
  const params: Record<string, string | number | boolean> = { page, page_size: pageSize };
  if (filters?.status) params.status = filters.status;
  if (filters?.is_overdue !== undefined) params.is_overdue = filters.is_overdue;
  if (filters?.payment_plan) params.payment_plan = filters.payment_plan;
  if (filters?.search) params.search = filters.search;
  const response = await api.get('/incomes/installments/', { params });
  return response.data;
};

const paymentPlanService = {
  getPaymentPlans,
  getPaymentPlan,
  getInstallments,
};

export default paymentPlanService;
