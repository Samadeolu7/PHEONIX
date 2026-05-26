// Attendance Detail Page - View attendance details with edit/delete actions
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Edit,
  Trash2,
  Clock,
  Calendar,
  Users,
  FileText,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { AttendanceStatusBadge } from '../../components/hr/AttendanceStatusBadge';
import { hrService } from '../../services/hrService';
import { useToast } from '../../hooks/useToast';
import { Attendance, AttendanceStatus } from '../../types/hr';

const AttendanceDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [attendance, setAttendance] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      loadAttendance();
    }
  }, [id]);

  const loadAttendance = async () => {
    try {
      setLoading(true);
      const response = await hrService.getAttendanceRecord(Number(id));
      setAttendance(response);
    } catch (error) {
      console.error('Error loading attendance:', error);
      showToast('Failed to load attendance record', 'error');
      navigate('/hr/attendance');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!attendance) return;

    const confirmed = window.confirm(
      `Are you sure you want to delete this attendance record for ${attendance.staff_name} on ${new Date(attendance.date).toLocaleDateString()}?`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);
      await hrService.deleteAttendance(attendance.id);
      showToast('Attendance record deleted successfully', 'success');
      navigate('/hr/attendance');
    } catch (error) {
      console.error('Error deleting attendance:', error);
      showToast('Failed to delete attendance record', 'error');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!attendance) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Attendance Record Not Found</h2>
          <p className="text-gray-600 mb-4">
            The attendance record you're looking for doesn't exist.
          </p>
          <Link
            to="/hr/attendance"
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors duration-200"
          >
            Back to Attendance List
          </Link>
        </div>
      </div>
    );
  }

  const formatTime = (time: string | null) => {
    if (!time) return '-';
    return new Date(`2000-01-01T${time}`).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateWorkDuration = () => {
    if (!attendance.clock_in || !attendance.clock_out) return null;

    const clockIn = new Date(`2000-01-01T${attendance.clock_in}`);
    const clockOut = new Date(`2000-01-01T${attendance.clock_out}`);
    const diffMs = clockOut.getTime() - clockIn.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    const hours = Math.floor(diffHours);
    const minutes = Math.round((diffHours - hours) * 60);

    return `${hours}h ${minutes}m`;
  };

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
              <h1 className="text-2xl font-bold text-gray-900">Attendance Details</h1>
              <p className="text-gray-600">
                {attendance.staff_name} - {new Date(attendance.date).toLocaleDateString()}
              </p>
            </div>
          </div>

          <div className="flex space-x-3">
            <Link
              to={`/hr/attendance/${attendance.id}/edit`}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors duration-200 flex items-center"
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Link>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex items-center"
            >
              {deleting ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete
            </button>
          </div>
        </div>

        {/* Status Overview */}
        <div className="bg-white rounded-lg shadow mb-6 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Attendance Status</h2>
            <AttendanceStatusBadge status={attendance.status!} size="lg" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Calendar className="h-8 w-8 text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Date</p>
              <p className="text-lg font-semibold text-gray-900">
                {new Date(attendance.date).toLocaleDateString()}
              </p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Clock In</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatTime(attendance.clock_in)}
              </p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <Clock className="h-8 w-8 text-orange-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Clock Out</p>
              <p className="text-lg font-semibold text-gray-900">
                {formatTime(attendance.clock_out)}
              </p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <CheckCircle className="h-8 w-8 text-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-500">Duration</p>
              <p className="text-lg font-semibold text-gray-900">
                {calculateWorkDuration() || '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Detailed Information */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Staff Information */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Users className="h-5 w-5 mr-2" />
                Staff Information
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-500">Staff Member</label>
                <p className="mt-1 text-sm text-gray-900">{attendance.staff_name}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500">Staff ID</label>
                <p className="mt-1 text-sm text-gray-900">#{attendance.staff}</p>
              </div>
            </div>
          </div>

          {/* Time Information */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                Time Information
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-500">Hours Worked</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {attendance.hours_worked ? `${attendance.hours_worked} hours` : 'Not recorded'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-500">Overtime Hours</label>
                  <p className="mt-1 text-sm text-gray-900">
                    {attendance.overtime_hours && parseFloat(attendance.overtime_hours) > 0
                      ? `${attendance.overtime_hours} hours`
                      : 'None'}
                  </p>
                </div>
              </div>

              {attendance.leave_request && (
                <div>
                  <label className="block text-sm font-medium text-gray-500">Leave Request</label>
                  <p className="mt-1 text-sm text-gray-900">
                    <Link
                      to={`/hr/leave-requests/${attendance.leave_request}/view`}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Leave Request #{attendance.leave_request}
                    </Link>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notes Section */}
        {attendance.notes && (
          <div className="mt-6 bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Notes
              </h3>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{attendance.notes}</p>
            </div>
          </div>
        )}

        {/* Status-specific Information */}
        {attendance.status === AttendanceStatus.LATE && (
          <div className="mt-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-orange-600 mr-2" />
              <h4 className="text-sm font-medium text-orange-900">Late Arrival</h4>
            </div>
            <p className="mt-2 text-sm text-orange-800">
              This employee arrived late on this date. Consider reviewing attendance policies and
              discussing punctuality if this becomes a pattern.
            </p>
          </div>
        )}

        {attendance.status === AttendanceStatus.ABSENT && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center">
              <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
              <h4 className="text-sm font-medium text-red-900">Absence</h4>
            </div>
            <p className="mt-2 text-sm text-red-800">
              This employee was absent on this date. Verify if this absence was authorized and
              properly documented according to company policies.
            </p>
          </div>
        )}

        {attendance.status === AttendanceStatus.ON_LEAVE && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-blue-600 mr-2" />
              <h4 className="text-sm font-medium text-blue-900">On Leave</h4>
            </div>
            <p className="mt-2 text-sm text-blue-800">
              This employee was on approved leave on this date.
              {attendance.leave_request && (
                <span> This is linked to leave request #{attendance.leave_request}.</span>
              )}
            </p>
          </div>
        )}

        {/* Metadata */}
        <div className="mt-6 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Record Information</h3>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <label className="block font-medium text-gray-500">Created At</label>
                <p className="mt-1 text-gray-900">
                  {new Date(attendance.created_at).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block font-medium text-gray-500">Last Updated</label>
                <p className="mt-1 text-gray-900">
                  {new Date(attendance.updated_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AttendanceDetailPage;
