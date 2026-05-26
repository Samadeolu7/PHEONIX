/**
 * PHYSICAL COUNT & INVENTORY VARIANCE TYPES
 *
 * Manages physical inventory counts and variance reporting.
 * Supports complete count lifecycle from creation to adjustment posting.
 */

import { BaseEntity, User } from './common';
import { InventoryItem } from './inventory';
import { Location } from './inventory';

// ================================================================
// ENUMS & CONSTANTS
// ================================================================

/**
 * Physical count status workflow:
 * draft → in_progress → pending_review → approved → posted
 */
export type PhysicalCountStatus =
  | 'draft'
  | 'in_progress'
  | 'pending_review'
  | 'approved'
  | 'posted'
  | 'cancelled';

/**
 * Reasons for inventory variance
 */
export type VarianceReason =
  | 'damaged'
  | 'expired'
  | 'stolen'
  | 'miscount'
  | 'system_error'
  | 'transfer_not_recorded'
  | 'sale_not_recorded'
  | 'other';

// ================================================================
// CORE MODELS
// ================================================================

/**
 * Individual line item in a physical count
 */
export interface PhysicalCountLine extends BaseEntity {
  physical_count: number;
  item: number;
  item_sku?: string;
  item_name?: string;
  item_unit?: string;
  system_quantity: number;
  counted_quantity: number;
  variance: number; // Auto-calculated: counted - system
  variance_percent: number; // Auto-calculated
  variance_value: number; // Auto-calculated: variance * item cost
  variance_reason?: VarianceReason;
  notes?: string;
  adjustment_posted: boolean;
  stock_movement?: number; // Link to created adjustment
}

/**
 * Physical inventory count session
 */
export interface PhysicalCount extends BaseEntity {
  count_number: string; // Auto-generated
  count_date: string; // Date
  location: number;
  location_name?: string;
  status: PhysicalCountStatus;
  counted_by?: number;
  counted_by_name?: string;
  reviewed_by?: number;
  reviewed_by_name?: string;
  reviewed_at?: string; // DateTime
  notes?: string;
  review_notes?: string;

  // Summary fields (computed)
  total_lines?: number;
  total_variance_value?: number;

  // Nested data
  count_lines?: PhysicalCountLine[];
}

// ================================================================
// LIST & FILTER TYPES
// ================================================================

/**
 * Lightweight list view for physical counts
 */
export interface PhysicalCountListItem {
  id: number;
  count_number: string;
  count_date: string;
  location: number;
  location_name?: string;
  status: PhysicalCountStatus;
  counted_by_name?: string;
  total_lines: number;
  total_variance_value: number;
  created_at: string;
}

/**
 * Filters for physical count list
 */
export interface PhysicalCountFilters {
  location?: number;
  status?: PhysicalCountStatus;
  count_date_from?: string;
  count_date_to?: string;
  counted_by?: number;
  search?: string; // Search count_number or notes
}

/**
 * Filters for count lines
 */
export interface PhysicalCountLineFilters {
  physical_count?: number;
  item?: number;
  variance_reason?: VarianceReason;
  has_variance?: boolean; // Only show lines with variance != 0
}

// ================================================================
// FORM & INPUT TYPES
// ================================================================

/**
 * Create/update physical count
 */
export interface PhysicalCountFormData {
  count_date: string;
  location: number;
  counted_by?: number;
  notes?: string;
}

/**
 * Bulk add count lines
 */
export interface PhysicalCountLineCreate {
  item_id: number;
  counted_quantity: number;
  notes?: string;
  variance_reason?: VarianceReason;
}

/**
 * Bulk add lines request
 */
export interface AddLinesRequest {
  lines: PhysicalCountLineCreate[];
}

/**
 * Submit count for review
 */
export interface SubmitCountRequest {
  // No additional data needed
}

/**
 * Approve count
 */
export interface ApproveCountRequest {
  review_notes?: string;
}

/**
 * Reject count
 */
export interface RejectCountRequest {
  review_notes: string; // Required
}

/**
 * Post adjustments
 */
export interface PostAdjustmentsRequest {
  // No additional data needed
  // Creates stock movements for all variance lines
}

// ================================================================
// VARIANCE REPORT TYPES
// ================================================================

/**
 * Variance report filters
 */
export interface VarianceReportFilters {
  location_id?: number;
  category_id?: number;
  variance_reason?: VarianceReason;
  variance_threshold?: number; // Only show variance >= threshold
  date_from?: string;
  date_to?: string;
}

/**
 * Variance category summary
 */
export interface VarianceCategorySummary {
  category_id: number;
  category_name: string;
  total_variance: number;
  total_variance_value: number;
  line_count: number;
}

/**
 * Variance reason summary
 */
export interface VarianceReasonSummary {
  reason: VarianceReason;
  reason_display: string;
  total_variance: number;
  total_variance_value: number;
  line_count: number;
}

/**
 * Variance location summary
 */
export interface VarianceLocationSummary {
  location_id: number;
  location_name: string;
  total_variance: number;
  total_variance_value: number;
  line_count: number;
  count_count: number; // Number of counts
}

/**
 * Single count variance report
 */
export interface PhysicalCountVarianceReport {
  physical_count_id: number;
  count_number: string;
  count_date: string;
  location_name: string;

  summary: {
    total_lines: number;
    variance_lines: number; // Lines with variance != 0
    total_variance_value: number;
    surplus_count: number; // Positive variances
    shortage_count: number; // Negative variances
  };

  by_category: VarianceCategorySummary[];
  by_reason: VarianceReasonSummary[];
  top_variances: PhysicalCountLine[]; // Top 20 by value
}

/**
 * Cross-count variance summary
 */
export interface VarianceSummaryReport {
  summary: {
    total_counts: number;
    total_lines: number;
    total_variance_value: number;
    avg_variance_per_count: number;
  };

  by_location: VarianceLocationSummary[];
  by_category: VarianceCategorySummary[];
  by_reason: VarianceReasonSummary[];
}

// ================================================================
// API RESPONSE TYPES
// ================================================================

/**
 * Response from add_lines action
 */
export interface AddLinesResponse {
  created_count: number;
  total_variance_value: number;
  lines: PhysicalCountLine[];
}

/**
 * Response from submit action
 */
export interface SubmitCountResponse {
  message: string;
  physical_count: PhysicalCount;
}

/**
 * Response from approve action
 */
export interface ApproveCountResponse {
  message: string;
  physical_count: PhysicalCount;
}

/**
 * Response from reject action
 */
export interface RejectCountResponse {
  message: string;
  physical_count: PhysicalCount;
}

/**
 * Response from post_adjustments action
 */
export interface PostAdjustmentsResponse {
  message: string;
  adjustments_posted: number;
  total_value: number;
  physical_count: PhysicalCount;
}
