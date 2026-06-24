// src/services/clientService.ts
import { api } from './api';
import { clientClassificationService } from './clientClassificationService';

export interface Client {
  id: number;
  client_id: string;
  title: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  full_name: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth?: string;
  age: number;
  place_of_birth?: string;
  classification?: number;
  classification_name: string;
  status: 'active' | 'inactive' | 'suspended' | 'blacklisted';
  risk_level: 'low' | 'medium' | 'high';
  email?: string;
  phone_primary: string;
  phone_secondary?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  address_country?: string;
  id_type?: string;
  id_number?: string;
  id_issue_date?: string;
  id_expiry_date?: string;
  occupation?: string;
  employer_name?: string;
  employer_address?: string;
  employment_status?: string;
  annual_income?: number | null;
  income_source?: string;
  marital_status?: string;
  education_level?: string;
  next_of_kin_name?: string;
  next_of_kin_relationship?: string;
  next_of_kin_phone?: string;
  next_of_kin_email?: string;
  next_of_kin_address?: string;
  bank_name?: string;
  bank_account_name?: string;
  bank_account_number?: string;
  bank_verification_number?: string;
  preferred_language?: string;
  communication_preference?: string;
  marketing_consent?: boolean;

  // Student-specific fields
  admission_number?: string | null;
  admission_date?: string | null;
  class_name?: string | null;
  grade_level?: string | null;
  section?: string | null;
  roll_number?: string | null;
  academic_year?: string | null;
  student_status?: string | null;
  school_house?: string | null;
  state_of_origin?: string | null;
  lga?: string | null;
  proposed_entry_month?: string | null;
  who_pays_fees?: string | null;
  previous_school_name?: string | null;
  previous_school_class?: string | null;
  primary_guardian_name?: string | null;
  primary_guardian_relationship?: string | null;
  primary_guardian_phone?: string | null;
  primary_guardian_email?: string | null;
  primary_guardian_occupation?: string | null;
  primary_guardian_home_address?: string | null;
  primary_guardian_office_address?: string | null;
  secondary_guardian_name?: string | null;
  secondary_guardian_relationship?: string | null;
  secondary_guardian_phone?: string | null;
  secondary_guardian_email?: string | null;
  secondary_guardian_occupation?: string | null;
  secondary_guardian_home_address?: string | null;
  secondary_guardian_office_address?: string | null;
  blood_group?: string | null;
  allergies?: string | null;
  medical_conditions?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_relationship?: string | null;

  // Media
  image?: string | null;
  signature?: string | null;

  // Microfinance-specific
  nin?: string | null;
  account_manager?: number | null;
  account_manager_name?: string | null;
  referral_source?: string | null;
  client_type?: string | null;
  nationality?: string | null;

  // KYC
  kyc_status: 'pending' | 'submitted' | 'verified' | 'rejected';
  kyc_last_update?: string | null;
  last_kyc_check?: string | null;

  // Metadata
  metadata?: Record<string, any>;
  usage_context: 'client' | 'financial' | 'student' | 'patient' | 'customer';
  external_id?: string | null;

  // Related data (usually empty arrays when fetching single client)
  documents?: any[];
  notes?: any[];
  relationships_from?: any[];

  // Timestamps
  created_at: string;
  updated_at: string;

  // Branch info (for multi-branch setups)
  branch?: number | null;
}

export interface ClientFilters {
  status?: 'active' | 'inactive' | 'suspended' | 'blacklisted';
  usage_context?: 'financial' | 'student' | 'patient' | 'customer';
  classification?: number;
  search?: string;
  ordering?: string;
  page?: number;
}

export interface CreateClientData {
  client_id: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth?: string;
  phone_primary: string;
  email?: string;
  status?: 'active' | 'inactive' | 'suspended' | 'blacklisted';
  usage_context: 'client' | 'financial' | 'student' | 'patient' | 'customer';
  classification?: number;
  branch?: number;
}

export interface RegistrationFeePreview {
  client_type: 'dc' | 'wl' | 'ml' | 'pr';
  registration_fee: string;
  id_fee: string;
  total: string;
  registration_income_account: number;
  id_fee_income_account: number;
}

