import React, { useState } from 'react';
import {
  CheckCircle,
  XCircle,
  Clock,
  DollarSign,
  Calendar,
  User,
  Filter,
  Search,
} from 'lucide-react';
import { hrService } from '../../services/hrService';
import { useToast } from '../../contexts/ToastContext';
import { BonusDeductionRequest, BonusDeductionRequestStatus } from '../../types/hr';

interface BonusDeductionApprovalListProps {
  requests: BonusDeductionRequest[];
  onRefresh: () => void;
}

export const BonusDeductionApprovalList: React.FC<BonusDeductionApprovalListProps> = ({
  requests,
  onRefresh,
}) => {
  const { success, error: showError } = useToast();
  const [selectedRequest, setSelectedRequest] = useState<BonusDeductionRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const [filters, setFilters] = useState({
    status: '',
    componentType: '',
    search: '',
  });

  const handleApprove = async (request: BonusDeductionRequest) => {
    if (
      !confirm(
        `Approve ${request.component_type === 'EARNING' ? 'bonus' : 'deduction'} of $${request.amount} for ${request.staff_name}?`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.approveBonusDeductionRequest(request.id);
      success('Request approved successfully');
      onRefresh();
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectClick = (request: BonusDeductionRequest) => {
    setSelectedRequest(request);
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!selectedRequest) return;

    if (!rejectionReason.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.rejectBonusDeductionRequest(selectedRequest.id, rejectionReason);
      success('Request rejected');
      setShowRejectModal(false);
      setSelectedRequest(null);
      onRefresh();
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusBadge = (request: BonusDeductionRequest) => {
    switch (request.status) {
      case BonusDeductionRequestStatus.PENDING:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
            <Clock className="h-3 w-3" />
            Pending
          </span>
        );
      case BonusDeductionRequestStatus.APPROVED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded">
            <CheckCircle className="h-3 w-3" />
            Approved
          </span>
        );
      case BonusDeductionRequestStatus.REJECTED:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded">
            <XCircle className="h-3 w-3" />
            Rejected
          </span>
        );
    }
  };

  const filteredRequests = requests.filter(request => {
    if (filters.status && request.status !== filters.status) return false;
    if (filters.componentType && request.component_type !== filters.componentType) return false;
    if (
      filters.search &&
      !request.staff_name.toLowerCase().includes(filters.search.toLowerCase()) &&
      !request.component_name.toLowerCase().includes(filters.search.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-medium text-gray-700">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filters.search}
                onChange={e => setFilters({ ...filters, search: e.target.value })}
                placeholder="Staff or component..."
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Status</label>
            <select
              value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Type</label>
            <select
              value={filters.componentType}
              onChange={e => setFilters({ ...filters, componentType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Types</option>
              <option value="EARNING">Bonus</option>
              <option value="DEDUCTION">Deduction</option>
            </select>
          </div>
        </div>
      </div>

      {/* Requests List */}
      <div className="space-y-3">
        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <div className="text-gray-400 mb-2">
              <DollarSign className="h-12 w-12 mx-auto" />
            </div>
            <p className="text-gray-600">No requests found</p>
          </div>
        ) : (
          filteredRequests.map(request => (
            <div
              key={request.id}
              className="bg-white rounded-lg shadow-sm border p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className={`p-2 rounded-lg ${
                        request.component_type === 'EARNING' ? 'bg-green-100' : 'bg-red-100'
                      }`}
                    >
                      <DollarSign
                        className={`h-5 w-5 ${
                          request.component_type === 'EARNING' ? 'text-green-600' : 'text-red-600'
                        }`}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">
                        {request.component_name} - ${request.amount}
                      </h3>
                      <p className="text-sm text-gray-600">{request.reference_number}</p>
                    </div>
                    {getStatusBadge(request)}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-11 mb-3">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User className="h-4 w-4" />
                      <span>{request.staff_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span>
                        For{' '}
                        {new Date(request.for_month).toLocaleDateString('en-US', {
                          month: 'long',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="ml-11 p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Reason:</span> {request.reason}
                    </p>
                  </div>

                  <div className="ml-11 mt-2 text-xs text-gray-500">
                    Requested by {request.requested_by_name} on{' '}
                    {new Date(request.requested_date).toLocaleDateString()}
                    {request.approved_by_name && (
                      <>
                        {' • '}
                        {request.status === 'APPROVED' ? 'Approved' : 'Rejected'} by{' '}
                        {request.approved_by_name}
                      </>
                    )}
                  </div>

                  {request.rejection_reason && (
                    <div className="ml-11 mt-2 p-2 bg-red-50 border border-red-200 rounded">
                      <p className="text-xs text-red-800">
                        <span className="font-medium">Rejection reason:</span>{' '}
                        {request.rejection_reason}
                      </p>
                    </div>
                  )}
                </div>

                {request.is_pending && (
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleApprove(request)}
                      disabled={isProcessing}
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm font-medium"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => handleRejectClick(request)}
                      disabled={isProcessing}
                      className="px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
                    >
                      Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Reject Modal */}
      {showRejectModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Request</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to reject the{' '}
                {selectedRequest.component_type === 'EARNING' ? 'bonus' : 'deduction'} request for{' '}
                <span className="font-medium">{selectedRequest.staff_name}</span>. Please provide a
                reason for rejection.
              </p>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="Enter rejection reason..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRejectSubmit}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                >
                  {isProcessing ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BonusDeductionApprovalList;
