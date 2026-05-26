import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Package,
  AlertTriangle,
  CheckCircle,
  MapPin,
  TrendingUp,
  Calendar,
  DollarSign,
  BarChart3,
  Settings,
  ExternalLink,
} from 'lucide-react';
import { useInventoryItem } from '../../hooks/useInventory';
import { useToast } from '../../hooks/useToast';

const ItemDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'movements'>('overview');

  // Fetch item data
  const { data: item, isLoading, error } = useInventoryItem(parseInt(id || '0'), !!id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-gray-600">Loading item details...</span>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Package className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">Item not found</h3>
          <p className="mt-1 text-sm text-gray-500">The requested item could not be found.</p>
          <div className="mt-6">
            <button
              onClick={() => navigate('/inventory/items')}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Back to Items
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStockStatus = () => {
    if (item.needs_reorder) {
      return {
        label: 'Low Stock',
        color: 'text-red-600 bg-red-50',
        icon: AlertTriangle,
      };
    }
    if (parseFloat(item.total_stock) > 0) {
      return {
        label: 'In Stock',
        color: 'text-green-600 bg-green-50',
        icon: CheckCircle,
      };
    }
    return {
      label: 'Out of Stock',
      color: 'text-gray-600 bg-gray-50',
      icon: Package,
    };
  };

  const stockStatus = getStockStatus();
  const StatusIcon = stockStatus.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/inventory/items')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            <p className="text-gray-600">SKU: {item.sku}</p>
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => navigate(`/inventory/items/${item.id}/edit`)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Edit className="w-4 h-4" />
            Edit Item
          </button>
        </div>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Stock Status</p>
              <div className="flex items-center gap-2 mt-1">
                <StatusIcon className={`w-4 h-4 ${stockStatus.color.split(' ')[0]}`} />
                <span className={`text-sm font-medium px-2 py-1 rounded-full ${stockStatus.color}`}>
                  {stockStatus.label}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Stock</p>
              <p className="text-2xl font-bold text-gray-900">
                {parseFloat(item.total_stock).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">{item.unit_of_measure}</p>
            </div>
            <Package className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Available</p>
              <p className="text-2xl font-bold text-gray-900">
                {parseFloat(item.total_available).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">
                Reserved: {parseFloat(item.total_reserved).toLocaleString()}
              </p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦{parseFloat(item.total_value).toLocaleString()}
              </p>
              <p className="text-sm text-gray-500">@ ₦{parseFloat(item.cost_price).toFixed(2)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-green-500" />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex">
            {[
              { id: 'overview', label: 'Overview', icon: Package },
              { id: 'stock', label: 'Stock Levels', icon: MapPin },
              { id: 'movements', label: 'Movement History', icon: TrendingUp },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-3 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <tab.icon className="w-4 h-4" />
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                    <p className="mt-1 text-sm text-gray-900">{item.barcode || 'Not set'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    <p className="mt-1 text-sm text-gray-900">{item.category_name}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Unit of Measure
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {item.unit_of_measure || 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Valuation Method
                    </label>
                    <p className="mt-1 text-sm text-gray-900 capitalize">
                      {item.valuation_method || 'Not set'}
                    </p>
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
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Pricing</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Cost Price</label>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      ₦{parseFloat(item.cost_price).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Selling Price</label>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      ₦{parseFloat(item.selling_price).toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Minimum Selling Price
                    </label>
                    <p className="mt-1 text-lg font-semibold text-gray-900">
                      {item.minimum_selling_price
                        ? `$${parseFloat(item.minimum_selling_price).toFixed(2)}`
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Reorder Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Reorder Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Reorder Level</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {item.reorder_level
                        ? parseFloat(item.reorder_level).toLocaleString()
                        : 'Not set'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Reorder Quantity
                    </label>
                    <p className="mt-1 text-sm text-gray-900">
                      {item.reorder_quantity
                        ? parseFloat(item.reorder_quantity).toLocaleString()
                        : 'Not set'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Settings</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.is_active ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.is_sellable ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Sellable</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.is_purchasable ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Purchasable</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.track_serial_numbers ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Track Serial Numbers</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.track_batch_numbers ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Track Batch Numbers</span>
                  </div>
                  <div className="flex items-center">
                    <CheckCircle
                      className={`w-4 h-4 mr-2 ${item.track_expiry ? 'text-green-500' : 'text-gray-400'}`}
                    />
                    <span className="text-sm text-gray-700">Track Expiry</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'stock' && (
            <div className="text-center py-12">
              <MapPin className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Stock Levels by Location</h3>
              <p className="mt-1 text-sm text-gray-500">
                This feature requires the <code>/api/inventory/items/{id}/stock-levels/</code>{' '}
                endpoint
              </p>
              <div className="mt-6">
                <button
                  onClick={() =>
                    toast.info(
                      'This feature will be available when the backend endpoint is implemented'
                    )
                  }
                  className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 flex items-center gap-2 mx-auto"
                >
                  <ExternalLink className="w-4 h-4" />
                  View in Stock Management
                </button>
              </div>
            </div>
          )}

          {activeTab === 'movements' && (
            <div className="text-center py-12">
              <TrendingUp className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">Movement History</h3>
              <p className="mt-1 text-sm text-gray-500">
                This feature requires the <code>/api/inventory/items/{id}/movements/</code> endpoint
              </p>
              <div className="mt-6">
                <button
                  onClick={() => navigate('/inventory/movements')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2 mx-auto"
                >
                  <ExternalLink className="w-4 h-4" />
                  View All Movements
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemDetailPage;
