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
import { clockService } from '../services/clockService';
import { getDevicePosition } from '../utils/geolocation';

export function useAutoClockIn() {
  useEffect(() => {
    const attemptAutoClockIn = async () => {
      try {
        const status = await clockService.getMyStatus();
        if (!status?.staff || status.is_clocked_in || status.today?.clock_in) return;

        const position = await getDevicePosition();
        // No staff id: the server clocks in the signed-in user, on today's
        // date and time in the organisation's time zone.
        await clockService.clockIn({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracy: position.accuracy,
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
