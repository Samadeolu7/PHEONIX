import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ShoppingCart,
  User,
  Building,
  Calendar,
  Package,
  DollarSign,
  MessageSquare,
  Paperclip,
  Download,
  Send,
  Eye,
  GitCompare,
  Truck,
  CreditCard,
  Hash,
} from 'lucide-react';

import { useQuote, useSelectQuote, useCompareQuotes } from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { ErrorDisplay } from '../../components/error/ErrorDisplay';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { EnhancedButton } from '../../components/ui/EnhancedButton';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { Quote, QuoteStatus, getQuoteStatusColor, getQuoteStatusLabel } from '../../types/quotes';

const QuoteDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [showSelectModal, setShowSelectModal] = useState(false);
  const [selectComments, setSelectComments] = useState('');

  // React Query hooks
  const { data: quote, isLoading, error } = useQuote(parseInt(id || '0'), !!id);

  // Mutations
  const selectQuoteMutation = useSelectQuote();

  const processing = selectQuoteMutation.isPending;

  const handleSelectQuote = async () => {
    if (!quote) return;

    try {
      await selectQuoteMutation.mutateAsync({
        id: quote.id,
        data: { comments: selectComments },
      });
      toast.success('Quote selected successfully');
      setShowSelectModal(false);
      setSelectComments('');
    } catch (error: any) {
      toast.error(error.message || 'Failed to select quote');
    }
  };

  const handleCompareQuotes = () => {
    if (quote?.requisition) {
      navigate(`/procurement/quotes/compare/${quote.requisition}`);
    }
  };

  const handleViewRequisition = () => {
    if (quote?.requisition) {
      navigate(`/procurement/requisitions/${quote.requisition}`);
    }
  };

  const handleEditQuote = () => {
    navigate(`/procurement/quotes/${id}/edit`);
  };

  const handleConvertToPO = () => {
    if (quote?.status === 'selected') {
      navigate(`/procurement/purchase-orders/new?quote=${quote.id}`);
    }
  };

  const getStatusBadge = (status: QuoteStatus) => {
    const color = getQuoteStatusColor(status);
    const label = getQuoteStatusLabel(status);

    const colorClasses = {
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.gray}`}
      >
        {label}
      </span>
    );
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isExpired = quote && new Date(quote.valid_until) < new Date();
  const canSelect = quote && quote.status === 'received' && !isExpired;
  const canConvertToPO = quote && quote.status === 'selected';

  const breadcrumbItems = [
    { label: 'Procurement', href: '/procurement' },
    { label: 'Supplier Quotes', href: '/procurement/quotes' },
    { label: quote?.quote_number || 'Quote Details', current: true },
  ];

  if (isLoading) {
    return <LoadingOverlay message="Loading quote details..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load quote"
        message={error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!quote) {
    return (
      <ErrorDisplay
        title="Quote not found"
        message="The requested quote could not be found."
        onRetry={() => navigate('/procurement/quotes')}
      />
    );
  }

  return (
    <div className="space-y-6">
      {processing && <LoadingOverlay message="Processing..." />}

      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/procurement/quotes')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{quote.quote_number}</h1>
            <p className="text-gray-600">Quote Details</p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {quote.requisition && (
            <EnhancedButton onClick={handleCompareQuotes} variant="outline" icon={GitCompare}>
              Compare Quotes
            </EnhancedButton>
          )}

          {canSelect && (
            <EnhancedButton
              onClick={() => setShowSelectModal(true)}
              className="bg-green-600 hover:bg-green-700 text-white"
              icon={CheckCircle}
            >
              Select Quote
            </EnhancedButton>
          )}

          {canConvertToPO && (
            <EnhancedButton
              onClick={handleConvertToPO}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              icon={ShoppingCart}
            >
              Convert to PO
            </EnhancedButton>
          )}

          <EnhancedButton onClick={handleEditQuote} variant="outline" icon={Edit}>
            Edit
          </EnhancedButton>
        </div>
      </div>

      {/* Quote Overview */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Basic Info */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Quote Information</h3>

              <div className="space-y-3">
                <div className="flex items-center">
                  <Hash className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Quote Number</p>
                    <p className="font-medium">{quote.quote_number}</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <Calendar className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Quote Date</p>
                    <p className="font-medium">{formatDate(quote.quote_date)}</p>
                  </div>
                </div>

                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Valid Until</p>
                    <p className={`font-medium ${isExpired ? 'text-red-600' : ''}`}>
                      {formatDate(quote.valid_until)}
                      {isExpired && (
                        <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                          Expired
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Status</p>
                    <div className="mt-1">{getStatusBadge(quote.status as QuoteStatus)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle Column - Supplier Info */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Supplier Information</h3>

              <div className="space-y-3">
                <div className="flex items-center">
                  <Building className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Supplier</p>
                    <p className="font-medium">{quote.supplier_name}</p>
                  </div>
                </div>

                {quote.payment_terms && (
                  <div className="flex items-center">
                    <CreditCard className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">Payment Terms</p>
                      <p className="font-medium">{quote.payment_terms}</p>
                    </div>
                  </div>
                )}

                {quote.delivery_terms && (
                  <div className="flex items-center">
                    <Truck className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">Delivery Terms</p>
                      <p className="font-medium">{quote.delivery_terms}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Financial Info */}
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>

              <div className="space-y-3">
                <div className="flex items-center">
                  <DollarSign className="h-4 w-4 text-gray-400 mr-3" />
                  <div>
                    <p className="text-sm text-gray-500">Total Amount</p>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(quote.total_amount)}
                    </p>
                  </div>
                </div>

                {quote.requisition && (
                  <div className="flex items-center">
                    <ShoppingCart className="h-4 w-4 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm text-gray-500">Related Requisition</p>
                      <button
                        onClick={handleViewRequisition}
                        className="font-medium text-blue-600 hover:text-blue-800"
                      >
                        PR-{quote.requisition}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <div className="mt-6 pt-6 border-t">
            <div className="flex items-start">
              <MessageSquare className="h-4 w-4 text-gray-400 mr-3 mt-1" />
              <div>
                <p className="text-sm text-gray-500 mb-1">Notes</p>
                <p className="text-gray-900">{quote.notes}</p>
              </div>
            </div>
          </div>
        )}

        {/* Attachment */}
        {quote.attachment && (
          <div className="mt-4 pt-4 border-t">
            <div className="flex items-center">
              <Paperclip className="h-4 w-4 text-gray-400 mr-3" />
              <div>
                <p className="text-sm text-gray-500 mb-1">Attachment</p>
                <a
                  href={quote.attachment}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 flex items-center"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Download Attachment
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quote Items */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b">
          <h3 className="text-lg font-semibold text-gray-900">Quote Items</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Item
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quantity
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Unit Price
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Price
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Lead Time
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quote.items.map((item, index) => (
                <tr key={item.id || index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Package className="h-4 w-4 text-gray-400 mr-2" />
                      <div className="text-sm font-medium text-gray-900">{item.item_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{item.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">
                      {parseFloat(item.quantity).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{formatCurrency(item.unit_price)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(item.total_price)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{item.lead_time_days} days</div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50">
              <tr>
                <td colSpan={4} className="px-6 py-4 text-right text-sm font-medium text-gray-900">
                  Total Amount:
                </td>
                <td className="px-6 py-4 text-right text-lg font-bold text-gray-900">
                  {formatCurrency(quote.total_amount)}
                </td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Timestamps */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Timeline</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{formatDateTime(quote.created_at)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="font-medium">{formatDateTime(quote.updated_at)}</p>
          </div>
        </div>
      </div>

      {/* Select Quote Modal */}
      {showSelectModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Select Quote</h3>
                <button
                  onClick={() => setShowSelectModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to select this quote? This will mark other quotes for the same
                requisition as rejected.
              </p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comments (optional)
                </label>
                <textarea
                  value={selectComments}
                  onChange={e => setSelectComments(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any comments about the selection..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <EnhancedButton onClick={() => setShowSelectModal(false)} variant="outline">
                  Cancel
                </EnhancedButton>
                <EnhancedButton
                  onClick={handleSelectQuote}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  icon={CheckCircle}
                >
                  Select Quote
                </EnhancedButton>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteDetailPage;
