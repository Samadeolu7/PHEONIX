// src/pages/incomes/AcademicSessionPage.tsx
/**
 * Academic Session (Year) Management Page
 *
 * Lets administrators:
 * - View all academic years
 * - Create a new academic year
 * - Activate a year (make it the current session)
 * - Close a session (triggers year-end accounting: retained earnings + opening balances)
 * - Add / edit terms within a year
 */
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GraduationCap,
  Plus,
  CheckCircle,
  XCircle,
  Lock,
  Unlock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  Calendar,
  Info,
} from 'lucide-react';
import {
  academicSessionService,
  AcademicYear,
  CreateAcademicYearPayload,
  buildAcademicYearDefaults,
  getCurrentAcademicYearName,
} from '../../services/academicSessionService';

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-NG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function YearStatusBadge({ year }: { year: AcademicYear }) {
  if (year.is_active) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        <CheckCircle className="h-3 w-3" /> Active
      </span>
    );
  }
  if (year.is_closed) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
        <Lock className="h-3 w-3" /> Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
      <XCircle className="h-3 w-3" /> Inactive
    </span>
  );
}

// ── Create Year Form ─────────────────────────────────────────────────────────

interface CreateYearFormProps {
  onSave: (payload: CreateAcademicYearPayload) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function CreateYearForm({ onSave, onCancel, isSaving }: CreateYearFormProps) {
  const today = new Date();
  const defaultYear = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
  const defaults = buildAcademicYearDefaults(defaultYear);

  const [form, setForm] = useState<CreateAcademicYearPayload>({
    name: defaults.name,
    code: defaults.code,
    start_date: `${defaultYear}-09-01`,
    end_date: `${defaultYear + 1}-07-31`,
    term_system: 'trimester',
    is_active: false,
  });

  const set = (k: keyof CreateAcademicYearPayload, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white border border-blue-200 rounded-lg p-6 mb-6 shadow-sm"
    >
      <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-600" />
        New Academic Year
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Year Name *</label>
          <input
            required
            value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="e.g. 2025-2026"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Code *</label>
          <input
            required
            value={form.code}
            onChange={e => set('code', e.target.value)}
            placeholder="e.g. AY2025-2026"
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
          <input
            required
            type="date"
            value={form.start_date}
            onChange={e => set('start_date', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">End Date *</label>
          <input
            required
            type="date"
            value={form.end_date}
            onChange={e => set('end_date', e.target.value)}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Term System *</label>
          <select
            value={form.term_system}
            onChange={e =>
              set('term_system', e.target.value as 'trimester' | 'semester' | 'quarter')
            }
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          >
            <option value="trimester">Trimester (3 terms)</option>
            <option value="semester">Semester (2 terms)</option>
            <option value="quarter">Quarter (4 terms)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="is_active_new"
            checked={!!form.is_active}
            onChange={e => set('is_active', e.target.checked)}
            className="h-4 w-4 text-blue-600 border-gray-300 rounded"
          />
          <label htmlFor="is_active_new" className="text-sm text-gray-700">
            Activate immediately
          </label>
        </div>
      </div>

      <div className="flex gap-3 mt-5">
        <button
          type="submit"
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {isSaving ? 'Creating…' : 'Create Academic Year'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── Close Session Confirmation ────────────────────────────────────────────────

interface CloseConfirmProps {
  year: AcademicYear;
  onConfirm: () => void;
  onCancel: () => void;
  isClosing: boolean;
}

function CloseSessionConfirm({ year, onConfirm, onCancel, isClosing }: CloseConfirmProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Close Academic Session</h3>
            <p className="text-sm text-gray-600 mt-1">
              You are about to close <strong>{year.name}</strong>. This will:
            </p>
          </div>
        </div>

        <ul className="text-sm text-gray-700 space-y-2 mb-5 pl-3">
          <li className="flex items-start gap-2">
            <span className="text-red-500 font-bold">•</span>
            Deactivate this academic year — a new year must be activated to continue operations.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-amber-500 font-bold">•</span>
            Run year-end accounting closure: net income / loss will be transferred to{' '}
            <strong>Retained Earnings</strong>.
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">•</span>
            Create opening balance entries for the next fiscal year.
          </li>
        </ul>

        <div className="bg-amber-50 border border-amber-200 rounded-md px-3 py-2 text-xs text-amber-800 mb-5 flex items-start gap-2">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          This action cannot be undone. Make sure all transactions for this session are posted and
          approved before proceeding.
        </div>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isClosing}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {isClosing ? 'Closing…' : 'Confirm Close Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Academic Year Card ────────────────────────────────────────────────────────

interface YearCardProps {
  year: AcademicYear;
  onActivate: (id: number) => void;
  onCloseSession: (year: AcademicYear) => void;
  isActivating: boolean;
}

function YearCard({ year, onActivate, onCloseSession, isActivating }: YearCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-white border rounded-lg shadow-sm overflow-hidden ${year.is_active ? 'border-green-300 ring-1 ring-green-200' : 'border-gray-200'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-gray-500 hover:text-gray-800 transition-colors"
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <GraduationCap
            className={`h-5 w-5 ${year.is_active ? 'text-green-600' : 'text-gray-400'}`}
          />

          <div>
            <p className="font-semibold text-gray-900">{year.name}</p>
            <p className="text-xs text-gray-500">
              {fmt(year.start_date)} → {fmt(year.end_date)} &nbsp;|&nbsp;
              {year.term_system} &nbsp;|&nbsp; Code: {year.code}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <YearStatusBadge year={year} />

          {!year.is_active && !year.is_closed && (
            <button
              onClick={() => onActivate(year.id)}
              disabled={isActivating}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <Unlock className="h-3 w-3" />
              Activate
            </button>
          )}

          {year.is_active && (
            <button
              onClick={() => onCloseSession(year)}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
            >
              <Lock className="h-3 w-3" />
              Close Session
            </button>
          )}
        </div>
      </div>

      {/* Expanded terms */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3">
          <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">
            Terms ({year.terms.length})
          </p>
          {year.terms.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No terms defined for this year.</p>
          ) : (
            <div className="space-y-1">
              {year.terms.map(term => (
                <div
                  key={term.id}
                  className="flex items-center justify-between bg-white border border-gray-200 rounded px-3 py-2"
                >
                  <div>
                    <span className="text-sm font-medium text-gray-900">{term.name}</span>
                    <span className="ml-2 text-xs text-gray-500">({term.code})</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmt(term.start_date)} — {fmt(term.end_date)}
                    </span>
                    {term.is_active && (
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                        Current
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const AcademicSessionPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [closeTarget, setCloseTarget] = useState<AcademicYear | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  const notify = (text: string, ok: boolean) => {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 6000);
  };

  // ── queries & mutations ────────────────────────────────────────────────────

  const {
    data: years = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => academicSessionService.list(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAcademicYearPayload) => academicSessionService.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setShowCreateForm(false);
      notify('Academic year created successfully.', true);
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to create academic year.', false),
  });

  const activateMutation = useMutation({
    mutationFn: (id: number) => academicSessionService.activate(id),
    onSuccess: year => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      notify(`"${year.name}" is now the active academic session.`, true);
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to activate year.', false),
  });

  const closeMutation = useMutation({
    mutationFn: (id: number) => academicSessionService.closeSession(id),
    onSuccess: result => {
      queryClient.invalidateQueries({ queryKey: ['academic-years'] });
      setCloseTarget(null);
      if (result.accounting_closure.error) {
        notify(
          `Session closed, but accounting closure had an issue: ${result.accounting_closure.error}`,
          false
        );
      } else {
        notify(`"${result.academic_year.name}" closed. Retained earnings updated.`, true);
      }
    },
    onError: (err: unknown) =>
      notify((err as { message?: string })?.message ?? 'Failed to close session.', false),
  });

  const currentExpectedYear = getCurrentAcademicYearName();
  const activeYear = years.find(y => y.is_active);
  const isWrongYear = activeYear && activeYear.name !== currentExpectedYear;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="h-7 w-7 text-blue-600" />
          Academic Session Management
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage academic years (sessions) and their terms. Closing a session triggers year-end
          accounting: income/expense accounts are cleared and net profit/loss is posted to{' '}
          <em>Retained Earnings</em>.
        </p>
      </div>

      {/* Wrong-year warning */}
      {isWrongYear && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg p-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-semibold">Incorrect active academic year detected</p>
            <p>
              The active session is <strong>{activeYear?.name}</strong>, but based on today's date
              the expected session is <strong>{currentExpectedYear}</strong>. Please activate the
              correct year or create it if it doesn't exist yet.
            </p>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div
          className={`mb-4 rounded-md px-4 py-3 text-sm font-medium ${
            toast.ok
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm text-gray-600">
          {activeYear ? (
            <span>
              Current session: <strong className="text-green-700">{activeYear.name}</strong>
            </span>
          ) : (
            <span className="text-red-600 font-medium">No active academic year</span>
          )}
        </div>
        <button
          onClick={() => setShowCreateForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New Academic Year
        </button>
      </div>

      {/* Create form */}
      {showCreateForm && (
        <CreateYearForm
          onSave={payload => createMutation.mutate(payload)}
          onCancel={() => setShowCreateForm(false)}
          isSaving={createMutation.isPending}
        />
      )}

      {/* List */}
      {isLoading && <div className="text-center py-12 text-gray-500">Loading academic years…</div>}
      {isError && (
        <div className="text-center py-12 text-red-500">
          Failed to load academic years. Please refresh.
        </div>
      )}

      {!isLoading && !isError && years.length === 0 && (
        <div className="text-center py-12 text-gray-500 border border-dashed border-gray-300 rounded-lg">
          <GraduationCap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="font-medium">No academic years found</p>
          <p className="text-sm mt-1">Create the first academic year to get started.</p>
        </div>
      )}

      <div className="space-y-3">
        {years.map(year => (
          <YearCard
            key={year.id}
            year={year}
            onActivate={id => activateMutation.mutate(id)}
            onCloseSession={setCloseTarget}
            isActivating={activateMutation.isPending}
          />
        ))}
      </div>

      {/* Close confirmation modal */}
      {closeTarget && (
        <CloseSessionConfirm
          year={closeTarget}
          onConfirm={() => closeMutation.mutate(closeTarget.id)}
          onCancel={() => setCloseTarget(null)}
          isClosing={closeMutation.isPending}
        />
      )}
    </div>
  );
};

export default AcademicSessionPage;
