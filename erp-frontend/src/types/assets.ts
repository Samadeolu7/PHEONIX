/**
 * Fixed Asset Management Types
 * Handles asset register, depreciation, maintenance, and resource consumption
 */

// ============ ENUMS ============

export type AssetStatus = 'draft' | 'active' | 'idle' | 'maintenance' | 'disposed' | 'sold';

export type DepreciationMethod = 'straight_line' | 'declining_balance' | 'units_of_production';

export type MaintenanceType =
  | 'routine'
  | 'repair'
  | 'inspection'
  | 'other'
  | 'preventive'
  | 'corrective'
  | 'overhaul'
  | 'emergency';

// ============ CORE MODELS ============

export interface AssetCategory {
  id: number;
  code: string;
  name: string;
  description: string;
  // GL Accounts
  asset_account: number;
  asset_account_name?: string;
  depreciation_account: number;
  depreciation_account_name?: string;
  accumulated_depreciation_account: number;
  accumulated_depreciation_account_name?: string;
  maintenance_expense_account?: number | null;
  maintenance_expense_account_name?: string | null;
  // Depreciation defaults
  default_depreciation_method: DepreciationMethod;
  default_useful_life_years: number;
  default_salvage_value_percentage: string;
  asset_count?: number;
  is_deleted?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FixedAsset {
  id: number;
  asset_number: string;
  category: number;
  category_name?: string;
  category_details?: AssetCategory;

  // Basic details
  name: string;
  description: string;

  // Identification
  serial_number: string;
  registration_number: string;
  make: string;
  model: string;
  year?: number;

  // Registration
  /** Date the asset was first entered into the register (always set). */
  registered_at: string;
  /** Batch reference: links assets acquired together (same requisition/acquisition). */
  depreciation_batch_id?: string;
  /** Human-readable status label from the server. */
  status_display?: string;

  // Financial — null/zero for draft assets; filled after activation
  purchase_date: string | null;
  purchase_price: string;
  salvage_value: string;
  current_value: string;

  // Depreciation — can be pre-planned on registration; required before depreciation runs
  depreciation_method: DepreciationMethod | '';
  useful_life_years: number | null;
  depreciation_start_date: string | null;
  accumulated_depreciation: string;

  // Computed properties
  depreciable_amount?: string;
  book_value?: string;

  // Per-asset GL sub-ledger — null until this asset's category has been
  // migrated to per-asset tracking (see migrate_category_to_per_asset_accounts).
  // Until then, the asset posts to its category's shared GL accounts.
  account?: number | null;
  account_code?: string | null;
  account_name?: string | null;
  accumulated_depreciation_account?: number | null;
  accumulated_depreciation_account_code?: string | null;
  accumulated_depreciation_account_name?: string | null;

  // Location and assignment
  current_location: string;
  assigned_to: string; // legacy display string
  assigned_to_staff?: number | null; // FK to hr.Staff
  assigned_to_staff_name?: string | null;

  // Status
  status: AssetStatus;

  // Disposal
  disposal_date?: string;
  disposal_amount?: string;
  disposal_notes?: string;
  /** GL journal entry created when this asset was disposed. */
  disposal_journal_entry?: number | null;

  // Metadata
  metadata: Record<string, any>;
  photo?: string;

  // Resource consumption tracking
  current_meter_reading?: string;

  // Timestamps
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface AssetDepreciation {
  id: number;
  asset: number;
  /** Annotated by the serializer — asset_number of the linked asset. */
  asset_number?: string;
  /** Annotated by the serializer — name of the linked asset. */
  asset_name?: string;
  asset_details?: FixedAsset;

  period_start: string;
  period_end: string;
  depreciation_amount: string;

  // Accounting
  is_posted: boolean;
  posted_at?: string;
  posted_by?: number | null;
  posted_by_name?: string | null;
  journal_entry?: number | null;

  created_at: string;
  updated_at: string;
}

export interface AssetMaintenance {
  id: number;
  asset: number;
  asset_number?: string;
  asset_name?: string;
  asset_details?: FixedAsset;

  maintenance_date: string;
  maintenance_type: MaintenanceType;
  description: string;
  cost: string;
  payment_method?: string;

  performed_by: string; // legacy display string
  performed_by_staff?: number | null;
  performed_by_staff_name?: string | null;
  vendor: string;
  next_maintenance_date?: string;

  // Meter reading at time of maintenance
  meter_reading?: string;
  notes: string;

  // Accounting
  is_posted: boolean;
  posted_at?: string;

  created_at: string;
  updated_at: string;
}

export interface ResourceConsumption {
  id: number;
  asset: number;
  asset_details?: FixedAsset;
  resource: number;
  resource_details?: {
    id: number;
    name: string;
    unit_of_measure: string;
  };

  consumption_date: string;

  // Meter readings (odometer, hour meter, etc.)
  previous_reading?: string;
  current_reading: string;
  usage_since_last?: string;

  // Consumption details
  quantity_consumed: string;
  unit_cost: string;
  total_cost: string;

  // Consumption rate (e.g., km/liter)
  consumption_rate?: string;
  expected_rate?: string;
  rate_variance?: string;

  // Flags
  is_irregular: boolean;
  is_posted: boolean;
  posted_at?: string;

  notes: string;
  created_at: string;
  updated_at: string;
}

// ============ REQUEST DTOs ============

export interface CreateAssetCategoryRequest {
  code: string;
  name: string;
  description?: string;
  asset_account: number;
  depreciation_account: number;
  accumulated_depreciation_account: number;
  maintenance_expense_account?: number | null;
  default_depreciation_method: DepreciationMethod;
  default_useful_life_years: number;
  default_salvage_value_percentage: string;
}

export interface CreateFixedAssetRequest {
  asset_number: string;
  category: number;
  name: string;
  description?: string;
  serial_number?: string;
  registration_number?: string;
  make?: string;
  model?: string;
  year?: number;
  /** Optional — filled when asset is acquired via requisition. */
  purchase_date?: string | null;
  /** Optional — 0 for draft shells; set when asset is activated. */
  purchase_price?: string;
  salvage_value?: string;
  /** Optional — inherits from category defaults if blank. */
  depreciation_method?: DepreciationMethod | '';
  useful_life_years?: number | null;
  depreciation_start_date?: string | null;
  current_location?: string;
  assigned_to?: string;
  assigned_to_staff?: number | null;
  status?: AssetStatus;
  metadata?: Record<string, any>;
  photo?: File;
}

export interface UpdateAssetLocationRequest {
  current_location: string;
  assigned_to?: string;
  notes?: string;
}

export interface DisposeAssetRequest {
  disposal_date: string;
  disposal_amount: string;
  disposal_notes?: string;
  /** ID of the bank/cash account that receives the disposal proceeds. Required when disposal_amount > 0 and insurance_claim is false. */
  bank_account_id?: number;
  /** When true, proceeds are recorded as Insurance Claims Receivable instead of Bank/Cash (theft/total-loss scenario with pending insurance payout). */
  insurance_claim?: boolean;
}

export interface CreateAssetDepreciationRequest {
  asset: number;
  period_start: string;
  period_end: string;
  depreciation_amount: string;
}

export interface CreateAssetMaintenanceRequest {
  asset: number;
  maintenance_date: string;
  maintenance_type: MaintenanceType;
  description: string;
  cost: string;
  payment_method?: string;
  performed_by?: string;
  performed_by_staff?: number | null;
  vendor?: string;
  next_maintenance_date?: string;
  meter_reading?: string;
  notes?: string;
}

export interface DisposalSummary {
  purchase_price: number;
  accumulated_depreciation: number;
  book_value: number;
  proceeds: number;
  net_result: number;
  net_result_type: 'gain' | 'loss' | 'break_even';
}

export interface CreateResourceConsumptionRequest {
  asset: number;
  resource: number;
  consumption_date: string;
  previous_reading?: string;
  current_reading: string;
  quantity_consumed: string;
  unit_cost: string;
  notes?: string;
}

// ============ FILTER TYPES ============

export interface AssetFilters {
  category?: number;
  status?: AssetStatus;
  search?: string;
  is_deleted?: boolean;
  ordering?: string;
  page?: number;
  page_size?: number;
}

export interface DepreciationFilters {
  asset?: number;
  is_posted?: boolean;
  ordering?: string;
}

export interface MaintenanceFilters {
  asset?: number;
  maintenance_type?: MaintenanceType;
  is_posted?: boolean;
  ordering?: string;
}

export interface ConsumptionFilters {
  asset?: number;
  resource?: number;
  is_irregular?: boolean;
  is_posted?: boolean;
  ordering?: string;
}

// ============ STATISTICS ============

export interface AssetStatistics {
  total_assets: number;
  total_value: number;
  total_purchase_price: number;
  total_accumulated_depreciation: number;
  by_status: Record<AssetStatus, number>;
  by_category: Record<string, number>;
}

export interface ConsumptionEfficiency {
  current?: number | null;
  average?: number | null;
  best?: number | null;
  worst?: number | null;
  /** 'ok' | 'warning' | 'critical' */
  status?: string;
}

export interface ConsumptionTotals {
  total_quantity: string;
  total_cost: string;
  total_usage: string;
}

// ============ FLEET & FUEL MONITORING ============

export interface VehicleFleetItem {
  id: number;
  asset_number: string;
  name: string;
  registration_number: string;
  make: string;
  model: string;
  year?: number;
  status: AssetStatus;
  current_location: string;
  assigned_to: string;
  current_reading: number | null;
  efficiency: ConsumptionEfficiency;
  period_totals: {
    quantity: number;
    cost: number;
    usage: number;
    fill_count: number;
  };
  has_anomalies: boolean;
  anomaly_status: 'none' | 'warning' | 'critical';
}

export interface VehicleFleetSummaryResponse {
  count: number;
  period_days: number;
  summary: {
    total_fleet_cost: number;
    total_fleet_quantity: number;
    anomaly_count: number;
    active_assets: number;
  };
  fleet: VehicleFleetItem[];
}

export interface AssetConsumptionHistoryItem {
  id: number;
  consumption_number: string;
  consumption_date: string;
  quantity_consumed: number;
  unit_cost: number | null;
  total_cost: number;
  previous_reading: number | null;
  current_reading: number | null;
  usage_since_last: number;
  consumption_rate: number | null;
  payment_flow: 'prepaid' | 'postpaid';
  operator_name: string;
  consumption_location: string;
  is_irregular: boolean;
  irregularity_type: string;
  irregularity_notes: string;
  status: string;
  resource_name: string;
  resource_unit: string;
}

export interface AssetConsumptionHistoryResponse {
  asset: {
    id: number;
    asset_number: string;
    name: string;
    registration_number: string;
    make: string;
    model: string;
    year?: number;
    current_reading: number | null;
  };
  period_days: number;
  totals: {
    quantity: number;
    cost: number;
    usage: number;
  };
  efficiency: ConsumptionEfficiency;
  history: AssetConsumptionHistoryItem[];
}

export interface StaffFuelItem {
  employee_id: number;
  staff_id: string;
  employee_name: string;
  department: string;
  job_title: string;
  total_quantity: number;
  total_cost: number;
  consumption_count: number;
  last_consumption_date: string;
  irregular_count: number;
  has_irregularities: boolean;
}

export interface StaffFuelConsumptionRecord {
  id: number;
  consumption_number: string;
  consumption_date: string;
  employee_name: string;
  department: string;
  quantity_consumed: number;
  unit_cost: number | null;
  total_cost: number;
  payment_flow: 'prepaid' | 'postpaid';
  resource_name: string;
  resource_unit: string;
  consumption_location: string;
  is_irregular: boolean;
  status: string;
}

export interface StaffFuelSummaryResponse {
  period_days: number;
  resource_type: string;
  summary: {
    total_staff_count: number;
    grand_total_quantity: number;
    grand_total_cost: number;
  };
  staff_summary: StaffFuelItem[];
  recent_consumptions: StaffFuelConsumptionRecord[];
}

// ============ API RESPONSE TYPES ============

// ── Batch Depreciation ───────────────────────────────────────────────────────

export interface BatchDepreciationRequest {
  /** ISO date string, e.g. "2026-03-01". Defaults to today on the server. */
  period_date?: string;
  /** If true, generated entries are immediately posted to the GL. Default false. */
  post?: boolean;
  /** Restrict run to a single asset category. */
  category_id?: number;
}

export interface BatchDepreciationResultItem {
  asset_id: number;
  asset_name: string;
  asset_number: string;
  /** "created" | "skipped" | "error" */
  status: 'created' | 'skipped' | 'error';
  // created
  entry_id?: number;
  depreciation_amount?: string;
  auto_posted?: boolean;
  // skipped
  reason?: string;
  // error
  error?: string;
}

export interface BatchDepreciationResponse {
  period_date: string;
  auto_posted: boolean;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  results: BatchDepreciationResultItem[];
}

export interface AssetApiResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

// ============ ASSET ACQUISITION (BULK PURCHASE) ============

export interface AssetAcquisitionLine {
  id: number;
  asset_category: number;
  asset_category_name?: string;
  /** Pre-registered draft FixedAsset this line will activate (PATH A). */
  registered_asset?: number | null;
  registered_asset_name?: string;
  registered_asset_number?: string;
  name: string;
  description: string;
  quantity: number;
  unit_price: string;
  total_price: string;
  /** Override – blank means inherit from category */
  depreciation_method?: DepreciationMethod | '';
  useful_life_years?: number | null;
  salvage_value_percentage?: string | null;
  /** IDs of FixedAsset records created/activated after posting */
  fixed_asset_ids?: number[];
}

export interface AssetAcquisition {
  id: number;
  reference_number: string;
  supplier?: number | null;
  supplier_name?: string | null;
  purchase_date: string;
  payment_terms: string;
  notes: string;
  total_amount: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'posted';
  // submission
  submitted_by?: number | null;
  submitted_by_name?: string | null;
  submitted_at?: string | null;
  // approval
  approved_by_acquisition?: number | null;
  approved_by_acquisition_name?: string | null;
  approved_at_acquisition?: string | null;
  rejection_reason?: string;
  // posting
  purchase_order?: number | null;
  purchase_order_number?: string | null;
  accounts_payable?: number | null;
  accounts_payable_reference?: string | null;
  journal_entry?: number | null;
  posted_by?: number | null;
  posted_by_name?: string | null;
  posted_at?: string | null;
  lines: AssetAcquisitionLine[];
  asset_count?: number;
  asset_ids?: number[];
  created_at: string;
  updated_at: string;
}

export interface CreateAssetAcquisitionLineRequest {
  /** Required when not using registered_asset (direct acquisition PATH B). */
  asset_category?: number;
  /** Link to an existing draft FixedAsset shell to activate (PATH A). */
  registered_asset?: number | null;
  name: string;
  description?: string;
  quantity: number;
  unit_price: string;
  depreciation_method?: string;
  useful_life_years?: number | null;
  salvage_value_percentage?: string | null;
}

export interface CreateAssetAcquisitionRequest {
  supplier: number;
  purchase_date: string;
  payment_terms?: string;
  notes?: string;
  lines: CreateAssetAcquisitionLineRequest[];
}

// ============ ASSET REQUISITION ============

export type AssetRequisitionStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'converted'
  | 'cancelled';

export interface AssetRequisitionLine {
  id: number;
  /** Registered draft FixedAsset this line is procuring. */
  asset: number | null;
  asset_name?: string;
  asset_number?: string;
  /** Auto-derived from asset.category — read-only. */
  asset_category: number | null;
  asset_category_name?: string;
  /** Supplier to purchase this asset from. */
  supplier: number | null;
  supplier_name?: string;
  description: string;
  quantity: number;
  /** The confirmed unit cost for this asset. */
  actual_unit_price: string;
  line_total?: string;
  notes?: string;
  /** True once the asset has been financially activated (GL + AP posted). */
  is_activated: boolean;
}

export interface AssetRequisition {
  id: number;
  ar_number: string;
  requested_by: number;
  requested_by_name?: string;
  department: string;
  request_date: string;
  required_by_date?: string | null;
  purpose: string;
  notes: string;
  status: AssetRequisitionStatus;
  approved_by?: number | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  rejection_reason?: string;
  estimated_total: string;
  acquisition?: number | null;
  acquisition_reference?: string | null;
  approval_chain: Array<{ user: string; action: string; at: string; reason?: string }>;
  items: AssetRequisitionLine[];
  created_at: string;
  updated_at: string;
}

export interface CreateAssetRequisitionLineRequest {
  /** ID of the draft FixedAsset being requisitioned. */
  asset: number;
  /** Supplier to procure from for this line. */
  supplier?: number | null;
  description?: string;
  quantity: number;
  /** Confirmed unit cost. */
  actual_unit_price: string | number;
  notes?: string;
}

export interface CreateAssetRequisitionRequest {
  department?: string;
  request_date?: string;
  required_by_date?: string | null;
  purpose: string;
  notes?: string;
  items: CreateAssetRequisitionLineRequest[];
}

/**
 * Body for POST /api/assets/requisitions/{id}/activate/
 * Activates all draft assets on an approved requisition:
 *  - Sets purchase price, supplier, GL entries, and AP records per supplier.
 */
export interface ActivateAssetRequisitionRequest {
  /** Date of purchase. Defaults to today if omitted. */
  purchase_date?: string;
  /** Payment terms applied to the generated AP records. */
  payment_terms?: string;
}

// ============ ASSET TRANSFER ============

export type AssetTransferStatus = 'pending' | 'acknowledged';

export interface AssetTransfer {
  id: number;
  asset: number;
  asset_number?: string;
  asset_name?: string;
  from_staff?: number | null;
  from_staff_name?: string | null;
  from_location: string;
  to_staff?: number | null;
  to_staff_name?: string | null;
  to_location: string;
  transfer_date: string;
  reason: string;
  notes: string;
  transferred_by?: number | null;
  transferred_by_name?: string | null;
  status: AssetTransferStatus;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateAssetTransferRequest {
  to_staff?: number | null;
  to_location?: string;
  reason?: string;
  notes?: string;
  transfer_date?: string;
}

// ============ ASSET ASSIGNMENT (custody history) ============

export interface AssetAssignment {
  id: number;
  asset: number;
  asset_number?: string;
  asset_name?: string;
  staff?: number | null;
  staff_name: string;
  staff_display?: string | null;
  location: string;
  assigned_date: string;
  unassigned_date?: string | null;
  assigned_by?: number | null;
  assigned_by_name?: string | null;
  notes: string;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}
