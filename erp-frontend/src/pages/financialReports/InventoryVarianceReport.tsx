/**
 * INVENTORY VARIANCE REPORT PAGE
 *
 * Comprehensive variance analysis with:
 * - Multi-dimensional reporting (location, category, reason)
 * - Interactive charts and visualizations
 * - Drill-down capabilities
 * - Export functionality
 */

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  MapPin,
  Tag,
  AlertCircle,
  FileText,
  Download,
  Filter,
  BarChart3,
  PieChart,
} from 'lucide-react';
import physicalCountService from '../../services/physicalCountService';
import type {
  VarianceSummaryReport,
  VarianceReportFilters,
  VarianceLocationSummary,
  VarianceCategorySummary,
  VarianceReasonSummary,
} from '../../types/physicalCount';
import { formatCurrency, formatDate } from '../../utils/formatters';

// ================================================================
// CHART COLORS
// ================================================================

const CHART_COLORS = [
  '#3B82F6', // Blue
  '#EF4444', // Red
  '#10B981', // Green
  '#F59E0B', // Amber
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
];

// ================================================================
// MAIN COMPONENT
// ================================================================

const InventoryVarianceReport: React.FC = () => {
  // State
  const [report, setReport] = useState<VarianceSummaryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [filters, setFilters] = useState<VarianceReportFilters>({
    date_from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Last 90 days
    date_to: new Date().toISOString().split('T')[0],
  });

  // View state
  const [activeView, setActiveView] = useState<'summary' | 'location' | 'category' | 'reason'>(
    'summary'
  );

  // ================================================================
  // DATA LOADING
  // ================================================================

  useEffect(() => {
    loadReport();
  }, [filters]);

  const loadReport = async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await physicalCountService.getVarianceSummary(filters);
      setReport(data);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load variance report');
      console.error('Error loading report:', err);
    } finally {
      setLoading(false);
    }
  };

  // ================================================================
  // FILTER HANDLERS
  // ================================================================

  const handleFilterChange = (key: keyof VarianceReportFilters, value: any) => {
    setFilters({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    setFilters({
      date_from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      date_to: new Date().toISOString().split('T')[0],
    });
  };

  // ================================================================
  // RENDER HELPERS
  // ================================================================

  const renderSummaryCard = (
    title: string,
    value: string | number,
    icon: React.ReactNode,
    color: string
  ) => {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-600">{title}</p>
            <p className={`text-2xl font-bold mt-2 ${color}`}>{value}</p>
          </div>
          <div
            className={`p-3 rounded-lg ${color.replace('text-', 'bg-').replace('-600', '-100')}`}
          >
            {icon}
          </div>
        </div>
      </div>
    );
  };

  const renderLocationTable = (locations: VarianceLocationSummary[]) => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Counts
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lines
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Variance
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variance Value
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {locations.map((loc, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{loc.location_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-gray-900">{loc.count_count}</td>
                <td className="px-6 py-4 text-right text-gray-900">{loc.line_count}</td>
                <td className="px-6 py-4 text-right">
                  <span
                    className={
                      loc.total_variance >= 0
                        ? 'text-green-600 font-medium'
                        : 'text-red-600 font-medium'
                    }
                  >
                    {loc.total_variance >= 0 ? '+' : ''}
                    {loc.total_variance}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium">
                  {formatCurrency(loc.total_variance_value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderCategoryTable = (categories: VarianceCategorySummary[]) => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lines
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Variance
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variance Value
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((cat, index) => {
              const totalValue = report?.summary.total_variance_value || 1;
              const percentage = (cat.total_variance_value / totalValue) * 100;

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{cat.category_name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900">{cat.line_count}</td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={
                        cat.total_variance >= 0
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {cat.total_variance >= 0 ? '+' : ''}
                      {cat.total_variance}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {formatCurrency(cat.total_variance_value)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">{percentage.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderReasonTable = (reasons: VarianceReasonSummary[]) => {
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Reason
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lines
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total Variance
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Variance Value
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                % of Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {reasons.map((reason, index) => {
              const totalValue = report?.summary.total_variance_value || 1;
              const percentage = (reason.total_variance_value / totalValue) * 100;

              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                      <span className="font-medium text-gray-900">{reason.reason_display}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900">{reason.line_count}</td>
                  <td className="px-6 py-4 text-right">
                    <span
                      className={
                        reason.total_variance >= 0
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }
                    >
                      {reason.total_variance >= 0 ? '+' : ''}
                      {reason.total_variance}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {formatCurrency(reason.total_variance_value)}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-600">{percentage.toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ================================================================
  // RENDER
  // ================================================================

  if (loading && !report) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading variance report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Inventory Variance Report</h1>
          <p className="mt-2 text-gray-600">
            Comprehensive variance analysis across all physical counts
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Filter className="w-5 h-5" />
            Filters
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-5 h-5" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
              <input
                type="date"
                value={filters.date_from || ''}
                onChange={e => handleFilterChange('date_from', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
              <input
                type="date"
                value={filters.date_to || ''}
                onChange={e => handleFilterChange('date_to', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variance Threshold
              </label>
              <input
                type="number"
                value={filters.variance_threshold || ''}
                onChange={e => handleFilterChange('variance_threshold', parseFloat(e.target.value))}
                placeholder="Min variance value"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <p>{error}</p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            {renderSummaryCard(
              'Total Counts',
              report.summary.total_counts.toString(),
              <FileText className="w-6 h-6 text-blue-600" />,
              'text-blue-600'
            )}
            {renderSummaryCard(
              'Total Lines',
              report.summary.total_lines.toString(),
              <BarChart3 className="w-6 h-6 text-purple-600" />,
              'text-purple-600'
            )}
            {renderSummaryCard(
              'Total Variance Value',
              formatCurrency(report.summary.total_variance_value),
              <TrendingDown className="w-6 h-6 text-red-600" />,
              'text-red-600'
            )}
            {renderSummaryCard(
              'Avg per Count',
              formatCurrency(report.summary.avg_variance_per_count),
              <PieChart className="w-6 h-6 text-green-600" />,
              'text-green-600'
            )}
          </div>

          {/* View Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px">
                <button
                  onClick={() => setActiveView('summary')}
                  className={`px-6 py-3 border-b-2 font-medium transition-colors ${
                    activeView === 'summary'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setActiveView('location')}
                  className={`px-6 py-3 border-b-2 font-medium transition-colors ${
                    activeView === 'location'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  By Location
                </button>
                <button
                  onClick={() => setActiveView('category')}
                  className={`px-6 py-3 border-b-2 font-medium transition-colors ${
                    activeView === 'category'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  By Category
                </button>
                <button
                  onClick={() => setActiveView('reason')}
                  className={`px-6 py-3 border-b-2 font-medium transition-colors ${
                    activeView === 'reason'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  By Reason
                </button>
              </nav>
            </div>

            <div className="p-6">
              {activeView === 'summary' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Report Summary</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Total Physical Counts</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {report.summary.total_counts}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Total Count Lines</p>
                        <p className="text-2xl font-bold text-gray-900 mt-1">
                          {report.summary.total_lines}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Total Variance Value</p>
                        <p className="text-2xl font-bold text-red-600 mt-1">
                          {formatCurrency(report.summary.total_variance_value)}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-600">Average Variance per Count</p>
                        <p className="text-2xl font-bold text-blue-600 mt-1">
                          {formatCurrency(report.summary.avg_variance_per_count)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeView === 'location' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Variance by Location</h3>
                  {renderLocationTable(report.by_location)}
                </div>
              )}

              {activeView === 'category' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Variance by Category</h3>
                  {renderCategoryTable(report.by_category)}
                </div>
              )}

              {activeView === 'reason' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Variance by Reason</h3>
                  {renderReasonTable(report.by_reason)}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default InventoryVarianceReport;
