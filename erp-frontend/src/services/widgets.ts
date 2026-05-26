import { api } from '../api/axios';

export interface WidgetDefinition {
  id: number;
  code: string;
  name: string;
  description: string;
  schema: Record<string, any>;
  default_config: Record<string, any>;
  refresh_interval: number;
}

export interface WidgetInstance {
  id: number;
  definition: number | WidgetDefinition;
  page: number;
  title: string;
  position: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  configuration: Record<string, any>;
  refresh_interval: number | null;
  last_refresh: string | null;
}

export const widgetService = {
  // Definition endpoints
  async getDefinitions() {
    const response = await api.get('/widgets/definitions/');
    return response.data;
  },

  async getDefinition(id: number) {
    const response = await api.get(`/widgets/definitions/${id}/`);
    return response.data;
  },

  async createDefinition(data: Partial<WidgetDefinition>) {
    const response = await api.post('/widgets/definitions/', data);
    return response.data;
  },

  async updateDefinition(id: number, data: Partial<WidgetDefinition>) {
    const response = await api.put(`/widgets/definitions/${id}/`, data);
    return response.data;
  },

  async deleteDefinition(id: number) {
    await api.delete(`/widgets/definitions/${id}/`);
  },

  async previewDefinition(id: number, config: Record<string, any>) {
    const response = await api.post(`/widgets/definitions/${id}/preview/`, { config });
    return response.data;
  },

  // Instance endpoints
  async getInstances(pageId?: number) {
    const params = pageId ? { page: pageId } : undefined;
    const response = await api.get('/widgets/instances/', { params });
    return response.data;
  },

  async getInstance(id: number) {
    const response = await api.get(`/widgets/instances/${id}/`);
    return response.data;
  },

  async createInstance(data: Partial<WidgetInstance>) {
    const response = await api.post('/widgets/instances/', data);
    return response.data;
  },

  async updateInstance(id: number, data: Partial<WidgetInstance>) {
    const response = await api.put(`/widgets/instances/${id}/`, data);
    return response.data;
  },

  async deleteInstance(id: number) {
    await api.delete(`/widgets/instances/${id}/`);
  },

  async refreshInstance(id: number) {
    const response = await api.post(`/widgets/instances/${id}/refresh/`);
    return response.data;
  },

  // Widget data helpers
  async getWidgetData(instanceId: number) {
    const instance = await this.getInstance(instanceId);
    if (instance.last_refresh) {
      return instance.data;
    }
    const refresh = await this.refreshInstance(instanceId);
    return refresh.data;
  },
};
