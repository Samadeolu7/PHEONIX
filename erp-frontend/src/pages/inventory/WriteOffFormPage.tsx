// src/pages/inventory/WriteOffFormPage.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, ArrowLeft, AlertTriangle } from 'lucide-react';
import { inventoryService, CreateWriteOffData } from '../../services/inventoryService';

const DECIMAL_INPUT_REGEX = /^\d{0,16}(?:\.\d{0,2})?$/;

const REASON_OPTIONS = [
  'Damaged in warehouse',
  'Expired / past shelf life',
  'Obsolete / discontinued',
  'Quality control failure',
  'Theft / shrinkage',
  'Water / fire damage',
  'Other',
];

const WriteOffFormPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [itemId, setItemId] = useState<number>(0);
  const [locationId, setLocationId] = useState<number>(0);
  const [quantity, setQuantity] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [reason, setReason] = useState('');
  const [reasonOther, setReasonOther] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: itemsData } = useQuery({
    queryKey: ['inventory-items-picker'],
    queryFn: () => inventoryService.getAllItems(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: locationsData } = useQuery({
    queryKey: ['inventory-locations-picker'],
    queryFn: () => inventoryService.getAllLocations(),
    staleTime: 5 * 60 * 1000,
  });

  const items = itemsData ?? [];
  const locations = locationsData ?? [];

  const createMutation = useMutation({
    mutationFn: (data: CreateWriteOffData) => inventoryService.createWriteOff(data),
  });

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!itemId) {
      errs.item = 'Select an inventory item';
    }
    if (!locationId) {
      errs.location = 'Select a location';
    }
    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) <= 0) {
      errs.quantity = 'Quantity must be greater than 0';
    }
    if (!reason) {
      errs.reason = 'Select a reason';
    }
    if (reason === 'Other' && !reasonOther.trim()) {
      errs.reasonOther = 'Please describe the reason';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload: CreateWriteOffData = {
      item_id: itemId,
      location_id: locationId,
      quantity,
      unit_cost: unitCost || undefined,
      reason: reason === 'Other' ? reasonOther.trim() : reason,
      notes: notes.trim() || undefined,
    };

    try {
      await createMutation.mutateAsync(payload);
      qc.invalidateQueries({ queryKey: ['write-offs'] });
      navigate('/inventory/write-offs');
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { detail?: string; non_field_errors?: string[] } };
        message?: string;
      };
      setSubmitError(
        e2?.response?.data?.detail ??
          e2?.response?.data?.non_field_errors?.join(' ') ??
          (err instanceof Error ? err.message : 'Failed to create write-off request')
      );
    }
  };

  return (
    <form onSubmit={handleSubmit} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              title="Back to write-offs"
              onClick={() => navigate('/inventory/write-offs')}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Trash2 className="text-red-500" size={20} />
                New Write-Off Request
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Submit a request to write off damaged, expired or obsolete stock
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6 space-y-5">
        {submitError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {submitError}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Item Details
          </h2>

          {/* Item */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Inventory Item <span className="text-red-500">*</span>
            </label>
            <select
              title="Select inventory item"
              value={itemId}
              onChange={e => setItemId(Number(e.target.value))}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.item ? 'border-red-300' : 'border-gray-200'}`}
            >
              <option value={0}>Select item…</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.sku})
                </option>
              ))}
            </select>
            {errors.item && <p className="text-xs text-red-600 mt-1">{errors.item}</p>}
          </div>

          {/* Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Location <span className="text-red-500">*</span>
            </label>
            <select
              title="Select location"
              value={locationId}
              onChange={e => setLocationId(Number(e.target.value))}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.location ? 'border-red-300' : 'border-gray-200'}`}
            >
              <option value={0}>Select location…</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            {errors.location && <p className="text-xs text-red-600 mt-1">{errors.location}</p>}
          </div>

          {/* Quantity + Unit Cost */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quantity to Write Off <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                inputMode="decimal"
                title="Quantity"
                value={quantity}
                onChange={e => {
                  if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                    setQuantity(e.target.value);
                  }
                }}
                placeholder="0.00"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.quantity ? 'border-red-300' : 'border-gray-200'}`}
              />
              {errors.quantity && <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Cost (optional)
              </label>
              <input
                type="text"
                inputMode="decimal"
                title="Unit cost"
                value={unitCost}
                onChange={e => {
                  if (DECIMAL_INPUT_REGEX.test(e.target.value) || e.target.value === '') {
                    setUnitCost(e.target.value);
                  }
                }}
                placeholder="Leave blank to use item cost"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Reason</h2>

          {/* Reason select */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Write-Off <span className="text-red-500">*</span>
            </label>
            <select
              title="Select reason"
              value={reason}
              onChange={e => setReason(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.reason ? 'border-red-300' : 'border-gray-200'}`}
            >
              <option value="">Select reason…</option>
              {REASON_OPTIONS.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            {errors.reason && <p className="text-xs text-red-600 mt-1">{errors.reason}</p>}
          </div>

          {/* Other reason text */}
          {reason === 'Other' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Describe the reason <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                title="Other reason"
                value={reasonOther}
                onChange={e => setReasonOther(e.target.value)}
                placeholder="Explain the reason for write-off"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.reasonOther ? 'border-red-300' : 'border-gray-200'}`}
              />
              {errors.reasonOther && (
                <p className="text-xs text-red-600 mt-1">{errors.reasonOther}</p>
              )}
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Additional Notes</label>
            <textarea
              rows={3}
              title="Additional notes"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Supporting details, photos reference, etc."
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
        </div>

        {/* Bottom actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/inventory/write-offs')}
            className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {createMutation.isPending ? 'Submitting…' : 'Submit Request'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default WriteOffFormPage;
