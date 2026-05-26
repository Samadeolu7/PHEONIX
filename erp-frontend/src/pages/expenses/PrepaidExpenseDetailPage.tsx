import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Calculator,
  Trash2,
  DollarSign,
  Calendar,
  User,
  FileText,
  Package,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  BookOpen,
} from 'lucide-react';
import {
  usePrepaidExpense,
  useDeletePrepaidExpense,
  usePostPrepaidExpenseToAccounts,
} from '../../hooks/usePrepaidExpenses';

const PrepaidExpenseDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const expenseId = Number(id);

  const { data: prepaidExpense, isLoading, error } = usePrepaidExpense(expenseId);
  const deletePrepaidExpense = useDeletePrepaidExpense();
  const postToAccounts = usePostPrepaidExpenseToAccounts();
  const [showPostDialog, setShowPostDialog] = useState(false);

  const handleDelete = async () => {
    if (!prepaidExpense) return;

    if (
      window.confirm(
        `Are you sure you want to delete prepaid expense "${prepaidExpense.reference_number}"?`
      )
    ) {
      try {
        await deletePrepaidExpense.mutateAsync(expenseId);
        alert('Prepaid expense deleted successfully');
        navigate('/expenses/prepaid');
      } catch (error) {
        alert('Failed to delete prepaid expense');
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle size={20} className="text-green-600" />;
      case 'partially_consumed':
        return <Clock size={20} className="text-yellow-600" />;
      case 'fully_consumed':
        return <XCircle size={20} className="text-gray-600" />;
      case 'expired':
        return <AlertTriangle size={20} className="text-red-600" />;
      default:
        return <AlertTriangle size={20} className="text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'partially_consumed':
        return 'bg-yellow-100 text-yellow-800';
      case 'fully_consumed':
        return 'bg-gray-100 text-gray-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatCurrency = (amount: string) => {
    return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
  };

  const calculateProgress = () => {
    if (!prepaidExpense) return 0;
    const consumed = parseFloat(prepaidExpense.consumed_amount);
    const total = parseFloat(prepaidExpense.total_amount);
    return total > 0 ? (consumed / total) * 100 : 0;
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error || !prepaidExpense) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={20} className="text-red-600" />
            <span className="text-red-800 font-medium">Error loading prepaid expense</span>
          </div>
          <p className="text-red-700 mt-1">The requested prepaid expense could not be found.</p>
          <button
            onClick={() => navigate('/expenses/prepaid')}
            className="mt-4 inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
          >
            <ArrowLeft size={16} />
            Back to Prepaid Expenses
          </button>
        </div>
      </div>
    );
  }

  const canAmortize =
    parseFloat(prepaidExpense.remaining_amount) > 0 && prepaidExpense.status !== 'fully_consumed';
  const canPostToAccounts = !!prepaidExpense.supplier && !prepaidExpense.is_posted;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/expenses/prepaid')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft size={20} />
            Back to Prepaid Expenses
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{prepaidExpense.reference_number}</h1>
            <p className="text-gray-600">{prepaidExpense.category_name}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/expenses/prepaid/${expenseId}/edit`)}
            className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
          >
            <Edit size={16} />
            Edit
          </button>
          {canPostToAccounts && (
            <button
              onClick={() => setShowPostDialog(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              <BookOpen size={16} />
              Post to Accounts
            </button>
          )}
          {canAmortize && (
            <button
              onClick={() => navigate(`/expenses/prepaid/${expenseId}/amortize`)}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700"
            >
              <Calculator size={16} />
              Amortize
            </button>
          )}
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700"
            disabled={deletePrepaidExpense.isPending}
          >
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Information */}
        <div className="lg:col-span-2 space-y-6">
          {/* Financial Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Financial Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <DollarSign size={20} className="text-blue-600" />
                  <span className="text-sm font-medium text-gray-700">Total Amount</span>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(prepaidExpense.total_amount)}
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Calculator size={20} className="text-orange-600" />
                  <span className="text-sm font-medium text-gray-700">Consumed</span>
                </div>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(prepaidExpense.consumed_amount)}
                </p>
              </div>

              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <DollarSign size={20} className="text-green-600" />
                  <span className="text-sm font-medium text-gray-700">Remaining</span>
                </div>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(prepaidExpense.remaining_amount)}
                </p>
              </div>
            </div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Consumption Progress</span>
                <span>{calculateProgress().toFixed(1)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4">
                <div
                  className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(calculateProgress(), 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Unit Information (if measurable) */}
          {prepaidExpense.measurable && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Unit Information</h2>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <span className="text-sm font-medium text-gray-700">Unit of Measure</span>
                  <p className="text-lg font-semibold text-gray-900">
                    {prepaidExpense.unit_of_measure}
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-700">Total Units</span>
                  <p className="text-lg font-semibold text-gray-900">
                    {prepaidExpense.total_units
                      ? parseFloat(prepaidExpense.total_units).toLocaleString()
                      : 'N/A'}
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-700">Consumed Units</span>
                  <p className="text-lg font-semibold text-orange-600">
                    {prepaidExpense.consumed_units
                      ? parseFloat(prepaidExpense.consumed_units).toLocaleString()
                      : '0'}
                  </p>
                </div>

                <div>
                  <span className="text-sm font-medium text-gray-700">Remaining Units</span>
                  <p className="text-lg font-semibold text-green-600">
                    {parseFloat(prepaidExpense.remaining_units).toLocaleString()}
                  </p>
                </div>
              </div>

              {prepaidExpense.unit_cost && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-700">Unit Cost</span>
                  <p className="text-lg font-semibold text-gray-900">
                    ₦{parseFloat(prepaidExpense.unit_cost).toFixed(4)} per{' '}
                    {prepaidExpense.unit_of_measure}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Description</h2>
            <p className="text-gray-700 leading-relaxed">{prepaidExpense.description}</p>
          </div>

          {/* Supplier Information */}
          {(prepaidExpense.supplier ||
            prepaidExpense.supplier_name ||
            prepaidExpense.supplier_invoice) && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(prepaidExpense.supplier_name_display || prepaidExpense.supplier_name) && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Supplier Name</span>
                    <p className="text-gray-900">
                      {prepaidExpense.supplier_name_display || prepaidExpense.supplier_name}
                    </p>
                  </div>
                )}
                {prepaidExpense.supplier_invoice && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Invoice Number</span>
                    <p className="text-gray-900">{prepaidExpense.supplier_invoice}</p>
                  </div>
                )}
                {prepaidExpense.accounts_payable_id && (
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
                      <BookOpen size={16} className="text-purple-600" />
                      <div>
                        <span className="text-sm font-medium text-purple-900">
                          Accounts Payable Created
                        </span>
                        <p className="text-sm text-purple-700">
                          AP #{prepaidExpense.accounts_payable_id}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Status</h3>

            <div className="flex items-center gap-3 mb-4">
              {getStatusIcon(prepaidExpense.status)}
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(prepaidExpense.status)}`}
              >
                {prepaidExpense.status.replace('_', ' ').toUpperCase()}
              </span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-gray-500" />
                <div>
                  <span className="text-sm text-gray-600">Created</span>
                  <p className="text-sm font-medium">
                    {new Date(prepaidExpense.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {prepaidExpense.purchase_date && (
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-gray-500" />
                  <div>
                    <span className="text-sm text-gray-600">Purchase Date</span>
                    <p className="text-sm font-medium">
                      {new Date(prepaidExpense.purchase_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <FileText size={16} className="text-gray-500" />
                <div>
                  <span className="text-sm text-gray-600">Posted to Accounts</span>
                  <p className="text-sm font-medium">{prepaidExpense.is_posted ? 'Yes' : 'No'}</p>
                </div>
              </div>

              {prepaidExpense.accounts_payable_id && (
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-purple-500" />
                  <div>
                    <span className="text-sm text-gray-600">AP Payable</span>
                    <p className="text-sm font-medium text-purple-700">
                      AP #{prepaidExpense.accounts_payable_id}
                    </p>
                  </div>
                </div>
              )}

              {prepaidExpense.posted_at && (
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-gray-500" />
                  <div>
                    <span className="text-sm text-gray-600">Posted At</span>
                    <p className="text-sm font-medium">
                      {new Date(prepaidExpense.posted_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>

            <div className="space-y-3">
              <button
                onClick={() => navigate(`/expenses/prepaid/${expenseId}/edit`)}
                className="w-full flex items-center gap-2 text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <Edit size={16} className="text-green-600" />
                <span>Edit Expense</span>
              </button>

              {canPostToAccounts && (
                <button
                  onClick={() => setShowPostDialog(true)}
                  className="w-full flex items-center gap-2 text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <BookOpen size={16} className="text-blue-600" />
                  <span>Post to Accounts</span>
                </button>
              )}

              {canAmortize && (
                <button
                  onClick={() => navigate(`/expenses/prepaid/${expenseId}/amortize`)}
                  className="w-full flex items-center gap-2 text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <Calculator size={16} className="text-purple-600" />
                  <span>Record Amortization</span>
                </button>
              )}

              <button
                onClick={() => navigate('/expenses/prepaid/create')}
                className="w-full flex items-center gap-2 text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <Package size={16} className="text-blue-600" />
                <span>Create New Expense</span>
              </button>
            </div>
          </div>

          {/* Amortization Status */}
          {!canAmortize && prepaidExpense.status === 'fully_consumed' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-green-600" />
                <span className="text-sm font-medium text-green-900">Fully Amortized</span>
              </div>
              <p className="text-sm text-green-700 mt-1">
                This prepaid expense has been fully consumed and amortized.
              </p>
            </div>
          )}

          {prepaidExpense.status === 'expired' && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-600" />
                <span className="text-sm font-medium text-red-900">Expired</span>
              </div>
              <p className="text-sm text-red-700 mt-1">
                This prepaid expense has expired and may need review.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Post to Accounts Confirmation Dialog */}
      {showPostDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Post to Accounts</h3>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <p className="text-sm font-medium text-blue-900 mb-2">
                  Journal Entry to be Created:
                </p>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>DR Prepaid Expense (Asset): {formatCurrency(prepaidExpense.total_amount)}</p>
                  <p>
                    CR Accounts Payable:&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{' '}
                    {formatCurrency(prepaidExpense.total_amount)}
                  </p>
                </div>
                <p className="text-xs text-blue-700 mt-2">
                  An AP payable will be created for{' '}
                  <strong>
                    {prepaidExpense.supplier_name_display ||
                      prepaidExpense.supplier_name ||
                      'the supplier'}
                  </strong>
                  . Settle it later via a bank payment.
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
                  onClick={async () => {
                    try {
                      await postToAccounts.mutateAsync(expenseId);
                      setShowPostDialog(false);
                      alert('Successfully posted to accounts. AP payable created.');
                    } catch {
                      alert('Failed to post to accounts. Please try again.');
                    }
                  }}
                  disabled={postToAccounts.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {postToAccounts.isPending ? 'Posting...' : 'Confirm Post'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrepaidExpenseDetailPage;
