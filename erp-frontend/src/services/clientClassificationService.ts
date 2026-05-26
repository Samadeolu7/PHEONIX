import { apiClient } from './api/apiClient';

export interface ClientClassification {
  id: number;
  name: string;
  code: string;
  description: string;
  priority_level: number;
  credit_limit: string;
  special_rates: string;
  created_at: string;
  updated_at: string;
}

export interface ClientClassificationFormData {
  name: string;
  code: string;
  description: string;
  priority_level: number;
  credit_limit: string;
  special_rates: string;
}

export interface ClientClassificationListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: ClientClassification[];
}

export interface ClientClassificationQueryParams {
  ordering?: string;
  page?: number;
  search?: string;
}

class ClientClassificationService {
  private baseUrl = '/clients/classifications';

  async getClassifications(
    params?: ClientClassificationQueryParams
  ): Promise<ClientClassificationListResponse> {
    const queryParams = new URLSearchParams();

    if (params?.ordering) {
      queryParams.append('ordering', params.ordering);
    }
    if (params?.page) {
      queryParams.append('page', params.page.toString());
    }
    if (params?.search) {
      queryParams.append('search', params.search);
    }

    const url = queryParams.toString()
      ? `${this.baseUrl}/?${queryParams.toString()}`
      : `${this.baseUrl}/`;

    return await apiClient.get<ClientClassificationListResponse>(url);
  }

  async getClassification(id: number): Promise<ClientClassification> {
    return await apiClient.get<ClientClassification>(`${this.baseUrl}/${id}/`);
  }

  async createClassification(data: ClientClassificationFormData): Promise<ClientClassification> {
    return await apiClient.post<ClientClassification>(`${this.baseUrl}/`, data);
  }

  async updateClassification(
    id: number,
    data: ClientClassificationFormData
  ): Promise<ClientClassification> {
    return await apiClient.put<ClientClassification>(`${this.baseUrl}/${id}/`, data);
  }

  async deleteClassification(id: number): Promise<void> {
    await apiClient.delete(`${this.baseUrl}/${id}/`);
  }
}

export const clientClassificationService = new ClientClassificationService();
