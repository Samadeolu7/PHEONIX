// src/pages/receivables/AdvancedReporting.tsx
import React, { useState, useEffect } from 'react';
import {
  reportsService,
  ReportTemplate,
  ReportExecution,
  ReportCategory,
} from '../../services/reportsService';
import { receivablesService } from '../../services/receivablesService';
import { branchService, BranchOption } from '../../services/branchService';
import { useToast } from '../../hooks/useToast';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Plus,
  Play,
  Download,
  Calendar,
  Filter,
  Eye,
  Edit,
  Trash2,
  Copy,
  Settings,
  Clock,
  FileText,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  Users,
  DollarSign,
  AlertCircle,
  CheckCircle,
  X,
  Search,
  RefreshCw,
  Save,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface CustomReportBuilder {
  name: string;
  description: string;
  reportType:
    | 'aging'
    | 'payment_trends'
    | 'collection_effectiveness'
    | 'customer_analysis'
    | 'custom';
  dateRange: {
    start: string;
    end: string;
    preset: 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';
  };
  filters: {
    branches: number[];
    clients: number[];
    agingBuckets: string[];
    receivableTypes: string[];
    collectors: number[];
  };
  groupBy: 'client' | 'branch' | 'collector' | 'aging_bucket' | 'receivable_type' | 'month';
  metrics: string[];
  chartType: 'table' | 'bar' | 'line' | 'pie' | 'combo';
  schedule?: {
    enabled: boolean;
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly';
    recipients: string[];
    format: 'pdf' | 'csv' | 'excel';
  };
}

interface ScheduledReport {
  id: number;
  name: string;
  description: string;
  schedule: string;
  lastRun?: string;
  nextRun: string;
  status: 'active' | 'paused' | 'failed';
  recipients: string[];
  format: string;
  created_at: string;
}