export interface ClientRegistrationConfig {
  id: number;
  registration_income_account: number;
  registration_income_account_name?: string;
  id_fee_income_account: number;
  id_fee_income_account_name?: string;
  daily_registration_fee: string;
  daily_id_fee: string;
  weekly_registration_fee: string;
  weekly_id_fee: string;
  monthly_registration_fee: string;
  monthly_id_fee: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProspectPublicRegistrationPayload {
  branch_code: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  gender: 'male' | 'female' | 'other';
  date_of_birth?: string;
  phone_primary: string;
  email?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
}

// Simple client option for dropdowns
export interface ClientOption {
  id: number;
  name: string;
  client_id: string;
  status: string;
  outstanding_balance?: number;
}

// Classification option for dropdowns
export interface ClassificationOption {
  id: number;
  name: string;
  code: string;
}

// Client group (Ajo / group savings)
export interface ClientGroup {
  id: number;
  name: string;
  group_code: string;
  client_type: string;
  meeting_frequency: string;
  meeting_day: string | null;
  meeting_time: string | null;
  meeting_location: string | null;
  group_leader: number | null;
  group_leader_name: string | null;
  contribution_amount: string;
  target_amount: string;
  is_active: boolean;
  members_count: number;
  created_at: string;
}

export interface ClientGroupPayload {
  name: string;
  group_code?: string;
  client_type?: string;
  meeting_frequency?: string;
  meeting_day?: string | null;
  meeting_time?: string | null;
  meeting_location?: string | null;
  group_leader?: number | null;
  contribution_amount?: string;
  target_amount?: string;
  is_active?: boolean;
}

// ─── Payload sanitization ────────────────────────────────────────────────────
// Fields that live on the form but do NOT exist on the backend model.
const UNKNOWN_CLIENT_FIELDS: string[] = [];

// Optional date fields whose value may be an empty string when the user leaves
// them blank. Django's DateField rejects '' but accepts null.
const CLIENT_DATE_FIELDS = [
  'date_of_birth',
  'id_issue_date',
  'id_expiry_date',
  'admission_date',
] as const;

function sanitizeClientPayload(data: Partial<Client>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...data };
  // Convert empty-string dates to null so DRF accepts them
  CLIENT_DATE_FIELDS.forEach(f => {
    if (result[f] === '') result[f] = null;
  });
  // Strip fields that don't exist on the model
  UNKNOWN_CLIENT_FIELDS.forEach(f => {
    delete result[f];
  });
  return result;
}
// ─────────────────────────────────────────────────────────────────────────────

