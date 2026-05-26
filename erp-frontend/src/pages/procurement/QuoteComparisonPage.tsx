import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  DollarSign,
  Calendar,
  Truck,
  CreditCard,
  Building,
  Package,
  ShoppingCart,
  Eye,
  Award,
  Clock,
  FileText,
  MessageSquare,
} from 'lucide-react';

import {
  useCompareQuotes,
  useSelectQuote,
  usePurchaseRequisition,
} from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { ErrorDisplay } from '../../components/error/ErrorDisplay';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { EnhancedButton } from '../../components/ui/EnhancedButton';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import {
  Quote,
  QuoteStatus,
  QuoteComparison,
  ComparisonRow,
  getQuoteStatusColor,
  getQuoteStatusLabel,
} from '../../types/quotes';

const QuoteComparisonPage: React.FC = () => {
  const navigate = useNavigate();
  const { requisitionId } = useParams<{ requisitionId: string }>();
  const toast = useToast();

  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [selectionComments, setSelectionComments] = useState('');

  // React Query hooks
  const {
    data: comparisonData,
    isLoading,
    error,
  } = useCompareQuotes(parseInt(requisitionId || '0'), !!requisitionId);

  const { data: requisition } = usePurchaseRequisition(
    parseInt(requisitionId || '0'),
    !!requisitionId
  );

  // Mutations
  const selectQuoteMutation = useSelectQuote();

  const processing = selectQuoteMutation.isPending;

  // Memoized calculations
  const { quotes, comparisonMatrix, selectedQuote, hasExpiredQuotes } = useMemo(() => {
    if (!comparisonData) {
      return {
        quotes: [],
        comparisonMatrix: [],
        selectedQuote: null,
        hasExpiredQuotes: false,
      };
    }

    const quotes = comparisonData.quotes || [];
    const selectedQuote = quotes.find(q => q.status === 'selected') || null;
    const hasExpiredQuotes = quotes.some(
      q => new Date(q.valid_until) < new Date() && q.status !== 'expired'
    );

    return {
      quotes,
      comparisonMatrix: comparisonData.comparison_matrix || [],
      selectedQuote,
      hasExpiredQuotes,
    };
  }, [comparisonData]);

  // Calculate totals and savings
  const totalsComparison = useMemo(() => {
    if (quotes.length === 0) return null;

    const totals = quotes.map(quote => ({
      quoteId: quote.id,
      supplierName: quote.supplier_name,
      total: parseFloat(quote.total_amount),
      status: quote.status,
      isExpired: new Date(quote.valid_until) < new Date(),
    }));

    const validTotals = totals.filter(t => !t.isExpired && t.status !== 'rejected');
    const lowestTotal = Math.min(...validTotals.map(t => t.total));
    const highestTotal = Math.max(...validTotals.map(t => t.total));
    const savings = highestTotal - lowestTotal;
    const savingsPercentage = highestTotal > 0 ? (savings / highestTotal) * 100 : 0;

    return {
      totals,
      lowestTotal,
      highestTotal,
      savings,
      savingsPercentage,
      lowestQuoteId: validTotals.find(t => t.total === lowestTotal)?.quoteId || null,
    };
  }, [quotes]);

  const handleSelectQuote = async (quoteId: number) => {
    setSelectedQuoteId(quoteId);
    setShowSelectionModal(true);
  };

  const confirmSelectQuote = async () => {
    if (!selectedQuoteId) return;

    try {
      await selectQuoteMutation.mutateAsync({
        id: selectedQuoteId,
        data: { comments: selectionComments },
      });
      toast.success('Quote selected successfully');
      setShowSelectionModal(false);
      setSelectionComments('');
      setSelectedQuoteId(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to select quote');
    }
  };

  const handleViewQuote = (quoteId: number) => {
    navigate(`/procurement/quotes/${quoteId}`);
  };

  const handleConvertToPO = () => {
    if (selectedQuote) {
      navigate(`/procurement/purchase-orders/new?quote=${selectedQuote.id}`);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: QuoteStatus, isExpired: boolean = false) => {
    const color = isExpired ? 'gray' : getQuoteStatusColor(status);
    const label = isExpired ? 'Expired' : getQuoteStatusLabel(status);

    const colorClasses = {
      blue: 'bg-blue-100 text-blue-800 border-blue-200',
      green: 'bg-green-100 text-green-800 border-green-200',
      red: 'bg-red-100 text-red-800 border-red-200',
      gray: 'bg-gray-100 text-gray-800 border-gray-200',
    };

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.gray}`}
      >
        {label}
      </span>
    );
  };

  const isQuoteExpired = (quote: Quote) => {
    return new Date(quote.valid_until) < new Date();
  };

  const canSelectQuote = (quote: Quote) => {
    return quote.status === 'received' && !isQuoteExpired(quote);
  };

  const breadcrumbItems = [
    { label: 'Procurement', href: '/procurement' },
    { label: 'Supplier Quotes', href: '/procurement/quotes' },
    { label: 'Quote Comparison', current: true },
  ];

  if (isLoading) {
    return <LoadingOverlay message="Loading quote comparison..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load quote comparison"
        message={error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  if (!comparisonData || quotes.length === 0) {
    return (
      <div className="space-y-6">
        {/* Breadcrumb */}
        <Breadcrumb items={breadcrumbItems} />

        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/procurement/quotes')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quote Comparison</h1>
            <p className="text-gray-600">No quotes found for comparison</p>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Quotes Available</h3>
          <p className="text-gray-600 mb-6">
            There are no quotes available for this requisition to compare.
          </p>
          <EnhancedButton
            onClick={() => navigate('/procurement/quotes')}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            View All Quotes
          </EnhancedButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {processing && <LoadingOverlay message="Processing selection..." />}

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
            <h1 className="text-2xl font-bold text-gray-900">Quote Comparison</h1>
            <p className="text-gray-600">
              {requisition
                ? `Requisition: ${requisition.pr_number}`
                : `Requisition ID: ${requisitionId}`}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {selectedQuote && (
            <EnhancedButton
              onClick={handleConvertToPO}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              icon={ShoppingCart}
            >
              Convert to PO
            </EnhancedButton>
          )}
        </div>
      </div>

      {/* Alerts */}
      {hasExpiredQuotes && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-400 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">Some quotes have expired</h3>
              <p className="text-sm text-yellow-700 mt-1">
                Expired quotes cannot be selected. Please request new quotes from suppliers if
                needed.
              </p>
            </div>
          </div>
        </div>
      )}

      {selectedQuote && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
              <div>
                <h3 className="text-sm font-medium text-green-800">
                  Quote Selected: {selectedQuote.supplier_name}
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Total: {formatCurrency(selectedQuote.total_amount)} • Ready to convert to Purchase
                  Order
                </p>
              </div>
            </div>
            <EnhancedButton
              onClick={handleConvertToPO}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              icon={ShoppingCart}
            >
              Convert to PO
            </EnhancedButton>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {totalsComparison && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <FileText className="h-5 w-5 text-blue-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Total Quotes</p>
                <p className="text-2xl font-bold text-gray-900">{quotes.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <TrendingDown className="h-5 w-5 text-green-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Lowest Quote</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(totalsComparison.lowestTotal)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <TrendingUp className="h-5 w-5 text-red-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Highest Quote</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(totalsComparison.highestTotal)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border p-4">
            <div className="flex items-center">
              <DollarSign className="h-5 w-5 text-purple-500 mr-3" />
              <div>
                <p className="text-sm text-gray-600">Potential Savings</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(totalsComparison.savings)}
                </p>
                <p className="text-xs text-gray-500">
                  ({totalsComparison.savingsPercentage.toFixed(1)}%)
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quote Headers Comparison */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <h3 className="text-lg font-semibold text-gray-900">Supplier Comparison</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-48">
                  Criteria
                </th>
                {quotes.map(quote => (
                  <th
                    key={quote.id}
                    className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider min-w-48"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-center">
                        <Building className="h-4 w-4 mr-2" />
                        {quote.supplier_name}
                      </div>
                      {totalsComparison?.lowestQuoteId === quote.id && !isQuoteExpired(quote) && (
                        <div className="flex items-center justify-center">
                          <Award className="h-4 w-4 text-yellow-500 mr-1" />
                          <span className="text-xs text-yellow-600 font-medium">Best Price</span>
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {/* Quote Number */}
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Quote Number
                </td>
                {quotes.map(quote => (
                  <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                    <button
                      onClick={() => handleViewQuote(quote.id)}
                      className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {quote.quote_number}
                    </button>
                  </td>
                ))}
              </tr>

              {/* Status */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Status
                </td>
                {quotes.map(quote => (
                  <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                    {getStatusBadge(quote.status as QuoteStatus, isQuoteExpired(quote))}
                  </td>
                ))}
              </tr>

              {/* Total Amount */}
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Total Amount
                </td>
                {quotes.map(quote => {
                  const isLowest =
                    totalsComparison?.lowestQuoteId === quote.id && !isQuoteExpired(quote);
                  return (
                    <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                      <div
                        className={`text-lg font-bold ${isLowest ? 'text-green-600' : 'text-gray-900'}`}
                      >
                        {formatCurrency(quote.total_amount)}
                        {isLowest && (
                          <div className="text-xs text-green-600 mt-1">Lowest Price</div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Quote Date */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Quote Date
                </td>
                {quotes.map(quote => (
                  <td
                    key={quote.id}
                    className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900"
                  >
                    {formatDate(quote.quote_date)}
                  </td>
                ))}
              </tr>

              {/* Valid Until */}
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Valid Until
                </td>
                {quotes.map(quote => {
                  const expired = isQuoteExpired(quote);
                  return (
                    <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                      <div className={`text-sm ${expired ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatDate(quote.valid_until)}
                        {expired && (
                          <div className="text-xs text-red-600 mt-1 flex items-center justify-center">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Expired
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>

              {/* Payment Terms */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Payment Terms
                </td>
                {quotes.map(quote => (
                  <td key={quote.id} className="px-6 py-4 text-center text-sm text-gray-900">
                    <div className="flex items-center justify-center">
                      <CreditCard className="h-4 w-4 mr-2 text-gray-400" />
                      {quote.payment_terms || 'Not specified'}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Delivery Terms */}
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Delivery Terms
                </td>
                {quotes.map(quote => (
                  <td key={quote.id} className="px-6 py-4 text-center text-sm text-gray-900">
                    <div className="flex items-center justify-center">
                      <Truck className="h-4 w-4 mr-2 text-gray-400" />
                      {quote.delivery_terms || 'Not specified'}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Actions */}
              <tr className="bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  Actions
                </td>
                {quotes.map(quote => (
                  <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <button
                        onClick={() => handleViewQuote(quote.id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Quote"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {canSelectQuote(quote) && quote.status !== 'selected' && (
                        <button
                          onClick={() => handleSelectQuote(quote.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Select Quote"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}

                      {quote.status === 'selected' && (
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="h-4 w-4 mr-1" />
                          <span className="text-xs font-medium">Selected</span>
                        </div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Item-by-Item Comparison */}
      {comparisonMatrix.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">Item-by-Item Comparison</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quantity
                  </th>
                  {quotes.map(quote => (
                    <th
                      key={quote.id}
                      className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"
                    >
                      {quote.supplier_name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {comparisonMatrix.map((row, index) => (
                  <tr key={row.item_id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Package className="h-4 w-4 text-gray-400 mr-3" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{row.item_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-900">
                      {parseFloat(row.quantity).toLocaleString()}
                    </td>
                    {quotes.map(quote => {
                      const quoteItem = row.quotes.find(q => q.quote_id === quote.id);
                      const isLowest = row.lowest_price_quote_id === quote.id;

                      if (!quoteItem) {
                        return (
                          <td
                            key={quote.id}
                            className="px-6 py-4 whitespace-nowrap text-center text-sm text-gray-500"
                          >
                            Not quoted
                          </td>
                        );
                      }

                      return (
                        <td key={quote.id} className="px-6 py-4 whitespace-nowrap text-center">
                          <div
                            className={`${isLowest ? 'bg-green-50 border border-green-200 rounded-lg p-2' : ''}`}
                          >
                            <div
                              className={`text-sm font-medium ${isLowest ? 'text-green-800' : 'text-gray-900'}`}
                            >
                              {formatCurrency(quoteItem.unit_price)}
                              {isLowest && (
                                <div className="text-xs text-green-600 mt-1 flex items-center justify-center">
                                  <TrendingDown className="h-3 w-3 mr-1" />
                                  Best Price
                                </div>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              Total: {formatCurrency(quoteItem.total_price)}
                            </div>
                            {quoteItem.lead_time_days > 0 && (
                              <div className="text-xs text-gray-500 flex items-center justify-center mt-1">
                                <Clock className="h-3 w-3 mr-1" />
                                {quoteItem.lead_time_days} days
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Selection Modal */}
      {showSelectionModal && selectedQuoteId && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Select Quote</h3>
                <button
                  onClick={() => setShowSelectionModal(false)}
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
                  Selection Comments (optional)
                </label>
                <textarea
                  value={selectionComments}
                  onChange={e => setSelectionComments(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add any comments about the selection..."
                />
              </div>

              <div className="flex justify-end space-x-3">
                <EnhancedButton onClick={() => setShowSelectionModal(false)} variant="outline">
                  Cancel
                </EnhancedButton>
                <EnhancedButton
                  onClick={confirmSelectQuote}
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

export default QuoteComparisonPage;
