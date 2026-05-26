import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  Filter,
  Eye,
  Edit,
  Trash2,
  XCircle,
  AlertTriangle,
  Calendar,
  DollarSign,
  Package,
  Users,
} from 'lucide-react';
import { useVouchers, useDeleteVoucher, useCancelVoucher } from '../../hooks/usePrepaidVouchers';
import { VoucherFilters } from '../../types/vouchers';

const VoucherListPage: React.FC = () => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<VoucherFilters>({
    page: 1,
    ordering: '-created_at',
  });
  const [showFilters, setShowFilters] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [selectedVoucherId, setSelectedVoucherId] = useState<number | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const { data, isLoading, error } = useVouchers(filters);
  const deleteVoucher = useDeleteVoucher();
  const cancelVoucher = useCancelVoucher();

  const handleFilterChange = (key: keyof VoucherFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1,
    }));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this voucher?')) return;

    try {
      await deleteVoucher.mutateAsync(id);
      alert('Voucher deleted successfully');
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Delete failed');
    }
  };

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

  const getStatusColor = (status: string) => {
    const colors = {
      active: 'bg-green-100 text-green-800',
      partially_used: 'bg-blue-100 text-blue-800',
      fully_used: 'bg-gray-100 text-gray-800',
      expired: 'bg-yellow-100 text-yellow-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
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

  const isExpiringSoon = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    const expiry = new Date(expiryDate);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 7 && daysUntilExpiry > 0;
  };

  const isExpired = (expiryDate: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading vouchers...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading vouchers</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Prepaid Vouchers</h1>
          <p className="text-gray-600 mt-1">
            Manage prepaid vouchers for fuel, supplies, and other resources
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/expenses/vouchers/expiring"
            className="flex items-center gap-2 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors"
          >
            <AlertTriangle size={20} />
            Expiring Soon
          </Link>
          <Link
            to="/expenses/vouchers/create"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Create Voucher
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Vouchers</p>
              <p className="text-2xl font-bold text-gray-900">{data?.count || 0}</p>
            </div>
            <Package className="h-8 w-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Vouchers</p>
              <p className="text-2xl font-bold text-green-600">
                {data?.results.filter(v => v.status === 'active' || v.status === 'partially_used')
                  .length || 0}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Expiring Soon</p>
              <p className="text-2xl font-bold text-yellow-600">
                {data?.results.filter(v => isExpiringSoon(v.expiry_date)).length || 0}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-yellow-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Value</p>
              <p className="text-2xl font-bold text-purple-600">
                $
                {data?.results
                  .reduce((sum, v) => sum + parseFloat(v.remaining_amount || '0'), 0)
                  .toFixed(2) || '0.00'}
              </p>
            </div>
            <DollarSign className="h-8 w-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow mb-6">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 text-gray-700 hover:text-gray-900"
          >
            <Filter size={20} />
            Filters
          </button>
        </div>

        {showFilters && (
          <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status || ''}
                onChange={e => handleFilterChange('status', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="partially_used">Partially Used</option>
                <option value="fully_used">Fully Used</option>
                <option value="expired">Expired</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Beneficiary Type
              </label>
              <select
                value={filters.beneficiary_type || ''}
                onChange={e => handleFilterChange('beneficiary_type', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All Types</option>
                <option value="asset">Asset</option>
                <option value="employee">Employee</option>
                <option value="department">Department</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Redeemed Status
              </label>
              <select
                value={filters.is_redeemed?.toString() || ''}
                onChange={e =>
                  handleFilterChange(
                    'is_redeemed',
                    e.target.value === '' ? undefined : e.target.value === 'true'
                  )
                }
                className="w-full border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">All</option>
                <option value="true">Redeemed</option>
                <option value="false">Not Redeemed</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.search || ''}
                onChange={e => handleFilterChange('search', e.target.value || undefined)}
                className="w-full border border-gray-300 rounded-md px-3 py-2"
                placeholder="Search vouchers..."
              />
            </div>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Voucher
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Beneficiary
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Allocation
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Remaining
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
              {data?.results.map(voucher => (
                <tr
                  key={voucher.id}
                  className={`hover:bg-gray-50 ${
                    isExpiringSoon(voucher.expiry_date)
                      ? 'bg-yellow-50'
                      : isExpired(voucher.expiry_date)
                        ? 'bg-red-50'
                        : ''
                  }`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {voucher.voucher_number}
                      </div>
                      <div className="text-sm text-gray-500">
                        {voucher.issue_date && new Date(voucher.issue_date).toLocaleDateString()}
                      </div>
                      {voucher.expiry_date && (
                        <div
                          className={`text-xs ${
                            isExpired(voucher.expiry_date)
                              ? 'text-red-600'
                              : isExpiringSoon(voucher.expiry_date)
                                ? 'text-yellow-600'
                                : 'text-gray-500'
                          }`}
                        >
                          Expires: {new Date(voucher.expiry_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {voucher.prepaid_expense_name}
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
                        <div className="text-sm text-gray-500">{voucher.beneficiary_reference}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{voucher.allocated_units} units</div>
                    <div className="text-sm text-gray-500">
                      ${parseFloat(voucher.allocated_amount).toFixed(2)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {voucher.remaining_units} units
                    </div>
                    <div className="text-sm text-gray-500">
                      ${parseFloat(voucher.remaining_amount).toFixed(2)}
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                      <div
                        className="bg-blue-600 h-2 rounded-full"
                        style={{
                          width: `${((parseFloat(voucher.allocated_units) - parseFloat(voucher.remaining_units)) / parseFloat(voucher.allocated_units)) * 100}%`,
                        }}
                      ></div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(voucher.status || 'active')}`}
                    >
                      {voucher.status || 'active'}
                    </span>
                    {voucher.is_redeemed && (
                      <div className="text-xs text-green-600 mt-1">Redeemed</div>
                    )}
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
                      {voucher.status !== 'cancelled' && voucher.status !== 'fully_used' && (
                        <button
                          onClick={() => navigate(`/expenses/vouchers/${voucher.id}/edit`)}
                          className="text-green-600 hover:text-green-900"
                          title="Edit"
                        >
                          <Edit size={16} />
                        </button>
                      )}
                      {voucher.status === 'active' ||
                        (voucher.status === 'partially_used' && (
                          <button
                            onClick={() => {
                              setSelectedVoucherId(voucher.id);
                              setShowCancelDialog(true);
                            }}
                            className="text-orange-600 hover:text-orange-900"
                            title="Cancel Voucher"
                          >
                            <XCircle size={16} />
                          </button>
                        ))}
                      {voucher.status === 'cancelled' && (
                        <button
                          onClick={() => handleDelete(voucher.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.count > 20 && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <div className="flex-1 flex justify-between sm:hidden">
              <button
                onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                disabled={!data.previous}
                className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                disabled={!data.next}
                className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-gray-700">
                  Showing <span className="font-medium">{((filters.page || 1) - 1) * 20 + 1}</span>{' '}
                  to{' '}
                  <span className="font-medium">
                    {Math.min((filters.page || 1) * 20, data.count)}
                  </span>{' '}
                  of <span className="font-medium">{data.count}</span> results
                </p>
              </div>
              <div>
                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                  <button
                    onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                    disabled={!data.previous}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                    disabled={!data.next}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Next
                  </button>
                </nav>
              </div>
            </div>
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

export default VoucherListPage;
