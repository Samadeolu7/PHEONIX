// Auto clock-in on login: fires once per successful login (see authService.login's
// 'auth:login' CustomEvent), captures the browser's geolocation, and attempts a
// silent clock-in. Best-effort and silent by design — no error, and no success
// toast either, is ever surfaced here: no GPS permission, outside the branch's
// configured radius, no staff profile, or already clocked in today are all
// expected, unremarkable outcomes, and the ClockInOutWidget already shows
// today's clock-in time whenever the user checks it. Deliberately toast-free
// so this hook has no dependency on ToastProvider — it's called from
// AuthContext (see AuthProvider in contexts/AuthContext.tsx), which mounts
// above ToastProvider and before the login page can possibly submit, so the
// 'auth:login' listener is always registered in time.
import { useEffect } from 'react';
import { hrService } from '../services/hrService';
import { clockService } from '../services/clockService';

function getCurrentLocation(): Promise<{ latitude: number; longitude: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by this browser'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      geoError => reject(geoError),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  });
}

export function useAutoClockIn() {
  useEffect(() => {
    const attemptAutoClockIn = async () => {
      try {
        const staff = await hrService.getMyProfile();
        if (!staff?.id) return;

        const location = await getCurrentLocation();
        const today = new Date().toISOString().split('T')[0];

        await clockService.clockIn({
          staff: staff.id,
          date: today,
          latitude: location.latitude,
          longitude: location.longitude,
        });

        console.info('[attendance] Clocked in automatically on login');
      } catch {
        // Silent by design — see file header.
      }
    };

    window.addEventListener('auth:login', attemptAutoClockIn);
    return () => window.removeEventListener('auth:login', attemptAutoClockIn);
  }, []);
}
