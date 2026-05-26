import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  FileText,
  MessageSquare,
  Eye,
  Edit,
  RefreshCw,
} from 'lucide-react';
import { useBonusDeductionRequest } from '../../hooks/useBonusDeductionRequests';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';
import { hrService } from '../../services/hrService';
import {
  BonusDeductionRequestStatus,
  getBonusDeductionStatusColor,
  getBonusDeductionStatusLabel,
} from '../../types/hr';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { useQueryClient } from '@tanstack/react-query';

const BonusDeductionDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();
  const { canUserApprove } = useApprovalGuard();

  const [isProcessing, setIsProcessing] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const { request, isLoading, error, refetch } = useBonusDeductionRequest(Number(id));

  const handleApprove = async () => {
    if (!request) return;

    if (
      !confirm(
        `Approve ${request.component_type === 'EARNING' ? 'bonus' : 'deduction'} of ₦${parseFloat(request.amount).toLocaleString()} for ${request.staff_name}?`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.approveBonusDeductionRequest(request.id);
      success('Request approved successfully');
      queryClient.invalidateQueries(['bonus-deduction-request', request.id]);
      queryClient.invalidateQueries(['bonus-deduction-requests']);
      queryClient.invalidateQueries(['bonus-deduction-pending-count']);
      refetch();
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to approve request');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRejectClick = () => {
    setRejectionReason('');
    setShowRejectModal(true);
  };

  const handleRejectSubmit = async () => {
    if (!request) return;

    if (!rejectionReason.trim()) {
      showError('Please provide a reason for rejection');
      return;
    }

    setIsProcessing(true);
    try {
      await hrService.rejectBonusDeductionRequest(request.id, rejectionReason);
      success('Request rejected');
      setShowRejectModal(false);
      queryClient.invalidateQueries(['bonus-deduction-request', request.id]);
      queryClient.invalidateQueries(['bonus-deduction-requests']);
      queryClient.invalidateQueries(['bonus-deduction-pending-count']);
      refetch();
    } catch (err: any) {
      showError(err.response?.data?.error || 'Failed to reject request');
    } finally {
      setIsProcessing(false);
    }
  };

  const getStatusIcon = (status: BonusDeductionRequestStatus) => {
    switch (status) {
      case BonusDeductionRequestStatus.APPROVED:
        return <CheckCircle className="h-5 w-5" />;
      case BonusDeductionRequestStatus.REJECTED:
        return <XCircle className="h-5 w-5" />;
      case BonusDeductionRequestStatus.PENDING:
        return <Clock className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  const getComponentTypeIcon = (componentType: 'EARNING' | 'DEDUCTION') => {
    return componentType === 'EARNING' ? (
      <TrendingUp className="h-5 w-5 text-green-600" />
    ) : (
      <TrendingDown className="h-5 w-5 text-red-600" />
    );
  };

  const getComponentTypeColor = (componentType: 'EARNING' | 'DEDUCTION') => {
    return componentType === 'EARNING' ? 'text-green-600' : 'text-red-600';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatMonth = (monthString: string) => {
    return new Date(monthString).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Error Loading Request</h2>
          <p className="text-gray-600 mb-4">Please try again later.</p>
          <button
            onClick={() => navigate('/hr/bonus-deduction')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Requests
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading request details...</p>
        </div>
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Not Found</h2>
          <p className="text-gray-600 mb-4">
            The requested bonus/deduction request could not be found.
          </p>
          <button
            onClick={() => navigate('/hr/bonus-deduction')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Requests
          </button>
        </div>
      </div>
    );
  }

  const breadcrumbItems = [
    { label: 'HR & Payroll', href: '/hr' },
    { label: 'Bonus & Deduction Requests', href: '/hr/bonus-deduction' },
    { label: request.reference_number, current: true },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} className="mb-6" />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/hr/bonus-deduction')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{request.reference_number}</h1>
              <p className="text-gray-600">
                {request.component_type === 'EARNING' ? 'Bonus' : 'Deduction'} Request Details
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => refetch()}
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors duration-200"
              title="Refresh"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            {canUserApprove && request.is_pending && (
              <>
                <button
                  onClick={handleApprove}
                  disabled={isProcessing}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center disabled:opacity-50"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {isProcessing ? 'Approving...' : 'Approve'}
                </button>
                <button
                  onClick={handleRejectClick}
                  disabled={isProcessing}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request Overview */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Overview</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">Staff Member</p>
                      <p className="font-medium text-gray-900">{request.staff_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    {getComponentTypeIcon(request.component_type)}
                    <div className="ml-3">
                      <p className="text-sm text-gray-500">Component</p>
                      <p className="font-medium text-gray-900">{request.component_name}</p>
                      <p className={`text-xs ${getComponentTypeColor(request.component_type)}`}>
                        {request.component_type === 'EARNING' ? 'Bonus' : 'Deduction'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <DollarSign className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">Amount</p>
                      <p
                        className={`font-semibold text-lg ${getComponentTypeColor(request.component_type)}`}
                      >
                        ${parseFloat(request.amount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">For Month</p>
                      <p className="font-medium text-gray-900">{formatMonth(request.for_month)}</p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    {getStatusIcon(request.status)}
                    <div className="ml-3">
                      <p className="text-sm text-gray-500">Status</p>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-${getBonusDeductionStatusColor(request.status)}-100 text-${getBonusDeductionStatusColor(request.status)}-800`}
                      >
                        {getBonusDeductionStatusLabel(request.status)}
                      </span>
                    </div>
                  </div>

                  {request.applied_in_payroll && (
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm text-gray-500">Applied in Payroll</p>
                        <Link
                          to={`/hr/payroll/${request.applied_in_payroll}`}
                          className="font-medium text-blue-600 hover:text-blue-800"
                        >
                          View Payroll #{request.applied_in_payroll}
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Request Reason */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Reason</h2>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-700 whitespace-pre-wrap">{request.reason}</p>
              </div>
            </div>

            {/* Rejection Reason (if rejected) */}
            {request.is_rejected && request.rejection_reason && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <XCircle className="h-5 w-5 text-red-600 mr-2" />
                  Rejection Reason
                </h2>
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-700 whitespace-pre-wrap">{request.rejection_reason}</p>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Request Timeline */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Timeline</h2>

              <div className="space-y-4">
                {/* Request Created */}
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                    </div>
                  </div>
                  <div className="ml-3 flex-1">
                    <p className="text-sm font-medium text-gray-900">Request Created</p>
                    <p className="text-xs text-gray-500">by {request.requested_by_name}</p>
                    <p className="text-xs text-gray-400">{formatDate(request.requested_date)}</p>
                  </div>
                </div>

                {/* Approval/Rejection */}
                {(request.is_approved || request.is_rejected) && request.approved_date && (
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          request.is_approved ? 'bg-green-100' : 'bg-red-100'
                        }`}
                      >
                        {request.is_approved ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Request {request.is_approved ? 'Approved' : 'Rejected'}
                      </p>
                      {request.approved_by_name && (
                        <p className="text-xs text-gray-500">by {request.approved_by_name}</p>
                      )}
                      <p className="text-xs text-gray-400">{formatDate(request.approved_date)}</p>
                    </div>
                  </div>
                )}

                {/* Applied to Payroll */}
                {request.applied_in_payroll && (
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                        <FileText className="h-4 w-4 text-purple-600" />
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">Applied to Payroll</p>
                      <p className="text-xs text-gray-500">Payroll #{request.applied_in_payroll}</p>
                    </div>
                  </div>
                )}

                {/* Pending Status */}
                {request.is_pending && (
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center">
                        <Clock className="h-4 w-4 text-orange-600" />
                      </div>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">Awaiting Approval</p>
                      <p className="text-xs text-gray-500">Pending review</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Request Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Request Information</h2>

              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Reference Number</p>
                  <p className="font-medium text-gray-900">{request.reference_number}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Created</p>
                  <p className="font-medium text-gray-900">{formatDate(request.created_at)}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Last Updated</p>
                  <p className="font-medium text-gray-900">{formatDate(request.updated_at)}</p>
                </div>

                <div>
                  <p className="text-sm text-gray-500">Branch</p>
                  <p className="font-medium text-gray-900">Branch #{request.branch}</p>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>

              <div className="space-y-2">
                <Link
                  to={`/hr/staff/${request.staff}`}
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-200"
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Staff Details
                </Link>

                <Link
                  to="/hr/bonus-deduction/create"
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-200"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Create New Request
                </Link>

                <Link
                  to="/hr/bonus-deduction"
                  className="w-full flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors duration-200"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to All Requests
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reject Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Request</h3>
              <p className="text-sm text-gray-600 mb-4">
                You are about to reject the{' '}
                {request.component_type === 'EARNING' ? 'bonus' : 'deduction'} request for{' '}
                <span className="font-medium">{request.staff_name}</span>. Please provide a reason
                for rejection.
              </p>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                rows={4}
                placeholder="Enter rejection reason..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={handleRejectSubmit}
                  disabled={isProcessing || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium transition-colors duration-200"
                >
                  {isProcessing ? 'Rejecting...' : 'Reject Request'}
                </button>
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={isProcessing}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors duration-200"
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

export default BonusDeductionDetailPage;
