/**
 * Accounting Period Service
 * Handles month-end and year-end close/reopen/reclose operations.
 * Backend: /api/accounts/periods/  (PeriodViewSet)
 */

import { api } from './api';

export interface AccountingPeriod {
  id: number;
  period_type: 'month' | 'year';
  year: number;
  month: number | null;
  is_closed: boolean;
  closed_at: string | null;
  closed_by: number | null;
  closed_by_name: string | null;
  branch: number;
  owner: number;
}

export interface PeriodListParams {
  period_type?: 'month' | 'year';
  year?: number;
  month?: number;
  is_closed?: boolean;
  ordering?: string;
}

export interface PeriodCloseResult {
  status: string;
}

export interface PeriodReopenResult {
  status: string;
  affected_periods: AccountingPeriod[];
}

const BASE = '/accounts/periods';

export const accountPeriodService = {
  /**
   * List all accounting periods, optionally filtered.
   */
  async list(params?: PeriodListParams): Promise<AccountingPeriod[]> {
    const qp = new URLSearchParams();
    if (params?.period_type) qp.append('period_type', params.period_type);
    if (params?.year !== undefined) qp.append('year', params.year.toString());
    if (params?.month !== undefined) qp.append('month', params.month.toString());
    if (params?.is_closed !== undefined) qp.append('is_closed', params.is_closed.toString());
    if (params?.ordering) qp.append('ordering', params.ordering);

    const query = qp.toString();
    const data = await api.get(`${BASE}/${query ? `?${query}` : ''}`);
    // Backend returns paginated response — extract results array
    return Array.isArray(data) ? data : (data?.results ?? []);
  },

  /**
   * Get a single period by id.
   */
  async get(id: number): Promise<AccountingPeriod> {
    return await api.get(`${BASE}/${id}/`);
  },

  /**
   * Close an open accounting period.
   * For month periods: runs month-end close + balance snapshots.
   * For year periods: runs year-end close + retained earnings transfer.
   */
  async close(id: number): Promise<PeriodCloseResult> {
    return await api.post(`${BASE}/${id}/close/`, {});
  },

  /**
   * Reopen a closed period.
   * Invalidates snapshots for this and all subsequent periods.
   * Returns the list of affected periods.
   */
  async reopen(id: number): Promise<PeriodReopenResult> {
    return await api.post(`${BASE}/${id}/reopen/`, {});
  },

  /**
   * Re-close a previously reopened period.
   * Creates new balance snapshots and re-runs the closing process.
   */
  async reclose(id: number): Promise<PeriodCloseResult> {
    return await api.post(`${BASE}/${id}/reclose/`, {});
  },
};
