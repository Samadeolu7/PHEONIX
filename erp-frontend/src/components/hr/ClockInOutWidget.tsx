import React, { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, User } from 'lucide-react';
import { useCurrentAttendanceStatus, useClockIn, useClockOut } from '../../hooks/useClock';

interface ClockInOutWidgetProps {
  staffId: number;
  staffName?: string;
  compact?: boolean;
  selectedDate?: string;
}

const ClockInOutWidget: React.FC<ClockInOutWidgetProps> = ({
  staffId,
  staffName,
  compact = false,
  selectedDate,
}) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [locationError, setLocationError] = useState<string | null>(null);
  const [fetchingLocation, setFetchingLocation] = useState(false);

  // Use selectedDate or default to today
  const workingDate = selectedDate || new Date().toISOString().split('T')[0];
  const isToday = workingDate === new Date().toISOString().split('T')[0];

  const { data: currentStatus, isLoading } = useCurrentAttendanceStatus(staffId, workingDate);
  const clockInMutation = useClockIn();
  const clockOutMutation = useClockOut();

  // Update current time every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const getCurrentLocation = (): Promise<{ latitude: number; longitude: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by your browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        position => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        error => {
          switch (error.code) {
            case error.PERMISSION_DENIED:
              reject(
                new Error(
                  'Location permission denied. Please enable location access in your browser settings.'
                )
              );
              break;
            case error.POSITION_UNAVAILABLE:
              reject(
                new Error('Location information is unavailable. Please check your GPS settings.')
              );
              break;
            case error.TIMEOUT:
              reject(new Error('Location request timed out. Please try again.'));
              break;
            default:
              reject(new Error('An unknown error occurred while fetching location.'));
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        }
      );
    });
  };

  const handleClockIn = async () => {
    setLocationError(null);
    setFetchingLocation(true);

    try {
      const location = await getCurrentLocation();
      clockInMutation.mutate({
        staff: staffId,
        date: workingDate,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Failed to get location');
    } finally {
      setFetchingLocation(false);
    }
  };

  const handleClockOut = async () => {
    setLocationError(null);
    setFetchingLocation(true);

    try {
      const location = await getCurrentLocation();
      clockOutMutation.mutate({
        staff: staffId,
        date: workingDate,
        latitude: location.latitude,
        longitude: location.longitude,
      });
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : 'Failed to get location');
    } finally {
      setFetchingLocation(false);
    }
  };

  const formatTime = (time: Date) => {
    return time.toLocaleTimeString('en-US', {
      hour12: true,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDate = (time: Date) => {
    return time.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const isClocked = currentStatus?.clock_in && !currentStatus?.clock_out;
  const hoursWorked = currentStatus?.hours_worked ? parseFloat(currentStatus.hours_worked) : 0;

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

  if (compact) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium">{isClocked ? 'Clocked In' : 'Clocked Out'}</span>
          </div>
          <button
            onClick={isClocked ? handleClockOut : handleClockIn}
            disabled={clockInMutation.isPending || clockOutMutation.isPending || fetchingLocation}
            className={`px-3 py-1 rounded text-sm font-medium disabled:opacity-50 ${
              isClocked
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {fetchingLocation ? 'Getting location...' : isClocked ? 'Clock Out' : 'Clock In'}
          </button>
        </div>
        {currentStatus?.clock_in && (
          <div className="mt-2 text-xs text-gray-500">
            In: {new Date(`${currentStatus.date}T${currentStatus.clock_in}`).toLocaleTimeString()}
            {hoursWorked > 0 && ` • ${hoursWorked.toFixed(1)}h worked`}
          </div>
        )}
        {locationError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            {locationError}
          </div>
        )}
        {(clockInMutation.isError || clockOutMutation.isError) && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-800">
            {clockInMutation.error?.message || clockOutMutation.error?.message}
          </div>
        )}
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
          {staffName && (
            <p className="text-xs sm:text-sm text-gray-600 flex items-center gap-1 truncate">
              <User className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{staffName}</span>
            </p>
          )}
        </div>
      </div>

      {/* Current Time Display */}
      <div className="text-center mb-4 sm:mb-6">
        {isToday ? (
          <>
            <div className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">
              {formatTime(currentTime)}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">{formatDate(currentTime)}</div>
          </>
        ) : (
          <>
            <div className="text-lg sm:text-2xl font-bold text-blue-600 mb-1">
              {new Date(workingDate).toLocaleDateString('en-US', {
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
      </div>

      {/* Date Summary */}
      {currentStatus && (
        <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-gray-50 rounded-lg">
          <h4 className="text-xs sm:text-sm font-medium text-gray-700 mb-3">
            {isToday
              ? "Today's Summary"
              : `Summary for ${new Date(workingDate).toLocaleDateString()}`}
          </h4>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 text-xs sm:text-sm">
            <div>
              <p className="text-gray-600">Clock In</p>
              <p className="font-medium text-xs sm:text-sm">
                {currentStatus.clock_in
                  ? new Date(`${currentStatus.date}T${currentStatus.clock_in}`).toLocaleTimeString(
                      [],
                      {
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )
                  : 'Not clocked in'}
              </p>
            </div>
            <div>
              <p className="text-gray-600">Clock Out</p>
              <p className="font-medium text-xs sm:text-sm">
                {currentStatus.clock_out
                  ? new Date(`${currentStatus.date}T${currentStatus.clock_out}`).toLocaleTimeString(
                      [],
                      {
                        hour: '2-digit',
                        minute: '2-digit',
                      }
                    )
                  : 'Not clocked out'}
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
                  currentStatus.status === 'present'
                    ? 'text-green-600'
                    : currentStatus.status === 'late'
                      ? 'text-orange-600'
                      : 'text-gray-600'
                }`}
              >
                {currentStatus.status}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Button - Mobile Optimized */}
      <button
        onClick={isClocked ? handleClockOut : handleClockIn}
        disabled={
          clockInMutation.isPending || clockOutMutation.isPending || fetchingLocation || !isToday
        }
        className={`w-full py-4 px-4 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base sm:text-lg touch-manipulation ${
          isClocked
            ? 'bg-red-600 text-white hover:bg-red-700 active:bg-red-800'
            : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
        }`}
        style={{ minHeight: '48px' }} // Ensure minimum touch target size
      >
        {clockInMutation.isPending || clockOutMutation.isPending || fetchingLocation ? (
          <div className="flex items-center gap-2">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            <span className="text-sm sm:text-base">
              {fetchingLocation ? 'Getting location...' : 'Processing...'}
            </span>
          </div>
        ) : (
          <>
            {isClocked ? <LogOut className="h-5 w-5" /> : <LogIn className="h-5 w-5" />}
            <span>{isClocked ? 'Clock Out' : 'Clock In'}</span>
          </>
        )}
      </button>

      {/* Location Error Display */}
      {locationError && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs sm:text-sm text-red-800">{locationError}</p>
        </div>
      )}

      {/* Distance Error Display from Backend */}
      {(clockInMutation.isError || clockOutMutation.isError) && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs sm:text-sm text-red-800 font-medium">Clock In/Out Failed</p>
          <p className="text-xs sm:text-sm text-red-700 mt-1">
            {clockInMutation.error?.message ||
              clockOutMutation.error?.message ||
              'An error occurred'}
          </p>
        </div>
      )}

      {!isToday && (
        <div className="mt-3 text-center">
          <p className="text-xs sm:text-sm text-gray-500">
            Clock in/out is only available for today's date.
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
