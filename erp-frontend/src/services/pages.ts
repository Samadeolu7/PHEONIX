import { api } from '../api/axios';

export interface Page {
  id: number;
  title: string;
  slug: string;
  description: string;
  layout: Record<string, any>;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  widget_count: number;
}

export const pageService = {
  async getPages() {
    const response = await api.get('/pages/');
    return response.data;
  },

  async getPage(id: number) {
    const response = await api.get(`/pages/${id}/`);
    return response.data;
  },

  async getPageBySlug(slug: string) {
    const response = await api.get(`/pages/${slug}/`);
    return response.data;
  },

  async createPage(data: Partial<Page>) {
    const response = await api.post('/pages/', data);
    return response.data;
  },

  async updatePage(id: number, data: Partial<Page>) {
    const response = await api.put(`/pages/${id}/`, data);
    return response.data;
  },

  async deletePage(id: number) {
    await api.delete(`/pages/${id}/`);
  },

  async clonePage(id: number) {
    const response = await api.post(`/pages/${id}/clone/`);
    return response.data;
  },
};
