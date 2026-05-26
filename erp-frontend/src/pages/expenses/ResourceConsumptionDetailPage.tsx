import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  XCircle,
  AlertTriangle,
  DollarSign,
  Package,
  Calendar,
  User,
  MapPin,
  FileText,
  Trash2,
} from 'lucide-react';
import {
  useConsumption,
  usePostConsumption,
  useDeleteConsumption,
} from '../../hooks/useResourceConsumption';

const ResourceConsumptionDetailPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [showPostDialog, setShowPostDialog] = useState(false);
  const [postExplanation, setPostExplanation] = useState('');

  const { data: consumption, isLoading, error } = useConsumption(Number(id));
  const postConsumption = usePostConsumption();
  const deleteConsumption = useDeleteConsumption();

  const getStatusColor = (status: string) => {
    const colors = {
      draft: 'bg-gray-100 text-gray-800',
      submitted: 'bg-blue-100 text-blue-800',
      flagged: 'bg-yellow-100 text-yellow-800',
      approved: 'bg-green-100 text-green-800',
      posted: 'bg-purple-100 text-purple-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle size={20} className="text-green-600" />;
      case 'posted':
        return <DollarSign size={20} className="text-purple-600" />;
      case 'cancelled':
        return <XCircle size={20} className="text-red-600" />;
      case 'flagged':
        return <AlertTriangle size={20} className="text-yellow-600" />;
      default:
        return <Package size={20} className="text-gray-600" />;
    }
  };

  const handlePost = async () => {
    try {
      await postConsumption.mutateAsync({
        id: Number(id),
        explanation: consumption?.is_irregular ? postExplanation : undefined,
      });
      setShowPostDialog(false);
      setPostExplanation('');
      alert('Consumption posted to accounting successfully');
    } catch (error) {
      alert('Failed to post consumption');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this consumption record?')) return;

    try {
      await deleteConsumption.mutateAsync(Number(id));
      alert('Consumption deleted successfully');
      navigate('/expenses/resource-consumption');
    } catch (error) {
      alert('Failed to delete consumption');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading consumption details...</div>
      </div>
    );
  }

  if (error || !consumption) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error loading consumption details</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/expenses/resource-consumption')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to List
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{consumption.consumption_number}</h1>
            <p className="text-gray-600">Resource consumption details</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {getStatusIcon(consumption.status)}
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(consumption.status)}`}
          >
            {consumption.status}
          </span>
          {consumption.is_irregular && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
              Flagged
            </span>
          )}
        </div>
      </div>

      {/* Irregularity Alert */}
      {consumption.is_irregular && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Irregularity Detected: {consumption.irregularity_type.replace('_', ' ')}
              </h3>
              <p className="text-sm text-yellow-700 mt-1">{consumption.irregularity_notes}</p>
              {consumption.variance_percentage && (
                <p className="text-sm text-yellow-700">
                  Variance: {consumption.variance_percentage}%
                </p>
              )}
              {consumption.explanation_provided && (
                <div className="mt-3 p-3 bg-white rounded border">
                  <p className="text-sm font-medium text-gray-900">Explanation Provided:</p>
                  <p className="text-sm text-gray-700 mt-1">{consumption.explanation_provided}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Consumption Date</p>
                  <p className="font-medium">{consumption.consumption_date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Payment Flow</p>
                  <p className="font-medium capitalize">{consumption.payment_flow}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Resource Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resource Information</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Resource</p>
                <p className="font-medium text-lg">{consumption.resource_name}</p>
                <p className="text-sm text-gray-600">{consumption.resource_type}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Quantity Consumed</p>
                  <p className="font-medium">
                    {consumption.quantity_consumed} {consumption.unit_of_measure}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Unit Cost</p>
                  <p className="font-medium">${parseFloat(consumption.unit_cost).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Cost</p>
                  <p className="font-medium text-lg text-blue-600">
                    ${parseFloat(consumption.total_cost).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Flow Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {consumption.payment_flow === 'prepaid' ? 'Voucher Details' : 'Supplier Details'}
            </h2>
            {consumption.payment_flow === 'prepaid' ? (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Voucher Number</p>
                  <p className="font-medium">{consumption.prepaid_voucher_number}</p>
                </div>
                {consumption.remaining_voucher_balance && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3">
                    <p className="text-sm font-medium text-blue-900">Remaining Balance</p>
                    <p className="text-sm text-blue-700">
                      {consumption.remaining_voucher_balance.units} units ($
                      {consumption.remaining_voucher_balance.amount})
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Supplier</p>
                  <p className="font-medium">{consumption.supplier_name}</p>
                </div>
                {consumption.invoice_number && (
                  <div>
                    <p className="text-sm text-gray-500">Invoice Number</p>
                    <p className="font-medium">{consumption.invoice_number}</p>
                  </div>
                )}
                {consumption.is_posted && consumption.accounts_payable && (
                  <div className="bg-purple-50 border border-purple-200 rounded p-3">
                    <p className="text-sm font-medium text-purple-900">Accounts Payable Created</p>
                    <p className="text-sm text-purple-700">
                      Payable ID: {consumption.accounts_payable}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Beneficiary Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficiary Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Type</p>
                <p className="font-medium capitalize">{consumption.beneficiary_type}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Reference</p>
                <p className="font-medium">{consumption.beneficiary_reference}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{consumption.beneficiary_name}</p>
              </div>
            </div>
          </div>

          {/* Meter Readings */}
          {consumption.reading_type && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Meter Readings</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Reading Type</p>
                  <p className="font-medium capitalize">
                    {consumption.reading_type.replace('_', ' ')}
                  </p>
                </div>
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
                {consumption.consumption_rate && (
                  <div className="md:col-span-2">
                    <p className="text-sm text-gray-500">Consumption Rate</p>
                    <p className="font-medium">
                      {consumption.consumption_rate} {consumption.unit_of_measure} per unit
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Documentation */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Documentation</h2>
            <div className="space-y-4">
              {consumption.operator_name && (
                <div className="flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Operator</p>
                    <p className="font-medium">{consumption.operator_name}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium">{consumption.consumption_location}</p>
                </div>
              </div>
              {consumption.receipt_number && (
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Receipt Number</p>
                    <p className="font-medium">{consumption.receipt_number}</p>
                  </div>
                </div>
              )}
              {consumption.notes && (
                <div>
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="font-medium">{consumption.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions</h3>
            <div className="space-y-3">
              {/* Consumption records go directly to pending posting — no approval workflow */}
              {!consumption.is_posted && (
                <button
                  onClick={() => navigate(`/expenses/resource-consumption/${id}/edit`)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Edit size={16} />
                  Edit Consumption
                </button>
              )}

              {!consumption.is_posted && (
                <button
                  onClick={() => setShowPostDialog(true)}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
                >
                  <DollarSign size={16} />
                  Post to Accounting
                </button>
              )}

              {!consumption.is_posted && (
                <button
                  onClick={handleDelete}
                  disabled={deleteConsumption.isPending}
                  className="w-full flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {deleteConsumption.isPending ? 'Deleting...' : 'Delete'}
                </button>
              )}
            </div>
          </div>

          {/* Status History */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status History</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-sm">
                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                <div>
                  <p className="font-medium">Created</p>
                  <p className="text-gray-500">
                    {new Date(consumption.created_at).toLocaleString()}
                  </p>
                </div>
              </div>

              {consumption.approved_at && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                  <div>
                    <p className="font-medium">Approved</p>
                    <p className="text-gray-500">
                      {new Date(consumption.approved_at).toLocaleString()}
                    </p>
                    {consumption.approved_by_name && (
                      <p className="text-gray-500">by {consumption.approved_by_name}</p>
                    )}
                  </div>
                </div>
              )}

              {consumption.posted_at && (
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <div>
                    <p className="font-medium">Posted</p>
                    <p className="text-gray-500">
                      {new Date(consumption.posted_at).toLocaleString()}
                    </p>
                    {consumption.posted_by_name && (
                      <p className="text-gray-500">by {consumption.posted_by_name}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Asset Details */}
          {consumption.asset_detail && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Asset Information</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Asset Number</p>
                  <p className="font-medium">{consumption.asset_detail.asset_number}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Current Reading</p>
                  <p className="font-medium">{consumption.asset_detail.current_reading}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Average Rate</p>
                  <p className="font-medium">{consumption.asset_detail.average_consumption_rate}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Monthly Total</p>
                  <p className="font-medium">
                    {consumption.asset_detail.monthly_total_quantity} units ($
                    {consumption.asset_detail.monthly_total_cost})
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Post Dialog */}
      {showPostDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Post to Accounting</h3>
            <div className="space-y-4">
              {consumption.is_irregular && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Explanation for Irregularity *
                  </label>
                  <textarea
                    rows={3}
                    value={postExplanation}
                    onChange={e => setPostExplanation(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    placeholder="Please explain the irregularity before posting..."
                    required
                  />
                </div>
              )}
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm text-blue-900">
                  This will create a journal entry for ${consumption.total_cost} and
                  {consumption.payment_flow === 'prepaid'
                    ? ' reduce the voucher balance'
                    : ' create an accounts payable record'}
                  .
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPostDialog(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePost}
                  disabled={
                    postConsumption.isPending ||
                    (consumption.is_irregular && !postExplanation.trim())
                  }
                  className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {postConsumption.isPending ? 'Posting...' : 'Post to Accounting'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResourceConsumptionDetailPage;
