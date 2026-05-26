import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  BarChart3,
  TrendingUp,
  Package,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useResource, useDeleteResource } from '../../hooks/useResources';

const ResourceDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'statistics' | 'history'>('overview');

  const { data: resource, isLoading, error } = useResource(Number(id));
  const deleteResource = useDeleteResource();

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this resource? This action cannot be undone.'))
      return;

    try {
      await deleteResource.mutateAsync(Number(id));
      alert('Resource deleted successfully');
      navigate('/expenses/resources');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete resource');
    }
  };

  const getResourceTypeColor = (type: string) => {
    const colors = {
      fuel: 'bg-red-100 text-red-800',
      electricity: 'bg-yellow-100 text-yellow-800',
      water: 'bg-blue-100 text-blue-800',
      gas: 'bg-orange-100 text-orange-800',
      telecom: 'bg-purple-100 text-purple-800',
      service: 'bg-green-100 text-green-800',
      consumable: 'bg-gray-100 text-gray-800',
      other: 'bg-indigo-100 text-indigo-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getTrackingMethodIcon = (method: string) => {
    switch (method) {
      case 'odometer':
        return '🚗';
      case 'meter':
        return '⚡';
      case 'hours':
        return '⏰';
      case 'cycles':
        return '🔄';
      case 'quantity':
        return '📦';
      default:
        return '📊';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading resource details...</div>
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading resource details</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/expenses/resources')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to Resources
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{resource.name}</h1>
            <p className="text-gray-600">{resource.resource_code}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              resource.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}
          >
            {resource.is_active ? (
              <>
                <CheckCircle size={16} className="mr-1" />
                Active
              </>
            ) : (
              <>
                <XCircle size={16} className="mr-1" />
                Inactive
              </>
            )}
          </span>
          <button
            onClick={() => navigate(`/expenses/resources/${id}/edit`)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Edit size={16} />
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">30-Day Consumption</p>
              <p className="text-2xl font-bold text-blue-600">
                {resource.total_consumption_30days?.total_quantity || 0} {resource.unit_of_measure}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">30-Day Cost</p>
              <p className="text-2xl font-bold text-green-600">
                ${resource.total_consumption_30days?.total_cost || 0}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Consumption Records</p>
              <p className="text-2xl font-bold text-purple-600">
                {resource.consumption_count_30days || '0'}
              </p>
            </div>
            <Package className="h-8 w-8 text-purple-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Default Unit Cost</p>
              <p className="text-2xl font-bold text-orange-600">
                ${parseFloat(resource.default_unit_cost || '0').toFixed(2)}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Irregularity Detection</p>
              <p className="text-2xl font-bold text-indigo-600">
                {resource.enable_irregularity_detection ? 'ON' : 'OFF'}
              </p>
            </div>
            {resource.enable_irregularity_detection ? (
              <Activity className="h-8 w-8 text-indigo-600" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'statistics'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Statistics
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Consumption History
            </button>
          </nav>
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Resource Type</label>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getResourceTypeColor(resource.resource_type)}`}
                        >
                          {resource.resource_type}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Unit of Measure</label>
                      <p className="mt-1 text-sm text-gray-900">{resource.unit_of_measure}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Tracking Method</label>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-lg">
                          {getTrackingMethodIcon(resource.default_tracking_method || '')}
                        </span>
                        <span className="text-sm text-gray-900">
                          {resource.default_tracking_method
                            ? resource.default_tracking_method
                                .replace('_', ' ')
                                .replace(/\b\w/g, l => l.toUpperCase())
                            : 'No tracking'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Default Supplier</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {resource.default_supplier_name || 'No default supplier'}
                      </p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Expense Category</label>
                      <p className="mt-1 text-sm text-gray-900">{resource.expense_category_name}</p>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-gray-500">Expense Account</label>
                      <p className="mt-1 text-sm text-gray-900">{resource.expense_account_name}</p>
                    </div>
                  </div>
                </div>

                {resource.description && (
                  <div className="mt-6">
                    <label className="text-sm font-medium text-gray-500">Description</label>
                    <p className="mt-1 text-sm text-gray-900">{resource.description}</p>
                  </div>
                )}
              </div>

              {/* Service Information */}
              {resource.is_service && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-gray-500">Contract Number</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {resource.service_contract_number}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Service Frequency</label>
                      <p className="mt-1 text-sm text-gray-900">{resource.service_frequency}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Irregularity Detection */}
              {resource.enable_irregularity_detection && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">
                    Irregularity Detection Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {resource.variance_threshold_percentage && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">
                          Variance Threshold
                        </label>
                        <p className="mt-1 text-sm text-gray-900">
                          {resource.variance_threshold_percentage}%
                        </p>
                      </div>
                    )}
                    {resource.min_efficiency && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Min Efficiency</label>
                        <p className="mt-1 text-sm text-gray-900">{resource.min_efficiency}</p>
                      </div>
                    )}
                    {resource.max_efficiency && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Max Efficiency</label>
                        <p className="mt-1 text-sm text-gray-900">{resource.max_efficiency}</p>
                      </div>
                    )}
                    {resource.max_daily_usage && (
                      <div>
                        <label className="text-sm font-medium text-gray-500">Max Daily Usage</label>
                        <p className="mt-1 text-sm text-gray-900">{resource.max_daily_usage}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'statistics' && (
            <div className="text-center py-12">
              <BarChart3 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Statistics Coming Soon</h3>
              <p className="text-gray-600">
                Resource usage statistics and analytics will be available once the backend endpoint
                is implemented.
              </p>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="text-center py-12">
              <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Consumption History Coming Soon
              </h3>
              <p className="text-gray-600">
                Detailed consumption history will be available once the backend endpoint is
                implemented.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Audit Information */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Audit Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <label className="font-medium text-gray-500">Created At</label>
            <p className="mt-1 text-gray-900">{new Date(resource.created_at).toLocaleString()}</p>
          </div>
          <div>
            <label className="font-medium text-gray-500">Last Updated</label>
            <p className="mt-1 text-gray-900">{new Date(resource.updated_at).toLocaleString()}</p>
          </div>
          {resource.branch && (
            <div>
              <label className="font-medium text-gray-500">Branch ID</label>
              <p className="mt-1 text-gray-900">{resource.branch}</p>
            </div>
          )}
          {resource.owner && (
            <div>
              <label className="font-medium text-gray-500">Owner ID</label>
              <p className="mt-1 text-gray-900">{resource.owner}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResourceDetailPage;
