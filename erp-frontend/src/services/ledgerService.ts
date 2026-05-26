import { api } from './api';
import {
  MaterialRequest,
  CreateMaterialRequest,
  MaterialRequestFilters,
  MaterialRequestActionData,
  MaterialRequestSummary,
  EligibleInventoryItem,
  OfficeUseRequest,
  CreateOfficeUseRequest,
  OfficeUseRequestFilters,
  OfficeUseRequestActionData,
  OfficeUseRequestSummary,
  AccountLedger,
  InventoryLedger,
  ItemLifecycleLedger,
  ItemCostAnalysis,
  ClientStatement,
  PaymentHistory,
  OutstandingInvoices,
  ClientLedger,
} from '../types/ledger';

// ============================================
// MATERIAL REQUESTS
// ============================================

export const materialRequestService = {
  async getMaterialRequests(filters?: MaterialRequestFilters): Promise<MaterialRequest[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.client) params.append('client', filters.client.toString());
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.service_invoice)
      params.append('service_invoice', filters.service_invoice.toString());

    const response = await api.get(`/inventory/material-requests/?${params.toString()}`);
    return response;
  },

  async getMaterialRequest(id: number): Promise<MaterialRequest> {
    const response = await api.get(`/inventory/material-requests/${id}/`);
    return response;
  },

  async createMaterialRequest(data: CreateMaterialRequest): Promise<MaterialRequest> {
    const response = await api.post('/inventory/material-requests/', data);
    return response;
  },

  async updateMaterialRequest(
    id: number,
    data: Partial<CreateMaterialRequest>
  ): Promise<MaterialRequest> {
    const response = await api.patch(`/inventory/material-requests/${id}/`, data);
    return response;
  },

  async deleteMaterialRequest(id: number): Promise<void> {
    await api.delete(`/inventory/material-requests/${id}/`);
  },

  // Workflow Actions
  async submitMaterialRequest(id: number): Promise<MaterialRequest> {
    const response = await api.post(`/inventory/material-requests/${id}/submit/`);
    return response;
  },

  async approveMaterialRequest(
    id: number,
    data: MaterialRequestActionData
  ): Promise<MaterialRequest> {
    const response = await api.post(`/inventory/material-requests/${id}/approve/`, data);
    return response;
  },

  async rejectMaterialRequest(
    id: number,
    data: MaterialRequestActionData
  ): Promise<MaterialRequest> {
    const response = await api.post(`/inventory/material-requests/${id}/reject/`, data);
    return response;
  },

  async fulfillMaterialRequest(id: number): Promise<MaterialRequest> {
    const response = await api.post(`/inventory/material-requests/${id}/fulfill/`);
    return response;
  },

  async cancelMaterialRequest(id: number): Promise<MaterialRequest> {
    const response = await api.post(`/inventory/material-requests/${id}/cancel/`);
    return response;
  },

  // Summary and Reports
  async getMaterialRequestSummary(): Promise<MaterialRequestSummary> {
    const response = await api.get('/inventory/material-requests/summary/');
    return response;
  },

  async getPendingApprovals(): Promise<MaterialRequest[]> {
    const response = await api.get('/inventory/material-requests/pending-approvals/');
    return response;
  },

  async getEligibleItems(
    invoiceId: number,
    search?: string
  ): Promise<{
    invoice_id: number;
    invoice_number: string;
    eligible_items: EligibleInventoryItem[];
    ineligible_items: EligibleInventoryItem[];
  }> {
    const params = new URLSearchParams({ invoice: invoiceId.toString() });
    if (search) params.append('search', search);
    const response = await api.get(
      `/inventory/material-requests/eligible-items/?${params.toString()}`
    );
    return response;
  },

  async checkMaterialRequestStock(id: number): Promise<{
    available: boolean;
    can_fulfill: boolean;
    errors: string[];
    items: Array<{
      item_id: number;
      item_name: string;
      sku: string;
      requested: number;
      available: number;
      on_hand: number;
      reserved: number;
      status: 'available' | 'insufficient' | 'not_found';
    }>;
    location: { id: number; name: string; code: string };
  }> {
    const response = await api.get(`/inventory/material-requests/${id}/check-stock/`);
    return response;
  },
};

// ============================================
// OFFICE USE REQUESTS
// ============================================

