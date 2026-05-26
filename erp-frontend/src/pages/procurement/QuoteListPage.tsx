import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  FileText,
  ShoppingCart,
  Calendar,
  User,
  Building,
  DollarSign,
  ExternalLink,
  GitCompare,
} from 'lucide-react';

import { useQuotes, useSelectQuote, useAllProcurementSuppliers } from '../../hooks/useProcurement';
import { useToast } from '../../hooks/useToast';
import { ErrorDisplay } from '../../components/error/ErrorDisplay';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { EnhancedButton } from '../../components/ui/EnhancedButton';
import { Breadcrumb } from '../../components/ui/Breadcrumb';
import { Quote, QuoteStatus, getQuoteStatusColor, getQuoteStatusLabel } from '../../types/quotes';

const QuoteListPage: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSupplier, setFilterSupplier] = useState('all');
  const [filterRequisition, setFilterRequisition] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [sortBy, setSortBy] = useState('-created_at');
  const [selectedQuotes, setSelectedQuotes] = useState<number[]>([]);

  // React Query hooks
  const {
    data: quotesData,
    isLoading,
    error,
  } = useQuotes({
    search: searchQuery || undefined,
    status: filterStatus === 'all' ? undefined : (filterStatus as QuoteStatus),
    supplier_id: filterSupplier === 'all' ? undefined : parseInt(filterSupplier),
    requisition_id: filterRequisition === 'all' ? undefined : parseInt(filterRequisition),
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ordering: sortBy,
  });

  const { data: suppliersData } = useAllProcurementSuppliers({ is_active: true });

  // Mutations
  const selectQuoteMutation = useSelectQuote();

  const quotes = quotesData?.results || [];
  const suppliers = suppliersData || [];

  const processing = selectQuoteMutation.isPending;

  const handleSelectQuote = async (quoteId: number) => {
    try {
      await selectQuoteMutation.mutateAsync({ id: quoteId });
      toast.success('Quote selected successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to select quote');
    }
  };

  const handleViewQuote = (quoteId: number) => {
    navigate(`/procurement/quotes/${quoteId}`);
  };

  const handleEditQuote = (quoteId: number) => {
    navigate(`/procurement/quotes/${quoteId}/edit`);
  };

  const handleCompareQuotes = (requisitionId: number) => {
    navigate(`/procurement/quotes/compare/${requisitionId}`);
  };

  const handleCreateQuote = () => {
    navigate('/procurement/quotes/new');
  };

  const clearFilters = () => {
    setSearchQuery('');
    setFilterStatus('all');
    setFilterSupplier('all');
    setFilterRequisition('all');
    setDateFrom('');
    setDateTo('');
    setSortBy('-created_at');
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
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClasses[color as keyof typeof colorClasses] || colorClasses.gray}`}
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
      month: 'short',
      day: 'numeric',
    });
  };

  if (isLoading) {
    return <LoadingOverlay message="Loading quotes..." />;
  }

  if (error) {
    return (
      <ErrorDisplay
        title="Failed to load quotes"
        message={error.message}
        onRetry={() => window.location.reload()}
      />
    );
  }

  const breadcrumbItems = [
    { label: 'Procurement', href: '/procurement' },
    { label: 'Supplier Quotes', current: true },
  ];

  return (
    <div className="space-y-6">
      {processing && <LoadingOverlay message="Processing..." />}

      {/* Breadcrumb */}
      <Breadcrumb items={breadcrumbItems} />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Supplier Quotes</h1>
          <p className="text-gray-600">Manage and compare supplier quotes</p>
        </div>
        <EnhancedButton
          onClick={handleCreateQuote}
          className="bg-blue-600 hover:bg-blue-700 text-white"
          icon={Plus}
        >
          Create Quote
        </EnhancedButton>
      </div>

      {/* Filters */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search quotes..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Statuses</option>
            <option value="received">Received</option>
            <option value="selected">Selected</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>

          {/* Supplier Filter */}
          <select
            value={filterSupplier}
            onChange={e => setFilterSupplier(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Suppliers</option>
            {suppliers.map(supplier => (
              <option key={supplier.id} value={supplier.id.toString()}>
                {supplier.name}
              </option>
            ))}
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="-created_at">Newest First</option>
            <option value="created_at">Oldest First</option>
            <option value="quote_number">Quote Number</option>
            <option value="supplier_name">Supplier Name</option>
            <option value="total_amount">Total Amount</option>
            <option value="valid_until">Valid Until</option>
          </select>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="flex items-end">
            <EnhancedButton onClick={clearFilters} variant="outline" className="w-full">
              Clear Filters
            </EnhancedButton>
          </div>
        </div>
      </div>

      {/* Results Summary */}
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-600">
          Showing {quotes.length} of {quotesData?.count || 0} quotes
        </p>
      </div>

      {/* Quotes Table */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quote Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Supplier
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requisition
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Amount
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Valid Until
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotes.map(quote => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <FileText className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {quote.quote_number}
                        </div>
                        <div className="text-sm text-gray-500">{formatDate(quote.quote_date)}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Building className="h-4 w-4 text-gray-400 mr-2" />
                      <div className="text-sm text-gray-900">{quote.supplier_name}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {quote.requisition ? (
                      <div className="flex items-center">
                        <ShoppingCart className="h-4 w-4 text-gray-400 mr-2" />
                        <button
                          onClick={() => navigate(`/procurement/requisitions/${quote.requisition}`)}
                          className="text-sm text-blue-600 hover:text-blue-800"
                        >
                          PR-{quote.requisition}
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(quote.status as QuoteStatus)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <DollarSign className="h-4 w-4 text-gray-400 mr-1" />
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(quote.total_amount)}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDate(quote.valid_until)}</div>
                    {new Date(quote.valid_until) < new Date() && (
                      <div className="text-xs text-red-600 flex items-center mt-1">
                        <AlertCircle className="h-3 w-3 mr-1" />
                        Expired
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end space-x-2">
                      <button
                        onClick={() => handleViewQuote(quote.id)}
                        className="text-blue-600 hover:text-blue-900"
                        title="View Quote"
                      >
                        <Eye className="h-4 w-4" />
                      </button>

                      {quote.status === 'received' && (
                        <button
                          onClick={() => handleSelectQuote(quote.id)}
                          className="text-green-600 hover:text-green-900"
                          title="Select Quote"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                      )}

                      {quote.requisition && (
                        <button
                          onClick={() => handleCompareQuotes(quote.requisition!)}
                          className="text-purple-600 hover:text-purple-900"
                          title="Compare Quotes"
                        >
                          <GitCompare className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {quotes.length === 0 && (
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No quotes found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {searchQuery || filterStatus !== 'all' || filterSupplier !== 'all'
                ? 'Try adjusting your search criteria.'
                : 'Get started by creating a new quote.'}
            </p>
            {!searchQuery && filterStatus === 'all' && filterSupplier === 'all' && (
              <div className="mt-6">
                <EnhancedButton
                  onClick={handleCreateQuote}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  icon={Plus}
                >
                  Create Quote
                </EnhancedButton>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pagination */}
      {quotesData && quotesData.count > 0 && (
        <div className="flex items-center justify-between">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              disabled={!quotesData.previous}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              disabled={!quotesData.next}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page{' '}
                {Math.ceil(
                  (quotesData.count -
                    (quotesData.next ? quotesData.count - quotes.length : quotesData.count)) /
                    quotes.length
                )}{' '}
                of {Math.ceil(quotesData.count / quotes.length)}
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  disabled={!quotesData.previous}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  disabled={!quotesData.next}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuoteListPage;
