// src/pages/hr/PayrollScheduleFormPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Calendar, ArrowLeft, AlertTriangle } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { PayrollFrequency, CreatePayrollScheduleData } from '../../types/hr';

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ─── Component ────────────────────────────────────────────────────────────────

const PayrollScheduleFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isEditing = Boolean(id);

  const [name, setName] = useState('');
  const [frequency, setFrequency] = useState<PayrollFrequency>('MONTHLY');
  const [dayOfMonth, setDayOfMonth] = useState<number>(28);
  const [dayOfWeek, setDayOfWeek] = useState<number>(4); // Friday default
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(isEditing);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load existing schedule when editing
  useEffect(() => {
    if (!id) return;
    setLoadingData(true);
    hrService
      .getPayrollSchedule(Number(id))
      .then(s => {
        setName(s.name);
        setFrequency(s.frequency);
        if (s.day_of_month != null) setDayOfMonth(s.day_of_month);
        if (s.day_of_week != null) setDayOfWeek(s.day_of_week);
      })
      .catch(() => {
        setSubmitError('Failed to load schedule data');
      })
      .finally(() => setLoadingData(false));
  }, [id]);

  // ─── Validation ──────────────────────────────────────────────────────────────

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) {
      errs.name = 'Schedule name is required';
    }
    if (frequency === 'MONTHLY' && (dayOfMonth < 1 || dayOfMonth > 28)) {
      errs.day_of_month = 'Day must be between 1 and 28';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    const payload: CreatePayrollScheduleData = {
      name: name.trim(),
      frequency,
      day_of_month: frequency === 'MONTHLY' ? dayOfMonth : null,
      day_of_week: frequency === 'WEEKLY' ? dayOfWeek : null,
    };

    setLoading(true);
    try {
      if (isEditing && id) {
        await hrService.updatePayrollSchedule(Number(id), payload);
      } else {
        await hrService.createPayrollSchedule(payload);
      }
      qc.invalidateQueries({ queryKey: ['payroll-schedules'] });
      navigate('/hr/payroll-schedules');
    } catch (err: unknown) {
      const e2 = err as {
        response?: { data?: { detail?: string; name?: string[] } };
        message?: string;
      };
      const detail =
        e2?.response?.data?.detail ??
        e2?.response?.data?.name?.[0] ??
        (err instanceof Error ? err.message : 'Save failed');
      setSubmitError(detail);
    } finally {
      setLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  if (loadingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              title="Go back"
              onClick={() => navigate('/hr/payroll-schedules')}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Calendar className="text-blue-600" size={20} />
                {isEditing ? 'Edit Payroll Schedule' : 'New Payroll Schedule'}
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                {isEditing ? 'Update schedule settings' : 'Define a recurring payroll run cadence'}
              </p>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-6 py-6 space-y-5">
        {/* Error banner */}
        {submitError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {submitError}
          </div>
        )}

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-5">
          {/* Schedule Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Schedule Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              title="Schedule name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Monthly Staff Payroll"
              className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-200'
              }`}
            />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>

          {/* Frequency */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Frequency</label>
            <div className="flex gap-3">
              {(['MONTHLY', 'WEEKLY'] as PayrollFrequency[]).map(f => (
                <label
                  key={f}
                  className={`flex items-center gap-2 px-4 py-2 border rounded-lg cursor-pointer text-sm transition-colors ${
                    frequency === f
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    title={f === 'MONTHLY' ? 'Monthly' : 'Weekly'}
                    name="frequency"
                    value={f}
                    checked={frequency === f}
                    onChange={() => setFrequency(f)}
                    className="sr-only"
                  />
                  {f === 'MONTHLY' ? 'Monthly' : 'Weekly'}
                </label>
              ))}
            </div>
          </div>

          {/* Day of Month (monthly only) */}
          {frequency === 'MONTHLY' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Day of Month <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                title="Day of month (1-28)"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={e => setDayOfMonth(Number(e.target.value))}
                className={`w-32 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.day_of_month ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              <p className="text-xs text-gray-400 mt-1">Between 1 and 28 (safe for all months)</p>
              {errors.day_of_month && (
                <p className="text-xs text-red-600 mt-1">{errors.day_of_month}</p>
              )}
            </div>
          )}

          {/* Day of Week (weekly only) */}
          {frequency === 'WEEKLY' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Day of Week</label>
              <div className="flex flex-wrap gap-2">
                {DAY_NAMES.map((day, idx) => (
                  <label
                    key={day}
                    className={`px-3 py-1.5 border rounded-lg cursor-pointer text-sm transition-colors ${
                      dayOfWeek === idx
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      title={day}
                      name="day_of_week"
                      value={idx}
                      checked={dayOfWeek === idx}
                      onChange={() => setDayOfWeek(idx)}
                      className="sr-only"
                    />
                    {day}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/hr/payroll-schedules')}
            className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Schedule'}
          </button>
        </div>
      </div>
    </form>
  );
};

export default PayrollScheduleFormPage;