export const officeUseRequestService = {
  async getOfficeUseRequests(filters?: OfficeUseRequestFilters): Promise<{
    results: OfficeUseRequest[];
    count: number;
    next: string | null;
    previous: string | null;
  }> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.requested_by) params.append('requested_by', filters.requested_by.toString());
    if (filters?.department) params.append('department', filters.department);
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.search) params.append('search', filters.search);
    if (filters?.page) params.append('page', filters.page.toString());
    if (filters?.page_size) params.append('page_size', filters.page_size.toString());
    const response = await api.get(`/inventory/office-use-requests/?${params.toString()}`);
    return response;
  },

  async getOfficeUseRequest(id: number): Promise<OfficeUseRequest> {
    const response = await api.get(`/inventory/office-use-requests/${id}/`);
    return response;
  },

  async createOfficeUseRequest(data: CreateOfficeUseRequest): Promise<OfficeUseRequest> {
    const response = await api.post('/inventory/office-use-requests/', data);
    return response;
  },

  async updateOfficeUseRequest(
    id: number,
    data: Partial<CreateOfficeUseRequest>
  ): Promise<OfficeUseRequest> {
    const response = await api.patch(`/inventory/office-use-requests/${id}/`, data);
    return response;
  },

  async deleteOfficeUseRequest(id: number): Promise<void> {
    await api.delete(`/inventory/office-use-requests/${id}/`);
  },

  async submitOfficeUseRequest(id: number): Promise<OfficeUseRequest> {
    const response = await api.post(`/inventory/office-use-requests/${id}/submit/`);
    return response;
  },

  async approveOfficeUseRequest(
    id: number,
    data: OfficeUseRequestActionData
  ): Promise<OfficeUseRequest> {
    const response = await api.post(`/inventory/office-use-requests/${id}/approve/`, data);
    return response;
  },

  async rejectOfficeUseRequest(
    id: number,
    data: OfficeUseRequestActionData
  ): Promise<OfficeUseRequest> {
    const response = await api.post(`/inventory/office-use-requests/${id}/reject/`, data);
    return response;
  },

  async fulfillOfficeUseRequest(id: number): Promise<OfficeUseRequest> {
    const response = await api.post(`/inventory/office-use-requests/${id}/fulfill/`);
    return response;
  },

  async cancelOfficeUseRequest(
    id: number,
    data?: OfficeUseRequestActionData
  ): Promise<OfficeUseRequest> {
    const response = await api.post(`/inventory/office-use-requests/${id}/cancel/`, data || {});
    return response;
  },

  async getSummary(): Promise<OfficeUseRequestSummary> {
    const response = await api.get('/inventory/office-use-requests/summary/');
    return response;
  },

  async checkStock(id: number): Promise<{
    available: boolean;
    can_fulfill: boolean;
    errors: string[];
    items: Array<{
      item_id: number;
      item_name: string;
      sku: string;
      requested: number;
      available: number;
      on_hand: number;
      reserved: number;
      status: 'available' | 'insufficient' | 'not_found';
    }>;
    location: { id: number; name: string; code: string };
  }> {
    const response = await api.get(`/inventory/office-use-requests/${id}/check-stock/`);
    return response;
  },
};

// ============================================
// ACCOUNT LEDGER REPORTS
// ============================================

export const accountLedgerService = {
  async getAccountLedger(
    accountId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
      include_unapproved?: boolean;
    }
  ): Promise<AccountLedger> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.include_unapproved) params.append('include_unapproved', 'true');

    const response = await api.get(`/accounts/ledger/${accountId}/ledger/?${params.toString()}`);
    return response;
  },

  async getMultiAccountLedger(
    accountIds: number[],
    filters?: {
      date_from?: string;
      date_to?: string;
    }
  ): Promise<{
    period: { date_from: string | null; date_to: string | null };
    ledgers: Array<{
      account: { id: number; code: string; name: string; account_type: string };
      entry_count: number;
      closing_balance: number;
    }>;
  }> {
    const params = new URLSearchParams();
    params.append('account_ids', accountIds.join(','));
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);

    const response = await api.get(`/accounts/ledger/multi_account_ledger/?${params.toString()}`);
    return response;
  },
};

// ============================================
// INVENTORY LEDGER REPORTS
// ============================================

export const inventoryLedgerService = {
  async getInventoryLedger(
    itemId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
      location_id?: number;
    }
  ): Promise<InventoryLedger> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.location_id) params.append('location_id', filters.location_id.toString());

    const response = await api.get(`/inventory/ledger/${itemId}/ledger/?${params.toString()}`);
    return response;
  },

  async getMovementsByInvoice(invoiceId: number): Promise<{
    invoice: {
      id: number;
      invoice_number: string;
      invoice_date: string;
      client: { id: number; name: string; client_id: string };
    };
    movements: Array<{
      item: { id: number; name: string; sku: string };
      quantity: number;
      unit_cost: number;
      location: { id: number; name: string } | null;
      movement_date: string;
      created_by: string | null;
    }>;
  }> {
    const response = await api.get(
      `/inventory/ledger/movements_by_invoice/?invoice_id=${invoiceId}`
    );
    return response;
  },

  async getItemLifecycle(
    itemId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
      location_id?: number;
    }
  ): Promise<ItemLifecycleLedger> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.location_id) params.append('location_id', filters.location_id.toString());
    const response = await api.get(`/inventory/ledger/${itemId}/lifecycle/?${params.toString()}`);
    return response;
  },

  async getCostAnalysis(itemId: number): Promise<ItemCostAnalysis> {
    const response = await api.get(`/inventory/ledger/${itemId}/cost_analysis/`);
    return response;
  },
};

// ============================================
// CLIENT STATEMENT OF ACCOUNT
// ============================================

export const clientStatementService = {
  async getStatementOfAccount(
    clientId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
      include_paid?: boolean;
      invoice_type?: 'service' | 'inventory' | 'all';
    }
  ): Promise<ClientStatement> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);
    if (filters?.include_paid !== undefined)
      params.append('include_paid', filters.include_paid.toString());
    if (filters?.invoice_type) params.append('invoice_type', filters.invoice_type);

    const response = await api.get(
      `/clients/statements/${clientId}/statement_of_account/?${params.toString()}`
    );
    return response;
  },

  async getPaymentHistory(
    clientId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
    }
  ): Promise<PaymentHistory> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);

    const response = await api.get(
      `/clients/statements/${clientId}/payment_history/?${params.toString()}`
    );
    return response;
  },

  async getOutstandingInvoices(clientId: number): Promise<OutstandingInvoices> {
    const response = await api.get(`/clients/statements/${clientId}/outstanding_invoices/`);
    return response;
  },

  async getAccountLedger(
    clientId: number,
    filters?: {
      date_from?: string;
      date_to?: string;
    }
  ): Promise<ClientLedger> {
    const params = new URLSearchParams();
    if (filters?.date_from) params.append('date_from', filters.date_from);
    if (filters?.date_to) params.append('date_to', filters.date_to);

    const response = await api.get(
      `/clients/statements/${clientId}/account_ledger/?${params.toString()}`
    );
    return response;
  },
};
