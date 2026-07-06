// src/services/portfolioPerformanceService.ts
/**
 * Track 2 — Portfolio & Performance Report.
 * Consumes the /api/analytics/portfolio-performance/* endpoints.
 */
import { api } from './api';
import { tokenManager } from './tokenManager';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportFilters {
  start?: string;
  end?: string;
  branch?: number;
  product?: number;
  officer?: number;
  riskBand?: string;
}

export type GroupByDimension = 'branch' | 'product' | 'officer' | 'risk_band';

export interface PortfolioBreakdownRow {
  loan_count: number;
  outstanding_principal: string;
  disbursed_amount: string;
  total_paid: string;
  provision_amount: string;
  collection_rate: string;
  branch_id?: number;
  branch_name?: string;
  product_id?: number;
  product_name?: string;
  officer_id?: number;
  officer_name?: string;
  risk_classification?: string;
}

export interface PortfolioBreakdownResponse {
  period: { start: string; end: string };
  group_by: GroupByDimension[];
  data: PortfolioBreakdownRow[];
}

export interface InterestIncomeModeStats {
  recognized_income: string;
  loan_count: number;
}

export interface InterestIncomeByModeResponse {
  period: { start: string; end: string };
  data: {
    at_disbursement: InterestIncomeModeStats;
    deferred: InterestIncomeModeStats;
    legacy_cash_basis: InterestIncomeModeStats;
    total_recognized_income: string;
  };
}

export interface ProvisioningBandRow {
  risk_classification: string;
  provision_rate_pct: string;
  loan_count: number;
  outstanding_principal: string;
  required_provision: string;
}

export interface ProvisioningComplianceResponse {
  as_of: string;
  data: {
    by_risk_band: ProvisioningBandRow[];
    total_required_provision: string;
    total_booked_provision: string;
    shortfall_or_surplus: string;
  };
}

export interface OfficerTrendRow {
  month: string;
  label: string;
  staff_id: number;
  name: string;
  position: string;
  disbursed_amount: string;
  loans_disbursed_count: number;
  amount_due: string;
  collections_received: string;
  collection_rate: string;
}

export interface OfficerTrendResponse {
  months: number;
  data: OfficerTrendRow[];
}

type CsvSection = 'breakdown' | 'interest-income' | 'provisioning' | 'officer-trend';

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildParams(filters: ReportFilters, extra: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams();
  if (filters.start) params.set('start', filters.start);
  if (filters.end) params.set('end', filters.end);
  if (filters.branch) params.set('branch', String(filters.branch));
  if (filters.product) params.set('product', String(filters.product));
  if (filters.officer) params.set('officer', String(filters.officer));
  if (filters.riskBand) params.set('risk_band', filters.riskBand);
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

const SECTION_PATH: Record<CsvSection, string> = {
  breakdown: 'breakdown',
  'interest-income': 'interest-income',
  provisioning: 'provisioning',
  'officer-trend': 'officer-trend',
};

// ── API calls ─────────────────────────────────────────────────────────────────

export const portfolioPerformanceService = {
  async getBreakdown(filters: ReportFilters, groupBy?: GroupByDimension[]): Promise<PortfolioBreakdownResponse> {
    const qs = buildParams(filters, { group_by: groupBy?.join(',') });
    const response = await api.get(`/analytics/portfolio-performance/breakdown/${qs ? `?${qs}` : ''}`);
    return {
      period: response.period || { start: '', end: '' },
      group_by: response.group_by || [],
      data: response.data || [],
    };
  },

  async getInterestIncomeByMode(filters: ReportFilters): Promise<InterestIncomeByModeResponse> {
    const qs = buildParams(filters);
    const response = await api.get(`/analytics/portfolio-performance/interest-income/${qs ? `?${qs}` : ''}`);
    return {
      period: response.period || { start: '', end: '' },
      data: response.data || {
        at_disbursement: { recognized_income: '0.00', loan_count: 0 },
        deferred: { recognized_income: '0.00', loan_count: 0 },
        legacy_cash_basis: { recognized_income: '0.00', loan_count: 0 },
        total_recognized_income: '0.00',
      },
    };
  },

  async getProvisioningSnapshot(filters: Omit<ReportFilters, 'start' | 'end'>): Promise<ProvisioningComplianceResponse> {
    const qs = buildParams(filters);
    const response = await api.get(`/analytics/portfolio-performance/provisioning/${qs ? `?${qs}` : ''}`);
    return {
      as_of: response.as_of || '',
      data: response.data || {
        by_risk_band: [], total_required_provision: '0.00', total_booked_provision: '0.00', shortfall_or_surplus: '0.00',
      },
    };
  },

  async getOfficerTrend(filters: ReportFilters, months = 6): Promise<OfficerTrendResponse> {
    const qs = buildParams(filters, { months });
    const response = await api.get(`/analytics/portfolio-performance/officer-trend/${qs ? `?${qs}` : ''}`);
    return { months: response.months ?? months, data: response.data || [] };
  },

  /**
   * Downloads a section's data as CSV. Uses a raw fetch + blob (the same
   * proven mechanism as financialReportsService.downloadReport) since
   * api.get() always parses JSON.
   */
  async downloadCsv(section: CsvSection, filters: ReportFilters, extra: Record<string, string | number | undefined> = {}): Promise<void> {
    const qs = buildParams(filters, { ...extra, format: 'csv' });
    const url = `${BASE_URL}/analytics/portfolio-performance/${SECTION_PATH[section]}/?${qs}`;

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
    link.download = `${SECTION_PATH[section]}-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  },
};