export const clientService = {
  // Get all clients with filtering
  async getClients(filters?: ClientFilters) {
    return api.get('/clients/clients/', { params: filters });
  },

  // Export all clients (with fee summary) as CSV – single backend query, no pagination
  async exportCsv(filters?: Omit<ClientFilters, 'page'>): Promise<Blob> {
    return api.getBlob('/clients/clients/export-csv/', { params: filters });
  },

  // Get a single client by ID
  async getClient(id: number): Promise<Client> {
    return api.get(`/clients/clients/${id}/`);
  },

  // Create a new client
  async createClient(data: Partial<Client>, imageFile?: File | null): Promise<Client> {
    const cleaned = sanitizeClientPayload(data);
    if (imageFile) {
      const formData = new FormData();
      Object.keys(cleaned).forEach(key => {
        if (key === 'image') return; // skip – appended below as a File
        const value = cleaned[key as keyof typeof cleaned];
        if (value !== undefined && value !== null && value !== '') {
          // Skip arrays and objects – they'd be serialized as "[object Object]"
          if (typeof value === 'object') return;
          formData.append(key, String(value));
        }
      });
      formData.append('image', imageFile);
      return api.postFormData('/clients/clients/', formData);
    }
    return api.post('/clients/clients/', cleaned);
  },

  async createClientWithFeeCollection(
    data: Partial<Client>,
    cashierAccountId?: number,
    imageFile?: File | null
  ): Promise<Client> {
    const cleaned = sanitizeClientPayload(data);
    if (imageFile) {
      const formData = new FormData();
      Object.keys(cleaned).forEach(key => {
        if (key === 'image') return;
        const value = cleaned[key as keyof typeof cleaned];
        if (value !== undefined && value !== null && value !== '') {
          if (typeof value === 'object') return;
          formData.append(key, String(value));
        }
      });
      if (cashierAccountId) {
        formData.append('cashier_account_id', String(cashierAccountId));
      }
      formData.append('image', imageFile);
      return api.postFormData('/clients/clients/', formData);
    }
    const payload: Record<string, unknown> = { ...cleaned };
    if (cashierAccountId) {
      payload.cashier_account_id = cashierAccountId;
    }
    return api.post('/clients/clients/', payload);
  },

  async getRegistrationFeePreview(clientType: 'dc' | 'wl' | 'ml' | 'pr'):
    Promise<RegistrationFeePreview> {
    return api.get('/clients/clients/registration-fee-preview/', {
      params: { client_type: clientType },
    });
  },

  async getRegistrationConfigs(): Promise<ClientRegistrationConfig[]> {
    const response = await api.get('/clients/registration-configs/');
    return response.results || response.data || response;
  },

  async createRegistrationConfig(
    data: Partial<ClientRegistrationConfig>
  ): Promise<ClientRegistrationConfig> {
    return api.post('/clients/registration-configs/', data);
  },

  async updateRegistrationConfig(
    id: number,
    data: Partial<ClientRegistrationConfig>
  ): Promise<ClientRegistrationConfig> {
    return api.patch(`/clients/registration-configs/${id}/`, data);
  },

  async createPublicProspect(
    data: ProspectPublicRegistrationPayload
  ): Promise<{ detail: string; client_id: string; client_type: string }> {
    return api.post('/clients/prospects/public-register/', data);
  },

  async convertProspect(
    clientId: number,
    payload: { client_type: 'dc' | 'wl' | 'ml'; cashier_account_id?: number }
  ): Promise<Client> {
    return api.post(`/clients/clients/${clientId}/convert-prospect/`, payload);
  },

  // Update an existing client
  async updateClient(id: number, data: Partial<Client>, imageFile?: File | null): Promise<Client> {
    const cleaned = sanitizeClientPayload(data);
    if (imageFile) {
      const formData = new FormData();
      Object.keys(cleaned).forEach(key => {
        if (key === 'image') return; // skip – appended below as a File
        const value = cleaned[key as keyof typeof cleaned];
        if (value !== undefined && value !== null && value !== '') {
          // Skip arrays and objects – they'd be serialized as "[object Object]"
          if (typeof value === 'object') return;
          formData.append(key, String(value));
        }
      });
      formData.append('image', imageFile);
      return api.patchFormData(`/clients/clients/${id}/`, formData);
    }
    return api.patch(`/clients/clients/${id}/`, cleaned);
  },

  // Delete a client
  async deleteClient(id: number) {
    return api.delete(`/clients/clients/${id}/`);
  },

  // Get clients formatted for dropdown selection
  async getClientOptions(filters?: {
    status?: string;
    usage_context?: string;
  }): Promise<ClientOption[]> {
    try {
      // Fetch up to 1000 records to ensure all clients appear in dropdowns.
      // The backend honours `page_size` as a query param in DRF's PageNumberPagination.
      const response = await this.getClients({
        ...filters,
        status: (filters?.status as any) || 'active', // Only active clients by default
        page_size: 1000,
      } as any);

      const clients = response.results || [];
      return clients.map((client: Client) => ({
        id: client.id,
        name: client.full_name,
        client_id: client.client_id,
        status: client.status,
      }));
    } catch (error) {
      console.error('Error fetching client options:', error);
      return [];
    }
  },

  // Get clients with outstanding balances (for payment recording)
  async getClientsWithOutstandingBalances(): Promise<ClientOption[]> {
    try {
      const clientOptions = await this.getClientOptions({ status: 'active' });
      return clientOptions;
    } catch (error) {
      console.error('Error fetching clients with balances:', error);
      return [];
    }
  },

  // Get client classifications for dropdown selection
  async getClassifications(): Promise<ClassificationOption[]> {
    try {
      const response = await clientClassificationService.getClassifications();
      const classifications = response.results || [];
      return classifications.map(classification => ({
        id: classification.id,
        name: classification.name,
        code: classification.code,
      }));
    } catch (error) {
      console.error('Error fetching classifications:', error);
      return [];
    }
  },

  // ===== CLIENT GROUPS (Ajo / Group Savings) =====

  async listClientGroups(params?: {
    search?: string;
    client_type?: string;
    is_active?: boolean;
  }): Promise<ClientGroup[]> {
    const res = await api.get('/clients/groups/', { params });
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  async getClientGroup(id: number): Promise<ClientGroup> {
    return api.get(`/clients/groups/${id}/`);
  },

  async createClientGroup(data: ClientGroupPayload): Promise<ClientGroup> {
    return api.post('/clients/groups/', data);
  },

  async updateClientGroup(id: number, data: Partial<ClientGroupPayload>): Promise<ClientGroup> {
    return api.patch(`/clients/groups/${id}/`, data);
  },

  async deleteClientGroup(id: number): Promise<void> {
    return api.delete(`/clients/groups/${id}/`);
  },

  async assignOfficerToGroup(
    groupId: number,
    officerId: number | null,
  ): Promise<{ detail: string; updated_clients: number; officer_id?: number; officer_name?: string }> {
    return api.post(`/clients/groups/${groupId}/assign-officer/`, { officer_id: officerId });
  },

  async activateClient(id: number): Promise<{ success: boolean; status: string }> {
    return api.post(`/clients/clients/${id}/activate/`, {});
  },

  async deactivateClient(id: number): Promise<{ success: boolean; status: string }> {
    return api.post(`/clients/clients/${id}/deactivate/`, {});
  },

  // ===== MICROFINANCE FEATURES =====

  // Feature #6 — NIN duplicate check across all branches
  async ninCheck(nin: string): Promise<{ exists: boolean; branch?: string; client_id?: string }> {
    return api.get('/clients/clients/nin-check/', { params: { nin } });
  },

  // Feature #4 — Audit log for a client (all roles, read-only)
  async getAuditLog(clientId: number): Promise<any[]> {
    const res = await api.get(`/clients/clients/${clientId}/audit-log/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },

  // Feature #6 — Cross-branch loan history via NIN (BM+ only)
  async getCrossBranchHistory(clientId: number): Promise<any[]> {
    const res = await api.get(`/clients/clients/${clientId}/cross-branch-history/`);
    return Array.isArray(res) ? res : (res?.results ?? []);
  },
};
