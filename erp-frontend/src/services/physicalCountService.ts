/**
 * PHYSICAL COUNT SERVICE
 *
 * API client for physical inventory count operations.
 * Handles CRUD operations, workflow actions, and variance reporting.
 */

import { api } from './api';
import type {
  PhysicalCount,
  PhysicalCountListItem,
  PhysicalCountLine,
  PhysicalCountFormData,
  PhysicalCountFilters,
  PhysicalCountLineFilters,
  AddLinesRequest,
  AddLinesResponse,
  SubmitCountRequest,
  SubmitCountResponse,
  ApproveCountRequest,
  ApproveCountResponse,
  RejectCountRequest,
  RejectCountResponse,
  PostAdjustmentsRequest,
  PostAdjustmentsResponse,
  PhysicalCountVarianceReport,
  VarianceSummaryReport,
  VarianceReportFilters,
} from '../types/physicalCount';
import type { PaginatedResponse } from '../types/common';

// ================================================================
// PHYSICAL COUNT CRUD OPERATIONS
// ================================================================

/**
 * Get paginated list of physical counts
 */
export const getPhysicalCounts = async (
  filters?: PhysicalCountFilters,
  page = 1,
  pageSize = 20
): Promise<PaginatedResponse<PhysicalCountListItem>> => {
  const params = new URLSearchParams();

  if (filters?.location) params.append('location', filters.location.toString());
  if (filters?.status) params.append('status', filters.status);
  if (filters?.count_date_from) params.append('count_date_from', filters.count_date_from);
  if (filters?.count_date_to) params.append('count_date_to', filters.count_date_to);
  if (filters?.counted_by) params.append('counted_by', filters.counted_by.toString());
  if (filters?.search) params.append('search', filters.search);

  params.append('page', page.toString());
  params.append('page_size', pageSize.toString());

  const response = await api.get(`/inventory/physical-counts/?${params.toString()}`);
  return response.data;
};

/**
 * Get single physical count with all lines
 */
export const getPhysicalCount = async (id: number): Promise<PhysicalCount> => {
  const response = await api.get(`/inventory/physical-counts/${id}/`);
  return response.data;
};

/**
 * Create new physical count
 */
export const createPhysicalCount = async (data: PhysicalCountFormData): Promise<PhysicalCount> => {
  const response = await api.post('/inventory/physical-counts/', data);
  return response.data;
};

/**
 * Update physical count
 */
export const updatePhysicalCount = async (
  id: number,
  data: Partial<PhysicalCountFormData>
): Promise<PhysicalCount> => {
  const response = await api.patch(`/inventory/physical-counts/${id}/`, data);
  return response.data;
};

/**
 * Delete physical count
 */
export const deletePhysicalCount = async (id: number): Promise<void> => {
  await api.delete(`/inventory/physical-counts/${id}/`);
};

// ================================================================
// COUNT LINE OPERATIONS
// ================================================================

/**
 * Get count lines for a physical count
 */
export const getPhysicalCountLines = async (
  filters?: PhysicalCountLineFilters,
  page = 1,
  pageSize = 100
): Promise<PaginatedResponse<PhysicalCountLine>> => {
  const params = new URLSearchParams();

  if (filters?.physical_count) params.append('physical_count', filters.physical_count.toString());
  if (filters?.item) params.append('item', filters.item.toString());
  if (filters?.variance_reason) params.append('variance_reason', filters.variance_reason);
  if (filters?.has_variance !== undefined)
    params.append('has_variance', filters.has_variance.toString());

  params.append('page', page.toString());
  params.append('page_size', pageSize.toString());

  const response = await api.get(`/inventory/physical-count-lines/?${params.toString()}`);
  return response.data;
};

/**
 * Get single count line
 */
export const getPhysicalCountLine = async (id: number): Promise<PhysicalCountLine> => {
  const response = await api.get(`/inventory/physical-count-lines/${id}/`);
  return response.data;
};

/**
 * Update count line
 */
export const updatePhysicalCountLine = async (
  id: number,
  data: Partial<PhysicalCountLine>
): Promise<PhysicalCountLine> => {
  const response = await api.patch(`/inventory/physical-count-lines/${id}/`, data);
  return response.data;
};

/**
 * Delete count line
 */
export const deletePhysicalCountLine = async (id: number): Promise<void> => {
  await api.delete(`/inventory/physical-count-lines/${id}/`);
};

// ================================================================
// BULK OPERATIONS
// ================================================================

