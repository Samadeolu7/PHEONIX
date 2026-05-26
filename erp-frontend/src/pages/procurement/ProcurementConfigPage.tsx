// src/pages/procurement/ProcurementConfigPage.tsx
import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useToast } from '../../hooks/useToast';
import {
  procurementService,
  ProcurementConfig,
  ProcurementConfigUpdate,
} from '../../services/procurementService';

// ─── Field helpers ────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

const Field: React.FC<FieldProps> = ({ label, hint, children }) => (
  <div className="space-y-1">
    <label className="block text-sm font-medium text-gray-700">{label}</label>
    {hint && <p className="text-xs text-gray-400">{hint}</p>}
    {children}
  </div>
);

const SectionHeading: React.FC<{ title: string }> = ({ title }) => (
  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest border-b border-gray-100 pb-1 mb-3">
    {title}
  </h2>
);

// ─── Blank config defaults ────────────────────────────────────────────────────

const DEFAULTS: ProcurementConfigUpdate = {
  enable_three_way_matching: true,
  matching_tolerance_percentage: '5.00',
  auto_approve_within_tolerance: false,
  pr_prefix: 'PR',
  po_prefix: 'PO',
  grn_prefix: 'GRN',
  high_value_threshold: '',
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const ProcurementConfigPage: React.FC = () => {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<ProcurementConfigUpdate>(DEFAULTS);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const {
    data: config,
    isLoading,
    isError,
    error: loadError,
  } = useQuery<ProcurementConfig>({
    queryKey: ['procurement-config'],
    queryFn: () => procurementService.getProcurementConfig(),
    retry: 1,
  });

  // Populate form when config loads
  useEffect(() => {
    if (config) {
      setForm({
        enable_three_way_matching: config.enable_three_way_matching,
        matching_tolerance_percentage: config.matching_tolerance_percentage,
        auto_approve_within_tolerance: config.auto_approve_within_tolerance,
        pr_prefix: config.pr_prefix,
        po_prefix: config.po_prefix,
        grn_prefix: config.grn_prefix,
        high_value_threshold: config.high_value_threshold ?? '',
      });
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: (data: ProcurementConfigUpdate) =>
      config
        ? procurementService.updateProcurementConfig(config.id, data)
        : procurementService.createProcurementConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['procurement-config'] });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
      toast.success('Procurement settings saved');
    },
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await saveMutation.mutateAsync(form);
    } catch (err: unknown) {
      const e2 = err as { response?: { data?: { detail?: string } }; message?: string };
      toast.error(
        e2?.response?.data?.detail ?? (err instanceof Error ? err.message : 'Save failed')
      );
    }
  };

  const set = <K extends keyof ProcurementConfigUpdate>(
    key: K,
    value: ProcurementConfigUpdate[K]
  ) => setForm(prev => ({ ...prev, [key]: value }));

  // ── Not-found → create mode ──
  const notFound =
    isError && (loadError as { response?: { status?: number } })?.response?.status === 404;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Settings className="text-blue-600" size={22} />
            Procurement Settings
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Configure rules for purchase orders, 3-way matching and document numbering
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-6">
        {isLoading && !notFound && (
          <div className="flex items-center justify-center py-16 text-gray-400 gap-2">
            <Loader2 size={20} className="animate-spin" />
            Loading settings…
          </div>
        )}

        {isError && !notFound && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            <AlertTriangle size={16} />
            Failed to load settings. You can still create a new configuration below.
          </div>
        )}

        {(config || notFound || (isError && !isLoading)) && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 3-Way Matching Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <SectionHeading title="3-Way Match Validation" />

              <Field
                label="Enable 3-Way Matching"
                hint="Require PO → GRN → Invoice alignment before AP payment"
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    title="Enable three-way matching"
                    checked={!!form.enable_three_way_matching}
                    onChange={e => set('enable_three_way_matching', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Active</span>
                </label>
              </Field>

              <Field
                label="Tolerance Percentage"
                hint="Acceptable variance (%) for price and quantity comparisons"
              >
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    title="Matching tolerance percentage"
                    min={0}
                    max={100}
                    step={0.01}
                    value={form.matching_tolerance_percentage ?? ''}
                    onChange={e => set('matching_tolerance_percentage', e.target.value)}
                    className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </Field>

              <Field
                label="Auto-approve Within Tolerance"
                hint="If on, matches within tolerance are auto-approved without manual review"
              >
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    title="Auto approve within tolerance"
                    checked={!!form.auto_approve_within_tolerance}
                    onChange={e => set('auto_approve_within_tolerance', e.target.checked)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  <span className="text-sm text-gray-700">Enabled</span>
                </label>
              </Field>
            </div>

            {/* Document Numbering Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <SectionHeading title="Document Number Prefixes" />

              <div className="grid grid-cols-3 gap-4">
                <Field label="Requisition Prefix">
                  <input
                    type="text"
                    title="Purchase requisition number prefix"
                    maxLength={10}
                    value={form.pr_prefix ?? ''}
                    onChange={e => set('pr_prefix', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="Purchase Order Prefix">
                  <input
                    type="text"
                    title="Purchase order number prefix"
                    maxLength={10}
                    value={form.po_prefix ?? ''}
                    onChange={e => set('po_prefix', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
                <Field label="GRN Prefix">
                  <input
                    type="text"
                    title="Goods received note number prefix"
                    maxLength={10}
                    value={form.grn_prefix ?? ''}
                    onChange={e => set('grn_prefix', e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </Field>
              </div>
            </div>

            {/* High-Value Threshold Section */}
            <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
              <SectionHeading title="High-Value PO Routing" />

              <Field
                label="High-Value Threshold (₦)"
                hint="POs above this amount are routed to the high-value approval workflow. Leave blank to disable."
              >
                <input
                  type="number"
                  title="High value threshold amount"
                  min={0}
                  step={0.01}
                  value={form.high_value_threshold ?? ''}
                  onChange={e => set('high_value_threshold', e.target.value || null)}
                  placeholder="e.g. 5000000"
                  className="w-full max-w-xs px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </Field>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              {saveSuccess && (
                <span className="flex items-center gap-1.5 text-sm text-green-700">
                  <CheckCircle2 size={15} />
                  Saved successfully
                </span>
              )}
              {!saveSuccess && <span />}

              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    Save Settings
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ProcurementConfigPage;
