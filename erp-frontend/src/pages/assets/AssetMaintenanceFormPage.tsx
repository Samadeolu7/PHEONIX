/**
 * Asset Maintenance Form Page
 *
 * Create a new maintenance record or view an existing one.
 *
 * Routes
 *   /assets/maintenance/new          → log new maintenance
 *   /assets/maintenance/:id          → view / edit existing record
 */

import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  Wrench,
  DollarSign,
  User,
  Calendar,
  CheckCircle,
  BadgeDollarSign,
  AlertTriangle,
} from 'lucide-react';
import {
  useMaintenanceEntry,
  useCreateMaintenance,
  useUpdateMaintenance,
  usePostMaintenance,
  useFixedAssets,
} from '../../hooks/useAssets';
import type { CreateAssetMaintenanceRequest } from '../../types/assets';

// ─── Form types ───────────────────────────────────────────────────────────────

interface MaintenanceFormState {
  asset: number | '';
  maintenance_date: string;
  maintenance_type: string;
  description: string;
  cost: string;
  payment_method: string;
  performed_by: string;
  vendor: string;
  next_maintenance_date: string;
  meter_reading: string;
  notes: string;
}

const emptyForm = (): MaintenanceFormState => ({
  asset: '',
  maintenance_date: new Date().toISOString().slice(0, 10),
  maintenance_type: 'routine',
  description: '',
  cost: '',
  payment_method: '',
  performed_by: '',
  vendor: '',
  next_maintenance_date: '',
  meter_reading: '',
  notes: '',
});

const MAINTENANCE_TYPES = [
  { value: 'routine', label: 'Routine Maintenance' },
  { value: 'preventive', label: 'Preventive Maintenance' },
  { value: 'corrective', label: 'Corrective Maintenance' },
  { value: 'repair', label: 'Repair' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'overhaul', label: 'Overhaul' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'other', label: 'Other' },
];

const PAYMENT_METHODS = [
  { value: '', label: 'Select payment method' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'petty_cash', label: 'Petty Cash' },
  { value: 'cheque', label: 'Cheque' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'credit', label: 'Credit / Accounts Payable' },
];

// ─── Field wrapper ────────────────────────────────────────────────────────────

