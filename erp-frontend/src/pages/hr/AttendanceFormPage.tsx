// Attendance Form Page - Create/Edit attendance records
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Clock, Users, Calendar } from 'lucide-react';
import { AttendanceForm } from '../../components/hr/AttendanceForm';
import {
  useAttendanceRecord,
  useStaffForDropdown,
  useCreateAttendance,
  useUpdateAttendance,
} from '../../hooks/useHR';
import { CreateAttendanceData, UpdateAttendanceData, AttendanceStatus } from '../../types/hr';

const AttendanceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const isEdit = Boolean(id);
  const { data: attendance, isLoading: initialLoading } = useAttendanceRecord(
    isEdit ? Number(id) : 0
  );
  const { data: staffDropdownData } = useStaffForDropdown();
  const createMutation = useCreateAttendance();
  const updateMutation = useUpdateAttendance();

  const [formData, setFormData] = useState<CreateAttendanceData>({
    staff: 0,
    date: new Date().toISOString().split('T')[0],
    clock_in: '',
    clock_out: '',
    status: AttendanceStatus.PRESENT,
    hours_worked: '0.00',
    overtime_hours: '0.00',
    leave_request: null,
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when attendance data loads (edit mode)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (attendance && isEdit) {
      setFormData({
        staff: attendance.staff,
        date: attendance.date,
        clock_in: attendance.clock_in || '',
        clock_out: attendance.clock_out || '',
        status: attendance.status || AttendanceStatus.PRESENT,
        hours_worked: attendance.hours_worked || '0.00',
        overtime_hours: attendance.overtime_hours || '0.00',
        leave_request: attendance.leave_request,
        notes: attendance.notes || '',
      });
    }
  }, [attendance, isEdit]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Auto-select staff if only one and creating new
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (staffDropdownData && !isEdit && staffDropdownData.length === 1 && formData.staff === 0) {
      setFormData(prev => ({ ...prev, staff: staffDropdownData[0].id }));
    }
  }, [staffDropdownData, isEdit, formData.staff]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const staff = staffDropdownData || [];
  const loading = createMutation.isPending || updateMutation.isPending;

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.staff) {
      newErrors.staff = 'Staff member is required';
    }

    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    if (formData.clock_in && formData.clock_out) {
      const clockIn = new Date(`2000-01-01T${formData.clock_in}`);
      const clockOut = new Date(`2000-01-01T${formData.clock_out}`);

      if (clockOut <= clockIn) {
        newErrors.clock_out = 'Clock out time must be after clock in time';
      }
    }

    if (formData.hours_worked && parseFloat(formData.hours_worked) < 0) {
      newErrors.hours_worked = 'Hours worked cannot be negative';
    }

    if (formData.overtime_hours && parseFloat(formData.overtime_hours) < 0) {
      newErrors.overtime_hours = 'Overtime hours cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleApiErrors = (error: any) => {
    if (error?.response?.data) {
      const apiErrors: Record<string, string> = {};
      Object.entries(error.response.data).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          apiErrors[key] = value[0];
        } else {
          apiErrors[key] = String(value);
        }
      });
      setErrors(apiErrors);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    if (isEdit && id) {
      const updateData: UpdateAttendanceData = { ...formData };
      updateMutation.mutate(
        { id: Number(id), data: updateData },
        {
          onError: handleApiErrors,
        }
      );
    } else {
      createMutation.mutate(formData, {
        onError: handleApiErrors,
      });
    }
  };

  const handleFieldChange = (field: keyof CreateAttendanceData, value: any) => {
    const updatedData = { ...formData, [field]: value };

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    if (
      (field === 'clock_in' || field === 'clock_out') &&
      updatedData.clock_in &&
      updatedData.clock_out
    ) {
      const clockIn = new Date(`${updatedData.date}T${updatedData.clock_in}`);
      const clockOut = new Date(`${updatedData.date}T${updatedData.clock_out}`);

      if (clockOut > clockIn) {
        const diffMs = clockOut.getTime() - clockIn.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        const hoursWorked = Math.round(diffHours * 100) / 100;
        updatedData.hours_worked = hoursWorked.toString();
      }
    }

    setFormData(updatedData);
  };

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
              onClick={() => navigate('/hr/attendance')}
              className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {isEdit ? 'Edit Attendance Record' : 'Add Attendance Record'}
              </h1>
              <p className="text-gray-600">
                {isEdit
                  ? `Update attendance record for ${attendance?.staff_name}`
                  : 'Create a new attendance record'}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Users className="h-8 w-8 text-blue-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Total Staff</p>
                <p className="text-xl font-semibold text-gray-900">{staff.length}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-green-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Selected Date</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formData.date ? new Date(formData.date).toLocaleDateString() : 'Not set'}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-orange-600" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500">Hours Worked</p>
                <p className="text-xl font-semibold text-gray-900">
                  {formData.hours_worked ? `${formData.hours_worked}h` : '0h'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Attendance Details</h2>
          </div>

          <form onSubmit={handleSubmit} className="p-6">
            <AttendanceForm
              formData={formData}
              errors={errors}
              staff={staff}
              onChange={handleFieldChange}
              loading={loading}
            />

            {/* Form Actions */}
            <div className="flex justify-end space-x-3 pt-6 border-t border-gray-200">
              <button
                type="button"
                onClick={() => navigate('/hr/attendance')}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors duration-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
              >
                {loading ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isEdit ? 'Update Attendance' : 'Create Attendance'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default AttendanceFormPage;
