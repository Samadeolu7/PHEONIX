import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Send,
  FileText,
  Calendar,
  DollarSign,
  Gauge,
  MapPin,
  User,
  Building,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { resourceConsumptionService } from '../../services/resourceConsumptionService';
import { useToast } from '../../contexts/ToastContext';

const PostingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [explanation, setExplanation] = useState('');
  const [showPostingForm, setShowPostingForm] = useState(false);

  const { data: consumption, isLoading } = useQuery({
    queryKey: ['resource-consumption', id],
    queryFn: () => resourceConsumptionService.getConsumption(parseInt(id!)),
    enabled: !!id,
  });

  const postMutation = useMutation({
    mutationFn: (explanation?: string) =>
      resourceConsumptionService.postConsumption(parseInt(id!), explanation),
    onSuccess: result => {
      toast.success('Consumption posted successfully to accounting');
      queryClient.invalidateQueries({ queryKey: ['resource-consumption'] });
      navigate('/expenses/resource-consumption/posting-queue');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to post consumption');
    },
  });

  const handlePost = () => {
    postMutation.mutate(explanation);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!consumption) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-red-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Consumption not found</h3>
      </div>
    );
  }

  const canPost = consumption.status === 'approved' && !consumption.is_posted;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/expenses/resource-consumption/posting-queue')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Post to Accounting</h1>
            <p className="text-gray-600">{consumption.consumption_number}</p>
          </div>
        </div>

        {canPost && (
          <button
            onClick={() => setShowPostingForm(true)}
            disabled={postMutation.isPending}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4 mr-2" />
            Post to Accounting
          </button>
        )}
      </div>

      {/* Status Alert */}
      {consumption.is_posted && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <FileText className="w-5 h-5 text-green-500 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-green-800">Already Posted</h3>
              <div className="mt-2 text-sm text-green-700">
                <p>
                  This consumption was posted on{' '}
                  {consumption.posted_at ? new Date(consumption.posted_at).toLocaleString() : 'N/A'}
                </p>
                {consumption.posted_by_name && <p>Posted by: {consumption.posted_by_name}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {!canPost && !consumption.is_posted && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-orange-500 mt-0.5" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-orange-800">Cannot Post</h3>
              <p className="mt-2 text-sm text-orange-700">
                This consumption must be approved before it can be posted to accounting.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Consumption Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center space-x-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Resource</p>
                  <p className="font-medium">{consumption.resource_name}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium">
                    {new Date(consumption.consumption_date).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <DollarSign className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Total Cost</p>
                  <p className="font-medium text-lg text-green-600">
                    ₦{parseFloat(consumption.total_cost).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Gauge className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Quantity</p>
                  <p className="font-medium">
                    {consumption.quantity_consumed} {consumption.unit_of_measure}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Accounting Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Accounting Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Payment Flow</p>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-sm font-medium ${
                    consumption.payment_flow === 'prepaid'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-purple-100 text-purple-800'
                  }`}
                >
                  {consumption.payment_flow}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Expense Category</p>
                <p className="font-medium">{consumption.expense_category_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Unit Cost</p>
                <p className="font-medium">₦{parseFloat(consumption.unit_cost).toLocaleString()}</p>
              </div>
              {consumption.payment_flow === 'postpaid' && consumption.supplier_name && (
                <div>
                  <p className="text-sm text-gray-500">Supplier</p>
                  <p className="font-medium">{consumption.supplier_name}</p>
                </div>
              )}
            </div>
          </div>

          {/* Beneficiary Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Beneficiary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Name</p>
                <p className="font-medium">{consumption.beneficiary_name}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Reference</p>
                <p className="font-medium">{consumption.beneficiary_reference}</p>
              </div>
              {consumption.asset_name && (
                <div>
                  <p className="text-sm text-gray-500">Asset</p>
                  <p className="font-medium">
                    {consumption.asset_name} ({consumption.asset_number})
                  </p>
                </div>
              )}
              {consumption.operator_name && (
                <div className="flex items-center space-x-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Operator</p>
                    <p className="font-medium">{consumption.operator_name}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Current Status</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    consumption.status === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {consumption.status}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Posted</span>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    consumption.is_posted
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {consumption.is_posted ? 'Yes' : 'No'}
                </span>
              </div>
              {consumption.approved_by_name && (
                <div>
                  <p className="text-sm text-gray-500">Approved By</p>
                  <p className="text-sm font-medium">{consumption.approved_by_name}</p>
                  <p className="text-xs text-gray-400">
                    {consumption.approved_at
                      ? new Date(consumption.approved_at).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Payment Information */}
          {consumption.payment_flow === 'prepaid' && consumption.prepaid_voucher_number && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Voucher Info</h3>
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-gray-500">Voucher Number</p>
                  <p className="font-medium">{consumption.prepaid_voucher_number}</p>
                </div>
                {consumption.remaining_voucher_balance && (
                  <div>
                    <p className="text-sm text-gray-500">Remaining Balance</p>
                    <p className="font-medium">
                      {consumption.remaining_voucher_balance.units} units
                    </p>
                    <p className="text-sm text-gray-500">
                      ₦{parseFloat(consumption.remaining_voucher_balance.amount).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Info */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Additional Info</h3>
            <div className="space-y-3">
              {consumption.consumption_location && (
                <div className="flex items-start space-x-3">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Location</p>
                    <p className="text-sm">{consumption.consumption_location}</p>
                  </div>
                </div>
              )}
              {consumption.receipt_number && (
                <div>
                  <p className="text-sm text-gray-500">Receipt Number</p>
                  <p className="text-sm font-medium">{consumption.receipt_number}</p>
                </div>
              )}
              {consumption.invoice_number && (
                <div>
                  <p className="text-sm text-gray-500">Invoice Number</p>
                  <p className="text-sm font-medium">{consumption.invoice_number}</p>
                </div>
              )}
              {consumption.notes && (
                <div>
                  <p className="text-sm text-gray-500">Notes</p>
                  <p className="text-sm">{consumption.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Posting Form Modal */}
      {showPostingForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Post to Accounting</h3>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center">
                  <DollarSign className="w-5 h-5 text-blue-500 mr-2" />
                  <div>
                    <p className="text-sm font-medium text-blue-800">Amount to Post</p>
                    <p className="text-lg font-bold text-blue-900">
                      ₦{parseFloat(consumption.total_cost).toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Explanation (Optional)
                </label>
                <textarea
                  value={explanation}
                  onChange={e => setExplanation(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  placeholder="Add any notes about this posting..."
                />
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={() => setShowPostingForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePost}
                  disabled={postMutation.isPending}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {postMutation.isPending ? 'Posting...' : 'Post Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PostingDetailPage;
