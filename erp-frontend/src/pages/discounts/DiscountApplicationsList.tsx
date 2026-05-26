import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Search,
  Plus,
  Filter,
  Eye,
  Calendar,
  User,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Send,
} from 'lucide-react';
import {
  discountService,
  DiscountApplication,
  DiscountApplicationListParams,
} from '../../services/discountService';
import { useToast } from '../../hooks/useToast';

const DiscountApplicationsList: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();
  const [applications, setApplications] = useState<DiscountApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<DiscountApplicationListParams>({});
  const [pagination, setPagination] = useState({
    count: 0,
    next: null,
    previous: null,
    currentPage: 1,
  });

  const fetchApplications = async (params?: DiscountApplicationListParams) => {
    try {
      setLoading(true);
      const response = await discountService.getDiscountApplications(params);
      setApplications(response.results);
      setPagination({
        count: response.count,
        next: response.next,
        previous: response.previous,
        currentPage: params?.page || 1,
      });
    } catch (error) {
      toast.error('Failed to fetch discount applications');
      console.error('Error fetching applications:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications({ ...filters, search: searchTerm });
  }, [filters, searchTerm]);

  const handleSearch = (value: string) => {
    setSearchTerm(value);
    setFilters(prev => ({ ...prev, page: 1 }));
  };

  const handleFilterChange = (key: keyof DiscountApplicationListParams, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value, page: 1 }));
  };

  const handlePageChange = (page: number) => {
    setFilters(prev => ({ ...prev, page }));
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      draft: {
        color: 'bg-gray-100 text-gray-800',
        icon: FileText,
        label: 'Draft',
      },
      submitted: {
        color: 'bg-blue-100 text-blue-800',
        icon: Send,
        label: 'Submitted',
      },
      under_review: {
        color: 'bg-yellow-100 text-yellow-800',
        icon: Clock,
        label: 'Under Review',
      },
      approved: {
        color: 'bg-green-100 text-green-800',
        icon: CheckCircle,
        label: 'Approved',
      },
      rejected: {
        color: 'bg-red-100 text-red-800',
        icon: XCircle,
        label: 'Rejected',
      },
      expired: {
        color: 'bg-orange-100 text-orange-800',
        icon: AlertCircle,
        label: 'Expired',
      },
      revoked: {
        color: 'bg-purple-100 text-purple-800',
        icon: XCircle,
        label: 'Revoked',
      },
    };

    const config = statusConfig[status as keyof typeof statusConfig];
    if (!config) return null;

    const IconComponent = config.icon;

    return (
      <span
        className={`px-2 py-1 text-xs font-medium rounded-full flex items-center gap-1 ${config.color}`}
      >
        <IconComponent className="h-3 w-3" />
        {config.label}
      </span>
    );
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship',
      staff_benefit: 'Staff Benefit',
      discount: 'Discount',
      waiver: 'Waiver',
      insurance: 'Insurance',
      promotion: 'Promotion',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discount Applications</h1>
          <p className="text-gray-600">Manage discount and scholarship applications</p>
        </div>
        <Link
          to="/discounts/applications/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
          New Application
        </Link>
      </div>

      {/* Search and Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Search applications..."
                value={searchTerm}
                onChange={e => handleSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <select
              value={filters.status || ''}
              onChange={e => handleFilterChange('status', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="draft">Draft</option>
              <option value="submitted">Submitted</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
            </select>

            <select
              value={filters.program || ''}
              onChange={e =>
                handleFilterChange('program', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Programs</option>
              {/* In real app, fetch programs from API */}
              <option value="1">Merit Scholarship 2026</option>
              <option value="2">Staff Discount Program</option>
              <option value="3">Financial Aid Waiver</option>
            </select>

            <select
              value={filters.client || ''}
              onChange={e =>
                handleFilterChange('client', e.target.value ? parseInt(e.target.value) : undefined)
              }
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Clients</option>
              {/* In real app, fetch clients from API */}
              <option value="1">John Doe</option>
              <option value="2">Jane Smith</option>
              <option value="3">Bob Johnson</option>
            </select>
          </div>
        </div>
      </div>

      {/* Applications List */}
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {applications.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <FileText className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No applications found</h3>
            <p className="text-gray-600 mb-4">
              Get started by creating your first discount application.
            </p>
            <Link
              to="/discounts/applications/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 inline-flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Application
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Application
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Program
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Applicant
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Discount Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Application Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Review Info
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {applications.map(application => (
                  <tr key={application.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {application.application_number}
                        </div>
                        <div className="text-xs text-gray-500 max-w-xs truncate">
                          {application.reason}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {application.program_detail?.name || `Program #${application.program}`}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getProgramTypeLabel(
                            application.program_detail?.program_type || 'discount'
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-400" />
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {application.client_detail?.name || `Client #${application.client}`}
                          </div>
                          <div className="text-xs text-gray-500">
                            {application.client_detail?.email || 'No email'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {formatCurrency(application.actual_discount_value)}
                      </div>
                      {application.custom_discount_value && (
                        <div className="text-xs text-gray-500">
                          Custom: {formatCurrency(application.custom_discount_value)}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-sm text-gray-900">
                          {application.application_date
                            ? new Date(application.application_date).toLocaleDateString()
                            : new Date(application.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(application.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {application.reviewed_by_name && (
                        <div>
                          <div className="text-sm text-gray-900">
                            {application.reviewed_by_name}
                          </div>
                          {application.review_date && (
                            <div className="text-xs text-gray-500">
                              {new Date(application.review_date).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      )}
                      {application.effective_from && application.status === 'approved' && (
                        <div className="text-xs text-green-600">
                          Effective: {new Date(application.effective_from).toLocaleDateString()}
                          {application.effective_to && (
                            <> - {new Date(application.effective_to).toLocaleDateString()}</>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => navigate(`/discounts/applications/${application.id}`)}
                        className="text-blue-600 hover:text-blue-900 p-1"
                        title="View Details"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.count > 0 && (
        <div className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6 rounded-lg shadow-sm">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => handlePageChange(pagination.currentPage - 1)}
              disabled={!pagination.previous}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => handlePageChange(pagination.currentPage + 1)}
              disabled={!pagination.next}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing page <span className="font-medium">{pagination.currentPage}</span> of{' '}
                <span className="font-medium">{Math.ceil(pagination.count / 20)}</span> (
                {pagination.count} total applications)
              </p>
            </div>
            <div>
              <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                <button
                  onClick={() => handlePageChange(pagination.currentPage - 1)}
                  disabled={!pagination.previous}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <button
                  onClick={() => handlePageChange(pagination.currentPage + 1)}
                  disabled={!pagination.next}
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

export default DiscountApplicationsList;
