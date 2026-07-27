// Financial Reports Service
// Implements authenticated API methods for all three financial report endpoints
// Based on API documentation from .kiro/specs/finanncial/FINANCIAL_REPORTS_FRONTEND_GUIDE.md

import {
  TrialBalanceData,
  TrialBalanceParams,
  ProfitLossData,
  ProfitLossParams,
  BalanceSheetData,
  BalanceSheetParams,
  MonthlyProfitLossData,
  ApiResponse,
  ExportFormat,
} from '../types/financialReports';
import { tokenManager } from './tokenManager';
import { getHeaders, BASE_URL } from './api';

class FinancialReportsService {
  // BASE_URL already carries the environment-specific origin + /api prefix
  // (e.g. https://api.erp.krystartrust.ng/api in production, where the
  // frontend and backend are on different domains) — this service used to
  // hardcode a bare relative "/api/reports/financial" path instead, which
  // in production resolved against the *frontend's* own origin, not the
  // backend, silently returning nothing for every report regardless of
  // branch.
  private baseUrl = `${BASE_URL}/reports/financial`;

  /**
   * Makes an authenticated request to the API
   */
  private async makeAuthenticatedRequest<T>(url: string): Promise<ApiResponse<T>> {
    try {
      // getHeaders() also injects X-Branch-ID from the branch switcher for
      // elevated users — these reports used to hand-roll just Authorization/
      // Content-Type, so switching branches never reached the backend and
      // every report silently fell back to "all branches" / the viewer's
      // own home branch regardless of what was selected in the topbar.
      const response = await fetch(url, {
        headers: getHeaders(),
      });

      if (response.status === 401) {
        // Token expired or invalid - try to refresh
        const refreshSuccess = await tokenManager.refreshToken();
        if (refreshSuccess) {
          // Retry the original request with fresh headers (new token + branch)
          const retryResponse = await fetch(url, {
            headers: getHeaders(),
          });

          if (!retryResponse.ok) {
            throw new Error(`HTTP error! status: ${retryResponse.status}`);
          }

          return await retryResponse.json();
        } else {
          // Refresh failed, redirect to login
          window.location.href = '/login';
          throw new Error('Authentication failed');
        }
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      this.handleApiError(error);
    }
  }

  /**
   * Handles API errors consistently
   */
  private handleApiError(error: unknown): never {
    if (error instanceof Error) {
      throw new Error(error.message);
    }
    throw new Error('An unexpected error occurred');
  }

  /**
   * Builds query parameters from an object
   */
  private buildQueryParams(params: Record<string, any>): string {
    const queryParams = new URLSearchParams();

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        queryParams.append(key, value.toString());
      }
    });

    return queryParams.toString();
  }

  /**
   * Fetches Trial Balance report
   */
  async getTrialBalance(params: TrialBalanceParams = {}): Promise<TrialBalanceData> {
    const queryString = this.buildQueryParams(params);
    const url = `${this.baseUrl}/trial_balance/${queryString ? `?${queryString}` : ''}`;

    const response = await this.makeAuthenticatedRequest<TrialBalanceData>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch Trial Balance report');
    }

    return response.data;
  }

  /**
   * Fetches Profit & Loss statement
   */
  async getProfitLoss(params: ProfitLossParams): Promise<ProfitLossData> {
    if (!params.start_date) {
      throw new Error('start_date is required for Profit & Loss report');
    }

    const queryString = this.buildQueryParams(params);
    const url = `${this.baseUrl}/profit_loss/?${queryString}`;

    const response = await this.makeAuthenticatedRequest<ProfitLossData>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch Profit & Loss report');
    }

    return response.data;
  }

  /**
   * Fetches Balance Sheet report
   */
  async getBalanceSheet(params: BalanceSheetParams = {}): Promise<BalanceSheetData> {
    const queryString = this.buildQueryParams(params);
    const url = `${this.baseUrl}/balance_sheet/${queryString ? `?${queryString}` : ''}`;

    const response = await this.makeAuthenticatedRequest<BalanceSheetData>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch Balance Sheet report');
    }

    return response.data;
  }

  /**
   * Fetches the month-by-month Profit & Loss (spreadsheet-style, one column
   * per calendar month) — the format the client's prior system used.
   */
  async getMonthlyProfitLoss(year: number): Promise<MonthlyProfitLossData> {
    const url = `${this.baseUrl}/monthly_profit_loss/?year=${year}`;

    const response = await this.makeAuthenticatedRequest<MonthlyProfitLossData>(url);

    if (!response.success || !response.data) {
      throw new Error(response.error || 'Failed to fetch Monthly Profit & Loss report');
    }

    return response.data;
  }

  /**
   * Downloads the month-by-month Profit & Loss as a CSV file.
   */
  async downloadMonthlyProfitLossCsv(year: number): Promise<void> {
    const url = `${this.baseUrl}/monthly_profit_loss/?year=${year}&format=csv`;

    const response = await fetch(url, { headers: getHeaders() });
    if (!response.ok) {
      throw new Error(`CSV export failed: ${response.status}`);
    }

    const blob = await response.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `monthly-profit-loss-${year}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(downloadUrl);
  }

  /**
   * Exports a report in the specified format
   */
  async exportReport(
    reportType: 'trial_balance' | 'profit_loss' | 'balance_sheet',
    format: ExportFormat,
    params: any = {}
  ): Promise<void> {
    const exportParams = {
      ...params,
      export_format: format,
    };

    const queryString = this.buildQueryParams(exportParams);
    const url = `${this.baseUrl}/${reportType}/?${queryString}`;

    // For exports, we open in a new window/tab to trigger download
    const { accessToken } = tokenManager.getTokens();
    if (!accessToken) {
      throw new Error('Authentication token not found');
    }

    // Create a temporary form to handle the download with authentication
    const form = document.createElement('form');
    form.method = 'GET';
    form.action = url;
    form.target = '_blank';

    // Add authorization header via hidden input (if backend supports it)
    // Otherwise, we'll need to use a different approach
    const authInput = document.createElement('input');
    authInput.type = 'hidden';
    authInput.name = 'token';
    authInput.value = accessToken;
    form.appendChild(authInput);

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  }

  /**
   * Alternative export method using fetch and blob
   */
  async downloadReport(
    reportType: 'trial_balance' | 'profit_loss' | 'balance_sheet',
    format: ExportFormat,
    params: any = {}
  ): Promise<void> {
    const exportParams = {
      ...params,
      export_format: format,
    };

    const queryString = this.buildQueryParams(exportParams);
    const url = `${this.baseUrl}/${reportType}/?${queryString}`;

    const { accessToken } = tokenManager.getTokens();
    if (!accessToken) {
      throw new Error('Authentication token not found');
    }

    try {
      const response = await fetch(url, {
        headers: getHeaders(),
      });

      if (!response.ok) {
        throw new Error(`Export failed: ${response.status}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${reportType}-${format}-${new Date().toISOString().split('T')[0]}.${format}`;

      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      this.handleApiError(error);
    }
  }
}

// Export singleton instance
export const financialReportsService = new FinancialReportsService();
export default financialReportsService;
