import { api } from '../../api/api';

export const apiService = {
  // Fetch dashboard by ID or slug
  async getDashboard(idOrSlug: string) {
    const response = await api.get(`/dashboards/${idOrSlug}/`);
    return response.data?.data || response.data;
  },

  // Get default dashboard
  async getDefaultDashboard() {
    const response = await api.get('/dashboards/default/');
    return response.data?.data || response.data;
  },

  // Create new dashboard
  async createDashboard(dashboardData: any) {
    const response = await api.post('/dashboards/', dashboardData);
    return response.data?.data || response.data;
  },

  // Update existing dashboard
  async updateDashboard(id: string, dashboardData: any) {
    const response = await api.patch(`/dashboards/${id}/`, dashboardData);
    return response.data?.data || response.data;
  },

  // Update dashboard layout (bulk widget update)
  async updateDashboardLayout(slug: string, widgets: any[]) {
    const response = await api.patch(`/dashboards/${slug}/layout/`, { widgets });
    return response.data?.data || response.data;
  },

  // Create widget
  async createWidget(widgetData: any) {
    const response = await api.post('/widgets/', widgetData);
    return response.data?.data || response.data;
  },

  // Update widget
  async updateWidget(id: string, widgetData: any) {
    const response = await api.patch(`/widgets/${id}/`, widgetData);
    return response.data?.data || response.data;
  },

  // Delete widget
  async deleteWidget(id: string) {
    await api.delete(`/widgets/${id}/`);
  },

  // Get module pages for navigation
  async getModulePages() {
    const response = await api.get('/pages/modules/navigation/');
    return response.data?.data || response.data;
  },

  // All dashboards (list)
  async getAllDashboards() {
    const response = await api.get('/dashboards/');
    return response.data?.data || response.data?.results || response.data;
  },
};
