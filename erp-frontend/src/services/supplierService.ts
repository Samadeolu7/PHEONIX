// src/services/supplierService.ts
import { api } from './api';

export interface Supplier {
  id: number;
  supplier_code: string;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
  address: string;
  tax_id: string;
  payment_terms: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  credit_limit: string; // Decimal string
  outstanding_balance: string; // Decimal string - total amount owed to supplier (from AP invoices only)
  account: number | null; // GL account id for this supplier's own subledger (invoices + advances + payments)
  current_balance: string | null; // Decimal string - real-time balance of `account`, the true supplier statement balance
  is_active: boolean;
  metadata: any; // Additional supplier information
  created_at: string;
  updated_at: string;
}

export interface CreateSupplierData {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  payment_terms?: 'cash' | 'net_15' | 'net_30' | 'net_60' | 'net_90' | 'custom';
  credit_limit?: string;
  is_active?: boolean;
  metadata?: any;
}

export interface SupplierListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Supplier[];
}

class SupplierService {
  // Supplier CRUD operations
  async getSuppliers(params?: {
    search?: string;
    is_active?: boolean;
    page?: number;
    page_size?: number;
    ordering?: string;
  }): Promise<SupplierListResponse> {
    const response = await api.get('/procurement/suppliers/', { params });
    return response;
  }

  async getAllSuppliers(params?: {
    search?: string;
    is_active?: boolean;
    ordering?: string;
    page_size?: number;
  }): Promise<Supplier[]> {
    const all: Supplier[] = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.getSuppliers({
        ...params,
        page,
        page_size: params?.page_size ?? 500,
      });
      all.push(...(response.results || []));
      hasMore = !!response.next;
      page += 1;
    }

    return all;
  }

  async getSupplier(id: number): Promise<Supplier> {
    const response = await api.get(`/procurement/suppliers/${id}/`);
    return response;
  }

  async createSupplier(data: CreateSupplierData): Promise<Supplier> {
    const response = await api.post('/procurement/suppliers/', data);
    return response;
  }

  async updateSupplier(id: number, data: Partial<CreateSupplierData>): Promise<Supplier> {
    const response = await api.patch(`/procurement/suppliers/${id}/`, data);
    return response;
  }

  async deleteSupplier(id: number): Promise<void> {
    await api.delete(`/procurement/suppliers/${id}/`);
  }

  async activateSupplier(id: number): Promise<void> {
    await api.post(`/procurement/suppliers/${id}/activate/`, {});
  }

  async deactivateSupplier(id: number): Promise<void> {
    await api.post(`/procurement/suppliers/${id}/deactivate/`, {});
  }

  // Supplier Document operations
  async getSupplierDocuments(
    supplierId: number,
    params?: { category?: string }
  ): Promise<SupplierDocument[]> {
    const response = await api.get('/procurement/supplier-documents/', {
      params: { supplier: supplierId, ...params },
    });
    return response.results ?? response;
  }

  async uploadSupplierDocument(data: FormData): Promise<SupplierDocument> {
    const response = await api.post('/procurement/supplier-documents/', data);
    return response;
  }

  async deleteSupplierDocument(id: number): Promise<void> {
    await api.delete(`/procurement/supplier-documents/${id}/`);
  }

  async getDocumentCategories(): Promise<{ value: string; label: string }[]> {
    const response = await api.get('/procurement/supplier-documents/categories/');
    return response;
  }
}

export interface SupplierDocument {
  id: number;
  supplier: number;
  supplier_name: string;
  title: string;
  category: string;
  category_display: string;
  file: string;
  description: string;
  expiry_date: string | null;
  is_expired: boolean;
  uploaded_by: number | null;
  uploaded_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export const supplierService = new SupplierService();
