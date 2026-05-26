import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Download,
  Eye,
  AlertCircle,
  Filter,
  Calendar,
  Settings,
  FileText,
  Zap,
} from 'lucide-react';
import {
  dataConsistencyService,
  ConsistencyReport,
  ConsistencyIssue,
  ReconciliationAction,
} from '../../services/dataConsistencyService';

interface ReconciliationSummary {
  period: { start_date: string; end_date: string };
  total_invoices: number;
  total_receivables: number;
  synchronized_records: number;
  pending_sync: number;
  sync_percentage: number;
  last_sync_run: string;
  issues_resolved_today: number;
  critical_issues_remaining: number;
  recommendations: string[];
}

export const DataConsistencyChecker: React.FC = () => {
  const [report, setReport] = useState<ConsistencyReport | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedIssue, setSelectedIssue] = useState<ConsistencyIssue | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showSummary, setShowSummary] = useState(true);
  const [reconciliationSummary, setReconciliationSummary] = useState<ReconciliationSummary | null>(
    null
  );
  const [filters, setFilters] = useState({
    severity_filter: '' as '' | 'critical' | 'warning' | 'info',
    date_range: {
      start_date: '',
      end_date: '',
    },
  });
  const [selectedIssues, setSelectedIssues] = useState<Set<string>>(new Set());
  const [isResolvingBulk, setIsResolvingBulk] = useState(false);

  // Load reconciliation summary on component mount
  useEffect(() => {
    const loadReconciliationSummary = async () => {
      try {
        const summary = await dataConsistencyService.getReconciliationSummary();
        setReconciliationSummary(summary);
      } catch (error) {
        console.error('Error loading reconciliation summary:', error);
      }
    };

    loadReconciliationSummary();
  }, []);

  const runConsistencyCheck = async () => {
    setIsChecking(true);
    try {
      const options = {
        severity_filter: filters.severity_filter || undefined,
        date_range:
          filters.date_range.start_date && filters.date_range.end_date
            ? filters.date_range
            : undefined,
      };
      const report = await dataConsistencyService.runConsistencyCheck(options);
      setReport(report);
      setSelectedIssues(new Set()); // Clear selections after new check
    } catch (error) {
      console.error('Error running consistency check:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleBulkResolve = async () => {
    if (selectedIssues.size === 0 || !report) return;

    setIsResolvingBulk(true);
    try {
      const actions: ReconciliationAction[] = Array.from(selectedIssues).map(issueId => ({
        issue_id: issueId,
        action_type: 'auto_fix',
        notes: 'Bulk resolved via data consistency checker',
      }));

      await dataConsistencyService.resolveIssues(actions);

      // Refresh the report after resolving
      await runConsistencyCheck();
    } catch (error) {
      console.error('Error resolving bulk issues:', error);
    } finally {
      setIsResolvingBulk(false);
    }
  };

  const handleSelectIssue = (issueId: string, selected: boolean) => {
    const newSelected = new Set(selectedIssues);
    if (selected) {
      newSelected.add(issueId);
    } else {
      newSelected.delete(issueId);
    }
    setSelectedIssues(newSelected);
  };

  const handleSelectAll = (selected: boolean) => {
    if (selected && report) {
      setSelectedIssues(new Set(report.issues.map(issue => issue.id)));
    } else {
      setSelectedIssues(new Set());
    }
  };

  const handleExportReport = async () => {
    if (!report) return;

    try {
      const blob = await dataConsistencyService.exportReport(report.id, 'csv');
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `consistency-report-${report.id}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting report:', error);
    }
  };

  const handleResolveIssue = async (issue: ConsistencyIssue) => {
    try {
      const actions = [
        {
          issue_id: issue.id,
          action_type: 'auto_fix' as const,
          notes: 'Resolved via data consistency checker',
        },
      ];

      await dataConsistencyService.resolveIssues(actions);

      // Refresh the report after resolving
      await runConsistencyCheck();
    } catch (error) {
      console.error('Error resolving issue:', error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Data Consistency Checker</h2>
          <p className="text-gray-600">
            Monitor and resolve invoice-receivable synchronization issues
          </p>
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <Filter className="w-4 h-4 mr-2" />
            Filters
          </button>
          <button
            onClick={runConsistencyCheck}
            disabled={isChecking}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            {isChecking ? 'Checking...' : 'Run Check'}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-lg shadow border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filter Options</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Severity Level</label>
              <select
                value={filters.severity_filter}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    severity_filter: e.target.value as '' | 'critical' | 'warning' | 'info',
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Severities</option>
                <option value="critical">Critical Only</option>
                <option value="warning">Warning Only</option>
                <option value="info">Info Only</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                value={filters.date_range.start_date}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    date_range: { ...prev.date_range, start_date: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                value={filters.date_range.end_date}
                onChange={e =>
                  setFilters(prev => ({
                    ...prev,
                    date_range: { ...prev.date_range, end_date: e.target.value },
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-3">
            <button
              onClick={() =>
                setFilters({
                  severity_filter: '',
                  date_range: { start_date: '', end_date: '' },
                })
              }
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Clear Filters
            </button>
            <button
              onClick={runConsistencyCheck}
              disabled={isChecking}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Apply Filters
            </button>
          </div>
        </div>
      )}

      {/* Reconciliation Summary */}
      {showSummary && reconciliationSummary && (
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="text-lg font-semibold text-gray-900">Reconciliation Summary</h3>
            <button
              onClick={() => setShowSummary(!showSummary)}
              className="text-gray-400 hover:text-gray-600"
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <div className="text-center">
                <div className="text-3xl font-bold text-blue-600 mb-1">
                  {reconciliationSummary.sync_percentage.toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Synchronization Rate</div>
                <div className="mt-2 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: `${reconciliationSummary.sync_percentage}%` }}
                  ></div>
                </div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-green-600 mb-1">
                  {reconciliationSummary.synchronized_records}
                </div>
                <div className="text-sm text-gray-600">Synchronized Records</div>
                <div className="text-xs text-gray-500 mt-1">
                  of {reconciliationSummary.total_invoices} total
                </div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-yellow-600 mb-1">
                  {reconciliationSummary.pending_sync}
                </div>
                <div className="text-sm text-gray-600">Pending Sync</div>
                <div className="text-xs text-gray-500 mt-1">Require attention</div>
              </div>

              <div className="text-center">
                <div className="text-3xl font-bold text-red-600 mb-1">
                  {reconciliationSummary.critical_issues_remaining}
                </div>
                <div className="text-sm text-gray-600">Critical Issues</div>
                <div className="text-xs text-gray-500 mt-1">Need immediate action</div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="font-medium text-gray-900">Recent Activity</h4>
                <span className="text-sm text-gray-500">
                  Last sync: {new Date(reconciliationSummary.last_sync_run).toLocaleString()}
                </span>
              </div>
              <div className="text-sm text-gray-600 mb-4">
                <span className="text-green-600 font-medium">
                  {reconciliationSummary.issues_resolved_today}
                </span>{' '}
                issues resolved today
              </div>

              {reconciliationSummary.recommendations.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Recommendations</h4>
                  <ul className="space-y-1">
                    {reconciliationSummary.recommendations.map((recommendation, index) => (
                      <li key={index} className="text-sm text-gray-600 flex items-start">
                        <span className="text-blue-500 mr-2">•</span>
                        {recommendation}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status Overview */}
      {report && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Eye className="w-6 h-6 text-blue-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Invoices</p>
                <p className="text-2xl font-bold text-gray-900">{report.total_invoices}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Receivables</p>
                <p className="text-2xl font-bold text-gray-900">{report.total_receivables}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center">
              <div
                className={`p-2 rounded-lg ${
                  report.critical_issues > 0
                    ? 'bg-red-100'
                    : report.warning_issues > 0
                      ? 'bg-yellow-100'
                      : 'bg-green-100'
                }`}
              >
                {report.critical_issues > 0 ? (
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                ) : report.warning_issues > 0 ? (
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                ) : (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                )}
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Issues Found</p>
                <p className="text-2xl font-bold text-gray-900">{report.issues_found}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow border">
            <div className="flex items-center">
              <div className="p-2 bg-purple-100 rounded-lg">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Sync Status</p>
                <p
                  className={`text-sm font-semibold ${
                    report.summary.sync_status === 'healthy'
                      ? 'text-green-600'
                      : report.summary.sync_status === 'issues_found'
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {report.summary.sync_status.replace('_', ' ').toUpperCase()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issues Summary */}
      {report && report.issues_found > 0 && (
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Issues Summary</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{report.critical_issues}</div>
                <div className="text-sm text-red-600">Critical Issues</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{report.warning_issues}</div>
                <div className="text-sm text-yellow-600">Warning Issues</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{report.info_issues}</div>
                <div className="text-sm text-blue-600">Info Issues</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Issues List */}
      {report && report.issues.length > 0 && (
        <div className="bg-white rounded-lg shadow border">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Detected Issues</h3>
              <div className="flex space-x-2">
                {selectedIssues.size > 0 && (
                  <button
                    onClick={handleBulkResolve}
                    disabled={isResolvingBulk}
                    className="flex items-center px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
                  >
                    <Zap className={`w-4 h-4 mr-1 ${isResolvingBulk ? 'animate-spin' : ''}`} />
                    {isResolvingBulk ? 'Resolving...' : `Resolve ${selectedIssues.size}`}
                  </button>
                )}
                <button
                  onClick={handleExportReport}
                  className="flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Export
                </button>
              </div>
            </div>

            {/* Bulk Selection Controls */}
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={selectedIssues.size === report.issues.length && report.issues.length > 0}
                  onChange={e => handleSelectAll(e.target.checked)}
                  className="mr-2 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Select All
              </label>
              {selectedIssues.size > 0 && (
                <span className="text-blue-600 font-medium">
                  {selectedIssues.size} of {report.issues.length} selected
                </span>
              )}
            </div>
          </div>

          <div className="divide-y divide-gray-200">
            {report.issues.map(issue => (
              <div key={issue.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedIssues.has(issue.id)}
                      onChange={e => handleSelectIssue(issue.id, e.target.checked)}
                      className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-2">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            issue.severity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : issue.severity === 'warning'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {issue.severity.toUpperCase()}
                        </span>
                        <span className="text-sm text-gray-500">
                          {issue.type.replace('_', ' ').toUpperCase()}
                        </span>
                        {issue.invoice_number && (
                          <span className="text-sm font-medium text-gray-900">
                            {issue.invoice_number}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-900 mb-2">{issue.description}</p>
                      {(issue.expected_value || issue.actual_value) && (
                        <div className="text-sm text-gray-600 mb-2">
                          {issue.expected_value && (
                            <span>
                              Expected: <span className="font-medium">₦{issue.expected_value}</span>
                            </span>
                          )}
                          {issue.expected_value && issue.actual_value && (
                            <span className="mx-2">|</span>
                          )}
                          {issue.actual_value && (
                            <span>
                              Actual: <span className="font-medium">₦{issue.actual_value}</span>
                            </span>
                          )}
                        </div>
                      )}
                      <p className="text-sm text-blue-600">
                        <strong>Suggested Action:</strong> {issue.suggested_action}
                      </p>
                    </div>
                  </div>
                  <div className="flex space-x-2 ml-4">
                    <button
                      onClick={() => {
                        setSelectedIssue(issue);
                        setShowDetails(true);
                      }}
                      className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                    >
                      View Details
                    </button>
                    <button
                      onClick={() => handleResolveIssue(issue)}
                      className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Issues State */}
      {report && report.issues_found === 0 && (
        <div className="bg-white rounded-lg shadow border p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">All Systems Synchronized</h3>
          <p className="text-gray-600">
            No data consistency issues found. Invoice and receivable records are properly
            synchronized.
          </p>
          <div className="mt-4 text-sm text-gray-500">
            Last checked: {new Date(report.generated_at).toLocaleString()}
          </div>
        </div>
      )}

      {/* No Report State */}
      {!report && !isChecking && (
        <div className="bg-white rounded-lg shadow border p-8 text-center">
          <RefreshCw className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Run Data Consistency Check</h3>
          <p className="text-gray-600 mb-4">
            Check for synchronization issues between invoices and receivables records.
          </p>
          <button
            onClick={runConsistencyCheck}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Start Check
          </button>
        </div>
      )}

      {/* Issue Details Modal */}
      {showDetails && selectedIssue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-900">Issue Details</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Issue Type</label>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      selectedIssue.severity === 'critical'
                        ? 'bg-red-100 text-red-800'
                        : selectedIssue.severity === 'warning'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {selectedIssue.type.replace('_', ' ').toUpperCase()} -{' '}
                    {selectedIssue.severity.toUpperCase()}
                  </span>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description
                  </label>
                  <p className="text-gray-900">{selectedIssue.description}</p>
                </div>

                {selectedIssue.invoice_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice ID
                    </label>
                    <p className="text-gray-900">{selectedIssue.invoice_id}</p>
                  </div>
                )}

                {selectedIssue.invoice_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Invoice Number
                    </label>
                    <p className="text-gray-900">{selectedIssue.invoice_number}</p>
                  </div>
                )}

                {selectedIssue.receivable_id && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Receivable ID
                    </label>
                    <p className="text-gray-900">{selectedIssue.receivable_id}</p>
                  </div>
                )}

                {selectedIssue.reference_number && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reference Number
                    </label>
                    <p className="text-gray-900">{selectedIssue.reference_number}</p>
                  </div>
                )}

                {(selectedIssue.expected_value || selectedIssue.actual_value) && (
                  <div className="grid grid-cols-2 gap-4">
                    {selectedIssue.expected_value && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Expected Value
                        </label>
                        <p className="text-gray-900 font-medium">₦{selectedIssue.expected_value}</p>
                      </div>
                    )}
                    {selectedIssue.actual_value && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Actual Value
                        </label>
                        <p className="text-gray-900 font-medium">₦{selectedIssue.actual_value}</p>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suggested Action
                  </label>
                  <p className="text-blue-600">{selectedIssue.suggested_action}</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => setShowDetails(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  Close
                </button>
                <button
                  onClick={async () => {
                    await handleResolveIssue(selectedIssue);
                    setShowDetails(false);
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Resolve Issue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
