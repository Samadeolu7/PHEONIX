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
  ApiResponse,
  ExportFormat,
} from '../types/financialReports';
import { tokenManager } from './tokenManager';

class FinancialReportsService {
  private baseUrl = '/api/reports/financial';

  /**
   * Makes an authenticated request to the API
   */
  private async makeAuthenticatedRequest<T>(url: string): Promise<ApiResponse<T>> {
    const { accessToken } = tokenManager.getTokens();

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        // Token expired or invalid - try to refresh
        const refreshSuccess = await tokenManager.refreshToken();
        if (refreshSuccess) {
          // Get fresh token after refresh
          const { accessToken: newToken } = tokenManager.getTokens();

          // Retry the original request with new token
          const retryResponse = await fetch(url, {
            headers: {
              Authorization: `Bearer ${newToken}`,
              'Content-Type': 'application/json',
            },
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
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
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