const AdvancedReporting: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'reports' | 'builder' | 'scheduled' | 'history'>(
    'reports'
  );
  const [reportTemplates, setReportTemplates] = useState<ReportTemplate[]>([]);
  const [reportCategories, setReportCategories] = useState<ReportCategory[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<ReportExecution[]>([]);
  const [scheduledReports, setScheduledReports] = useState<ScheduledReport[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<number | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedReport, setSelectedReport] = useState<ReportTemplate | null>(null);
  const [reportBuilder, setReportBuilder] = useState<CustomReportBuilder>({
    name: '',
    description: '',
    reportType: 'aging',
    dateRange: {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end: new Date().toISOString().split('T')[0],
      preset: 'month',
    },
    filters: {
      branches: [],
      clients: [],
      agingBuckets: [],
      receivableTypes: [],
      collectors: [],
    },
    groupBy: 'client',
    metrics: ['total_amount', 'overdue_amount'],
    chartType: 'table',
  });
  const [filters, setFilters] = useState({
    category: '',
    search: '',
    reportType: '',
  });

  const { success, error: showError } = useToast();

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        loadReportTemplates(),
        loadReportCategories(),
        loadRecentExecutions(),
        loadScheduledReports(),
        loadBranches(),
      ]);
    } catch (error) {
      console.error('Error loading initial data:', error);
      showError('Failed to load reporting data');
    } finally {
      setLoading(false);
    }
  };

  const loadReportTemplates = async () => {
    try {
      const response = await reportsService.getReportTemplates({
        category: 'receivables',
        is_active: true,
        ...filters,
      });
      setReportTemplates(response.results || []);
    } catch (error) {
      console.error('Error loading report templates:', error);
    }
  };

  const loadReportCategories = async () => {
    try {
      const categories = await reportsService.getReportCategories();
      setReportCategories(categories);
    } catch (error) {
      console.error('Error loading report categories:', error);
    }
  };

  const loadRecentExecutions = async () => {
    try {
      const executions = await reportsService.getRecentExecutions(20);
      setRecentExecutions(executions);
    } catch (error) {
      console.error('Error loading recent executions:', error);
    }
  };

  const loadScheduledReports = async () => {
    try {
      // Mock data for scheduled reports - would come from API
      const mockScheduled: ScheduledReport[] = [
        {
          id: 1,
          name: 'Weekly Aging Report',
          description: 'Comprehensive aging analysis sent every Monday',
          schedule: 'Weekly on Monday at 9:00 AM',
          lastRun: '2025-01-20T09:00:00Z',
          nextRun: '2025-01-27T09:00:00Z',
          status: 'active',
          recipients: ['finance@company.com', 'manager@company.com'],
          format: 'pdf',
          created_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 2,
          name: 'Monthly Collection Report',
          description: 'Collection effectiveness and payment trends',
          schedule: 'Monthly on 1st at 8:00 AM',
          nextRun: '2025-02-01T08:00:00Z',
          status: 'active',
          recipients: ['collections@company.com'],
          format: 'excel',
          created_at: '2025-01-01T00:00:00Z',
        },
      ];
      setScheduledReports(mockScheduled);
    } catch (error) {
      console.error('Error loading scheduled reports:', error);
    }
  };

  const loadBranches = async () => {
    try {
      const branchOptions = await branchService.getBranchOptions({ is_active: true });
      setBranches(branchOptions);
    } catch (error) {
      console.error('Error loading branches:', error);
    }
  };

  const executeReport = async (reportId: number, parameters: Record<string, any> = {}) => {
    try {
      setExecuting(reportId);
      const result = await reportsService.executeReport(reportId, parameters);

      if (result.success) {
        success('Report executed successfully');
        await loadRecentExecutions();

        // Show results or download
        if (result.data) {
          setSelectedReport(reportTemplates.find(r => r.id === reportId) || null);
        }
      } else {
        showError('Report execution failed');
      }
    } catch (error) {
      console.error('Error executing report:', error);
      showError('Failed to execute report');
    } finally {
      setExecuting(null);
    }
  };

  const downloadReport = async (executionId: number, format: 'csv' | 'pdf' | 'excel' = 'csv') => {
    try {
      const blob = await reportsService.exportReport(executionId, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${executionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      success(`Report downloaded as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error downloading report:', error);
      showError('Failed to download report');
    }
  };

  const buildCustomReport = async () => {
    try {
      setLoading(true);

      // This would normally create a custom report via API
      // For now, we'll simulate the process
      const customReportData = {
        name: reportBuilder.name,
        description: reportBuilder.description,
        report_type: 'custom',
        parameters: reportBuilder,
        created_at: new Date().toISOString(),
      };

      // Simulate report execution based on builder settings
      let reportData: any[] = [];

      if (reportBuilder.reportType === 'aging') {
        const agingReport = await receivablesService.getAgingReport({
          as_of_date: reportBuilder.dateRange.end,
          format: 'json',
        });
        reportData = agingReport.clients || [];
      }

      success('Custom report built successfully');
      setShowBuilder(false);

      // Reset builder
      setReportBuilder({
        name: '',
        description: '',
        reportType: 'aging',
        dateRange: {
          start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0],
          preset: 'month',
        },
        filters: {
          branches: [],
          clients: [],
          agingBuckets: [],
          receivableTypes: [],
          collectors: [],
        },
        groupBy: 'client',
        metrics: ['total_amount', 'overdue_amount'],
        chartType: 'table',
      });
    } catch (error) {
      console.error('Error building custom report:', error);
      showError('Failed to build custom report');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(numAmount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'running':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'paused':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getReportTypeIcon = (type: string) => {
    switch (type) {
      case 'aging':
        return <BarChart3 className="w-5 h-5 text-blue-500" />;
      case 'payment_trends':
        return <TrendingUp className="w-5 h-5 text-green-500" />;
      case 'collection_effectiveness':
        return <Users className="w-5 h-5 text-purple-500" />;
      case 'customer_analysis':
        return <PieChartIcon className="w-5 h-5 text-orange-500" />;
      default:
        return <FileText className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Advanced Reporting</h1>
            <p className="text-gray-600">
              Comprehensive reporting and analytics for receivables management
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowBuilder(true)}
              className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Build Custom Report
            </button>
            <button
              onClick={loadInitialData}
              disabled={loading}
              className="flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { key: 'reports', label: 'Report Templates', icon: FileText },
            { key: 'builder', label: 'Custom Builder', icon: Settings },
            { key: 'scheduled', label: 'Scheduled Reports', icon: Clock },
            { key: 'history', label: 'Execution History', icon: BarChart3 },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key as any)}
              className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      {/* Report Templates Tab */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Available Reports</h3>
              <div className="flex items-center space-x-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-500">Filter Options</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Reports
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name or description..."
                    value={filters.search}
                    onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    className="w-full pl-10 border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={filters.category}
                  onChange={e => setFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Categories</option>
                  {reportCategories.map(category => (
                    <option key={category.id} value={category.code}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <select
                  value={filters.reportType}
                  onChange={e => setFilters(prev => ({ ...prev, reportType: e.target.value }))}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="financial">Financial</option>
                  <option value="operational">Operational</option>
                  <option value="analytical">Analytical</option>
                  <option value="compliance">Compliance</option>
                </select>
              </div>
            </div>
          </div>

          {/* Report Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {reportTemplates.map(template => (
              <div
                key={template.id}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      {getReportTypeIcon(template.report_type)}
                      <div className="ml-3">
                        <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                        <p className="text-sm text-gray-500">{template.category_name}</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        template.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {template.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-4">{template.description}</p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                    <span>Used {template.usage_count} times</span>
                    {template.last_run_at && (
                      <span>Last run: {formatDate(template.last_run_at)}</span>
                    )}
                  </div>

                  <div className="flex space-x-2">
                    <button
                      onClick={() => executeReport(template.id)}
                      disabled={executing === template.id}
                      className="flex-1 flex items-center justify-center px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {executing === template.id ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-1" />
                          Run
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setSelectedReport(template)}
                      className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {reportTemplates.length === 0 && !loading && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                <FileText className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No reports found</h3>
                <p className="text-gray-600">No report templates match your current filters.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Builder Tab */}
      {activeTab === 'builder' && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Build Custom Report</h3>
              <p className="text-sm text-gray-600 mb-6">
                Create a custom report with your specific requirements and filters.
              </p>
            </div>

            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Name</label>
                <input
                  type="text"
                  value={reportBuilder.name}
                  onChange={e => setReportBuilder(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter report name..."
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
                <select
                  value={reportBuilder.reportType}
                  onChange={e =>
                    setReportBuilder(prev => ({ ...prev, reportType: e.target.value as any }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="aging">Aging Analysis</option>
                  <option value="payment_trends">Payment Trends</option>
                  <option value="collection_effectiveness">Collection Effectiveness</option>
                  <option value="customer_analysis">Customer Analysis</option>
                  <option value="custom">Custom Report</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={reportBuilder.description}
                onChange={e => setReportBuilder(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Describe what this report will show..."
                rows={3}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">Date Range</label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Preset</label>
                  <select
                    value={reportBuilder.dateRange.preset}
                    onChange={e => {
                      const preset = e.target.value as any;
                      let start = reportBuilder.dateRange.start;
                      let end = reportBuilder.dateRange.end;

                      const now = new Date();
                      if (preset === 'today') {
                        start = end = now.toISOString().split('T')[0];
                      } else if (preset === 'week') {
                        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
                          .toISOString()
                          .split('T')[0];
                        end = now.toISOString().split('T')[0];
                      } else if (preset === 'month') {
                        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
                          .toISOString()
                          .split('T')[0];
                        end = now.toISOString().split('T')[0];
                      }

                      setReportBuilder(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, preset, start, end },
                      }));
                    }}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                    <option value="quarter">Last Quarter</option>
                    <option value="year">Last Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={reportBuilder.dateRange.start}
                    onChange={e =>
                      setReportBuilder(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, start: e.target.value, preset: 'custom' },
                      }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">End Date</label>
                  <input
                    type="date"
                    value={reportBuilder.dateRange.end}
                    onChange={e =>
                      setReportBuilder(prev => ({
                        ...prev,
                        dateRange: { ...prev.dateRange, end: e.target.value, preset: 'custom' },
                      }))
                    }
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Grouping and Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Group By</label>
                <select
                  value={reportBuilder.groupBy}
                  onChange={e =>
                    setReportBuilder(prev => ({ ...prev, groupBy: e.target.value as any }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="client">Client</option>
                  <option value="branch">Branch</option>
                  <option value="collector">Collector</option>
                  <option value="aging_bucket">Aging Bucket</option>
                  <option value="receivable_type">Receivable Type</option>
                  <option value="month">Month</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Chart Type</label>
                <select
                  value={reportBuilder.chartType}
                  onChange={e =>
                    setReportBuilder(prev => ({ ...prev, chartType: e.target.value as any }))
                  }
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="table">Table</option>
                  <option value="bar">Bar Chart</option>
                  <option value="line">Line Chart</option>
                  <option value="pie">Pie Chart</option>
                  <option value="combo">Combo Chart</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                onClick={() =>
                  setReportBuilder({
                    name: '',
                    description: '',
                    reportType: 'aging',
                    dateRange: {
                      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        .toISOString()
                        .split('T')[0],
                      end: new Date().toISOString().split('T')[0],
                      preset: 'month',
                    },
                    filters: {
                      branches: [],
                      clients: [],
                      agingBuckets: [],
                      receivableTypes: [],
                      collectors: [],
                    },
                    groupBy: 'client',
                    metrics: ['total_amount', 'overdue_amount'],
                    chartType: 'table',
                  })
                }
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Reset
              </button>
              <button
                onClick={buildCustomReport}
                disabled={!reportBuilder.name || loading}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                Build Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scheduled Reports Tab */}
      {activeTab === 'scheduled' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900">Scheduled Reports</h3>
                <button className="flex items-center px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Schedule Report
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Report
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Schedule
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Last Run
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Next Run
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Recipients
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {scheduledReports.map(report => (
                    <tr key={report.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{report.name}</div>
                          <div className="text-sm text-gray-500">{report.description}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {report.schedule}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.lastRun ? formatDate(report.lastRun) : 'Never'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(report.nextRun)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          {getStatusIcon(report.status)}
                          <span
                            className={`ml-2 text-sm font-medium ${
                              report.status === 'active'
                                ? 'text-green-600'
                                : report.status === 'failed'
                                  ? 'text-red-600'
                                  : 'text-yellow-600'
                            }`}
                          >
                            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {report.recipients.length} recipient
                        {report.recipients.length !== 1 ? 's' : ''}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <button className="text-blue-600 hover:text-blue-900">
                            <Edit className="w-4 h-4" />
                          </button>
                          <button className="text-green-600 hover:text-green-900">
                            <Play className="w-4 h-4" />
                          </button>
                          <button className="text-red-600 hover:text-red-900">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {scheduledReports.length === 0 && (
              <div className="text-center py-12">
                <div className="text-gray-500">
                  <Clock className="w-12 h-12 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No scheduled reports</h3>
                  <p className="text-gray-600">
                    Set up automated reports to be delivered on schedule.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Execution History Tab */}
      {activeTab === 'history' && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Recent Executions</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Executed By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Executed At
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Rows
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {recentExecutions.map(execution => (
                  <tr key={execution.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {execution.template_name || `Report #${execution.template}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {execution.executed_by_name || `User #${execution.executed_by}`}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(execution.executed_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getStatusIcon(execution.status)}
                        <span
                          className={`ml-2 text-sm font-medium ${
                            execution.status === 'completed'
                              ? 'text-green-600'
                              : execution.status === 'failed'
                                ? 'text-red-600'
                                : execution.status === 'running'
                                  ? 'text-blue-600'
                                  : 'text-gray-600'
                          }`}
                        >
                          {execution.status.charAt(0).toUpperCase() + execution.status.slice(1)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {execution.row_count || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {execution.execution_time_ms ? `${execution.execution_time_ms}ms` : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex space-x-2">
                        {execution.status === 'completed' && (
                          <>
                            <button
                              onClick={() => downloadReport(execution.id, 'csv')}
                              className="text-blue-600 hover:text-blue-900"
                              title="Download CSV"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => downloadReport(execution.id, 'pdf')}
                              className="text-red-600 hover:text-red-900"
                              title="Download PDF"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        <button className="text-gray-600 hover:text-gray-900">
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {recentExecutions.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-500">
                <BarChart3 className="w-12 h-12 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No execution history</h3>
                <p className="text-gray-600">Report execution history will appear here.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Custom Report Builder Modal */}
      {showBuilder && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Custom Report Builder</h3>
              <button
                onClick={() => setShowBuilder(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Builder content would go here - simplified for now */}
            <div className="space-y-6">
              <p className="text-gray-600">
                Advanced report builder interface would be implemented here with drag-and-drop
                fields, advanced filtering options, and real-time preview capabilities.
              </p>

              <div className="flex justify-end space-x-3">
                <button
                  onClick={() => setShowBuilder(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    buildCustomReport();
                    setShowBuilder(false);
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700"
                >
                  Build Report
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
};

export default AdvancedReporting;
