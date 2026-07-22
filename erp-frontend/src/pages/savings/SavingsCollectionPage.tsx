/**
 * Savings Collection Page
 *
 * Daily savings collection sheet. Shows all clients with contributions
 * expected on the selected date. Staff tick each one as paid.
 *
 * Feature #1 — Savings Cycles (daily / weekly / monthly)
 */

import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle,
  Clock,
  DollarSign,
  Loader2,
  RefreshCw,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import {
  useSavingsCollections,
  useMarkContributionPaid,
  useGenerateScheduleForMonth,
} from '../../hooks/useSavings';
import type {
  ContributionScheduleItem,
  ContributionCycle,
  ContributionStatus,
} from '../../services/savingsService';
import { accountService } from '../../services/accountService';

// ── Types ──────────────────────────────────────────────────────────────────

interface CashierAccount {
  id: number;
  name: string;
  code: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(amount: string | number | null | undefined): string {
  const n = parseFloat(String(amount ?? '0'));
  return isNaN(n)
    ? '0.00'
    : n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toISO(d: Date): string {
  return d.toISOString().split('T')[0];
}

const CYCLE_BADGE: Record<ContributionCycle, string> = {
  daily:   'bg-blue-100 text-blue-700',
  weekly:  'bg-purple-100 text-purple-700',
  monthly: 'bg-teal-100 text-teal-700',
};

const STATUS_BADGE: Record<ContributionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  paid:    'bg-green-100 text-green-700',
  missed:  'bg-red-100 text-red-700',
};

// ── Mark-Paid Modal ────────────────────────────────────────────────────────

interface MarkPaidModalProps {
  item: ContributionScheduleItem;
  cashierAccounts: CashierAccount[];
  onClose: () => void;
  onConfirm: (itemId: number, cashierAccountId: number) => Promise<void>;
}

function MarkPaidModal({ item, cashierAccounts, onClose, onConfirm }: MarkPaidModalProps) {
  const [cashierAccountId, setCashierAccountId] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!cashierAccountId) {
      setError('Please select a cashier account.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm(item.id, cashierAccountId as number);
      onClose();
    } catch (e: any) {
      setError(e?.detail ?? e?.message ?? 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Record Contribution</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-4">
          <div className="rounded-lg bg-gray-50 p-4 text-sm">
            <p className="font-medium text-gray-900">{item.client_name}</p>
            <p className="text-gray-500">{item.account_number} · {item.product_name}</p>
            <p className="mt-1 text-gray-700">
              Amount:{' '}
              <span className="font-semibold text-gray-900">₦{fmt(item.expected_amount)}</span>
            </p>
            <p className="text-gray-500">Date: {item.expected_date}</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Cashier / Cash Account <span className="text-red-500">*</span>
            </label>
            {cashierAccounts.length === 0 ? (
              <p className="text-xs text-gray-400">
                No cashier accounts loaded. Contact your administrator.
              </p>
            ) : (
              <select
                value={cashierAccountId}
                onChange={(e) =>
                  setCashierAccountId(e.target.value ? parseInt(e.target.value) : '')
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Select account…</option>
                {cashierAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} – {acc.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t px-6 py-4">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !cashierAccountId}
            className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function SavingsCollectionPage() {
  const { selectedRole } = useAuth();
  const [selectedDate, setSelectedDate] = useState<string>(toISO(new Date()));
  const [cycleFilter, setCycleFilter] = useState<ContributionCycle | ''>('');
  const [statusFilter, setStatusFilter] = useState<ContributionStatus | ''>('');
  const [generateMsg, setGenerateMsg] = useState<string | null>(null);

  const [cashierAccounts, setCashierAccounts] = useState<CashierAccount[]>([]);
  const [markPaidItem, setMarkPaidItem] = useState<ContributionScheduleItem | null>(null);

  const collectionParams: any = { date: selectedDate };
  if (cycleFilter) collectionParams.cycle = cycleFilter;
  if (statusFilter) collectionParams.status = statusFilter;

  const { data: items = [], isLoading: loading, error: queryError, refetch } = useSavingsCollections(collectionParams);

  const markPaidMutation = useMarkContributionPaid({
    onSuccess: () => { refetch(); },
  });

  const generateMutation = useGenerateScheduleForMonth({
    onSuccess: (result) => {
      setGenerateMsg(
        result.created > 0
          ? `Generated ${result.created} schedule entries for ${result.year}-${String(result.month).padStart(2, '0')}.`
          : 'Schedule already up to date for this month.',
      );
      refetch();
    },
    onError: (e) => {
      setGenerateMsg(e?.detail ?? e?.message ?? 'Failed to generate schedule.');
    },
  });

  // Load ASSET accounts once (cashier tills)
  useEffect(() => {
    accountService
      .getAccounts({ account_type: 'ASSET' })
      .then((accounts) =>
        setCashierAccounts(
          accounts.map((a) => ({ id: Number(a.id), name: a.name, code: a.code })),
        ),
      )
      .catch(() => {/* non-fatal */});
  }, []);

  const handleMarkPaid = async (itemId: number, cashierAccountId: number) => {
    markPaidMutation.mutate({ scheduleId: itemId, cashierAccountId });
  };

  const handleGenerateSchedule = () => {
    setGenerateMsg(null);
    const d = new Date(selectedDate);
    generateMutation.mutate({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };

  const error = (queryError as any)?.detail ?? (queryError as any)?.message ?? null;

  // Summary stats
  const totalExpected = items.reduce((s, i) => s + parseFloat(i.expected_amount), 0);
  const totalPaid = items
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + parseFloat(i.expected_amount), 0);
  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const paidCount = items.filter((i) => i.status === 'paid').length;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Savings Collection</h1>
        <p className="mt-1 text-sm text-gray-500">
          Daily savings contribution sheet — tick each client's payment as received.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        {/* Date picker */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Cycle filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Cycle</label>
          <select
            value={cycleFilter}
            onChange={(e) => setCycleFilter(e.target.value as ContributionCycle | '')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All cycles</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        {/* Status filter */}
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContributionStatus | '')}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="missed">Missed</option>
          </select>
        </div>

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>

        {/* Generate schedule (supervisor+) */}
        {selectedRole !== 'credit_officer' && (
          <button
            onClick={handleGenerateSchedule}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {generateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Generate Month Schedule
          </button>
        )}
      </div>

      {/* Generate message */}
      {generateMsg && (
        <div className="mb-4 rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
          {generateMsg}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Expected</p>
          <p className="mt-1 text-xl font-bold text-gray-900">₦{fmt(totalExpected)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Collected</p>
          <p className="mt-1 text-xl font-bold text-green-600">₦{fmt(totalPaid)}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Pending</p>
          <p className="mt-1 text-xl font-bold text-yellow-600">{pendingCount}</p>
        </div>
        <div className="rounded-xl bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500">Paid</p>
          <p className="mt-1 text-xl font-bold text-green-600">{paidCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-gray-400" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center">
            <DollarSign size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-sm text-gray-500">No contributions scheduled for this date.</p>
            {selectedRole !== 'credit_officer' && (
              <p className="mt-1 text-xs text-gray-400">
                Click "Generate Month Schedule" to create schedules for the selected month.
              </p>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Account</th>
                <th className="px-4 py-3">Cycle</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Paid On</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{item.client_name}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{item.account_number}</td>
                  <td className="px-4 py-3">
                    {item.contribution_cycle ? (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CYCLE_BADGE[item.contribution_cycle]}`}
                      >
                        {item.contribution_cycle}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-gray-900">
                    ₦{fmt(item.expected_amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[item.status]}`}
                    >
                      {item.status === 'paid' && <CheckCircle size={10} />}
                      {item.status === 'pending' && <Clock size={10} />}
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{item.paid_on ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {item.status === 'pending' && (
                      <button
                        onClick={() => setMarkPaidItem(item)}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                      >
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mark Paid Modal */}
      {markPaidItem && (
        <MarkPaidModal
          item={markPaidItem}
          cashierAccounts={cashierAccounts}
          onClose={() => setMarkPaidItem(null)}
          onConfirm={handleMarkPaid}
        />
      )}
    </div>
  );
}
