import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  AlertTriangle,
  Calendar,
  DollarSign,
  Package,
  Eye,
  Edit,
  XCircle,
  Clock,
  Filter,
} from 'lucide-react';
import { useExpiringVouchers, useCancelVoucher } from '../../hooks/usePrepaidVouchers';

const ExpiringVouchersDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [daysFilter, setDaysFilter] = useState(7);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data: expiringVouchers, isLoading, error } = useExpiringVouchers(daysFilter);
  const cancelVoucher = useCancelVoucher();

  const handleCancel = async () => {
    if (!selectedVoucherId || !cancelReason.trim()) return;

    try {
      await cancelVoucher.mutateAsync({
        id: selectedVoucherId,
        reason: cancelReason,
      });
      setShowCancelDialog(false);
      setSelectedVoucherId(null);
      setCancelReason('');
      alert('Voucher cancelled successfully');
    } catch (error) {
      console.error('Cancel failed:', error);
      alert('Cancel failed');
    }
  };

  const getDaysUntilExpiry = (expiryDate: string | null) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    const now = new Date();
    return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getUrgencyColor = (days: number | null) => {
    if (days === null) return 'text-gray-600';
    if (days <= 0) return 'text-red-600';
    if (days <= 1) return 'text-red-500';
    if (days <= 3) return 'text-orange-500';
    if (days <= 7) return 'text-yellow-600';
    return 'text-gray-600';
  };

  const getBeneficiaryIcon = (type: string) => {
    switch (type) {
      case 'asset':
        return '🚗';
      case 'employee':
        return '👤';
      case 'department':
        return '🏢';
      default:
        return '📦';
    }
  };

  const groupVouchersByUrgency = () => {
    if (!expiringVouchers) return { expired: [], critical: [], warning: [], upcoming: [] };

    return expiringVouchers.reduce(
      (groups, voucher) => {
        const days = getDaysUntilExpiry(voucher.expiry_date);

        if (days === null) {
          groups.upcoming.push(voucher);
        } else if (days <= 0) {
          groups.expired.push(voucher);
        } else if (days <= 1) {
          groups.critical.push(voucher);
        } else if (days <= 3) {
          groups.warning.push(voucher);
        } else {
          groups.upcoming.push(voucher);
        }

        return groups;
      },
      { expired: [], critical: [], warning: [], upcoming: [] } as any
    );
  };

  const voucherGroups = groupVouchersByUrgency();
  const totalValue =
    expiringVouchers?.reduce((sum, v) => sum + parseFloat(v.remaining_amount || '0'), 0) || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading expiring vouchers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading expiring vouchers</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link
            to="/expenses/vouchers"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to Vouchers
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Expiring Vouchers</h1>
            <p className="text-gray-600">
              Monitor and manage vouchers expiring within {daysFilter} days
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AlertTriangle className="h-6 w-6 text-yellow-600" />
          <span className="text-lg font-semibold text-yellow-600">
            {expiringVouchers?.length || 0} Vouchers
          </span>
        </div>
      </div>

      {/* Filter */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Filter size={20} className="text-gray-600" />
            <span className="font-medium text-gray-900">Time Range</span>
          </div>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {[1, 3, 7, 14, 30].map(days => (
              <button
                key={days}
                onClick={() => setDaysFilter(days)}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  daysFilter === days
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {days} day{days !== 1 ? 's' : ''}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Expiring</p>
              <p className="text-2xl font-bold text-yellow-600">{expiringVouchers?.length || 0}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Already Expired</p>
              <p className="text-2xl font-bold text-red-600">{voucherGroups.expired.length}</p>
            </div>
            <XCircle className="h-8 w-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Critical (≤1 day)</p>
              <p className="text-2xl font-bold text-orange-600">{voucherGroups.critical.length}</p>
            </div>
            <Clock className="h-8 w-8 text-orange-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value at Risk</p>
              <p className="text-2xl font-bold text-purple-600">${totalValue.toFixed(2)}</p>
            </div>
            <DollarSign className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* No Expiring Vouchers */}
      {(!expiringVouchers || expiringVouchers.length === 0) && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Expiring Vouchers</h3>
          <p className="text-gray-600">
            Great! No vouchers are expiring within the next {daysFilter} day
            {daysFilter !== 1 ? 's' : ''}.
          </p>
          <Link
            to="/expenses/vouchers"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Package size={16} />
            View All Vouchers
          </Link>
        </div>
      )}

      {/* Expired Vouchers */}
      {voucherGroups.expired.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200 bg-red-50">
            <div className="flex items-center gap-2">
              <XCircle size={20} className="text-red-600" />
              <h2 className="text-lg font-semibold text-red-900">
                Expired Vouchers ({voucherGroups.expired.length})
              </h2>
            </div>
            <p className="text-sm text-red-700 mt-1">
              These vouchers have already expired and should be reviewed immediately.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voucher
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource & Beneficiary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expired
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {voucherGroups.expired.map(voucher => {
                  const daysExpired = Math.abs(getDaysUntilExpiry(voucher.expiry_date) || 0);
                  return (
                    <tr key={voucher.id} className="bg-red-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {voucher.voucher_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {voucher.prepaid_expense_name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {getBeneficiaryIcon(voucher.beneficiary_type)}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {voucher.beneficiary_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {voucher.beneficiary_reference}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          ${parseFloat(voucher.remaining_amount).toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">{voucher.remaining_units} units</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-red-600">
                          {daysExpired} day{daysExpired !== 1 ? 's' : ''} ago
                        </div>
                        <div className="text-sm text-gray-500">
                          {voucher.expiry_date &&
                            new Date(voucher.expiry_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedVoucherId(voucher.id);
                              setShowCancelDialog(true);
                            }}
                            className="text-red-600 hover:text-red-900"
                            title="Cancel Voucher"
                          >
                            <XCircle size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Critical Vouchers (≤1 day) */}
      {voucherGroups.critical.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200 bg-orange-50">
            <div className="flex items-center gap-2">
              <Clock size={20} className="text-orange-600" />
              <h2 className="text-lg font-semibold text-orange-900">
                Critical - Expiring Within 1 Day ({voucherGroups.critical.length})
              </h2>
            </div>
            <p className="text-sm text-orange-700 mt-1">
              These vouchers expire very soon and need immediate attention.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voucher
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource & Beneficiary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {voucherGroups.critical.map(voucher => {
                  const daysLeft = getDaysUntilExpiry(voucher.expiry_date);
                  return (
                    <tr key={voucher.id} className="bg-orange-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {voucher.voucher_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {voucher.prepaid_expense_name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {getBeneficiaryIcon(voucher.beneficiary_type)}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {voucher.beneficiary_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {voucher.beneficiary_reference}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          ${parseFloat(voucher.remaining_amount).toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">{voucher.remaining_units} units</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${getUrgencyColor(daysLeft)}`}>
                          {daysLeft === 1
                            ? 'Tomorrow'
                            : daysLeft === 0
                              ? 'Today'
                              : `${daysLeft} days`}
                        </div>
                        <div className="text-sm text-gray-500">
                          {voucher.expiry_date &&
                            new Date(voucher.expiry_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}/edit`)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Warning Vouchers (2-7 days) */}
      {voucherGroups.warning.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200 bg-yellow-50">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-yellow-600" />
              <h2 className="text-lg font-semibold text-yellow-900">
                Warning - Expiring in 2-3 Days ({voucherGroups.warning.length})
              </h2>
            </div>
            <p className="text-sm text-yellow-700 mt-1">
              These vouchers will expire soon. Consider using them or extending their validity.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voucher
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource & Beneficiary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {voucherGroups.warning.map(voucher => {
                  const daysLeft = getDaysUntilExpiry(voucher.expiry_date);
                  return (
                    <tr key={voucher.id} className="bg-yellow-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {voucher.voucher_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {voucher.prepaid_expense_name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {getBeneficiaryIcon(voucher.beneficiary_type)}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {voucher.beneficiary_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {voucher.beneficiary_reference}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          ${parseFloat(voucher.remaining_amount).toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">{voucher.remaining_units} units</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`text-sm font-medium ${getUrgencyColor(daysLeft)}`}>
                          {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                        </div>
                        <div className="text-sm text-gray-500">
                          {voucher.expiry_date &&
                            new Date(voucher.expiry_date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}/edit`)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upcoming Vouchers (4+ days) */}
      {voucherGroups.upcoming.length > 0 && (
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-blue-600" />
              <h2 className="text-lg font-semibold text-gray-900">
                Upcoming Expiries ({voucherGroups.upcoming.length})
              </h2>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              These vouchers will expire within your selected timeframe.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Voucher
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Resource & Beneficiary
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Remaining Value
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Expires In
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {voucherGroups.upcoming.map(voucher => {
                  const daysLeft = getDaysUntilExpiry(voucher.expiry_date);
                  return (
                    <tr key={voucher.id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {voucher.voucher_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {voucher.prepaid_expense_name}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">
                            {getBeneficiaryIcon(voucher.beneficiary_type)}
                          </span>
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {voucher.beneficiary_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {voucher.beneficiary_reference}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          ${parseFloat(voucher.remaining_amount).toFixed(2)}
                        </div>
                        <div className="text-sm text-gray-500">{voucher.remaining_units} units</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {daysLeft ? `${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : 'No expiry'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {voucher.expiry_date
                            ? new Date(voucher.expiry_date).toLocaleDateString()
                            : 'No expiry date'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}`)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            onClick={() => navigate(`/expenses/vouchers/${voucher.id}/edit`)}
                            className="text-green-600 hover:text-green-900"
                            title="Edit"
                          >
                            <Edit size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cancel Voucher Dialog */}
      {showCancelDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Cancel Voucher</h3>
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-sm text-yellow-800">
                  Cancelling this voucher will make it unusable. This action cannot be undone.
                </p>
              </div>
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
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowCancelDialog(false);
                    setSelectedVoucherId(null);
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

export default ExpiringVouchersDashboard;