/**
 * Bulk add count lines to a physical count
 *
 * Creates multiple count lines at once. For each line:
 * - Fetches system quantity from InventoryStock
 * - Auto-calculates variance (counted - system)
 * - Updates count status to 'in_progress' if was 'draft'
 */
export const addCountLines = async (
  countId: number,
  request: AddLinesRequest
): Promise<AddLinesResponse> => {
  const response = await api.post(`/inventory/physical-counts/${countId}/add_lines/`, request);
  return response.data;
};

// ================================================================
// WORKFLOW ACTIONS
// ================================================================

/**
 * Submit count for review
 *
 * Changes status: draft/in_progress → pending_review
 * Validates: count must have at least one line
 */
export const submitCount = async (
  countId: number,
  request?: SubmitCountRequest
): Promise<SubmitCountResponse> => {
  const response = await api.post(`/inventory/physical-counts/${countId}/submit/`, request || {});
  return response.data;
};

/**
 * Approve count
 *
 * Changes status: pending_review → approved
 * Sets reviewed_by, reviewed_at, and optional review_notes
 */
export const approveCount = async (
  countId: number,
  request?: ApproveCountRequest
): Promise<ApproveCountResponse> => {
  const response = await api.post(`/inventory/physical-counts/${countId}/approve/`, request || {});
  return response.data;
};

/**
 * Reject count
 *
 * Changes status: pending_review → draft
 * Requires review_notes explaining rejection reason
 */
export const rejectCount = async (
  countId: number,
  request: RejectCountRequest
): Promise<RejectCountResponse> => {
  const response = await api.post(`/inventory/physical-counts/${countId}/reject/`, request);
  return response.data;
};

/**
 * Post stock adjustments
 *
 * Creates stock movements for all variance lines:
 * - For each line with variance != 0
 * - Calls InventoryService.adjust_stock()
 * - Creates StockMovement record
 * - Updates InventoryStock quantities
 * - Creates accounting journal entries
 * - Marks adjustments as posted
 * - Changes count status to 'posted'
 *
 * This is the final step that commits variance corrections to the system.
 */
export const postAdjustments = async (
  countId: number,
  request?: PostAdjustmentsRequest
): Promise<PostAdjustmentsResponse> => {
  const response = await api.post(
    `/inventory/physical-counts/${countId}/post_adjustments/`,
    request || {}
  );
  return response.data;
};

// ================================================================
// VARIANCE REPORTING
// ================================================================

/**
 * Get variance report for a single count
 *
 * Returns:
 * - Summary statistics (total lines, variance value, surplus/shortage)
 * - Variance grouped by category
 * - Variance grouped by reason
 * - Top 20 variances by value
 */
export const getVarianceReport = async (countId: number): Promise<PhysicalCountVarianceReport> => {
  const response = await api.get(`/inventory/physical-counts/${countId}/variance_report/`);
  return response.data;
};

/**
 * Get variance summary across multiple counts
 *
 * Aggregates variance data with filtering:
 * - By location, category, reason
 * - Date range filtering
 * - Variance threshold filtering
 *
 * Returns multi-dimensional breakdowns for analysis.
 */
export const getVarianceSummary = async (
  filters?: VarianceReportFilters
): Promise<VarianceSummaryReport> => {
  const params = new URLSearchParams();

  if (filters?.location_id) params.append('location_id', filters.location_id.toString());
  if (filters?.category_id) params.append('category_id', filters.category_id.toString());
  if (filters?.variance_reason) params.append('variance_reason', filters.variance_reason);
  if (filters?.variance_threshold)
    params.append('variance_threshold', filters.variance_threshold.toString());
  if (filters?.date_from) params.append('date_from', filters.date_from);
  if (filters?.date_to) params.append('date_to', filters.date_to);

  const response = await api.get(
    `/inventory/physical-counts/variance_summary/?${params.toString()}`
  );
  return response.data;
};

// ================================================================
// EXPORTS
// ================================================================

const physicalCountService = {
  // CRUD
  getPhysicalCounts,
  getPhysicalCount,
  createPhysicalCount,
  updatePhysicalCount,
  deletePhysicalCount,

  // Count Lines
  getPhysicalCountLines,
  getPhysicalCountLine,
  updatePhysicalCountLine,
  deletePhysicalCountLine,

  // Bulk Operations
  addCountLines,

  // Workflow
  submitCount,
  approveCount,
  rejectCount,
  postAdjustments,

  // Reporting
  getVarianceReport,
  getVarianceSummary,
};

export default physicalCountService;
