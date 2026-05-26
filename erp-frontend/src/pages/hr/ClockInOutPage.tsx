import React, { useState } from 'react';
import { ArrowLeft, Users, Calendar, Clock, CheckCircle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ClockInOutWidget from '../../components/hr/ClockInOutWidget';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';
import { staffService } from '../../services/staffService';

interface Staff {
  id: number;
  first_name: string;
  last_name: string;
  staff_id?: string;
  position: string;
  department: string;
  photo?: string;
}

interface AttendanceRecord {
  id: number;
  staff: number;
  staff_name: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: string;
  hours_worked: string;
  overtime_hours: string;
  leave_request: any;
  notes: string;
  created_at: string;
  updated_at: string;
}

interface AttendanceResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: AttendanceRecord[];
}

const ClockInOutPage: React.FC = () => {
  const navigate = useNavigate();
  const [selectedStaffId, setSelectedStaffId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Fetch staff list
  const { data: staffData, isLoading } = useQuery({
    queryKey: ['staff-all'],
    queryFn: () => staffService.getAllStaff(),
  });

  // Fetch attendance data for selected staff
  const { data: attendanceData, isLoading: isLoadingAttendance } = useQuery({
    queryKey: ['attendance', selectedStaffId],
    queryFn: async (): Promise<AttendanceResponse> => {
      if (!selectedStaffId) return { count: 0, next: null, previous: null, results: [] };

      const response = await api.get('/hr/attendance/', {
        params: {
          staff: selectedStaffId,
          page_size: 7, // Last 7 days
        },
      });
      return response;
    },
    enabled: !!selectedStaffId,
  });

  const filteredStaff =
    staffData?.filter(
      staff =>
        `${staff.first_name} ${staff.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
        staff.position.toLowerCase().includes(search.toLowerCase()) ||
        staff.department.toLowerCase().includes(search.toLowerCase())
    ) || [];

  const selectedStaff = selectedStaffId
    ? staffData?.find(s => s.id === selectedStaffId)
    : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 sm:mb-8">
          <button onClick={() => navigate('/hr')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Clock In/Out</h1>
            <p className="text-sm sm:text-base text-gray-600">
              Record attendance for staff members
            </p>
          </div>
        </div>

        {/* Date Selection */}
        <div className="bg-white rounded-lg shadow-sm border p-4 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <label htmlFor="date" className="text-sm font-medium text-gray-700">
                Select Date:
              </label>
            </div>
            <input
              type="date"
              id="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent w-full sm:w-auto"
            />
            <div className="text-sm text-gray-600">
              {selectedDate === new Date().toISOString().split('T')[0] ? (
                <span className="text-green-600 font-medium">Today</span>
              ) : (
                <span>
                  {new Date(selectedDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
          {/* Staff Selection */}
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-4 sm:p-6 border-b">
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Select Staff Member
              </h2>
            </div>

            <div className="p-4 sm:p-6">
              {/* Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search staff..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
                />
              </div>

              {/* Staff List */}
              <div className="space-y-2 max-h-80 sm:max-h-96 overflow-y-auto">
                {filteredStaff.map(staff => (
                  <button
                    key={staff.id}
                    onClick={() => setSelectedStaffId(staff.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors touch-manipulation ${
                      selectedStaffId === staff.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    style={{ minHeight: '60px' }} // Ensure minimum touch target size
                  >
                    <div className="flex items-center gap-3">
                      {staff.photo ? (
                        <img
                          src={staff.photo}
                          alt={`${staff.first_name} ${staff.last_name}`}
                          className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <Users className="h-5 w-5 text-gray-500" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                          {staff.first_name} {staff.last_name}
                        </p>
                        <p className="text-xs sm:text-sm text-gray-600 truncate">
                          {staff.position} • {staff.department}{' '}
                          {staff.staff_id ? `• ${staff.staff_id}` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {filteredStaff.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm sm:text-base">
                    {search ? 'No staff found matching your search' : 'No staff members found'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Clock Widget */}
          <div>
            {selectedStaff ? (
              <ClockInOutWidget
                staffId={selectedStaff.id}
                staffName={`${selectedStaff.first_name} ${selectedStaff.last_name}`}
                selectedDate={selectedDate}
              />
            ) : (
              <div className="bg-white rounded-lg shadow-sm border p-6 sm:p-8 text-center">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2">
                  Select a Staff Member
                </h3>
                <p className="text-sm sm:text-base text-gray-600">
                  Choose a staff member from the list to record their attendance
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Activity */}
        {selectedStaff && (
          <div className="mt-6 sm:mt-8 bg-white rounded-lg shadow-sm border p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-4">
              Recent Activity - {selectedStaff.first_name} {selectedStaff.last_name}
            </h3>

            {isLoadingAttendance ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                <span className="ml-2 text-sm text-gray-600">Loading attendance data...</span>
              </div>
            ) : attendanceData?.results && attendanceData.results.length > 0 ? (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                  <div className="bg-blue-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-medium text-blue-600">Total Days</span>
                    </div>
                    <p className="text-lg font-semibold text-blue-900">
                      {attendanceData.results.length}
                    </p>
                  </div>

                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-xs font-medium text-green-600">Present</span>
                    </div>
                    <p className="text-lg font-semibold text-green-900">
                      {attendanceData.results.filter(r => r.status === 'present').length}
                    </p>
                  </div>

                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-orange-600" />
                      <span className="text-xs font-medium text-orange-600">Total Hours</span>
                    </div>
                    <p className="text-lg font-semibold text-orange-900">
                      {attendanceData.results
                        .reduce(
                          (total, record) => total + parseFloat(record.hours_worked || '0'),
                          0
                        )
                        .toFixed(1)}
                    </p>
                  </div>

                  <div className="bg-purple-50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-purple-600" />
                      <span className="text-xs font-medium text-purple-600">Overtime</span>
                    </div>
                    <p className="text-lg font-semibold text-purple-900">
                      {attendanceData.results
                        .reduce(
                          (total, record) => total + parseFloat(record.overtime_hours || '0'),
                          0
                        )
                        .toFixed(1)}
                      h
                    </p>
                  </div>
                </div>

                {/* Attendance Records */}
                <div className="space-y-3">
                  <h4 className="font-medium text-gray-900">Last 7 Days</h4>
                  {attendanceData.results
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(record => (
                      <div
                        key={record.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-3 h-3 rounded-full ${
                              record.status === 'present'
                                ? 'bg-green-500'
                                : record.status === 'absent'
                                  ? 'bg-red-500'
                                  : record.status === 'late'
                                    ? 'bg-yellow-500'
                                    : 'bg-gray-400'
                            }`}
                          />
                          <div>
                            <p className="font-medium text-gray-900 text-sm">
                              {new Date(record.date).toLocaleDateString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                            <p className="text-xs text-gray-600 capitalize">{record.status}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="flex items-center gap-4 text-sm">
                            {record.clock_in && (
                              <span className="text-green-600">
                                In:{' '}
                                {new Date(`2000-01-01T${record.clock_in}`).toLocaleTimeString(
                                  'en-US',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                )}
                              </span>
                            )}
                            {record.clock_out && (
                              <span className="text-red-600">
                                Out:{' '}
                                {new Date(`2000-01-01T${record.clock_out}`).toLocaleTimeString(
                                  'en-US',
                                  {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  }
                                )}
                              </span>
                            )}
                          </div>
                          {record.hours_worked && parseFloat(record.hours_worked) > 0 && (
                            <p className="text-xs text-gray-600 mt-1">
                              {parseFloat(record.hours_worked).toFixed(1)}h worked
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-sm sm:text-base">No attendance records found</p>
                <p className="text-xs sm:text-sm text-gray-400 mt-1">
                  Attendance data will appear here once the staff member clocks in/out
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ClockInOutPage;
