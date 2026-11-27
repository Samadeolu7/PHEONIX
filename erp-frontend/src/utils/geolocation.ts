export interface DevicePosition {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in meters, as reported by the device. */
  accuracy: number;
}

/**
 * Read the device's current position. A phone's first fix is often coarse
 * (cell towers / Wi-Fi) and sharpens over a few seconds, so this watches
 * for up to `maxWaitMs` and resolves with the most accurate reading seen,
 * stopping early once one is better than `goodEnoughM`.
 */
export function getDevicePosition({
  maxWaitMs = 6000,
  goodEnoughM = 30,
}: { maxWaitMs?: number; goodEnoughM?: number } = {}): Promise<DevicePosition> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location is not supported by this browser.'));
      return;
    }

    let best: DevicePosition | null = null;
    let settled = false;
    let watchId: number | null = null;

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best);
      else reject(err || new Error('Could not get your location. Please try again.'));
    };

    const timer = setTimeout(
      () => finish(new Error('Location request timed out. Please try again.')),
      maxWaitMs
    );

    watchId = navigator.geolocation.watchPosition(
      position => {
        const reading = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        };
        if (!best || reading.accuracy < best.accuracy) best = reading;
        if (reading.accuracy <= goodEnoughM) finish();
      },
      error => {
        let message = 'Could not get your location.';
        if (error.code === error.PERMISSION_DENIED) {
          message =
            'Location permission denied. Allow location access for this site in your browser settings, then try again.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          message = 'Your location is unavailable. Turn on GPS / location services and try again.';
        } else if (error.code === error.TIMEOUT) {
          message = 'Location request timed out. Please try again.';
        }
        // A transient error after a good reading still lets us use that reading.
        finish(new Error(message));
      },
      { enableHighAccuracy: true, timeout: maxWaitMs, maximumAge: 0 }
    );
  });
}

/** Today's date as YYYY-MM-DD in the browser's local time (not UTC). */
export function localDateString(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
