import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Crosshair, ExternalLink, Loader2, MapPin, Save, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useBranches, branchKeys } from '../../hooks/useBranches';
import { branchService, Branch } from '../../services/branchService';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../hooks/useToast';
import { getDevicePosition } from '../../utils/geolocation';

interface Draft {
  latitude: string;
  longitude: string;
  radius: string;
  /** Accuracy of the "use my current location" fix, if that's how it was set. */
  capturedAccuracy?: number;
}

const toDraft = (b: Branch): Draft => ({
  latitude: b.latitude != null && b.latitude !== '' ? String(b.latitude) : '',
  longitude: b.longitude != null && b.longitude !== '' ? String(b.longitude) : '',
  radius: String(b.attendance_radius_meters ?? 1500),
});

const sameAsSaved = (d: Draft, b: Branch) => {
  const saved = toDraft(b);
  const num = (v: string) => (v === '' ? null : Number(v));
  return (
    num(d.latitude) === num(saved.latitude) &&
    num(d.longitude) === num(saved.longitude) &&
    Number(d.radius) === Number(saved.radius)
  );
};

/**
 * Where each branch's office is, for clock-in / clock-out. Staff can only
 * clock in within the radius of their branch's point (plus some extra room
 * for their phone's GPS accuracy). Admins and directors only — the backend
 * enforces the same rule.
 */
const OfficeLocationsPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isDirectorPlus } = useAuth();
  const { success, error: showError } = useToast();
  const canEdit = Boolean(isDirectorPlus || user?.is_system_admin || user?.is_owner);

  const { data, isLoading } = useBranches();
  const branches: Branch[] = useMemo(() => data?.results || [], [data]);

  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [locating, setLocating] = useState<number | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    setDrafts(prev => {
      const next = { ...prev };
      branches.forEach(b => {
        if (!next[b.id]) next[b.id] = toDraft(b);
      });
      return next;
    });
  }, [branches]);

  const update = (id: number, patch: Partial<Draft>) =>
    setDrafts(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const captureHere = async (id: number) => {
    setLocating(id);
    try {
      // Wait longer here than for a clock-in: this point is the reference
      // everyone is measured against, so it's worth getting a precise fix.
      const pos = await getDevicePosition({ maxWaitMs: 15000, goodEnoughM: 15 });
      update(id, {
        latitude: pos.latitude.toFixed(6),
        longitude: pos.longitude.toFixed(6),
        capturedAccuracy: Math.round(pos.accuracy),
      });
      if (pos.accuracy > 50) {
        showError(
          `Location captured, but only accurate to about ±${Math.round(pos.accuracy)} m. ` +
            'For best results do this on a phone with GPS on, standing inside the office.'
        );
      } else {
        success(`Location captured (±${Math.round(pos.accuracy)} m) — remember to save.`);
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not get your location');
    } finally {
      setLocating(null);
    }
  };

  const save = async (b: Branch, clear = false) => {
    const d = drafts[b.id];
    if (!d) return;
    const lat = clear || d.latitude.trim() === '' ? null : Number(d.latitude);
    const lng = clear || d.longitude.trim() === '' ? null : Number(d.longitude);
    const radius = Number(d.radius);

    if ((lat === null) !== (lng === null)) {
      showError('Enter both latitude and longitude, or leave both blank.');
      return;
    }
    if (lat !== null && (Number.isNaN(lat) || lat < -90 || lat > 90)) {
      showError('Latitude must be between -90 and 90.');
      return;
    }
    if (lng !== null && (Number.isNaN(lng) || lng < -180 || lng > 180)) {
      showError('Longitude must be between -180 and 180.');
      return;
    }
    if (!Number.isFinite(radius) || radius < 10 || radius > 50000) {
      showError('Radius must be between 10 and 50,000 meters.');
      return;
    }

    setSaving(b.id);
    try {
      const saved = await branchService.patchBranch(b.id, {
        latitude: lat,
        longitude: lng,
        attendance_radius_meters: Math.round(radius),
      });
      setDrafts(prev => ({ ...prev, [b.id]: toDraft({ ...b, ...saved }) }));
      queryClient.invalidateQueries({ queryKey: branchKeys.all });
      queryClient.invalidateQueries({ queryKey: ['my-clock-status'] });
      success(
        clear ? `Office location cleared for ${b.name}` : `Office location saved for ${b.name}`
      );
    } catch (e) {
      const err = e as { details?: { detail?: string }; message?: string };
      showError(err?.details?.detail || err?.message || 'Failed to save office location');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Office Locations</h1>
            <p className="text-sm text-gray-600">
              Where staff of each branch must be to clock in and out.
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900 space-y-1">
          <p>
            Staff can clock in only within the <strong>radius</strong> of their branch&apos;s office
            point. Phones with a weaker GPS fix get extra room equal to their reported accuracy (up
            to 300 m), so a staff member indoors isn&apos;t wrongly turned away.
          </p>
          <p>
            Easiest way to set it: stand inside the office with your phone, open this page and tap{' '}
            <strong>Use my current location</strong>, then <strong>Save</strong>. A branch with no
            location set doesn&apos;t check location at all.
          </p>
        </div>

        {!canEdit && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-800">
            Only administrators and directors can change office locations. You can view them here.
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : branches.length === 0 ? (
          <p className="py-16 text-center text-gray-500">No branches found.</p>
        ) : (
          <div className="space-y-4">
            {branches.map(b => {
              const d = drafts[b.id] || toDraft(b);
              const hasPoint = d.latitude !== '' && d.longitude !== '';
              const dirty = !sameAsSaved(d, b);
              const savedHasPoint =
                b.latitude != null &&
                b.latitude !== '' &&
                b.longitude != null &&
                b.longitude !== '';
              return (
                <div key={b.id} className="bg-white rounded-lg border shadow-sm p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin
                        className={`h-5 w-5 flex-shrink-0 ${savedHasPoint ? 'text-green-600' : 'text-gray-400'}`}
                      />
                      <h2 className="font-semibold text-gray-900 truncate">{b.name}</h2>
                      <span className="text-xs text-gray-500">{b.code}</span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        savedHasPoint ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {savedHasPoint ? 'Location set' : 'Not set — location not checked'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-600 mb-1">Latitude</span>
                      <input
                        type="number"
                        step="0.000001"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={d.latitude}
                        onChange={e =>
                          update(b.id, { latitude: e.target.value, capturedAccuracy: undefined })
                        }
                        placeholder="e.g. 6.524400"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-600 mb-1">
                        Longitude
                      </span>
                      <input
                        type="number"
                        step="0.000001"
                        inputMode="decimal"
                        disabled={!canEdit}
                        value={d.longitude}
                        onChange={e =>
                          update(b.id, { longitude: e.target.value, capturedAccuracy: undefined })
                        }
                        placeholder="e.g. 3.379200"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      />
                    </label>
                    <label className="block">
                      <span className="block text-xs font-medium text-gray-600 mb-1">
                        Allowed radius (meters)
                      </span>
                      <input
                        type="number"
                        min={10}
                        max={50000}
                        step={10}
                        disabled={!canEdit}
                        value={d.radius}
                        onChange={e => update(b.id, { radius: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
                      />
                    </label>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                    {d.capturedAccuracy !== undefined && (
                      <span>Captured with ±{d.capturedAccuracy} m accuracy</span>
                    )}
                    {hasPoint && (
                      <a
                        href={`https://www.google.com/maps?q=${d.latitude},${d.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:underline"
                      >
                        Check on map <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <span>Tip: 100–300 m suits most offices.</span>
                  </div>

                  {canEdit && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => captureHere(b.id)}
                        disabled={locating !== null}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {locating === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Crosshair className="h-4 w-4" />
                        )}
                        {locating === b.id ? 'Locating…' : 'Use my current location'}
                      </button>
                      <button
                        type="button"
                        onClick={() => save(b)}
                        disabled={!dirty || saving !== null}
                        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                      >
                        {saving === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                        Save
                      </button>
                      {savedHasPoint && (
                        <button
                          type="button"
                          onClick={() => {
                            if (
                              window.confirm(
                                `Clear the office location for ${b.name}? Staff there will be able to clock in from anywhere.`
                              )
                            ) {
                              save(b, true);
                            }
                          }}
                          disabled={saving !== null}
                          className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" /> Clear
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default OfficeLocationsPage;
