// Assignment History Panel - Display assignment history and audit trail
import React, { useState, useEffect } from 'react';
import {
  History,
  Calendar,
  User,
  Activity,
  CheckCircle,
  XCircle,
  Edit,
  RotateCcw,
  Filter,
  Search,
  Download,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { UserRole } from '../../types/roles';
import { DashboardAssignmentHistory } from '../../types/dashboardAssignment';
import { dashboardAssignmentService } from '../../services/dashboardAssignmentService';

interface AssignmentHistoryPanelProps {
  history: DashboardAssignmentHistory[];
  templateId?: string;
  roleId?: UserRole;
  className?: string;
}

export const AssignmentHistoryPanel: React.FC<AssignmentHistoryPanelProps> = ({
  history: initialHistory,
  templateId,
  roleId,
  className = '',
}) => {
  const [history, setHistory] = useState<DashboardAssignmentHistory[]>(initialHistory);
  const [filteredHistory, setFilteredHistory] =
    useState<DashboardAssignmentHistory[]>(initialHistory);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('');
  const [userFilter, setUserFilter] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    to: new Date(),
  });

  useEffect(() => {
    if (initialHistory.length === 0) {
      loadHistory();
    }
  }, [templateId, roleId]);

  useEffect(() => {
    applyFilters();
  }, [history, actionFilter, userFilter, searchTerm, dateRange]);

  const loadHistory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const historyData = await dashboardAssignmentService.getAssignmentHistory(templateId, roleId);
      setHistory(historyData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...history];

    // Filter by action
    if (actionFilter) {
      filtered = filtered.filter(item => item.action === actionFilter);
    }

    // Filter by user
    if (userFilter) {
      filtered = filtered.filter(item =>
        item.performedBy.toLowerCase().includes(userFilter.toLowerCase())
      );
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(
        item =>
          item.templateId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          item.roleId.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (item.reason && item.reason.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }

    // Filter by date range
    filtered = filtered.filter(
      item => item.performedAt >= dateRange.from && item.performedAt <= dateRange.to
    );

    setFilteredHistory(filtered);
  };

  const handleExportHistory = () => {
    const exportData = {
      history: filteredHistory,
      filters: {
        action: actionFilter,
        user: userFilter,
        search: searchTerm,
        dateRange,
      },
      exportedAt: new Date().toISOString(),
      templateId,
      roleId,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `assignment-history-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'assigned':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'activated':
        return <Activity className="h-4 w-4 text-blue-500" />;
      case 'deactivated':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'updated':
        return <Edit className="h-4 w-4 text-yellow-500" />;
      case 'rolled_back':
        return <RotateCcw className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'assigned':
        return 'bg-green-100 text-green-800';
      case 'activated':
        return 'bg-blue-100 text-blue-800';
      case 'deactivated':
        return 'bg-red-100 text-red-800';
      case 'updated':
        return 'bg-yellow-100 text-yellow-800';
      case 'rolled_back':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const uniqueActions = [...new Set(history.map(item => item.action))];
  const uniqueUsers = [...new Set(history.map(item => item.performedBy))];

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Filters */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Assignment History</h3>
          <p className="text-sm text-gray-600">
            Audit trail of dashboard assignment changes
            {templateId && ` for ${templateId}`}
            {roleId && ` for ${roleId} role`}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportHistory}
            className="flex items-center space-x-2 px-3 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
          >
            <Download className="h-4 w-4" />
            <span>Export</span>
          </button>

          <button
            onClick={loadHistory}
            className="flex items-center space-x-2 px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search templates, roles..."
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Action Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
            <select
              value={actionFilter}
              onChange={e => setActionFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>
                  {action.charAt(0).toUpperCase() + action.slice(1).replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          {/* User Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
            <select
              value={userFilter}
              onChange={e => setUserFilter(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Users</option>
              {uniqueUsers.map(user => (
                <option key={user} value={user}>
                  {user}
                </option>
              ))}
            </select>
          </div>

          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
            <select
              value={`${Math.floor((dateRange.to.getTime() - dateRange.from.getTime()) / (24 * 60 * 60 * 1000))}`}
              onChange={e => {
                const days = parseInt(e.target.value);
                const to = new Date();
                const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
                setDateRange({ from, to });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>
        </div>

        {/* Clear Filters */}
        {(actionFilter || userFilter || searchTerm) && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Showing {filteredHistory.length} of {history.length} entries
            </span>
            <button
              onClick={() => {
                setActionFilter('');
                setUserFilter('');
                setSearchTerm('');
              }}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* History Timeline */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="text-center py-12">
          <History className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No history found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {history.length === 0
              ? 'Assignment history will appear here as changes are made.'
              : 'No entries match your current filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHistory.map((entry, index) => (
            <div
              key={entry.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start space-x-4">
                {/* Action Icon */}
                <div className="flex-shrink-0 mt-1">{getActionIcon(entry.action)}</div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <span
                        className={cn(
                          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
                          getActionColor(entry.action)
                        )}
                      >
                        {entry.action.charAt(0).toUpperCase() +
                          entry.action.slice(1).replace('_', ' ')}
                      </span>

                      <span className="text-sm font-medium text-gray-900">{entry.templateId}</span>

                      <span className="text-sm text-gray-500">→</span>

                      <span className="text-sm font-medium text-blue-600">{entry.roleId}</span>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span className="flex items-center">
                        <User className="h-3 w-3 mr-1" />
                        {entry.performedBy}
                      </span>
                      <span className="flex items-center">
                        <Calendar className="h-3 w-3 mr-1" />
                        {entry.performedAt.toLocaleDateString()}{' '}
                        {entry.performedAt.toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {/* Reason */}
                  {entry.reason && <p className="text-sm text-gray-600 mb-2">{entry.reason}</p>}

                  {/* State Changes */}
                  {(entry.previousState || entry.newState) && (
                    <div className="bg-gray-50 rounded-md p-3 text-xs">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {entry.previousState && (
                          <div>
                            <span className="font-medium text-gray-700">Previous State:</span>
                            <div className="mt-1 space-y-1">
                              {Object.entries(entry.previousState).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-gray-600">{key}:</span>
                                  <span className="text-gray-900">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {entry.newState && (
                          <div>
                            <span className="font-medium text-gray-700">New State:</span>
                            <div className="mt-1 space-y-1">
                              {Object.entries(entry.newState).map(([key, value]) => (
                                <div key={key} className="flex justify-between">
                                  <span className="text-gray-600">{key}:</span>
                                  <span className="text-gray-900">{String(value)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                    <div className="mt-2 text-xs text-gray-500">
                      <span className="font-medium">Additional Info:</span>
                      <span className="ml-2">{JSON.stringify(entry.metadata)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AssignmentHistoryPanel;
