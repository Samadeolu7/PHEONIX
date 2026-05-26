/**
 * BulkStaffDebitPage
 *
 * Creates multiple Staff IOUs in one operation and posts a single balanced GL entry:
 *
 *   Dr  Staff IOU Receivable  [staff A amount]
 *   Dr  Staff IOU Receivable  [staff B amount]
 *   …
 *   Cr  [selected account — e.g. Asset Disposal, Cash, etc.]  [total]
 *
 * Use-case: cost displacement — e.g. an asset disposal loss shared across staff.
 */

import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Search,
  X,
  AlertCircle,
  Save,
  ArrowRightLeft,
  User,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useToast } from '../../hooks/useToast';
import { useBulkDebitStaffIOU } from '../../hooks/useStaffIOU';
import { accountService } from '../../services/accountService';
import { staffService } from '../../services/staffService';
import { Account } from '../../types/accounts';
import { Staff } from '../../types/hr';
import { Breadcrumb } from '../../components/ui/Breadcrumb';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EntryRow {
  rowId: number;
  staffId: number | null;           // pk
  staffSearch: string;
  staffResults: Staff[];
  showStaffDrop: boolean;
  amount: string;
  monthly_installment: string;
  start_month: string;
  reason: string;
  notes: string;
}

let _rowCounter = 1;
const newRow = (): EntryRow => ({
  rowId: _rowCounter++,
  staffId: null,
  staffSearch: '',
  staffResults: [],
  showStaffDrop: false,
  amount: '',
  monthly_installment: '',
  start_month: '',
  reason: '',
  notes: '',
});

