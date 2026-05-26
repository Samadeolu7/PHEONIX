/**
 * Leave Calendar Page — Visual monthly calendar showing approved/pending leave requests
 */
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Users,
  Filter,
  Info,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import hrService from '../../services/hrService';
import { LeaveRequest, LeaveType } from '../../types/hr';

// ─── Color palette for leave types ───────────────────────────────────────
const LEAVE_TYPE_COLORS = [
  { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300', dot: 'bg-blue-500' },
  { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300', dot: 'bg-green-500' },
  {
    bg: 'bg-purple-100',
    text: 'text-purple-800',
    border: 'border-purple-300',
    dot: 'bg-purple-500',
  },
  {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    border: 'border-orange-300',
    dot: 'bg-orange-500',
  },
  { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300', dot: 'bg-pink-500' },
  { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300', dot: 'bg-teal-500' },
  { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', dot: 'bg-amber-500' },
  {
    bg: 'bg-indigo-100',
    text: 'text-indigo-800',
    border: 'border-indigo-300',
    dot: 'bg-indigo-500',
  },
];

const STATUS_OPACITY: Record<string, string> = {
  approved: 'opacity-100',
  taken: 'opacity-100',
  submitted: 'opacity-60',
};

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ─── Helpers ────────────────────────────────────────────────────────────
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}
function fmt(d: Date): string {
  return d.toISOString().split('T')[0];
}
function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const LeaveCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [filterLeaveType, setFilterLeaveType] = useState<number | undefined>(undefined);

  // Compute range — pad to full weeks for the grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = new Date(monthStart);
  calStart.setDate(calStart.getDate() - calStart.getDay()); // back to Sunday
  const calEnd = new Date(monthEnd);
  calEnd.setDate(calEnd.getDate() + (6 - calEnd.getDay())); // forward to Saturday

  // ─── Queries ──────────────────────────────────────────────────────────
  const { data: leaveRequests = [], isLoading } = useQuery({
    queryKey: ['leave-calendar', fmt(monthStart), fmt(monthEnd), filterLeaveType],
    queryFn: () =>
      hrService.getLeaveCalendar(fmt(calStart), fmt(calEnd), {
        leave_type: filterLeaveType,
      }),
  });

  const { data: leaveTypesData } = useQuery({
    queryKey: ['leave-types-all'],
    queryFn: () => hrService.getLeaveTypes(),
  });
  const leaveTypes: LeaveType[] = useMemo(() => {
    if (Array.isArray(leaveTypesData)) return leaveTypesData;
    const data = leaveTypesData as unknown as { results?: LeaveType[] } | undefined;
    return data?.results ?? [];
  }, [leaveTypesData]);

  // Map leave‐type id → color index
  const typeColorMap = useMemo(() => {
    const m: Record<number, number> = {};
    leaveTypes.forEach((lt, i) => {
      m[lt.id] = i % LEAVE_TYPE_COLORS.length;
    });
    return m;
  }, [leaveTypes]);

  // ─── Build calendar grid (array of weeks, each week = 7 days) ────────
  const calStartTime = calStart.getTime();
  const calEndTime = calEnd.getTime();
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    const cursor = new Date(calStartTime);
    const end = new Date(calEndTime);
    while (cursor <= end) {
      const week: Date[] = [];
      for (let i = 0; i < 7; i++) {
        week.push(new Date(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      result.push(week);
    }
    return result;
  }, [calStartTime, calEndTime]);

  // ─── Helper: get leaves for a given day ──────────────────────────────
  function leavesForDay(day: Date): LeaveRequest[] {
    const dStr = fmt(day);
    return leaveRequests.filter(lr => {
      return lr.start_date <= dStr && lr.end_date >= dStr;
    });
  }

  // ─── Stats ────────────────────────────────────────────────────────────
  const todayStr = fmt(new Date());
  const onLeaveToday = leaveRequests.filter(
    lr => lr.start_date <= todayStr && lr.end_date >= todayStr
  );
  const approvedCount = leaveRequests.filter(
    lr => lr.status === 'approved' || lr.status === 'taken'
  ).length;
  const pendingCount = leaveRequests.filter(lr => lr.status === 'submitted').length;

  const today = new Date();
  const monthLabel = currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // ─── Selected day detail ──────────────────────────────────────────────
  const selectedDayLeaves = selectedDay ? leavesForDay(selectedDay) : [];

  return (
    <div className="p-6 space-y-6 max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarIcon className="h-6 w-6" />
            Leave Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Visual overview of employee leave schedules
          </p>
        </div>
        <button
          onClick={() => navigate('/hr/leave-requests')}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
        >
          View List
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{onLeaveToday.length}</p>
            <p className="text-xs text-muted-foreground">On leave today</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
            <CalendarIcon className="h-5 w-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{approvedCount}</p>
            <p className="text-xs text-muted-foreground">Approved leaves this month</p>
          </div>
        </div>
        <div className="bg-white border rounded-lg p-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-yellow-100 flex items-center justify-center">
            <Info className="h-5 w-5 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{pendingCount}</p>
            <p className="text-xs text-muted-foreground">Pending approval</p>
          </div>
        </div>
      </div>

      {/* Controls: Month navigation + filter */}
      <div className="flex items-center justify-between bg-white border rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
            className="p-1.5 rounded hover:bg-gray-100"
            title="Previous month"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold min-w-[180px] text-center">{monthLabel}</h2>
          <button
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 rounded hover:bg-gray-100"
            title="Next month"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCurrentMonth(startOfMonth(new Date()))}
            className="ml-2 px-3 py-1 text-xs rounded bg-gray-100 hover:bg-gray-200"
          >
            Today
          </button>
        </div>

        {/* Leave type filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            className="text-sm border rounded px-2 py-1"
            value={filterLeaveType ?? ''}
            onChange={e => setFilterLeaveType(e.target.value ? Number(e.target.value) : undefined)}
            title="Filter by leave type"
          >
            <option value="">All Leave Types</option>
            {leaveTypes.map(lt => (
              <option key={lt.id} value={lt.id}>
                {lt.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b bg-gray-50">
          {DAY_NAMES.map(d => (
            <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 uppercase">
              {d}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-gray-400">
            Loading calendar…
          </div>
        ) : (
          <div>
            {weeks.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
                {week.map(day => {
                  const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                  const isToday = isSameDay(day, today);
                  const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
                  const dayLeaves = leavesForDay(day);
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;

                  return (
                    <div
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={`min-h-[90px] p-1 border-r last:border-r-0 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 ring-2 ring-blue-400 ring-inset'
                          : isToday
                            ? 'bg-yellow-50'
                            : isWeekend
                              ? 'bg-gray-50'
                              : 'bg-white hover:bg-gray-50'
                      } ${!isCurrentMonth ? 'opacity-40' : ''}`}
                    >
                      {/* Day number */}
                      <div className="flex items-center justify-between px-1">
                        <span
                          className={`text-xs font-medium ${
                            isToday
                              ? 'bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center'
                              : 'text-gray-700'
                          }`}
                        >
                          {day.getDate()}
                        </span>
                        {dayLeaves.length > 0 && (
                          <span className="text-[10px] text-gray-400">{dayLeaves.length}</span>
                        )}
                      </div>

                      {/* Leave chips (max 3 visible) */}
                      <div className="mt-1 space-y-0.5 overflow-hidden">
                        {dayLeaves.slice(0, 3).map(lr => {
                          const ci = typeColorMap[lr.leave_type] ?? 0;
                          const color = LEAVE_TYPE_COLORS[ci];
                          const opacity = STATUS_OPACITY[lr.status] || 'opacity-50';
                          return (
                            <div
                              key={lr.id}
                              title={`${lr.staff_name} — ${lr.leave_type_name} (${lr.status})`}
                              className={`${color.bg} ${color.text} ${opacity} text-[10px] leading-tight px-1 py-0.5 rounded truncate border ${color.border}`}
                            >
                              {lr.staff_name?.split(' ')[0]}
                            </div>
                          );
                        })}
                        {dayLeaves.length > 3 && (
                          <div className="text-[10px] text-gray-400 px-1">
                            +{dayLeaves.length - 3} more
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white border rounded-lg p-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Legend</h3>
        <div className="flex flex-wrap gap-3">
          {leaveTypes.map(lt => {
            const ci = typeColorMap[lt.id] ?? 0;
            const color = LEAVE_TYPE_COLORS[ci];
            return (
              <div key={lt.id} className="flex items-center gap-1.5 text-xs">
                <span className={`h-3 w-3 rounded-full ${color.dot}`} />
                <span className="text-gray-600">{lt.name}</span>
              </div>
            );
          })}
          <div className="flex items-center gap-1.5 text-xs ml-4 pl-4 border-l">
            <span className="opacity-100 text-gray-600">■ Approved</span>
            <span className="opacity-60 text-gray-600 ml-2">■ Pending</span>
          </div>
        </div>
      </div>

      {/* Selected Day Detail Panel */}
      {selectedDay && (
        <div className="bg-white border rounded-lg p-5">
          <h3 className="font-semibold text-sm mb-3">
            {selectedDay.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </h3>
          {selectedDayLeaves.length === 0 ? (
            <p className="text-sm text-gray-400">No leave requests on this day.</p>
          ) : (
            <div className="space-y-2">
              {selectedDayLeaves.map(lr => {
                const ci = typeColorMap[lr.leave_type] ?? 0;
                const color = LEAVE_TYPE_COLORS[ci];
                return (
                  <div
                    key={lr.id}
                    onClick={() => navigate(`/hr/leave-requests/${lr.id}`)}
                    className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm transition ${color.bg} ${color.border}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-3 w-3 rounded-full ${color.dot}`} />
                      <div>
                        <p className="text-sm font-medium">{lr.staff_name}</p>
                        <p className="text-xs text-gray-500">
                          {lr.leave_type_name} {'·'} {lr.start_date} → {lr.end_date} ({lr.num_days}
                          {'·'}days)
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        lr.status === 'approved' || lr.status === 'taken'
                          ? 'bg-green-100 text-green-800'
                          : lr.status === 'submitted'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {lr.status}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeaveCalendarPage;
