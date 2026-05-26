import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Clock,
  AlertTriangle,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Filter,
  Search,
  RefreshCw,
} from 'lucide-react';
import { resourceConsumptionService } from '../../services/resourceConsumptionService';
import { useToast } from '../../contexts/ToastContext';

const ApprovalQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'flagged'>('all');

  // Get consumptions pending approval
  const {
    data: consumptions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['resource-consumption-approval-queue', statusFilter],
    queryFn: () => {
      const params: any = {};
      if (statusFilter === 'submitted') {
        params.status = 'submitted';
      } else if (statusFilter === 'flagged') {
        params.status = 'flagged';
      } else {
        // Get both submitted and flagged
        return Promise.all([
          resourceConsumptionService.getConsumptions({ status: 'submitted' }),
          resourceConsumptionService.getConsumptions({ status: 'flagged' }),
        ]).then(([submitted, flagged]) => ({
          count: submitted.count + flagged.count,
          results: [...submitted.results, ...flagged.results],
        }));
      }
      return resourceConsumptionService.getConsumptions(params);
    },
  });

  // Filter consumptions based on search term
  const filteredConsumptions =
    consumptions?.results?.filter(
      consumption =>
        consumption.consumption_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consumption.resource_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        consumption.beneficiary_name.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

  const handleViewDetails = (id: number) => {
    navigate(`/expenses/resource-consumption/${id}/approve`);
  };

  const getStatusBadge = (status: string, isIrregular: boolean) => {
    if (isIrregular) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Flagged
        </span>
      );
    }

    if (status === 'submitted') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </span>
      );
    }

    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status}
      </span>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Approval Queue</h1>
          <p className="text-gray-600">Review and approve resource consumptions</p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending Approval</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredConsumptions.filter(c => c.status === 'submitted').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <AlertTriangle className="w-8 h-8 text-red-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Flagged Items</p>
              <p className="text-2xl font-bold text-gray-900">
                {filteredConsumptions.filter(c => c.is_irregular).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <ThumbsUp className="w-8 h-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Items</p>
              <p className="text-2xl font-bold text-gray-900">{filteredConsumptions.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search by number, resource, or beneficiary..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'submitted' | 'flagged')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Items</option>
              <option value="submitted">Pending Only</option>
              <option value="flagged">Flagged Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Consumptions List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {filteredConsumptions.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No items pending approval</h3>
            <p className="mt-1 text-sm text-gray-500">All consumptions have been processed.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
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
                {filteredConsumptions.map(consumption => (
                  <tr key={consumption.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {consumption.consumption_number}
                        </div>
                        <div className="text-sm text-gray-500">{consumption.payment_flow}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{consumption.resource_name}</div>
                      <div className="text-sm text-gray-500">
                        {consumption.quantity_consumed} {consumption.unit_of_measure}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{consumption.beneficiary_name}</div>
                      <div className="text-sm text-gray-500">
                        {consumption.beneficiary_reference}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₦{parseFloat(consumption.total_cost).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(consumption.consumption_date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(consumption.status, consumption.is_irregular)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleViewDetails(consumption.id)}
                        className="flex items-center text-blue-600 hover:text-blue-900"
                      >
                        <Eye className="w-4 h-4 mr-1" />
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApprovalQueuePage;
