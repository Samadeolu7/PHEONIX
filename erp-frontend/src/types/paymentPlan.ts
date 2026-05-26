export interface PaymentPlan {
  id: number;
  name: string;
  customer: number;
  start_date: string;
  end_date: string;
  frequency: 'monthly' | 'weekly' | 'one_off';
  amount: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}
export type InstallmentStatus = 'pending' | 'paid' | 'partial' | 'overdue' | 'waived';
export type PaymentPlanStatus = 'active' | 'completed' | 'defaulted' | 'cancelled';
export type PaymentFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'custom';

export interface PaymentPlanInstallment {
  id: number;
  payment_plan: number;
  installment_number: number;
  due_date: string;
  amount_due: string;
  amount_paid: string;
  penalty_amount: string;
  balance: string;
  status: InstallmentStatus;
  payment_date: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface PaymentPlan {
  id: number;
  entitlement: number;
  entitlement_id: number;
  client_name: string;
  plan_name: string;
  description: string;
  total_amount: string;
  down_payment: string;
  number_of_installments: number;
  installment_amount: string;
  frequency: PaymentFrequency;
  start_date: string;
  end_date: string;
  status: PaymentPlanStatus;
  late_payment_penalty: string;
  grace_period_days: number;
  installments: PaymentPlanInstallment[];
  created_at: string;
  updated_at: string;
}

export interface PaymentPlanFilters {
  status?: PaymentPlanStatus | string;
  search?: string;
  page?: number;
}

export interface InstallmentFilters {
  status?: InstallmentStatus | string;
  is_overdue?: boolean;
  payment_plan?: number;
  search?: string;
  page?: number;
}
