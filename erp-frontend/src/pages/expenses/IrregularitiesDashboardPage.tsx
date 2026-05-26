import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Eye,
  CheckCircle,
  XCircle,
  Filter,
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
} from 'lucide-react';
import {
  useIrregularities,
  useApproveConsumption,
  useRejectConsumption,
} from '../../hooks/useResourceConsumption';
import { IrregularityType } from '../../types/consumption';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const IrregularitiesDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { canUserApprove } = useApprovalGuard();
  const [selectedType, setSelectedType] = useState<IrregularityType | ''>('');
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [selectedConsumptionId, setSelectedConsumptionId] = useState<number | null>(null);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const { data: irregularitiesData, isLoading, error } = useIrregularities();
  const approveConsumption = useApproveConsumption();
  const rejectConsumption = useRejectConsumption();

  const getIrregularityIcon = (type: IrregularityType) => {
    switch (type) {
      case 'excessive_consumption':
        return <TrendingUp className="h-5 w-5 text-red-500" />;
      case 'low_usage':
        return <TrendingDown className="h-5 w-5 text-blue-500" />;
      case 'reading_rollback':
        return <Clock className="h-5 w-5 text-orange-500" />;
      case 'impossible_rate':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getIrregularityColor = (type: IrregularityType) => {
    switch (type) {
      case 'excessive_consumption':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'low_usage':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'reading_rollback':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'impossible_rate':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const getIrregularityDescription = (type: IrregularityType) => {
    const descriptions = {
      excessive_consumption: 'Usage exceeds expected by >20%',
      low_usage: 'Usage below expected by >50%',
      high_usage: 'Unusually high usage detected',
      duplicate_reading: 'Similar to previous reading',
      reading_rollback: 'Current reading less than previous',
      impossible_rate: 'Consumption rate not physically possible',
      no_usage: 'Consumption without corresponding usage',
      frequency_anomaly: 'Too frequent consumption',
    };
    return descriptions[type] || 'Unknown irregularity type';
  };

  const filteredConsumptions =
    irregularitiesData?.consumptions.filter(
      consumption => !selectedType || consumption.irregularity_type === selectedType
    ) || [];

  const irregularityStats =
    irregularitiesData?.consumptions.reduce(
      (acc, consumption) => {
        const type = consumption.irregularity_type;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    ) || {};

  const handleApprove = async () => {
    if (!selectedConsumptionId) return;

    try {
      await approveConsumption.mutateAsync({
        id: selectedConsumptionId,
        notes: approvalNotes,
      });
      setShowApprovalDialog(false);
      setSelectedConsumptionId(null);
      setApprovalNotes('');
      alert('Consumption approved successfully');
    } catch (error) {
      alert('Failed to approve consumption');
    }
  };

  const handleReject = async () => {
    if (!selectedConsumptionId || !rejectReason.trim()) return;

    try {
      await rejectConsumption.mutateAsync({
        id: selectedConsumptionId,
        reason: rejectReason,
      });
      setShowRejectDialog(false);
      setSelectedConsumptionId(null);
      setRejectReason('');
      alert('Consumption rejected successfully');
    } catch (error) {
      alert('Failed to reject consumption');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading irregularities...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading irregularities</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/expenses/resource-consumption"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to Consumptions
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Consumption Irregularities</h1>
            <p className="text-gray-600">Review and approve flagged consumption records</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-yellow-600" />
          <span className="text-lg font-semibold text-yellow-600">
            {irregularitiesData?.count || 0} Flagged Items
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Irregularities</p>
              <p className="text-2xl font-bold text-red-600">{irregularitiesData?.count || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Excessive Consumption</p>
              <p className="text-2xl font-bold text-red-500">
                {irregularityStats.excessive_consumption || 0}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-red-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Low Usage</p>
              <p className="text-2xl font-bold text-blue-500">{irregularityStats.low_usage || 0}</p>
            </div>
            <TrendingDown className="h-8 w-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Reading Issues</p>
              <p className="text-2xl font-bold text-orange-500">
                {(irregularityStats.reading_rollback || 0) +
                  (irregularityStats.impossible_rate || 0)}
              </p>
            </div>
            <Clock className="h-8 w-8 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-600" />
            <span className="font-medium text-gray-900">Filter by Irregularity Type</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedType('')}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                selectedType === ''
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Types ({irregularitiesData?.count || 0})
            </button>
            {Object.entries(irregularityStats).map(([type, count]) => (
              <button
                key={type}
                onClick={() => setSelectedType(type as IrregularityType)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedType === type
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type.replace('_', ' ')} ({count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Irregularities List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredConsumptions.length === 0 ? (
          <div className="p-8 text-center">
            <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Irregularities Found</h3>
            <p className="text-gray-600">
              {selectedType
                ? `No ${selectedType.replace('_', ' ')} irregularities found.`
                : 'All consumption records are within normal parameters.'}
            </p>
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
                    Irregularity
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource & Beneficiary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Variance
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
                        <div className="text-sm text-gray-500">{consumption.consumption_date}</div>
                        <div className="text-sm text-gray-500">
                          ${parseFloat(consumption.total_cost).toFixed(2)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {getIrregularityIcon(consumption.irregularity_type)}
                        <div>
                          <div
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getIrregularityColor(consumption.irregularity_type)}`}
                          >
                            {consumption.irregularity_type.replace('_', ' ')}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {getIrregularityDescription(consumption.irregularity_type)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {consumption.resource_name}
                        </div>
                        <div className="text-sm text-gray-500">{consumption.beneficiary_name}</div>
                        <div className="text-sm text-gray-500">
                          {consumption.quantity_consumed} {consumption.unit_of_measure}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        {consumption.variance_percentage && (
                          <div
                            className={`font-medium ${
                              parseFloat(consumption.variance_percentage) > 0
                                ? 'text-red-600'
                                : 'text-blue-600'
                            }`}
                          >
                            {parseFloat(consumption.variance_percentage) > 0 ? '+' : ''}
                            {consumption.variance_percentage}%
                          </div>
                        )}
                        <div className="text-gray-500 text-xs">
                          {consumption.irregularity_notes}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          consumption.status === 'flagged'
                            ? 'bg-yellow-100 text-yellow-800'
                            : consumption.status === 'submitted'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {consumption.status}
                      </span>
                      {consumption.explanation_provided && (
                        <div className="text-xs text-green-600 mt-1">Explanation provided</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() =>
                            navigate(`/expenses/resource-consumption/${consumption.id}`)
                          }
                          className="text-blue-600 hover:text-blue-900"
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        {canUserApprove &&
                          (consumption.status === 'submitted' ||
                            consumption.status === 'flagged') && (
                            <>
                              <button
                                onClick={() => {
                                  setSelectedConsumptionId(consumption.id);
                                  setShowApprovalDialog(true);
                                }}
                                className="text-green-600 hover:text-green-900"
                                title="Approve"
                              >
                                <CheckCircle size={16} />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedConsumptionId(consumption.id);
                                  setShowRejectDialog(true);
                                }}
                                className="text-red-600 hover:text-red-900"
                                title="Reject"
                              >
                                <XCircle size={16} />
                              </button>
                            </>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approval Dialog */}
      {showApprovalDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Approve Irregular Consumption
            </h3>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  This consumption has been flagged for irregularities. Please review carefully
                  before approving.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approval Notes (Optional)
                </label>
                <textarea
                  rows={3}
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Add any notes about this approval..."
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowApprovalDialog(false);
                    setSelectedConsumptionId(null);
                    setApprovalNotes('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveConsumption.isPending}
                  className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {approveConsumption.isPending ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Reject Irregular Consumption
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Rejection *
                </label>
                <textarea
                  rows={3}
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Please provide a detailed reason for rejection..."
                  required
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRejectDialog(false);
                    setSelectedConsumptionId(null);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectConsumption.isPending || !rejectReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectConsumption.isPending ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default IrregularitiesDashboardPage;
