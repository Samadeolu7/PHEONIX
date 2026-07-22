import React, { useState } from 'react';
import {
  Plus,
  Edit,
  Eye,
  ToggleLeft,
  ToggleRight,
  Search,
  Filter,
  DollarSign,
  Calendar,
  Users,
  FileText,
  Settings,
} from 'lucide-react';
import {
  incomeFeeStructureService,
  FeeStructure,
} from '../services/incomeFeeStructureService';
import { useIncomeFeeStructures } from '../hooks/useIncomeFees';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../hooks/useToast';

interface FeeStructureFilters {
  search?: string;
  is_active?: boolean;
  frequency?: string;
  category?: number;
  page?: number;
}

interface UsageStats {
  total_invoices: number;
  total_amount: string;
  active_entitlements: number;
  clients_count: number;
}

const IncomeFeeStructureListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<FeeStructureFilters>({});
  const [usageStats, setUsageStats] = useState<Record<number, UsageStats>>({});
  const [loadingStats, setLoadingStats] = useState<Record<number, boolean>>({});
  const { success, error: showError } = useToast();

  const { data, isLoading: loading, refetch: refetchStructures } = useIncomeFeeStructures(filters);
  const feeStructures = data?.results ?? [];
  const pagination = {
    count: data?.count ?? 0,
    next: data?.next ?? null,
    previous: data?.previous ?? null,
    currentPage: filters.page || 1,
  };

  const loadUsageStats = async (feeStructureId: number) => {
    if (usageStats[feeStructureId] || loadingStats[feeStructureId]) {
      return; // Already loaded or loading
    }

    try {
      setLoadingStats(prev => ({ ...prev, [feeStructureId]: true }));
      const stats = await incomeFeeStructureService.getFeeStructureUsageStats(feeStructureId);
      setUsageStats(prev => ({ ...prev, [feeStructureId]: stats }));
    } catch (error) {
      console.error('Error loading usage stats:', error);
      // Don't show error toast for stats as it's not critical
    } finally {
      setLoadingStats(prev => ({ ...prev, [feeStructureId]: false }));
    }
  };

  const handleFilterChange = (key: keyof FeeStructureFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const handleToggleActive = async (feeStructure: FeeStructure) => {
    try {
      if (feeStructure.is_active) {
        await incomeFeeStructureService.deactivateFeeStructure(feeStructure.id);
        success(`Fee structure "${feeStructure.name}" deactivated successfully`);
      } else {
        await incomeFeeStructureService.activateFeeStructure(feeStructure.id);
        success(`Fee structure "${feeStructure.name}" activated successfully`);
      }
      refetchStructures();
    } catch (error) {
      console.error('Error toggling fee structure status:', error);
      showError('Failed to update fee structure status');
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getFrequencyBadge = (frequency: string) => {
    const frequencyConfig = {
      daily: { color: 'bg-blue-100 text-blue-800', label: 'Daily' },
      weekly: { color: 'bg-green-100 text-green-800', label: 'Weekly' },
      monthly: { color: 'bg-purple-100 text-purple-800', label: 'Monthly' },
      termly: { color: 'bg-orange-100 text-orange-800', label: 'Termly' },
      annually: { color: 'bg-red-100 text-red-800', label: 'Annually' },
    };

    const config = frequencyConfig[frequency as keyof typeof frequencyConfig] || {
      color: 'bg-gray-100 text-gray-800',
      label: frequency,
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      >
        {config.label}
      </span>
    );
  };

  const getStatusBadge = (isActive: boolean) => {
    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
          isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
        }`}
      >
        {isActive ? 'Active' : 'Inactive'}
      </span>
    );
  };

  const renderUsageStats = (feeStructure: FeeStructure) => {
    const stats = usageStats[feeStructure.id];
    const loading = loadingStats[feeStructure.id];

    if (loading) {
      return <div className="text-xs text-gray-500">Loading stats...</div>;
    }

    if (!stats) {
      return (
        <button
          onClick={() => loadUsageStats(feeStructure.id)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          Load usage stats
        </button>
      );
    }

    return (
      <div className="text-xs text-gray-600 space-y-1">
        <div className="flex items-center space-x-1">
          <FileText className="w-3 h-3" />
          <span>{stats.total_invoices} invoices</span>
        </div>
        <div className="flex items-center space-x-1">
          <Users className="w-3 h-3" />
          <span>{stats.clients_count} clients</span>
        </div>
        <div className="flex items-center space-x-1">
          <DollarSign className="w-3 h-3" />
          <span>{formatCurrency(stats.total_amount)}</span>
        </div>
      </div>
    );
  };

  const renderIndustryConfig = (industryConfig: string | object) => {
    try {
      // Handle both string and object cases
      let config;
      if (typeof industryConfig === 'string') {
        config = JSON.parse(industryConfig);
      } else if (typeof industryConfig === 'object' && industryConfig !== null) {
        config = industryConfig;
      } else {
        return <span className="text-xs text-gray-500">No config</span>;
      }

      const keys = Object.keys(config);

      if (keys.length === 0) {
        return <span className="text-xs text-gray-500">No config</span>;
      }

      return (
        <div className="text-xs text-gray-600">
          {keys.slice(0, 2).map(key => (
            <div key={key} className="truncate">
              <span className="font-medium">{key}:</span> {config[key]}
            </div>
          ))}
          {keys.length > 2 && <div className="text-gray-500">+{keys.length - 2} more</div>}
        </div>
      );
    } catch {
      return <span className="text-xs text-gray-500">Invalid config</span>;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Settings className="w-8 h-8 text-blue-600 mr-3" />
              Fee Structures
            </h1>
            <p className="text-gray-600">Manage billing templates and fee configurations</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/incomes/fee-structures/approvals')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 flex items-center"
            >
              <FileText className="w-4 h-4 mr-2" />
              Pending Approvals
            </button>
            <button
              onClick={() => navigate('/incomes/fee-structures/create')}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Fee Structure
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <Filter className="w-5 h-5 mr-2" />
          Filters
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Name, code, description..."
                value={filters.search || ''}
                onChange={e => handleFilterChange('search', e.target.value || undefined)}
                className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.is_active === undefined ? '' : filters.is_active.toString()}
              onChange={e =>
                handleFilterChange(
                  'is_active',
                  e.target.value === '' ? undefined : e.target.value === 'true'
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>

          {/* Frequency Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <select
              value={filters.frequency || ''}
              onChange={e => handleFilterChange('frequency', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Frequencies</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="termly">Termly</option>
              <option value="annually">Annually</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => setFilters({})}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="px-6 py-3 border-b border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-gray-900">
                  Fee Structures ({pagination.count})
                </h3>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name & Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount & Frequency
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Industry Config
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Usage Statistics
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
                  {feeStructures.map(feeStructure => (
                    <tr key={feeStructure.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {feeStructure.name}
                          </div>
                          <div className="text-sm text-gray-500">Code: {feeStructure.code}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {feeStructure.description.substring(0, 50)}
                            {feeStructure.description.length > 50 && '...'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {formatCurrency(feeStructure.base_amount)}
                          </div>
                          <div className="mt-1">{getFrequencyBadge(feeStructure.frequency)}</div>
                          {feeStructure.is_recurring && (
                            <div className="text-xs text-blue-600 mt-1 flex items-center">
                              <Calendar className="w-3 h-3 mr-1" />
                              Recurring
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="max-w-xs">
                          {renderIndustryConfig(feeStructure.industry_config)}
                        </div>
                      </td>
                      <td className="px-6 py-4">{renderUsageStats(feeStructure)}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="space-y-1">
                          {getStatusBadge(feeStructure.is_active)}
                          <div className="text-xs text-gray-500">
                            Created: {formatDate(feeStructure.created_at)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button
                            onClick={() =>
                              navigate(`/incomes/fee-structures/${feeStructure.id}/view`)
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() =>
                              navigate(`/incomes/fee-structures/${feeStructure.id}/edit`)
                            }
                            className="text-green-600 hover:text-green-900"
                            title="Edit Fee Structure"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(feeStructure)}
                            className={`${
                              feeStructure.is_active
                                ? 'text-red-600 hover:text-red-900'
                                : 'text-green-600 hover:text-green-900'
                            }`}
                            title={feeStructure.is_active ? 'Deactivate' : 'Activate'}
                          >
                            {feeStructure.is_active ? (
                              <ToggleRight className="w-4 h-4" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.count > 0 && (
              <div className="px-6 py-3 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.currentPage} of {Math.ceil(pagination.count / 20)}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-1 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}

            {feeStructures.length === 0 && !loading && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <div className="text-4xl mb-4">⚙️</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No fee structures found
                  </h3>
                  <p className="text-gray-600 mb-4">
                    {Object.keys(filters).length > 0
                      ? 'Try adjusting your filters or create a new fee structure.'
                      : 'Get started by creating your first fee structure.'}
                  </p>
                  <button
                    onClick={() => navigate('/incomes/fee-structures/create')}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                  >
                    Create Fee Structure
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default IncomeFeeStructureListPage;
