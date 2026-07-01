// src/services/entitlementService.ts
import { api } from './api';
import { toDecimal } from '../utils/decimal';

export interface FeeEntitlement {
  id: number;
  client: number;
  client_name: string;
  invoice: number;
  invoice_number: string;
  fee_structure: number;
  fee_structure_name: string;
  academic_period?: {
    year: string;
    term: string;
  };
  payment_term_type: 'full_upfront' | 'minimum_deposit' | 'installments' | 'prepaid_allocation';
  total_amount: string;
  amount_paid: string;
  minimum_required: string;
  balance: string;
  payment_percentage: string;
  meets_minimum_requirement: boolean;
  current_access_level: 'none' | 'partial' | 'full';
  access_rules: {
    minimum_percent: number;
    allowed_services: string[];
    requires_minimum: boolean;
    grace_period_days: number;
    restricted_services: string[];
    full_access_at_percent: number;
  };
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  valid_from: string;
  valid_until: string | null;
  suspended_at: string | null;
  completed_at: string | null;
  allocated_units: string;
  consumed_units: string;
  remaining_units: string;
  inventory_allocation: number | null;
  payment_logs: any[];
  usage_logs: any[];
  status_logs: any[];
  created_at: string;
  updated_at: string;
}

export interface AccessRules {
  requires_minimum: boolean;
  minimum_percent: number;
  full_access_at_percent: number;
  grace_period_days: number;
  allowed_services: string[];
  restricted_services: string[];
}

export interface CreateEntitlementData {
  client: number;
  invoice: number;
  fee_structure: number;
  academic_period?: {
    year: string;
    term: string;
  };
  payment_term_type: 'full_upfront' | 'minimum_deposit' | 'installments' | 'prepaid_allocation';
  total_amount: string;
  minimum_required?: string;
  access_rules?: AccessRules;
}

export interface EntitlementFilters {
  client?: number;
  status?: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  fee_structure?: number;
  current_access_level?: 'none' | 'partial' | 'full';
  search?: string;
  ordering?: string;
  page?: number;
}

export interface ServiceAccessCheck {
  can_access: boolean;
  reason?: string;
  payment_percentage: number;
  amount_paid: string;
  balance: string;
  current_access_level: 'none' | 'partial' | 'full';
  allowed_services: string[];
  restricted_services: string[];
}

