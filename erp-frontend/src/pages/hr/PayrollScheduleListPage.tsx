// src/pages/hr/PayrollScheduleListPage.tsx
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Plus, Edit2, Trash2, Clock, AlertTriangle } from 'lucide-react';
import { hrService } from '../../services/hrService';
import { PayrollSchedule } from '../../types/hr';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FREQ_LABEL: Record<string, string> = { MONTHLY: 'Monthly', WEEKLY: 'Weekly' };

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function scheduleDescription(s: PayrollSchedule): string {
  if (s.frequency === 'MONTHLY' && s.day_of_month) {
    return `Runs on the ${s.day_of_month}${ordinal(s.day_of_month)} of every month`;
  }
  if (s.frequency === 'WEEKLY' && s.day_of_week != null) {
    return `Runs every ${DAY_NAMES[s.day_of_week] ?? 'Unknown'}`;
  }
  return FREQ_LABEL[s.frequency] ?? s.frequency;
}

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const PayrollScheduleListPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<PayrollSchedule | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['payroll-schedules'],
    queryFn: () => hrService.getPayrollSchedules({ page: 1 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => hrService.deletePayrollSchedule(id),
  });

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      qc.invalidateQueries({ queryKey: ['payroll-schedules'] });
      setDeleteTarget(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } }; message?: string };
      setDeleteError(
        e?.response?.data?.detail ?? (err instanceof Error ? err.message : 'Delete failed')
      );
    }
  };

  const schedules = data?.results ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="text-blue-600" size={22} />
              Payroll Schedules
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Define when payroll runs (monthly or weekly cadence)
            </p>
          </div>
          <Link
            to="/hr/payroll-schedules/new"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus size={16} />
            New Schedule
          </Link>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">
        {isLoading && (
          <div className="text-center py-12 text-gray-400">
            <Clock size={32} className="mx-auto mb-3 opacity-40 animate-spin" />
            <p className="text-sm">Loading schedules…</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertTriangle size={16} className="flex-shrink-0" />
            Failed to load payroll schedules.
          </div>
        )}

        {!isLoading && !error && schedules.length === 0 && (
          <div className="text-center py-14 bg-white rounded-lg border border-gray-200">
            <Calendar size={40} className="mx-auto mb-3 text-gray-300" />
            <h3 className="text-sm font-medium text-gray-900 mb-1">No schedules yet</h3>
            <p className="text-sm text-gray-500 mb-4">
              Create a payroll schedule to define when payroll runs.
            </p>
            <Link
              to="/hr/payroll-schedules/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              <Plus size={14} />
              Create first schedule
            </Link>
          </div>
        )}

        {schedules.length > 0 && (
          <div className="grid gap-4">
            {schedules.map(schedule => (
              <div
                key={schedule.id}
                className="bg-white rounded-lg border border-gray-200 p-5 flex items-start justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                        schedule.frequency === 'MONTHLY'
                          ? 'bg-blue-50 text-blue-700'
                          : 'bg-purple-50 text-purple-700'
                      }`}
                    >
                      {FREQ_LABEL[schedule.frequency] ?? schedule.frequency}
                    </span>
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {schedule.name}
                    </h3>
                  </div>
                  <p className="text-sm text-gray-500">{scheduleDescription(schedule)}</p>
                  {schedule.next_run && (
                    <p className="text-xs text-gray-400 mt-1">
                      Next run:{' '}
                      {new Date(schedule.next_run).toLocaleString('en-GB', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    title="Edit schedule"
                    onClick={() => navigate(`/hr/payroll-schedules/${schedule.id}/edit`)}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    title="Delete schedule"
                    onClick={() => setDeleteTarget(schedule)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-red-100 rounded-full">
                <Trash2 size={18} className="text-red-600" />
              </div>
              <h2 className="text-base font-semibold text-gray-900">Delete Schedule</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
            </p>
            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PayrollScheduleListPage;
