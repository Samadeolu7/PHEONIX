import React from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  Calendar,
  Clock,
  DollarSign,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Plus,
} from 'lucide-react';
import {
  useHRMetrics,
  useLeaveAnalytics,
  useAttendanceAnalytics,
} from '../../hooks/useHRDashboard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const HRDashboardPage: React.FC = () => {
  const { data: metrics, isLoading: metricsLoading } = useHRMetrics();
  const { data: leaveAnalytics } = useLeaveAnalytics();
  const { data: attendanceAnalytics } = useAttendanceAnalytics();

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount);
  };

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-gray-600">Overview of human resources metrics and analytics</p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/hr/staff/create"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Add Staff
          </Link>
          <Link
            to="/hr/clock"
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <Clock className="h-4 w-4" />
            Clock In/Out
          </Link>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Staff</p>
              <p className="text-2xl font-bold text-gray-900">{metrics?.total_staff || 0}</p>
              <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                <TrendingUp className="h-3 w-3" />
                {metrics?.active_staff || 0} active
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Pending Leaves</p>
              <p className="text-2xl font-bold text-gray-900">
                {metrics?.pending_leave_requests || 0}
              </p>
              <p className="text-xs text-orange-600 flex items-center gap-1 mt-1">
                <AlertCircle className="h-3 w-3" />
                Require approval
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <Calendar className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Attendance Rate</p>
              <p className="text-2xl font-bold text-gray-900">{metrics?.attendance_rate || 0}%</p>
              <p className="text-xs text-green-600 flex items-center gap-1 mt-1">
                <CheckCircle className="h-3 w-3" />
                This month
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Monthly Payroll</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(metrics?.monthly_payroll_cost || '0')}
              </p>
              <p className="text-xs text-blue-600 flex items-center gap-1 mt-1">
                <DollarSign className="h-3 w-3" />
                {metrics?.current_payroll_status || 'draft'}
              </p>
            </div>
            <div className="p-3 bg-purple-100 rounded-lg">
              <DollarSign className="h-6 w-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leave Usage Chart */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Leave Usage by Type</h3>
          {leaveAnalytics?.leave_usage_by_type && (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={leaveAnalytics.leave_usage_by_type}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {leaveAnalytics.leave_usage_by_type.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Attendance Trends */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Attendance Trends</h3>
          {attendanceAnalytics?.daily_trends && (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={attendanceAnalytics.daily_trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickFormatter={value => new Date(value).toLocaleDateString()}
                />
                <YAxis />
                <Tooltip labelFormatter={value => new Date(value).toLocaleDateString()} />
                <Bar dataKey="present" fill="#10B981" name="Present" />
                <Bar dataKey="late" fill="#F59E0B" name="Late" />
                <Bar dataKey="absent" fill="#EF4444" name="Absent" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quick Actions */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Link
              to="/hr/leave-requests"
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-orange-600" />
                <div>
                  <p className="font-medium text-gray-900">Review Leave Requests</p>
                  <p className="text-sm text-gray-600">
                    {metrics?.pending_leave_requests || 0} pending
                  </p>
                </div>
              </div>
              <div className="text-orange-600">
                <AlertCircle className="h-5 w-5" />
              </div>
            </Link>

            <Link
              to="/hr/payroll"
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900">Process Payroll</p>
                  <p className="text-sm text-gray-600">
                    Current status: {metrics?.current_payroll_status}
                  </p>
                </div>
              </div>
              <div className="text-purple-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </Link>

            <Link
              to="/hr/attendance"
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-gray-900">View Attendance</p>
                  <p className="text-sm text-gray-600">
                    {metrics?.attendance_rate}% rate this month
                  </p>
                </div>
              </div>
              <div className="text-green-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            </Link>

            <Link
              to="/hr/salary-components"
              className="flex items-center justify-between p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900">Manage Salary Components</p>
                  <p className="text-sm text-gray-600">Configure earnings & deductions</p>
                </div>
              </div>
              <div className="text-blue-600">
                <TrendingUp className="h-5 w-5" />
              </div>
            </Link>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-4 w-4 text-green-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Leave request approved</p>
                <p className="text-xs text-gray-600">John Doe's annual leave for next week</p>
                <p className="text-xs text-gray-500">2 hours ago</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">New staff member added</p>
                <p className="text-xs text-gray-600">Jane Smith joined the Engineering team</p>
                <p className="text-xs text-gray-500">5 hours ago</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <DollarSign className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Payroll calculated</p>
                <p className="text-xs text-gray-600">January 2025 payroll ready for approval</p>
                <p className="text-xs text-gray-500">1 day ago</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-orange-100 rounded-lg">
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Late arrival recorded</p>
                <p className="text-xs text-gray-600">3 staff members arrived late today</p>
                <p className="text-xs text-gray-500">3 hours ago</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">Leave request rejected</p>
                <p className="text-xs text-gray-600">Insufficient leave balance</p>
                <p className="text-xs text-gray-500">1 day ago</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HRDashboardPage;
