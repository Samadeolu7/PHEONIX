import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus,
  Search,
  Filter,
  Eye,
  Edit,
  Trash2,
  DollarSign,
  Users,
  Calendar,
  AlertCircle,
  CheckCircle,
  Award,
  Gift,
  Shield,
  Percent,
} from 'lucide-react';
import { discountService, DiscountProgram } from '../../services/discountService';

const DiscountProgramsList: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [programTypeFilter, setProgramTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const {
    data: programsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: [
      'discount-programs',
      {
        search: searchTerm,
        program_type: programTypeFilter,
        is_active:
          statusFilter === 'active' ? true : statusFilter === 'inactive' ? false : undefined,
      },
    ],
    queryFn: async () => {
      try {
        const params: any = {
          ordering: '-created_at',
        };

        if (searchTerm) params.search = searchTerm;
        if (programTypeFilter) params.program_type = programTypeFilter;
        if (statusFilter === 'active') params.is_active = true;
        if (statusFilter === 'inactive') params.is_active = false;

        const response = await discountService.getDiscountPrograms(params);
        return response;
      } catch (error) {
        console.error('Error fetching discount programs:', error);
        // Return a default structure to prevent undefined
        return {
          count: 0,
          next: null,
          previous: null,
          results: [],
        };
      }
    },
    retry: 3,
    retryDelay: 1000,
  });

  const programs = programsData?.results || [];

  const getProgramTypeIcon = (type: string) => {
    switch (type) {
      case 'scholarship':
        return <Award className="w-5 h-5 text-blue-600" />;
      case 'staff_benefit':
        return <Users className="w-5 h-5 text-green-600" />;
      case 'discount':
        return <Percent className="w-5 h-5 text-purple-600" />;
      case 'waiver':
        return <Gift className="w-5 h-5 text-orange-600" />;
      case 'insurance':
        return <Shield className="w-5 h-5 text-indigo-600" />;
      case 'promotion':
        return <Gift className="w-5 h-5 text-pink-600" />;
      default:
        return <DollarSign className="w-5 h-5 text-gray-600" />;
    }
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship',
      staff_benefit: 'Staff Benefit',
      discount: 'Customer Discount',
      waiver: 'Fee Waiver',
      insurance: 'Insurance Coverage',
      promotion: 'Promotional Discount',
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getStatusBadge = (program: DiscountProgram) => {
    if (!program.is_active) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
          Inactive
        </span>
      );
    }
    if (!program.is_valid) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded-full">
          Expired
        </span>
      );
    }
    if (!program.is_within_budget) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded-full">
          Budget Exceeded
        </span>
      );
    }
    if (!program.has_recipient_capacity) {
      return (
        <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
          At Capacity
        </span>
      );
    }
    return (
      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
        Active
      </span>
    );
  };

  const getBudgetUtilization = (program: DiscountProgram) => {
    const utilization = parseFloat(program.budget_utilization_percent);
    let colorClass = 'bg-green-500';
    if (utilization >= 90) colorClass = 'bg-red-500';
    else if (utilization >= 70) colorClass = 'bg-yellow-500';

    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${colorClass}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">Error loading programs</h3>
            <p className="mt-1 text-sm text-red-700">
              {error instanceof Error ? error.message : 'An unexpected error occurred'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Discount Programs</h1>
          <p className="text-gray-600">Manage scholarships, discounts, and waivers</p>
        </div>
        <Link
          to="/discounts/programs/create"
          className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Program
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search programs..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
            <select
              value={programTypeFilter}
              onChange={e => setProgramTypeFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Types</option>
              <option value="scholarship">Scholarship</option>
              <option value="staff_benefit">Staff Benefit</option>
              <option value="discount">Customer Discount</option>
              <option value="waiver">Fee Waiver</option>
              <option value="insurance">Insurance Coverage</option>
              <option value="promotion">Promotional Discount</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setProgramTypeFilter('');
                setStatusFilter('');
              }}
              className="w-full px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Programs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {programs.map(program => (
          <div
            key={program.id}
            className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow"
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  {getProgramTypeIcon(program.program_type)}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{program.name}</h3>
                    <p className="text-sm text-gray-500">{program.program_code}</p>
                  </div>
                </div>
                {getStatusBadge(program)}
              </div>

              {/* Program Details */}
              <div className="space-y-3 mb-4">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium">{getProgramTypeLabel(program.program_type)}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount:</span>
                  <span className="font-medium">
                    {program.discount_type === 'percentage'
                      ? `${program.discount_value}%`
                      : program.discount_type === 'full_waiver'
                        ? '100% Waiver'
                        : `₦${parseFloat(program.discount_value).toLocaleString()}`}
                  </span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Recipients:</span>
                  <span className="font-medium">
                    {program.current_recipients}
                    {program.max_recipients > 0 && ` / ${program.max_recipients}`}
                  </span>
                </div>

                {parseFloat(program.budget_allocated) > 0 && (
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Budget Used:</span>
                      <span className="font-medium">
                        ₦{parseFloat(program.budget_used).toLocaleString()} / ₦
                        {parseFloat(program.budget_allocated).toLocaleString()}
                      </span>
                    </div>
                    {getBudgetUtilization(program)}
                    <div className="text-xs text-gray-500 mt-1">
                      {program.budget_utilization_percent}% utilized
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Period:</span>
                  <span className="font-medium">
                    {new Date(program.start_date).toLocaleDateString()}
                    {program.end_date && ` - ${new Date(program.end_date).toLocaleDateString()}`}
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex space-x-2 pt-4 border-t">
                <Link
                  to={`/discounts/programs/${program.id}`}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  View
                </Link>
                <Link
                  to={`/discounts/programs/${program.id}/edit`}
                  className="flex-1 inline-flex items-center justify-center px-3 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {programs.length === 0 && (
        <div className="text-center py-12">
          <Award className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No discount programs</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new discount program.
          </p>
          <div className="mt-6">
            <Link
              to="/discounts/programs/create"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Program
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiscountProgramsList;
