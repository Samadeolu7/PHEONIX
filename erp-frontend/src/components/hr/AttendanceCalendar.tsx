// Attendance Calendar Component - Calendar view of attendance
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Users } from 'lucide-react';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { useAttendanceList } from '../../hooks/useHR';
import { AttendanceStatus } from '../../types/hr';

interface AttendanceCalendarProps {
  staffId?: number;
  onDateSelect?: (date: string) => void;
  selectedDate?: string;
}

export const AttendanceCalendar: React.FC<AttendanceCalendarProps> = ({
  staffId,
  onDateSelect,
  selectedDate,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());

  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const firstDayOfCalendar = new Date(firstDayOfMonth);
  firstDayOfCalendar.setDate(firstDayOfCalendar.getDate() - firstDayOfMonth.getDay());

  const lastDayOfCalendar = new Date(lastDayOfMonth);
  lastDayOfCalendar.setDate(lastDayOfCalendar.getDate() + (6 - lastDayOfMonth.getDay()));

  const { data: response, isLoading: loading } = useAttendanceList({
    staff: staffId,
    date_from: firstDayOfCalendar.toISOString().split('T')[0],
    date_to: lastDayOfCalendar.toISOString().split('T')[0],
  });

  const attendance = response?.results || [];

  const navigateMonth = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const getAttendanceForDate = (date: Date): Attendance[] => {
    const dateStr = date.toISOString().split('T')[0];
    return attendance.filter(a => a.date === dateStr);
  };

  const getDayStatus = (date: Date): AttendanceStatus | null => {
    const dayAttendance = getAttendanceForDate(date);
    if (dayAttendance.length === 0) return null;

    // If multiple records for the same day, prioritize certain statuses
    const statusPriority = [
      AttendanceStatus.PRESENT,
      AttendanceStatus.LATE,
      AttendanceStatus.HALF_DAY,
      AttendanceStatus.ON_LEAVE,
      AttendanceStatus.PUBLIC_HOLIDAY,
      AttendanceStatus.WEEKEND,
      AttendanceStatus.ABSENT,
    ];

    for (const status of statusPriority) {
      if (dayAttendance.some(a => a.status === status)) {
        return status;
      }
    }

    return dayAttendance[0].status!;
  };

  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth();
  };

  const isSelectedDate = (date: Date): boolean => {
    if (!selectedDate) return false;
    return date.toISOString().split('T')[0] === selectedDate;
  };

  const handleDateClick = (date: Date) => {
    const dateStr = date.toISOString().split('T')[0];
    onDateSelect?.(dateStr);
  };

  // Generate calendar days
  const calendarDays: Date[] = [];
  const current = new Date(firstDayOfCalendar);
  while (current <= lastDayOfCalendar) {
    calendarDays.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  const monthNames = [
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

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex items-center">
          <Calendar className="h-5 w-5 text-gray-600 mr-2" />
          <h3 className="text-lg font-semibold text-gray-900">
            {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={() => navigateMonth('prev')}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            disabled={loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setCurrentDate(new Date())}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            disabled={loading}
          >
            Today
          </button>
          <button
            onClick={() => navigateMonth('next')}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            disabled={loading}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-4">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        )}

        {!loading && (
          <>
            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {dayNames.map(day => (
                <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar Days */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((date, index) => {
                const dayStatus = getDayStatus(date);
                const dayAttendance = getAttendanceForDate(date);
                const isCurrentMonthDay = isCurrentMonth(date);
                const isTodayDate = isToday(date);
                const isSelected = isSelectedDate(date);

                return (
                  <div
                    key={index}
                    onClick={() => handleDateClick(date)}
                    className={`
                      relative p-2 min-h-[60px] border border-gray-200 rounded-lg cursor-pointer
                      transition-colors duration-200 hover:bg-gray-50
                      ${!isCurrentMonthDay ? 'bg-gray-50 text-gray-400' : 'bg-white'}
                      ${isTodayDate ? 'ring-2 ring-blue-500' : ''}
                      ${isSelected ? 'bg-blue-50 border-blue-300' : ''}
                    `}
                  >
                    {/* Date Number */}
                    <div className={`text-sm font-medium ${isTodayDate ? 'text-blue-600' : ''}`}>
                      {date.getDate()}
                    </div>

                    {/* Attendance Status */}
                    {dayStatus && isCurrentMonthDay && (
                      <div className="mt-1">
                        <AttendanceStatusBadge status={dayStatus} size="sm" />
                      </div>
                    )}

                    {/* Multiple Records Indicator */}
                    {dayAttendance.length > 1 && (
                      <div className="absolute top-1 right-1">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      </div>
                    )}

                    {/* Staff Count (if not filtered by staff) */}
                    {!staffId && dayAttendance.length > 0 && (
                      <div className="absolute bottom-1 right-1 text-xs text-gray-500">
                        <Users className="h-3 w-3 inline mr-1" />
                        {dayAttendance.length}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Legend */}
      <div className="border-t border-gray-200 p-4">
        <h4 className="text-sm font-medium text-gray-900 mb-3">Status Legend</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="flex items-center">
            <AttendanceStatusBadge status={AttendanceStatus.PRESENT} size="sm" />
          </div>
          <div className="flex items-center">
            <AttendanceStatusBadge status={AttendanceStatus.ABSENT} size="sm" />
          </div>
          <div className="flex items-center">
            <AttendanceStatusBadge status={AttendanceStatus.LATE} size="sm" />
          </div>
          <div className="flex items-center">
            <AttendanceStatusBadge status={AttendanceStatus.ON_LEAVE} size="sm" />
          </div>
        </div>

        {!staffId && (
          <div className="mt-2 text-xs text-gray-500">
            <Users className="h-3 w-3 inline mr-1" />
            Numbers show staff count for each day
          </div>
        )}
      </div>
    </div>
  );
};
