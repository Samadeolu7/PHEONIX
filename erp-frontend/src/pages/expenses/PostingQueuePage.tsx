import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  DollarSign,
  Eye,
  Send,
  CheckSquare,
  Square,
  Filter,
  Search,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';
import { resourceConsumptionService } from '../../services/resourceConsumptionService';
import { useToast } from '../../contexts/ToastContext';

const PostingQueuePage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFlowFilter, setPaymentFlowFilter] = useState<'all' | 'prepaid' | 'postpaid'>('all');
  const [selectedItems, setSelectedItems] = useState<number[]>([]);

  // Get approved consumptions ready for posting
  const {
    data: consumptions,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['resource-consumption-posting-queue', paymentFlowFilter],
    queryFn: () => {
      const params: any = {
        status: 'approved',
        is_posted: false,
      };
      if (paymentFlowFilter !== 'all') {
        params.payment_flow = paymentFlowFilter;
      }
      return resourceConsumptionService.getConsumptions(params);
    },
  });

  // Bulk posting mutation
  const bulkPostMutation = useMutation({
    mutationFn: (consumptionIds: number[]) =>
      resourceConsumptionService.bulkPost(consumptionIds, false),
    onSuccess: result => {
      toast.success(`Successfully posted ${result.posted_count} consumptions`);
      if (result.failed > 0) {
        toast.warning(`${result.failed} items failed to post`);
      }
      if (result.skipped > 0) {
        toast.info(`${result.skipped} items were skipped`);
      }
      setSelectedItems([]);
      queryClient.invalidateQueries({ queryKey: ['resource-consumption-posting-queue'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post consumptions');
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

  const handleSelectAll = () => {
    if (selectedItems.length === filteredConsumptions.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(filteredConsumptions.map(c => c.id));
    }
  };

  const handleSelectItem = (id: number) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleViewDetails = (id: number) => {
    navigate(`/expenses/resource-consumption/${id}/post`);
  };

  const handleBulkPost = () => {
    if (selectedItems.length === 0) {
      toast.warning('Please select items to post');
      return;
    }
    bulkPostMutation.mutate(selectedItems);
  };

  const totalSelectedAmount = filteredConsumptions
    .filter(c => selectedItems.includes(c.id))
    .reduce((sum, c) => sum + parseFloat(c.total_cost), 0);

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
          <h1 className="text-2xl font-bold text-gray-900">Posting Queue</h1>
          <p className="text-gray-600">Post approved consumptions to accounting</p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => refetch()}
            className="flex items-center px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          {selectedItems.length > 0 && (
            <button
              onClick={handleBulkPost}
              disabled={bulkPostMutation.isPending}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <Send className="w-4 h-4 mr-2" />
              Post Selected ({selectedItems.length})
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <FileText className="w-8 h-8 text-blue-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Ready to Post</p>
              <p className="text-2xl font-bold text-gray-900">{filteredConsumptions.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <CheckSquare className="w-8 h-8 text-green-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Selected</p>
              <p className="text-2xl font-bold text-gray-900">{selectedItems.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <DollarSign className="w-8 h-8 text-purple-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Value</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦
                {filteredConsumptions
                  .reduce((sum, c) => sum + parseFloat(c.total_cost), 0)
                  .toLocaleString()}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center">
            <Send className="w-8 h-8 text-orange-500" />
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Selected Value</p>
              <p className="text-2xl font-bold text-gray-900">
                ₦{totalSelectedAmount.toLocaleString()}
              </p>
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
              value={paymentFlowFilter}
              onChange={e => setPaymentFlowFilter(e.target.value as 'all' | 'prepaid' | 'postpaid')}
              className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Payment Types</option>
              <option value="prepaid">Prepaid Only</option>
              <option value="postpaid">Postpaid Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Consumptions List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {filteredConsumptions.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No items ready for posting</h3>
            <p className="mt-1 text-sm text-gray-500">
              All approved consumptions have been posted.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left">
                    <button
                      onClick={handleSelectAll}
                      className="flex items-center text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
                    >
                      {selectedItems.length === filteredConsumptions.length ? (
                        <CheckSquare className="w-4 h-4 mr-2" />
                      ) : (
                        <Square className="w-4 h-4 mr-2" />
                      )}
                      Select All
                    </button>
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
                    Payment Flow
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
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
                      <button
                        onClick={() => handleSelectItem(consumption.id)}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        {selectedItems.includes(consumption.id) ? (
                          <CheckSquare className="w-5 h-5" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {consumption.consumption_number}
                        </div>
                        <div className="text-sm text-gray-500">
                          Approved:{' '}
                          {consumption.approved_at
                            ? new Date(consumption.approved_at).toLocaleDateString()
                            : 'N/A'}
                        </div>
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          consumption.payment_flow === 'prepaid'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-purple-100 text-purple-800'
                        }`}
                      >
                        {consumption.payment_flow}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      ₦{parseFloat(consumption.total_cost).toLocaleString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(consumption.consumption_date).toLocaleDateString()}
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

      {/* Bulk Post Confirmation */}
      {bulkPostMutation.isPending && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Posting Consumptions</h3>
                <p className="text-sm text-gray-500">
                  Please wait while we post {selectedItems.length} items...
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostingQueuePage;
