import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  XCircle,
  Clock,
  Shield,
  FileText,
  User,
  Calendar,
  DollarSign,
  ArrowLeft,
  Filter,
  Search,
} from 'lucide-react';
import { useToast } from '../hooks/useToast';
import { useApprovalGuard } from '../hooks/useApprovalGuard';
import { FeeStructure } from '../services/incomeFeeStructureService';
import {
  useIncomeFeeStructures,
  useApproveFeeStructure,
  useRejectFeeStructure,
} from '../hooks/useIncomeFees';

const FeeStructureApprovalPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const { canUserApprove } = useApprovalGuard();

  const [selectedStructure, setSelectedStructure] = useState<FeeStructure | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [modalAction, setModalAction] = useState<'approve' | 'reject'>('approve');

  const [filters, setFilters] = useState({
    status: 'pending_approval' as 'pending_approval' | 'all' | 'approved' | 'rejected',
    search: '',
  });

  const { data, isLoading: loading } = useIncomeFeeStructures({ ordering: '-updated_at' });
  const approveMutation = useApproveFeeStructure();
  const rejectMutation = useRejectFeeStructure();

  const allStructures = data?.results ?? [];
  let feeStructures = allStructures;

  // Client-side filtering
  if (filters.status !== 'all') {
    feeStructures = feeStructures.filter(fs => fs.approval_status === filters.status);
  }
  if (filters.search) {
    feeStructures = feeStructures.filter(
      fs =>
        fs.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        fs.code.toLowerCase().includes(filters.search.toLowerCase())
    );
  }

  const handleApprove = async () => {
    if (!selectedStructure || !approvalNotes.trim()) {
      showError('Please provide approval notes');
      return;
    }

    try {
      await approveMutation.mutateAsync({ id: selectedStructure.id, approval_notes: approvalNotes });
      success(`Fee structure "${selectedStructure.name}" approved successfully`);
      setShowApprovalModal(false);
      setApprovalNotes('');
      setSelectedStructure(null);
    } catch (error) {
      console.error('Error approving fee structure:', error);
      showError('Failed to approve fee structure');
    }
  };

  const handleReject = async () => {
    if (!selectedStructure || !rejectReason.trim()) {
      showError('Please provide rejection reason');
      return;
    }

    try {
      await rejectMutation.mutateAsync({ id: selectedStructure.id, approval_notes: rejectReason });
      success(`Fee structure "${selectedStructure.name}" rejected`);
      setShowApprovalModal(false);
      setRejectReason('');
      setSelectedStructure(null);
    } catch (error) {
      console.error('Error rejecting fee structure:', error);
      showError('Failed to reject fee structure');
    }
  };

  const openApprovalModal = (structure: FeeStructure, action: 'approve' | 'reject') => {
    setSelectedStructure(structure);
    setModalAction(action);
    setShowApprovalModal(true);
    setApprovalNotes('');
    setRejectReason('');
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-GB');
  };

  const getStatusBadge = (status?: string) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', icon: FileText, label: 'Draft' },
      pending_approval: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
        label: 'Pending Approval',
      },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle, label: 'Approved' },
      rejected: { color: 'bg-red-100 text-red-800', icon: XCircle, label: 'Rejected' },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        <Icon className="h-4 w-4 mr-1" />
        {config.label}
      </span>
    );
  };

  const pendingCount = feeStructures.filter(fs => fs.approval_status === 'pending_approval').length;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => navigate('/incomes/fee-structures')}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 flex items-center">
                  <Shield className="h-6 w-6 mr-2 text-blue-600" />
                  Fee Structure Approvals
                </h1>
                <p className="text-gray-600">Review and approve fee structures for activation</p>
              </div>
            </div>
          </div>
          {pendingCount > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
              <p className="text-sm font-medium text-yellow-800">
                {pendingCount} pending approval{pendingCount !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or code..."
                value={filters.search}
                onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <select
              value={filters.status}
              onChange={e => setFilters(prev => ({ ...prev, status: e.target.value as any }))}
              className="border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Fee Structures List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : feeStructures.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Fee Structures Found</h3>
          <p className="text-gray-600">
            {filters.status === 'pending_approval'
              ? 'There are no fee structures pending approval at this time.'
              : 'No fee structures match your current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {feeStructures.map(structure => (
            <div
              key={structure.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
            >
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{structure.name}</h3>
                      {getStatusBadge(structure.approval_status)}
                    </div>
                    <p className="text-sm text-gray-600">
                      Code: {structure.code} • Category: {structure.category_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Base Amount</p>
                    <p className="text-xl font-bold text-gray-900">
                      {formatCurrency(structure.base_amount)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div className="flex items-center text-sm text-gray-600">
                    <DollarSign className="h-4 w-4 mr-2 text-gray-400" />
                    <span>
                      {structure.is_recurring ? `Recurring (${structure.frequency})` : 'One-time'}
                    </span>
                  </div>
                  <div className="flex items-center text-sm text-gray-600">
                    <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                    <span>Updated: {formatDate(structure.updated_at)}</span>
                  </div>
                  {structure.approved_by_name && (
                    <div className="flex items-center text-sm text-gray-600">
                      <User className="h-4 w-4 mr-2 text-gray-400" />
                      <span>By: {structure.approved_by_name}</span>
                    </div>
                  )}
                </div>

                {structure.approval_notes && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-md">
                    <p className="text-sm font-medium text-gray-700 mb-1">Approval Notes:</p>
                    <p className="text-sm text-gray-600">{structure.approval_notes}</p>
                  </div>
                )}

                {canUserApprove && structure.approval_status === 'pending_approval' && (
                  <div className="flex space-x-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => openApprovalModal(structure, 'approve')}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="flex-1 flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </button>
                    <button
                      onClick={() => openApprovalModal(structure, 'reject')}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                      className="flex-1 flex items-center justify-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </button>
                    <button
                      onClick={() => navigate(`/incomes/fee-structures/${structure.id}/view`)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      View Details
                    </button>
                  </div>
                )}

                {(structure.approval_status === 'approved' ||
                  structure.approval_status === 'rejected') && (
                  <div className="flex justify-end pt-4 border-t border-gray-200">
                    <button
                      onClick={() => navigate(`/incomes/fee-structures/${structure.id}/view`)}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      View Details
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approval/Rejection Modal */}
      {showApprovalModal && selectedStructure && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                {modalAction === 'approve' ? (
                  <CheckCircle className="h-8 w-8 text-green-600 mr-3" />
                ) : (
                  <XCircle className="h-8 w-8 text-red-600 mr-3" />
                )}
                <h3 className="text-lg font-semibold text-gray-900">
                  {modalAction === 'approve' ? 'Approve' : 'Reject'} Fee Structure
                </h3>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Fee Structure: <strong>{selectedStructure.name}</strong>
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {modalAction === 'approve' ? 'Approval Notes *' : 'Rejection Reason *'}
                </label>
                <textarea
                  rows={4}
                  value={modalAction === 'approve' ? approvalNotes : rejectReason}
                  onChange={e =>
                    modalAction === 'approve'
                      ? setApprovalNotes(e.target.value)
                      : setRejectReason(e.target.value)
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={
                    modalAction === 'approve'
                      ? 'Enter approval notes...'
                      : 'Enter reason for rejection...'
                  }
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowApprovalModal(false)}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={modalAction === 'approve' ? handleApprove : handleReject}
                  disabled={approveMutation.isPending || rejectMutation.isPending}
                  className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
                    modalAction === 'approve'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {(approveMutation.isPending || rejectMutation.isPending) ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent mr-2"></div>
                      Processing...
                    </div>
                  ) : modalAction === 'approve' ? (
                    'Approve'
                  ) : (
                    'Reject'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeeStructureApprovalPage;
