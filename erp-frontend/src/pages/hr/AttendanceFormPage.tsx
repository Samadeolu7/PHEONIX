// Attendance Form Page - Create/Edit attendance records
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowLeft, Clock, Users, Calendar } from 'lucide-react';
import { AttendanceForm } from '../../components/hr/AttendanceForm';
import { hrService } from '../../services/hrService';
import { useToast } from '../../hooks/useToast';
import {
  Attendance,
  CreateAttendanceData,
  UpdateAttendanceData,
  AttendanceStatus,
} from '../../types/hr';

const AttendanceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const isEdit = Boolean(id);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEdit);
  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [staff, setStaff] = useState<Array<{ id: number; name: string; department?: string }>>([]);

  // Form state
  const [formData, setFormData] = useState<CreateAttendanceData>({
    staff: 0,
    date: new Date().toISOString().split('T')[0], // Today's date
    clock_in: '',
    clock_out: '',
    status: AttendanceStatus.PRESENT,
    hours_worked: '0.00',
    overtime_hours: '0.00',
    leave_request: null,
    notes: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load attendance record for editing
  useEffect(() => {
    if (isEdit && id) {
      loadAttendance();
    }
  }, [isEdit, id]);

  // Load staff list
  useEffect(() => {
    loadStaff();
  }, []);

  const loadAttendance = async () => {
    try {
      setInitialLoading(true);
      const response = await hrService.getAttendanceRecord(Number(id));
      setAttendance(response);

      // Populate form with existing data
      setFormData({
        staff: response.staff,
        date: response.date,
        clock_in: response.clock_in || '',
        clock_out: response.clock_out || '',
        status: response.status || AttendanceStatus.PRESENT,
        hours_worked: response.hours_worked || '0.00',
        overtime_hours: response.overtime_hours || '0.00',
        leave_request: response.leave_request,
        notes: response.notes || '',
      });
    } catch (error) {
      console.error('Error loading attendance:', error);
      toast.error('Failed to load attendance record. Please try again.');
      navigate('/hr/attendance');
    } finally {
      setInitialLoading(false);
    }
  };

  const loadStaff = async () => {
    try {
      const staffList = await hrService.getStaffForDropdown();
      setStaff(staffList);

      // If creating new record and only one staff member, auto-select
      if (!isEdit && staffList.length === 1) {
        setFormData(prev => ({ ...prev, staff: staffList[0].id }));
      }
    } catch (error) {
      console.error('Error loading staff:', error);
      toast.error('Failed to load staff list. Please try again.');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.staff) {
      newErrors.staff = 'Staff member is required';
    }

    if (!formData.date) {
      newErrors.date = 'Date is required';
    }

    // Validate clock times if provided
    if (formData.clock_in && formData.clock_out) {
      const clockIn = new Date(`2000-01-01T${formData.clock_in}`);
      const clockOut = new Date(`2000-01-01T${formData.clock_out}`);

      if (clockOut <= clockIn) {
        newErrors.clock_out = 'Clock out time must be after clock in time';
      }
    }

    // Validate hours worked
    if (formData.hours_worked && parseFloat(formData.hours_worked) < 0) {
      newErrors.hours_worked = 'Hours worked cannot be negative';
    }

    if (formData.overtime_hours && parseFloat(formData.overtime_hours) < 0) {
      newErrors.overtime_hours = 'Overtime hours cannot be negative';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      if (isEdit && id) {
        const updateData: UpdateAttendanceData = { ...formData };
        await hrService.updateAttendance(Number(id), updateData);
        toast.success('Attendance record updated successfully!');
      } else {
        await hrService.createAttendance(formData);
        toast.success('Attendance record created successfully!');
      }

      // navigate('/hr/attendance');
    } catch (error: any) {
      console.error('Error saving attendance:', error);

      // Handle validation errors from API
      if (error.response?.data) {
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

      toast.error(
        isEdit
          ? 'Failed to update attendance record. Please try again.'
          : 'Failed to create attendance record. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleFieldChange = (field: keyof CreateAttendanceData, value: any) => {
    const updatedData = { ...formData, [field]: value };

    // Clear error when field is modified
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-calculate hours worked when both clock_in and clock_out are provided
    if (
      (field === 'clock_in' || field === 'clock_out') &&
      updatedData.clock_in &&
      updatedData.clock_out
    ) {
      const clockIn = new Date(`${updatedData.date}T${updatedData.clock_in}`);
      const clockOut = new Date(`${updatedData.date}T${updatedData.clock_out}`);

      if (clockOut > clockIn) {
        const diffMs = clockOut.getTime() - clockIn.getTime();
        const diffHours = diffMs / (1000 * 60 * 60); // Convert milliseconds to hours
        const hoursWorked = Math.round(diffHours * 100) / 100; // Round to 2 decimal places

        // Update form data with both the field change AND the calculated hours
        updatedData.hours_worked = hoursWorked.toString();
      }
    }

    // Set the form data once with all updates
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
