import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  XCircle,
  Calendar,
  User,
  Package,
  DollarSign,
  MapPin,
  FileText,
  AlertTriangle,
  Clock,
  TrendingUp,
  Eye,
} from 'lucide-react';
import {
  useVoucher,
  useVoucherConsumptions,
  useCancelVoucher,
  useDeleteVoucher,
} from '../../hooks/usePrepaidVouchers';

const VoucherDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const { data: voucher, isLoading, error } = useVoucher(Number(id));
  const { data: consumptions } = useVoucherConsumptions(Number(id));
  const cancelVoucher = useCancelVoucher();
  const deleteVoucher = useDeleteVoucher();

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      partially_used: 'bg-blue-100 text-blue-800',
      fully_used: 'bg-gray-100 text-gray-800',
      expired: 'bg-red-100 text-red-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getUsagePercentage = () => {
    if (!voucher) return 0;
    const allocated = parseFloat(voucher.allocated_units);
    const consumed = parseFloat(voucher.consumed_units);
    return allocated > 0 ? (consumed / allocated) * 100 : 0;
  };

  const getDaysUntilExpiry = () => {
    if (!voucher?.expiry_date) return null;
    const today = new Date();
    const expiry = new Date(voucher.expiry_date);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) return;

    try {
      await cancelVoucher.mutateAsync({
        id: Number(id),
        reason: cancelReason,
      });
      setShowCancelDialog(false);
      setCancelReason('');
      alert('Voucher cancelled successfully');
    } catch (error) {
      console.error('Cancel failed:', error);
      alert('Cancel failed');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this voucher?')) return;

    try {
      await deleteVoucher.mutateAsync(Number(id));
      alert('Voucher deleted successfully');
      navigate('/expenses/vouchers');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading voucher details...</div>
      </div>
    );
  }

  if (error || !voucher) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading voucher details</div>
      </div>
    );
  }

  const daysUntilExpiry = getDaysUntilExpiry();
  const usagePercentage = getUsagePercentage();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/expenses/vouchers')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to Vouchers
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{voucher.voucher_number}</h1>
            <p className="text-gray-600">{voucher.prepaid_expense_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(voucher.status)}`}
          >
            {voucher.status.replace('_', ' ')}
          </span>
          {voucher.is_redeemed && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
              Redeemed
            </span>
          )}
        </div>
      </div>

      {/* Expiry Warning */}
      {daysUntilExpiry !== null && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Voucher Expiring Soon</h3>
              <p className="text-sm text-yellow-700 mt-1">
                This voucher will expire in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}{' '}
                on {voucher.expiry_date}. Please use the remaining balance soon.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Expired Warning */}
      {daysUntilExpiry !== null && daysUntilExpiry <= 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Clock className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Voucher Expired</h3>
              <p className="text-sm text-red-700 mt-1">
                This voucher expired on {voucher.expiry_date}. It can no longer be used for new
                consumptions.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Voucher Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Issue Date</p>
                  <p className="font-medium">{voucher.issue_date}</p>
                </div>
              </div>
              {voucher.expiry_date && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Expiry Date</p>
                    <p className="font-medium">{voucher.expiry_date}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Expense Type</p>
                  <p className="font-medium">{voucher.prepaid_expense_name}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Usage</p>
                  <p className="font-medium">{usagePercentage.toFixed(1)}% used</p>
                </div>
              </div>
            </div>
          </div>

          {/* Beneficiary Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficiary Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-medium capitalize">{voucher.beneficiary_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Reference</p>
                <p className="font-medium">{voucher.beneficiary_reference}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{voucher.beneficiary_name}</p>
              </div>
              {voucher.asset_name && (
                <div>
                  <p className="text-sm text-gray-500">Asset</p>
                  <p className="font-medium">{voucher.asset_name}</p>
                </div>
              )}
              {voucher.employee_name && (
                <div>
                  <p className="text-sm text-gray-500">Employee</p>
                  <p className="font-medium">{voucher.employee_name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Allocation & Usage */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Allocation & Usage</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Allocated</p>
                  <p className="text-lg font-semibold text-blue-600">
                    {voucher.allocated_units} units
                  </p>
                  <p className="text-sm text-gray-500">
                    ${parseFloat(voucher.allocated_amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Consumed</p>
                  <p className="text-lg font-semibold text-orange-600">
                    {voucher.consumed_units} units
                  </p>
                  <p className="text-sm text-gray-500">
                    ${parseFloat(voucher.consumed_amount).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Remaining</p>
                  <p className="text-lg font-semibold text-green-600">
                    {voucher.remaining_units} units
                  </p>
                  <p className="text-sm text-gray-500">
                    ${parseFloat(voucher.remaining_amount).toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Usage Progress Bar */}
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Usage Progress</span>
                  <span>{usagePercentage.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(usagePercentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Redemption Information */}
          {voucher.is_redeemed && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Redemption Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {voucher.redemption_date && (
                  <div className="flex items-center gap-3">
                    <Calendar className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Redemption Date</p>
                      <p className="font-medium">{voucher.redemption_date}</p>
                    </div>
                  </div>
                )}
                {voucher.redemption_location && (
                  <div className="flex items-center gap-3">
                    <MapPin className="h-5 w-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Redemption Location</p>
                      <p className="font-medium">{voucher.redemption_location}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {voucher.notes && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Notes</h2>
              <p className="text-gray-700">{voucher.notes}</p>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="space-y-3">
              {voucher.status === 'active' && (
                <>
                  <button
                    onClick={() => navigate(`/expenses/vouchers/${id}/edit`)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    <Edit size={16} />
                    Edit Voucher
                  </button>
                  <button
                    onClick={() => setShowCancelDialog(true)}
                    className="w-full flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700"
                  >
                    <XCircle size={16} />
                    Cancel Voucher
                  </button>
                </>
              )}
              {voucher.status === 'cancelled' && (
                <button
                  onClick={handleDelete}
                  disabled={deleteVoucher.isPending}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  <FileText size={16} />
                  {deleteVoucher.isPending ? 'Deleting...' : 'Delete Voucher'}
                </button>
              )}
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Total Consumptions</span>
                <span className="font-medium">{voucher.consumption_count}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Created</span>
                <span className="font-medium">
                  {new Date(voucher.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Last Updated</span>
                <span className="font-medium">
                  {new Date(voucher.updated_at).toLocaleDateString()}
                </span>
              </div>
              {daysUntilExpiry !== null && (
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Days to Expiry</span>
                  <span
                    className={`font-medium ${daysUntilExpiry <= 7 ? 'text-red-600' : 'text-gray-900'}`}
                  >
                    {daysUntilExpiry > 0 ? daysUntilExpiry : 'Expired'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Consumption History Section */}
      <div className="mt-8 bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Consumption History</h2>
          <p className="text-sm text-gray-600 mt-1">All consumption records using this voucher</p>
        </div>

        {consumptions && consumptions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Consumption
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity & Cost
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location & Operator
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {consumptions.map(consumption => (
                  <tr key={consumption.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {consumption.consumption_number}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{consumption.consumption_date}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {consumption.quantity_consumed} units
                      </div>
                      <div className="text-sm text-gray-500">
                        ${parseFloat(consumption.total_cost).toFixed(2)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {consumption.consumption_location}
                      </div>
                      <div className="text-sm text-gray-500">{consumption.operator_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {consumption.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => navigate(`/expenses/resource-consumption/${consumption.id}`)}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        <Eye size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Consumption Records</h3>
            <p className="text-gray-600">This voucher hasn't been used for any consumption yet.</p>
          </div>
        )}
      </div>

      {/* Cancel Voucher Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancel Voucher</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Cancellation *
                </label>
                <textarea
                  rows={3}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  className="w-full border border-gray-300 rounded-md px-3 py-2"
                  placeholder="Please provide a reason for cancelling this voucher..."
                  required
                />
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  Cancelling this voucher will prevent it from being used for new consumptions. This
                  action cannot be undone.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCancelDialog(false);
                    setCancelReason('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCancel}
                  disabled={cancelVoucher.isPending || !cancelReason.trim()}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {cancelVoucher.isPending ? 'Cancelling...' : 'Cancel Voucher'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoucherDetailPage;
