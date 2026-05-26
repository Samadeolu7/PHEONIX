// src/components/incomes/CreateServiceItemModal.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';
import { useToast } from '../../contexts/ToastContext';
import { serviceItemService, IncomeCategory } from '../../services/serviceItemService';
import { inventoryService } from '../../services/inventoryService';
import { InventoryCategory } from '../../types/inventory';
import api from '@/services/api';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CreatedServiceItem {
  id: number;
  name: string;
  code: string;
  default_price: string;
  creates_entitlement: boolean;
  description: string;
  is_active: boolean;
  service_type: string;
}

type ServiceType = 'standard' | 'inventory_access' | 'hybrid';

interface MRConfig {
  allowed_categories: string[];
  allowed_item_types: string[];
}

interface FormState {
  name: string;
  code: string;
  category: string;
  default_price: string;
  creates_entitlement: boolean;
  description: string;
  service_type: ServiceType;
  allows_material_requests: boolean;
  material_request_limit: string;
  material_request_config: MRConfig;
}

interface FormErrors {
  name?: string;
  code?: string;
  category?: string;
  default_price?: string;
  non_field_errors?: string;
  [key: string]: string | undefined;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called with the newly created ServiceItem so the parent can add it to its list */
  onCreated: (item: CreatedServiceItem) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const EMPTY_FORM: FormState = {
  name: '',
  code: '',
  category: '',
  default_price: '0.00',
  creates_entitlement: true,
  description: '',
  service_type: 'standard',
  allows_material_requests: false,
  material_request_limit: '',
  material_request_config: { allowed_categories: [], allowed_item_types: [] },
};

// ─── Component ───────────────────────────────────────────────────────────────

const CreateServiceItemModal: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { success, error: showError } = useToast();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [categories, setCategories] = useState<IncomeCategory[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [invCategories, setInvCategories] = useState<InventoryCategory[]>([]);

  // Load income categories + inventory categories when modal opens
  const loadCategories = useCallback(async () => {
    try {
      setLoadingCategories(true);
      const [incCats, invRes] = await Promise.all([
        serviceItemService.getIncomeCategories({ is_active: true }),
        inventoryService.getCategories(),
      ]);
      setCategories(incCats);
      setInvCategories(invRes.results ?? []);
    } catch {
      showError('Failed to load categories');
    } finally {
      setLoadingCategories(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setErrors({});
    loadCategories();
  }, [open, loadCategories]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Prevent body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  if (!open) return null;

  // ─── Helpers ──────────────────────────────────────────────────────────────

  const set = (field: keyof FormState, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: undefined }));
  };

  // ─── Inventory / MR helpers ───────────────────────────────────────────────

  const distinctItemTypes = Array.from(
    new Set(invCategories.map(c => c.item_type).filter(Boolean))
  );

  const getMRItemTypes = (): string[] => form.material_request_config.allowed_item_types;
  const getMRCategoryCodes = (): string[] => form.material_request_config.allowed_categories;

  const toggleMRItemType = (label: string) => {
    const current = getMRItemTypes();
    const updated = current.includes(label)
      ? current.filter(t => t !== label)
      : [...current, label];
    setForm(prev => ({
      ...prev,
      material_request_config: { ...prev.material_request_config, allowed_item_types: updated },
    }));
  };

  const toggleMRCategoryCode = (code: string) => {
    const current = getMRCategoryCodes();
    const updated = current.includes(code) ? current.filter(c => c !== code) : [...current, code];
    setForm(prev => ({
      ...prev,
      material_request_config: { ...prev.material_request_config, allowed_categories: updated },
    }));
  };

  // Auto-generate code from name when code is still empty
  const handleNameBlur = () => {
    if (!form.code && form.name) {
      const auto = form.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
        .slice(0, 20);
      setForm(prev => ({ ...prev, code: auto }));
    }
  };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.name.trim()) {
      e.name = 'Name is required';
    }
    if (!form.code.trim()) {
      e.code = 'Code is required';
    } else if (!/^[A-Z0-9_-]+$/i.test(form.code)) {
      e.code = 'Code must be alphanumeric (underscores and hyphens allowed)';
    }
    if (!form.category) {
      e.category = 'Income category is required';
    }
    const price = parseFloat(form.default_price);
    if (isNaN(price) || price < 0) {
      e.default_price = 'Price must be 0 or greater';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        category: parseInt(form.category, 10),
        default_price: parseFloat(form.default_price).toFixed(2),
        creates_entitlement: form.creates_entitlement,
        description: form.description.trim(),
        is_active: true,
        service_type: form.service_type,
        allows_material_requests: form.allows_material_requests,
      };

