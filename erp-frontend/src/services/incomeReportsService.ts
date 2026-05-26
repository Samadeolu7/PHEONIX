// Income Reports Service
// Provides typed API methods for all income report endpoints

import { api } from './api';

// ─── Shared types ────────────────────────────────────────────────────────────

export interface IncomeReportTotals {
  invoiced: number;
  collected: number;
  outstanding: number;
  collection_rate: number;
}

export interface IncomeReportParams {
  date_from?: string;
  date_to?: string;
  category_id?: number | string;
}

// ─── By Category ─────────────────────────────────────────────────────────────

export interface IncomeCategoryRow {
  category_id: number;
  category_name: string;
  category_code: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoice_count: number;
  item_count: number;
  collection_rate: number;
}

export interface IncomeByCategoryData {
  date_from: string;
  date_to: string;
  totals: IncomeReportTotals;
  rows: IncomeCategoryRow[];
}

// ─── By Service Item ──────────────────────────────────────────────────────────

export interface IncomeServiceItemRow {
  service_item_id: number;
  service_item_name: string;
  service_item_code: string;
  category_name: string;
  category_code: string;
  default_price: number;
  quantity_invoiced: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoice_count: number;
  collection_rate: number;
}

export interface IncomeByServiceItemData {
  date_from: string;
  date_to: string;
  totals: IncomeReportTotals;
  rows: IncomeServiceItemRow[];
}

// ─── By Period ────────────────────────────────────────────────────────────────

export type PeriodGranularity = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export interface IncomePeriodRow {
  period_date: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoice_count: number;
  collection_rate: number;
}

export interface IncomeByPeriodData {
  date_from: string;
  date_to: string;
  period: PeriodGranularity;
  totals: IncomeReportTotals;
  rows: IncomePeriodRow[];
}

export interface IncomeByPeriodParams extends IncomeReportParams {
  period?: PeriodGranularity;
}

// ─── By Client ────────────────────────────────────────────────────────────────

export type ClientSortField = 'invoiced' | 'collected' | 'outstanding';

export interface IncomeClientRow {
  client_id: number;
  client_name: string;
  invoiced: number;
  collected: number;
  outstanding: number;
  invoice_count: number;
  collection_rate: number;
}

export interface IncomeByClientData {
  date_from: string;
  date_to: string;
  totals: IncomeReportTotals;
  rows: IncomeClientRow[];
}

export interface IncomeByClientParams extends IncomeReportParams {
  limit?: number;
  sort?: ClientSortField;
}

// ─── Collection Status ────────────────────────────────────────────────────────

export interface InvoiceStatusBreakdown {
  status: string;
  label: string;
  count: number;
  invoiced: number;
  collected: number;
  outstanding: number;
}

export interface CollectionStatusSummary {
  total_invoiced: number;
  total_collected: number;
  total_outstanding: number;
  collection_rate: number;
  total_invoices: number;
  overdue_amount: number;
  overdue_count: number;
}

export interface CollectionStatusData {
  date_from: string;
  date_to: string;
  summary: CollectionStatusSummary;
  by_status: InvoiceStatusBreakdown[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

class IncomeReportsService {
  private readonly base = '/incomes/reports';

  private buildParams(params: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        out[k] = String(v);
      }
    }
    return out;
  }

  async getByCategory(params: IncomeReportParams = {}): Promise<IncomeByCategoryData> {
    const res = await api.get(`${this.base}/by-category/`, this.buildParams(params));
    return res.data ?? res;
  }

  async getByServiceItem(params: IncomeReportParams = {}): Promise<IncomeByServiceItemData> {
    const res = await api.get(`${this.base}/by-service-item/`, this.buildParams(params));
    return res.data ?? res;
  }

  async getByPeriod(params: IncomeByPeriodParams = {}): Promise<IncomeByPeriodData> {
    const res = await api.get(`${this.base}/by-period/`, this.buildParams(params));
    return res.data ?? res;
  }

  async getByClient(params: IncomeByClientParams = {}): Promise<IncomeByClientData> {
    const res = await api.get(`${this.base}/by-client/`, this.buildParams(params));
    return res.data ?? res;
  }

  async getCollectionStatus(params: IncomeReportParams = {}): Promise<CollectionStatusData> {
    const res = await api.get(`${this.base}/collection-status/`, this.buildParams(params));
    return res.data ?? res;
  }
}

export const incomeReportsService = new IncomeReportsService();
