import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  Users,
  TrendingUp,
  PieChart,
  BarChart3,
  Calendar,
  Download,
  RefreshCw,
  Filter,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  Award,
  Percent,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { discountService, DiscountProgram } from '../../services/discountService';
import { useToast } from '../../hooks/useToast';

interface ProgramStatistics {
  program_name: string;
  program_code: string;
  budget_allocated: number;
  budget_used: number;
  budget_remaining: number;
  budget_utilization_percent: number;
  max_recipients: number;
  current_recipients: number;
  available_slots: number;
  applications: {
    total: number;
    approved: number;
    active: number;
    pending: number;
    rejected: number;
  };
  discounts: {
    total_count: number;
    total_amount: number;
    posted_count: number;
  };
  is_active: boolean;
  is_valid: boolean;
  is_within_budget: boolean;
  has_capacity: boolean;
}

interface BudgetDetails {
  id: number;
  program_code: string;
  name: string;
  program_type: string;
  discount_type: string;
  discount_value: string;
  budget_allocated: string;
  budget_used: string;
  budget_remaining: string;
  budget_utilization_percent: string;
  max_recipients: number;
  current_recipients: number;
  is_within_budget: boolean;
  has_recipient_capacity: boolean;
  is_valid: boolean;
}

const DiscountAnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const toast = useToast();

  const [selectedProgram, setSelectedProgram] = useState<number | null>(null);
  const [programStats, setProgramStats] = useState<ProgramStatistics | null>(null);
  const [budgetDetails, setBudgetDetails] = useState<BudgetDetails | null>(null);
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0], // Start of year
    end: new Date().toISOString().split('T')[0], // Today
  });
  const [programTypeFilter, setProgramTypeFilter] = useState<string>('');

  // Fetch all programs
  const {
    data: programsData,
    isLoading: loadingPrograms,
    refetch: refetchPrograms,
  } = useQuery({
    queryKey: ['discount-programs-analytics'],
    queryFn: async () => {
      const response = await discountService.getDiscountPrograms({
        ordering: '-created_at',
      });
      return response;
    },
  });

  const programs = programsData?.results || [];
  const filteredPrograms = programs.filter(
    program => !programTypeFilter || program.program_type === programTypeFilter
  );

  useEffect(() => {
    if (selectedProgram) {
      fetchProgramStatistics(selectedProgram);
      fetchBudgetDetails(selectedProgram);
    }
  }, [selectedProgram]);

  const fetchProgramStatistics = async (programId: number) => {
    try {
      const response = await discountService.getProgramStatistics(programId);
      setProgramStats(response);
    } catch (error) {
      toast.error('Failed to fetch program statistics');
      console.error('Error fetching program statistics:', error);
    }
  };

  const fetchBudgetDetails = async (programId: number) => {
    try {
      const response = await discountService.getProgramBudget(programId);
      setBudgetDetails(response);
    } catch (error) {
      toast.error('Failed to fetch budget details');
      console.error('Error fetching budget details:', error);
    }
  };

  const formatCurrency = (amount: string | number) => {
    const value = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(value);
  };

  const getOverallStats = () => {
    const totalBudgetAllocated = filteredPrograms.reduce(
      (sum, program) => sum + parseFloat(program.budget_allocated || '0'),
      0
    );
    const totalBudgetUsed = filteredPrograms.reduce(
      (sum, program) => sum + parseFloat(program.budget_used || '0'),
      0
    );
    const totalRecipients = filteredPrograms.reduce(
      (sum, program) => sum + program.current_recipients,
      0
    );
    const activePrograms = filteredPrograms.filter(p => p.is_active).length;
    const overBudgetPrograms = filteredPrograms.filter(p => !p.is_within_budget).length;

    return {
      totalBudgetAllocated,
      totalBudgetUsed,
      totalRecipients,
      activePrograms,
      overBudgetPrograms,
      utilizationPercent:
        totalBudgetAllocated > 0 ? (totalBudgetUsed / totalBudgetAllocated) * 100 : 0,
    };
  };

  const overallStats = getOverallStats();

  const getProgramTypeStats = () => {
    const typeStats = programs.reduce(
      (acc, program) => {
        const type = program.program_type;
        if (!acc[type]) {
          acc[type] = {
            count: 0,
            budget_allocated: 0,
            budget_used: 0,
            recipients: 0,
          };
        }
        acc[type].count++;
        acc[type].budget_allocated += parseFloat(program.budget_allocated || '0');
        acc[type].budget_used += parseFloat(program.budget_used || '0');
        acc[type].recipients += program.current_recipients;
        return acc;
      },
      {} as Record<string, any>
    );

    return Object.entries(typeStats).map(([type, stats]) => ({
      type,
      ...stats,
      utilization_percent:
        stats.budget_allocated > 0 ? (stats.budget_used / stats.budget_allocated) * 100 : 0,
    }));
  };

  const programTypeStats = getProgramTypeStats();

  const getStatusColor = (program: DiscountProgram) => {
    if (!program.is_active) return 'text-gray-500';
    if (!program.is_within_budget) return 'text-red-600';
    if (!program.has_recipient_capacity) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getStatusIcon = (program: DiscountProgram) => {
    if (!program.is_active) return <Clock className="h-4 w-4" />;
    if (!program.is_within_budget) return <AlertCircle className="h-4 w-4" />;
    if (!program.has_recipient_capacity) return <Users className="h-4 w-4" />;
    return <CheckCircle className="h-4 w-4" />;
  };

  const exportData = () => {
    const csvData = filteredPrograms.map(program => ({
      'Program Code': program.program_code,
      'Program Name': program.name,
      Type: program.program_type,
      'Budget Allocated': program.budget_allocated,
      'Budget Used': program.budget_used,
      'Budget Remaining': program.budget_remaining,
      'Utilization %': program.budget_utilization_percent,
      Recipients: program.current_recipients,
      'Max Recipients': program.max_recipients || 'Unlimited',
      Status: program.is_active ? 'Active' : 'Inactive',
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `discount-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loadingPrograms) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-blue-600" />
              Discount Analytics Dashboard
            </h1>
            <p className="text-gray-600">
              Monitor budget utilization, recipient statistics, and program performance
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchPrograms()}
            className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <button
            onClick={exportData}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Overall Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Budget</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(overallStats.totalBudgetAllocated)}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <DollarSign className="h-6 w-6 text-blue-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Across {filteredPrograms.length} programs</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Budget Used</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(overallStats.totalBudgetUsed)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <TrendingUp className="h-6 w-6 text-green-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {overallStats.utilizationPercent.toFixed(1)}% utilization
          </p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Recipients</p>
              <p className="text-2xl font-bold text-purple-600">{overallStats.totalRecipients}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Users className="h-6 w-6 text-purple-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Beneficiaries served</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Programs</p>
              <p className="text-2xl font-bold text-indigo-600">{overallStats.activePrograms}</p>
            </div>
            <div className="p-3 bg-indigo-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-indigo-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Currently running</p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Over Budget</p>
              <p className="text-2xl font-bold text-red-600">{overallStats.overBudgetPrograms}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
          </div>
          <p className="text-xs text-gray-500 mt-2">Require attention</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Program Type</label>
            <select
              value={programTypeFilter}
              onChange={e => setProgramTypeFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="scholarship">Scholarship</option>
              <option value="staff_benefit">Staff Benefit</option>
              <option value="discount">Discount</option>
              <option value="waiver">Waiver</option>
              <option value="insurance">Insurance</option>
              <option value="promotion">Promotion</option>
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={dateRange.start}
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={dateRange.end}
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Program Type Statistics */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <PieChart className="h-5 w-5" />
          Statistics by Program Type
        </h3>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Program Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Count
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budget Allocated
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Budget Used
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilization %
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recipients
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {programTypeStats.map(stat => (
                <tr key={stat.type} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm font-medium text-gray-900 capitalize">
                      {stat.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stat.count}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(stat.budget_allocated)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(stat.budget_used)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-1 bg-gray-200 rounded-full h-2 mr-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${Math.min(stat.utilization_percent, 100)}%` }}
                        ></div>
                      </div>
                      <span className="text-sm text-gray-900">
                        {stat.utilization_percent.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {stat.recipients}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Program Performance */}
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Target className="h-5 w-5" />
          Individual Program Performance
        </h3>

        <div className="space-y-4">
          {filteredPrograms.map(program => (
            <div
              key={program.id}
              className="border rounded-lg p-4 hover:bg-gray-50 cursor-pointer"
              onClick={() => setSelectedProgram(selectedProgram === program.id ? null : program.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h4 className="font-medium text-gray-900">{program.name}</h4>
                    <span className="text-xs text-gray-500">{program.program_code}</span>
                    <span className={`flex items-center gap-1 text-xs ${getStatusColor(program)}`}>
                      {getStatusIcon(program)}
                      {program.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Budget:</span>
                      <span className="ml-1 font-medium">
                        {formatCurrency(program.budget_allocated || '0')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Used:</span>
                      <span className="ml-1 font-medium text-green-600">
                        {formatCurrency(program.budget_used || '0')}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Utilization:</span>
                      <span className="ml-1 font-medium">
                        {program.budget_utilization_percent}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Recipients:</span>
                      <span className="ml-1 font-medium">{program.current_recipients}</span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span>Budget Utilization</span>
                      <span>{program.budget_utilization_percent}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          parseFloat(program.budget_utilization_percent) > 100
                            ? 'bg-red-600'
                            : parseFloat(program.budget_utilization_percent) > 80
                              ? 'bg-yellow-600'
                              : 'bg-green-600'
                        }`}
                        style={{
                          width: `${Math.min(parseFloat(program.budget_utilization_percent), 100)}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      navigate(`/discounts/programs/${program.id}`);
                    }}
                    className="p-2 text-blue-600 hover:bg-blue-100 rounded-lg"
                    title="View Details"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Expanded Details */}
              {selectedProgram === program.id && (programStats || budgetDetails) && (
                <div className="mt-4 pt-4 border-t">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {programStats && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <Award className="h-4 w-4" />
                          Application Statistics
                        </h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Applications:</span>
                            <span className="font-medium">{programStats.applications.total}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Approved:</span>
                            <span className="font-medium text-green-600">
                              {programStats.applications.approved}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Pending:</span>
                            <span className="font-medium text-yellow-600">
                              {programStats.applications.pending}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Rejected:</span>
                            <span className="font-medium text-red-600">
                              {programStats.applications.rejected}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {programStats && (
                      <div>
                        <h5 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
                          <Percent className="h-4 w-4" />
                          Discount Statistics
                        </h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Discounts:</span>
                            <span className="font-medium">
                              {programStats.discounts.total_count}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total Amount:</span>
                            <span className="font-medium text-green-600">
                              {formatCurrency(programStats.discounts.total_amount)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Posted:</span>
                            <span className="font-medium">
                              {programStats.discounts.posted_count}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Available Slots:</span>
                            <span className="font-medium">
                              {programStats.available_slots === 999999
                                ? 'Unlimited'
                                : programStats.available_slots}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DiscountAnalyticsDashboard;
