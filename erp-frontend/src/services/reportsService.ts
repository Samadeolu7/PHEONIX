// src/services/reportsService.ts
import { api } from './api';

export interface ReportTemplate {
  id: number;
  name: string;
  code: string;
  description: string;
  category: number | null;
  category_name?: string;
  report_type: 'financial' | 'operational' | 'analytical' | 'compliance' | 'custom';
  access_level: 'public' | 'internal' | 'restricted' | 'private';
  is_auto_generated: boolean;
  linked_account?: number;
  linked_account_code?: string;
  linked_product?: number;
  linked_product_code?: string;
  linked_product_name?: string;
  report_config: Record<string, any>;
  primary_entity: string;
  allowed_entities: string[];
  allowed_fields: string[];
  allowed_calculations: string[];
  max_rows: number;
  default_date_range: string;
  refresh_interval: number;
  required_permission: string;
  restricted_to_roles: string[];
  is_active: boolean;
  is_system: boolean;
  is_editable: boolean;
  usage_count: number;
  last_run_at: string | null;
  version: number;
  parameters: ReportParameter[];
  columns: ReportColumn[];
  charts: ReportChart[];
  created_at: string;
  updated_at: string;
}

export interface ReportParameter {
  id: number;
  name: string;
  code: string;
  parameter_type:
    | 'date'
    | 'date_range'
    | 'number'
    | 'text'
    | 'select'
    | 'multi_select'
    | 'account'
    | 'client'
    | 'product'
    | 'product_type'
    | 'boolean';
  label: string;
  description: string;
  is_required: boolean;
  default_value: any;
  options: any[];
  validation_rules: Record<string, any>;
  order: number;
}

export interface ReportColumn {
  id: number;
  name: string;
  code: string;
  column_type: 'field' | 'calculation' | 'aggregation' | 'formula';
  label: string;
  description: string;
  field_path: string;
  aggregation_function: 'sum' | 'avg' | 'count' | 'min' | 'max' | 'count_distinct' | '';
  formula: string;
  format_type: 'text' | 'number' | 'currency' | 'percentage' | 'date' | 'datetime' | 'boolean';
  format_options: Record<string, any>;
  width: number;
  is_visible: boolean;
  is_sortable: boolean;
  is_filterable: boolean;
  order: number;
  conditional_formatting: any[];
}

export interface ReportChart {
  id: number;
  name: string;
  chart_type: 'line' | 'bar' | 'pie' | 'donut' | 'area' | 'scatter' | 'gauge' | 'kpi';
  title: string;
  description: string;
  data_config: Record<string, any>;
  display_config: Record<string, any>;
  position: 'top' | 'bottom' | 'left' | 'right' | 'inline';
  order: number;
  is_visible: boolean;
}

export interface ReportExecution {
  id: number;
  template: number;
  template_name?: string;
  executed_at: string;
  executed_by: number;
  executed_by_name?: string;
  parameters: Record<string, any>;
  row_count?: number;
  execution_time_ms?: number;
  status: 'running' | 'completed' | 'failed' | 'cached';
  error_message?: string;
  is_cache_valid?: boolean;
  data?: any[];
  summary?: Record<string, any>;
  charts?: any[];
}

export interface ReportCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  icon: string;
  color: string;
  parent: number | null;
  order: number;
  created_at: string;
  updated_at: string;
}

class ReportsService {
  // Get all report templates
  async getReportTemplates(params?: {
    category?: string;
    module?: string;
    search?: string;
    is_active?: boolean;
    linked_account_code?: string;
    page?: number;
    page_size?: number;
  }): Promise<{
    results: ReportTemplate[];
    count: number;
    next: string | null;
    previous: string | null;
  }> {
    try {
      const response = await api.get('/reports/templates/', params);
      return response;
    } catch (error: any) {
      console.error('Error fetching report templates:', error);
      throw new Error(error.message || 'Failed to fetch reports');
    }
  }

  // Get single report template by ID
  async getReportTemplate(id: number): Promise<ReportTemplate> {
    try {
      const response = await api.get(`/reports/templates/${id}/`);
      return response;
    } catch (error: any) {
      console.error('Error fetching report template:', error);
      throw new Error(error.message || 'Failed to fetch report');
    }
  }

  // Get report template by code
  async getReportTemplateByCode(code: string): Promise<ReportTemplate> {
    try {
      const response = await api.get(`/reports/templates/by-code/${code}/`);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching report template by code:', error);
      throw new Error(error.message || 'Failed to fetch report');
    }
  }

  // Get report categories
  async getReportCategories(): Promise<ReportCategory[]> {
    try {
      const response = await api.get('/reports/categories/');
      return response.results || response;
    } catch (error: any) {
      console.error('Error fetching report categories:', error);
      throw new Error(error.message || 'Failed to fetch categories');
    }
  }

