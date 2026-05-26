import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Calendar,
  Package,
} from 'lucide-react';
import {
  useConsumptions,
  useDeleteConsumption,
  useBulkPost,
} from '../../hooks/useResourceConsumption';
import {
  ConsumptionFilters,
  ResourceConsumption,
  ConsumptionStatus,
} from '../../types/consumption';

const ResourceConsumptionListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<ConsumptionFilters>({
    page: 1,
    page_size: 20,
    ordering: '-consumption_date',
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, error } = useConsumptions(filters);
  const deleteConsumption = useDeleteConsumption();
  const bulkPost = useBulkPost();

  // Show a helpful message if the API doesn't exist yet
  if (error && error.message?.includes('404')) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Package className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Resource Consumption API Not Available
            </h2>
            <p className="text-gray-600 mb-4">
              The backend API endpoints for resource consumption are not implemented yet.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-left max-w-md mx-auto">
              <h3 className="font-semibold text-blue-900 mb-2">Available for Testing:</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• Form functionality (with mock data)</li>
                <li>• UI components and validation</li>
                <li>• Workflow state management</li>
                <li>• Responsive design</li>
              </ul>
            </div>
            <button
              onClick={() => navigate('/expenses/resource-consumption/create')}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Try the Form (Demo Mode)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: ConsumptionStatus) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      flagged: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      posted: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: ConsumptionStatus) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'posted':
        return <DollarSign size={16} className="text-purple-600" />;
      case 'cancelled':
        return <XCircle size={16} className="text-red-600" />;
      case 'flagged':
        return <AlertTriangle size={16} className="text-yellow-600" />;
      default:
        return <Package size={16} className="text-gray-600" />;
    }
  };

  const handleFilterChange = (key: keyof ConsumptionFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(data?.results.map(c => c.id) || []);
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectItem = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
    }
  };

  const handleBulkPost = async () => {
    if (selectedIds.length === 0) return;

    try {
      await bulkPost.mutateAsync({ ids: selectedIds });
      setSelectedIds([]);
      alert('Bulk posting completed successfully');
    } catch (error) {
      console.error('Bulk posting failed:', error);
      alert('Bulk posting failed');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this consumption record?')) return;

    try {
      await deleteConsumption.mutateAsync(id);
      alert('Consumption deleted successfully');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading consumptions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading consumptions</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resource Consumption</h1>
          <p className="text-gray-600 mt-1">
            Track and manage resource consumption across assets and locations
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/expenses/resource-consumption/irregularities"
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <AlertTriangle size={20} />
            Irregularities
          </Link>
          <Link
            to="/expenses/resource-consumption/create"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Record Consumption
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Records</p>
              <p className="text-2xl font-bold text-gray-900">{data?.count || 0}</p>
            </div>
            <Package className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Approval</p>
              <p className="text-2xl font-bold text-yellow-600">
                {data?.results.filter(c => c.status === 'submitted' || c.status === 'flagged')
                  .length || 0}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Ready to Post</p>
              <p className="text-2xl font-bold text-green-600">
                {data?.results.filter(c => c.status === 'approved' && !c.is_posted).length || 0}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Posted</p>
              <p className="text-2xl font-bold text-purple-600">
                {data?.results.filter(c => c.is_posted).length || 0}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
          >
            <Filter size={20} />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Flow</label>
              <select
                value={filters.payment_flow || ''}
                onChange={e => handleFilterChange('payment_flow', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Flows</option>
                <option value="prepaid">Prepaid</option>
                <option value="postpaid">Postpaid</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status || ''}
                onChange={e => handleFilterChange('status', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="submitted">Submitted</option>
                <option value="flagged">Flagged</option>
                <option value="approved">Approved</option>
                <option value="posted">Posted</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resource Type</label>
              <select
                value={filters.resource_type || ''}
                onChange={e => handleFilterChange('resource_type', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Types</option>
                <option value="fuel">Fuel</option>
                <option value="electricity">Electricity</option>
                <option value="water">Water</option>
                <option value="gas">Gas</option>
                <option value="internet">Internet</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Show Irregularities Only
              </label>
              <input
                type="checkbox"
                checked={filters.is_irregular || false}
                onChange={e => handleFilterChange('is_irregular', e.target.checked || undefined)}
                className="mt-2"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <span className="text-blue-800">{selectedIds.length} item(s) selected</span>
            <div className="flex gap-2">
              <button
                onClick={handleBulkPost}
                disabled={bulkPost.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkPost.isPending ? 'Posting...' : 'Bulk Post'}
              </button>
              <button
                onClick={() => setSelectedIds([])}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
              >
                Clear Selection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.length === data?.results.length && data?.results.length > 0
                    }
                    onChange={e => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Consumption
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Beneficiary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity & Cost
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {data?.results.map(consumption => (
                <tr
                  key={consumption.id}
                  className={consumption.is_irregular ? 'bg-yellow-50' : 'hover:bg-gray-50'}
                >
                  <td className="px-6 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(consumption.id)}
                      onChange={e => handleSelectItem(consumption.id, e.target.checked)}
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {consumption.consumption_number}
                        </div>
                        <div className="text-sm text-gray-500 flex items-center gap-1">
                          <Calendar size={14} />
                          {consumption.consumption_date}
                        </div>
                        <div className="text-xs text-gray-500">
                          {consumption.payment_flow === 'prepaid' ? 'Prepaid' : 'Postpaid'}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {consumption.resource_name}
                    </div>
                    <div className="text-sm text-gray-500">{consumption.resource_type}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {consumption.beneficiary_name}
                    </div>
                    <div className="text-sm text-gray-500">{consumption.beneficiary_reference}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {consumption.quantity_consumed} {consumption.unit_of_measure}
                    </div>
                    <div className="text-sm text-gray-500">
                      ${parseFloat(consumption.total_cost).toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(consumption.status)}
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(consumption.status)}`}
                      >
                        {consumption.status}
                      </span>
                      {consumption.is_irregular && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Flagged
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/expenses/resource-consumption/${consumption.id}`)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Details"
                      >
                        <Eye size={16} />
                      </button>
                      {!consumption.is_posted && (
                        <button
                          onClick={() =>
                            navigate(`/expenses/resource-consumption/${consumption.id}/edit`)
                          }
                          className="text-green-600 hover:text-green-900"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      {consumption.status === 'draft' && (
                        <button
                          onClick={() => handleDelete(consumption.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.count > (filters.page_size || 20) && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                disabled={!data.previous}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                disabled={!data.next}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing{' '}
                  <span className="font-medium">
                    {((filters.page || 1) - 1) * (filters.page_size || 20) + 1}
                  </span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min((filters.page || 1) * (filters.page_size || 20), data.count)}
                  </span>{' '}
                  of <span className="font-medium">{data.count}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                    disabled={!data.previous}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                    disabled={!data.next}
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

export default ResourceConsumptionListPage;
