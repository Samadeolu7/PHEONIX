import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, MapPin } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import ClockInOutWidget from '../../components/hr/ClockInOutWidget';
import { hrService } from '../../services/hrService';
import { useAuth } from '../../contexts/AuthContext';

/** Any staff member's own clock in / clock out, plus their recent days. */
const MyClockPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isDirectorPlus } = useAuth();
  const canSetLocations = Boolean(isDirectorPlus || user?.is_system_admin || user?.is_owner);

  const { data: attendance = [] } = useQuery({
    queryKey: ['my-attendance'],
    queryFn: () => hrService.getMyAttendance(),
    retry: false,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">My Clock In / Out</h1>
            <p className="text-sm text-gray-600">
              Your location is checked against your branch&apos;s office location.
            </p>
          </div>
          {canSetLocations && (
            <button
              onClick={() => navigate('/admin/office-locations')}
              className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"
            >
              <MapPin className="h-4 w-4" /> Office locations
            </button>
          )}
        </div>

        <ClockInOutWidget />

        <div className="mt-6 bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">My recent attendance</h3>
          </div>
          {attendance.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">No attendance records yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">In</th>
                    <th className="text-left px-4 py-2 font-medium">Out</th>
                    <th className="text-right px-4 py-2 font-medium">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.slice(0, 14).map(a => (
                    <tr key={a.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap">{a.date}</td>
                      <td className="px-4 py-2">{a.clock_in?.slice(0, 5) || '—'}</td>
                      <td className="px-4 py-2">{a.clock_out?.slice(0, 5) || '—'}</td>
                      <td className="px-4 py-2 text-right">
                        {a.hours_worked && parseFloat(a.hours_worked) > 0
                          ? parseFloat(a.hours_worked).toFixed(1)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MyClockPage;
