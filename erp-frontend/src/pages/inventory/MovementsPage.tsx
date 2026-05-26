import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Filter,
  Calendar,
  ArrowUpDown,
  TrendingUp,
  TrendingDown,
  Package,
  MapPin,
  User,
  FileText,
  Download,
  Eye,
} from 'lucide-react';
import { useStockMovements } from '../../hooks/useInventory';
import { StockMovement } from '../../services/inventoryService';

const MovementsPage: React.FC = () => {
  const navigate = useNavigate();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch stock movements - only send parameters with actual values
  const queryParams: any = {};
  if (searchQuery.trim()) queryParams.search = searchQuery;
  if (currentPage > 1) queryParams.page = currentPage;
  // Only add ordering if we have other parameters, otherwise let backend use its default
  if (Object.keys(queryParams).length > 0) queryParams.ordering = 'owner';

  const {
    data: movementsData,
    isLoading,
    error,
  } = useStockMovements(Object.keys(queryParams).length > 0 ? queryParams : undefined);

  const movements = movementsData?.results || [];
  const totalMovements = movementsData?.count || 0;
  const totalPages = Math.ceil(totalMovements / 20); // Assuming 20 items per page

  const getMovementTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase':
        return { icon: TrendingUp, color: 'text-green-600' };
      case 'sale':
        return { icon: TrendingDown, color: 'text-red-600' };
      case 'adjustment':
        return { icon: ArrowUpDown, color: 'text-blue-600' };
      case 'transfer':
        return { icon: MapPin, color: 'text-purple-600' };
      case 'return_in':
        return { icon: TrendingUp, color: 'text-green-600' };
      case 'return_out':
        return { icon: TrendingDown, color: 'text-red-600' };
      case 'write_off':
        return { icon: TrendingDown, color: 'text-red-600' };
      case 'production_in':
        return { icon: TrendingUp, color: 'text-blue-600' };
      case 'production_out':
        return { icon: TrendingDown, color: 'text-blue-600' };
      default:
        return { icon: Package, color: 'text-gray-600' };
    }
  };

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase':
        return 'Purchase Receipt';
      case 'sale':
        return 'Sales Delivery';
      case 'adjustment':
        return 'Stock Adjustment';
      case 'transfer':
        return 'Transfer';
      case 'return_in':
        return 'Purchase Return';
      case 'return_out':
        return 'Sales Return';
      case 'write_off':
        return 'Write Off';
      case 'production_in':
        return 'Production Receipt';
      case 'production_out':
        return 'Production Issue';
      default:
        return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    }
  };

  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'purchase':
      case 'return_in':
      case 'production_in':
        return 'bg-green-100 text-green-800';
      case 'sale':
      case 'return_out':
      case 'write_off':
      case 'production_out':
        return 'bg-red-100 text-red-800';
      case 'adjustment':
        return 'bg-blue-100 text-blue-800';
      case 'transfer':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load stock movements</p>
          <button
            onClick={() => window.location.reload()}
            className="text-blue-600 hover:text-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Stock Movements</h1>
          <p className="text-gray-600">Track all inventory movement history</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              /* Export functionality */
            }}
            className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search movements..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="purchase">Purchase Receipt</option>
            <option value="sale">Sales Delivery</option>
            <option value="adjustment">Stock Adjustment</option>
            <option value="transfer">Transfer</option>
            <option value="return_in">Purchase Return</option>
            <option value="return_out">Sales Return</option>
            <option value="write_off">Write Off</option>
            <option value="production_in">Production Receipt</option>
            <option value="production_out">Production Issue</option>
          </select>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="date"
              placeholder="From date"
              value={filterDateFrom}
              onChange={e => setFilterDateFrom(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="date"
              placeholder="To date"
              value={filterDateTo}
              onChange={e => setFilterDateTo(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <button
            onClick={() => {
              setSearchQuery('');
              setFilterType('all');
              setFilterDateFrom('');
              setFilterDateTo('');
            }}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Movements Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
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
                  Locations
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Reference
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      <span className="ml-2 text-gray-600">Loading movements...</span>
                    </div>
                  </td>
                </tr>
              ) : movements.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <ArrowUpDown className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900">No movements found</h3>
                    <p className="mt-1 text-sm text-gray-500">
                      {searchQuery
                        ? 'Try adjusting your search criteria'
                        : 'No stock movements recorded yet'}
                    </p>
                  </td>
                </tr>
              ) : (
                movements.map(movement => {
                  const typeInfo = getMovementTypeIcon(movement.movement_type);
                  const TypeIcon = typeInfo.icon;

                  return (
                    <tr key={movement.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {movement.movement_date
                            ? new Date(movement.movement_date).toLocaleDateString()
                            : 'N/A'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {new Date(movement.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-lg bg-gray-200 flex items-center justify-center">
                              <Package className="h-4 w-4 text-gray-500" />
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900">
                              {movement.item_name}
                            </div>
                            <div className="text-sm text-gray-500">SKU: {movement.item_sku}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <TypeIcon className={`w-4 h-4 mr-2 ${typeInfo.color}`} />
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getMovementTypeColor(movement.movement_type)}`}
                          >
                            {getMovementTypeLabel(movement.movement_type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {movement.from_location_name && movement.to_location_name ? (
                            <div>
                              <div className="flex items-center text-red-600">
                                <span>From: {movement.from_location_name}</span>
                              </div>
                              <div className="flex items-center text-green-600">
                                <span>To: {movement.to_location_name}</span>
                              </div>
                            </div>
                          ) : movement.from_location_name ? (
                            <div className="flex items-center text-red-600">
                              <span>From: {movement.from_location_name}</span>
                            </div>
                          ) : movement.to_location_name ? (
                            <div className="flex items-center text-green-600">
                              <span>To: {movement.to_location_name}</span>
                            </div>
                          ) : (
                            <span className="text-gray-500">N/A</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {parseFloat(movement.quantity).toLocaleString()}
                        </div>
                        {movement.unit_cost && (
                          <div className="text-sm text-gray-500">
                            @ ₦{parseFloat(movement.unit_cost).toFixed(2)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">{movement.reference_number}</div>
                        {movement.notes && (
                          <div
                            className="text-sm text-gray-500 truncate max-w-32"
                            title={movement.notes}
                          >
                            {movement.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <User className="w-4 h-4 text-gray-400 mr-2" />
                          <div className="text-sm text-gray-900">{movement.created_by_name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => {
                            /* View movement details */
                          }}
                          className="text-blue-600 hover:text-blue-700"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{(currentPage - 1) * 20 + 1}</span> to{' '}
                  <span className="font-medium">{Math.min(currentPage * 20, totalMovements)}</span>{' '}
                  of <span className="font-medium">{totalMovements}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                          currentPage === page
                            ? 'z-10 bg-blue-50 border-blue-500 text-blue-600'
                            : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        {page}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MovementsPage;
