// src/services/receivablesService.ts
import { api } from './api';
import {
  ReceivablesErrorHandler,
  RECEIVABLES_ERROR_CONTEXTS,
} from '../utils/receivablesErrorHandler';

// Types based on the documented API specification
export interface CustomerReceivable {
  id: number;
  client: number;
  client_name: string;
  receivable_type: 'invoice' | 'entitlement' | 'loan' | 'other';
  content_type: number;
  content_type_name: string;
  object_id: number;
  reference_number: string;
  original_amount: string;
  amount_paid?: string;
  balance: string;
  due_date: string;
  status: 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off';
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  days_overdue: number;
  overdue_interest_rate?: string;
  accrued_interest: string;
  last_reminder_sent?: string;
  reminder_count?: number;
  assigned_to?: {
    id: number;
    full_name: string;
  };
  collection_notes?: string;
  activity_logs?: ActivityLog[];
  owner?: number;
  branch?: number;
  created_at: string;
  updated_at: string;
}

export interface ActivityLog {
  id: number;
  activity_type: string;
  amount?: string;
  description: string;
  performed_by?: {
    id: number;
    full_name: string;
  };
  created_at: string;
}

export interface CustomerStatement {
  id: number;
  client: number;
  client_name: string;
  statement_number: string;
  statement_date: string;
  period_start: string;
  period_end: string;
  opening_balance: string;
  closing_balance: string;
  total_charges?: string;
  total_payments?: string;
  generated_by: number;
  generated_at: string;
  sent_via?: 'email' | 'print' | 'download' | 'portal';
  sent_at?: string;
  sent_to?: string;
  pdf_file?: string;
  owner?: number;
  branch?: number;
  created_at: string;
  updated_at: string;
}

