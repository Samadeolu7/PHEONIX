/**
 * Budget Period Form Page (RPT-02)
 * Create or edit a budget period.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import {
  useBudgetPeriod,
  useCreateBudgetPeriod,
  useUpdateBudgetPeriod,
} from '../../hooks/useBudgets';
import type { BudgetPeriodFormData } from '../../types/budgets';

const EMPTY_FORM: BudgetPeriodFormData = {
  name: '',
  start_date: '',
  end_date: '',
  notes: '',
};

const BudgetPeriodFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const periodId = id ? parseInt(id) : 0;

  const { data: existing } = useBudgetPeriod(periodId);
  const createMutation = useCreateBudgetPeriod();
  const updateMutation = useUpdateBudgetPeriod();

  const [form, setForm] = useState<BudgetPeriodFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof BudgetPeriodFormData, string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (existing) {
      setForm({
        name: existing.name,
        start_date: existing.start_date,
        end_date: existing.end_date,
        notes: existing.notes ?? '',
      });
    }
  }, [existing]);

  const validate = (): boolean => {
    const errs: Partial<Record<keyof BudgetPeriodFormData, string>> = {};
    if (!form.name.trim()) errs.name = 'Budget period name is required';
    if (!form.start_date) errs.start_date = 'Start date is required';
    if (!form.end_date) errs.end_date = 'End date is required';
    if (form.start_date && form.end_date && form.start_date >= form.end_date) {
      errs.end_date = 'End date must be after start date';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitError(null);
    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: periodId, data: form });
        navigate(`/budgets/periods/${periodId}`);
      } else {
        const created = await createMutation.mutateAsync(form);
        navigate(`/budgets/periods/${created.id}`);
      }
    } catch (err: unknown) {
      const e = err as {
        details?: { error?: string; non_field_errors?: string[] };
        message?: string;
      };
      setSubmitError(
        e?.details?.error ||
          e?.details?.non_field_errors?.join(' ') ||
          (err instanceof Error ? err.message : 'Save failed')
      );
    }
  };

  const isBusy = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          aria-label="Go back"
          onClick={() => navigate('/budgets/periods')}
          className="p-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isEdit ? 'Edit Budget Period' : 'New Budget Period'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Define the fiscal period name, date range, and optional notes.
          </p>
        </div>
      </div>

      {/* Form Card */}
      <div className="bg-white border rounded-lg p-6 space-y-5">
        {submitError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {submitError}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Period Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="e.g. FY 2025/2026 Annual Budget"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              aria-label="Start date"
              value={form.start_date}
              onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.start_date && <p className="mt-1 text-sm text-red-600">{errors.start_date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              aria-label="End date"
              value={form.end_date}
              onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.end_date && <p className="mt-1 text-sm text-red-600">{errors.end_date}</p>}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            rows={3}
            placeholder="Optional notes about this budget period…"
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          onClick={() => navigate('/budgets/periods')}
          className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={isBusy}
          className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {isBusy ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Budget Period'}
        </button>
      </div>
    </div>
  );
};

export default BudgetPeriodFormPage;
