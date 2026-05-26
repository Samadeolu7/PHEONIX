import axios from 'axios';
import { WidgetConfig } from '../components/widgets/WidgetRenderer';

const API_BASE_URL = '/api';

export type PageData = {
  id: string;
  name: string;
  type: 'dashboard' | 'form' | 'report' | 'normal';
  layout: any;
  widgets: WidgetConfig[];
  metadata: Record<string, any>;
  version: number;
};

export const widgetService = {
  async getPageData(pageSlug: string): Promise<PageData> {
    const response = await axios.get(`${API_BASE_URL}/pages/${pageSlug}`);
    return response.data;
  },

  async getWidgetData(widgetId: string, params?: Record<string, any>) {
    const response = await axios.get(`${API_BASE_URL}/widgets/${widgetId}/data`, {
      params,
    });
    return response.data;
  },

  async updatePageLayout(pageSlug: string, layout: any) {
    const response = await axios.put(`${API_BASE_URL}/pages/${pageSlug}/layout`, {
      layout,
    });
    return response.data;
  },

  async createWidgetDefinition(widgetData: Partial<WidgetConfig>) {
    const response = await axios.post(`${API_BASE_URL}/widgets`, widgetData);
    return response.data;
  },
};

export default widgetService;
