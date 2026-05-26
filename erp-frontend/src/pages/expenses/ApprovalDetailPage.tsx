import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowLeft,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Calendar,
  DollarSign,
  Gauge,
  MapPin,
  User,
} from 'lucide-react';
import { resourceConsumptionService } from '../../services/resourceConsumptionService';
import { useToast } from '../../contexts/ToastContext';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const ApprovalDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [showRejectionForm, setShowRejectionForm] = useState(false);

  const { data: consumption, isLoading } = useQuery({
    queryKey: ['resource-consumption', id],
    queryFn: () => resourceConsumptionService.getConsumption(parseInt(id!)),
    enabled: !!id,
  });

  const approveMutation = useMutation({
    mutationFn: (notes?: string) =>
      resourceConsumptionService.approveConsumption(parseInt(id!), notes),
    onSuccess: () => {
      toast.success('Consumption approved successfully');
      queryClient.invalidateQueries({ queryKey: ['resource-consumption'] });
      navigate('/expenses/resource-consumption/approval-queue');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to approve consumption');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      resourceConsumptionService.rejectConsumption(parseInt(id!), reason),
    onSuccess: () => {
      toast.success('Consumption rejected successfully');
      queryClient.invalidateQueries({ queryKey: ['resource-consumption'] });
      navigate('/expenses/resource-consumption/approval-queue');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to reject consumption');
    },
  });

  const handleApprove = () => {
    approveMutation.mutate(approvalNotes);
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }
    rejectMutation.mutate(rejectionReason);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!consumption) {
    return (
      <div className="text-center py-12">
        <XCircle className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Consumption not found</h3>
      </div>
    );
  }

  const canApprove = consumption.status === 'submitted' || consumption.status === 'flagged';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/expenses/resource-consumption/approval-queue')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Approve Consumption</h1>
            <p className="text-gray-600">{consumption.consumption_number}</p>
          </div>
        </div>

        {canUserApprove && canApprove && (
          <div className="flex space-x-3">
            <button
              onClick={() => setShowRejectionForm(true)}
              disabled={rejectMutation.isPending}
              className="flex items-center px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-50"
            >
              <ThumbsDown className="w-4 h-4 mr-2" />
              Reject
            </button>
            <button
              onClick={() => setShowApprovalForm(true)}
              disabled={approveMutation.isPending}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <ThumbsUp className="w-4 h-4 mr-2" />
              Approve
            </button>
          </div>
        )}
      </div>

      {/* Status Alert */}
      {consumption.is_irregular && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-orange-800">Irregularity Detected</h3>
              <div className="mt-2 text-sm text-orange-700">
                <p>
                  <strong>Type:</strong> {consumption.irregularity_type}
                </p>
                <p>
                  <strong>Variance:</strong> {consumption.variance_percentage}%
                </p>
                {consumption.irregularity_notes && (
                  <p>
                    <strong>Notes:</strong> {consumption.irregularity_notes}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Consumption Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Resource</p>
                  <p className="font-medium">{consumption.resource_name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">
                    {new Date(consumption.consumption_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <DollarSign className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Total Cost</p>
                  <p className="font-medium">
                    ₦{parseFloat(consumption.total_cost).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Gauge className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Quantity</p>
                  <p className="font-medium">
                    {consumption.quantity_consumed} {consumption.unit_of_measure}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Beneficiary Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficiary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{consumption.beneficiary_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Reference</p>
                <p className="font-medium">{consumption.beneficiary_reference}</p>
              </div>
              {consumption.asset_name && (
                <div>
                  <p className="text-sm text-gray-500">Asset</p>
                  <p className="font-medium">{consumption.asset_name}</p>
                </div>
              )}
              {consumption.operator_name && (
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Operator</p>
                    <p className="font-medium">{consumption.operator_name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Readings & Consumption Rate */}
          {consumption.reading_type && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Readings & Efficiency</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Previous Reading</p>
                  <p className="font-medium">{consumption.previous_reading}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Current Reading</p>
                  <p className="font-medium">{consumption.current_reading}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Usage Since Last</p>
                  <p className="font-medium">{consumption.usage_since_last}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Consumption Rate</p>
                  <p className="font-medium">{consumption.consumption_rate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Expected Consumption</p>
                  <p className="font-medium">{consumption.expected_consumption}</p>
                </div>
                {consumption.variance_percentage && (
                  <div>
                    <p className="text-sm text-gray-500">Variance</p>
                    <p
                      className={`font-medium ${parseFloat(consumption.variance_percentage) > 10 ? 'text-red-600' : 'text-green-600'}`}
                    >
                      {consumption.variance_percentage}%
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Current Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    consumption.status === 'submitted'
                      ? 'bg-blue-100 text-blue-800'
                      : consumption.status === 'flagged'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {consumption.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Payment Flow</span>
                <span className="text-sm font-medium">{consumption.payment_flow}</span>
              </div>
              {consumption.is_irregular && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Irregular</span>
                  <AlertTriangle className="w-4 h-4 text-orange-500" />
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          {consumption.payment_flow === 'prepaid' && consumption.prepaid_voucher_number && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Voucher Info</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-500">Voucher Number</p>
                  <p className="font-medium">{consumption.prepaid_voucher_number}</p>
                </div>
                {consumption.remaining_voucher_balance && (
                  <div>
                    <p className="text-sm text-gray-500">Remaining Balance</p>
                    <p className="font-medium">
                      {consumption.remaining_voucher_balance.units} units
                    </p>
                    <p className="text-sm text-gray-500">
                      ₦{parseFloat(consumption.remaining_voucher_balance.amount).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Info */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h3>
            <div className="space-y-3">
              {consumption.consumption_location && (
                <div className="flex items-start space-x-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="text-sm">{consumption.consumption_location}</p>
                  </div>
                </div>
              )}
              {consumption.receipt_number && (
                <div>
                  <p className="text-sm text-gray-500">Receipt Number</p>
                  <p className="text-sm font-medium">{consumption.receipt_number}</p>
                </div>
              )}
              {consumption.notes && (
                <div>
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="text-sm">{consumption.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Form Modal */}
      {showApprovalForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Approve Consumption</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Approval Notes (Optional)
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={e => setApprovalNotes(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any notes about this approval..."
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowApprovalForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approveMutation.isPending}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Form Modal */}
      {showRejectionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Consumption</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Rejection *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={e => setRejectionReason(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  placeholder="Please provide a reason for rejecting this consumption..."
                  required
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setShowRejectionForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejectMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApprovalDetailPage;