const Field: React.FC<{
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}> = ({ label, required, error, children, hint }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint && <p className="mt-1 text-xs text-gray-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

const AssetMaintenanceFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id && id !== 'new';

  const [form, setForm] = useState<MaintenanceFormState>(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Existing record (view mode)
  const { data: existing, isLoading } = useMaintenanceEntry(isEdit ? Number(id) : 0);

  // Available assets (active, idle, and under-maintenance assets can all receive maintenance)
  const { data: assetsData } = useFixedAssets({});
  const assets = assetsData?.results ?? [];

  const createMutation = useCreateMaintenance();
  const updateMutation = useUpdateMaintenance();
  const postMutation = usePostMaintenance();

  // Seed form from existing record
  useEffect(() => {
    if (existing) {
      setForm({
        asset: existing.asset,
        maintenance_date: existing.maintenance_date,
        maintenance_type: existing.maintenance_type,
        description: existing.description,
        cost: existing.cost?.toString() ?? '',
        payment_method: existing.payment_method ?? '',
        performed_by: existing.performed_by ?? '',
        vendor: existing.vendor ?? '',
        next_maintenance_date: existing.next_maintenance_date ?? '',
        meter_reading: existing.meter_reading?.toString() ?? '',
        notes: existing.notes ?? '',
      });
    }
  }, [existing]);

  const set = (field: keyof MaintenanceFormState, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.asset) e.asset = 'Please select an asset';
    if (!form.maintenance_date) e.maintenance_date = 'Date is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (!form.cost || isNaN(Number(form.cost)) || Number(form.cost) < 0)
      e.cost = 'Enter a valid cost';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    const payload: CreateAssetMaintenanceRequest = {
      asset: Number(form.asset),
      maintenance_date: form.maintenance_date,
      maintenance_type: form.maintenance_type as import('../../types/assets').MaintenanceType,
      description: form.description,
      cost: form.cost,
      payment_method: form.payment_method || undefined,
      performed_by: form.performed_by || undefined,
      vendor: form.vendor || undefined,
      next_maintenance_date: form.next_maintenance_date || undefined,
      meter_reading: form.meter_reading || undefined,
      notes: form.notes,
    };

    if (isEdit) {
      await updateMutation.mutateAsync({ id: Number(id), data: payload });
      navigate('/assets/maintenance');
    } else {
      await createMutation.mutateAsync(payload);
      navigate('/assets/maintenance');
    }
  };

  const handlePost = async () => {
    if (!isEdit) return;
    await postMutation.mutateAsync(Number(id));
    navigate('/assets/maintenance');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64 text-gray-500">Loading…</div>;
  }

  const isPosted = existing?.is_posted ?? false;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Back */}
      <Link
        to="/assets/maintenance"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Maintenance
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wrench className="w-6 h-6 text-blue-600" />
            {isPosted ? 'Maintenance Record' : isEdit ? 'Edit Maintenance' : 'Log Maintenance'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isPosted
              ? 'This record has been posted to the general ledger.'
              : 'Record a maintenance event and optionally post the expense to GL.'}
          </p>
        </div>
        {isPosted && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 text-green-800 text-sm font-medium rounded-full">
            <CheckCircle className="w-4 h-4" /> Posted
          </span>
        )}
      </div>

      {isPosted && (
        <div className="mb-5 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3 text-sm text-blue-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          This record has been posted and is read-only. The GL journal entry has been created.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Asset + Date */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" /> Basic Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Asset" required error={errors.asset?.toString()}>
              <select
                value={form.asset}
                onChange={e => set('asset', e.target.value)}
                disabled={isPosted}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                <option value="">Select asset…</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.asset_number} – {a.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Maintenance Date" required error={errors.maintenance_date}>
              <input
                type="date"
                value={form.maintenance_date}
                onChange={e => set('maintenance_date', e.target.value)}
                disabled={isPosted}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>

            <Field label="Type" required>
              <select
                value={form.maintenance_type}
                onChange={e => set('maintenance_type', e.target.value)}
                disabled={isPosted}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                {MAINTENANCE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Meter / Odometer Reading" hint="Leave blank if not applicable">
              <input
                type="number"
                min={0}
                value={form.meter_reading}
                onChange={e => set('meter_reading', e.target.value)}
                disabled={isPosted}
                placeholder="e.g. 45000"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>
          </div>

          <Field label="Description" required error={errors.description}>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              disabled={isPosted}
              placeholder="What was done and why…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 resize-none"
            />
          </Field>
        </div>

        {/* Cost + Payment */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gray-400" /> Cost & Payment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Cost (₦)" required error={errors.cost}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.cost}
                onChange={e => set('cost', e.target.value)}
                disabled={isPosted}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>

            <Field label="Payment Method">
              <select
                value={form.payment_method}
                onChange={e => set('payment_method', e.target.value)}
                disabled={isPosted}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              >
                {PAYMENT_METHODS.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>

        {/* Vendor + Technician + Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <User className="w-4 h-4 text-gray-400" /> Service Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Performed By">
              <input
                type="text"
                value={form.performed_by}
                onChange={e => set('performed_by', e.target.value)}
                disabled={isPosted}
                placeholder="Name or team"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>

            <Field label="Vendor / Workshop">
              <input
                type="text"
                value={form.vendor}
                onChange={e => set('vendor', e.target.value)}
                disabled={isPosted}
                placeholder="Company name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>

            <Field label="Next Maintenance Due" hint="Used to generate the 'Upcoming' reminder">
              <input
                type="date"
                value={form.next_maintenance_date}
                onChange={e => set('next_maintenance_date', e.target.value)}
                disabled={isPosted}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              />
            </Field>
          </div>

          <Field label="Internal Notes">
            <textarea
              rows={2}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              disabled={isPosted}
              placeholder="Any additional notes…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 resize-none"
            />
          </Field>
        </div>

        {/* Actions */}
        {!isPosted && (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/assets/maintenance')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {createMutation.isPending || updateMutation.isPending
                  ? 'Saving…'
                  : isEdit
                    ? 'Save Changes'
                    : 'Save Record'}
              </button>
              {isEdit && (
                <button
                  type="button"
                  onClick={handlePost}
                  disabled={postMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium disabled:opacity-60"
                >
                  <BadgeDollarSign className="w-4 h-4" />
                  {postMutation.isPending ? 'Posting…' : 'Post to GL'}
                </button>
              )}
            </div>
          </div>
        )}

        {isPosted && (
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => navigate('/assets/maintenance')}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              ← Back to List
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default AssetMaintenanceFormPage;