export interface UsageLog {
  id: number;
  units_consumed: string;
  remaining_units: string;
  service_code: string;
  usage_date: string;
  location?: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface UsageHistory {
  count: number;
  total_consumed: string;
  remaining: string;
  results: UsageLog[];
}

export interface PaymentData {
  amount: string;
  payment_date: string;
  payment_method?: 'cash' | 'bank_transfer' | 'check' | 'online' | 'other';
  bank_account_id?: number;
  reference?: string;
  notes?: string;
}

export interface EntitlementPaymentData {
  client: number;
  invoice: number;
  fee_structure: number;
  academic_period?: {
    year: string;
    term: string;
  };
  payment_term_type: 'full_upfront' | 'minimum_deposit' | 'installments' | 'prepaid_allocation';
  total_amount: string;
  amount_paid: string;
  minimum_required: string;
  access_rules: {
    minimum_percent: number;
    allowed_services: string[];
    requires_minimum: boolean;
    grace_period_days: number;
    restricted_services: string[];
    full_access_at_percent: number;
  };
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  valid_from: string;
  valid_until: string | null;
  allocated_units: string;
  consumed_units: string;
  inventory_allocation: number | null;
  // Payment specific fields
  amount: string;
  payment_date: string;
  payment_method?: 'cash' | 'bank_transfer' | 'check' | 'online' | 'other';
  reference?: string;
  notes?: string;
}

export const entitlementService = {
  // List entitlements
  async getEntitlements(filters?: EntitlementFilters) {
    return api.get('/incomes/entitlements/', { params: filters });
  },

  // Create entitlement
  async createEntitlement(data: CreateEntitlementData): Promise<FeeEntitlement> {
    return api.post('/incomes/entitlements/', data);
  },

  // Get entitlement detail
  async getEntitlement(id: number): Promise<FeeEntitlement> {
    return api.get(`/incomes/entitlements/${id}/`);
  },

  // Update entitlement
  async updateEntitlement(
    id: number,
    data: Partial<CreateEntitlementData>
  ): Promise<FeeEntitlement> {
    return api.put(`/incomes/entitlements/${id}/`, data);
  },

  // Delete entitlement
  async deleteEntitlement(id: number) {
    return api.delete(`/incomes/entitlements/${id}/`);
  },

  // Check service access (existing method for entitlement ID)
  async checkEntitlementServiceAccess(id: number, service: string): Promise<ServiceAccessCheck> {
    return api.get(`/incomes/entitlements/${id}/can_access/`, {
      params: { service },
    });
  },

  // Record payment on entitlement
  async recordPayment(id: number, data: PaymentData): Promise<FeeEntitlement> {
    // The backend /record_payment/ endpoint uses RecordPaymentSerializer which only
    // reads: amount, payment_date, payment_method, bank_account_id, reference, notes.
    return api.post(`/incomes/entitlements/${id}/record_payment/`, {
      amount: data.amount,
      payment_date: data.payment_date,
      payment_method: data.payment_method,
      bank_account_id: data.bank_account_id,
      reference: data.reference,
      notes: data.notes,
    });
  },

  // Consume units (for prepaid entitlements)
  async consumeUnits(
    id: number,
    data: {
      units: number;
      service_code: string;
      metadata?: Record<string, any>;
    }
  ): Promise<FeeEntitlement> {
    return api.post(`/incomes/entitlements/${id}/consume_units/`, data);
  },

  // Get usage history
  async getUsageHistory(id: number): Promise<UsageHistory> {
    return api.get(`/incomes/entitlements/${id}/usage_logs/`);
  },

  // Suspend entitlement
  async suspendEntitlement(id: number, data: { reason: string }): Promise<FeeEntitlement> {
    return api.post(`/incomes/entitlements/${id}/suspend/`, data);
  },

  // Reactivate entitlement
  async reactivateEntitlement(id: number): Promise<FeeEntitlement> {
    return api.post(`/incomes/entitlements/${id}/reactivate/`, {});
  },

  // Check service access for a client
  async checkServiceAccess(
    clientId: number,
    serviceCode: string
  ): Promise<
    ServiceAccessCheck & {
      required_percentage?: number;
      entitlement_id?: number;
      access_level?: 'none' | 'partial' | 'full';
      restrictions?: string[];
      next_payment_due?: string;
    }
  > {
    try {
      // First, try to get the client's active entitlements
      const entitlements = await this.getEntitlements({
        client: clientId,
        status: 'active',
      });

      if (!entitlements.results || entitlements.results.length === 0) {
        return {
          can_access: false,
          reason: 'No active entitlements found for this client',
          payment_percentage: 0,
          amount_paid: '0',
          balance: '0',
          current_access_level: 'none',
          allowed_services: [],
          restricted_services: [serviceCode],
          access_level: 'none',
          restrictions: ['No active entitlements'],
        };
      }

      // Find the most relevant entitlement for this service
      const relevantEntitlement =
        entitlements.results.find(
          ent =>
            ent.access_rules.allowed_services.includes(serviceCode) ||
            !ent.access_rules.restricted_services.includes(serviceCode)
        ) || entitlements.results[0];

      const paymentPercentage = toDecimal(relevantEntitlement.payment_percentage);
      const requiredPercentage = toDecimal(relevantEntitlement.access_rules.full_access_at_percent || 100);
      const minimumPercentage = toDecimal(relevantEntitlement.access_rules.minimum_percent || 0);

      // Check if service is explicitly restricted
      const isRestricted =
        relevantEntitlement.access_rules.restricted_services.includes(serviceCode);
      const isAllowed = relevantEntitlement.access_rules.allowed_services.includes(serviceCode);

      // Determine access based on payment percentage and service rules
      let canAccess = false;
      let reason = '';
      let restrictions: string[] = [];

      if (relevantEntitlement.status !== 'active') {
        canAccess = false;
        reason = `Entitlement is ${relevantEntitlement.status}`;
        restrictions.push(`Entitlement status: ${relevantEntitlement.status}`);
      } else if (isRestricted && paymentPercentage.lessThan(requiredPercentage)) {
        canAccess = false;
        reason = `Service requires ${requiredPercentage.toFixed(1)}% payment. Current: ${paymentPercentage.toFixed(1)}%`;
        restrictions.push(`Insufficient payment for restricted service`);
      } else if (!isAllowed && !isRestricted && paymentPercentage.lessThan(minimumPercentage)) {
        canAccess = false;
        reason = `Minimum ${minimumPercentage.toFixed(1)}% payment required. Current: ${paymentPercentage.toFixed(1)}%`;
        restrictions.push(`Below minimum payment threshold`);
      } else {
        canAccess = true;
        reason = 'Access granted based on current payment status';
      }

      return {
        can_access: canAccess,
        reason,
        payment_percentage: paymentPercentage.toNumber(),
        required_percentage: requiredPercentage,
        amount_paid: relevantEntitlement.amount_paid,
        balance: relevantEntitlement.balance,
        current_access_level: relevantEntitlement.current_access_level,
        allowed_services: relevantEntitlement.access_rules.allowed_services,
        restricted_services: relevantEntitlement.access_rules.restricted_services,
        entitlement_id: relevantEntitlement.id,
        access_level: relevantEntitlement.current_access_level,
        restrictions,
        next_payment_due: relevantEntitlement.valid_until,
      };
    } catch (error: any) {
      console.error('Service access check failed:', error);

      // Fallback: deny access with error information
      return {
        can_access: false,
        reason: error.response?.data?.message || 'Unable to verify access permissions',
        payment_percentage: 0,
        amount_paid: '0',
        balance: '0',
        current_access_level: 'none',
        allowed_services: [],
        restricted_services: [serviceCode],
        access_level: 'none',
        restrictions: ['Access verification failed'],
      };
    }
  },
};
