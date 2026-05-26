// src/services/budgetService.ts
import { api } from './api';
import {
  BudgetPeriod,
  BudgetLine,
  BudgetPeriodListItem,
  BudgetVarianceReport,
  BudgetPeriodFormData,
  BudgetLineFormData,
  VarianceReportFilters,
  BudgetApiResponse,
  BudgetStatus,
} from '../types/budgets';

/**
 * Budget Service
 * Handles all API calls related to budget management
 */
export const budgetService = {
  // ============================================================================
  // Budget Periods
  // ============================================================================

  /**
   * Get all budget periods
   */
  async getBudgetPeriods(params?: {
    status?: BudgetStatus;
    search?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
  }): Promise<BudgetPeriodListItem[]> {
    const response = await api.get('/budgets/periods/', { params });
    return response.results || response.data || response;
  },

  /**
   * Get a single budget period by ID
   */
  async getBudgetPeriod(id: number): Promise<BudgetPeriod> {
    const response = await api.get(`/budgets/periods/${id}/`);
    return response;
  },

  /**
   * Create a new budget period
   */
  async createBudgetPeriod(data: BudgetPeriodFormData): Promise<BudgetPeriod> {
    const response = await api.post('/budgets/periods/', data);
    return response;
  },

  /**
   * Update an existing budget period
   */
  async updateBudgetPeriod(id: number, data: Partial<BudgetPeriodFormData>): Promise<BudgetPeriod> {
    const response = await api.patch(`/budgets/periods/${id}/`, data);
    return response;
  },

  /**
   * Delete a budget period
   */
  async deleteBudgetPeriod(id: number): Promise<void> {
    await api.delete(`/budgets/periods/${id}/`);
  },

  /**
   * Approve a budget period
   * Changes status from draft to approved
   */
  async approveBudgetPeriod(id: number): Promise<BudgetApiResponse<BudgetPeriod>> {
    const response = await api.post(`/budgets/periods/${id}/approve/`);
    return response;
  },

  /**
   * Activate a budget period
   * Changes status from approved to active for tracking
   */
  async activateBudgetPeriod(id: number): Promise<BudgetApiResponse<BudgetPeriod>> {
    const response = await api.post(`/budgets/periods/${id}/activate/`);
    return response;
  },

  /**
   * Get variance report for a budget period
   * Compares budget vs actual spending
   */
  async getVarianceReport(
    id: number,
    filters?: VarianceReportFilters
  ): Promise<BudgetApiResponse<BudgetVarianceReport>> {
    const response = await api.get(`/budgets/periods/${id}/variance_report/`, {
      params: filters,
    });
    return response;
  },

  // ============================================================================
  // Budget Lines
  // ============================================================================

  /**
   * Get all budget lines
   */
  async getBudgetLines(params?: {
    budget_period?: number;
    account?: number;
    search?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
  }): Promise<BudgetLine[]> {
    const response = await api.get('/budgets/lines/', { params });
    return response.results || response.data || response;
  },

  /**
   * Get a single budget line by ID
   */
  async getBudgetLine(id: number): Promise<BudgetLine> {
    const response = await api.get(`/budgets/lines/${id}/`);
    return response;
  },

  /**
   * Create a new budget line
   */
  async createBudgetLine(
    data: BudgetLineFormData & { budget_period: number }
  ): Promise<BudgetLine> {
    const response = await api.post('/budgets/lines/', data);
    return response;
  },

  /**
   * Update an existing budget line
   */
  async updateBudgetLine(id: number, data: Partial<BudgetLineFormData>): Promise<BudgetLine> {
    const response = await api.patch(`/budgets/lines/${id}/`, data);
    return response;
  },

  /**
   * Delete a budget line
   */
  async deleteBudgetLine(id: number): Promise<void> {
    await api.delete(`/budgets/lines/${id}/`);
  },

  /**
   * Bulk create budget lines for a period
   * Useful for importing or creating multiple lines at once
   */
  async bulkCreateBudgetLines(
    periodId: number,
    lines: BudgetLineFormData[]
  ): Promise<BudgetLine[]> {
    const promises = lines.map(line => this.createBudgetLine({ ...line, budget_period: periodId }));
    return Promise.all(promises);
  },

  /**
   * Bulk update budget lines
   */
  async bulkUpdateBudgetLines(
    updates: Array<{ id: number; data: Partial<BudgetLineFormData> }>
  ): Promise<BudgetLine[]> {
    const promises = updates.map(({ id, data }) => this.updateBudgetLine(id, data));
    return Promise.all(promises);
  },

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Copy budget lines from one period to another
   * Useful for creating new budgets based on previous periods
   */
  async copyBudgetLines(fromPeriodId: number, toPeriodId: number): Promise<BudgetLine[]> {
    const sourceLines = await this.getBudgetLines({ budget_period: fromPeriodId });
    const linesToCreate: BudgetLineFormData[] = sourceLines.map(line => ({
      account: line.account,
      amount: line.amount,
      notes: line.notes,
    }));
    return this.bulkCreateBudgetLines(toPeriodId, linesToCreate);
  },

  /**
   * Get budget utilization summary for quick dashboard view
   */
  async getBudgetUtilizationSummary(): Promise<{
    active_periods: number;
    total_budget: string;
    total_actual: string;
    utilization_percent: number;
  }> {
    const activePeriods = await this.getBudgetPeriods({ status: 'active' });

    const summary = activePeriods.reduce(
      (acc, period) => ({
        active_periods: acc.active_periods + 1,
        total_budget: (
          parseFloat(acc.total_budget) + parseFloat(period.total_budget || '0')
        ).toFixed(2),
        total_actual: (
          parseFloat(acc.total_actual) + parseFloat(period.total_actual || '0')
        ).toFixed(2),
        utilization_percent: 0, // Will calculate after
      }),
      { active_periods: 0, total_budget: '0', total_actual: '0', utilization_percent: 0 }
    );

    if (parseFloat(summary.total_budget) > 0) {
      summary.utilization_percent =
        (parseFloat(summary.total_actual) / parseFloat(summary.total_budget)) * 100;
    }

    return summary;
  },
};
