/**
 * FuelLogFormPage — Simplified fuel receipt registration
 *
 * After the supplier has been paid, staff can quickly record:
 *  - Who / what bus received fuel
 *  - When
 *  - How many litres were received
 *  - Current odometer (for vehicles) → system calculates km & efficiency
 *
 * Uses postpaid payment flow (no voucher required).
 */
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Truck,
  Users,
  Calculator,
  Info,
  Gauge,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useCreateConsumption } from '../../hooks/useResourceConsumption';
import { useAssetSummary } from '../../hooks/useResourceConsumption';
import { useActiveResources } from '../../hooks/useResources';
import { useAllSuppliers } from '../../hooks/useSuppliers';
import { useAllStaff } from '../../hooks/useStaff';
import { useFixedAssets } from '../../hooks/useAssets';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
type BeneficiaryMode = 'asset' | 'employee';

interface FuelLogForm {
  beneficiary_type: BeneficiaryMode;
  asset?: number;
  employee?: number;
  beneficiary_name: string;
  consumption_date: string;
  resource?: number;
  quantity_consumed: string;
  unit_cost: string;
  current_reading: string;
  supplier?: number;
  notes: string;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
const FuelLogFormPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefilledAssetId = searchParams.get('asset_id');

  const [mode, setMode] = useState<BeneficiaryMode>('asset');
  const [form, setForm] = useState<FuelLogForm>({
    beneficiary_type: 'asset',
    asset: prefilledAssetId ? Number(prefilledAssetId) : undefined,
    beneficiary_name: '',
    consumption_date: new Date().toISOString().split('T')[0],
    quantity_consumed: '',
    unit_cost: '',
    current_reading: '',
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedResource, setSelectedResource] = useState<any>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────
  const { data: assetsResp } = useFixedAssets({ status: 'active' });
  const allAssets: any[] = Array.isArray(assetsResp)
    ? assetsResp
    : ((assetsResp as any)?.results ?? []);

  const { data: suppliersData = [] } = useAllSuppliers({ is_active: true });
  const { data: staffData = [] } = useAllStaff({ is_active: true });
  const { data: resourcesData } = useActiveResources();

  // Only show fuel-type resources
  const fuelResources: any[] = (resourcesData ?? []).filter((r: any) => r.resource_type === 'fuel');

  // Fetch last known odometer for selected vehicle
  const { data: assetSummary, isLoading: loadingOdometer } = useAssetSummary(
    form.asset ?? 0,
    90, // look back 90 days to catch the most recent reading
    mode === 'asset' && !!form.asset
  );

  const lastOdometer: number | null = assetSummary?.asset?.current_reading
    ? parseFloat(assetSummary.asset.current_reading)
    : null;

  // ── Create mutation ──────────────────────────
  const createConsumption = useCreateConsumption();

  // ── Auto-select resource when only one fuel resource exists ──
  useEffect(() => {
    if (fuelResources.length === 1 && !selectedResource) {
      const r = fuelResources[0];
      setSelectedResource(r);
      setForm(p => ({ ...p, resource: r.id, unit_cost: r.default_unit_cost ?? '' }));
    }
  }, [fuelResources.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-fill beneficiary name when asset pre-filled ──
  useEffect(() => {
    if (prefilledAssetId && allAssets.length > 0 && !form.beneficiary_name) {
      const asset = allAssets.find((a: any) => a.id === Number(prefilledAssetId));
      if (asset) setForm(p => ({ ...p, beneficiary_name: asset.name }));
    }
  }, [allAssets.length, prefilledAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ──────────────────────────────────
  const setField = (field: keyof FuelLogForm, value: any) => {
    setForm(p => ({ ...p, [field]: value }));
    if (errors[field])
      setErrors(p => {
        const n = { ...p };
        delete n[field];
        return n;
      });
  };

  const handleAssetChange = (assetId: number) => {
    const asset = allAssets.find((a: any) => a.id === assetId);
    setForm(p => ({
      ...p,
      asset: assetId,
      beneficiary_name: asset?.name ?? '',
      current_reading: '',
    }));
    setErrors(p => {
      const n = { ...p };
      delete n.asset;
      delete n.beneficiary_name;
      return n;
    });
  };

  const handleEmployeeChange = (employeeId: number) => {
    const staff = staffData?.find((s: any) => s.id === employeeId);
    setForm(p => ({
      ...p,
      employee: employeeId,
      beneficiary_name: staff?.full_name ?? '',
    }));
    setErrors(p => {
      const n = { ...p };
      delete n.employee;
      return n;
    });
  };

  const handleResourceChange = (resourceId: number) => {
    const r = resourcesData?.find((x: any) => x.id === resourceId);
    setSelectedResource(r ?? null);
    setForm(p => ({
      ...p,
      resource: resourceId,
      unit_cost: r?.default_unit_cost ? String(r.default_unit_cost) : p.unit_cost,
    }));
    setErrors(p => {
      const n = { ...p };
      delete n.resource;
      return n;
    });
  };

  const handleModeChange = (newMode: BeneficiaryMode) => {
    setMode(newMode);
    setForm(p => ({
      ...p,
      beneficiary_type: newMode,
      asset: undefined,
      employee: undefined,
      beneficiary_name: '',
      current_reading: '',
    }));
    setErrors({});
  };

  // ── Derived calculations ──────────────────────
  const totalCost = (): string => {
    const qty = parseFloat(form.quantity_consumed || '0');
    const cost = parseFloat(form.unit_cost || '0');
    if (!qty || !cost) return '0.00';
    return (qty * cost).toFixed(2);
  };

  const distanceTraveled = (): number | null => {
    const curr = parseFloat(form.current_reading || '0');
    if (!curr || lastOdometer == null) return null;
    const dist = curr - lastOdometer;
    return dist > 0 ? dist : null;
  };

  const fuelEfficiency = (): string | null => {
    const dist = distanceTraveled();
    const liters = parseFloat(form.quantity_consumed || '0');
    if (!dist || !liters) return null;
    return (dist / liters).toFixed(2);
  };

  // ── Validation ───────────────────────────────
  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.consumption_date) e.consumption_date = 'Date is required';
    if (!form.resource) e.resource = 'Fuel type is required';
    if (!form.quantity_consumed || parseFloat(form.quantity_consumed) <= 0)
      e.quantity_consumed = 'Enter a valid litre amount';
    if (!form.unit_cost || parseFloat(form.unit_cost) <= 0) e.unit_cost = 'Enter a valid unit cost';
    if (mode === 'asset' && !form.asset) e.asset = 'Please select a vehicle or bus';
    if (mode === 'employee' && !form.employee) e.employee = 'Please select a person';
    if (!form.supplier) e.supplier = 'Please select the fuel supplier';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ───────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSuccessMsg(null);
    if (!validate()) return;

    try {
      const payload: Record<string, any> = {
        payment_flow: 'postpaid',
        resource: form.resource,
        consumption_date: form.consumption_date,
        quantity_consumed: form.quantity_consumed,
        unit_cost: form.unit_cost,
        total_cost: totalCost(),
        unit_of_measure: selectedResource?.unit_of_measure ?? 'litres',
        beneficiary_type: mode,
        beneficiary_name: form.beneficiary_name,
        supplier: form.supplier,
        notes: form.notes || '',
        consumption_location: '',
      };

      if (mode === 'asset') {
        payload.asset = form.asset;
        if (form.current_reading) {
          payload.current_reading = parseFloat(form.current_reading);
          payload.reading_type = 'odometer';
          if (lastOdometer != null) {
            payload.previous_reading = lastOdometer;
          }
        }
      } else {
        payload.employee = form.employee;
      }

      const result = await createConsumption.mutateAsync(payload as any);
      setSuccessMsg(`Fuel log saved ✓  (Ref: ${result.consumption_number})`);

      // After a brief moment navigate to the list so the user can see the new record
      setTimeout(() => navigate('/expenses/resource-consumption'), 1800);
    } catch (err: any) {
      const data = err.response?.data;
      if (data && typeof data === 'object') {
        const flat: Record<string, string> = {};
        Object.entries(data).forEach(([key, val]) => {
          flat[key] = Array.isArray(val) ? (val as string[])[0] : String(val);
        });
        setErrors(flat);
      } else {
        setErrors({ non_field_errors: err.message ?? 'Failed to save. Please try again.' });
      }
    }
  };

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <div className="p-6 max-w-xl mx-auto pb-16">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md text-gray-500 hover:text-gray-800 hover:bg-gray-100"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            ⛽ Log Fuel Receipt
          </h1>
          <p className="text-sm text-gray-500">
            Record fuel received after the supplier has been paid
          </p>
        </div>
      </div>

      {/* ── Success banner ── */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-300 rounded-lg px-4 py-3 text-green-800 text-sm font-medium">
          <CheckCircle size={16} className="shrink-0" />
          {successMsg}
        </div>
      )}

      {/* ── Global error ── */}
      {errors.non_field_errors && (
        <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          {errors.non_field_errors}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* ════════════════════════════════════════
            SECTION 1 — Who received the fuel?
            ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Who received the fuel?
          </h2>

          {/* Mode toggle */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => handleModeChange('asset')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                mode === 'asset'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Truck size={16} />
              Vehicle / Bus
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('employee')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border-2 text-sm font-medium transition-colors ${
                mode === 'employee'
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              <Users size={16} />
              Person / Staff
            </button>
          </div>

          {/* Selector */}
          {mode === 'asset' ? (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Vehicle / Bus *
              </label>
              <select
                value={form.asset ?? ''}
                onChange={e => handleAssetChange(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.asset ? 'border-red-400' : 'border-gray-300'
                }`}
              >
                <option value="">Choose a vehicle or bus…</option>
                {allAssets.map((a: any) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.asset_number ? ` (${a.asset_number})` : ''}
                  </option>
                ))}
              </select>
              {errors.asset && <p className="mt-1 text-xs text-red-600">{errors.asset}</p>}
            </div>
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Person *
              </label>
              <select
                value={form.employee ?? ''}
                onChange={e => handleEmployeeChange(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.employee ? 'border-red-400' : 'border-gray-300'
                }`}
              >
                <option value="">Choose a staff member…</option>
                {staffData?.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.department ? ` — ${s.department}` : ''}
                  </option>
                ))}
              </select>
              {errors.employee && <p className="mt-1 text-xs text-red-600">{errors.employee}</p>}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════
            SECTION 2 — Fuel details
            ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Fuel Details
          </h2>

          <div className="grid grid-cols-2 gap-3">
            {/* Date */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
              <input
                type="date"
                value={form.consumption_date}
                onChange={e => setField('consumption_date', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.consumption_date ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {errors.consumption_date && (
                <p className="mt-1 text-xs text-red-600">{errors.consumption_date}</p>
              )}
            </div>

            {/* Fuel type */}
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Fuel Type *</label>
              <select
                value={form.resource ?? ''}
                onChange={e => handleResourceChange(Number(e.target.value))}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.resource ? 'border-red-400' : 'border-gray-300'
                }`}
              >
                <option value="">Select fuel type…</option>
                {fuelResources.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.unit_of_measure})
                  </option>
                ))}
              </select>
              {errors.resource && <p className="mt-1 text-xs text-red-600">{errors.resource}</p>}
            </div>

            {/* Litres */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Litres Received *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={form.quantity_consumed}
                onChange={e => setField('quantity_consumed', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.quantity_consumed ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {errors.quantity_consumed && (
                <p className="mt-1 text-xs text-red-600">{errors.quantity_consumed}</p>
              )}
            </div>

            {/* Unit cost */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Cost per Litre *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={form.unit_cost}
                onChange={e => setField('unit_cost', e.target.value)}
                className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.unit_cost ? 'border-red-400' : 'border-gray-300'
                }`}
              />
              {errors.unit_cost && <p className="mt-1 text-xs text-red-600">{errors.unit_cost}</p>}
            </div>
          </div>

          {/* Total */}
          {parseFloat(form.quantity_consumed || '0') > 0 &&
            parseFloat(form.unit_cost || '0') > 0 && (
              <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <Calculator size={15} className="text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-800">
                  Total: ₦
                  {parseFloat(totalCost()).toLocaleString('en-NG', {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}
        </div>

        {/* ════════════════════════════════════════
            SECTION 3 — Odometer (vehicles only)
            ════════════════════════════════════════ */}
        {mode === 'asset' && form.asset && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-1">
              <Gauge size={16} className="text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Odometer Reading
              </h2>
              <span className="ml-auto text-xs text-gray-400">(optional)</span>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Enter the current odometer to track fuel efficiency automatically.
            </p>

            {/* Last known odometer hint */}
            {loadingOdometer ? (
              <p className="text-xs text-gray-400 mb-3">Loading last reading…</p>
            ) : lastOdometer != null ? (
              <div className="mb-3 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-800">
                <Info size={13} className="shrink-0" />
                Last recorded odometer:{' '}
                <strong className="ml-1">{lastOdometer.toLocaleString('en-NG')} km</strong>
              </div>
            ) : (
              <div className="mb-3 text-xs text-gray-400 italic">
                No previous reading found for this vehicle.
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Current Odometer (km)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={form.current_reading}
                onChange={e => setField('current_reading', e.target.value)}
                placeholder={
                  lastOdometer != null
                    ? `Must be above ${lastOdometer.toLocaleString('en-NG')}`
                    : 'e.g. 45 200'
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Live efficiency preview */}
            {form.current_reading && lastOdometer != null && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                {distanceTraveled() != null && (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">Distance Traveled</div>
                    <div className="text-base font-bold text-gray-800">
                      {distanceTraveled()!.toLocaleString('en-NG')} km
                    </div>
                  </div>
                )}
                {fuelEfficiency() != null && (
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-xs text-gray-400">Fuel Efficiency</div>
                    <div className="text-base font-bold text-gray-800">{fuelEfficiency()} km/L</div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            SECTION 4 — Supplier
            ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Fuel Supplier
          </h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
            <select
              value={form.supplier ?? ''}
              onChange={e => setField('supplier', Number(e.target.value) || undefined)}
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.supplier ? 'border-red-400' : 'border-gray-300'
              }`}
            >
              <option value="">Select a supplier…</option>
              {suppliersData?.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {errors.supplier && <p className="mt-1 text-xs text-red-600">{errors.supplier}</p>}
          </div>
        </div>

        {/* ════════════════════════════════════════
            SECTION 5 — Notes (optional)
            ════════════════════════════════════════ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={e => setField('notes', e.target.value)}
            placeholder="e.g. Station name, driver name, trip route…"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* ── Actions ── */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 py-3 border border-gray-300 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createConsumption.isPending}
            className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <Save size={16} />
            {createConsumption.isPending ? 'Saving…' : 'Save Fuel Log'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default FuelLogFormPage;
