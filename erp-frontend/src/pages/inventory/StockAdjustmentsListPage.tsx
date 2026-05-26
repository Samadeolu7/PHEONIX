import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowUpDown,
  Calendar,
  TrendingUp,
  TrendingDown,
  Package,
  User,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { useStockAdjustments } from '../../hooks/useInventory';

// Adjustment type display mapping
const ADJUSTMENT_TYPE_LABELS = {
  increase: 'Stock Increase',
  decrease: 'Stock Decrease',
};

const ADJUSTMENT_TYPE_COLORS = {
  increase: 'bg-green-100 text-green-800',
  decrease: 'bg-red-100 text-red-800',
};

// Status display mapping
const STATUS_LABELS = {
  pending: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  executed: 'Executed',
};

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  rejected: 'bg-red-100 text-red-800',
  executed: 'bg-green-100 text-green-800',
};

const STATUS_ICONS = {
  pending: Clock,
  approved: CheckCircle,
  rejected: XCircle,
  executed: CheckCircle,
};

export default function StockAdjustmentsListPage() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [ordering, setOrdering] = useState('-created_at');
  const [statusFilter, setStatusFilter] = useState('');
  const [adjustmentTypeFilter, setAdjustmentTypeFilter] = useState('');
  const [page, setPage] = useState(1);

  // Build query parameters - only send parameters with actual values
  const queryParams: any = {};
  if (searchTerm.trim()) queryParams.search = searchTerm;
  if (ordering && ordering !== '-created_at') queryParams.ordering = ordering;
  if (statusFilter) queryParams.status = statusFilter;
  if (adjustmentTypeFilter) queryParams.adjustment_type = adjustmentTypeFilter;
  if (page > 1) queryParams.page = page;

  const {
    data: adjustmentsData,
    isLoading,
    error,
  } = useStockAdjustments(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const adjustments = adjustmentsData?.results || [];
  const totalPages = Math.ceil((adjustmentsData?.count || 0) / 20);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error loading stock adjustments: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Adjustments</h1>
          <p className="text-gray-600">Track and manage all stock adjustment requests</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/inventory/adjustments/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Adjustment
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-lg font-semibold text-gray-900">
                {adjustments.filter(adj => adj.status === 'pending').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Approved</p>
              <p className="text-lg font-semibold text-gray-900">
                {adjustments.filter(adj => adj.status === 'approved').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Executed</p>
              <p className="text-lg font-semibold text-gray-900">
                {adjustments.filter(adj => adj.status === 'executed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center">
            <div className="p-2 bg-gray-100 rounded-lg">
              <Package className="w-5 h-5 text-gray-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total</p>
              <p className="text-lg font-semibold text-gray-900">{adjustments.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search adjustments..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="executed">Executed</option>
            </select>
          </div>

          <div>
            <select
              value={adjustmentTypeFilter}
              onChange={e => setAdjustmentTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="increase">Stock Increase</option>
              <option value="decrease">Stock Decrease</option>
            </select>
          </div>

          <div>
            <div className="relative">
              <ArrowUpDown className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <select
                value={ordering}
                onChange={e => setOrdering(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="-created_at">Newest First</option>
                <option value="created_at">Oldest First</option>
                <option value="request_number">Request Number</option>
                <option value="-request_number">Request Number (Desc)</option>
                <option value="item_name">Item Name</option>
                <option value="-item_name">Item Name (Desc)</option>
                <option value="status">Status</option>
                <option value="-status">Status (Desc)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Adjustments Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading adjustments...</p>
          </div>
        ) : adjustments.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No stock adjustments found</p>
            <p className="text-sm text-gray-500 mt-1">
              {searchTerm || statusFilter || adjustmentTypeFilter
                ? 'Try adjusting your filters'
                : 'Create your first stock adjustment to get started'}
            </p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item & Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type & Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Requested By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reason
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {adjustments.map(adjustment => {
                  const StatusIcon = STATUS_ICONS[adjustment.status] || AlertTriangle;

                  return (
                    <tr
                      key={adjustment.id}
                      className="hover:bg-gray-50 cursor-pointer"
                      onClick={() => navigate(`/inventory/adjustments/${adjustment.id}`)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {adjustment.request_number}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(adjustment.created_at).toLocaleDateString()}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(adjustment.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {adjustment.item_name}
                          </div>
                          <div className="text-xs text-gray-500">SKU: {adjustment.item_sku}</div>
                          <div className="text-xs text-gray-500">📍 {adjustment.location_name}</div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {adjustment.adjustment_type === 'increase' ? (
                            <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-600 mr-2" />
                          )}
                          <div>
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                ADJUSTMENT_TYPE_COLORS[adjustment.adjustment_type] ||
                                'bg-gray-100 text-gray-800'
                              }`}
                            >
                              {ADJUSTMENT_TYPE_LABELS[adjustment.adjustment_type] ||
                                adjustment.adjustment_type}
                            </span>
                            <div
                              className={`text-sm font-medium mt-1 ${
                                adjustment.adjustment_type === 'increase'
                                  ? 'text-green-600'
                                  : 'text-red-600'
                              }`}
                            >
                              {adjustment.adjustment_type === 'increase' ? '+' : '-'}
                              {adjustment.quantity}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          {adjustment.unit_cost && (
                            <div className="text-sm text-gray-900">
                              Unit: ₦{parseFloat(adjustment.unit_cost).toLocaleString()}
                            </div>
                          )}
                          <div className="text-sm font-medium text-gray-900">
                            Total: ₦{parseFloat(adjustment.estimated_cost).toLocaleString()}
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <StatusIcon className="w-4 h-4 mr-2" />
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                              STATUS_COLORS[adjustment.status] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {STATUS_LABELS[adjustment.status] || adjustment.status}
                          </span>
                        </div>
                        {adjustment.approved_by_name && (
                          <div className="text-xs text-gray-500 mt-1">
                            By: {adjustment.approved_by_name}
                          </div>
                        )}
                        {adjustment.approved_at && (
                          <div className="text-xs text-gray-500">
                            {new Date(adjustment.approved_at).toLocaleDateString()}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <div>
                            <div className="text-sm text-gray-900">
                              {adjustment.requested_by_name}
                            </div>
                            <div className="text-xs text-gray-500">
                              ID: {adjustment.requested_by}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4">
                        <div
                          className="text-sm text-gray-900 max-w-xs truncate"
                          title={adjustment.reason}
                        >
                          {adjustment.reason}
                        </div>
                        {adjustment.notes && (
                          <div
                            className="text-xs text-gray-500 mt-1 max-w-xs truncate"
                            title={adjustment.notes}
                          >
                            Notes: {adjustment.notes}
                          </div>
                        )}
                        {adjustment.approval_notes && (
                          <div
                            className="text-xs text-blue-600 mt-1 max-w-xs truncate"
                            title={adjustment.approval_notes}
                          >
                            Approval: {adjustment.approval_notes}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Showing {(page - 1) * 20 + 1} to{' '}
                  {Math.min(page * 20, adjustmentsData?.count || 0)} of{' '}
                  {adjustmentsData?.count || 0} adjustments
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(page - 1)}
                    disabled={page === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(page + 1)}
                    disabled={page === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
