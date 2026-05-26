// Resource Service
import { api } from './api';
import {
  Resource,
  ResourceListResponse,
  ResourceFilters,
  CreateResourceData,
} from '../types/resources';

class ResourceService {
  // CRUD Operations
  async getResources(params?: ResourceFilters): Promise<ResourceListResponse> {
    const response = await api.get('/expenses/resources/', { params });
    return response;
  }

  async getResource(id: number): Promise<Resource> {
    const response = await api.get(`/expenses/resources/${id}/`);
    return response;
  }

  async createResource(data: CreateResourceData): Promise<Resource> {
    const response = await api.post('/expenses/resources/', data);
    return response;
  }

  async updateResource(id: number, data: Partial<CreateResourceData>): Promise<Resource> {
    const response = await api.put(`/expenses/resources/${id}/`, data);
    return response;
  }

  async partialUpdateResource(id: number, data: Partial<CreateResourceData>): Promise<Resource> {
    const response = await api.patch(`/expenses/resources/${id}/`, data);
    return response;
  }

  async deleteResource(id: number): Promise<void> {
    await api.delete(`/expenses/resources/${id}/`);
  }

  // Additional Endpoints
  async getResourceConsumptionHistory(id: number): Promise<any> {
    const response = await api.get(`/expenses/resources/${id}/consumption_history/`);
    return response;
  }

  async getResourceStatistics(id: number): Promise<any> {
    const response = await api.get(`/expenses/resources/${id}/statistics/`);
    return response;
  }

  async getResourcesByType(): Promise<any> {
    const response = await api.get('/expenses/resources/by_type/');
    return response;
  }

  async getResourcesMenu(): Promise<Resource[]> {
    const response = await api.get('/expenses/resources/menu/');
    return response;
  }

  // Utility Methods
  async getActiveResources(): Promise<Resource[]> {
    const response = await this.getResources({ is_active: true });
    return response.results;
  }

  async getResourcesByTypeFilter(resourceType: string): Promise<Resource[]> {
    const response = await this.getResources({
      resource_type: resourceType,
      is_active: true,
    });
    return response.results;
  }
}

export const resourceService = new ResourceService();
