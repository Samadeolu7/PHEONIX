import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, User, MapPin } from 'lucide-react';
import {
  useCurrentAttendanceStatus,
  useMyClockStatus,
  useClockIn,
  useClockOut,
  clockErrorMessage,
} from '../../hooks/useClock';
import { getDevicePosition, localDateString } from '../../utils/geolocation';
import { ManualLink } from '../help';

interface ClockInOutWidgetProps {
  /**
   * Staff member to clock (HR use; needs attendance permission). Omit to
   * clock the signed-in user themselves.
   */
  staffId?: number;
  staffName?: string;
  compact?: boolean;
  selectedDate?: string;
}

const formatClockTime = (date: string, time: string | null | undefined) =>
  time
    ? new Date(`${date}T${time}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

const ClockInOutWidget: React.FC<ClockInOutWidgetProps> = ({
  staffId,
  staffName,
  compact = false,
  selectedDate,
}) => {
  const selfMode = !staffId;
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationError, setLocationError] = useState<string | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);

  const today = localDateString();
  const workingDate = selectedDate || today;
  const isToday = workingDate === today;

  const staffStatus = useCurrentAttendanceStatus(staffId || 0, workingDate);
  const myStatus = useMyClockStatus(selfMode);
  const clockInMutation = useClockIn();
  const clockOutMutation = useClockOut();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Self mode: an open record (possibly last night's shift) wins over today's.
  const record = selfMode
    ? myStatus.data?.open_record || myStatus.data?.today || null
    : staffStatus.data || null;
  const isLoading = selfMode ? myStatus.isLoading : staffStatus.isLoading;
  const isClocked = selfMode
    ? Boolean(myStatus.data?.is_clocked_in)
    : Boolean(record?.clock_in && !record?.clock_out);
  const doneForToday = Boolean(record?.clock_in && record?.clock_out);
  const displayName = staffName || (selfMode ? myStatus.data?.staff?.name : undefined);
  const branch = selfMode ? myStatus.data?.branch : null;
  const profileMissing = selfMode && myStatus.isError;
  const hoursWorked = record?.hours_worked ? parseFloat(record.hours_worked) : 0;
  const busy = clockInMutation.isPending || clockOutMutation.isPending || fetchingLocation;

  const handleClock = async () => {
    setLocationError(null);
    clockInMutation.reset();
    clockOutMutation.reset();
    setFetchingLocation(true);
    try {
      const position = await getDevicePosition();
      setLastAccuracy(Math.round(position.accuracy));
      const payload = {
        ...(staffId ? { staff: staffId } : {}),
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
      };
      if (isClocked) clockOutMutation.mutate(payload);
      else clockInMutation.mutate(payload);
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Failed to get location');
    } finally {
      setFetchingLocation(false);
    }
  };

  const serverError =
    (clockInMutation.isError && clockErrorMessage(clockInMutation.error, 'Clock in failed')) ||
    (clockOutMutation.isError && clockErrorMessage(clockOutMutation.error, 'Clock out failed')) ||
    null;

  const buttonDisabled = busy || !isToday || profileMissing || (doneForToday && !isClocked);
  const buttonLabel =
    doneForToday && !isClocked ? 'Done for today' : isClocked ? 'Clock Out' : 'Clock In';

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const errors = (
    <>
      {profileMissing && (
        <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-xs sm:text-sm text-yellow-800">
          {clockErrorMessage(myStatus.error, 'No staff profile is linked to your account.')} Ask HR
          to link your login to your staff record.
        </div>
      )}
      {locationError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs sm:text-sm text-red-800">{locationError}</p>
        </div>
      )}
      {serverError && !locationError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs sm:text-sm text-red-800 font-medium">Clock In/Out Failed</p>
          <p className="text-xs sm:text-sm text-red-700 mt-1">{serverError}</p>
        </div>
      )}
    </>
  );

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium">{isClocked ? 'Clocked In' : 'Clocked Out'}</span>
          </div>
          <button
            onClick={handleClock}
            disabled={buttonDisabled}
            className={`px-3 py-1 rounded text-sm font-medium disabled:opacity-50 ${
              isClocked
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {fetchingLocation ? 'Getting location...' : buttonLabel}
          </button>
        </div>
        {record?.clock_in && (
          <div className="mt-2 text-xs text-gray-500">
            In: {formatClockTime(record.date, record.clock_in)}
            {record.clock_out && ` • Out: ${formatClockTime(record.date, record.clock_out)}`}
            {hoursWorked > 0 && ` • ${hoursWorked.toFixed(1)}h worked`}
          </div>
        )}
        {errors}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 sm:mb-6">
        <div className="p-2 bg-blue-100 rounded-lg">
          <Clock className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">Time Clock</h3>
          {displayName && (
            <p className="text-xs sm:text-sm text-gray-600 flex items-center gap-1 truncate">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{displayName}</span>
            </p>
          )}
          <ManualLink
            topic="howto-attendance-location"
            className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
          >
            How does clock-in work?
          </ManualLink>
        </div>
      </div>

      {/* Current Time Display */}
      <div className="text-center mb-4 sm:mb-6">
        {isToday ? (
          <>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
              {currentTime.toLocaleTimeString('en-US', {
                hour12: true,
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              {currentTime.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
          </>
        ) : (
          <>
            <div className="text-lg sm:text-2xl font-bold text-blue-600 mb-1">
              {new Date(`${workingDate}T00:00:00`).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </div>
            <div className="text-xs sm:text-sm text-blue-600 bg-blue-50 px-3 py-1 rounded-full inline-block">
              Historical Date
            </div>
          </>
        )}
      </div>

      {/* Status Display */}
      <div className="mb-4 sm:mb-6">
        <div
          className={`flex items-center justify-center gap-2 p-3 rounded-lg ${
            isClocked ? 'bg-green-50 text-green-800' : 'bg-gray-50 text-gray-600'
          }`}
        >
          {isClocked ? (
            <>
              <LogIn className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="font-medium text-sm sm:text-base">Currently Clocked In</span>
            </>
          ) : (
            <>
              <LogOut className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
              <span className="font-medium text-sm sm:text-base">Currently Clocked Out</span>
            </>
          )}
        </div>
        {branch && (
          <p className="mt-2 flex items-center justify-center gap-1 text-xs text-gray-500">
            <MapPin className="h-3 w-3" />
            {branch.has_location
              ? `Must be within ${branch.attendance_radius_meters ?? 1500} m of ${branch.name}`
              : `${branch.name} has no office location set — location isn't checked`}
          </p>
        )}
      </div>

      {/* Date Summary */}
      {record && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-3">
            {record.date === today
              ? "Today's Summary"
              : `Summary for ${new Date(`${record.date}T00:00:00`).toLocaleDateString()}`}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
            <div>
              <p className="text-gray-600">Clock In</p>
              <p className="font-medium text-xs sm:text-sm">
                {formatClockTime(record.date, record.clock_in) || 'Not clocked in'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Clock Out</p>
              <p className="font-medium text-xs sm:text-sm">
                {formatClockTime(record.date, record.clock_out) || 'Not clocked out'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Hours Worked</p>
              <p className="font-medium text-xs sm:text-sm">
                {hoursWorked > 0 ? `${hoursWorked.toFixed(1)}h` : '0h'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Status</p>
              <p
                className={`font-medium capitalize text-xs sm:text-sm ${
                  record.status === 'present'
                    ? 'text-green-600'
                    : record.status === 'late'
                      ? 'text-orange-600'
                      : 'text-gray-600'
                }`}
              >
                {record.status?.replace('_', ' ')}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Button - Mobile Optimized */}
      <button
        onClick={handleClock}
        disabled={buttonDisabled}
        className={`w-full py-4 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation ${
          isClocked
            ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
            : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
        }`}
        style={{ minHeight: '48px' }} // Ensure minimum touch target size
      >
        {busy ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span className="text-sm sm:text-base">
              {fetchingLocation ? 'Getting location...' : 'Processing...'}
            </span>
          </div>
        ) : (
          <>
            {isClocked ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            <span>{buttonLabel}</span>
          </>
        )}
      </button>

      {lastAccuracy !== null && (
        <p className="mt-2 text-center text-xs text-gray-400">
          Last location fix accurate to about ±{lastAccuracy} m
        </p>
      )}

      {errors}

      {!isToday && (
        <div className="mt-3 text-center">
          <p className="text-xs sm:text-sm text-gray-500">
            Clock in/out is only available for today&apos;s date.
            <br className="hidden sm:inline" />
            <span className="sm:hidden"> </span>
            Use the attendance form to record historical attendance.
          </p>
        </div>
      )}
    </div>
  );
};

export default ClockInOutWidget;
