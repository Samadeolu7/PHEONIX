// src/pages/accounting/JournalVoucherFormPage.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Save, AlertCircle, CheckCircle, Search } from 'lucide-react';
import {
  journalVoucherService,
  TransactionSeries,
  CreateJournalVoucherEntry,
} from '../../services/journalVoucherService';
import { accountService } from '../../services/accountService';
import { Account } from '../../types/accounts';
import { useToast } from '../../hooks/useToast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EntryRow {
  rowId: string;
  account: Account | null;
  accountSearch: string;
  accountResults: Account[];
  showDropdown: boolean;
  side: 'DR' | 'CR';
  amount: string;
}

const emptyRow = (rowId: string): EntryRow => ({
  rowId,
  account: null,
  accountSearch: '',
  accountResults: [],
  showDropdown: false,
  side: 'DR',
  amount: '',
});

// ─── Component ────────────────────────────────────────────────────────────────

const JournalVoucherFormPage: React.FC = () => {
  const navigate = useNavigate();
  const { success, error: showError } = useToast();

  const [seriesList, setSeriesList] = useState<TransactionSeries[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    series: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    workflow_reference: '',
  });

  const [entries, setEntries] = useState<EntryRow[]>([emptyRow('row-0'), emptyRow('row-1')]);

  // Load transaction series on mount
  useEffect(() => {
    journalVoucherService.getTransactionSeries().then(s => {
      setSeriesList(s);
      // Default to 'JV' series if it exists
      const jv = s.find(x => x.code === 'JV');
      if (jv) setFormData(f => ({ ...f, series: String(jv.id) }));
      else if (s.length > 0) setFormData(f => ({ ...f, series: String(s[0].id) }));
    });
  }, []);

  // ─── Entries helpers ────────────────────────────────────────────────────────

  const addRow = () => {
    setEntries(rows => [...rows, emptyRow(`row-${Date.now()}`)]);
  };

  const removeRow = (rowId: string) => {
    setEntries(rows => rows.filter(r => r.rowId !== rowId));
  };

  const updateRow = (rowId: string, changes: Partial<EntryRow>) => {
    setEntries(rows => rows.map(r => (r.rowId === rowId ? { ...r, ...changes } : r)));
  };

  const searchAccounts = async (rowId: string, q: string) => {
    updateRow(rowId, { accountSearch: q, account: null });
    if (q.length < 2) {
      updateRow(rowId, { accountResults: [], showDropdown: false });
      return;
    }
    const results = await accountService.getAccounts({ search: q, is_active: true });
    updateRow(rowId, { accountResults: results.slice(0, 8), showDropdown: true });
  };

  const selectAccount = (rowId: string, account: Account) => {
    updateRow(rowId, {
      account,
      accountSearch: `${account.code} – ${account.name}`,
      showDropdown: false,
      accountResults: [],
    });
  };

  // ─── Totals ─────────────────────────────────────────────────────────────────

  const totalDebits = entries.reduce((sum, r) => {
    if (r.side === 'DR' && r.amount) sum += parseFloat(r.amount) || 0;
    return sum;
  }, 0);

  const totalCredits = entries.reduce((sum, r) => {
    if (r.side === 'CR' && r.amount) sum += parseFloat(r.amount) || 0;
    return sum;
  }, 0);

  const difference = Math.abs(totalDebits - totalCredits);
  const isBalanced = difference < 0.005;

  // ─── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.series) {
      showError('Please select a transaction series');
      return;
    }

    const validEntries = entries.filter(r => r.account && r.amount);
    if (validEntries.length < 2) {
      showError('At least 2 entries (debit and credit) are required');
      return;
    }
    if (!isBalanced) {
      showError(`Entries must balance. Current difference: ${difference.toFixed(2)}`);
      return;
    }

    const payload: CreateJournalVoucherEntry[] = validEntries.map(r => ({
      account_id: r.account!.id as unknown as number,
      side: r.side,
      amount: (parseFloat(r.amount) || 0).toFixed(2),
    }));

    try {
      setSubmitting(true);
      const jv = await journalVoucherService.createJournalVoucher({
        series: parseInt(formData.series, 10),
        date: formData.date,
        description: formData.description.trim(),
        workflow_reference: formData.workflow_reference.trim() || undefined,
        entries: payload,
      });
      success(`Journal Voucher ${jv.reference_number} created successfully`);
      navigate(`/accounting/journal-vouchers/${jv.id}`);
    } catch (err) {
      console.error(err);
      showError('Failed to create journal voucher');
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/accounting/journal-vouchers')}
              className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-xl font-bold text-gray-900">New Journal Voucher</h1>
              <p className="text-xs text-gray-500">Create a manual GL journal entry</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isBalanced && entries.filter(r => r.account && r.amount).length >= 2 && (
              <span className="flex items-center gap-1 text-green-600 text-sm">
                <CheckCircle size={15} /> Balanced
              </span>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="max-w-4xl mx-auto px-6 py-6 space-y-6">
        {/* Header fields */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
            Voucher Details
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Series */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction Series <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={formData.series}
                onChange={e => setFormData(f => ({ ...f, series: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select series…</option>
                {seriesList.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.code} – {s.description}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Voucher Date <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="date"
                value={formData.date}
                onChange={e => setFormData(f => ({ ...f, date: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Description */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description / Narration <span className="text-red-500">*</span>
              </label>
              <input
                required
                type="text"
                placeholder="e.g. Accrual of electricity expense for March 2026"
                value={formData.description}
                onChange={e => setFormData(f => ({ ...f, description: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Workflow reference */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference / Source Doc <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV-0001, PO-00042"
                value={formData.workflow_reference}
                onChange={e => setFormData(f => ({ ...f, workflow_reference: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Journal Entry Lines */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Journal Entry Lines
            </h2>
            <button
              type="button"
              onClick={addRow}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs hover:bg-blue-100 transition-colors font-medium"
            >
              <Plus size={13} /> Add Line
            </button>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-medium text-gray-500 uppercase">
            <div className="col-span-5">Account</div>
            <div className="col-span-2 text-center">Dr / Cr</div>
            <div className="col-span-3 text-right">Amount</div>
            <div className="col-span-2" />
          </div>

          {/* Entry rows */}
          <div className="divide-y divide-gray-50">
            {entries.map((row, idx) => (
              <div key={row.rowId} className="grid grid-cols-12 gap-2 px-4 py-2 items-start">
                {/* Account search */}
                <div className="col-span-5 relative">
                  <div className="relative">
                    <Search
                      size={13}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="text"
                      placeholder="Search account…"
                      value={row.accountSearch}
                      onChange={e => searchAccounts(row.rowId, e.target.value)}
                      onBlur={() =>
                        setTimeout(() => updateRow(row.rowId, { showDropdown: false }), 200)
                      }
                      className="w-full pl-7 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  {row.showDropdown && row.accountResults.length > 0 && (
                    <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {row.accountResults.map(acc => (
                        <button
                          key={acc.id}
                          type="button"
                          onMouseDown={() => selectAccount(row.rowId, acc)}
                          className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                        >
                          <span className="font-mono text-gray-500">{acc.code}</span>
                          <span className="text-gray-700">{acc.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {row.account && (
                    <span className="block text-xs text-green-600 mt-0.5 pl-1">
                      ✓ {row.account.code} – {row.account.name}
                    </span>
                  )}
                </div>

                {/* Dr / Cr */}
                <div className="col-span-2 flex justify-center gap-1 pt-0.5">
                  {(['DR', 'CR'] as const).map(side => (
                    <button
                      key={side}
                      type="button"
                      onClick={() => updateRow(row.rowId, { side })}
                      className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${
                        row.side === side
                          ? side === 'DR'
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-green-600 text-white border-green-600'
                          : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {side}
                    </button>
                  ))}
                </div>

                {/* Amount */}
                <div className="col-span-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={row.amount}
                    onChange={e => updateRow(row.rowId, { amount: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Remove */}
                <div className="col-span-2 flex justify-end pt-0.5">
                  {entries.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeRow(row.rowId)}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={`Remove line ${idx + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Totals footer */}
          <div className="border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="grid grid-cols-12 gap-2">
              <div className="col-span-5 text-xs font-semibold text-gray-600 uppercase tracking-wide">
                Totals
              </div>
              <div className="col-span-2" />
              <div className="col-span-3 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-blue-600 font-medium">Total DR:</span>
                  <span className="font-mono font-semibold">
                    {totalDebits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-600 font-medium">Total CR:</span>
                  <span className="font-mono font-semibold">
                    {totalCredits.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                {!isBalanced && (totalDebits > 0 || totalCredits > 0) && (
                  <div className="flex justify-between text-xs text-red-600 font-semibold pt-1 border-t border-red-200">
                    <span>Difference:</span>
                    <span className="font-mono">
                      {difference.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {isBalanced && (totalDebits > 0 || totalCredits > 0) && (
                  <div className="flex justify-between text-xs text-green-600 font-semibold pt-1 border-t border-green-200">
                    <span>✓ Balanced</span>
                  </div>
                )}
              </div>
              <div className="col-span-2" />
            </div>
          </div>
        </div>

        {/* Validation warning */}
        {!isBalanced && (totalDebits > 0 || totalCredits > 0) && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              Journal entries must balance (DR = CR). Current difference:{' '}
              <strong>{difference.toFixed(2)}</strong>
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="flex justify-end gap-3 pb-8">
          <button
            type="button"
            onClick={() => navigate('/accounting/journal-vouchers')}
            className="px-5 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting || !isBalanced || entries.filter(r => r.account && r.amount).length < 2
            }
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={16} />
            {submitting ? 'Saving…' : 'Save Journal Voucher'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default JournalVoucherFormPage;
