import React, { useState, useMemo } from 'react';
import { Calendar, Filter, Download, Search, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { useLeaveBalances } from '../../hooks/useLeaveBalances';
import { leaveBalanceService } from '../../services/leaveBalanceService';
import LeaveBalanceCard from '../../components/hr/LeaveBalanceCard';
import LeaveBalanceInitializationModal from '../../components/hr/LeaveBalanceInitializationModal';
import { useToast } from '@/contexts/ToastContext';
import { useQueryClient } from '@tanstack/react-query';

interface GroupedLeaveBalance {
  staff: {
    id: number;
    staff_id?: string;
    full_name: string;
    employee_number: string | null;
    department: string;
    position: string;
  };
  balances: Array<{
    id: number;
    leave_type: {
      id: number;
      name: string;
      code: string;
    };
    year: number;
    entitled_days: string;
    used_days: string;
    pending_days: string;
    carried_over_days: string;
    available_days: string;
    total_days: number;
    created_at: string;
    updated_at: string;
  }>;
}

const LeaveBalancesListPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedLeaveType, setSelectedLeaveType] = useState<number | ''>('');
  const [page, setPage] = useState(1);
  const [showInitializationModal, setShowInitializationModal] = useState(false);
  const [expandedStaff, setExpandedStaff] = useState<Set<number>>(new Set());
  const [isInitializing, setIsInitializing] = useState(false);

  const { data, isLoading, error, refetch } = useLeaveBalances({
    year: selectedYear,
    leave_type: selectedLeaveType || undefined,
    page,
    page_size: 20,
  });

  const toast = useToast();
  const queryClient = useQueryClient();

  // Filter by staff name (client-side filtering)
  const filteredBalances =
    data?.results?.filter(balance =>
      balance.staff.full_name.toLowerCase().includes(search.toLowerCase())
    ) || [];

  // Group balances by staff
  const groupedBalances = useMemo(() => {
    const groups = new Map<number, GroupedLeaveBalance>();

    filteredBalances.forEach(balance => {
      const staffId = balance.staff.id;
      if (!groups.has(staffId)) {
        groups.set(staffId, {
          staff: balance.staff,
          balances: [],
        });
      }
      groups.get(staffId)!.balances.push(balance);
    });

    // Sort balances within each group by leave type name
    groups.forEach(group => {
      group.balances.sort((a, b) => a.leave_type.name.localeCompare(b.leave_type.name));
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.staff.full_name.localeCompare(b.staff.full_name)
    );
  }, [filteredBalances]);

  // Get unique leave types for filter
  const leaveTypes = useMemo(() => {
    const types = new Map();
    data?.results?.forEach(balance => {
      if (!types.has(balance.leave_type.id)) {
        types.set(balance.leave_type.id, {
          id: balance.leave_type.id,
          name: balance.leave_type.name,
          code: balance.leave_type.code,
        });
      }
    });
    return Array.from(types.values());
  }, [data?.results]);

  // Toggle staff expansion
  const toggleStaffExpansion = (staffId: number) => {
    const newExpanded = new Set(expandedStaff);
    if (newExpanded.has(staffId)) {
      newExpanded.delete(staffId);
    } else {
      newExpanded.add(staffId);
    }
    setExpandedStaff(newExpanded);
  };

  const handleInitialize = async () => {
    if (
      !confirm(
        `Initialize leave balances for all staff for year ${selectedYear}?\n\nThis will create leave balance entries for each staff member based on their configured leave types.`
      )
    ) {
      return;
    }

    setIsInitializing(true);
    try {
      const result = await leaveBalanceService.initializeLeaveBalances(selectedYear);
      toast.success(`${result.message}\nTotal balances created: ${result.total_balances_created}`);
      // Invalidate and refetch
      await queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
      await refetch();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to initialize leave balances');
    } finally {
      setIsInitializing(false);
      setShowInitializationModal(false);
    }
  };

  const handleExport = () => {
    // This would implement CSV export functionality
    console.log('Exporting leave balances...');
    toast.info('Export feature coming soon');
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
        <p className="text-red-800">Failed to load leave balances</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Leave Balances</h1>
          <p className="text-sm sm:text-base text-gray-600">
            Monitor staff leave entitlements and usage
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            onClick={() => setShowInitializationModal(true)}
            disabled={isInitializing}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Initialize Balances</span>
            <span className="sm:hidden">Initialize</span>
          </button>
          <button
            onClick={handleExport}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Export CSV</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="Search staff..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            />
          </div>

          {/* Year Filter */}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <select
              value={selectedYear}
              onChange={e => setSelectedYear(parseInt(e.target.value))}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            >
              {[2024, 2025, 2026].map(year => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          {/* Leave Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <select
              value={selectedLeaveType}
              onChange={e => setSelectedLeaveType(e.target.value ? parseInt(e.target.value) : '')}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
            >
              <option value="">All Leave Types</option>
              {leaveTypes.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Results Count */}
          <div className="flex items-center justify-center sm:justify-end">
            <span className="text-xs sm:text-sm text-gray-600">
              {filteredBalances.length} of {data?.count || 0} balances
            </span>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Total Staff</p>
              <p className="text-lg sm:text-xl font-semibold text-gray-900">
                {new Set(filteredBalances.map(b => b.staff.id)).size}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Total Available</p>
              <p className="text-lg sm:text-xl font-semibold text-green-600">
                {filteredBalances
                  .reduce((sum, b) => sum + parseFloat(b.available_days), 0)
                  .toFixed(1)}{' '}
                <span className="text-xs sm:text-sm">days</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Total Used</p>
              <p className="text-lg sm:text-xl font-semibold text-orange-600">
                {filteredBalances.reduce((sum, b) => sum + parseFloat(b.used_days), 0).toFixed(1)}{' '}
                <span className="text-xs sm:text-sm">days</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-yellow-600" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm text-gray-600">Total Pending</p>
              <p className="text-lg sm:text-xl font-semibold text-yellow-600">
                {filteredBalances
                  .reduce((sum, b) => sum + parseFloat(b.pending_days), 0)
                  .toFixed(1)}{' '}
                <span className="text-xs sm:text-sm">days</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Grouped Leave Balances by Staff */}
      <div className="space-y-4">
        {groupedBalances.map(group => (
          <div key={group.staff.id} className="bg-white rounded-lg shadow-sm border">
            {/* Staff Header - Clickable to expand/collapse */}
            <div
              className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggleStaffExpansion(group.staff.id)}
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-medium text-blue-600">
                    {group.staff.full_name
                      .split(' ')
                      .map(n => n[0])
                      .join('')
                      .substring(0, 2)
                      .toUpperCase()}
                  </span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-lg">{group.staff.full_name}</h3>
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    {group.staff.staff_id && (
                      <span className="font-mono">{group.staff.staff_id}</span>
                    )}
                    {group.staff.employee_number && <span>ID: {group.staff.employee_number}</span>}
                    {group.staff.department && <span>Dept: {group.staff.department}</span>}
                    {group.staff.position && <span>Position: {group.staff.position}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  {group.balances.length} leave type{group.balances.length !== 1 ? 's' : ''}
                </span>
                {expandedStaff.has(group.staff.id) ? (
                  <ChevronDown className="h-5 w-5 text-gray-400" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-gray-400" />
                )}
              </div>
            </div>

            {/* Leave Types - Horizontal Layout (Collapsible) */}
            {expandedStaff.has(group.staff.id) && (
              <div className="border-t border-gray-100 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.balances.map(balance => (
                    <div key={balance.id} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-medium text-gray-900">{balance.leave_type.name}</h4>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                          {balance.leave_type.code}
                        </span>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Entitled:</span>
                          <span className="font-medium text-gray-900">
                            {parseFloat(balance.entitled_days).toFixed(1)} days
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Used:</span>
                          <span className="font-medium text-orange-600">
                            {parseFloat(balance.used_days).toFixed(1)} days
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Pending:</span>
                          <span className="font-medium text-yellow-600">
                            {parseFloat(balance.pending_days).toFixed(1)} days
                          </span>
                        </div>

                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">Carried Over:</span>
                          <span className="font-medium text-blue-600">
                            {parseFloat(balance.carried_over_days).toFixed(1)} days
                          </span>
                        </div>

                        <div className="border-t border-gray-200 pt-2 mt-2">
                          <div className="flex justify-between text-sm font-semibold">
                            <span className="text-gray-900">Available:</span>
                            <span
                              className={`${
                                parseFloat(balance.available_days) > 0
                                  ? 'text-green-600'
                                  : parseFloat(balance.available_days) < 0
                                    ? 'text-red-600'
                                    : 'text-gray-600'
                              }`}
                            >
                              {parseFloat(balance.available_days).toFixed(1)} days
                            </span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Usage</span>
                            <span>
                              {parseFloat(balance.entitled_days) > 0
                                ? Math.min(
                                    (parseFloat(balance.used_days) /
                                      parseFloat(balance.entitled_days)) *
                                      100,
                                    100
                                  ).toFixed(0)
                                : 0}
                              %
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            {parseFloat(balance.entitled_days) > 0 && (
                              <div
                                className={`h-2 rounded-full ${
                                  parseFloat(balance.used_days) /
                                    parseFloat(balance.entitled_days) >
                                  0.8
                                    ? 'bg-red-500'
                                    : parseFloat(balance.used_days) /
                                          parseFloat(balance.entitled_days) >
                                        0.6
                                      ? 'bg-yellow-500'
                                      : 'bg-green-500'
                                }`}
                                style={{
                                  width: `${Math.min(
                                    (parseFloat(balance.used_days) /
                                      parseFloat(balance.entitled_days)) *
                                      100,
                                    100
                                  )}%`,
                                }}
                              ></div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {filteredBalances.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
          <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500 text-base sm:text-lg">No leave balances found</p>
          <p className="text-gray-400 text-sm sm:text-base">
            Try adjusting your filters or search criteria
          </p>
        </div>
      )}

      {/* Pagination */}
      {data && data.count > 20 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="text-xs sm:text-sm text-gray-700 text-center sm:text-left">
            Showing {(page - 1) * 20 + 1} to {Math.min(page * 20, data.count)} of {data.count}{' '}
            balances
          </div>
          <div className="flex gap-2 justify-center sm:justify-end">
            <button
              onClick={() => setPage(page - 1)}
              disabled={page === 1}
              className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm touch-manipulation"
              style={{ minHeight: '40px' }}
            >
              Previous
            </button>
            <button
              onClick={() => setPage(page + 1)}
              disabled={page * 20 >= data.count}
              className="px-3 py-2 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 text-sm touch-manipulation"
              style={{ minHeight: '40px' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Leave Balance Initialization Modal */}
      <LeaveBalanceInitializationModal
        isOpen={showInitializationModal}
        onClose={() => setShowInitializationModal(false)}
        currentYear={selectedYear}
        onInitialize={handleInitialize}
        isInitializing={isInitializing}
      />
    </div>
  );
};

export default LeaveBalancesListPage;
