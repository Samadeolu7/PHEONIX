import {
  Payslip,
  PayslipsResponse,
  GeneratePDFResponse,
  EmailPayslipRequest,
  EmailPayslipResponse,
} from '../types/payslip';
import { api } from './api';
import { tokenManager } from './tokenManager';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '/api';

export const payslipService = {
  async getPayslips(params?: {
    payroll?: number;
    staff?: number;
    page?: number;
    page_size?: number;
  }): Promise<PayslipsResponse> {
    const response = await api.get('/hr/payslips/', { params });
    return response;
  },

  async getPayslip(id: number): Promise<Payslip> {
    const response = await api.get(`/hr/payslips/${id}/`);
    return response;
  },

  async generatePDF(id: number): Promise<GeneratePDFResponse> {
    const response = await api.post(`/hr/payslips/${id}/generate_pdf/`, {});
    return response;
  },

  async downloadPDF(id: number, filename?: string): Promise<void> {
    const { accessToken } = tokenManager.getTokens();

    // Show a progress-style delay tolerance: use fetch so we can stream the blob
    const response = await fetch(`${BASE_URL}/hr/payslips/${id}/download/`, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    if (!response.ok) {
      let serverMsg = `HTTP ${response.status}`;
      try {
        const errBody = await response.json();
        serverMsg = errBody?.error || errBody?.detail || serverMsg;
      } catch {
        /* non-JSON body */
      }
      throw new Error(serverMsg);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `payslip-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  },

  async emailPayslip(id: number, data: EmailPayslipRequest): Promise<EmailPayslipResponse> {
    const response = await api.post(`/hr/payslips/${id}/email/`, data);
    return response;
  },
};
