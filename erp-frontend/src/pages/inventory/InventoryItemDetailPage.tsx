import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Package,
  TrendingUp,
  TrendingDown,
  MapPin,
  Calendar,
  Printer,
} from 'lucide-react';
import {
  useInventoryItem,
  useItemMovements,
  useItemStockLevels,
  useDeleteInventoryItem,
} from '../../hooks/useInventory';
import { ErrorDisplay } from '../../components/error/ErrorDisplay';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { useToast } from '../../hooks/useToast';

export default function InventoryItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'movements'>('overview');
  const toast = useToast();

  const { data: item, isLoading, error } = useInventoryItem(parseInt(id!));
  const { data: stockLevels } = useItemStockLevels(parseInt(id!));
  const { data: movements } = useItemMovements(parseInt(id!));
  const deleteItemMutation = useDeleteInventoryItem();

  const handleDeleteItem = async () => {
    if (!item) return;

    if (!confirm(`Are you sure you want to delete "${item.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await deleteItemMutation.mutateAsync(item.id);
      toast.success(`Item "${item.name}" deleted successfully!`);
      navigate('/inventory/items');
    } catch (error) {
      toast.error(`Failed to delete item "${item.name}". Please try again.`);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <LoadingOverlay show={true} message="Loading item details..." size="lg" />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="p-6">
        <ErrorDisplay
          error={error || 'Item not found'}
          context="fetch-inventory-item"
          onRetry={() => window.location.reload()}
          variant="card"
          size="lg"
          showRetry={true}
        />
      </div>
    );
  }

  // Calculate total stock from stock levels data
  const totalStock =
    stockLevels?.results?.reduce(
      (sum, level) => sum + parseFloat(level.quantity_on_hand || '0'),
      0
    ) || 0;
  const isLowStock = item.reorder_level && totalStock <= parseFloat(item.reorder_level);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inventory/items')}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            <p className="text-gray-600">SKU: {item.sku}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate(`/inventory/items/${id}/ledger`)}
            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Package className="w-4 h-4" />
            View Ledger
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50 flex items-center gap-2">
            <Printer className="w-4 h-4" />
            Print Barcode
          </button>
          <Link
            to={`/inventory/items/${id}/edit`}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Item
          </Link>
          <button
            onClick={handleDeleteItem}
            disabled={deleteItemMutation.isPending}
            className={`px-4 py-2 rounded-md flex items-center gap-2 ${
              deleteItemMutation.isPending
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            <Trash2 className="w-4 h-4" />
            {deleteItemMutation.isPending ? 'Deleting...' : 'Delete Item'}
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Stock</p>
              <p className="text-2xl font-bold text-gray-900">
                {totalStock} {item.unit_of_measure}
              </p>
            </div>
            <Package className="w-8 h-8 text-blue-600" />
          </div>
          {isLowStock && (
            <div className="mt-2 text-xs text-red-600 font-medium">Low Stock Alert</div>
          )}
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Cost Price</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦
                {typeof item.cost_price === 'number'
                  ? item.cost_price.toFixed(2)
                  : parseFloat(item.cost_price || '0').toFixed(2)}
              </p>
            </div>
            <TrendingDown className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Selling Price</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦
                {typeof item.selling_price === 'number'
                  ? item.selling_price.toFixed(2)
                  : parseFloat(item.selling_price || '0').toFixed(2)}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦{(parseFloat(item.cost_price || '0') * totalStock).toFixed(2)}
              </p>
            </div>
            <Package className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8 px-6">
            {[
              { key: 'overview', label: 'Overview' },
              { key: 'stock', label: 'Stock Levels' },
              { key: 'movements', label: 'Movement History' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Name</label>
                    <p className="mt-1 text-sm text-gray-900">{item.name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">SKU</label>
                    <p className="mt-1 text-sm text-gray-900">{item.sku}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Barcode</label>
                    <p className="mt-1 text-sm text-gray-900">{item.barcode || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    <p className="mt-1 text-sm text-gray-900">{item.category_name || '-'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Unit of Measure
                    </label>
                    <p className="mt-1 text-sm text-gray-900">{item.unit_of_measure}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {item.description && (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Description</label>
                      <p className="mt-1 text-sm text-gray-900">{item.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Pricing Information */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">Pricing</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cost Price</label>
                    <p className="mt-1 text-sm text-gray-900">
                      ₦
                      {typeof item.cost_price === 'number'
                        ? item.cost_price.toFixed(2)
                        : parseFloat(item.cost_price || '0').toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Selling Price</label>
                    <p className="mt-1 text-sm text-gray-900">
                      ₦
                      {typeof item.selling_price === 'number'
                        ? item.selling_price.toFixed(2)
                        : parseFloat(item.selling_price || '0').toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Minimum Price</label>
                    <p className="mt-1 text-sm text-gray-900">
                      ₦
                      {typeof item.minimum_selling_price === 'number'
                        ? item.minimum_selling_price.toFixed(2)
                        : parseFloat(item.minimum_selling_price || '0').toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Stock Configuration */}
              {item.track_stock && (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Stock Configuration</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Valuation Method
                      </label>
                      <p className="mt-1 text-sm text-gray-900">{item.valuation_method}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Reorder Level
                      </label>
                      <p className="mt-1 text-sm text-gray-900">{item.reorder_level || '-'}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Reorder Quantity
                      </label>
                      <p className="mt-1 text-sm text-gray-900">{item.reorder_quantity || '-'}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'stock' && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Stock Levels by Location</h3>
              {stockLevels && stockLevels.results && stockLevels.results.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Location
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          On Hand
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reserved
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Available
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Average Cost
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Total Value
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {stockLevels.results.map(stock => (
                        <tr key={stock.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                              <div>
                                <div className="text-sm font-medium text-gray-900">
                                  {stock.location_name}
                                </div>
                                <div className="text-sm text-gray-500">{stock.location_code}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {parseFloat(stock.quantity_on_hand || '0').toFixed(2)}{' '}
                            {item.unit_of_measure}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {parseFloat(stock.quantity_reserved || '0').toFixed(2)}{' '}
                            {item.unit_of_measure}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {parseFloat(stock.quantity_available || '0').toFixed(2)}{' '}
                            {item.unit_of_measure}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ₦{parseFloat(stock.average_cost || '0').toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            ₦{parseFloat(stock.total_value || '0').toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No stock levels found for this item</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Stock levels will appear here once inventory is received
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'movements' && (
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Stock Movements</h3>
              {movements && movements.results && movements.results.length > 0 ? (
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
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
                          Notes
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {movements.results.map(movement => (
                        <tr key={movement.id}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <Calendar className="w-4 h-4 text-gray-400 mr-2" />
                              <span className="text-sm text-gray-900">
                                {new Date(movement.movement_date).toLocaleDateString()}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                movement.movement_type === 'purchase' ||
                                movement.movement_type === 'return_in'
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {movement.movement_type.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {parseFloat(movement.quantity) > 0 ? '+' : ''}
                            {movement.quantity} {item.unit_of_measure}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {movement.from_location_name || movement.to_location_name || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {movement.reference_number || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {movement.notes || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No stock movements found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
