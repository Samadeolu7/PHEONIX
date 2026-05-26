// Resource Management Types
export interface Resource {
  id: number;
  resource_code: string;
  name: string;
  description?: string;
  resource_type:
    | 'fuel'
    | 'electricity'
    | 'water'
    | 'gas'
    | 'telecom'
    | 'service'
    | 'consumable'
    | 'other';
  unit_of_measure: string;
  default_tracking_method?: 'odometer' | 'meter' | 'hours' | 'cycles' | 'quantity' | 'none';
  default_unit_cost?: string; // Decimal as string
  default_supplier?: number | null;
  default_supplier_name?: string;
  expense_category: number;
  expense_category_name?: string;
  expense_account_name?: string;
  is_service?: boolean;
  service_contract_number?: string;
  service_frequency?: string;
  enable_irregularity_detection?: boolean;
  variance_threshold_percentage?: string;
  min_efficiency?: string | null;
  max_efficiency?: string | null;
  max_daily_usage?: string | null;
  is_active?: boolean;
  metadata?: Record<string, any>;
  total_consumption_30days?: string;
  consumption_count_30days?: string;
  branch?: number | null;
  owner?: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceData {
  resource_code: string;
  name: string;
  description?: string;
  resource_type:
    | 'fuel'
    | 'electricity'
    | 'water'
    | 'gas'
    | 'telecom'
    | 'service'
    | 'consumable'
    | 'other';
  unit_of_measure: string;
  default_tracking_method?: 'odometer' | 'meter' | 'hours' | 'cycles' | 'quantity' | 'none';
  default_unit_cost?: string;
  default_supplier?: number | null;
  expense_category: number;
  is_service?: boolean;
  service_contract_number?: string;
  service_frequency?: string;
  enable_irregularity_detection?: boolean;
  variance_threshold_percentage?: string;
  min_efficiency?: string | null;
  max_efficiency?: string | null;
  max_daily_usage?: string | null;
  is_active?: boolean;
  metadata?: Record<string, any>;
}

export interface ResourceListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Resource[];
}

export interface ResourceFilters {
  search?: string;
  resource_type?: string;
  is_active?: boolean;
  is_service?: boolean;
  default_supplier?: number;
  page?: number;
  ordering?: string;
}
