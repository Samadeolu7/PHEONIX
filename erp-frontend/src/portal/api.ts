/**
 * Customer-portal API client.
 *
 * Deliberately separate from the staff API clients:
 *  - No tokens are ever read or stored in JavaScript. The session lives in an
 *    httpOnly cookie set by the server, so an XSS bug cannot steal it.
 *  - No staff interceptors (token refresh, redirect to staff /login, etc.).
 *  - Every request sends `X-Portal-Request: 1`, which the server requires on
 *    state-changing calls as a CSRF guard.
 */
import axios, { AxiosError } from 'axios';

const API_ROOT = ((import.meta.env.VITE_API_BASE_URL as string) || '/api').replace(/\/$/, '');
// Optional, for local development only (production resolves the tenant from the domain).
const DEV_TENANT = import.meta.env.VITE_PORTAL_TENANT_SLUG as string | undefined;

export const portalHttp = axios.create({
  baseURL: `${API_ROOT}/portal`,
  withCredentials: true,
  timeout: 20000,
  headers: {
    'X-Portal-Request': '1',
    ...(DEV_TENANT ? { 'X-Tenant-Slug': DEV_TENANT } : {}),
  },
});

export type FieldErrors = Record<string, string>;

export interface ApiError {
  status: number;
  message: string;
  fields: FieldErrors;
  data?: unknown;
}

function flatten(value: unknown): string {
  if (Array.isArray(value)) return value.map(flatten).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(flatten).join(' ');
  return value == null ? '' : String(value);
}

export function toApiError(err: unknown): ApiError {
  const ax = err as AxiosError<Record<string, unknown>>;
  const status = ax?.response?.status ?? 0;
  const data = ax?.response?.data;
  const fields: FieldErrors = {};
  let message = '';

  if (!ax?.response) {
    message = 'We could not reach the server. Check your connection and try again.';
  } else if (status === 429) {
    message = 'Too many attempts. Please wait a little and try again.';
  } else if (status >= 500) {
    message = 'Something went wrong on our side. Please try again later.';
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (k === 'detail' || k === 'non_field_errors') message = flatten(v);
      else fields[k] = flatten(v);
    }
    if (!message && Object.keys(fields).length) message = 'Please correct the highlighted fields.';
  }
  return { status, message: message || 'Request failed.', fields, data };
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface PortalInfo {
  organisation: string;
  allow_registration: boolean;
  support_phone: string;
  support_email: string;
  terms_url: string;
  privacy_url: string;
}

export interface Offering {
  id: number;
  name: string;
  public_description: string;
  min_amount: number;
  max_amount: number;
  interest_rate: number;
  interest_method: string;
  term_unit: 'days' | 'weeks' | 'months';
  min_term: number;
  max_term: number;
  repayment_frequencies: { value: string; label: string }[];
  processing_fee_type: 'fixed' | 'percentage';
  processing_fee_amount: number;
  processing_fee_percentage: number;
  insurance_rate: number;
  requires_guarantor: boolean;
  requires_collateral: boolean;
}

export interface Branch {
  id: number;
  name: string;
  city: string;
  state: string;
}

export interface Customer {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  email_verified: boolean;
  created_at: string;
}

export interface AppDocument {
  id: number;
  document_type: string;
  document_type_display: string;
  original_name: string;
  size: number;
  uploaded_at: string;
}

export const DOCUMENT_TYPES = [
  { value: 'id_card', label: "Means of ID (NIN slip, voter's card, passport, driver's licence)" },
  { value: 'passport_photo', label: 'Passport photograph' },
  { value: 'utility_bill', label: 'Utility bill / proof of address' },
  { value: 'bank_statement', label: 'Bank statement' },
  { value: 'business_proof', label: 'Proof of business (CAC, shop photo, invoice)' },
  { value: 'payslip', label: 'Payslip / employment letter' },
  { value: 'other', label: 'Other' },
];
export const MAX_DOC_MB = 5;
export const DOC_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export interface Application {
  documents: AppDocument[];
  can_upload: boolean;
  can_remove_documents: boolean;
  reference: string;
  status: 'submitted' | 'under_review' | 'converted' | 'rejected' | 'withdrawn';
  status_display: string;
  product_name: string;
  branch_name: string;
  requested_amount: number;
  term: number;
  term_unit: string;
  repayment_frequency: string;
  loan_purpose: string;
  first_name: string;
  middle_name: string;
  last_name: string;
  phone_primary: string;
  nin_masked: string;
  bvn_masked: string;
  customer_message: string;
  submitted_at: string;
  updated_at: string;
  can_withdraw: boolean;
}

// ── Calls ───────────────────────────────────────────────────────────────────

export const portalApi = {
  info: () => portalHttp.get<PortalInfo>('/info/').then(r => r.data),
  products: () => portalHttp.get<Offering[]>('/products/').then(r => r.data),
  branches: () => portalHttp.get<Branch[]>('/branches/').then(r => r.data),

  register: (body: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    password: string;
    accept_terms: boolean;
  }) => portalHttp.post<{ detail: string }>('/auth/register/', body).then(r => r.data),
  verifyEmail: (token: string) =>
    portalHttp.post<{ detail: string }>('/auth/verify-email/', { token }).then(r => r.data),
  resendVerification: (email: string) =>
    portalHttp.post<{ detail: string }>('/auth/resend-verification/', { email }).then(r => r.data),
  login: (email: string, password: string) =>
    portalHttp.post<{ customer: Customer }>('/auth/login/', { email, password }).then(r => r.data),
  logout: () => portalHttp.post('/auth/logout/').then(r => r.data),
  requestReset: (email: string) =>
    portalHttp.post<{ detail: string }>('/auth/password-reset/', { email }).then(r => r.data),
  confirmReset: (token: string, new_password: string) =>
    portalHttp
      .post<{ detail: string }>('/auth/password-reset/confirm/', { token, new_password })
      .then(r => r.data),
  changePassword: (current_password: string, new_password: string) =>
    portalHttp
      .post<{ detail: string }>('/auth/change-password/', { current_password, new_password })
      .then(r => r.data),
  me: () => portalHttp.get<Customer>('/me/').then(r => r.data),

  applications: () => portalHttp.get<Application[]>('/applications/').then(r => r.data),
  application: (ref: string) =>
    portalHttp.get<Application>(`/applications/${encodeURIComponent(ref)}/`).then(r => r.data),
  apply: (body: Record<string, unknown>) =>
    portalHttp.post<Application>('/applications/', body).then(r => r.data),
  uploadDocument: (
    ref: string,
    documentType: string,
    file: File,
    onProgress?: (pct: number) => void
  ) => {
    const form = new FormData();
    form.append('document_type', documentType);
    form.append('file', file);
    return portalHttp
      .post<AppDocument>(`/applications/${encodeURIComponent(ref)}/documents/`, form, {
        timeout: 120000,
        onUploadProgress: e => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
      .then(r => r.data);
  },
  deleteDocument: (ref: string, id: number) =>
    portalHttp.delete(`/applications/${encodeURIComponent(ref)}/documents/${id}/`),
  withdraw: (ref: string) =>
    portalHttp
      .post<Application>(`/applications/${encodeURIComponent(ref)}/withdraw/`)
      .then(r => r.data),
};

export const naira = (n: number | string) =>
  `₦${Number(n || 0).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
