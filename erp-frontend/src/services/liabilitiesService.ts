import { api } from './api';
import {
  AccountsPayable,
  AccountsPayableListItem,
  CreatePayableRequest,
  UpdatePayableRequest,
  MakePaymentRequest,
  PaymentResult,
  ThreeWayMatchResult,
  PayablesSummary,
  PayablesFilters,
} from '../types/liabilities';

const PAYABLES_BASE = '/liabilities/payables';

// ============================================================================
// PAYABLES CRUD OPERATIONS
// ============================================================================

export const listPayables = async (
  filters?: PayablesFilters
): Promise<{ results: AccountsPayableListItem[]; count: number }> => {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value));
      }
    });
  }

  const response = await api.get(`${PAYABLES_BASE}/?${params.toString()}`);
  return response;
};

export const listAllPayables = async (
  filters?: Omit<PayablesFilters, 'page' | 'page_size'>
): Promise<AccountsPayableListItem[]> => {
  const all: AccountsPayableListItem[] = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await listPayables({ ...filters, page, page_size: 500 });
    all.push(...(response.results || []));
    hasMore = !!(response as any).next;
    page += 1;
  }

  return all;
};

export const getPayable = async (id: number): Promise<AccountsPayable> => {
  const response = await api.get(`${PAYABLES_BASE}/${id}/`);
  return response;
};

export const createPayable = async (data: CreatePayableRequest): Promise<AccountsPayable> => {
  const response = await api.post(`${PAYABLES_BASE}/`, data);
  return response;
};

export const updatePayable = async (
  id: number,
  data: UpdatePayableRequest
): Promise<AccountsPayable> => {
  const response = await api.patch(`${PAYABLES_BASE}/${id}/`, data);
  return response;
};

export const deletePayable = async (id: number): Promise<void> => {
  await api.delete(`${PAYABLES_BASE}/${id}/`);
};

// ============================================================================
// 3-WAY MATCHING & VALIDATION
// ============================================================================

export const validateThreeWayMatch = async (id: number): Promise<ThreeWayMatchResult> => {
  const response = await api.post(`${PAYABLES_BASE}/${id}/validate_three_way_match/`, {});
  return response;
};

export const getPendingValidation = async (): Promise<AccountsPayableListItem[]> => {
  const response = await api.get(`${PAYABLES_BASE}/pending_validation/`);
  return response;
};

export const getFailedValidation = async (): Promise<AccountsPayableListItem[]> => {
  const response = await api.get(`${PAYABLES_BASE}/failed_validation/`);
  return response;
};

// ============================================================================
// PAYMENT OPERATIONS
// ============================================================================

export const makePayment = async (id: number, data: MakePaymentRequest): Promise<PaymentResult> => {
  const response = await api.post(`${PAYABLES_BASE}/${id}/make_payment/`, data);
  return response;
};

// ============================================================================
// REPORTING & ANALYTICS
// ============================================================================

export const getOverduePayables = async (): Promise<AccountsPayableListItem[]> => {
  const response = await api.get(`${PAYABLES_BASE}/overdue/`);
  return response;
};

export const getPayablesSummary = async (): Promise<PayablesSummary> => {
  const response = await api.get(`${PAYABLES_BASE}/summary/`);
  return response;
};

// ============================================================================
// EXPORT
// ============================================================================

const liabilitiesService = {
  // CRUD
  listPayables,
  getPayable,
  createPayable,
  updatePayable,
  deletePayable,

  // Validation
  validateThreeWayMatch,
  getPendingValidation,
  getFailedValidation,

  // Payment
  makePayment,

  // Reporting
  getOverduePayables,
  getPayablesSummary,
};

export default liabilitiesService;