const fmt = (v: string | number) =>
  `₦${Number(v).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Component ─────────────────────────────────────────────────────────────────

const BulkStaffDebitPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();
  const bulkMutation = useBulkDebitStaffIOU();

  // Credit account state
  const [creditSearch, setCreditSearch] = useState('');
  const [creditResults, setCreditResults] = useState<Account[]>([]);
  const [showCreditDrop, setShowCreditDrop] = useState(false);
  const [creditAccount, setCreditAccount] = useState<Account | null>(null);
  const [creditSearching, setCreditSearching] = useState(false);
  const creditTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // JE meta
  const [jeDescription, setJeDescription] = useState('');
  const [jeDate, setJeDate] = useState(new Date().toISOString().slice(0, 10));

  // Rows
  const [rows, setRows] = useState<EntryRow[]>([newRow()]);
  const staffTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Staff list for dropdown (fetched once; search filtered client-side)
  const { data: allStaffData } = useQuery({
    queryKey: ['staff-for-bulk-iou'],
    queryFn: () => staffService.getAllStaff({ is_active: true }),
  });
  const allStaff: Staff[] = allStaffData ?? [];

  // ── Credit account search ────────────────────────────────────────────────

  const handleCreditSearch = (value: string) => {
    setCreditSearch(value);
    setCreditAccount(null);
    if (creditTimer.current) clearTimeout(creditTimer.current);
    if (value.length < 2) { setCreditResults([]); setShowCreditDrop(false); return; }
    setCreditSearching(true);
    creditTimer.current = setTimeout(async () => {
      try {
        const r = await accountService.getAccounts({ search: value, is_active: true });
        setCreditResults(Array.isArray(r) ? r : []);
        setShowCreditDrop(true);
      } catch { setCreditResults([]); }
      finally { setCreditSearching(false); }
    }, 300);
  };

  const selectCredit = (acc: Account) => {
    setCreditAccount(acc);
    setCreditSearch(`${acc.code} – ${acc.name}`);
    setShowCreditDrop(false);
  };

  const clearCredit = () => {
    setCreditAccount(null);
    setCreditSearch('');
    setCreditResults([]);
    setShowCreditDrop(false);
  };

  // ── Staff search per row (client-side filter from allStaff) ─────────────

  const handleStaffSearch = (rowId: number, value: string) => {
    setRows(prev => prev.map(r => r.rowId === rowId
      ? { ...r, staffSearch: value, staffId: null, showStaffDrop: false }
      : r
    ));
    if (staffTimers.current[rowId]) clearTimeout(staffTimers.current[rowId]);
    if (value.length < 1) {
      setRows(prev => prev.map(r => r.rowId === rowId
        ? { ...r, staffResults: [], showStaffDrop: false } : r));
      return;
    }
    staffTimers.current[rowId] = setTimeout(() => {
      const q = value.toLowerCase();
      const results = allStaff.filter(
        s => s.full_name.toLowerCase().includes(q) || s.staff_id.toLowerCase().includes(q)
      ).slice(0, 10);
      setRows(prev => prev.map(r => r.rowId === rowId
        ? { ...r, staffResults: results, showStaffDrop: results.length > 0 } : r));
    }, 200);
  };

  const selectStaff = (rowId: number, staff: Staff) => {
    setRows(prev => prev.map(r => r.rowId === rowId
      ? { ...r, staffId: staff.id, staffSearch: `${staff.full_name} (${staff.staff_id})`, showStaffDrop: false }
      : r
    ));
  };

  // ── Row field updates ────────────────────────────────────────────────────

  const updateRow = <K extends keyof EntryRow>(rowId: number, key: K, value: EntryRow[K]) =>
    setRows(prev => prev.map(r => r.rowId === rowId ? { ...r, [key]: value } : r));

  const addRow = () => setRows(prev => [...prev, newRow()]);

  const removeRow = (rowId: number) =>
    setRows(prev => prev.length > 1 ? prev.filter(r => r.rowId !== rowId) : prev);

  // ── Totals ───────────────────────────────────────────────────────────────

  const totalAmount = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);

  // ── Validation & submit ──────────────────────────────────────────────────

  const validate = (): string | null => {
    if (!creditAccount) return 'Select the credit / offset account.';
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const n = i + 1;
      if (!r.staffId) return `Row ${n}: select a staff member.`;
      const amount = parseFloat(r.amount);
      if (!amount || amount <= 0) return `Row ${n}: amount must be > 0.`;
      const inst = parseFloat(r.monthly_installment);
      if (!inst || inst <= 0) return `Row ${n}: monthly installment must be > 0.`;
      if (inst > amount) return `Row ${n}: monthly installment cannot exceed the amount.`;
      if (!r.start_month) return `Row ${n}: select a start month.`;
      if (!r.reason.trim() || r.reason.trim().length < 5)
        return `Row ${n}: reason must be at least 5 characters.`;
    }
    // Duplicate staff check
    const staffIds = rows.map(r => r.staffId);
    const unique = new Set(staffIds);
    if (unique.size !== staffIds.length) return 'A staff member appears more than once. Each staff can only have one entry per batch.';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { showError(err); return; }

    try {
      const result = await bulkMutation.mutateAsync({
        credit_account_id: Number(creditAccount!.id),
        description: jeDescription.trim() || undefined,
        date: jeDate,
        entries: rows.map(r => ({
          staff: r.staffId!,
          amount: parseFloat(r.amount),
          monthly_installment: parseFloat(r.monthly_installment),
          start_month: r.start_month.length === 7 ? `${r.start_month}-01` : r.start_month,
          reason: r.reason.trim(),
          notes: r.notes.trim(),
        })),
      });

      success(
        `${result.ious.length} IOU(s) created · GL posted · Total ${fmt(result.total_amount)}`
      );
      navigate('/hr/ious');
    } catch {
      showError('Failed to create bulk IOU. Please check all fields and try again.');
    }
  };

  const isBusy = bulkMutation.isPending;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <Breadcrumb
        items={[
          { label: 'HR & Payroll', href: '/hr' },
          { label: 'Staff IOU', href: '/hr/ious' },
          { label: 'Bulk Staff Debit', href: '/hr/ious/bulk-debit' },
        ]}
      />

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} title="Go back"
          className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bulk Staff Debit</h1>
          <p className="text-sm text-gray-500">
            Charge a cost across multiple staff members and post one balanced GL entry
          </p>
        </div>
      </div>

      {/* Accounting explanation */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
        <div className="flex items-start gap-2 text-sm text-indigo-800">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <div className="space-y-1">
            <div>
              <strong>GL entry posted immediately:</strong>
            </div>
            <div className="font-mono text-xs bg-indigo-100 rounded px-2 py-1.5 space-y-0.5">
              <div>Dr&nbsp;&nbsp;Staff IOU Receivable &nbsp;&nbsp;&nbsp;[each staff's amount]</div>
              <div>Cr&nbsp;&nbsp;[selected offset account]&nbsp;&nbsp;[total]</div>
            </div>
            <div className="text-xs text-indigo-700 mt-1">
              <strong>Then each payroll:</strong>&nbsp;
              Dr Payroll Clearance / Cr Staff IOU Receivable — until fully recovered
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── JE Header ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 text-indigo-500" />
            Journal Entry Details
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Credit / Offset account */}
            <div className="md:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Credit / Offset Account <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-1.5">
                e.g. Asset Disposal Loss, Cash, Expense Claim, Inter-company Payable
              </p>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={creditSearch}
                  onChange={e => handleCreditSearch(e.target.value)}
                  onFocus={() => creditResults.length > 0 && setShowCreditDrop(true)}
                  placeholder="Search by account name or code…"
                  className={`w-full border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    !creditAccount ? 'border-amber-300' : 'border-gray-300'
                  }`}
                />
                {creditAccount && (
                  <button type="button" title="Clear account" onClick={clearCredit}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
                {showCreditDrop && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                    {creditSearching && <div className="px-3 py-2 text-xs text-gray-400">Searching…</div>}
                    {!creditSearching && creditResults.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-400">No accounts found</div>
                    )}
                    {creditResults.map(acc => (
                      <button key={acc.id} type="button" onClick={() => selectCredit(acc)}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500 w-20 shrink-0">{acc.code}</span>
                        <span className="truncate">{acc.name}</span>
                        <span className="ml-auto text-xs text-gray-400 shrink-0">{acc.type}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {creditAccount && (
                <p className="mt-1 text-xs text-green-700 font-medium">
                  ✓ {creditAccount.code} – {creditAccount.name}
                </p>
              )}
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Journal Entry Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={jeDate}
                onChange={e => setJeDate(e.target.value)}
                title="Journal entry date"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              JE Description <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              type="text"
              value={jeDescription}
              onChange={e => setJeDescription(e.target.value)}
              placeholder="Defaults to: Bulk Staff IOU – [account] – N staff (total ₦…)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* ── Staff Rows ──────────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-500" />
              Staff Entries
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-sm hover:bg-indigo-100"
            >
              <Plus className="w-4 h-4" />
              Add Staff
            </button>
          </div>

          <div className="divide-y divide-gray-100">
            {rows.map((row, idx) => (
              <div key={row.rowId} className="px-6 py-5 space-y-4">
                {/* Row header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Staff #{idx + 1}
                  </span>
                  {rows.length > 1 && (
                    <button
                      type="button"
                      title="Remove row"
                      onClick={() => removeRow(row.rowId)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Staff search */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Staff Member <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={row.staffSearch}
                      onChange={e => handleStaffSearch(row.rowId, e.target.value)}
                      onFocus={() => row.staffResults.length > 0 && updateRow(row.rowId, 'showStaffDrop', true)}
                      placeholder="Search by name or staff ID…"
                      className={`w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        !row.staffId ? 'border-amber-300' : 'border-gray-300'
                      }`}
                    />
                    {row.showStaffDrop && row.staffResults.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                        {row.staffResults.map(s => (
                          <button key={s.id} type="button" onClick={() => selectStaff(row.rowId, s)}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 flex items-center gap-2">
                            <User className="w-4 h-4 text-gray-400 shrink-0" />
                            <span className="font-medium truncate">{s.full_name}</span>
                            <span className="text-xs text-gray-400 ml-auto shrink-0">{s.staff_id}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {row.staffId && (
                    <p className="mt-1 text-xs text-green-700 font-medium">✓ {row.staffSearch}</p>
                  )}
                </div>

                {/* Amount + Installment + Start Month */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Amount (₦) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={row.amount}
                      onChange={e => updateRow(row.rowId, 'amount', e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Monthly Installment (₦) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      value={row.monthly_installment}
                      onChange={e => updateRow(row.rowId, 'monthly_installment', e.target.value)}
                      placeholder="0.00"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Start Month <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="month"
                      value={row.start_month}
                      onChange={e => updateRow(row.rowId, 'start_month', e.target.value)}
                      title="Start month for deductions"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Reason + Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Reason <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={row.reason}
                      onChange={e => updateRow(row.rowId, 'reason', e.target.value)}
                      placeholder="e.g. Asset disposal cost recovery"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Notes <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={row.notes}
                      onChange={e => updateRow(row.rowId, 'notes', e.target.value)}
                      placeholder="Any additional notes…"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Row summary */}
                {row.staffId && row.amount && row.monthly_installment && (
                  <div className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-1.5">
                    {fmt(row.amount)} over{' '}
                    {Math.ceil(parseFloat(row.amount) / (parseFloat(row.monthly_installment) || 1))} months
                    {' '}(₦{row.monthly_installment}/mo)
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Totals bar + Submit ────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="space-y-1">
              <div className="text-sm text-gray-500">
                <span className="font-medium text-gray-900">{rows.length}</span> staff ·
                Total debit to Staff IOU Receivable:{' '}
                <span className="font-semibold text-gray-900">{fmt(totalAmount)}</span>
              </div>
              {creditAccount && (
                <div className="text-xs text-gray-400">
                  Cr {creditAccount.code} – {creditAccount.name} · {fmt(totalAmount)}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/hr/ious')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isBusy}
                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isBusy ? 'Posting…' : 'Create IOUs & Post GL'}
              </button>
            </div>
          </div>
        </div>

      </form>
    </div>
  );
};

export default BulkStaffDebitPage;
