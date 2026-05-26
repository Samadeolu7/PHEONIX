import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  User,
  FileText,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Send,
  Download,
  Eye,
  Edit,
  MessageSquare,
} from 'lucide-react';
import { discountService, DiscountApplication } from '../../services/discountService';
import { useToast } from '../../hooks/useToast';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const DiscountApplicationDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [application, setApplication] = useState<DiscountApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  const [approvalData, setApprovalData] = useState({
    effective_from: '',
    effective_to: '',
    review_notes: '',
    custom_discount_value: '',
  });

  const [rejectionData, setRejectionData] = useState({
    review_notes: '',
  });

  useEffect(() => {
    if (id) {
      fetchApplication();
    }
  }, [id]);

  const fetchApplication = async () => {
    try {
      setLoading(true);
      const response = await discountService.getDiscountApplication(parseInt(id!));
      setApplication(response);

      // Pre-fill approval data with application dates if available
      if (response.effective_from || response.effective_to) {
        setApprovalData(prev => ({
          ...prev,
          effective_from: response.effective_from || '',
          effective_to: response.effective_to || '',
        }));
      }
    } catch (error) {
      toast.error('Failed to fetch application details');
      console.error('Error fetching application:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitForApproval = async () => {
    if (!application) return;

    try {
      setActionLoading(true);
      await discountService.submitDiscountApplication(application.id, {
        program: application.program,
        client: application.client,
        application_date: application.application_date,
        reason: application.reason,
        supporting_documents: application.supporting_documents,
        custom_discount_value: application.custom_discount_value,
      });
      toast.success('Application submitted for approval');
      fetchApplication();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to submit application');
      console.error('Error submitting application:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!application) return;

    if (!approvalData.effective_from || !approvalData.review_notes.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setActionLoading(true);
      await discountService.approveDiscountApplication(application.id, {
        effective_from: approvalData.effective_from,
        effective_to: approvalData.effective_to || undefined,
        review_notes: approvalData.review_notes,
        custom_discount_value: approvalData.custom_discount_value || undefined,
      });
      toast.success('Application approved successfully');
      setShowApprovalModal(false);
      fetchApplication();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to approve application');
      console.error('Error approving application:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!application) return;

    if (!rejectionData.review_notes.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    try {
      setActionLoading(true);
      await discountService.rejectDiscountApplication(application.id, {
        review_notes: rejectionData.review_notes,
      });
      toast.success('Application rejected');
      setShowRejectionModal(false);
      fetchApplication();
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to reject application');
      console.error('Error rejecting application:', error);
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: {
        color: 'bg-gray-100 text-gray-800',
        icon: FileText,
        label: 'Draft',
      },
      submitted: {
        color: 'bg-blue-100 text-blue-800',
        icon: Send,
        label: 'Submitted',
      },
      under_review: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
        label: 'Under Review',
      },
      approved: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Approved',
      },
      rejected: {
        color: 'bg-red-100 text-red-800',
        icon: XCircle,
        label: 'Rejected',
      },
      expired: {
        color: 'bg-orange-100 text-orange-800',
        icon: AlertCircle,
        label: 'Expired',
      },
      revoked: {
        color: 'bg-purple-100 text-purple-800',
        icon: XCircle,
        label: 'Revoked',
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    const IconComponent = config.icon;

    return (
      <span
        className={`px-3 py-1 text-sm font-medium rounded-full flex items-center gap-2 ${config.color}`}
      >
        <IconComponent className="h-4 w-4" />
        {config.label}
      </span>
    );
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship/Grant',
      staff_benefit: 'Staff Benefit',
      discount: 'Customer Discount',
      waiver: 'Fee Waiver',
      insurance: 'Insurance Coverage',
      promotion: 'Promotional Discount',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const canEdit = application?.status === 'draft';
  const canSubmit = application?.status === 'draft';
  const canApprove = application?.status === 'submitted' || application?.status === 'under_review';
  const canReject = application?.status === 'submitted' || application?.status === 'under_review';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Application not found</h3>
        <p className="text-gray-600 mb-4">The requested application could not be found.</p>
        <button
          onClick={() => navigate('/discounts/applications')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Back to Applications
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/discounts/applications')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Application {application.application_number}
            </h1>
            <p className="text-gray-600">Discount application details and review</p>
          </div>
        </div>
        <div className="flex items-center gap-3">{getStatusBadge(application.status)}</div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Application Overview */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Application Number
                </label>
                <p className="text-gray-900">{application.application_number}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Application Date
                </label>
                <p className="text-gray-900 flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  {application.application_date
                    ? new Date(application.application_date).toLocaleDateString()
                    : new Date(application.created_at).toLocaleDateString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                {getStatusBadge(application.status)}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Active</label>
                <p className="text-gray-900">{application.is_active ? 'Yes' : 'No'}</p>
              </div>
            </div>
          </div>

          {/* Program Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Program Information
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program Name</label>
                <p className="text-gray-900 font-medium">
                  {application.program_detail?.name || `Program #${application.program}`}
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Program Type
                  </label>
                  <p className="text-gray-900">
                    {getProgramTypeLabel(application.program_detail?.program_type || 'discount')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Discount Amount
                  </label>
                  <p className="text-gray-900 font-medium flex items-center gap-1">
                    <DollarSign className="h-4 w-4 text-gray-400" />
                    {formatCurrency(application.actual_discount_value)}
                  </p>
                </div>
              </div>
              {application.custom_discount_value && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Custom Discount Value
                  </label>
                  <p className="text-gray-900">
                    {formatCurrency(application.custom_discount_value)}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Applicant Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Applicant Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <p className="text-gray-900">
                  {application.client_detail?.name || `Client #${application.client}`}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <p className="text-gray-900">
                  {application.client_detail?.email || 'No email provided'}
                </p>
              </div>
            </div>
          </div>

          {/* Application Details */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Application Details</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Application
              </label>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-gray-900 whitespace-pre-wrap">{application.reason}</p>
              </div>
            </div>

            {application.supporting_documents && application.supporting_documents.length > 0 && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Supporting Documents
                </label>
                <div className="space-y-2">
                  {application.supporting_documents.map((doc: any, index: number) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {doc.name || `Document ${index + 1}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="text-blue-600 hover:text-blue-700 p-1">
                          <Eye className="h-4 w-4" />
                        </button>
                        <button className="text-blue-600 hover:text-blue-700 p-1">
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Review Information */}
          {(application.reviewed_by_name || application.review_notes) && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Review Information
              </h2>

              <div className="space-y-4">
                {application.reviewed_by_name && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reviewed By
                      </label>
                      <p className="text-gray-900">{application.reviewed_by_name}</p>
                    </div>
                    {application.review_date && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Review Date
                        </label>
                        <p className="text-gray-900">
                          {new Date(application.review_date).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {application.review_notes && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Review Notes
                    </label>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {application.review_notes}
                      </p>
                    </div>
                  </div>
                )}

                {application.effective_from && application.status === 'approved' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-medium text-green-900 mb-2">Effective Period</h3>
                    <p className="text-green-800">
                      From: {new Date(application.effective_from).toLocaleDateString()}
                      {application.effective_to && (
                        <> to {new Date(application.effective_to).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Actions Sidebar */}
        <div className="space-y-6">
          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>

            <div className="space-y-3">
              {canEdit && (
                <button
                  onClick={() => navigate(`/discounts/applications/${application.id}/edit`)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
                >
                  <Edit className="h-4 w-4" />
                  Edit Application
                </button>
              )}

              {canSubmit && (
                <button
                  onClick={handleSubmitForApproval}
                  disabled={actionLoading}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  Submit for Approval
                </button>
              )}

              {canUserApprove && canApprove && (
                <button
                  onClick={() => setShowApprovalModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve Application
                </button>
              )}

              {canUserApprove && canReject && (
                <button
                  onClick={() => setShowRejectionModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Application
                </button>
              )}
            </div>
          </div>

          {/* Application Timeline */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-blue-600 rounded-full mt-2"></div>
                <div>
                  <p className="text-sm font-medium text-gray-900">Application Created</p>
                  <p className="text-xs text-gray-500">
                    {new Date(application.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {application.status !== 'draft' && (
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-yellow-600 rounded-full mt-2"></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">Submitted for Review</p>
                    <p className="text-xs text-gray-500">Status changed to submitted</p>
                  </div>
                </div>
              )}

              {application.review_date && (
                <div className="flex items-start gap-3">
                  <div
                    className={`w-2 h-2 rounded-full mt-2 ${
                      application.status === 'approved' ? 'bg-green-600' : 'bg-red-600'
                    }`}
                  ></div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {application.status === 'approved' ? 'Approved' : 'Rejected'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(application.review_date).toLocaleString()} by{' '}
                      {application.reviewed_by_name}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Approval Modal */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Approve Application</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Effective From *
                </label>
                <input
                  type="date"
                  value={approvalData.effective_from}
                  onChange={e =>
                    setApprovalData(prev => ({ ...prev, effective_from: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Effective To</label>
                <input
                  type="date"
                  value={approvalData.effective_to}
                  onChange={e =>
                    setApprovalData(prev => ({ ...prev, effective_to: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Discount Value
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={approvalData.custom_discount_value}
                  onChange={e =>
                    setApprovalData(prev => ({ ...prev, custom_discount_value: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Leave empty to use default"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Review Notes *
                </label>
                <textarea
                  value={approvalData.review_notes}
                  onChange={e =>
                    setApprovalData(prev => ({ ...prev, review_notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Reason for approval..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={actionLoading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Application</h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Rejection *
              </label>
              <textarea
                value={rejectionData.review_notes}
                onChange={e =>
                  setRejectionData(prev => ({ ...prev, review_notes: e.target.value }))
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="Please provide a detailed reason for rejecting this application..."
              />
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowRejectionModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountApplicationDetail;
