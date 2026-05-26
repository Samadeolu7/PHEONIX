// Attendance Form Component - Reusable form for attendance entry
import React from 'react';
import { Clock, Calendar, Users, FileText } from 'lucide-react';
import { AttendanceStatusBadge } from './AttendanceStatusBadge';
import { CreateAttendanceData, AttendanceStatus, getAttendanceStatusLabel } from '../../types/hr';

interface AttendanceFormProps {
  formData: CreateAttendanceData;
  errors: Record<string, string>;
  staff: Array<{ id: number; name: string; department?: string }>;
  onChange: (field: keyof CreateAttendanceData, value: any) => void;
  loading?: boolean;
}

export const AttendanceForm: React.FC<AttendanceFormProps> = ({
  formData,
  errors,
  staff,
  onChange,
  loading = false,
}) => {
  const statusOptions = [
    AttendanceStatus.PRESENT,
    AttendanceStatus.ABSENT,
    AttendanceStatus.LATE,
    AttendanceStatus.HALF_DAY,
    AttendanceStatus.ON_LEAVE,
    AttendanceStatus.PUBLIC_HOLIDAY,
    AttendanceStatus.WEEKEND,
  ];

  return (
    <div className="space-y-6">
      {/* Basic Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Staff Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Users className="h-4 w-4 inline mr-1" />
            Staff Member *
          </label>
          <select
            value={formData.staff || ''}
            onChange={e => onChange('staff', Number(e.target.value))}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.staff ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          >
            <option value="">Select Staff Member</option>
            {staff.map(member => (
              <option key={member.id} value={member.id}>
                {member.name} {member.department && `(${member.department})`}
              </option>
            ))}
          </select>
          {errors.staff && <p className="mt-1 text-sm text-red-600">{errors.staff}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar className="h-4 w-4 inline mr-1" />
            Date *
          </label>
          <input
            type="date"
            value={formData.date}
            onChange={e => onChange('date', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.date ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.date && <p className="mt-1 text-sm text-red-600">{errors.date}</p>}
        </div>
      </div>

      {/* Time Information */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Clock In */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock className="h-4 w-4 inline mr-1" />
            Clock In Time
          </label>
          <input
            type="time"
            value={formData.clock_in || ''}
            onChange={e => onChange('clock_in', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.clock_in ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.clock_in && <p className="mt-1 text-sm text-red-600">{errors.clock_in}</p>}
        </div>

        {/* Clock Out */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock className="h-4 w-4 inline mr-1" />
            Clock Out Time
          </label>
          <input
            type="time"
            value={formData.clock_out || ''}
            onChange={e => onChange('clock_out', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.clock_out ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          />
          {errors.clock_out && <p className="mt-1 text-sm text-red-600">{errors.clock_out}</p>}
        </div>
      </div>

      {/* Status and Hours */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Attendance Status</label>
          <select
            value={formData.status || AttendanceStatus.PRESENT}
            onChange={e => onChange('status', e.target.value as AttendanceStatus)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.status ? 'border-red-300' : 'border-gray-300'
            }`}
            disabled={loading}
          >
            {statusOptions.map(status => (
              <option key={status} value={status}>
                {getAttendanceStatusLabel(status)}
              </option>
            ))}
          </select>
          {formData.status && (
            <div className="mt-2">
              <AttendanceStatusBadge status={formData.status} size="sm" />
            </div>
          )}
          {errors.status && <p className="mt-1 text-sm text-red-600">{errors.status}</p>}
        </div>

        {/* Hours Worked */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Hours Worked</label>
          <div className="relative">
            <input
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={formData.hours_worked || ''}
              onChange={e => onChange('hours_worked', e.target.value)}
              className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                errors.hours_worked
                  ? 'border-red-300'
                  : formData.clock_in && formData.clock_out
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300'
              }`}
              placeholder="8.00"
              disabled={loading}
              readOnly={!!(formData.clock_in && formData.clock_out)}
            />
            {formData.clock_in && formData.clock_out && (
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-green-600 text-xs font-medium">Auto-calculated</span>
              </div>
            )}
          </div>
          {errors.hours_worked && (
            <p className="mt-1 text-sm text-red-600">{errors.hours_worked}</p>
          )}
          {formData.clock_in && formData.clock_out ? (
            <p className="mt-1 text-xs text-green-600">
              ✓ Automatically calculated from clock in/out times
            </p>
          ) : (
            <p className="mt-1 text-xs text-gray-500">
              Enter hours manually or provide clock in/out times for auto-calculation
            </p>
          )}
        </div>

        {/* Overtime Hours */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Overtime Hours</label>
          <input
            type="number"
            step="0.25"
            min="0"
            max="12"
            value={formData.overtime_hours || ''}
            onChange={e => onChange('overtime_hours', e.target.value)}
            className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              errors.overtime_hours ? 'border-red-300' : 'border-gray-300'
            }`}
            placeholder="0.00"
            disabled={loading}
          />
          {errors.overtime_hours && (
            <p className="mt-1 text-sm text-red-600">{errors.overtime_hours}</p>
          )}
        </div>
      </div>

      {/* Leave Request Reference */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Leave Request Reference
        </label>
        <input
          type="number"
          value={formData.leave_request || ''}
          onChange={e => onChange('leave_request', e.target.value ? Number(e.target.value) : null)}
          className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.leave_request ? 'border-red-300' : 'border-gray-300'
          }`}
          placeholder="Leave request ID (if applicable)"
          disabled={loading}
        />
        {errors.leave_request && (
          <p className="mt-1 text-sm text-red-600">{errors.leave_request}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Link to a leave request if this attendance is related to approved leave
        </p>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <FileText className="h-4 w-4 inline mr-1" />
          Notes
        </label>
        <textarea
          value={formData.notes || ''}
          onChange={e => onChange('notes', e.target.value)}
          rows={3}
          className={`w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
            errors.notes ? 'border-red-300' : 'border-gray-300'
          }`}
          placeholder="Additional notes about this attendance record..."
          disabled={loading}
        />
        {errors.notes && <p className="mt-1 text-sm text-red-600">{errors.notes}</p>}
      </div>

      {/* Time Calculation Helper */}
      {formData.clock_in && formData.clock_out && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Time Calculation</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-blue-700 font-medium">Clock In:</span>
              <p className="text-blue-900">{formData.clock_in}</p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Clock Out:</span>
              <p className="text-blue-900">{formData.clock_out}</p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Duration:</span>
              <p className="text-blue-900">
                {(() => {
                  const clockIn = new Date(`${formData.date}T${formData.clock_in}`);
                  const clockOut = new Date(`${formData.date}T${formData.clock_out}`);
                  if (clockOut > clockIn) {
                    const diffMs = clockOut.getTime() - clockIn.getTime();
                    const hours = Math.floor(diffMs / (1000 * 60 * 60));
                    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                    return `${hours}h ${minutes}m`;
                  }
                  return 'Invalid time range';
                })()}
              </p>
            </div>
            <div>
              <span className="text-blue-700 font-medium">Total Hours:</span>
              <p className="text-blue-900 font-semibold">{formData.hours_worked}h</p>
            </div>
          </div>
          {formData.overtime_hours && parseFloat(formData.overtime_hours) > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200">
              <span className="text-blue-700 font-medium text-sm">Overtime Hours: </span>
              <span className="text-blue-900 font-semibold">{formData.overtime_hours}h</span>
            </div>
          )}
        </div>
      )}

      {/* Status-specific Information */}
      {formData.status === AttendanceStatus.ON_LEAVE && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-yellow-900 mb-2">Leave Information</h4>
          <p className="text-sm text-yellow-800">
            This attendance is marked as "On Leave". Make sure to link it to the appropriate leave
            request if one exists, or verify that the leave has been properly approved.
          </p>
        </div>
      )}

      {formData.status === AttendanceStatus.ABSENT && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-900 mb-2">Absence Information</h4>
          <p className="text-sm text-red-800">
            This attendance is marked as "Absent". Consider adding notes to explain the reason for
            absence and whether it's authorized or unauthorized.
          </p>
        </div>
      )}
    </div>
  );
};
