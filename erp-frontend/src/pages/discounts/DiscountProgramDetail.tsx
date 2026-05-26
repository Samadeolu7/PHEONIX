import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Settings,
  DollarSign,
  Users,
  Calendar,
  Award,
  Gift,
  Shield,
  Percent,
  TrendingUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  BarChart3,
  Eye,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { discountService, DiscountProgram } from '../../services/discountService';
import { useToast } from '../../hooks/useToast';

const DiscountProgramDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const toast = useToast();

  const {
    data: programsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['discount-program', id],
    queryFn: async () => {
      try {
        // Since we don't have a single program endpoint, we'll get all and filter
        const response = await discountService.getDiscountPrograms({});
        return response;
      } catch (error) {
        console.error('Error fetching discount program:', error);
        return {
          count: 0,
          next: null,
          previous: null,
          results: [],
        };
      }
    },
    enabled: !!id,
  });

  const program = programsData?.results?.find((p: DiscountProgram) => p.id === parseInt(id!));

  const getProgramTypeIcon = (type: string) => {
    switch (type) {
      case 'scholarship':
        return <Award className="w-6 h-6 text-blue-600" />;
      case 'staff_benefit':
        return <Users className="w-6 h-6 text-green-600" />;
      case 'discount':
        return <Percent className="w-6 h-6 text-purple-600" />;
      case 'waiver':
        return <Gift className="w-6 h-6 text-orange-600" />;
      case 'insurance':
        return <Shield className="w-6 h-6 text-indigo-600" />;
      case 'promotion':
        return <Gift className="w-6 h-6 text-pink-600" />;
      default:
        return <DollarSign className="w-6 h-6 text-gray-600" />;
    }
  };

  const getProgramTypeLabel = (type: string) => {
    const labels = {
      scholarship: 'Scholarship/Grant',
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
        <span className="px-3 py-1 text-sm font-medium bg-gray-100 text-gray-800 rounded-full">
          Inactive
        </span>
      );
    }
    if (!program.is_valid) {
      return (
        <span className="px-3 py-1 text-sm font-medium bg-red-100 text-red-800 rounded-full">
          Expired
        </span>
      );
    }
    if (!program.is_within_budget) {
      return (
        <span className="px-3 py-1 text-sm font-medium bg-orange-100 text-orange-800 rounded-full">
          Budget Exceeded
        </span>
      );
    }
    if (!program.has_recipient_capacity) {
      return (
        <span className="px-3 py-1 text-sm font-medium bg-yellow-100 text-yellow-800 rounded-full">
          At Capacity
        </span>
      );
    }
    return (
      <span className="px-3 py-1 text-sm font-medium bg-green-100 text-green-800 rounded-full">
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
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`h-3 rounded-full ${colorClass}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
    );
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Program not found</h3>
        <p className="text-gray-600 mb-4">The requested discount program could not be found.</p>
        <button
          onClick={() => navigate('/discounts/programs')}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          Back to Programs
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/discounts/programs')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-3">
            {getProgramTypeIcon(program.program_type)}
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{program.name}</h1>
              <p className="text-gray-600">{program.program_code}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(program)}
          <button
            onClick={() => navigate(`/discounts/programs/${program.id}/edit`)}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit Program
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Program Overview */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Program Overview</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Program Type</label>
                <p className="text-gray-900">{getProgramTypeLabel(program.program_type)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Type
                </label>
                <p className="text-gray-900">
                  {program.discount_type === 'percentage'
                    ? `${program.discount_value}% Discount`
                    : program.discount_type === 'full_waiver'
                      ? 'Full Waiver (100%)'
                      : `${formatCurrency(program.discount_value)} Fixed Amount`}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Validity Period
                </label>
                <p className="text-gray-900 flex items-center gap-1">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  {new Date(program.start_date).toLocaleDateString()}
                  {program.end_date && ` - ${new Date(program.end_date).toLocaleDateString()}`}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Requires Approval
                </label>
                <p className="text-gray-900">{program.requires_approval ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Renewable</label>
                <p className="text-gray-900">
                  {program.is_renewable ? `Yes (${program.renewal_period})` : 'No'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Account
                </label>
                <p className="text-gray-900">
                  {program.discount_account_detail?.code} - {program.discount_account_detail?.name}
                </p>
              </div>
            </div>

            {program.description && (
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-gray-900">{program.description}</p>
                </div>
              </div>
            )}
          </div>

          {/* Budget Information */}
          {parseFloat(program.budget_allocated || '0') > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Budget Information
              </h2>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Budget Allocated
                    </label>
                    <p className="text-2xl font-bold text-gray-900">
                      {formatCurrency(program.budget_allocated!)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Budget Used
                    </label>
                    <p className="text-2xl font-bold text-blue-600">
                      {formatCurrency(program.budget_used)}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Budget Remaining
                    </label>
                    <p className="text-2xl font-bold text-green-600">
                      {formatCurrency(program.budget_remaining)}
                    </p>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Budget Utilization</span>
                    <span className="font-medium">{program.budget_utilization_percent}%</span>
                  </div>
                  {getBudgetUtilization(program)}
                </div>
              </div>
            </div>
          )}

          {/* Recipients Information */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Users className="h-5 w-5" />
              Recipients Information
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current Recipients
                </label>
                <p className="text-3xl font-bold text-blue-600">{program.current_recipients}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Maximum Recipients
                </label>
                <p className="text-3xl font-bold text-gray-900">
                  {program.max_recipients || 'Unlimited'}
                </p>
              </div>
              {program.max_recipients && program.max_recipients > 0 && (
                <div className="md:col-span-2">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-600">Capacity Utilization</span>
                    <span className="font-medium">
                      {Math.round((program.current_recipients / program.max_recipients) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-blue-500"
                      style={{
                        width: `${Math.min((program.current_recipients / program.max_recipients) * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Status</span>
                {getStatusBadge(program)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Created</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(program.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Last Updated</span>
                <span className="text-sm font-medium text-gray-900">
                  {new Date(program.updated_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>

            <div className="space-y-3">
              <button
                onClick={() => navigate(`/discounts/programs/${program.id}/edit`)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50"
              >
                <Edit className="h-4 w-4" />
                Edit Program
              </button>
              <button
                onClick={() =>
                  navigate('/discounts/applications', { state: { programFilter: program.id } })
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <FileText className="h-4 w-4" />
                View Applications
              </button>
              <button
                onClick={() =>
                  navigate('/discounts/applied', { state: { programFilter: program.id } })
                }
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                <CheckCircle className="h-4 w-4" />
                View Applied Discounts
              </button>
            </div>
          </div>

          {/* Eligibility Criteria */}
          {program.eligibility_criteria && Object.keys(program.eligibility_criteria).length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Eligibility Criteria</h3>

              <div className="bg-gray-50 rounded-lg p-4">
                <pre className="text-sm text-gray-900 whitespace-pre-wrap">
                  {JSON.stringify(program.eligibility_criteria, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscountProgramDetail;
