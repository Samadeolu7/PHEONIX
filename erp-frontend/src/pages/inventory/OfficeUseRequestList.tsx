import React, { useState } from 'react';
import { Plus, FileText, Clock, CheckCircle, XCircle, Search, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOfficeUseRequests, useOfficeUseRequestSummary } from '../../hooks/useLedger';
import { OfficeUseRequestFilters, OfficeUseRequestStatus } from '../../types/ledger';

const STATUS_COLORS: Record<OfficeUseRequestStatus, string> = {
  draft: 'bg-gray-100 text-gray-800',
  submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  fulfilled: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-orange-100 text-orange-800',
};

const STATUS_ICONS: Record<OfficeUseRequestStatus, React.ReactNode> = {
  draft: <FileText className="w-4 h-4" />,
  submitted: <Clock className="w-4 h-4" />,
  approved: <CheckCircle className="w-4 h-4" />,
  rejected: <XCircle className="w-4 h-4" />,
  fulfilled: <CheckCircle className="w-4 h-4" />,
  cancelled: <XCircle className="w-4 h-4" />,
};

const OfficeUseRequestList: React.FC = () => {
  const navigate = useNavigate();

  const [filters, setFilters] = useState<OfficeUseRequestFilters>({
    page: 1,
    page_size: 20,
  });

  const { data: listResponse, isLoading } = useOfficeUseRequests(filters);
  const { data: summary } = useOfficeUseRequestSummary();

  const requests = listResponse?.results || [];
  const totalCount = listResponse?.count || 0;

  const handleFilterChange = (key: keyof OfficeUseRequestFilters, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Office Use Requests</h1>
            <p className="text-gray-600 mt-1">
              Internal requests for inventory items used in office operations
            </p>
          </div>
          <button
            onClick={() => navigate('/inventory/office-use-requests/create')}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-sm"
          >
            <Plus className="w-5 h-5 mr-2" />
            New Office Use Request
          </button>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-gray-400">
              <p className="text-sm text-gray-600">Draft</p>
              <p className="text-2xl font-bold text-gray-900">{summary.draft_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-400">
              <p className="text-sm text-gray-600">Pending Approval</p>
              <p className="text-2xl font-bold text-blue-600">{summary.pending_approval_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-400">
              <p className="text-sm text-gray-600">Approved</p>
              <p className="text-2xl font-bold text-green-600">{summary.approved_count}</p>
            </div>
            <div className="bg-white rounded-lg shadow p-4 border-l-4 border-purple-400">
              <p className="text-sm text-gray-600">Fulfilled</p>
              <p className="text-2xl font-bold text-purple-600">{summary.fulfilled_count}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search requests..."
              className="pl-10 w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              onChange={e => handleFilterChange('search', e.target.value || undefined)}
            />
          </div>

          <select
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => handleFilterChange('status', e.target.value || undefined)}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="submitted">Submitted</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => handleFilterChange('date_from', e.target.value || undefined)}
          />

          <input
            type="date"
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => handleFilterChange('date_to', e.target.value || undefined)}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-3">
          <input
            type="text"
            placeholder="Filter by department..."
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onChange={e => handleFilterChange('department', e.target.value || undefined)}
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto h-12 w-12 text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No office use requests found</h3>
            <p className="text-gray-500 mt-1">Create a new request to get started.</p>
            <button
              onClick={() => navigate('/inventory/office-use-requests/create')}
              className="mt-4 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Office Use Request
            </button>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Request #
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Requested By
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Department
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Purpose
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Items
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map(req => (
                <tr
                  key={req.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/inventory/office-use-requests/${req.id}`)}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    {req.request_number}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(req.request_date)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {req.requested_by_name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.department || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
                    {req.purpose}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {req.total_items}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[req.status]}`}
                    >
                      {STATUS_ICONS[req.status]}
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        navigate(`/inventory/office-use-requests/${req.id}`);
                      }}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {totalCount > (filters.page_size || 20) && (
          <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200">
            <p className="text-sm text-gray-700">
              Showing {((filters.page || 1) - 1) * (filters.page_size || 20) + 1} –{' '}
              {Math.min((filters.page || 1) * (filters.page_size || 20), totalCount)} of{' '}
              {totalCount}
            </p>
            <div className="flex gap-2">
              <button
                disabled={(filters.page || 1) <= 1}
                onClick={() => handleFilterChange('page', (filters.page || 1) - 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={(filters.page || 1) * (filters.page_size || 20) >= totalCount}
                onClick={() => handleFilterChange('page', (filters.page || 1) + 1)}
                className="px-3 py-1 border rounded text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficeUseRequestList;
