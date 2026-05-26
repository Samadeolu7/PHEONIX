// src/pages/sales/CreditNotesList.tsx
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoiceService, CreditNote, Invoice } from '../../services/invoiceService';
import { useToast } from '../../hooks/useToast';
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  CheckCircle,
  XCircle,
  CreditCard,
  Calendar,
  User,
  FileText,
} from 'lucide-react';

interface CreditNotesFilters {
  status?: 'draft' | 'issued' | 'applied' | 'cancelled';
  applied_to_account?: boolean;
  search?: string;
  ordering?: string;
  page?: number;
}

const CreditNotesList: React.FC = () => {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [creditNotes, setCreditNotes] = useState<CreditNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<CreditNotesFilters>({
    ordering: '-created_at',
  });
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });
  const { success, error: showError } = useToast();

  useEffect(() => {
    if (invoiceId) {
      loadInvoice();
      loadCreditNotes();
    }
  }, [invoiceId, filters]);

  const loadInvoice = async () => {
    try {
      const invoiceData = await invoiceService.getInvoice(Number(invoiceId));
      setInvoice(invoiceData);
    } catch (error) {
      console.error('Error loading invoice:', error);
      showError('Failed to load invoice');
      navigate('/sales/invoices');
    }
  };

  const loadCreditNotes = async () => {
    if (!invoiceId) return;

    try {
      setLoading(true);
      const response = await invoiceService.getCreditNotes(Number(invoiceId), filters);
      setCreditNotes(response.results || []);
      setPagination({
        count: response.count || 0,
        next: response.next,
        previous: response.previous,
        currentPage: filters.page || 1,
      });
    } catch (error) {
      console.error('Error loading credit notes:', error);
      showError('Failed to load credit notes');
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (key: keyof CreditNotesFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: 1, // Reset to first page when filtering
    }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB');
  };

  const getStatusBadge = (status: CreditNote['status']) => {
    const statusConfig = {
      draft: { color: 'bg-gray-100 text-gray-800', label: 'Draft', icon: FileText },
      issued: { color: 'bg-blue-100 text-blue-800', label: 'Issued', icon: CreditCard },
      applied: { color: 'bg-green-100 text-green-800', label: 'Applied', icon: CheckCircle },
      cancelled: { color: 'bg-red-100 text-red-800', label: 'Cancelled', icon: XCircle },
    };

    const config = statusConfig[status];
    const IconComponent = config.icon;

    return (
      <span
        className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${config.color}`}
      >
        <IconComponent className="h-3 w-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const getTotalPages = () => {
    return Math.ceil(pagination.count / 20); // Assuming 20 items per page
  };

  if (!invoice) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => navigate(`/sales/invoices/${invoiceId}/view`)}
              className="p-2 text-gray-400 hover:text-gray-600"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Credit Notes for Invoice {invoice.invoice_number}
              </h1>
              <p className="text-gray-600">
                Manage credit notes for {invoice.client_name} • {formatCurrency(invoice.amount)}
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes/create`)}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Credit Note
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={filters.search || ''}
                onChange={e => handleFilterChange('search', e.target.value || undefined)}
                placeholder="Search credit notes..."
                className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="applied">Applied</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Applied Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Applied Status</label>
            <select
              value={
                filters.applied_to_account === undefined
                  ? ''
                  : filters.applied_to_account.toString()
              }
              onChange={e =>
                handleFilterChange(
                  'applied_to_account',
                  e.target.value === '' ? undefined : e.target.value === 'true'
                )
              }
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All</option>
              <option value="true">Applied to Account</option>
              <option value="false">Not Applied</option>
            </select>
          </div>

          {/* Sort */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
            <select
              value={filters.ordering || '-created_at'}
              onChange={e => handleFilterChange('ordering', e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="-created_at">Newest First</option>
              <option value="created_at">Oldest First</option>
              <option value="-issue_date">Issue Date (Newest)</option>
              <option value="issue_date">Issue Date (Oldest)</option>
              <option value="-total_amount">Amount (High to Low)</option>
              <option value="total_amount">Amount (Low to High)</option>
              <option value="status">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Credit Notes List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Credit Notes ({pagination.count})</h3>
            <div className="flex items-center space-x-2 text-sm text-gray-500">
              <Filter className="h-4 w-4" />
              <span>
                {filters.status && `Status: ${filters.status}`}
                {filters.applied_to_account !== undefined &&
                  ` • Applied: ${filters.applied_to_account ? 'Yes' : 'No'}`}
                {filters.search && ` • Search: "${filters.search}"`}
              </span>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : creditNotes.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credit Note
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Issue Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Reason
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Applied
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {creditNotes.map(creditNote => (
                    <tr key={creditNote.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <CreditCard className="h-5 w-5 text-gray-400 mr-3" />
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {creditNote.credit_note_number}
                            </div>
                            <div className="text-sm text-gray-500">ID: {creditNote.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center text-sm text-gray-900">
                          <Calendar className="h-4 w-4 text-gray-400 mr-2" />
                          {formatDate(creditNote.issue_date)}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 max-w-xs truncate">
                          {creditNote.reason}
                        </div>
                        {creditNote.notes && (
                          <div className="text-sm text-gray-500 max-w-xs truncate">
                            {creditNote.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {formatCurrency(creditNote.total_amount)}
                        </div>
                        {creditNote.remaining_amount !== creditNote.total_amount && (
                          <div className="text-sm text-gray-500">
                            Remaining: {formatCurrency(creditNote.remaining_amount)}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(creditNote.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {creditNote.applied_to_account ? (
                          <div className="flex items-center text-sm text-green-600">
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Applied
                            {creditNote.applied_date && (
                              <div className="text-xs text-gray-500 ml-2">
                                {formatDate(creditNote.applied_date)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-500">Not Applied</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() =>
                              navigate(
                                `/sales/invoices/${invoiceId}/credit-notes/${creditNote.id}/view`
                              )
                            }
                            className="text-blue-600 hover:text-blue-900"
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          {creditNote.status === 'draft' && (
                            <button
                              onClick={() =>
                                navigate(
                                  `/sales/invoices/${invoiceId}/credit-notes/${creditNote.id}/edit`
                                )
                              }
                              className="text-green-600 hover:text-green-900"
                              title="Edit"
                            >
                              <Edit className="h-4 w-4" />
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
            {getTotalPages() > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.currentPage} of {getTotalPages()}({pagination.count}{' '}
                    total credit notes)
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.currentPage - 1)}
                      disabled={!pagination.previous}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.currentPage + 1)}
                      disabled={!pagination.next}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No credit notes found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {Object.keys(filters).some(
                key => filters[key as keyof CreditNotesFilters] !== undefined && key !== 'ordering'
              )
                ? 'No credit notes match your current filters.'
                : 'No credit notes have been created for this invoice yet.'}
            </p>
            <div className="mt-6">
              <button
                onClick={() => navigate(`/sales/invoices/${invoiceId}/credit-notes/create`)}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create First Credit Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreditNotesList;
