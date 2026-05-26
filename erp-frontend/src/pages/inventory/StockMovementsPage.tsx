import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowUpDown,
  Calendar,
  TrendingUp,
  TrendingDown,
  Package,
} from 'lucide-react';
import { useStockMovements } from '../../hooks/useInventory';
import type { MovementType } from '../../services/inventoryService';

// Movement type display mapping
const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  purchase: 'Purchase Receipt',
  sale: 'Sales Delivery',
  adjustment: 'Stock Adjustment',
  transfer: 'Transfer',
  return_in: 'Purchase Return',
  return_out: 'Sales Return',
  write_off: 'Write Off',
  production_in: 'Production Receipt',
  production_out: 'Production Issue',
};

const MOVEMENT_TYPE_COLORS: Record<MovementType, string> = {
  purchase: 'bg-green-100 text-green-800',
  sale: 'bg-red-100 text-red-800',
  adjustment: 'bg-yellow-100 text-yellow-800',
  transfer: 'bg-blue-100 text-blue-800',
  return_in: 'bg-purple-100 text-purple-800',
  return_out: 'bg-orange-100 text-orange-800',
  write_off: 'bg-gray-100 text-gray-800',
  production_in: 'bg-emerald-100 text-emerald-800',
  production_out: 'bg-rose-100 text-rose-800',
};

export default function StockMovementsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [ordering, setOrdering] = useState('owner');
  const [page, setPage] = useState(1);

  // Build query parameters - only send parameters with actual values
  const queryParams: any = {};
  if (searchTerm.trim()) queryParams.search = searchTerm;
  if (ordering && ordering !== 'owner') queryParams.ordering = ordering; // Only send if different from default
  if (page > 1) queryParams.page = page;

  const {
    data: movementsData,
    isLoading,
    error,
  } = useStockMovements(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const movements = movementsData?.results || [];
  // Filter out adjustment movements since they have their own dedicated page
  const filteredMovements = movements.filter(movement => movement.movement_type !== 'adjustment');
  const totalPages = Math.ceil((movementsData?.count || 0) / 20);

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">Error loading stock movements: {error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Movements</h1>
          <p className="text-gray-600">Track inventory movements excluding adjustments</p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/inventory/adjustments"
            className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            View Adjustments
          </Link>
          <Link
            to="/inventory/adjustments/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Stock Adjustment
          </Link>
          <Link
            to="/inventory/transfers/create"
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Transfer Stock
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input
                type="text"
                placeholder="Search movements..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <div className="relative">
              <ArrowUpDown className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <select
                value={ordering}
                onChange={e => setOrdering(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="owner">Default (Owner)</option>
                <option value="created_by">Created By</option>
                <option value="-created_by">Created By (Desc)</option>
                <option value="branch">Branch</option>
                <option value="-branch">Branch (Desc)</option>
                <option value="item">Item</option>
                <option value="-item">Item (Desc)</option>
                <option value="from_location">From Location</option>
                <option value="-from_location">From Location (Desc)</option>
                <option value="to_location">To Location</option>
                <option value="-to_location">To Location (Desc)</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading movements...</p>
          </div>
        ) : filteredMovements.length === 0 ? (
          <div className="p-8 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No stock movements found</p>
          </div>
        ) : (
          <>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Time
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reference
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMovements.map(movement => (
                  <tr key={movement.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <div className="text-sm text-gray-900">
                            {movement.movement_date
                              ? new Date(movement.movement_date).toLocaleDateString()
                              : new Date(movement.created_at).toLocaleDateString()}
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(movement.created_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {movement.item_name}
                        </div>
                        <div className="text-sm text-gray-500">Item ID: {movement.item}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {['purchase', 'return_in', 'production_in'].includes(
                          movement.movement_type
                        ) ? (
                          <TrendingUp className="w-4 h-4 text-green-600 mr-2" />
                        ) : (
                          <TrendingDown className="w-4 h-4 text-red-600 mr-2" />
                        )}
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                            MOVEMENT_TYPE_COLORS[movement.movement_type] ||
                            'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {MOVEMENT_TYPE_LABELS[movement.movement_type] || movement.movement_type}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div
                        className={`text-sm font-medium ${
                          parseFloat(movement.quantity) > 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {parseFloat(movement.quantity) > 0 ? '+' : ''}
                        {movement.quantity}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        {movement.from_location_name && (
                          <div className="text-xs text-gray-500">
                            From: {movement.from_location_name}
                          </div>
                        )}
                        {movement.to_location_name && (
                          <div className="text-xs text-gray-500">
                            To: {movement.to_location_name}
                          </div>
                        )}
                        {!movement.from_location_name && !movement.to_location_name && '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {movement.reference_number || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <div>
                        <div className="text-sm text-gray-900">
                          {movement.unit_cost && `$${movement.unit_cost}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          Total: {movement.total_cost && `$${movement.total_cost}`}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {movement.notes || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-6 py-3 border-t border-gray-200 flex justify-between items-center">
                <div className="text-sm text-gray-700">
                  Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, movementsData?.count || 0)}{' '}
                  of {movementsData?.count || 0} movements
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
