import { api } from './api';

export interface IncomeCategory {
  id: number;
  name: string;
  code: string;
  description: string;
  is_active: boolean;
}

export type ServiceType = 'standard' | 'inventory_access' | 'hybrid';

export interface ServiceItem {
  id: number;
  name: string;
  code: string;
  description: string;
  category: number;
  category_name: string;
  default_price: string;
  creates_entitlement: boolean;
  entitlement_config: Record<string, any>;
  is_active: boolean;

  // New fields for material request system
  service_type: ServiceType;
  allows_material_requests: boolean;
  material_request_limit?: number | null;
  material_request_config?: Record<string, any> | null;

  created_at: string;
  updated_at: string;
}

export interface CreateServiceItemData {
  name: string;
  code: string;
  description?: string;
  category: number;
  default_price: string;
  creates_entitlement?: boolean;
  entitlement_config?: Record<string, any>;
  is_active?: boolean;

  // New fields for material request system
  service_type?: ServiceType;
  allows_material_requests?: boolean;
  material_request_limit?: number | null;
  material_request_config?: Record<string, any> | null;
}

export interface UpdateServiceItemData extends Partial<CreateServiceItemData> {}

export interface ServiceItemListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ServiceItem[];
}

export interface ServiceItemFilters {
  search?: string;
  is_active?: boolean;
  category?: number;
  page?: number;
  page_size?: number;
  ordering?: string;
}

class ServiceItemService {
  private baseUrl = '/incomes/service-items';

  async getServiceItems(filters?: ServiceItemFilters): Promise<ServiceItemListResponse> {
    const params: Record<string, any> = {};

    if (filters?.search) params.search = filters.search;
    if (filters?.is_active !== undefined) params.is_active = filters.is_active;
    if (filters?.category) params.category = filters.category;
    if (filters?.page) params.page = filters.page;
    if (filters?.page_size) params.page_size = filters.page_size;
    if (filters?.ordering) params.ordering = filters.ordering;

    const response = await api.get(`${this.baseUrl}/`, { params });
    return response as ServiceItemListResponse;
  }

  async getServiceItem(id: number): Promise<ServiceItem> {
    const response = await api.get(`${this.baseUrl}/${id}/`);
    return response as ServiceItem;
  }

  async createServiceItem(data: CreateServiceItemData): Promise<ServiceItem> {
    const response = await api.post(`${this.baseUrl}/`, data);
    return response as ServiceItem;
  }

  async updateServiceItem(id: number, data: UpdateServiceItemData): Promise<ServiceItem> {
    const response = await api.patch(`${this.baseUrl}/${id}/`, data);
    return response as ServiceItem;
  }

  async deleteServiceItem(id: number): Promise<void> {
    await api.delete(`${this.baseUrl}/${id}/`);
  }

  async activateServiceItem(id: number): Promise<ServiceItem> {
    const response = await api.patch(`${this.baseUrl}/${id}/`, { is_active: true });
    return response as ServiceItem;
  }

  async deactivateServiceItem(id: number): Promise<ServiceItem> {
    const response = await api.patch(`${this.baseUrl}/${id}/`, { is_active: false });
    return response as ServiceItem;
  }

  async getIncomeCategories(filters?: { is_active?: boolean }): Promise<IncomeCategory[]> {
    const params: Record<string, any> = {};
    if (filters?.is_active !== undefined) params.is_active = filters.is_active;

    const response = await api.get('/incomes/categories/', { params });

    // Handle both paginated and non-paginated responses
    return Array.isArray(response) ? response : (response?.results ?? []);
  }
}

export const serviceItemService = new ServiceItemService();
