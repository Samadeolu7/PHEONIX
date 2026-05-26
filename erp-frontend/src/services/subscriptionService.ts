import { api } from './api';

export interface Subscription {
  id: number;
  tenant_owner: number;
  subscription_product: {
    id: number;
    name: string;
    monthly_price: number;
    max_users?: number;
    max_invoices?: number;
    max_storage_gb?: number;
  };
  billing_frequency: 'monthly' | 'quarterly' | 'yearly';
  status: 'active' | 'suspended' | 'overdue' | 'cancelled';
  start_date: string;
  end_date?: string;
  next_billing_date: string;
  active_users?: number;
  invoices_this_month?: number;
  storage_used_gb?: number;
}

export interface SubscriptionInvoice {
  id: number;
  subscription: number;
  invoice_number: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  due_date: string;
  paid_date?: string;
  period_start: string;
  period_end: string;
}

export interface PaymentSubmission {
  invoice: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  bank_name?: string;
  notes: string;
}

export interface PaymentProof {
  id: number;
  invoice: number;
  amount: number;
  payment_date: string;
  payment_method: string;
  reference_number: string;
  bank_name?: string;
  notes: string;
  status: 'pending' | 'approved' | 'rejected';
  receipt_image?: string;
  requires_proof: boolean;
  rejection_count: number;
  rejection_reason?: string;
  submitted_at: string;
  approved_at?: string;
}

class SubscriptionService {
  /**
   * Get current tenant's subscription
   */
  async getCurrentSubscription(): Promise<Subscription> {
    const response = await api.get('/subscriptions/current/');
    return response.data;
  }

  /**
   * Get unpaid invoices for current tenant
   */
  async getUnpaidInvoices(): Promise<SubscriptionInvoice[]> {
    const response = await api.get('/subscriptions/invoices/unpaid/');
    return response.data;
  }

  /**
   * Get all invoices with optional status filter
   */
  async getInvoices(status?: string): Promise<SubscriptionInvoice[]> {
    const params = status ? { status } : {};
    const response = await api.get('/subscriptions/invoices/', { params });
    return response.data;
  }

  /**
   * Submit payment details (no proof needed initially)
   */
  async submitPayment(payment: PaymentSubmission): Promise<PaymentProof> {
    const response = await api.post('/subscriptions/submit-payment/', payment);
    return response.data;
  }

  /**
   * Upload proof after rejection
   */
  async uploadProof(paymentId: number, receipt: File, notes?: string): Promise<PaymentProof> {
    const formData = new FormData();
    formData.append('receipt_image', receipt);
    if (notes) {
      formData.append('additional_notes', notes);
    }

    const response = await api.post(`/subscriptions/upload-proof/${paymentId}/`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  }

  /**
   * Get payment history
   */
  async getPaymentHistory(subscriptionId: number, limit?: number): Promise<PaymentProof[]> {
    const params = limit ? { limit } : {};
    const response = await api.get(`/subscriptions/${subscriptionId}/payment-history/`, { params });
    return response.data;
  }

  /**
   * Get specific payment proof details
   */
  async getPaymentProof(paymentId: number): Promise<PaymentProof> {
    const response = await api.get(`/subscriptions/payment-proof/${paymentId}/`);
    return response.data;
  }

  /**
   * Cancel pending payment submission
   */
  async cancelPaymentSubmission(paymentId: number): Promise<void> {
    await api.delete(`/subscriptions/payment-proof/${paymentId}/`);
  }
}

export const subscriptionService = new SubscriptionService();
