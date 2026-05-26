// src/services/tenantManagementService.ts
import { api } from './api';

export interface Tenant {
  id: number;
  name: string;
  owner: string;
  slug: string;
  domain_type: 'microfinance' | 'school' | 'hospital' | 'retail' | 'multi';
  domain_type_display: string;
  domain_config: any;
  enabled_features: any;
  custom_labels: any;
  settings: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TenantFilters {
  is_active?: boolean;
  domain_type?: string;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface CreateTenantData {
  name: string;
  slug: string;
  domain_type: 'microfinance' | 'school' | 'hospital' | 'retail' | 'multi';
  domain_config?: any;
  enabled_features?: any;
  custom_labels?: any;
  settings?: any;
  is_active?: boolean;
}

export interface TenantOption {
  id: number;
  name: string;
  slug: string;
  domain_type: string;
  is_active: boolean;
}

export const tenantManagementService = {
  // Get all tenants with filtering
  async getTenants(filters?: TenantFilters) {
    return api.get('/users/tenants/', { params: filters });
  },

  // Get a single tenant by ID
  async getTenant(id: number): Promise<Tenant> {
    return api.get(`/users/tenants/${id}/`);
  },

  // Create a new tenant
  async createTenant(data: CreateTenantData): Promise<Tenant> {
    return api.post('/users/tenants/', data);
  },

  // Update an existing tenant
  async updateTenant(id: number, data: Partial<CreateTenantData>): Promise<Tenant> {
    return api.put(`/users/tenants/${id}/`, data);
  },

  // Partially update a tenant
  async patchTenant(id: number, data: Partial<CreateTenantData>): Promise<Tenant> {
    return api.patch(`/users/tenants/${id}/`, data);
  },

  // Delete a tenant
  async deleteTenant(id: number) {
    return api.delete(`/users/tenants/${id}/`);
  },

  // Get tenants formatted for dropdown selection
  async getTenantOptions(filters?: { is_active?: boolean }): Promise<TenantOption[]> {
    try {
      const response = await this.getTenants({
        ...filters,
        is_active: filters?.is_active !== false, // Default to active tenants only
      });

      const tenants = response.results || [];
      return tenants.map((tenant: Tenant) => ({
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        domain_type: tenant.domain_type_display,
        is_active: tenant.is_active,
      }));
    } catch (error) {
      console.error('Error fetching tenant options:', error);
      // Return demo data as fallback for development
      return [
        {
          id: 1,
          name: 'Main Organization',
          slug: 'main-org',
          domain_type: 'Microfinance Institution',
          is_active: true,
        },
        {
          id: 2,
          name: 'School District',
          slug: 'school-dist',
          domain_type: 'School',
          is_active: true,
        },
        {
          id: 3,
          name: 'Hospital Network',
          slug: 'hospital-net',
          domain_type: 'Hospital',
          is_active: true,
        },
      ];
    }
  },

  // Get domain type options
  getDomainTypeOptions() {
    return [
      { value: 'microfinance', label: 'Microfinance Institution' },
      { value: 'school', label: 'School' },
      { value: 'hospital', label: 'Hospital' },
      { value: 'retail', label: 'Retail Business' },
      { value: 'multi', label: 'Multi-Domain' },
    ];
  },
};