      if (form.allows_material_requests) {
        payload.material_request_limit =
          form.material_request_limit !== '' ? parseFloat(form.material_request_limit) : null;
        const cfg = form.material_request_config;
        payload.material_request_config =
          cfg.allowed_categories.length > 0 || cfg.allowed_item_types.length > 0 ? cfg : null;
      } else {
        payload.material_request_limit = null;
        payload.material_request_config = null;
      }

      const created = (await api.post('/incomes/service-items/', payload)) as CreatedServiceItem;
      success(`Service "${created.name}" created successfully`);
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const response = (err as { response?: { data?: Record<string, unknown> } })?.response;
      const data = response?.data;
      if (data && typeof data === 'object') {
        const apiErrors: FormErrors = {};
        Object.entries(data).forEach(([key, val]) => {
          apiErrors[key] = Array.isArray(val) ? (val as string[])[0] : String(val);
        });
        setErrors(apiErrors);
        showError('Please fix the highlighted errors');
      } else {
        showError('Failed to create service item');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-service-title"
        className="relative z-50 w-full max-w-lg rounded-xl bg-white shadow-2xl border border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 id="create-service-title" className="text-lg font-semibold text-gray-900">
            Create Service Item
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ── */}
        <form onSubmit={handleSubmit} noValidate>
          <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Non-field errors */}
            {errors.non_field_errors && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {errors.non_field_errors}
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="svc-name" className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="svc-name"
                type="text"
                value={form.name}
                onChange={e => set('name', e.target.value)}
                onBlur={handleNameBlur}
                placeholder="e.g. Tuition Fee, Consultation, Monthly Membership"
                title="Service item name"
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.name ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
            </div>

            {/* Code */}
            <div>
              <label htmlFor="svc-code" className="block text-sm font-medium text-gray-700 mb-1">
                Code <span className="text-red-500">*</span>
              </label>
              <input
                id="svc-code"
                type="text"
                value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="e.g. TUITION_FEE"
                title="Unique service code"
                className={`w-full px-3 py-2 border rounded-lg font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.code ? 'border-red-500' : 'border-gray-300'
                }`}
              />
              {errors.code ? (
                <p className="text-red-500 text-xs mt-1">{errors.code}</p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">
                  Unique identifier — auto-filled from name. Uppercase, alphanumeric.
                </p>
              )}
            </div>

            {/* Income Category */}
            <div>
              <label
                htmlFor="svc-category"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Income Category <span className="text-red-500">*</span>
              </label>
              <select
                id="svc-category"
                title="Income category"
                value={form.category}
                onChange={e => set('category', e.target.value)}
                disabled={loadingCategories}
                className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.category ? 'border-red-500' : 'border-gray-300'
                }`}
              >
                <option value="">
                  {loadingCategories ? 'Loading categories…' : 'Select income category…'}
                </option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.code})
                  </option>
                ))}
              </select>
              {errors.category ? (
                <p className="text-red-500 text-xs mt-1">{errors.category}</p>
              ) : (
                <p className="text-gray-400 text-xs mt-1">
                  Determines the GL account used for revenue recognition
                </p>
              )}
            </div>

            {/* Default Price */}
            <div>
              <label htmlFor="svc-price" className="block text-sm font-medium text-gray-700 mb-1">
                Default Price <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 select-none">
                  ₦
                </span>
                <input
                  id="svc-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.default_price}
                  onChange={e => set('default_price', e.target.value)}
                  placeholder="0.00"
                  title="Default price"
                  className={`w-full pl-8 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                    errors.default_price ? 'border-red-500' : 'border-gray-300'
                  }`}
                />
              </div>
              {errors.default_price && (
                <p className="text-red-500 text-xs mt-1">{errors.default_price}</p>
              )}
            </div>

            {/* Creates Entitlement toggle */}
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <input
                id="svc-entitlement"
                type="checkbox"
                checked={form.creates_entitlement}
                onChange={e => set('creates_entitlement', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <div>
                <label
                  htmlFor="svc-entitlement"
                  className="text-sm font-medium text-gray-800 cursor-pointer"
                >
                  Creates entitlement on payment
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  When checked, paying this service automatically creates a FeeEntitlement — giving
                  the client trackable access (e.g. attendance, exam clearance, facility access).
                </p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="svc-description"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Description <span className="text-gray-400 text-xs">(optional)</span>
              </label>
              <textarea
                id="svc-description"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                rows={2}
                placeholder="Brief description of what this service covers…"
                title="Service description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {/* ── Service Type ── */}
            <div>
              <label
                htmlFor="svc-service-type"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Service Type
              </label>
              <select
                id="svc-service-type"
                title="Service type"
                value={form.service_type}
                onChange={e => {
                  const val = e.target.value as ServiceType;
                  setForm(prev => ({
                    ...prev,
                    service_type: val,
                    // clear MR settings when switching away from inventory types
                    allows_material_requests:
                      val === 'standard' ? false : prev.allows_material_requests,
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="standard">Standard</option>
                <option value="inventory_access">Inventory Access</option>
                <option value="hybrid">Hybrid</option>
              </select>
              <p className="text-gray-400 text-xs mt-1">
                {form.service_type === 'standard' &&
                  'A regular fee-based service (tuition, consultation, etc.).'}
                {form.service_type === 'inventory_access' &&
                  'Grants the client access to request inventory items.'}
                {form.service_type === 'hybrid' &&
                  'Combines a fee-based service with inventory item access.'}
              </p>
            </div>

            {/* ── Material Requests (only for inventory_access / hybrid) ── */}
            {form.service_type !== 'standard' && (
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4 space-y-4">
                <div className="flex items-start gap-3">
                  <input
                    id="svc-allows-mr"
                    type="checkbox"
                    checked={form.allows_material_requests}
                    onChange={e => set('allows_material_requests', e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div>
                    <label
                      htmlFor="svc-allows-mr"
                      className="text-sm font-medium text-gray-800 cursor-pointer"
                    >
                      Allow material requests
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Clients with this service can submit inventory material requests.
                    </p>
                  </div>
                </div>

                {form.allows_material_requests && (
                  <>
                    {/* MR Limit */}
                    <div>
                      <label
                        htmlFor="svc-mr-limit"
                        className="block text-sm font-medium text-gray-700 mb-1"
                      >
                        Request Limit{' '}
                        <span className="text-gray-400 text-xs">(leave blank for unlimited)</span>
                      </label>
                      <input
                        id="svc-mr-limit"
                        type="number"
                        min="0"
                        step="1"
                        value={form.material_request_limit}
                        onChange={e =>
                          setForm(prev => ({ ...prev, material_request_limit: e.target.value }))
                        }
                        placeholder="e.g. 5 (blank = unlimited)"
                        title="Maximum number of material requests"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    {/* Allowed Item Types */}
                    {distinctItemTypes.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Allowed Item Types{' '}
                          <span className="text-gray-400 text-xs">(none = all)</span>
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {distinctItemTypes.map(type => {
                            const active = getMRItemTypes().includes(type);
                            return (
                              <button
                                key={type}
                                type="button"
                                onClick={() => toggleMRItemType(type)}
                                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                                  active
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-gray-600 border-gray-300 hover:border-amber-400'
                                }`}
                              >
                                {type}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Allowed Categories */}
                    {invCategories.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-gray-700 mb-2">
                          Allowed Categories{' '}
                          <span className="text-gray-400 text-xs">(none = all)</span>
                        </p>
                        <div className="max-h-36 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                          {invCategories.map(cat => {
                            const checked = getMRCategoryCodes().includes(cat.code);
                            return (
                              <label
                                key={cat.code}
                                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleMRCategoryCode(cat.code)}
                                  className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                />
                                <span className="text-sm text-gray-700">{cat.name}</span>
                                <span className="ml-auto text-xs text-gray-400 font-mono">
                                  {cat.code}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors text-sm disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || loadingCategories}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create Service'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateServiceItemModal;
