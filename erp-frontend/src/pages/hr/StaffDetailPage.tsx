// Staff Detail Page - View staff details with edit/delete actions
import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Mail,
  Phone,
  User,
  Calendar,
  MapPin,
  Briefcase,
  RefreshCw,
  Clock,
  DollarSign,
  CalendarDays,
  TrendingUp,
  AlertCircle,
  Building2,
  CreditCard,
  ShieldCheck,
  Hash,
  FileText,
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import hrService from '../../services/hrService';
import { api } from '../../services/api';

const StaffDetailPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [photoError, setPhotoError] = useState(false);

  // Fetch staff data
  const {
    data: staff,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['staff', id],
    queryFn: () => hrService.getStaffMember(id!),
    enabled: Boolean(id),
  });

  // Fetch leave balances
  const {
    data: leaveBalances,
    isLoading: isLoadingLeaveBalances,
    error: leaveBalancesError,
  } = useQuery({
    queryKey: ['staff-leave-balances', id, selectedYear],
    queryFn: () => hrService.getStaffLeaveBalances(id!, selectedYear),
    enabled: Boolean(id),
  });

  // Fetch attendance summary
  const {
    data: attendanceSummary,
    isLoading: isLoadingAttendanceSummary,
    error: attendanceSummaryError,
  } = useQuery({
    queryKey: ['staff-attendance-summary', id, selectedYear, selectedMonth],
    queryFn: () => hrService.getStaffAttendanceSummary(id!, selectedYear, selectedMonth),
    enabled: Boolean(id),
  });

  // Fetch detailed attendance records for calendar view
  const {
    data: attendanceRecords,
    isLoading: isLoadingAttendanceRecords,
    error: attendanceRecordsError,
  } = useQuery({
    queryKey: ['staff-attendance-records', id, selectedYear, selectedMonth],
    queryFn: async () => {
      const response = await api.get('/hr/attendance/', {
        params: {
          staff: id,
          date__year: selectedYear,
          date__month: selectedMonth,
          page_size: 100,
        },
      });
      return response;
    },
    enabled: Boolean(id),
  });

  // Fetch salary components
  const {
    data: salaryComponents,
    isLoading: isLoadingSalaryComponents,
    error: salaryComponentsError,
  } = useQuery({
    queryKey: ['staff-salary-components', id],
    queryFn: () => hrService.getStaffSalaryComponents(id!),
    enabled: Boolean(id),
  });

  const handleEdit = () => {
    navigate(`/hr/staff/${id}/edit`);
  };

  const handleDelete = async () => {
    if (!staff) return;

    if (
      !window.confirm(
        `Are you sure you want to delete ${staff.full_name}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await hrService.deleteStaff(staff.id);
      queryClient.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member deleted successfully!');
      navigate('/hr/staff');
    } catch (error) {
      console.error('Error deleting staff:', error);
      toast.error('Failed to delete staff member. Please try again.');
    }
  };

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['staff', id] });
    queryClient.invalidateQueries({ queryKey: ['staff-leave-balances', id] });
    queryClient.invalidateQueries({ queryKey: ['staff-attendance-summary', id] });
    queryClient.invalidateQueries({ queryKey: ['staff-salary-components', id] });
    toast.success('Data refreshed successfully!');
  };

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
    }).format(num);
  };

  const getMonthName = (month: number) => {
    const months = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return months[month - 1];
  };

  // Generate calendar days for the selected month
  const generateCalendarDays = () => {
    const year = selectedYear;
    const month = selectedMonth;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add all days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    return days;
  };

  // Get attendance record for a specific day
  const getAttendanceForDay = (day: number) => {
    if (!attendanceRecords?.results) return null;

    const dateStr = `${selectedYear}-${selectedMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    return attendanceRecords.results.find(record => record.date === dateStr);
  };

  // Get status color for calendar day
  const getStatusColor = (attendance: any) => {
    if (!attendance) return 'bg-gray-100 text-gray-400';

    switch (attendance.status) {
      case 'present':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'absent':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'late':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'on_leave':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Staff Member Not Found</h2>
          <p className="text-gray-600 mb-4">The staff member you're looking for doesn't exist.</p>
          <button
            onClick={() => navigate('/hr/staff')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Staff List
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <button
              onClick={() => navigate('/hr/staff')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-800 transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Staff Details</h1>
              <p className="text-gray-600">View and manage staff member information</p>
            </div>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={handleEdit}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200 flex items-center"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </button>
            <button
              onClick={handleDelete}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors duration-200 flex items-center"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </button>
          </div>
        </div>

        {/* Staff Information */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Profile Header */}
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-8">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {staff.photo && !photoError ? (
                  <img
                    src={staff.photo}
                    alt={staff.full_name}
                    className="h-24 w-24 rounded-full object-cover border-4 border-white shadow-lg"
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center border-4 border-white shadow-lg">
                    <User className="h-12 w-12 text-gray-400" />
                  </div>
                )}
              </div>
              <div className="ml-6">
                <h2 className="text-2xl font-bold text-white">{staff.full_name}</h2>
                <p className="text-blue-100 text-lg">{staff.position || 'Staff Member'}</p>
                <p className="text-blue-200 text-sm">
                  {staff.staff_id ? `ID: ${staff.staff_id}` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Details Grid */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                  Personal Information
                </h3>

                <div className="space-y-3">
                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Full Name</p>
                      <p className="text-gray-900">{staff.full_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">First Name</p>
                      <p className="text-gray-900">{staff.first_name}</p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <User className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Last Name</p>
                      <p className="text-gray-900">{staff.last_name}</p>
                    </div>
                  </div>

                  {staff.email && (
                    <div className="flex items-center">
                      <Mail className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Email</p>
                        <a
                          href={`mailto:${staff.email}`}
                          className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                        >
                          {staff.email}
                        </a>
                      </div>
                    </div>
                  )}

                  {staff.phone && (
                    <div className="flex items-center">
                      <Phone className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Phone</p>
                        <a
                          href={`tel:${staff.phone}`}
                          className="text-blue-600 hover:text-blue-800 transition-colors duration-200"
                        >
                          {staff.phone}
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Work Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b border-gray-200 pb-2">
                  Work Information
                </h3>

                <div className="space-y-3">
                  {staff.department && (
                    <div className="flex items-center">
                      <MapPin className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Department</p>
                        <p className="text-gray-900">{staff.department}</p>
                      </div>
                    </div>
                  )}

                  {staff.position && (
                    <div className="flex items-center">
                      <Briefcase className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">Position</p>
                        <p className="text-gray-900">{staff.position}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Date Joined</p>
                      <p className="text-gray-900">
                        {new Date(staff.created_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 text-gray-400 mr-3" />
                    <div>
                      <p className="text-sm font-medium text-gray-500">Last Updated</p>
                      <p className="text-gray-900">
                        {new Date(staff.updated_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {staff.user && (
                    <div className="flex items-center">
                      <User className="h-5 w-5 text-gray-400 mr-3" />
                      <div>
                        <p className="text-sm font-medium text-gray-500">User Account</p>
                        <p className="text-gray-900">Linked</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payroll & Banking Information Card */}
        {(staff.paye_pin ||
          staff.pension_number ||
          staff.pension_provider ||
          staff.bank_name ||
          staff.bank_account_number) && (
          <div className="mt-6 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-amber-50 to-blue-50">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-600" />
                Payroll &amp; Banking Information
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Tax identification, pension, and salary disbursement details
              </p>
            </div>
            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* PAYE PIN */}
              {staff.paye_pin && (
                <div className="flex items-start">
                  <ShieldCheck className="h-5 w-5 text-amber-500 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">PAYE PIN / TIN</p>
                    <p className="text-gray-900 font-mono font-semibold">{staff.paye_pin}</p>
                    <p className="text-xs text-gray-400">FIRS Tax Identification</p>
                  </div>
                </div>
              )}

              {/* Pension Number */}
              {staff.pension_number && (
                <div className="flex items-start">
                  <Hash className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">RSA PIN / Pension No.</p>
                    <p className="text-gray-900 font-mono font-semibold">{staff.pension_number}</p>
                    <p className="text-xs text-gray-400">Retirement Savings Account PIN</p>
                  </div>
                </div>
              )}

              {/* PFA */}
              {staff.pension_provider && (
                <div className="flex items-start">
                  <ShieldCheck className="h-5 w-5 text-green-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Pension Fund Administrator</p>
                    <p className="text-gray-900">{staff.pension_provider}</p>
                    <p className="text-xs text-gray-400">PFA / Pension Provider</p>
                  </div>
                </div>
              )}

              {/* Bank Name */}
              {staff.bank_name && (
                <div className="flex items-start">
                  <Building2 className="h-5 w-5 text-blue-500 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Bank Name</p>
                    <p className="text-gray-900 font-semibold">{staff.bank_name}</p>
                    <p className="text-xs text-gray-400">Salary disbursement bank</p>
                  </div>
                </div>
              )}

              {/* Account Number */}
              {staff.bank_account_number && (
                <div className="flex items-start">
                  <CreditCard className="h-5 w-5 text-blue-600 mr-3 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-500">Account Number</p>
                    <p className="text-gray-900 font-mono font-semibold tracking-widest">
                      {staff.bank_account_number}
                    </p>
                    <p className="text-xs text-gray-400">Salary disbursement account</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* HR Data Sections */}
        <div className="mt-6 space-y-6">
          {/* Data Controls */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">HR Data Overview</h3>
              <button
                onClick={handleRefresh}
                className="flex items-center px-3 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors duration-200"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Data
              </button>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Year:</label>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-gray-700">Month:</label>
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(month => (
                    <option key={month} value={month}>
                      {getMonthName(month)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Leave Balances Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <CalendarDays className="h-5 w-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">
                Leave Balances ({selectedYear})
              </h3>
            </div>

            {isLoadingLeaveBalances ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
            ) : leaveBalancesError ? (
              <div className="flex items-center justify-center py-8 text-red-600">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>Failed to load leave balances</span>
              </div>
            ) : leaveBalances && leaveBalances.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leaveBalances.map(balance => (
                  <div key={balance.id} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-2">{balance.leave_type_name}</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Entitled:</span>
                        <span className="font-medium">{balance.entitled_days} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Used:</span>
                        <span className="font-medium text-red-600">{balance.used_days} days</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pending:</span>
                        <span className="font-medium text-yellow-600">
                          {balance.pending_days} days
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Carried Over:</span>
                        <span className="font-medium text-blue-600">
                          {balance.carried_over_days} days
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2">
                        <span className="text-gray-600 font-medium">Available:</span>
                        <span className="font-bold text-green-600">
                          {balance.available_days} days
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <CalendarDays className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No leave balances found for {selectedYear}</p>
              </div>
            )}
          </div>

          {/* Attendance Summary Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <Clock className="h-5 w-5 text-green-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">
                Attendance Summary ({getMonthName(selectedMonth)} {selectedYear})
              </h3>
            </div>

            {isLoadingAttendanceSummary || isLoadingAttendanceRecords ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                <span className="ml-2 text-sm text-gray-600">Loading attendance data...</span>
              </div>
            ) : attendanceSummaryError || attendanceRecordsError ? (
              <div className="flex items-center justify-center py-8 text-red-600">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>Failed to load attendance data</span>
              </div>
            ) : attendanceSummary ? (
              <div className="space-y-6">
                {/* Summary Statistics */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {attendanceSummary.total_days}
                    </div>
                    <div className="text-sm text-blue-800">Total Days</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {attendanceSummary.present}
                    </div>
                    <div className="text-sm text-green-800">Present</div>
                  </div>
                  <div className="bg-red-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {attendanceSummary.absent}
                    </div>
                    <div className="text-sm text-red-800">Absent</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {attendanceSummary.late}
                    </div>
                    <div className="text-sm text-yellow-800">Late</div>
                  </div>
                  <div className="bg-purple-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {attendanceSummary.on_leave}
                    </div>
                    <div className="text-sm text-purple-800">On Leave</div>
                  </div>
                  <div className="bg-indigo-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-indigo-600">
                      {attendanceSummary.total_hours_worked}
                    </div>
                    <div className="text-sm text-indigo-800">Hours Worked</div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {attendanceSummary.total_overtime_hours}
                    </div>
                    <div className="text-sm text-orange-800">Overtime Hours</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold text-gray-600">
                      {attendanceSummary.total_days > 0
                        ? Math.round(
                            (attendanceSummary.present / attendanceSummary.total_days) * 100
                          )
                        : 0}
                      %
                    </div>
                    <div className="text-sm text-gray-800">Attendance Rate</div>
                  </div>
                </div>

                {/* Calendar View */}
                <div className="border-t pt-6">
                  <h4 className="text-md font-semibold text-gray-900 mb-4">Monthly Calendar</h4>

                  {/* Calendar Header */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Days */}
                  <div className="grid grid-cols-7 gap-1">
                    {generateCalendarDays().map((day, index) => {
                      if (day === null) {
                        return <div key={index} className="p-2 h-16"></div>;
                      }

                      const attendance = getAttendanceForDay(day);
                      const statusColor = getStatusColor(attendance);
                      const isToday =
                        day === new Date().getDate() &&
                        selectedMonth === new Date().getMonth() + 1 &&
                        selectedYear === new Date().getFullYear();

                      return (
                        <div
                          key={day}
                          className={`p-2 h-16 border rounded-lg text-center relative ${statusColor} ${
                            isToday ? 'ring-2 ring-blue-500' : ''
                          }`}
                          title={
                            attendance
                              ? `${day}: ${attendance.status} ${attendance.clock_in ? `(In: ${attendance.clock_in.slice(0, 5)})` : ''} ${attendance.clock_out ? `(Out: ${attendance.clock_out.slice(0, 5)})` : ''}`
                              : `${day}: No record`
                          }
                        >
                          <div className="text-sm font-medium">{day}</div>
                          {attendance && (
                            <div className="text-xs mt-1">
                              {attendance.status === 'present' && '✓'}
                              {attendance.status === 'absent' && '✗'}
                              {attendance.status === 'late' && '⏰'}
                              {attendance.status === 'on_leave' && '🏖️'}
                            </div>
                          )}
                          {attendance &&
                            attendance.hours_worked &&
                            parseFloat(attendance.hours_worked) > 0 && (
                              <div className="text-xs text-gray-600 mt-1">
                                {parseFloat(attendance.hours_worked).toFixed(1)}h
                              </div>
                            )}
                          {isToday && (
                            <div className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="mt-4 flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
                      <span>Present</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
                      <span>Absent</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-yellow-100 border border-yellow-200 rounded"></div>
                      <span>Late</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-purple-100 border border-purple-200 rounded"></div>
                      <span>On Leave</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
                      <span>No Record</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>
                  No attendance data found for {getMonthName(selectedMonth)} {selectedYear}
                </p>
              </div>
            )}
          </div>

          {/* Salary Components Section */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center mb-4">
              <DollarSign className="h-5 w-5 text-green-600 mr-2" />
              <h3 className="text-lg font-semibold text-gray-900">Salary Components</h3>
            </div>

            {isLoadingSalaryComponents ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
              </div>
            ) : salaryComponentsError ? (
              <div className="flex items-center justify-center py-8 text-red-600">
                <AlertCircle className="h-5 w-5 mr-2" />
                <span>Failed to load salary components</span>
              </div>
            ) : salaryComponents && salaryComponents.length > 0 ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {salaryComponents.map(component => {
                    const isEarning = component.component_type === 'EARNING';
                    return (
                      <div key={component.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">{component.component_name}</h4>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              isEarning ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {isEarning ? 'Earning' : 'Deduction'}
                          </span>
                        </div>
                        <div
                          className={`text-lg font-bold ${isEarning ? 'text-green-700' : 'text-red-700'}`}
                        >
                          {isEarning ? '+' : '-'} {formatCurrency(component.amount)}
                        </div>
                        {isEarning && component.is_taxable === false && (
                          <div className="text-xs text-gray-400 mt-1">Non-taxable allowance</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="border-t pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center">
                      <div className="text-lg font-bold text-green-600">
                        {formatCurrency(
                          salaryComponents
                            .filter(c => c.component_type === 'EARNING')
                            .reduce((sum, c) => sum + parseFloat(c.amount), 0)
                        )}
                      </div>
                      <div className="text-sm text-green-800">Total Earnings</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center">
                      <div className="text-lg font-bold text-red-600">
                        {formatCurrency(
                          salaryComponents
                            .filter(c => c.component_type === 'DEDUCTION')
                            .reduce((sum, c) => sum + parseFloat(c.amount), 0)
                        )}
                      </div>
                      <div className="text-sm text-red-800">Total Deductions</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center">
                      <div className="text-lg font-bold text-blue-600">
                        {formatCurrency(
                          salaryComponents
                            .filter(c => c.component_type === 'EARNING')
                            .reduce((sum, c) => sum + parseFloat(c.amount), 0) -
                            salaryComponents
                              .filter(c => c.component_type === 'DEDUCTION')
                              .reduce((sum, c) => sum + parseFloat(c.amount), 0)
                        )}
                      </div>
                      <div className="text-sm text-blue-800">Net Salary</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <DollarSign className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                <p>No salary components assigned</p>
                <button
                  onClick={() => navigate(`/hr/staff/${staff.staff_id || staff.id}/pay-components`)}
                  className="mt-2 text-blue-600 hover:text-blue-800 text-sm"
                >
                  Assign salary components
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => navigate(`/hr/staff/${staff.staff_id || staff.id}/pay-components`)}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors duration-200"
            >
              <Briefcase className="h-5 w-5 text-indigo-600 mr-3" />
              <div className="text-left">
                <p className="font-medium text-gray-900">Manage Salary Components</p>
                <p className="text-sm text-gray-500">Configure pay structure</p>
              </div>
            </button>

            <button
              onClick={() => navigate(`/hr/leave-requests?staff=${staff.staff_id || staff.id}`)}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors duration-200"
            >
              <Calendar className="h-5 w-5 text-blue-600 mr-3" />
              <div className="text-left">
                <p className="font-medium text-gray-900">View Leave Requests</p>
                <p className="text-sm text-gray-500">See all leave requests</p>
              </div>
            </button>

            <button
              onClick={() => navigate(`/hr/attendance?staff=${staff.staff_id || staff.id}`)}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-green-300 hover:bg-green-50 transition-colors duration-200"
            >
              <Calendar className="h-5 w-5 text-green-600 mr-3" />
              <div className="text-left">
                <p className="font-medium text-gray-900">View Attendance</p>
                <p className="text-sm text-gray-500">Check attendance records</p>
              </div>
            </button>

            <button
              onClick={() =>
                navigate(`/hr/leave-requests/create?staff=${staff.staff_id || staff.id}`)
              }
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors duration-200"
            >
              <Calendar className="h-5 w-5 text-purple-600 mr-3" />
              <div className="text-left">
                <p className="font-medium text-gray-900">Create Leave Request</p>
                <p className="text-sm text-gray-500">Submit new leave request</p>
              </div>
            </button>

            <button
              onClick={() => navigate(`/hr/staff/${staff.staff_id || staff.id}/documents`)}
              className="flex items-center p-4 border border-gray-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-colors duration-200"
            >
              <FileText className="h-5 w-5 text-amber-600 mr-3" />
              <div className="text-left">
                <p className="font-medium text-gray-900">Employee Documents</p>
                <p className="text-sm text-gray-500">Manage files & certificates</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffDetailPage;
