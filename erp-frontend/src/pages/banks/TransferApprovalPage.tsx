import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertCircle } from 'lucide-react';
import bankService from '../../services/bankService';
import type { BankTransfer } from '../../types/banks';
import { useApprovalGuard } from '../../hooks/useApprovalGuard';

const TransferApprovalPage: React.FC = () => {
  const { canUserApprove } = useApprovalGuard();
  const [transfers, setTransfers] = useState<BankTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTransfer, setSelectedTransfer] = useState<BankTransfer | null>(null);
  const [actionModal, setActionModal] = useState<{
    show: boolean;
    type: 'approve' | 'second_approve' | 'reject' | null;
    notes: string;
  }>({
    show: false,
    type: null,
    notes: '',
  });

  useEffect(() => {
    loadPendingApprovals();
  }, []);

  const loadPendingApprovals = async () => {
    try {
      setLoading(true);
      const data = await bankService.getPendingApprovals();
      setTransfers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load pending approvals');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedTransfer || !actionModal.type) return;

    try {
      if (actionModal.type === 'approve') {
        await bankService.approveTransfer(selectedTransfer.id, actionModal.notes);
      } else if (actionModal.type === 'second_approve') {
        await bankService.secondApproveTransfer(selectedTransfer.id, actionModal.notes);
      } else if (actionModal.type === 'reject') {
        if (!actionModal.notes) {
          alert('Please provide a rejection reason');
          return;
        }
        await bankService.rejectTransfer(selectedTransfer.id, actionModal.notes);
      }

      // Reload
      setActionModal({ show: false, type: null, notes: '' });
      setSelectedTransfer(null);
      loadPendingApprovals();
    } catch (err: any) {
      alert(err.message || 'Failed to perform action');
    }
  };

  const openActionModal = (
    transfer: BankTransfer,
    type: 'approve' | 'second_approve' | 'reject'
  ) => {
    setSelectedTransfer(transfer);
    setActionModal({ show: true, type, notes: '' });
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800';
  };

  const needsSecondApproval = (transfer: BankTransfer) => {
    return transfer.status === 'approved' && transfer.approved_by && !transfer.second_approved_by;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Transfer Approvals</h1>
        <p className="text-gray-600 mt-1">Review and approve pending transfers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Approval</p>
              <p className="text-2xl font-bold text-yellow-600">
                {transfers.filter(t => t.status === 'pending').length}
              </p>
            </div>
            <Clock className="w-10 h-10 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Awaiting 2nd Approval</p>
              <p className="text-2xl font-bold text-blue-600">
                {transfers.filter(t => needsSecondApproval(t)).length}
              </p>
            </div>
            <AlertCircle className="w-10 h-10 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Pending</p>
              <p className="text-2xl font-bold text-gray-900">{transfers.length}</p>
            </div>
            <CheckCircle className="w-10 h-10 text-gray-600" />
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Transfers Table */}
      {!loading && (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Transfer #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  From
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  To
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Amount
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transfers.map(transfer => (
                <tr key={transfer.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {transfer.transfer_number}
                    </div>
                    <div className="text-sm text-gray-500">
                      {new Date(transfer.transfer_date).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{transfer.source_display}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{transfer.destination_display}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      ₦{parseFloat(transfer.amount).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadge(
                        transfer.status
                      )}`}
                    >
                      {transfer.status}
                      {needsSecondApproval(transfer) && ' (2nd needed)'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex gap-2 justify-center">
                      {canUserApprove && transfer.status === 'pending' && (
                        <>
                          <button
                            onClick={() => openActionModal(transfer, 'approve')}
                            className="p-1 text-green-600 hover:text-green-700"
                            title="Approve"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => openActionModal(transfer, 'reject')}
                            className="p-1 text-red-600 hover:text-red-700"
                            title="Reject"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                      {canUserApprove && needsSecondApproval(transfer) && (
                        <>
                          <button
                            onClick={() => openActionModal(transfer, 'second_approve')}
                            className="p-1 text-blue-600 hover:text-blue-700"
                            title="Second Approval"
                          >
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => openActionModal(transfer, 'reject')}
                            className="p-1 text-red-600 hover:text-red-700"
                            title="Reject"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Empty State */}
          {transfers.length === 0 && (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No pending approvals</h3>
              <p className="text-gray-600">All transfers have been processed</p>
            </div>
          )}
        </div>
      )}

      {/* Action Modal */}
      {actionModal.show && selectedTransfer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-4">
                {actionModal.type === 'approve' && 'Approve Transfer'}
                {actionModal.type === 'second_approve' && 'Second Approval'}
                {actionModal.type === 'reject' && 'Reject Transfer'}
              </h2>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600 mb-2">Transfer Details:</p>
                <p className="font-medium">{selectedTransfer.transfer_number}</p>
                <p className="text-sm">₦{parseFloat(selectedTransfer.amount).toLocaleString()}</p>
                <p className="text-sm text-gray-600">{selectedTransfer.description}</p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {actionModal.type === 'reject' ? 'Rejection Reason *' : 'Notes'}
                </label>
                <textarea
                  value={actionModal.notes}
                  onChange={e => setActionModal({ ...actionModal, notes: e.target.value })}
                  rows={3}
                  required={actionModal.type === 'reject'}
                  placeholder={
                    actionModal.type === 'reject'
                      ? 'Enter reason for rejection...'
                      : 'Optional notes...'
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setActionModal({ show: false, type: null, notes: '' })}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAction}
                  className={`flex-1 px-4 py-2 rounded-lg text-white ${
                    actionModal.type === 'reject'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransferApprovalPage;
