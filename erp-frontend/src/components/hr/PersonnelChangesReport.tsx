// PersonnelChangesReport Component - Display consolidated personnel changes for payroll period
import React from 'react';
import {
  Users,
  UserPlus,
  UserMinus,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  TrendingUp,
} from 'lucide-react';
import { usePersonnelChangesReport } from '../../hooks/useHR';
import { formatDate, formatNumber } from '../../utils/formatters';

interface PersonnelChangesReportProps {
  periodStart: string;
  periodEnd: string;
  onClose?: () => void;
}

export const PersonnelChangesReport: React.FC<PersonnelChangesReportProps> = ({
  periodStart,
  periodEnd,
  onClose,
}) => {
  const { data: report, isLoading: loading, error: queryError, refetch } = usePersonnelChangesReport(periodStart, periodEnd);

  const error = queryError ? (queryError as Error).message || 'Failed to load report' : null;

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
          <div className="h-32 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 text-red-600 mb-4">
          <AlertCircle className="w-5 h-5" />
          <span className="font-medium">Error loading report</span>
        </div>
        <p className="text-gray-600 mb-4">{error}</p>
        <button
          onClick={() => refetch()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!report) {
    return null;
  }

  const hasChanges =
    report.summary.new_hires_count > 0 ||
    report.summary.terminations_count > 0 ||
    report.summary.leave_requests_count > 0 ||
    report.summary.overtime_staff_count > 0;

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Personnel Changes Report</h2>
            <p className="text-sm text-gray-600 mt-1">
              Period: {formatDate(periodStart)} - {formatDate(periodEnd)}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6 bg-gray-50">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <UserPlus className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">New Hires</p>
              <p className="text-2xl font-bold text-gray-900">{report.summary.new_hires_count}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <UserMinus className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Terminations</p>
              <p className="text-2xl font-bold text-gray-900">
                {report.summary.terminations_count}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Leave Days</p>
              <p className="text-2xl font-bold text-gray-900">{report.summary.total_leave_days}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Clock className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">Overtime Hours</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatNumber(report.summary.total_overtime_hours, 1)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* No Changes Message */}
      {!hasChanges && (
        <div className="p-6">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div>
              <p className="font-medium text-gray-900">No Personnel Changes</p>
              <p className="text-sm text-gray-600">
                No new hires, terminations, leave, or overtime recorded for this period.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Details Sections */}
      <div className="p-6 space-y-6">
        {/* New Hires */}
        {report.new_hires.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-green-600" />
              New Hires ({report.new_hires.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Position
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Hire Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.new_hires.map(hire => (
                    <tr key={hire.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {hire.first_name} {hire.last_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {hire.position || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {hire.department || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(hire.created_at || '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Terminations */}
        {report.terminations.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <UserMinus className="w-5 h-5 text-red-600" />
              Terminations ({report.terminations.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Position
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Department
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Termination Date
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.terminations.map(term => (
                    <tr key={term.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {term.first_name} {term.last_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {term.position || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {term.department || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(term.updated_at || '')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Leave Taken */}
        {report.leave_taken.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600" />
              Leave Taken ({report.leave_taken.length} requests, {report.summary.total_leave_days}{' '}
              days)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Staff Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Leave Type
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Start Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      End Date
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Days
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.leave_taken.map(leave => (
                    <tr key={leave.id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {leave.staff__first_name} {leave.staff__last_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {leave.leave_type__name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(leave.start_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatDate(leave.end_date)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {leave.num_days}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Overtime */}
        {report.overtime.length > 0 && (
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Clock className="w-5 h-5 text-purple-600" />
              Overtime ({report.overtime.length} staff,{' '}
              {formatNumber(report.summary.total_overtime_hours, 1)} hours)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Staff Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Total Overtime Hours
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.overtime.map(ot => (
                    <tr key={ot.staff__id}>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                        {ot.staff__first_name} {ot.staff__last_name}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                        {formatNumber(parseFloat(ot.total_overtime_hours), 2)} hours
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Sign-off Section */}
      <div className="border-t p-6 bg-gray-50">
        <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium text-gray-900">HR Manager Review Required</p>
            <p className="text-sm text-gray-600 mt-1">
              Please review and confirm all personnel changes before proceeding with payroll
              calculation.
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="w-4 h-4" />
            <span>Reviewed by:</span>
            <span className="font-medium">_____________</span>
            <span>Date:</span>
            <span className="font-medium">_____________</span>
          </div>
        </div>
      </div>
    </div>
  );
};