// Filters and query parameters
export interface ReceivablesFilters {
  aging_bucket?: 'current' | '1-30' | '31-60' | '61-90' | '90+';
  branch?: number;
  client?: number;
  receivable_type?: 'invoice' | 'entitlement' | 'loan' | 'other';
  status?: 'pending' | 'partial' | 'paid' | 'overdue' | 'written_off';
  due_date__lte?: string;
  assigned_to?: number;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface CreateStatementData {
  client: number;
  period_start: string;
  period_end: string;
  include_paid?: boolean;
}

export const receivablesService = {
  // Enhanced error handling methods
  async getReceivablesWithErrorHandling(filters?: ReceivablesFilters) {
    return ReceivablesErrorHandler.withRetry(
      () => this.getReceivables(filters),
      RECEIVABLES_ERROR_CONTEXTS.LOAD_RECEIVABLES,
      { maxRetries: 2, baseDelay: 1000 }
    );
  },

  async updateAgingWithErrorHandling(id: number) {
    return ReceivablesErrorHandler.withRetry(
      () => this.updateAging(id),
      RECEIVABLES_ERROR_CONTEXTS.UPDATE_AGING,
      { maxRetries: 1, baseDelay: 500 }
    );
  },

  async sendReminderWithErrorHandling(
    id: number,
    data: {
      reminder_type: string;
      template: string;
      custom_message?: string;
    }
  ) {
    return ReceivablesErrorHandler.withRetry(
      () => this.sendReminder(id, data),
      RECEIVABLES_ERROR_CONTEXTS.SEND_REMINDER,
      { maxRetries: 1, baseDelay: 1000 }
    );
  },

  async generateStatementWithErrorHandling(data: CreateStatementData) {
    return ReceivablesErrorHandler.withRetry(
      () => this.generateStatement(data),
      RECEIVABLES_ERROR_CONTEXTS.GENERATE_STATEMENT,
      { maxRetries: 1, baseDelay: 2000 }
    );
  },

  // Bulk operations with enhanced error handling
  async calculateAgingBatch(receivables: CustomerReceivable[]): Promise<{
    success: boolean;
    processed_count: number;
    errors: Array<{ receivable_id: number; error: string }>;
    message: string;
  }> {
    const errors: Array<{ receivable_id: number; error: string }> = [];
    let processed_count = 0;

    for (const receivable of receivables) {
      try {
        await this.updateAgingWithErrorHandling(receivable.id);
        processed_count++;
      } catch (error: any) {
        errors.push({
          receivable_id: receivable.id,
          error: error.message || 'Failed to update aging',
        });
      }
    }

    return {
      success: errors.length === 0,
      processed_count,
      errors,
      message: `Processed ${processed_count} of ${receivables.length} receivables`,
    };
  },

  async applyInterestBatch(
    receivables: CustomerReceivable[],
    interestRate: number
  ): Promise<{
    success: boolean;
    processed_count: number;
    errors: Array<{ receivable_id: number; error: string }>;
    message: string;
  }> {
    const errors: Array<{ receivable_id: number; error: string }> = [];
    let processed_count = 0;

    // Only process overdue receivables
    const overdueReceivables = receivables.filter(
      r => r.status === 'overdue' || r.days_overdue > 0
    );

    for (const receivable of overdueReceivables) {
      try {
        await ReceivablesErrorHandler.withRetry(
          () => this.applyInterest(receivable.id),
          RECEIVABLES_ERROR_CONTEXTS.BULK_INTEREST_APPLICATION,
          { maxRetries: 1, baseDelay: 500 }
        );
        processed_count++;
      } catch (error: any) {
        errors.push({
          receivable_id: receivable.id,
          error: error.message || 'Failed to apply interest',
        });
      }
    }

    return {
      success: errors.length === 0,
      processed_count,
      errors,
      message: `Applied interest to ${processed_count} of ${overdueReceivables.length} overdue receivables`,
    };
  },

  // Receivables Management - Only documented endpoints
  async getReceivables(filters?: ReceivablesFilters) {
    return api.get('/receivables/receivables/', { params: filters });
  },

  async getReceivable(id: number): Promise<CustomerReceivable> {
    return api.get(`/receivables/receivables/${id}/`);
  },

  // Update aging for a single receivable
  async updateAging(id: number) {
    return api.post(`/receivables/receivables/${id}/update_aging/`, {});
  },

  // Calculate interest for a receivable
  async calculateInterest(
    id: number,
    asOfDate?: string
  ): Promise<{
    receivable_id: number;
    balance: string;
    interest_rate: string;
    days_overdue: number;
    calculated_interest: string;
    current_accrued: string;
    new_total: string;
  }> {
    const params = asOfDate ? { as_of_date: asOfDate } : {};
    return api.get(`/receivables/receivables/${id}/calculate_interest/`, { params });
  },

  // Apply interest to a receivable
  async applyInterest(id: number): Promise<CustomerReceivable> {
    return api.post(`/receivables/receivables/${id}/apply_interest/`, {});
  },

  // Assign collector to a receivable
  async assignCollector(
    id: number,
    data: { assigned_to: number; notes?: string }
  ): Promise<CustomerReceivable> {
    return api.post(`/receivables/receivables/${id}/assign/`, data);
  },

  // Send reminder for a receivable
  async sendReminder(
    id: number,
    data: {
      reminder_type: string;
      template: string;
      custom_message?: string;
    }
  ): Promise<CustomerReceivable> {
    return api.post(`/receivables/receivables/${id}/send_reminder/`, data);
  },

  // Add note to a receivable
  async addNote(id: number, data: { note: string }): Promise<CustomerReceivable> {
    return api.post(`/receivables/receivables/${id}/add_note/`, data);
  },

  // Write off a receivable (full or partial)
  async writeOff(
    id: number,
    data: { reason: string; amount?: number }
  ): Promise<{ success: boolean; message: string; receivable: CustomerReceivable }> {
    return api.post(`/receivables/receivables/${id}/write_off/`, data);
  },

  // Apply a credit note against a receivable
  async applyCreditNote(
    id: number,
    data: { credit_note_id: number; amount?: number }
  ): Promise<{ success: boolean; message: string; receivable: CustomerReceivable }> {
    return api.post(`/receivables/receivables/${id}/apply_credit_note/`, data);
  },

  // Issue a refund against a receivable
  async issueRefund(
    id: number,
    data: { amount: number; reason: string; refund_method?: string }
  ): Promise<{ success: boolean; message: string; receivable: CustomerReceivable }> {
    return api.post(`/receivables/receivables/${id}/issue_refund/`, data);
  },

  // Aging Report
  async getAgingReport(filters?: {
    as_of_date?: string;
    branch?: number;
    format?: 'json' | 'csv';
  }) {
    return api.get('/receivables/receivables/aging_report/', { params: filters });
  },

  // Customer Summary
  async getCustomerSummary(clientId: number) {
    return api.get('/receivables/receivables/customer_summary/', {
      params: { client: clientId },
    });
  },

  // Customer Statements - Only documented endpoints
  async getStatements(filters?: {
    client?: number;
    statement_date__gte?: string;
    statement_date__lte?: string;
    search?: string;
    ordering?: string;
    page?: number;
  }) {
    return api.get('/receivables/statements/', { params: filters });
  },

  async generateStatement(data: CreateStatementData): Promise<CustomerStatement> {
    return api.post('/receivables/statements/generate/', data);
  },

  async getStatement(id: number): Promise<CustomerStatement> {
    return api.get(`/receivables/statements/${id}/`);
  },

  async sendStatement(
    id: number,
    data: {
      email: string;
      subject: string;
      message: string;
    }
  ): Promise<CustomerStatement> {
    return api.post(`/receivables/statements/${id}/send/`, data);
  },

  // Statement Preview (mock implementation until API is available)
  async getStatementPreview(params: {
    client: number;
    period_start: string;
    period_end: string;
    include_paid?: boolean;
  }): Promise<any> {
    // This would normally call an API endpoint like:
    // return api.post('/receivables/statements/preview/', params);

    // For now, return mock data based on the client
    return {
      client: {
        id: params.client,
        full_name: 'John Doe',
        email: 'john.doe@example.com',
        phone: '+234 801 234 5678',
        address: '123 Main Street, Lagos, Nigeria',
      },
      period_start: params.period_start,
      period_end: params.period_end,
      opening_balance: '50000.00',
      closing_balance: '85000.00',
      total_charges: '50000.00',
      total_payments: '15000.00',
      transaction_count: 4,
      statement_date: new Date().toISOString().split('T')[0],
      transactions: [
        {
          id: 1,
          date: params.period_start,
          reference: 'Opening Balance',
          description: 'Balance brought forward',
          charges: '0.00',
          payments: '0.00',
          balance: '50000.00',
          type: 'charge',
        },
        {
          id: 2,
          date: '2025-01-05',
          reference: 'INV-20250105-001',
          description: 'Consulting Services - January',
          charges: '25000.00',
          payments: '0.00',
          balance: '75000.00',
          type: 'charge',
        },
        {
          id: 3,
          date: '2025-01-10',
          reference: 'PMT-001',
          description: 'Payment received - Bank Transfer',
          charges: '0.00',
          payments: '15000.00',
          balance: '60000.00',
          type: 'payment',
        },
        {
          id: 4,
          date: '2025-01-15',
          reference: 'INV-20250115-002',
          description: 'Additional Services',
          charges: '25000.00',
          payments: '0.00',
          balance: '85000.00',
          type: 'charge',
        },
      ],
    };
  },

  // Activity Logs - Only documented endpoints
  async getActivityLogs(filters?: {
    receivable?: number;
    activity_type?: string;
    created_at__gte?: string;
    search?: string;
    ordering?: string;
    page?: number;
  }) {
    return api.get('/receivables/activity-logs/', { params: filters });
  },

  // Payment Trends Analytics (mock implementation until API is available)
  async getPaymentTrends(filters?: {
    period?: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    start_date?: string;
    end_date?: string;
    client?: number;
    branch?: number;
  }): Promise<{
    payment_volume_trend: Array<{
      period: string;
      total_payments: string;
      payment_count: number;
      average_payment: string;
    }>;
    collection_effectiveness: Array<{
      period: string;
      invoices_created: number;
      invoices_paid: number;
      effectiveness_rate: number;
      average_days_to_collect: number;
    }>;
    customer_payment_patterns: Array<{
      client_id: number;
      client_name: string;
      total_invoices: number;
      total_paid: number;
      average_days_to_pay: number;
      payment_consistency: number;
      preferred_payment_method: string;
    }>;
    aging_trend: Array<{
      period: string;
      current: string;
      overdue_1_30: string;
      overdue_31_60: string;
      overdue_61_90: string;
      overdue_90_plus: string;
    }>;
    payment_method_breakdown: Array<{
      method: string;
      count: number;
      total_amount: string;
      percentage: number;
    }>;
    predictive_analytics: {
      expected_collections_next_30_days: string;
      at_risk_receivables: Array<{
        client_id: number;
        client_name: string;
        amount: string;
        risk_score: number;
        predicted_collection_date: string;
      }>;
      seasonal_trends: Array<{
        month: string;
        historical_average: string;
        current_year: string;
        variance_percentage: number;
      }>;
    };
  }> {
    // Mock implementation - would normally call API endpoint
    const currentDate = new Date();
    const periods = [];

    // Generate last 12 months of data
    for (let i = 11; i >= 0; i--) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      periods.push({
        period: date.toISOString().slice(0, 7), // YYYY-MM format
        month_name: date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
      });
    }

    return {
      payment_volume_trend: periods.map((p, index) => ({
        period: p.month_name,
        total_payments: (Math.random() * 5000000 + 2000000).toFixed(2),
        payment_count: Math.floor(Math.random() * 200 + 50),
        average_payment: (Math.random() * 50000 + 10000).toFixed(2),
      })),
      collection_effectiveness: periods.map((p, index) => ({
        period: p.month_name,
        invoices_created: Math.floor(Math.random() * 300 + 100),
        invoices_paid: Math.floor(Math.random() * 250 + 80),
        effectiveness_rate: Math.random() * 30 + 70, // 70-100%
        average_days_to_collect: Math.random() * 20 + 15, // 15-35 days
      })),
      customer_payment_patterns: [
        {
          client_id: 1,
          client_name: 'ABC Corporation',
          total_invoices: 24,
          total_paid: 22,
          average_days_to_pay: 18,
          payment_consistency: 92,
          preferred_payment_method: 'bank_transfer',
        },
        {
          client_id: 2,
          client_name: 'XYZ Limited',
          total_invoices: 18,
          total_paid: 15,
          average_days_to_pay: 25,
          payment_consistency: 83,
          preferred_payment_method: 'check',
        },
        {
          client_id: 3,
          client_name: 'Tech Solutions Inc',
          total_invoices: 36,
          total_paid: 34,
          average_days_to_pay: 12,
          payment_consistency: 94,
          preferred_payment_method: 'online',
        },
        {
          client_id: 4,
          client_name: 'Global Services Ltd',
          total_invoices: 12,
          total_paid: 8,
          average_days_to_pay: 45,
          payment_consistency: 67,
          preferred_payment_method: 'bank_transfer',
        },
        {
          client_id: 5,
          client_name: 'Innovation Hub',
          total_invoices: 30,
          total_paid: 28,
          average_days_to_pay: 20,
          payment_consistency: 93,
          preferred_payment_method: 'online',
        },
      ],
      aging_trend: periods.map(p => ({
        period: p.month_name,
        current: (Math.random() * 2000000 + 1000000).toFixed(2),
        overdue_1_30: (Math.random() * 500000 + 200000).toFixed(2),
        overdue_31_60: (Math.random() * 300000 + 100000).toFixed(2),
        overdue_61_90: (Math.random() * 200000 + 50000).toFixed(2),
        overdue_90_plus: (Math.random() * 150000 + 25000).toFixed(2),
      })),
      payment_method_breakdown: [
        { method: 'Bank Transfer', count: 145, total_amount: '12500000.00', percentage: 45 },
        { method: 'Online Payment', count: 98, total_amount: '8200000.00', percentage: 30 },
        { method: 'Check', count: 52, total_amount: '4100000.00', percentage: 15 },
        { method: 'Cash', count: 28, total_amount: '2200000.00', percentage: 8 },
        { method: 'Other', count: 12, total_amount: '550000.00', percentage: 2 },
      ],
      predictive_analytics: {
        expected_collections_next_30_days: '3250000.00',
        at_risk_receivables: [
          {
            client_id: 6,
            client_name: 'Delayed Payments Corp',
            amount: '125000.00',
            risk_score: 85,
            predicted_collection_date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          },
          {
            client_id: 7,
            client_name: 'Struggling Business Ltd',
            amount: '89000.00',
            risk_score: 78,
            predicted_collection_date: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          },
          {
            client_id: 8,
            client_name: 'Cash Flow Issues Inc',
            amount: '156000.00',
            risk_score: 72,
            predicted_collection_date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split('T')[0],
          },
        ],
        seasonal_trends: [
          {
            month: 'Jan',
            historical_average: '2800000.00',
            current_year: '3100000.00',
            variance_percentage: 10.7,
          },
          {
            month: 'Feb',
            historical_average: '2600000.00',
            current_year: '2750000.00',
            variance_percentage: 5.8,
          },
          {
            month: 'Mar',
            historical_average: '3200000.00',
            current_year: '3050000.00',
            variance_percentage: -4.7,
          },
          {
            month: 'Apr',
            historical_average: '2900000.00',
            current_year: '3200000.00',
            variance_percentage: 10.3,
          },
          {
            month: 'May',
            historical_average: '3100000.00',
            current_year: '2950000.00',
            variance_percentage: -4.8,
          },
          {
            month: 'Jun',
            historical_average: '3400000.00',
            current_year: '3600000.00',
            variance_percentage: 5.9,
          },
        ],
      },
    };
  },
};