  // Get recent report executions
  async getRecentExecutions(limit: number = 10): Promise<ReportExecution[]> {
    try {
      const response = await api.get('/reports/executions/', {
        ordering: '-executed_at',
        page_size: limit,
      });
      return response.results || response;
    } catch (error: any) {
      console.error('Error fetching recent executions:', error);
      throw new Error(error.message || 'Failed to fetch executions');
    }
  }

  // Execute a report (POST method)
  async executeReport(
    reportId: number,
    parameters: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    data: any;
    metadata: any;
    execution_id: number;
  }> {
    try {
      const response = await api.post(`/reports/templates/${reportId}/execute/`, {
        parameters,
      });
      return response;
    } catch (error: any) {
      console.error('Error executing report:', error);
      throw new Error(error.message || 'Failed to execute report');
    }
  }

  // Run a report (GET method with query params)
  async runReport(
    reportId: number,
    parameters: Record<string, any> = {}
  ): Promise<{
    success: boolean;
    data: any;
    metadata: any;
  }> {
    try {
      const response = await api.get(`/reports/templates/${reportId}/run/`, parameters);
      return response;
    } catch (error: any) {
      console.error('Error running report:', error);
      throw new Error(error.message || 'Failed to run report');
    }
  }

  // Get reports by account
  async getReportsByAccount(accountId: number): Promise<ReportTemplate[]> {
    try {
      const response = await api.get('/reports/templates/by-account/', {
        account_id: accountId,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error fetching reports by account:', error);
      throw new Error(error.message || 'Failed to fetch account reports');
    }
  }

  // Delete report template
  async deleteReportTemplate(id: number): Promise<void> {
    try {
      await api.delete(`/reports/templates/${id}/`);
    } catch (error: any) {
      console.error('Error deleting report template:', error);
      throw new Error(error.message || 'Failed to delete report');
    }
  }

  // Duplicate report template
  async duplicateReportTemplate(id: number, newName: string): Promise<ReportTemplate> {
    try {
      const response = await api.post(`/reports/templates/${id}/duplicate/`, {
        name: newName,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error duplicating report template:', error);
      throw new Error(error.message || 'Failed to duplicate report');
    }
  }

  // Validate report configuration
  async validateReportConfig(
    id: number
  ): Promise<{ success: boolean; message?: string; errors?: string[] }> {
    try {
      const response = await api.post(`/reports/templates/${id}/validate/`);
      return response;
    } catch (error: any) {
      console.error('Error validating report config:', error);
      throw new Error(error.message || 'Failed to validate report');
    }
  }

  // Generate report for product
  async generateReportForProduct(productId: number): Promise<ReportTemplate> {
    try {
      const response = await api.post('/reports/templates/generate-for-product/', {
        product_id: productId,
      });
      return response.data;
    } catch (error: any) {
      console.error('Error generating report for product:', error);
      throw new Error(error.message || 'Failed to generate report');
    }
  }

  // Get report execution details
  async getReportExecution(id: number): Promise<ReportExecution> {
    try {
      const response = await api.get(`/reports/executions/${id}/`);
      return response;
    } catch (error: any) {
      console.error('Error fetching report execution:', error);
      throw new Error(error.message || 'Failed to fetch execution details');
    }
  }

  // Download report result
  async downloadReportResult(
    executionId: number,
    format: 'csv' | 'xlsx' | 'pdf' = 'csv'
  ): Promise<Blob> {
    try {
      const response = await fetch(
        `/api/reports/executions/${executionId}/download/?format=${format}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('accessToken') || sessionStorage.getItem('accessToken')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Download failed: ${response.status}`);
      }

      return await response.blob();
    } catch (error: any) {
      console.error('Error downloading report:', error);
      throw new Error(error.message || 'Failed to download report');
    }
  }

  // Export report (alias for downloadReportResult)
  async exportReport(executionId: number, format: 'csv' | 'pdf' | 'excel' = 'csv'): Promise<Blob> {
    // Convert 'excel' to 'xlsx' for backend compatibility
    const backendFormat = format === 'excel' ? 'xlsx' : format;
    return this.downloadReportResult(executionId, backendFormat as 'csv' | 'xlsx' | 'pdf');
  }

  // ============================================================================
  // Financial Reports - Cash Flow Statement
  // ============================================================================

  /**
   * Get Cash Flow Statement
   * Shows operating, investing, and financing activities
   */
  async getCashFlowStatement(params: {
    start_date: string; // Required - YYYY-MM-DD
    end_date?: string; // Optional - defaults to today
    method?: 'direct' | 'indirect'; // Optional - defaults to 'direct'
    export_format?: 'json' | 'pdf' | 'excel'; // Optional - defaults to 'json'
  }): Promise<any> {
    try {
      const response = await api.get('/reports/financial/cash_flow/', { params });
      return response;
    } catch (error: any) {
      console.error('Error fetching cash flow statement:', error);
      throw new Error(error.message || 'Failed to fetch cash flow statement');
    }
  }
}

export const reportsService = new ReportsService();
