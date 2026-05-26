// Leave Request Detail Page - View/Approve/Reject leave requests with full workflow
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Calendar,
  User,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Send,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import hrService from '../../services/hrService';
import { leaveBalanceService } from '../../services/leaveBalanceService';
import {
  LeaveRequestStatus,
  getLeaveRequestStatusColor,
  getLeaveRequestStatusLabel,
} from '../../types/hr';

const LeaveRequestDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const { canUserApprove } = useApprovalGuard();

  const [showApprovalForm, setShowApprovalForm] = useState(false);
  const [approvalAction, setApprovalAction] = useState<'approve' | 'reject' | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  // Fetch leave request data
  const {
    data: leaveRequest,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['leave-request', id],
    queryFn: () => hrService.getLeaveRequest(Number(id)),
    enabled: Boolean(id),
  });

  // Fetch leave balance for the staff and leave type
  const { data: leaveBalance, isLoading: balanceLoading } = useQuery({
    queryKey: [
      'leave-balance',
      leaveRequest?.staff,
      leaveRequest?.leave_type,
      new Date().getFullYear(),
    ],
    queryFn: () =>
      leaveBalanceService.getLeaveBalances({
        staff: leaveRequest?.staff,
        leave_type: leaveRequest?.leave_type,
        year: new Date().getFullYear(),
      }),
    enabled: Boolean(leaveRequest?.staff && leaveRequest?.leave_type),
  });

  // Submit leave request mutation
  const submitMutation = useMutation({
    mutationFn: () => {
      if (!leaveRequest) throw new Error('Leave request not found');

      // Extract only the fields needed for submission
      const submitData = {
        staff: leaveRequest.staff,
        leave_type: leaveRequest.leave_type,
        start_date: leaveRequest.start_date,
        end_date: leaveRequest.end_date,
        reason: leaveRequest.reason,
        medical_certificate: leaveRequest.medical_certificate,
        relief_officer: leaveRequest.relief_officer,
      };

      return hrService.submitLeaveRequest(Number(id), submitData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave request submitted for approval!');
    },
    onError: (error: any) => {
      console.error('Error submitting leave request:', error);
      toast.error('Failed to submit leave request. Please try again.');
    },
  });

  // Approve leave request mutation
  const approveMutation = useMutation({
    mutationFn: () => hrService.approveLeaveRequest(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave request approved successfully!');
      setShowApprovalForm(false);
    },
    onError: (error: any) => {
      console.error('Error approving leave request:', error);
      toast.error('Failed to approve leave request. Please try again.');
    },
  });

  // Reject leave request mutation
  const rejectMutation = useMutation({
    mutationFn: (reason: string) =>
      hrService.rejectLeaveRequest(Number(id), { rejection_reason: reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave request rejected successfully!');
      setShowApprovalForm(false);
      setRejectionReason('');
    },
    onError: (error: any) => {
      console.error('Error rejecting leave request:', error);
      toast.error('Failed to reject leave request. Please try again.');
    },
  });

  // Cancel leave request mutation
  const cancelMutation = useMutation({
    mutationFn: () => hrService.cancelLeaveRequest(Number(id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leave-request', id] });
      queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave request cancelled successfully!');
    },
    onError: (error: any) => {
      console.error('Error cancelling leave request:', error);
      toast.error('Failed to cancel leave request. Please try again.');
    },
  });

  const handleSubmit = async () => {
    if (!window.confirm('Are you sure you want to submit this leave request for approval?')) {
      return;
    }
    await submitMutation.mutateAsync();
  };

  const handleApprovalAction = (action: 'approve' | 'reject') => {
    setApprovalAction(action);
    setShowApprovalForm(true);
  };

  const handleApprovalSubmit = async () => {
    if (!approvalAction) return;

    if (approvalAction === 'reject' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    setIsSubmittingAction(true);

    try {
      if (approvalAction === 'approve') {
        await approveMutation.mutateAsync();
      } else {
        await rejectMutation.mutateAsync(rejectionReason);
      }
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Are you sure you want to cancel this leave request?')) {
      return;
    }
    await cancelMutation.mutateAsync();
  };

  const canEdit = () => {
    return leaveRequest?.status === LeaveRequestStatus.DRAFT;
  };

  const canSubmit = () => {
    return leaveRequest?.status === LeaveRequestStatus.DRAFT;
  };

  const canApprove = () => {
    return canUserApprove && leaveRequest?.status === LeaveRequestStatus.SUBMITTED;
  };

  const canCancel = () => {
    return (
      leaveRequest?.status === LeaveRequestStatus.DRAFT ||
      leaveRequest?.status === LeaveRequestStatus.SUBMITTED
    );
  };

  const getStatusIcon = (status: LeaveRequestStatus) => {
    switch (status) {
      case LeaveRequestStatus.APPROVED:
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case LeaveRequestStatus.REJECTED:
        return <XCircle className="h-5 w-5 text-red-600" />;
      case LeaveRequestStatus.SUBMITTED:
        return <Clock className="h-5 w-5 text-blue-600" />;
      case LeaveRequestStatus.CANCELLED:
        return <XCircle className="h-5 w-5 text-gray-600" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !leaveRequest) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Leave Request Not Found</h2>
          <p className="text-gray-600 mb-4">The leave request you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/hr/leave-requests')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Leave Requests
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/hr/leave-requests')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Leave Request Details</h1>
              <p className="text-gray-600">Review and manage leave request</p>
            </div>
          </div>
          <div className="flex space-x-3">
            {canEdit() && (
              <button
                onClick={() => navigate(`/hr/leave-requests/${id}/edit`)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </button>
            )}
            {canSubmit() && (
              <button
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center disabled:opacity-50"
              >
                <Send className="h-4 w-4 mr-2" />
                Submit for Approval
              </button>
            )}
            {canCancel() && (
              <button
                onClick={handleCancel}
                disabled={cancelMutation.isPending}
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center disabled:opacity-50"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Leave Request Information */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          {/* Status Header */}
          <div className={`bg-${getLeaveRequestStatusColor(leaveRequest.status)}-500 px-6 py-4`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center text-white">
                {getStatusIcon(leaveRequest.status)}
                <div className="ml-3">
                  <h2 className="text-lg font-semibold">{leaveRequest.reference_number}</h2>
                  <p className="text-sm opacity-90">
                    Status: {getLeaveRequestStatusLabel(leaveRequest.status)}
                  </p>
                </div>
              </div>
              <div className="text-right text-white">
                <p className="text-sm opacity-90">Submitted</p>
                <p className="font-medium">
                  {new Date(leaveRequest.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Staff Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                  Staff Information
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Staff Member</p>
                      <p className="text-gray-900">{leaveRequest.staff_name}</p>
                    </div>
                  </div>

                  {leaveRequest.relief_officer_name && (
                    <div className="flex items-center">
                      <User className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Relief Officer</p>
                        <p className="text-gray-900">{leaveRequest.relief_officer_name}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Leave Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                  Leave Details
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Leave Type</p>
                      <p className="text-gray-900">{leaveRequest.leave_type_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Duration</p>
                      <p className="text-gray-900">
                        {new Date(leaveRequest.start_date).toLocaleDateString()} -{' '}
                        {new Date(leaveRequest.end_date).toLocaleDateString()}
                      </p>
                      <p className="text-sm text-gray-500">
                        {leaveRequest.num_days} {leaveRequest.num_days === '1' ? 'day' : 'days'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Reason */}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">
                Reason for Leave
              </h3>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-900 whitespace-pre-wrap">{leaveRequest.reason}</p>
              </div>
            </div>

            {/* Medical Certificate */}
            {leaveRequest.medical_certificate && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">
                  Medical Certificate
                </h3>
                <div className="flex items-center p-4 bg-blue-50 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 mr-3" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Medical certificate attached
                    </p>
                    <a
                      href={leaveRequest.medical_certificate}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 text-sm"
                    >
                      View certificate
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Rejection Reason */}
            {leaveRequest.status === LeaveRequestStatus.REJECTED &&
              leaveRequest.rejection_reason && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2 mb-4">
                    Rejection Reason
                  </h3>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-red-800">{leaveRequest.rejection_reason}</p>
                  </div>
                </div>
              )}
          </div>
        </div>

        {/* Leave Balance Check */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Leave Balance Check</h3>
            <p className="text-sm text-gray-600">
              Current balance for {leaveRequest.leave_type_name}
            </p>
          </div>

          <div className="p-6">
            {balanceLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-gray-600">Loading balance...</span>
              </div>
            ) : leaveBalance?.results && leaveBalance.results.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {leaveBalance.results.map(balance => (
                  <div key={balance.id} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Allocated</p>
                      <p className="text-2xl font-bold text-blue-600">{balance.allocated_days}</p>
                      <p className="text-xs text-gray-500">days</p>
                    </div>
                  </div>
                ))}
                {leaveBalance.results.map(balance => (
                  <div key={`used-${balance.id}`} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Used</p>
                      <p className="text-2xl font-bold text-orange-600">{balance.used_days}</p>
                      <p className="text-xs text-gray-500">days</p>
                    </div>
                  </div>
                ))}
                {leaveBalance.results.map(balance => (
                  <div key={`pending-${balance.id}`} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Pending</p>
                      <p className="text-2xl font-bold text-yellow-600">{balance.pending_days}</p>
                      <p className="text-xs text-gray-500">days</p>
                    </div>
                  </div>
                ))}
                {leaveBalance.results.map(balance => (
                  <div key={`available-${balance.id}`} className="bg-gray-50 rounded-lg p-4">
                    <div className="text-center">
                      <p className="text-sm font-medium text-gray-500 mb-1">Available</p>
                      <p className="text-2xl font-bold text-green-600">{balance.available_days}</p>
                      <p className="text-xs text-gray-500">days</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500 text-lg">No leave balance found</p>
                <p className="text-gray-400">
                  This staff member has no balance for {leaveRequest.leave_type_name} in{' '}
                  {new Date().getFullYear()}
                </p>
              </div>
            )}

            {/* Balance Validation */}
            {leaveBalance?.results && leaveBalance.results.length > 0 && (
              <div className="mt-6 p-4 rounded-lg border">
                {leaveBalance.results.map(balance => {
                  const requestedDays = parseFloat(leaveRequest.num_days);
                  const availableDays = parseFloat(balance.available_days);
                  const hasEnoughBalance = availableDays >= requestedDays;

                  return (
                    <div
                      key={`validation-${balance.id}`}
                      className={`flex items-center gap-3 ${hasEnoughBalance ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'} p-3 rounded-lg`}
                    >
                      {hasEnoughBalance ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-600" />
                      )}
                      <div>
                        <p className="font-medium">
                          {hasEnoughBalance ? 'Sufficient Balance' : 'Insufficient Balance'}
                        </p>
                        <p className="text-sm">
                          Requested: {requestedDays} days | Available: {availableDays} days
                          {!hasEnoughBalance && (
                            <span className="ml-2 font-medium">
                              (Short by {(requestedDays - availableDays).toFixed(1)} days)
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Approval Actions */}
        {canApprove() && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Approval Actions</h3>
            <div className="flex space-x-4">
              <button
                onClick={() => handleApprovalAction('approve')}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Approve Request
              </button>
              <button
                onClick={() => handleApprovalAction('reject')}
                className="bg-red-600 text-white px-6 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject Request
              </button>
            </div>
          </div>
        )}

        {/* Approval Form Modal */}
        {showApprovalForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {approvalAction === 'approve' ? 'Approve Leave Request' : 'Reject Leave Request'}
              </h3>

              {approvalAction === 'reject' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reason for Rejection *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={e => setRejectionReason(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Please provide a reason for rejecting this leave request..."
                  />
                </div>
              )}

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowApprovalForm(false);
                    setApprovalAction(null);
                    setRejectionReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprovalSubmit}
                  disabled={isSubmittingAction}
                  className={`px-4 py-2 rounded-lg text-white transition-colors duration-200 flex items-center disabled:opacity-50 ${
                    approvalAction === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {isSubmittingAction ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : approvalAction === 'approve' ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  {approvalAction === 'approve' ? 'Approve' : 'Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaveRequestDetailPage;
