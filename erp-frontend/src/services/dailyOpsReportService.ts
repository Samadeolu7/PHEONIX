// src/services/dailyOpsReportService.ts
/**
 * Disbursement Master Roll + Daily Collection Report.
 * Consumes /api/analytics/disbursement-master-roll/ and
 * /api/analytics/daily-collection-report/ — both real server-side,
 * date-range-scoped aggregates (see analytics/views.py), replacing the old
 * DailySummaryReportPage's client-side, PAGE_SIZE-truncated computation.
 */
import { api } from './api';
import { tokenManager } from './tokenManager';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

// ── Shared filter type ───────────────────────────────────────────────────────

export interface DayRangeFilters {
  start: string;
  end: string;
  branch?: number;
  officer?: number;
}

function buildParams(filters: DayRangeFilters, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  params.set('start', filters.start);
  params.set('end', filters.end);
  if (filters.branch) params.set('branch', String(filters.branch));
  if (filters.officer) params.set('officer', String(filters.officer));
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

async function downloadCsv(path: string, filename: string, qs: string): Promise<void> {
  const url = `${BASE_URL}${path}?${qs}`;
  const { accessToken } = tokenManager.getTokens();
  const response = await fetch(url, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) {
    throw new Error(`CSV export failed: ${response.status}`);
  }
  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

// ── Disbursement Master Roll ─────────────────────────────────────────────────

export interface DisbursementRow {
  disbursement_id: number;
  loan_id: number;
  loan_number: string;
  client_id: number;
  client_name: string;
  officer_id: number | null;
  officer_name: string;
  amount: string;
  disbursement_date: string;
  disbursed_by: string;
  account_name: string;
}

export interface MasterRollOfficerRow {
  officer_id: number;
  officer_name: string;
  disbursed_total: string;
  disbursed_count: number;
  collections_total: string;
  collections_count: number;
  savings_total: string;
  savings_count: number;
}

export interface MasterRollSummary {
  total_disbursed: string;
  disbursements_count: number;
  total_collections: string;
  collections_count: number;
  total_savings_deposits: string;
  savings_deposits_count: number;
  new_clients_count: number;
  active_loans_count: number;
  defaulters_count: number;
}

export interface MasterRollResponse {
  period: { start: string; end: string };
  summary: MasterRollSummary;
  disbursements: DisbursementRow[];
  officer_breakdown: MasterRollOfficerRow[];
}

const EMPTY_SUMMARY: MasterRollSummary = {
  total_disbursed: '0.00', disbursements_count: 0,
  total_collections: '0.00', collections_count: 0,
  total_savings_deposits: '0.00', savings_deposits_count: 0,
  new_clients_count: 0, active_loans_count: 0, defaulters_count: 0,
};

// ── Daily Collection Report ──────────────────────────────────────────────────

export interface CollectionReportRow {
  date: string;
  client_id: number;
  client_name: string;
  group_id: number | null;
  group_name: string;
  officer_id: number | null;
  officer_name: string;
  savings: string;
  registration: string;
  risk_premium: string;
  loan_form: string;
  id_card: string;
  other_fees: string;
  amount_due: string;
  amount_collected: string;
  total_collection: string;
}

export interface CollectionReportResponse {
  period: { start: string; end: string };
  count: number;
  results: CollectionReportRow[];
}

export const dailyOpsReportService = {
  async getMasterRoll(filters: DayRangeFilters): Promise<MasterRollResponse> {
    const qs = buildParams(filters);
    const response = await api.get(`/analytics/disbursement-master-roll/?${qs}`);
    return {
      period: response.period || { start: filters.start, end: filters.end },
      summary: response.summary || EMPTY_SUMMARY,
      disbursements: response.disbursements || [],
      officer_breakdown: response.officer_breakdown || [],
    };
  },

  downloadMasterRollCsv(filters: DayRangeFilters): Promise<void> {
    const qs = buildParams(filters, { format: 'csv' });
    return downloadCsv(
      '/analytics/disbursement-master-roll/',
      `disbursement-master-roll-${filters.start}_${filters.end}.csv`,
      qs,
    );
  },

  async getCollectionReport(filters: DayRangeFilters & { group?: number }): Promise<CollectionReportResponse> {
    const qs = buildParams(filters, { group: filters.group });
    const response = await api.get(`/analytics/daily-collection-report/?${qs}`);
    return {
      period: response.period || { start: filters.start, end: filters.end },
      count: response.count ?? 0,
      results: response.results || [],
    };
  },

  downloadCollectionReportCsv(filters: DayRangeFilters & { group?: number }): Promise<void> {
    const qs = buildParams(filters, { group: filters.group, format: 'csv' });
    return downloadCsv(
      '/analytics/daily-collection-report/',
      `daily-collection-report-${filters.start}_${filters.end}.csv`,
      qs,
    );
  },
};
