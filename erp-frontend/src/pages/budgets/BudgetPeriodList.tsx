// src/pages/budgets/BudgetPeriodList.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  Search,
  Plus,
  Eye,
  Edit,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
} from 'lucide-react';
import { budgetService } from '../../services/budgetService';
import { BudgetPeriodListItem, BudgetStatus } from '../../types/budgets';
import { useToast } from '../../hooks/useToast';

const BudgetPeriodList: React.FC = () => {
  const navigate = useNavigate();
  const [budgetPeriods, setBudgetPeriods] = useState<BudgetPeriodListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BudgetStatus | ''>('');
  const { success, error: showError } = useToast();

  useEffect(() => {
    fetchBudgetPeriods();
  }, [statusFilter]);

  const fetchBudgetPeriods = async () => {
    try {
      setLoading(true);
      const params: any = { ordering: '-start_date' };
      if (statusFilter) params.status = statusFilter;
      if (searchTerm) params.search = searchTerm;

      const data = await budgetService.getBudgetPeriods(params);
      setBudgetPeriods(data);
    } catch (error: any) {
      console.error('Failed to fetch budget periods:', error);
      showError('Failed to load budget periods');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchBudgetPeriods();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const getStatusBadge = (status: BudgetStatus) => {
    const statusConfig = {
      draft: {
        icon: FileText,
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        label: 'Draft',
      },
      approved: {
        icon: CheckCircle,
        color: 'text-blue-600',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'Approved',
      },
      active: {
        icon: TrendingUp,
        color: 'text-green-600',
        bg: 'bg-green-50',
        border: 'border-green-200',
        label: 'Active',
      },
      closed: {
        icon: XCircle,
        color: 'text-red-600',
        bg: 'bg-red-50',
        border: 'border-red-200',
        label: 'Closed',
      },
    };

    const config = statusConfig[status] || statusConfig.draft;
    const StatusIcon = config.icon;

    return (
      <span
        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.bg} ${config.color} ${config.border}`}
      >
        <StatusIcon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const getVarianceIndicator = (variancePercent: number) => {
    if (variancePercent > 0) {
      return (
        <div className="flex items-center text-green-600">
          <TrendingDown className="w-4 h-4 mr-1" />
          <span className="text-sm font-medium">{variancePercent.toFixed(1)}% under</span>
        </div>
      );
    } else if (variancePercent < 0) {
      return (
        <div className="flex items-center text-red-600">
          <TrendingUp className="w-4 h-4 mr-1" />
          <span className="text-sm font-medium">{Math.abs(variancePercent).toFixed(1)}% over</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center text-gray-600">
          <CheckCircle className="w-4 h-4 mr-1" />
          <span className="text-sm font-medium">On track</span>
        </div>
      );
    }
  };

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(parseFloat(amount));
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getUtilizationColor = (percent: number) => {
    if (percent > 100) return 'bg-red-500';
    if (percent > 80) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Budget Periods</h1>
            <p className="text-gray-600 mt-1">Manage fiscal budgets and track spending</p>
          </div>
          <button
            onClick={() => navigate('/budgets/periods/new')}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Budget Period
          </button>
        </div>

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search budget periods..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  onKeyPress={handleKeyPress}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as BudgetStatus | '')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">All Statuses</option>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="active">Active</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Budget Periods List */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : budgetPeriods.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Calendar className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Budget Periods Found</h3>
          <p className="text-gray-600 mb-6">Get started by creating your first budget period</p>
          <button
            onClick={() => navigate('/budgets/periods/new')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Create Budget Period
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {budgetPeriods.map(period => (
            <div
              key={period.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* Period Info */}
                <div className="lg:col-span-4">
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">{period.name}</h3>
                    {getStatusBadge(period.status)}
                  </div>
                  <div className="flex items-center text-sm text-gray-600 mb-1">
                    <Calendar className="w-4 h-4 mr-2" />
                    {formatDate(period.start_date)} - {formatDate(period.end_date)}
                  </div>
                  <div className="text-sm text-gray-600">{period.line_count} budget lines</div>
                </div>

                {/* Budget Summary */}
                <div className="lg:col-span-5">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Budget</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(period.total_budget)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Actual</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(period.total_actual)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase mb-1">Variance</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {formatCurrency(period.total_variance)}
                      </p>
                    </div>
                  </div>

                  {/* Utilization Bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Utilization</span>
                      <span>{period.utilization_percent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${getUtilizationColor(period.utilization_percent)}`}
                        style={{ width: `${Math.min(period.utilization_percent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Variance Indicator & Actions */}
                <div className="lg:col-span-3 flex flex-col justify-between">
                  <div className="mb-3">{getVarianceIndicator(period.variance_percent)}</div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => navigate(`/budgets/periods/${period.id}`)}
                      className="flex-1 flex items-center justify-center px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      View
                    </button>
                    {period.status === 'draft' && (
                      <button
                        onClick={() => navigate(`/budgets/periods/${period.id}/edit`)}
                        className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        Edit
                      </button>
                    )}
                    {['approved', 'active', 'closed'].includes(period.status) && (
                      <button
                        onClick={() => navigate(`/budgets/periods/${period.id}/variance`)}
                        className="flex-1 flex items-center justify-center px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Report
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BudgetPeriodList;
